/**
 * renvois-ldap.test.mjs — le détecteur de renvoi LDAP, constat **Q-83**.
 *
 * ── Le défaut, et pourquoi aucune doublure ne pouvait le montrer ─────────────
 *
 * `src/auth/client-ldap.ts` refusait **toute** réponse portant un
 * `SearchResultReference`, au motif — juste en soi — qu'une réponse amputée annoncée
 * comme un succès est pire qu'un refus. Or un Active Directory émet ces *continuation
 * references* sur **toute** recherche en sous-arbre depuis la racine du domaine, vers
 * les contextes de nommage qui ne portent aucun compte : `CN=Configuration,…`,
 * `DC=DomainDnsZones,…`, `DC=ForestDnsZones,…`. Mesuré le 03/09/2026 contre un
 * contrôleur Samba réel : l'entrée cherchée **était là** (« 1 entrée(s) reçue(s) »), et
 * **aucune connexion n'aboutissait**. Le produit était inutilisable contre l'annuaire
 * qu'il existe pour interroger.
 *
 * C'est le constat **Q-69** — « le détecteur est écrit, lu, et mordu par rien » — mordu
 * par le réel, et pris en défaut. **Et la première correction était fausse aussi** :
 * comparer les DN range `CN=Configuration,DC=exemple,DC=interne` *sous*
 * `DC=exemple,DC=interne`, donc « dans le périmètre », et le refus restait entier.
 *
 * ── Pourquoi ce fichier porte son PROPRE annuaire, et n'emprunte pas la doublure ──
 *
 * L'annuaire simulé de `test/annuaire/` ne peut pas montrer ce défaut : son RootDSE
 * n'annonce **qu'un seul** contexte de nommage — celui-là même qu'on interroge — et
 * `renvoiHorsPerimetre()` ne peut donc jamais rien écarter contre lui. Ce n'est pas un
 * manque de la doublure : c'est la démonstration de ce que le constat dit, à savoir
 * qu'*une doublure n'émet que ce que son auteur a prévu*.
 *
 * Le répondeur ci-dessous sert donc **la topologie d'un vrai AD** : cinq contextes de
 * nommage au RootDSE, et une recherche qui rend une entrée **plus** trois renvois vers
 * les contextes voisins. Il parle le protocole avec l'encodeur de `test/annuaire/ber.mjs`
 * — écrit par un autre agent, et confronté à un client LDAP tiers (`mod_authnz_ldap`
 * d'Apache) — et non avec celui de `src/`, sans quoi le client et sa cible pourraient se
 * tromper deux fois de la même façon.
 */

import assert from 'node:assert/strict';
import net from 'node:net';
import { before, describe, test } from 'node:test';

import { moduleCompile } from '../aide/serveur.mjs';
import {
  chaine,
  encoder,
  entier,
  enumere,
  ETIQUETTE,
  lire,
  lireChaine,
  lireEntier,
  lireTous,
  RESULTAT,
  sequence,
} from '../annuaire/ber.mjs';

let client;

const BASE = 'DC=exemple,DC=interne';

/**
 * Les cinq contextes de nommage qu'un contrôleur de domaine Windows annonce.
 * Le premier est celui qu'on interroge ; les quatre autres sont les voisins vers
 * lesquels partent les renvois.
 */
const CONTEXTES = Object.freeze([
  BASE,
  `CN=Configuration,${BASE}`,
  `CN=Schema,CN=Configuration,${BASE}`,
  `DC=DomainDnsZones,${BASE}`,
  `DC=ForestDnsZones,${BASE}`,
]);

/** Les renvois qu'un AD émet sur une recherche en sous-arbre depuis la racine. */
const RENVOIS_AD = Object.freeze([
  `ldap://exemple.interne/CN=Configuration,${BASE}`,
  `ldap://exemple.interne/DC=DomainDnsZones,${BASE}`,
  `ldap://exemple.interne/DC=ForestDnsZones,${BASE}`,
]);

before(async () => {
  client = await moduleCompile('auth/client-ldap.js');
});

/* =====================================================================
 *  Un répondeur LDAP minimal — la topologie d'un contrôleur de domaine
 * ===================================================================== */

/**
 * @param {{contextes?: readonly string[], renvois?: readonly string[],
 *          rootDseMuet?: boolean}} forme
 */
async function demarrerRepondeur(forme = {}) {
  const contextes = forme.contextes ?? CONTEXTES;
  const renvois = forme.renvois ?? RENVOIS_AD;
  const rootDseMuet = forme.rootDseMuet ?? false;
  /** Ce que le répondeur a vu — pour qu'un essai puisse dire ce qui a été demandé. */
  const journal = [];

  const entreeEnBer = (id, dn, attributs) =>
    sequence(
      entier(id),
      encoder(
        ETIQUETTE.ENTREE_RECHERCHE,
        Buffer.concat([
          chaine(dn),
          sequence(
            ...Object.entries(attributs).map(([nom, valeurs]) =>
              sequence(chaine(nom), encoder(0x31, Buffer.concat(valeurs.map((v) => chaine(v))))),
            ),
          ),
        ]),
      ),
    );

  const renvoiEnBer = (id, uri) =>
    sequence(entier(id), encoder(ETIQUETTE.RENVOI_RECHERCHE, chaine(uri)));

  const finEnBer = (id, code) =>
    sequence(
      entier(id),
      encoder(ETIQUETTE.FIN_RECHERCHE, Buffer.concat([enumere(code), chaine(''), chaine('')])),
    );

  const serveur = net.createServer((prise) => {
    let tampon = Buffer.alloc(0);
    prise.on('data', (morceau) => {
      tampon = Buffer.concat([tampon, morceau]);
      for (;;) {
        const message = lire(tampon, 0);
        if (message === null) break;
        tampon = tampon.subarray(message.fin);

        const champs = lireTous(message.contenu);
        const id = lireEntier(champs[0].contenu);
        const operation = champs[1];

        if (operation.etiquette === ETIQUETTE.DEMANDE_LIAISON) {
          journal.push({ operation: 'liaison' });
          prise.write(
            sequence(
              entier(id),
              encoder(
                ETIQUETTE.REPONSE_LIAISON,
                Buffer.concat([enumere(RESULTAT.SUCCES), chaine(''), chaine('')]),
              ),
            ),
          );
          continue;
        }

        if (operation.etiquette === ETIQUETTE.DEMANDE_RECHERCHE) {
          const parties = lireTous(operation.contenu);
          const baseDemandee = lireChaine(parties[0].contenu);
          journal.push({ operation: 'recherche', base: baseDemandee });

          if (baseDemandee === '') {
            // Le RootDSE. C'est là que le client apprend les contextes de nommage
            // — ou n'apprend rien, quand on veut éprouver le repli.
            if (rootDseMuet) {
              prise.write(Buffer.concat([entreeEnBer(id, '', {}), finEnBer(id, RESULTAT.SUCCES)]));
            } else {
              prise.write(
                Buffer.concat([
                  entreeEnBer(id, '', { namingContexts: [...contextes] }),
                  finEnBer(id, RESULTAT.SUCCES),
                ]),
              );
            }
            continue;
          }

          // Une recherche ordinaire : l'entrée cherchée EST là, et les renvois
          // l'accompagnent — c'est exactement la trame du contrôleur réel.
          prise.write(
            Buffer.concat([
              entreeEnBer(id, `CN=rssi.tls,OU=Utilisateurs,${BASE}`, {
                sAMAccountName: ['rssi.tls'],
                displayName: ['Sarah Nadal'],
              }),
              ...renvois.map((uri) => renvoiEnBer(id, uri)),
              finEnBer(id, RESULTAT.SUCCES),
            ]),
          );
          continue;
        }

        // Déliaison : rien à répondre.
      }
    });
    prise.on('error', () => {});
  });

  await new Promise((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  const port = serveur.address().port;
  return {
    url: `ldap://127.0.0.1:${String(port)}`,
    journal,
    async fermer() {
      await new Promise((resoudre) => serveur.close(resoudre));
    },
  };
}

/** Ouvre un client sur le répondeur, lié, prêt à chercher. */
async function connecter(repondeur) {
  const c = await client.ClientLdap.connecter({
    url: repondeur.url,
    delaiMs: 4000,
    verifierCertificat: false,
    ca: null,
  });
  await c.lier(`CN=service,${BASE}`, 'peu-importe');
  return c;
}

const chercher = (c) =>
  c.rechercher({
    base: BASE,
    portee: 'sousArbre',
    filtre: '(&(objectClass=user)(sAMAccountName=rssi.tls))',
    attributs: ['sAMAccountName', 'displayName'],
    tailleMax: 2,
  });

/* =====================================================================
 *  Le discriminant, éprouvé comme fonction pure
 * ===================================================================== */

describe('Q-83 — le discriminant n’est pas la hiérarchie des DN', () => {
  /** Le discriminant, tel que `src/auth/client-ldap.ts` l'exporte. */
  const renvoiHorsPerimetre = (uri, base, contextes) =>
    client.renvoiHorsPerimetre(uri, base, contextes);

  test('un renvoi vers un AUTRE contexte de nommage est écarté', () => {
    for (const uri of RENVOIS_AD) {
      assert.equal(
        renvoiHorsPerimetre(uri, BASE, CONTEXTES),
        true,
        `« ${uri} » ne retire rien de ce qui était demandé : il ne doit pas faire échouer ` +
          'la recherche. C’est ce refus-là qui rendait le produit inutilisable contre un AD.',
      );
    }
  });

  test('LA PREMIÈRE CORRECTION ÉTAIT FAUSSE : ces DN sont bien SOUS la base', () => {
    // La raison pour laquelle comparer les suffixes ne suffisait pas, écrite en essai
    // plutôt qu'en commentaire : `CN=Configuration,DC=exemple,DC=interne` EST
    // syntaxiquement sous `DC=exemple,DC=interne`. La hiérarchie des DN et le découpage
    // en contextes de nommage sont deux choses différentes, et c'est le second qui décide.
    for (const uri of RENVOIS_AD) {
      const dn = uri.slice(uri.indexOf('/', 'ldap://'.length) + 1);
      assert.ok(dn.endsWith(`,${BASE}`), `${dn} est bien un descendant syntaxique de la base`);
    }
  });

  test('un renvoi DANS le contexte interrogé reste une troncature', () => {
    // La propriété qu'on voulait garder : une réponse amputée ne passe pas pour complète.
    assert.equal(
      renvoiHorsPerimetre(`ldap://exemple.interne/OU=Filiale2,${BASE}`, BASE, CONTEXTES),
      false,
    );
    assert.equal(
      renvoiHorsPerimetre(`ldap://autre-dc.exemple.interne/${BASE}`, BASE, CONTEXTES),
      false,
    );
  });

  test('sans contextes — RootDSE muet — RIEN n’est écarté : le doute reste du côté du refus', () => {
    for (const uri of [...RENVOIS_AD, `ldap://x/OU=Autre,${BASE}`]) {
      assert.equal(renvoiHorsPerimetre(uri, BASE, []), false);
    }
  });

  test('un renvoi ILLISIBLE est traité comme s’il était dans le périmètre', () => {
    for (const uri of ['', 'ldap://exemple.interne', 'pas-une-url', 'ldap://hote/?sub?(x=y)']) {
      assert.equal(renvoiHorsPerimetre(uri, BASE, CONTEXTES), false, `« ${uri} »`);
    }
  });

  test('la casse et les espaces autour des virgules ne changent pas la décision', () => {
    assert.equal(
      renvoiHorsPerimetre(
        `ldap://exemple.interne/cn=Configuration, DC=Exemple,DC=Interne`,
        'dc=exemple, dc=interne',
        CONTEXTES,
      ),
      true,
    );
  });

  test('une base vide n’écarte rien — on ne compare pas contre le néant', () => {
    assert.equal(renvoiHorsPerimetre(RENVOIS_AD[0], '', CONTEXTES), false);
  });
});

/* =====================================================================
 *  La chaîne complète, contre la topologie d'un vrai AD
 * ===================================================================== */

describe('Q-83 — la recherche aboutit contre la topologie d’un contrôleur de domaine', () => {
  test('l’entrée est rendue, et les renvois écartés sont NOMMÉS', async () => {
    const repondeur = await demarrerRepondeur();
    const c = await connecter(repondeur);
    try {
      const entrees = await chercher(c);

      assert.equal(entrees.length, 1, 'L’entrée cherchée EST là — elle l’a toujours été.');
      assert.equal(entrees[0].attributs.get('samaccountname')?.[0], 'rssi.tls');

      // ⚠️ Le point qui distingue « écarté » de « tu ». Un écartement muet
      // redeviendrait ce que le constat reproche à l'ancienne version : une décision
      // invisible sur ce qui compose la réponse.
      assert.deepEqual(
        [...c.derniersRenvoisEcartes],
        [...RENVOIS_AD],
        'Le client doit pouvoir NOMMER ce qu’il a ignoré.',
      );

      // Et il est bien allé le demander au RootDSE, plutôt que d'écrire la liste
      // « CN=Configuration / DomainDnsZones / ForestDnsZones » à la main.
      assert.ok(
        repondeur.journal.some((l) => l.operation === 'recherche' && l.base === ''),
        'Les contextes de nommage se DEMANDENT au serveur (« on découvre dans le catalogue »).',
      );
    } finally {
      await c.fermer();
      await repondeur.fermer();
    }
  });

  test('un renvoi DANS le contexte interrogé fait toujours échouer la recherche', async () => {
    const repondeur = await demarrerRepondeur({
      renvois: [`ldap://dc2.exemple.interne/OU=Filiale2,${BASE}`],
    });
    const c = await connecter(repondeur);
    try {
      await assert.rejects(
        () => chercher(c),
        (erreur) => {
          // ⚠️ Le message rendu au client est GÉNÉRIQUE — « l'annuaire est injoignable ou
          // a répondu de façon inattendue » —, et c'est le contrôle S12 : un refus ne
          // décrit pas la topologie de l'annuaire à qui le sonde. Le motif exact vit
          // dans `detailJournal`, que seul l'exploitant lit. L'essai regarde donc là,
          // et il l'a appris en rougissant.
          assert.match(String(erreur.detailJournal), /TRONQU/i);
          assert.match(String(erreur.detailJournal), /OU=Filiale2/);
          return true;
        },
        'La barrière d’origine doit rester entière : une réponse amputée ne passe pas ' +
          'pour complète.',
      );
    } finally {
      await c.fermer();
      await repondeur.fermer();
    }
  });

  test('un renvoi mixte — un dedans, deux dehors — échoue sur celui du dedans', async () => {
    const repondeur = await demarrerRepondeur({
      renvois: [RENVOIS_AD[0], `ldap://dc2.exemple.interne/OU=Filiale2,${BASE}`, RENVOIS_AD[1]],
    });
    const c = await connecter(repondeur);
    try {
      await assert.rejects(
        () => chercher(c),
        (erreur) => {
          assert.match(String(erreur.detailJournal), /OU=Filiale2/);
          return true;
        },
      );
    } finally {
      await c.fermer();
      await repondeur.fermer();
    }
  });

  test('un RootDSE MUET fait retomber sur le refus d’avant — et c’est voulu', async () => {
    // « Si le RootDSE ne répond pas ou ne porte pas l'attribut, on rend une liste VIDE :
    // aucun renvoi n'est alors tenu pour hors périmètre, et l'on retombe sur le refus
    // d'avant. » La propriété est ici jouée, pas seulement écrite.
    const repondeur = await demarrerRepondeur({ rootDseMuet: true });
    const c = await connecter(repondeur);
    try {
      await assert.rejects(
        () => chercher(c),
        (erreur) => {
          assert.match(String(erreur.detailJournal), /TRONQU/i);
          assert.match(String(erreur.detailJournal), /CN=Configuration/);
          return true;
        },
      );
    } finally {
      await c.fermer();
      await repondeur.fermer();
    }
  });

  test('sans aucun renvoi, la liste des écartés est VIDE — pas résiduelle', async () => {
    // Un champ qui garderait les renvois de la recherche précédente ferait dire au banc
    // « on a ignoré ceci » à propos d'une réponse qui ne portait rien.
    const repondeur = await demarrerRepondeur({ renvois: [] });
    const c = await connecter(repondeur);
    try {
      const entrees = await chercher(c);
      assert.equal(entrees.length, 1);
      assert.deepEqual([...c.derniersRenvoisEcartes], []);
    } finally {
      await c.fermer();
      await repondeur.fermer();
    }
  });
});
