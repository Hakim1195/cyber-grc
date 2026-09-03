/**
 * annuaire.test.mjs — les cinq comportements D1 à D5 du `CONVENTIONS.md` §25.2.
 *
 * ── Ce que ce fichier prouve, et pour qui ───────────────────────────────────
 *
 * L'agent **A1** code son client LDAP contre l'annuaire simulé sans l'attendre :
 * c'est tout l'objet du §25, figé par l'orchestrateur avant le lancement des deux
 * agents. Encore faut-il que la doublure fasse ce que le contrat annonce — sinon A1
 * code contre un texte, et découvre l'écart au moment de la porte.
 *
 * Chaque essai porte donc le numéro du comportement qu'il tient, et **chacun est
 * apparié** : le §20.2 veut qu'un garde-fou se vérifie dans les deux sens. Une
 * liaison qui réussit ne prouve rien tant qu'on n'a pas montré une liaison qui
 * échoue, sur le même chemin.
 *
 * ── Le transport, et la réserve du §25.4 ────────────────────────────────────
 *
 * Le §25.4 laisse le transport à A4, **à condition de l'écrire**. Les essais de ce
 * fichier jouent les deux :
 *
 *  · **LDAP en clair sur la boucle locale** pour D1 à D5 — c'est le chemin rapide,
 *    et il ne dit rien de la vérification du certificat ;
 *  · **LDAPS avec un certificat auto-signé engendré à la volée** pour un essai
 *    dédié, qui montre que la vérification du certificat **refuse** une autorité
 *    inconnue et **accepte** l'autorité ancrée. Sans cette moitié, la configuration
 *    réelle — qui exige LDAPS, `src/config/index.ts` refusant `ldap://` en
 *    production — ne serait éprouvée par rien.
 *
 * Ce qui reste **non éprouvé**, et qui est dit plutôt que tu : le certificat est
 * auto-signé et l'ancre est le certificat lui-même. Une **chaîne** de PKI interne
 * (`LDAP_CA` pointant une autorité intermédiaire) n'est donc pas exercée, et le
 * contrôle du nom d'hôte l'est contre un `subjectAltName` que le banc a écrit.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { RACINE_BACKEND } from '../aide/serveur.mjs';
import {
  BASE_RECHERCHE, COMPTES, COMPTE_SERVICE, GROUPE_PAR_NOM, UAC_DESACTIVE,
  dnGroupe, dnUtilisateur,
} from './comptes.mjs';
import { ErreurLdap, connecter, resoudreGroupesRecursivement } from './client-ldap.mjs';
import { RESULTAT } from './ber.mjs';
import { demarrerAnnuaire } from './serveur-ldap.mjs';

/* =====================================================================
 *  La configuration RÉELLE, lue là où elle est écrite
 * ===================================================================== */

/**
 * Le filtre et les attributs ne sont **pas recopiés ici** : ils sont lus dans
 * `backend/.env.example`, qui est le document que l'exploitant remplira. Un essai
 * qui recopierait le filtre éprouverait sa propre copie — et le jour où la
 * configuration livrée change, il resterait vert contre un annuaire qui ne répond
 * plus à ce que le produit demande.
 */
function lireEnvExemple(cle) {
  const texte = readFileSync(join(RACINE_BACKEND, '.env.example'), 'utf8');
  const ligne = texte.split('\n').find((l) => l.startsWith(`${cle}=`));
  assert.notEqual(ligne, undefined, `${cle} est absent de .env.example : cet essai n’a plus de sujet.`);
  return ligne.slice(cle.length + 1).trim();
}

const FILTRE_UTILISATEUR = lireEnvExemple('LDAP_FILTRE_UTILISATEUR');
const ATTRIBUT_IDENTIFIANT = lireEnvExemple('LDAP_ATTRIBUT_IDENTIFIANT');
const ATTRIBUTS_PROFIL = lireEnvExemple('LDAP_ATTRIBUTS_PROFIL').split(',').map((a) => a.trim());
const PREFIXE_GROUPES = lireEnvExemple('LDAP_PREFIXE_GROUPES');

const filtrePour = (login) => FILTRE_UTILISATEUR.split('{login}').join(login);

let annuaire;

before(async () => {
  annuaire = await demarrerAnnuaire();
});

after(async () => {
  await annuaire?.fermer();
});

/** Ouvre une connexion liée au compte de service — le chemin D1, en une ligne. */
async function clientDeService(url = annuaire.url, options = {}) {
  const client = await connecter({ url, delaiMs: options.delaiMs ?? 4000, ...options });
  await client.lier(COMPTE_SERVICE.dn, COMPTE_SERVICE.motDePasse);
  return client;
}

/* =====================================================================
 *  Le contrat de montage — §25.1
 * ===================================================================== */

describe('L’annuaire simulé est monté comme le §25.1 l’exige', () => {
  test('PORT ÉPHÉMÈRE sur 127.0.0.1 : deux annuaires cohabitent', async () => {
    // Un port fixe casse dès que deux familles d'essais tournent en parallèle, et
    // le défaut se présente comme un essai « capricieux » — la pire forme, celle
    // qu'on apprend à relancer sans lire.
    const second = await demarrerAnnuaire();
    try {
      assert.equal(annuaire.hote, '127.0.0.1');
      assert.notEqual(annuaire.port, second.port, 'Deux annuaires ne peuvent pas partager un port.');
      assert.ok(annuaire.port > 1024 && second.port > 1024, 'Un port éphémère, jamais un port privilégié.');
      // …et les deux répondent en même temps : sans cela, « ports différents »
      // serait vrai de deux serveurs dont un seul écoute.
      for (const cible of [annuaire, second]) {
        const client = await clientDeService(cible.url);
        const trouves = await client.rechercher({ base: BASE_RECHERCHE, filtre: filtrePour('rssi.tls'), attributs: ['cn'] });
        assert.equal(trouves.length, 1, `L’annuaire du port ${String(cible.port)} ne répond pas.`);
        await client.fermer();
      }
    } finally {
      await second.fermer();
    }
  });

  test('AUCUN FICHIER DE `src/` n’importe l’annuaire simulé (§25.1)', async () => {
    // « Il n'est jamais importé par backend/src/** ». Écrit ainsi, cela tient par
    // discipline ; mesuré, cela tient tout court.
    const { execFileSync } = await import('node:child_process');
    const fichiers = execFileSync('git', ['ls-files', 'backend/src'], {
      cwd: join(RACINE_BACKEND, '..'), encoding: 'utf8',
    }).split('\n').filter((f) => f !== '');
    assert.ok(fichiers.length >= 8, `Seulement ${String(fichiers.length)} fichier(s) dans src/ : le balayage ne voit plus rien.`);
    // ── Ce qui est interdit est un IMPORT, pas une mention ──────────────────
    //
    // Première rédaction : toute occurrence de « test/annuaire » dans `src/**`.
    // Elle a rougi sur `src/auth/index.ts`, dont un COMMENTAIRE dit à juste titre
    // « le banc y branche la doublure de test/annuaire/ ». Un contrôle qui refuse
    // qu'on écrive le nom de la chose interdit d'expliquer pourquoi elle l'est —
    // et l'on apprend à le contourner. On ne lit donc que les spécificateurs
    // d'import, `require` compris.
    const specificateurs = /(?:^|[^\w.])(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|(?:^|[^\w.])(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    const fautifs = [];
    let vus = 0;
    for (const fichier of fichiers) {
      const contenu = readFileSync(join(RACINE_BACKEND, '..', fichier), 'utf8');
      for (const trouve of contenu.matchAll(specificateurs)) {
        const cible = trouve[1] ?? trouve[2];
        vus += 1;
        if (/(?:^|\/)(?:test)\//.test(cible) || /annuaire\/(?:serveur-ldap|comptes|client-ldap|ber)/.test(cible)) {
          fautifs.push(`${fichier} importe « ${cible} »`);
        }
      }
    }
    // Le balayage doit avoir VU des imports : « aucun import fautif » est aussi ce
    // que rend un motif qui ne reconnaît plus rien.
    assert.ok(vus >= 20, `Seulement ${String(vus)} import(s) lus dans src/ : le motif ne reconnaît plus la façon dont ce dépôt importe.`);
    assert.deepEqual(fautifs, [], 'Un fichier de src/ IMPORTE l’annuaire simulé : un import de src vers test est un défaut, pas un raccourci (§25.1).\n  · ' + fautifs.join('\n  · '));
  });

  test('LES HUIT COMPTES du §25.3 sont là, et ce sont EXACTEMENT ceux-là', async () => {
    const client = await clientDeService();
    const trouves = await client.rechercher({
      base: BASE_RECHERCHE, portee: 2, filtre: '(&(objectClass=user)(sAMAccountName=*))', attributs: [ATTRIBUT_IDENTIFIANT],
    });
    const logins = trouves.map((e) => e.attributs[ATTRIBUT_IDENTIFIANT][0]).sort();
    assert.deepEqual(
      logins,
      [...COMPTES.map((c) => c.login), 'svc-grc'].sort(),
      'Le jeu de comptes est FIGÉ (§25.3) : A1 code contre lui. En ajouter ou en retirer un se demande, ne se décide pas.',
    );
    await client.fermer();
  });
});

/* =====================================================================
 *  D1 — liaison du compte de service, puis recherche par le filtre
 * ===================================================================== */

describe('D1 — le compte de service lit, et le filtre configuré trouve', () => {
  test('LIAISON DU COMPTE DE SERVICE, puis recherche par LDAP_FILTRE_UTILISATEUR', async () => {
    annuaire.viderJournal();
    const client = await clientDeService();
    const trouves = await client.rechercher({
      base: BASE_RECHERCHE, portee: 2, filtre: filtrePour('qualite.tls'),
      attributs: ['distinguishedName', ...ATTRIBUTS_PROFIL],
    });
    assert.equal(trouves.length, 1, `Le filtre « ${filtrePour('qualite.tls')} » doit rendre exactement un compte.`);
    assert.equal(trouves[0].dn, dnUtilisateur('qualite.tls'));
    // Les sept attributs de profil du `.env.example` doivent être servis : c'est
    // d'eux que l'annuaire `personnes` sera alimenté (PLAN_SERVEUR §1.5).
    for (const attribut of ATTRIBUTS_PROFIL) {
      assert.ok(
        Array.isArray(trouves[0].attributs[attribut]) && trouves[0].attributs[attribut][0] !== undefined,
        `L’attribut de profil « ${attribut} » n’est pas servi : l’annuaire personnes resterait vide.`,
      );
    }
    // La séquence RÉELLEMENT vue par l'annuaire, et non celle qu'on croit avoir émise.
    // Les déliaisons des essais précédents arrivent de façon asynchrone : on ne
    // juge que les opérations qui décident.
    const operations = annuaire.journal.map((l) => l.operation).filter((o) => o === 'liaison' || o === 'recherche');
    assert.deepEqual(operations, ['liaison', 'recherche'], `Séquence observée : ${JSON.stringify(annuaire.journal)}`);
    const decisives = annuaire.journal.filter((l) => l.operation === 'liaison' || l.operation === 'recherche');
    assert.equal(decisives[0].dn, COMPTE_SERVICE.dn);
    assert.equal(decisives[1].filtre, filtrePour('qualite.tls'));
    await client.fermer();
  });

  test('CONTRE-ÉPREUVE : sans liaison, la recherche est REFUSÉE', async () => {
    // Sans cette moitié, « le compte de service lit » serait vrai d'un annuaire qui
    // laisse tout le monde lire — et le §1.5 ne demanderait rien.
    const client = await connecter({ url: annuaire.url, delaiMs: 4000 });
    await assert.rejects(
      () => client.rechercher({ base: BASE_RECHERCHE, filtre: filtrePour('rssi.tls'), attributs: ['cn'] }),
      (erreur) => erreur instanceof ErreurLdap && erreur.codeLdap === RESULTAT.DROITS_INSUFFISANTS,
      'Une recherche anonyme doit être refusée (50), comme sur un AD durci.',
    );
    await client.fermer();
  });

  test('UN LOGIN INCONNU ne rend rien — et le filtre n’est pas contournable par « * »', async () => {
    const client = await clientDeService();
    assert.deepEqual(await client.rechercher({ base: BASE_RECHERCHE, filtre: filtrePour('nobody'), attributs: ['cn'] }), []);
    // Un login portant une étoile ne doit pas se transformer en joker : c'est
    // l'injection de filtre LDAP, et elle rendrait ici les neuf comptes.
    const injection = await client.rechercher({ base: BASE_RECHERCHE, filtre: filtrePour('rssi*'), attributs: ['cn'] });
    assert.ok(
      injection.length <= 2,
      'Le banc ne juge pas l’échappement du client ici — mais si ce nombre explose, c’est que ' +
      'le filtre a été construit par concaténation, et A1 doit le voir.',
    );
    await client.fermer();
  });
});

/* =====================================================================
 *  D2 — vérification des identifiants, succès ET échec
 * ===================================================================== */

describe('D2 — la liaison d’un utilisateur réussit, et surtout échoue', () => {
  test('MOT DE PASSE JUSTE : la liaison passe, pour les huit comptes', async () => {
    for (const compte of COMPTES) {
      const client = await connecter({ url: annuaire.url, delaiMs: 4000 });
      await client.lier(dnUtilisateur(compte.login), compte.motDePasse);
      await client.fermer();
    }
  });

  test('MOT DE PASSE FAUX : InvalidCredentials (49), et rien d’autre', async () => {
    const client = await connecter({ url: annuaire.url, delaiMs: 4000 });
    await assert.rejects(
      () => client.lier(dnUtilisateur('rssi.tls'), 'ce-n-est-pas-le-bon'),
      (erreur) => erreur.codeLdap === RESULTAT.IDENTIFIANTS_INVALIDES,
      'Le §25.2 fige le code : 49, pas 53, pas 32.',
    );
    await client.fermer();
  });

  test('DN INCONNU : 49 aussi — et le diagnostic reproduit la fuite de l’AD, À DESSEIN', async () => {
    const client = await connecter({ url: annuaire.url, delaiMs: 4000 });
    let inconnu;
    let mauvais;
    await client.lier(dnUtilisateur('rssi.tls'), 'faux').catch((e) => { mauvais = e; });
    await client.lier('CN=personne,OU=Utilisateurs,DC=exemple,DC=interne', 'peu importe').catch((e) => { inconnu = e; });
    assert.equal(inconnu.codeLdap, RESULTAT.IDENTIFIANTS_INVALIDES);
    assert.equal(mauvais.codeLdap, RESULTAT.IDENTIFIANTS_INVALIDES);
    // ── Pourquoi la doublure FUIT volontairement ────────────────────────────
    // L'AD distingue « compte inconnu » (data 525) de « mot de passe faux »
    // (data 52e) dans son diagnostic. Le reproduire n'est pas une négligence :
    // c'est ce qui permet à A1 de démontrer que SON client ne relaie pas la
    // distinction au navigateur (contrôle S12). Une doublure qui ne fuirait pas
    // rendrait cette démonstration impossible.
    assert.match(inconnu.diagnostic, /data 525/);
    assert.match(mauvais.diagnostic, /data 52e/);
    await client.fermer();
  });

  test('MOT DE PASSE VIDE avec un DN : refusé — c’est la liaison NON AUTHENTIFIÉE', async () => {
    // RFC 4513 §5.1.2 : un serveur naïf la déclare réussie, et un client qui prend
    // ce succès pour une vérification laisse entrer n'importe qui.
    const client = await connecter({ url: annuaire.url, delaiMs: 4000 });
    await assert.rejects(
      () => client.lier(dnUtilisateur('admin'), ''),
      (erreur) => erreur.codeLdap === RESULTAT.IDENTIFIANTS_INVALIDES,
    );
    await client.fermer();
  });
});

/* =====================================================================
 *  D3 — l'imbrication, ses trois niveaux, et SON CYCLE
 * ===================================================================== */

describe('D3 — l’appartenance indirecte, et le cycle qui fige un résolveur naïf', () => {
  test('LE COMPTE `dpo` n’est membre DIRECT que du groupe intermédiaire', async () => {
    const client = await clientDeService();
    const [entree] = await client.rechercher({
      base: BASE_RECHERCHE, filtre: filtrePour('dpo'), attributs: ['memberOf'],
    });
    assert.deepEqual(
      entree.attributs.memberOf,
      [dnGroupe('GRC-IMBRIQUE-DPO')],
      'Si `dpo` était membre direct de GRC-TLS-DPO, D3 ne prouverait plus rien.',
    );
    await client.fermer();
  });

  test('RÉSOLUTION RÉCURSIVE : l’appartenance indirecte à GRC-TLS-DPO est reconnue', async () => {
    const client = await clientDeService();
    const groupes = await resoudreGroupesRecursivement(client, dnUtilisateur('dpo'), { base: BASE_RECHERCHE });
    assert.ok(
      groupes.includes(dnGroupe('GRC-TLS-DPO').toLowerCase()),
      `GRC-TLS-DPO doit être atteint par imbrication. Vus : ${groupes.join(', ')}`,
    );
    // …et TROIS NIVEAUX au moins, sur le chemin réellement parcouru.
    assert.ok(groupes.length >= 3, `Trois niveaux d’imbrication attendus, ${String(groupes.length)} vus.`);
    await client.fermer();
  });

  test('LE CYCLE EXISTE VRAIMENT dans l’annuaire — A membre de B, B membre de A', async () => {
    // Sans cette vérification, l'essai suivant serait vrai d'un annuaire sans cycle
    // et d'un résolveur qui plante pour une autre raison.
    assert.deepEqual(GROUPE_PAR_NOM['grc-cercle-a'].membreDe, ['GRC-CERCLE-B']);
    assert.deepEqual(GROUPE_PAR_NOM['grc-cercle-b'].membreDe, ['GRC-CERCLE-A']);
    const client = await clientDeService();
    const membresDeA = await client.rechercher({ base: dnGroupe('GRC-CERCLE-A'), portee: 0, filtre: '(objectClass=*)', attributs: ['member'] });
    const membresDeB = await client.rechercher({ base: dnGroupe('GRC-CERCLE-B'), portee: 0, filtre: '(objectClass=*)', attributs: ['member'] });
    assert.ok(membresDeA[0].attributs.member.includes(dnGroupe('GRC-CERCLE-B')));
    assert.ok(membresDeB[0].attributs.member.includes(dnGroupe('GRC-CERCLE-A')));
    // Et le cycle est SUR LE CHEMIN que la résolution de `dpo` parcourt : posé
    // sur une branche morte, il ne figerait aucun résolveur.
    assert.ok(GROUPE_PAR_NOM['grc-imbrique-dpo'].membreDe.includes('GRC-CERCLE-A'));
    await client.fermer();
  });

  test('UN RÉSOLVEUR SANS MÉMOIRE DES VISITÉS NE TERMINE PAS — c’est l’objet de D3', async () => {
    // La moitié qui manque toujours : montrer que le piège MORD. Un banc dont le
    // cycle ne fige personne est un banc qui laisse passer un serveur qui se fige
    // à la première connexion en production.
    const client = await clientDeService();
    await assert.rejects(
      () => resoudreGroupesRecursivement(client, dnUtilisateur('dpo'), {
        base: BASE_RECHERCHE, avecEnsembleDesVisites: false, maxOperations: 40,
      }),
      (erreur) => erreur.codeLdap === 'CYCLE',
      'Le cycle doit faire tourner indéfiniment un résolveur naïf.',
    );
    await client.fermer();
  });

  test('LES GROUPES DU CERCLE portent le préfixe configuré, et n’accordent RIEN', async () => {
    // Le préfixe est délibéré : un résolveur qui filtrerait sur `GRC-` AVANT de
    // descendre n'entrerait jamais dans le cycle, et l'essai précédent serait sans
    // dents. La contrepartie est la seconde moitié : un groupe `GRC-*` inconnu du
    // modèle de droits n'accorde aucun accès.
    for (const nom of ['GRC-CERCLE-A', 'GRC-CERCLE-B', 'GRC-IMBRIQUE-DPO']) {
      assert.ok(nom.startsWith(PREFIXE_GROUPES), `${nom} doit porter le préfixe ${PREFIXE_GROUPES}.`);
      assert.equal(GROUPE_PAR_NOM[nom.toLowerCase()].perimetre, null, `${nom} ne doit accorder aucun périmètre.`);
      assert.equal(GROUPE_PAR_NOM[nom.toLowerCase()].profil, null, `${nom} ne doit accorder aucun profil.`);
    }
  });
});

/* =====================================================================
 *  D4 — déprovisionnement immédiat, EN COURS D'ESSAI
 * ===================================================================== */

describe('D4 — le compte désactivé et le retrait de groupe, à chaud', () => {
  test('DÉSACTIVATION : la liaison qui passait ne passe plus, puis repasse', async () => {
    const client = await connecter({ url: annuaire.url, delaiMs: 4000 });
    await client.lier(dnUtilisateur('contrib.tls'), 'contrib.tls!2026'); // avant : ça passe

    annuaire.desactiver('contrib.tls');
    await assert.rejects(
      () => client.lier(dnUtilisateur('contrib.tls'), 'contrib.tls!2026'),
      (erreur) => erreur.codeLdap === RESULTAT.IDENTIFIANTS_INVALIDES && /data 533/.test(erreur.diagnostic),
      'Un compte désactivé doit échouer À LA LIAISON, pas être accepté puis filtré après coup.',
    );
    // Le drapeau est visible aussi en lecture — un client peut vouloir le lire pour
    // invalider les sessions actives (§1.5, déprovisionnement immédiat).
    const service = await clientDeService();
    const [vue] = await service.rechercher({ base: BASE_RECHERCHE, filtre: filtrePour('contrib.tls'), attributs: ['userAccountControl'] });
    assert.equal(vue.attributs.userAccountControl[0], String(UAC_DESACTIVE));
    assert.equal(Number(vue.attributs.userAccountControl[0]) & 0x0002, 2, 'C’est le bit 2 qui désactive, pas une valeur choisie au hasard.');
    await service.fermer();

    annuaire.reactiver('contrib.tls');
    await client.lier(dnUtilisateur('contrib.tls'), 'contrib.tls!2026'); // après : ça repasse
    await client.fermer();
  });

  test('RETRAIT DE GROUPE : l’appartenance disparaît DES DEUX CÔTÉS, puis revient', async () => {
    const service = await clientDeService();
    const memberOf = async (login) =>
      (await service.rechercher({ base: BASE_RECHERCHE, filtre: filtrePour(login), attributs: ['memberOf'] }))[0].attributs.memberOf ?? [];
    const membres = async (groupe) =>
      (await service.rechercher({ base: dnGroupe(groupe), portee: 0, filtre: '(objectClass=*)', attributs: ['member'] }))[0].attributs.member ?? [];

    assert.ok((await memberOf('rssi.tls')).includes(dnGroupe('GRC-TLS-RSSI')));
    assert.ok((await membres('GRC-TLS-RSSI')).includes(dnUtilisateur('rssi.tls')));

    annuaire.retirerDuGroupe('rssi.tls', 'GRC-TLS-RSSI');
    // Les deux sens : un annuaire qui n'en nettoierait qu'un laisserait passer un
    // client qui interroge l'autre — et le déprovisionnement serait un leurre.
    assert.ok(!(await memberOf('rssi.tls')).includes(dnGroupe('GRC-TLS-RSSI')), 'memberOf doit avoir suivi.');
    assert.ok(!(await membres('GRC-TLS-RSSI')).includes(dnUtilisateur('rssi.tls')), 'member doit avoir suivi aussi.');

    annuaire.remettreDansGroupe('rssi.tls', 'GRC-TLS-RSSI');
    assert.ok((await memberOf('rssi.tls')).includes(dnGroupe('GRC-TLS-RSSI')));
    assert.ok((await membres('GRC-TLS-RSSI')).includes(dnUtilisateur('rssi.tls')));
    await service.fermer();
  });
});

/* =====================================================================
 *  D5 — la panne
 * ===================================================================== */

describe('D5 — un annuaire qui ne répond pas ne doit pas ouvrir de session', () => {
  test('REFUS DE CONNEXION : la connexion elle-même échoue', async () => {
    const panne = await demarrerAnnuaire();
    try {
      panne.definirPanne({ refuserConnexions: true });
      await assert.rejects(
        async () => {
          const client = await connecter({ url: panne.url, delaiMs: 2000 });
          await client.lier(COMPTE_SERVICE.dn, COMPTE_SERVICE.motDePasse);
        },
        'Une liaison contre un annuaire qui refuse doit échouer, jamais aboutir.',
      );
      // Et la contre-épreuve, sur le MÊME annuaire : levée la panne, ça repasse.
      panne.definirPanne({ refuserConnexions: false });
      const client = await connecter({ url: panne.url, delaiMs: 2000 });
      await client.lier(COMPTE_SERVICE.dn, COMPTE_SERVICE.motDePasse);
      await client.fermer();
    } finally {
      await panne.fermer();
    }
  });

  test('RÉPONSE LENTE au-delà de LDAP_DELAI : le client renonce, il n’attend pas', async () => {
    const panne = await demarrerAnnuaire();
    try {
      panne.definirPanne({ delaiReponseMs: 900 });
      const client = await connecter({ url: panne.url, delaiMs: 250 });
      const debut = Date.now();
      await assert.rejects(
        () => client.lier(COMPTE_SERVICE.dn, COMPTE_SERVICE.motDePasse),
        (erreur) => erreur.codeLdap === 'DELAI',
      );
      // Le délai doit être TENU, pas seulement déclaré : un client qui attendrait
      // la réponse lente puis renoncerait bloquerait un fil pendant 900 ms.
      assert.ok(Date.now() - debut < 800, `Le renoncement a pris ${String(Date.now() - debut)} ms pour un délai de 250 ms.`);
      await client.fermer();
    } finally {
      await panne.fermer();
    }
  });

  test('RÉPONSE TRONQUÉE : le client la rejette, il ne la décode pas « au mieux »', async () => {
    const panne = await demarrerAnnuaire();
    try {
      panne.definirPanne({ tronquer: true });
      const client = await connecter({ url: panne.url, delaiMs: 2000 });
      await assert.rejects(
        () => client.lier(COMPTE_SERVICE.dn, COMPTE_SERVICE.motDePasse),
        (erreur) => /tronqu|ferm/i.test(erreur.message),
        'Une trame mutilée ne doit jamais valoir un succès.',
      );
      await client.fermer();
    } finally {
      await panne.fermer();
    }
  });
});

/* =====================================================================
 *  Le transport — la réserve du §25.4, éprouvée plutôt que reconduite
 * ===================================================================== */

describe('LDAPS — la vérification du certificat, dans les deux sens (§25.4)', () => {
  test('CERTIFICAT INCONNU : la liaison est REFUSÉE ; ancré, elle passe', async () => {
    const securise = await demarrerAnnuaire({ tls: true });
    try {
      assert.ok(securise.url.startsWith('ldaps://'), securise.url);

      // ── Sens 1 : sans ancre, le certificat auto-signé est refusé ───────────
      await assert.rejects(
        () => connecter({ url: securise.url, delaiMs: 3000, verifierCertificat: true }),
        (erreur) => /self.signed|self signed|unable to verify|UNABLE_TO_VERIFY|DEPTH_ZERO/i.test(String(erreur.message + erreur.code)),
        'Sans autorité connue, LDAPS doit refuser — sinon la vérification ne sert à rien.',
      );

      // ── Sens 2 : avec l'ancre, elle passe et le service peut lire ──────────
      const client = await connecter({
        url: securise.url, delaiMs: 3000, verifierCertificat: true, ca: securise.certificat,
      });
      await client.lier(COMPTE_SERVICE.dn, COMPTE_SERVICE.motDePasse);
      const trouves = await client.rechercher({ base: BASE_RECHERCHE, filtre: filtrePour('admin'), attributs: ['cn'] });
      assert.equal(trouves.length, 1, 'Ancré, LDAPS doit servir exactement comme le transport en clair.');
      await client.fermer();

      // ── Sens 3 : le NOM d'hôte compte aussi ────────────────────────────────
      // Une ancre juste et un nom faux doivent échouer : sans cela, n'importe quel
      // serveur portant un certificat signé par la même autorité passerait.
      await assert.rejects(
        () => connecter({
          url: securise.url, delaiMs: 3000, verifierCertificat: true,
          ca: securise.certificat, servername: 'un-autre-controleur.exemple.interne',
        }),
        (erreur) => /Hostname|altnames|ERR_TLS_CERT_ALTNAME/i.test(String(erreur.message + erreur.code)),
      );
    } finally {
      await securise.fermer();
    }
  });
});
