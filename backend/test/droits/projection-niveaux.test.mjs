/**
 * projection-niveaux.test.mjs — le niveau PAR DOMAINE, et le sur-octroi qu'il ferme.
 *
 * ── Le constat que ce fichier existe pour tenir fermé : Q-66 ────────────────
 *
 * `DroitsSession` porte deux niveaux : `niveau`, un seul pour toute la session, et
 * `niveaux`, un par domaine de décision. Le second est **facultatif**, et c'est là que
 * le défaut a vécu deux tours : `src/api/droits.ts` le lisait correctement
 * (`droits.niveaux?.[domaine] ?? droits.niveau`), et `projeterDroits()` ne l'émettait
 * **jamais**. Un champ facultatif que personne ne renseigne se comporte exactement
 * comme un champ absent — en silence, et le banc restait vert.
 *
 * Conséquence, mesurée le 03/09/2026 contre un Active Directory réel : `qualite.tls`
 * obtenait `niveau = contribution` sur **douze** domaines de décision, alors que
 * `session_domaines` ne lui accorde la contribution que sur trois d'entre eux et la
 * **lecture seule** sur la conformité.
 *
 * ── Ce que ce fichier éprouve, et dans quel ordre ───────────────────────────
 *
 *  1. le cas nommé par le constat — *Qualité* écrit sur `audits`, lit `conformite` ;
 *  2. les trois **propriétés** de la projection, jouées sur les huit profils de socle :
 *     `niveaux` ne dépasse jamais `niveau`, il nomme exactement les domaines ouverts,
 *     et un domaine fermé à « aucun » n'entre nulle part ;
 *  3. la **décision** elle-même : `deciderAcces` refuse et accepte au bon endroit,
 *     dans la même session — c'est le critère d'acceptation du lot.
 *
 * ⚠️ Les droits ne sont pas fabriqués à la main : ils sont **résolus depuis les noms de
 * groupes AD**, par le même chemin que la connexion, contre une vraie base. Un essai
 * qui construirait `{ niveau, domaines, niveaux }` à la main éprouverait sa propre
 * rédaction et non le produit — c'est le défaut du constat Q-61.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let applicatif;
let droits;
let passerelle;
let apiDroits;

const TLS = 'FIL-PN-TLS';
const DEU = 'FIL-PN-DEU';

/** Rang des niveaux, pour la comparaison « ne dépasse jamais ». */
const RANG = { aucun: 0, lecture: 1, contribution: 2, validation: 3, administration: 4 };

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  droits = await moduleCompile('droits/index.js');
  passerelle = await moduleCompile('droits/passerelle-api.js');
  apiDroits = await moduleCompile('api/droits.js');

  await base.avecPerimetre(
    applicatif,
    perimetre('decor', null, [], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays) values
             ($1, 'ZZPNT', 'Essai Projection Toulouse', 'FR'),
             ($2, 'ZZPND', 'Essai Projection Allemagne', 'DE')`,
        [TLS, DEU],
      );
      const attendus = droits.groupesAttendus(
        'GRC-',
        await droits.lireFilialesActives(c),
        await droits.lireProfilsActifs(c),
      );
      await droits.synchroniserGroupesAd(c, attendus);
    },
    { annuler: false },
  );
});

after(async () => {
  await base?.fermer();
});

/** Résout des groupes puis PROJETTE, exactement comme la connexion le fait. */
async function projeter(groupes) {
  const resolus = await base.avecPerimetre(applicatif, perimetre('resolution', null, []), async (c) =>
    droits.resoudreDroits(c, groupes),
  );
  // `projeterDroits` consomme un `EtatSession` ; seuls `domaines` et `peutExporter`
  // l'intéressent. On lui donne l'état tel que `ouvrirSession` le construirait.
  return {
    resolus,
    projetes: passerelle.projeterDroits({
      sessionId: 'SESS-essai',
      login: 'essai',
      utilisateurId: 'UTI-essai',
      portee: resolus.portee,
      filiales: resolus.filiales,
      filialeActive: resolus.filialeActive,
      filiale: null,
      administrateur: resolus.administrateur,
      peutExporter: resolus.peutExporter,
      domaines: resolus.domaines,
      expireLe: new Date(),
      derniereActivite: new Date(),
      compteSecours: false,
    }),
  };
}

/** Les huit profils de socle, sous la forme d'un groupe AD de la filiale d'essai. */
const PROFILS = ['RSSI', 'CONTRIB', 'QUALITE', 'RH', 'DPO', 'DIRECTION', 'AUDITEUR'];

describe('Q-66 — le profil Qualité ne contribue plus à la conformité', () => {
  test('la base lui accorde la LECTURE sur exigences, référentiels et mesures', async () => {
    // Le point de départ du constat : ce que la base dit, et que la projection perdait.
    const { resolus } = await projeter(['GRC-ZZPNT-QUALITE']);
    assert.equal(resolus.domaines.get('exigences'), 'lecture');
    assert.equal(resolus.domaines.get('referentiels'), 'lecture');
    assert.equal(resolus.domaines.get('mesures'), 'lecture');
    assert.equal(resolus.domaines.get('audits'), 'contribution');
    assert.equal(resolus.domaines.get('revues'), 'contribution');
  });

  test('`niveaux` porte « lecture » sur conformite et « contribution » sur audits', async () => {
    const { projetes } = await projeter(['GRC-ZZPNT-QUALITE']);

    assert.notEqual(
      projetes.niveaux,
      undefined,
      'Le producteur doit ÉMETTRE `niveaux`. C’est très exactement ce qui manquait : le ' +
        'consommateur était juste, et il ne recevait rien.',
    );
    assert.equal(projetes.niveaux.conformite, 'lecture');
    assert.equal(projetes.niveaux.audits, 'contribution');
    assert.equal(projetes.niveaux.documents, 'contribution');
    assert.equal(projetes.niveaux.pilotage, 'lecture');

    // Et le niveau global reste le plus élevé — c'est lui qui servait à tout, et
    // c'est de là que venait le sur-octroi.
    assert.equal(projetes.niveau, 'contribution');
  });

  test('les trois domaines de conformité fusionnent SANS gagner un niveau', async () => {
    // `exigences`, `referentiels`, `mesures` et `correspondances` tombent tous sur
    // `conformite` : la fusion prend le plus haut des NIVEAUX TENUS, jamais le niveau
    // de la session. Trois « lecture » ne font pas une « contribution ».
    const { projetes } = await projeter(['GRC-ZZPNT-QUALITE']);
    assert.equal(projetes.niveaux.conformite, 'lecture');
  });

  test('« cartographie » fermée à « aucun » n’entre NI dans domaines NI dans niveaux', async () => {
    // La fermeture explicite du profil Qualité (`007_authentification.sql`) doit rester
    // lisible de bout en bout : un domaine à « aucun » ne se projette pas.
    const { projetes } = await projeter(['GRC-ZZPNT-QUALITE']);
    assert.equal(projetes.domaines.includes('actifs'), false, 'la cartographie est fermée');
    assert.equal(projetes.niveaux.actifs, undefined);
  });
});

describe('Q-66 — la DÉCISION, qui est le critère d’acceptation du lot', () => {
  test('même session : écriture ACCEPTÉE sur audits, REFUSÉE sur conformite', async () => {
    const { projetes } = await projeter(['GRC-ZZPNT-QUALITE']);

    assert.equal(
      apiDroits.deciderAcces(projetes, 'ecrire', 'audits'),
      null,
      'Le profil Qualité contribue aux audits : le refuser serait un sous-octroi, ' +
        'c’est-à-dire le défaut symétrique — et celui-là ne se mesure pas, il se ' +
        'contourne par une demande de droits que personne ne comprend.',
    );

    const refus = apiDroits.deciderAcces(projetes, 'ecrire', 'conformite');
    assert.notEqual(
      refus,
      null,
      'Le profil Qualité vient d’ÉCRIRE sur « conformite », que la base lui donne en ' +
        'lecture seule. C’est le constat Q-66, et c’est un bloquant.',
    );
    assert.match(refus.detailJournal, /niveau insuffisant : « lecture » sur conformite/);
  });

  test('la LECTURE de la conformité reste ouverte — le correctif restreint, il ne ferme pas', async () => {
    const { projetes } = await projeter(['GRC-ZZPNT-QUALITE']);
    assert.equal(apiDroits.deciderAcces(projetes, 'lire', 'conformite'), null);
  });

  test('un profil qui contribue partout n’est pas gêné (contre-épreuve RSSI)', async () => {
    const { projetes } = await projeter(['GRC-ZZPNT-RSSI']);
    for (const domaine of projetes.domaines) {
      if (domaine === 'administration') continue; // le RSSI ne le porte pas
      assert.equal(
        apiDroits.deciderAcces(projetes, 'ecrire', domaine),
        null,
        `Le RSSI (validation partout) doit pouvoir écrire sur « ${domaine} ».`,
      );
    }
  });
});

describe('Q-66 — les trois propriétés de la projection, sur les huit profils de socle', () => {
  test('propriété 1 : `niveaux[d]` ne dépasse JAMAIS `niveau`', async () => {
    // La propriété qui empêche le correctif d'être lui-même un sur-octroi. Elle est
    // vraie par construction — un maximum sur un sous-ensemble — et jouée quand même :
    // c'est une construction qui peut changer, et personne ne relit une preuve.
    for (const profil of PROFILS) {
      const { projetes } = await projeter([`GRC-ZZPNT-${profil}`]);
      for (const [domaine, valeur] of Object.entries(projetes.niveaux)) {
        assert.ok(
          RANG[valeur] <= RANG[projetes.niveau],
          `${profil} : niveaux.${domaine} = « ${valeur} » DÉPASSE le niveau de session ` +
            `« ${projetes.niveau} ». Un niveau par domaine RESTREINT ; s'il peut élargir, ` +
            'le correctif du sur-octroi est un sur-octroi.',
        );
      }
    }
  });

  test('propriété 1 bis : le profil ADMIN, seul à porter « administration »', async () => {
    const { projetes } = await projeter(['GRC-ADMIN']);
    assert.equal(projetes.niveau, 'administration');
    assert.equal(projetes.niveaux.administration, 'administration');
    assert.equal(apiDroits.deciderAcces(projetes, 'administrer', 'administration'), null);

    // Et la contre-épreuve, qui est celle du §20.2 : aucun autre profil ne l'obtient.
    for (const profil of PROFILS) {
      const autre = (await projeter([`GRC-ZZPNT-${profil}`])).projetes;
      assert.notEqual(
        autre.niveau,
        'administration',
        `${profil} ne doit pas atteindre le niveau « administration » par la projection.`,
      );
    }
  });

  test('propriété 2 : `niveaux` nomme EXACTEMENT les domaines ouverts', async () => {
    // Un domaine ouvert mais absent de `niveaux` retomberait sur `niveau` — c'est-à-dire
    // sur le défaut que ce champ existe pour fermer. L'égalité est vérifiée des deux
    // côtés : un `niveaux` plus riche que `domaines` accorderait un niveau sur un
    // domaine que `deciderAcces` refuse ensuite, ce qui est incohérent sans être
    // dangereux — et l'incohérence est exactement ce qui finit par être « simplifiée ».
    for (const profil of [...PROFILS, 'ADMIN']) {
      const groupe = profil === 'ADMIN' ? 'GRC-ADMIN' : `GRC-ZZPNT-${profil}`;
      const { projetes } = await projeter([groupe]);
      assert.deepEqual(
        Object.keys(projetes.niveaux).sort(),
        [...projetes.domaines].sort(),
        `${profil} : « domaines » et les clés de « niveaux » doivent être le même ensemble.`,
      );
    }
  });

  test('propriété 3 : une session SANS aucun domaine rend une table vide, pas absente', async () => {
    // `sans.groupe` du contrat §25.3 : identifiants valides, aucun accès. La projection
    // doit rendre un objet vide et non `undefined` — sinon le consommateur retomberait
    // sur `niveau`, qui vaut « lecture » par défaut.
    const { projetes } = await projeter(['CN=Domain Users,DC=exemple,DC=interne']);
    assert.deepEqual(projetes.domaines, []);
    assert.deepEqual(projetes.niveaux, {});
    assert.equal(projetes.niveau, 'lecture');
    // Et rien ne passe, parce que le domaine est refusé.
    assert.notEqual(apiDroits.deciderAcces(projetes, 'lire', 'conformite'), null);
  });

  test('propriété 3 bis : « imports » n’ouvre aucun domaine de décision, ni son niveau', async () => {
    // Le domaine de base « imports » se projette sur `null` : il ne doit apparaître ni
    // dans `domaines` ni dans `niveaux`. Il compte en revanche pour `niveau`, ce qui est
    // voulu — c'est un droit réel, simplement sans domaine de décision.
    const { resolus, projetes } = await projeter(['GRC-ZZPNT-RSSI']);
    assert.notEqual(resolus.domaines.get('imports'), undefined, 'le RSSI porte « imports »');
    assert.equal(projetes.niveaux.imports, undefined);
    assert.equal(projetes.domaines.includes('imports'), false);
  });
});
