/**
 * annuaire.test.mjs — le client LDAP et la résolution des groupes, **contre
 * l'annuaire simulé qu'un autre agent a écrit**.
 *
 * ── Pourquoi la doublure n'est pas dans ce répertoire ────────────────────────
 *
 * `CONVENTIONS.md` §25 : « un agent qui écrit sa doublure *et* le code qui
 * l'interroge peut se tromper deux fois de la même façon, et le banc reste vert.
 * C'est le défaut mesuré en Q-61. » L'annuaire vit donc dans `test/annuaire/`, il
 * est écrit par l'agent A4, et ce fichier le **consomme** sans le connaître autrement
 * que par le contrat §25.2 — cinq comportements, huit comptes, une imbrication
 * cyclique.
 *
 * Il n'y a **aucun Active Directory sur cette machine, et il ne faut pas en viser
 * un** : un banc qui éprouve le cas négatif verrouillerait des comptes réels.
 *
 * ── Les cinq comportements, et ce que chacun démontre ────────────────────────
 *
 *  · **D1** liaison du compte de service, puis recherche par filtre substitué ;
 *  · **D2** liaison de l'utilisateur — succès **et** échec, l'échec rendant 49 ;
 *  · **D3** appartenances **imbriquées**, sur trois niveaux et **avec un cycle**.
 *    C'est le seul essai qui distingue une résolution récursive correcte d'une
 *    résolution qui se fige à la première connexion en production ;
 *  · **D4** compte désactivé et retrait de groupe, **modifiés en cours d'essai** ;
 *  · **D5** panne : refus de connexion, réponse lente, réponse tronquée. Aucune des
 *    trois ne doit ouvrir de session, et aucune ne doit faire attendre sans fin.
 *
 * ── Ce que ce fichier n'éprouve pas ─────────────────────────────────────────
 *
 * La traduction « groupes → droits » est ailleurs (`test/droits/trois-axes.test.mjs`) :
 * ici, on s'arrête aux **noms de groupes** que l'annuaire rend. La séparation est
 * volontaire — c'est la frontière du module `src/auth/annuaire.ts`, qui ne consulte
 * aucune table et ne décide d'aucun droit.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { COMPTE_SERVICE, BASE_RECHERCHE } from '../annuaire/comptes.mjs';
import { demarrerAnnuaire } from '../annuaire/serveur-ldap.mjs';
import { moduleCompile } from '../aide/serveur.mjs';

let annuaireModule;
let clientModule;
/** @type {Awaited<ReturnType<typeof demarrerAnnuaire>>} */
let doublure;

before(async () => {
  annuaireModule = await moduleCompile('auth/annuaire.js');
  clientModule = await moduleCompile('auth/client-ldap.js');
  doublure = await demarrerAnnuaire();
});

after(async () => {
  await doublure?.fermer();
});

/** La configuration LDAP telle que `src/config/index.ts` la produit. */
function configuration(surcharge = {}) {
  return {
    url: doublure.url,
    ca: null,
    verifierCertificat: false,
    dnService: COMPTE_SERVICE.dn,
    motDePasseService: COMPTE_SERVICE.motDePasse,
    baseRecherche: BASE_RECHERCHE,
    filtreUtilisateur: '(&(objectClass=user)(sAMAccountName={login}))',
    attributIdentifiant: 'sAMAccountName',
    attributsProfil: [
      'displayName',
      'givenName',
      'sn',
      'mail',
      'telephoneNumber',
      'department',
      'title',
    ],
    prefixeGroupes: 'GRC-',
    groupesImbriques: true,
    delaiMs: 4000,
    ...surcharge,
  };
}

const service = (surcharge = {}) => new annuaireModule.ServiceAnnuaire(configuration(surcharge));

describe('D1 / D2 — la liaison et la vérification des identifiants', () => {
  test('le cas nominal : rssi.tls entre, avec son identité et son groupe', async () => {
    const identite = await service().authentifier('rssi.tls', 'rssi.tls!2026');
    assert.equal(identite.login, 'rssi.tls');
    assert.equal(identite.nomAffichage, 'Sarah Nadal');
    assert.equal(identite.email, 'sarah.nadal@exemple.interne');
    assert.equal(identite.service, 'Sécurité des SI');
    assert.equal(identite.desactive, false);
    assert.deepEqual([...identite.groupes], ['GRC-TLS-RSSI']);
  });

  test('un MOT DE PASSE FAUX est refusé, et refusé comme tel (code 49)', async () => {
    await assert.rejects(
      () => service().authentifier('rssi.tls', 'mauvais'),
      (erreur) => erreur.nomErreur === 'ErreurIdentifiants',
    );
  });

  test('un LOGIN INCONNU est refusé DE LA MÊME FAÇON — aucun oracle d’existence', async () => {
    // Contrôle S12 : distinguer « compte inconnu » de « mot de passe faux » dirait à
    // un attaquant quels logins existent. Les deux rendent la même classe d'erreur.
    await assert.rejects(
      () => service().authentifier('nexiste.pas', 'peu importe'),
      (erreur) => erreur.nomErreur === 'ErreurIdentifiants',
    );
  });

  test('un mot de passe VIDE ne passe pas par une liaison anonyme', async () => {
    // RFC 4513 §5.1.2 : une liaison simple avec mot de passe vide est ANONYME, et
    // elle réussit. Le client doit la refuser avant de l'émettre.
    await assert.rejects(
      () => service().authentifier('rssi.tls', ''),
      (erreur) => erreur.nomErreur === 'ErreurIdentifiants',
    );
  });

  test('INJECTION : un login hostile ne ramène aucun compte', async () => {
    await assert.rejects(
      () => service().authentifier('*)(objectClass=*', 'peu importe'),
      (erreur) => erreur.nomErreur === 'ErreurIdentifiants',
      'Le filtre échappé cherche un compte nommé « *)(objectClass=* » : il n’y en a pas.',
    );
  });

  test('la recherche passe bien par le COMPTE DE SERVICE, pas anonymement', async () => {
    doublure.viderJournal();
    await service().authentifier('contrib.tls', 'contrib.tls!2026');
    const liaisons = doublure.journal.filter((e) => e.operation === 'liaison');
    assert.ok(liaisons.length >= 2, 'Service, puis utilisateur.');
    assert.ok(
      liaisons.some((l) => String(l.dn ?? '').includes('svc-grc')),
      'La première liaison est celle du compte de service (D1).',
    );
  });
});

describe('D3 — les groupes imbriqués, et le cycle qui figerait un résolveur naïf', () => {
  test('une appartenance INDIRECTE ouvre l’accès : dpo remonte jusqu’à GRC-TLS-DPO', async () => {
    const identite = await service().authentifier('dpo', 'dpo!2026');
    assert.ok(
      identite.groupes.includes('GRC-TLS-DPO'),
      'Le compte n’est membre que de GRC-IMBRIQUE-DPO : sans récursion, il n’a aucun accès.',
    );
    assert.ok(identite.groupes.includes('GRC-IMBRIQUE-DPO'), 'Le groupe intermédiaire est vu aussi.');
  });

  test('le CYCLE est traversé sans boucler — la preuve est que l’essai finit', async () => {
    // GRC-IMBRIQUE-DPO est membre de GRC-CERCLE-A, lui-même membre de GRC-CERCLE-B,
    // lui-même membre de GRC-CERCLE-A. Une résolution sans ensemble des visités
    // tourne indéfiniment : cet essai ne rendrait jamais la main.
    const debut = Date.now();
    const identite = await service().authentifier('dpo', 'dpo!2026');
    const duree = Date.now() - debut;

    assert.ok(identite.groupes.includes('GRC-CERCLE-A'));
    assert.ok(identite.groupes.includes('GRC-CERCLE-B'));
    assert.ok(duree < 3000, `Résolution en ${String(duree)} ms — un cycle non coupé ne finirait pas.`);
  });

  test('chaque groupe n’est visité QU’UNE FOIS, et cela se voit dans le journal du serveur', async () => {
    doublure.viderJournal();
    await service().authentifier('dpo', 'dpo!2026');
    const bases = doublure.journal
      .filter((e) => e.operation === 'recherche' && e.portee === 0)
      .map((e) => String(e.base).toLowerCase());
    const distinctes = new Set(bases);
    assert.equal(
      bases.length,
      distinctes.size,
      `Un groupe relu deux fois signale un ensemble des visités inopérant : ${bases.join(', ')}`,
    );
  });

  test('la récursion DÉSACTIVÉE ne rend que l’appartenance directe', async () => {
    // La contre-épreuve de D3 : sans récursion, le même compte perd son accès. C'est
    // ce que la résolution récursive achète, mesuré plutôt qu'affirmé.
    const identite = await service({ groupesImbriques: false }).authentifier('dpo', 'dpo!2026');
    assert.deepEqual([...identite.groupes], ['GRC-IMBRIQUE-DPO']);
    assert.ok(!identite.groupes.includes('GRC-TLS-DPO'));
  });

  test('les groupes hors préfixe ne sont pas rendus, mais ils sont TRAVERSÉS', async () => {
    const identite = await service({ prefixeGroupes: 'GRC-TLS-' }).authentifier('dpo', 'dpo!2026');
    assert.deepEqual([...identite.groupes], ['GRC-TLS-DPO']);
    assert.ok(
      identite.groupesTraverses > identite.groupes.length,
      'Filtrer AVANT de descendre empêcherait d’atteindre le groupe utile.',
    );
  });
});

describe('D4 — le déprovisionnement, modifié en cours d’essai', () => {
  test('un compte DÉSACTIVÉ ne peut plus se connecter, et sa relecture le dit', async () => {
    // Deux chemins, et il faut les deux. L'annuaire simulé refuse la LIAISON d'un
    // compte désactivé (bit ACCOUNTDISABLE), comme le fait un Active Directory : la
    // connexion est donc coupée à la source. Mais le déprovisionnement des sessions
    // EN COURS ne passe pas par une liaison — il relit le compte sous le compte de
    // service —, et c'est là que le bit doit être lu.
    //
    // Le client garde donc les DEUX contrôles : le refus de liaison, et la lecture du
    // bit. Le second n'est pas redondant — tous les annuaires ne refusent pas la
    // liaison d'un compte désactivé, et s'appuyer sur ce refus serait parier sur un
    // comportement qu'aucune norme n'impose.
    doublure.desactiver('qualite.tls');
    try {
      await assert.rejects(
        () => service().authentifier('qualite.tls', 'qualite.tls!2026'),
        (erreur) => erreur.nomErreur === 'ErreurIdentifiants',
        'La liaison d’un compte désactivé est refusée par l’annuaire.',
      );

      const relu = await service().relire('qualite.tls');
      assert.equal(
        relu.desactive,
        true,
        'C’est ce que la revalidation périodique observe pour révoquer les sessions actives.',
      );
    } finally {
      doublure.reactiver('qualite.tls');
    }

    const apres = await service().authentifier('qualite.tls', 'qualite.tls!2026');
    assert.equal(apres.desactive, false);
  });

  test('le RETRAIT d’un groupe se voit à la relecture suivante, sans mot de passe', async () => {
    const avant = await service().relire('rssi.tls');
    assert.deepEqual([...avant.groupes], ['GRC-TLS-RSSI']);

    doublure.retirerDuGroupe('rssi.tls', 'GRC-TLS-RSSI');
    try {
      const apres = await service().relire('rssi.tls');
      assert.deepEqual(
        [...apres.groupes],
        [],
        'C’est ce que le déprovisionnement immédiat du PLAN_SERVEUR §1.5 observe.',
      );
    } finally {
      doublure.remettreDansGroupe('rssi.tls', 'GRC-TLS-RSSI');
    }

    const retabli = await service().relire('rssi.tls');
    assert.deepEqual([...retabli.groupes], ['GRC-TLS-RSSI']);
  });

  test('relire un compte ABSENT rend null, et ne lève pas', async () => {
    assert.equal(await service().relire('parti.ailleurs'), null);
  });
});

describe('D5 — la panne : aucune de ces trois issues n’ouvre de session', () => {
  test('connexion REFUSÉE → erreur d’annuaire, pas erreur d’identifiants', async () => {
    // La distinction décide du verrouillage : un 503 ne doit verrouiller personne
    // (CONVENTIONS.md §26.2). Confondre les deux transformerait une panne de
    // contrôleur de domaine en blocage de tous les comptes du groupe.
    doublure.definirPanne({ refuserConnexions: true });
    try {
      await assert.rejects(
        () => service().authentifier('rssi.tls', 'rssi.tls!2026'),
        (erreur) => erreur.nomErreur === 'ErreurAnnuaire',
      );
    } finally {
      doublure.definirPanne({ refuserConnexions: false });
    }
  });

  test('réponse LENTE au-delà du délai → refus borné dans le temps', async () => {
    doublure.definirPanne({ delaiReponseMs: 1500 });
    try {
      const debut = Date.now();
      await assert.rejects(
        () => service({ delaiMs: 300 }).authentifier('rssi.tls', 'rssi.tls!2026'),
        (erreur) => erreur.nomErreur === 'ErreurAnnuaire',
      );
      const duree = Date.now() - debut;
      assert.ok(
        duree < 1400,
        `Refus en ${String(duree)} ms : le délai de garde doit couper AVANT la réponse lente.`,
      );
    } finally {
      doublure.definirPanne({ delaiReponseMs: 0 });
    }
  });

  test('réponse TRONQUÉE → refus, jamais un résultat partiel', async () => {
    // Le piège que D5 tend : un client qui décoderait « au mieux » ouvrirait une
    // session sur une réponse mutilée, donc sur un ensemble de groupes incomplet.
    doublure.definirPanne({ tronquer: true });
    try {
      await assert.rejects(
        () => service().authentifier('rssi.tls', 'rssi.tls!2026'),
        (erreur) => erreur.nomErreur === 'ErreurAnnuaire',
      );
    } finally {
      doublure.definirPanne({ tronquer: false });
    }
  });

  test('après la panne, le service refonctionne — la panne n’est pas un état absorbant', async () => {
    const identite = await service().authentifier('rssi.tls', 'rssi.tls!2026');
    assert.equal(identite.login, 'rssi.tls');
  });
});

describe('Les huit comptes du contrat §25.3 sont tous joignables', () => {
  const attendus = [
    ['rssi.tls', 'rssi.tls!2026', ['GRC-TLS-RSSI']],
    ['contrib.tls', 'contrib.tls!2026', ['GRC-TLS-CONTRIB']],
    ['qualite.tls', 'qualite.tls!2026', ['GRC-TLS-QUALITE']],
    ['direction', 'direction!2026', ['GRC-GROUPE-DIRECTION']],
    ['rssi.groupe', 'rssi.groupe!2026', ['GRC-EXPORT', 'GRC-GROUPE-RSSI']],
    ['admin', 'admin!2026', ['GRC-ADMIN']],
  ];

  for (const [login, motDePasse, groupes] of attendus) {
    test(`${login} : ${groupes.join(', ')}`, async () => {
      const identite = await service().authentifier(login, motDePasse);
      assert.deepEqual([...identite.groupes].sort(), [...groupes].sort());
    });
  }

  test('sans.groupe : identifiants VALIDES, et aucun groupe — le cas négatif', async () => {
    // §25.3 : « un banc qui n'éprouve que des comptes autorisés ne démontre pas une
    // autorisation, il démontre qu'un chemin existe. »
    const identite = await service().authentifier('sans.groupe', 'sans.groupe!2026');
    assert.equal(identite.login, 'sans.groupe');
    assert.deepEqual([...identite.groupes], []);
  });
});

describe('Les bornes du client — un annuaire est un tiers', () => {
  test('le code de résultat « identifiants invalides » est bien 49', () => {
    assert.equal(clientModule.RESULTAT.identifiantsInvalides, 49);
  });

  test('un DN ambigu — deux comptes pour un login — est refusé, pas arbitré', async () => {
    // Choisir « le premier » ferait dépendre l'identité de l'ordre de parcours de
    // l'annuaire. Le filtre est ici volontairement élargi pour provoquer le cas.
    await assert.rejects(
      () => service({ filtreUtilisateur: '(objectClass=user)' }).authentifier('rssi.tls', 'x'),
      (erreur) => erreur.nomErreur === 'ErreurAnnuaire' && /ambiguïté/.test(erreur.detailJournal),
    );
  });
});

describe('LDAPS — la réserve du §25.4, levée plutôt que portée au registre', () => {
  /**
   * Le contrat §25.4 le dit explicitement : « si le banc éprouve le client sur du
   * LDAP en clair, alors la vérification du certificat n'est éprouvée par rien, et
   * c'est une réserve à porter au registre ». Tous les essais ci-dessus tournent en
   * clair sur la boucle locale ; ceux-ci montent un annuaire **LDAPS** avec un
   * certificat auto-signé engendré par la doublure, et éprouvent la vérification
   * **dans les deux sens** : ancré, elle passe ; non ancré, elle refuse.
   *
   * Ce que cela ne prouve pas, et qui reste écrit au rapport : rien ici ne remplace
   * une chaîne de certification réelle (PKI interne du client, §0.3).
   */
  let annuaireTls;
  let repertoire;
  let cheminCa;

  before(async () => {
    annuaireTls = await demarrerAnnuaire({ tls: true });
    repertoire = mkdtempSync(join(tmpdir(), 'grc-ca-a1-'));
    cheminCa = join(repertoire, 'annuaire.crt');
    writeFileSync(cheminCa, annuaireTls.certificat);
  });

  after(async () => {
    await annuaireTls?.fermer();
    if (repertoire !== undefined) rmSync(repertoire, { recursive: true, force: true });
  });

  const serviceTls = (surcharge) =>
    new annuaireModule.ServiceAnnuaire({
      ...configuration(),
      url: annuaireTls.url,
      verifierCertificat: true,
      ca: cheminCa,
      ...surcharge,
    });

  test('l’URL est bien du LDAPS, pas du LDAP en clair', () => {
    assert.match(annuaireTls.url, /^ldaps:\/\//);
  });

  test('avec l’autorité ANCRÉE, la connexion chiffrée aboutit', async () => {
    const identite = await serviceTls().authentifier('rssi.tls', 'rssi.tls!2026');
    assert.equal(identite.login, 'rssi.tls');
    assert.deepEqual([...identite.groupes], ['GRC-TLS-RSSI']);
  });

  test('SANS l’autorité, la vérification du certificat REFUSE la connexion', async () => {
    // Le sens qui compte : un certificat auto-signé non ancré doit faire échouer la
    // liaison, pas passer avec un avertissement. Sans cet essai, « LDAPS » ne
    // vaudrait que pour le chiffrement, et pas pour l’authentification du serveur —
    // c’est-à-dire pas contre un annuaire interposé.
    await assert.rejects(
      () => serviceTls({ ca: null }).authentifier('rssi.tls', 'rssi.tls!2026'),
      (erreur) => erreur.nomErreur === 'ErreurAnnuaire',
    );
  });

  test('vérification DÉSACTIVÉE : la connexion passe — ce que la production interdit', async () => {
    // La contre-épreuve, et elle explique pourquoi `src/config/index.ts` refuse
    // `LDAP_VERIFIER_CERTIFICAT=non` en production : le chiffrement seul ne protège
    // que de l’écoute passive.
    const identite = await serviceTls({ ca: null, verifierCertificat: false }).authentifier(
      'rssi.tls',
      'rssi.tls!2026',
    );
    assert.equal(identite.login, 'rssi.tls');
  });
});
