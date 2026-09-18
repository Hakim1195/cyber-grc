/**
 * registre-dora.test.mjs — **LE REGISTRE D'INFORMATION ET LE SCORE COMPOSITE,
 * PAR LA ROUTE** (lot L21, actions 21.1, 21.3 et 21.4)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure, et pourquoi chaque point y est
 * ════════════════════════════════════════════════════════════════════════
 *
 * `test/base/tiers-anticycle.test.mjs` mesure la BASE — l'anti-cycle mord, le
 * rang se dérive. Ce fichier-ci mesure **ce que l'utilisateur reçoit**, et les
 * deux sont nécessaires : le constat **Q-325** est né d'un refus soigné en base
 * qui arrivait à l'écran en `500` avec sa pile d'appel.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Le barème est SERVI — l'écran n'a pas à recopier les poids |
 * | 2 | Le score est dérivé, et « non évalué » n'est PAS « faible » |
 * | 3 | Une couverture INCONNUE ne protège pas ; une couverture NULLE non plus |
 * | 4 | Le registre DORA **dit ses propres manques** |
 * | 5 | ⚠️ Le registre exige le droit d'EXPORT, la simple lecture ne suffit pas |
 * | 6 | La chaîne rend le CHEMIN, pas seulement un rang à croire |
 * | 7 | Cloisonnement : la chaîne d'un tiers voisin est « introuvable », pas « interdite » |
 *
 * ── ⚠️ LE §5 EST LE PLUS IMPORTANT, ET IL EST LE MOINS ÉVIDENT ─────────────
 *
 * Un registre d'information complet est **la carte des dépendances critiques du
 * groupe** : qui héberge quoi, dans quel pays, sous quel contrat, et qui
 * travaille derrière. Le `PLAN_SERVEUR` §3.3 range ce genre d'extraction parmi
 * les permissions distinctes, et le contrôle **S7** vérifie qu'aucune route ne
 * rend le jeu complet sans le droit d'export.
 *
 * La pente naturelle était de la déclarer « lire », comme les trois autres
 * routes de ce greffon. Elle est refusée : *le droit d'export ne peut pas
 * dépendre du FORMAT dans lequel on demande la même chose* (`CONVENTIONS.md`
 * §29.8, issu du constat Q-330).
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let applicatif;
/** Une session qui LIT les tiers, et qui n'exporte pas. */
let lecteur;
/** La même, plus le droit d'export. */
let exportateur;

/** Périmètre au format de l'API — `utilisateurId`, pas `utilisateur` (REPRISE §5.7). */
function perimetreApi(filialeId, filiales) {
  return {
    utilisateurId: 'USER-A',
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe: false,
  };
}

/**
 * Une session dont on CHOISIT les droits — le même dispositif que
 * `test/api/droits-application.test.mjs`.
 *
 * ⚠️ **Sans elle, ce fichier ne mesurerait rien du §5.** `monterGreffon` seul
 * retombe sur `DROITS_PROVISOIRES_DEVELOPPEMENT`, qui porte `export: true` : la
 * première rédaction de cet essai passait donc un périmètre avec
 * `export: false`, le serveur l'ignorait, et le registre sortait en **200**.
 * *Un essai qui croit régler un droit qu'il ne règle pas est un essai qui
 * consacre le défaut qu'il cherche.*
 *
 * Le contrat est respecté à la lettre : `resoudre()` ne prend aucun argument et
 * `authentifier()` ne lit rien de la requête.
 */
class SessionDeBanc {
  constructor(perimetre, droits) {
    this.provisoire = true;
    this._perimetre = Object.freeze({ ...perimetre });
    this._droits = Object.freeze({ ...droits });
  }

  async resoudre() {
    return this._perimetre;
  }

  async authentifier() {
    return {
      perimetre: this._perimetre,
      droits: this._droits,
      identite: null,
      sessionOuverte: false,
    };
  }

  decrire() {
    return 'session du banc d’essai (test/tiers/registre-dora.test.mjs)';
  }
}

const TOUS_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel', 'administration',
]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  const perimetre_ = perimetreApi(FILIALE_A, [FILIALE_A]);
  const sansExport = new SessionDeBanc(perimetre_, {
    niveau: 'validation',
    domaines: TOUS_DOMAINES,
    export: false,
  });
  const avecExport = new SessionDeBanc(perimetre_, {
    niveau: 'validation',
    domaines: TOUS_DOMAINES,
    export: true,
  });
  lecteur = await monterGreffon(base, perimetre_, { resolveur: sansExport });
  exportateur = await monterGreffon(base, perimetre_, { resolveur: avecExport });

  // ── Le jeu de ce fichier : trois tiers et une chaîne à deux maillons ────
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A]),
    async (c) => {
      await c.query(
        `insert into prestataires
             (id, filiale_id, societe, criticite, acces, supply_chain,
              lei, pays, pays_donnees, fonction_supportee, fonction_critique,
              type_service, contrat_reference, contrat_debut, contrat_fin,
              substituabilite, plan_sortie, plan_sortie_le, evalue_le)
         values
             ('T-COMPLET', $1, 'Hébergeur Complet', 'vitale', 'etendu',
              '{"clause":true,"notif":true,"audit":true,"donnees":true,
                "reversibilite":true,"continuite":true}'::jsonb,
              '969500HX7PZQ1L2M3N45', 'FR', 'IE', 'Hébergement de l''ERP', true,
              'cloud_iaas', 'CTR-2024-018', date '2024-01-01', date '2027-12-31',
              'difficile', 'Bascule vers le socle interne.', date '2026-06-30',
              current_date),
             ('T-LACUNAIRE', $1, 'Infogérance Lacunaire', 'forte', 'limite',
              '{}'::jsonb, null, null, null, null, true,
              null, null, null, null, null, null, null, null),
             ('T-NEUF', $1, 'Tiers Jamais Évalué', null, null, '{}'::jsonb,
              null, null, null, null, false,
              null, null, null, null, null, null, null, null)`,
        [FILIALE_A],
      );
      await c.query(
        `insert into prestataire_sous_traitance
             (id, filiale_id, prestataire_id, sous_traitant_id, service, dans_fonction_critique)
         values ('ST-1', $1, 'T-COMPLET', 'T-LACUNAIRE', 'Sauvegarde des volumes', true),
                ('ST-2', $1, 'T-LACUNAIRE', 'T-NEUF', 'Transport des bandes', false)`,
        [FILIALE_A],
      );
    },
    { annuler: false },
  );
});

after(async () => {
  await lecteur?.fermer();
  await exportateur?.fermer();
  await base?.fermer();
});

/** L'état des tiers, indexé par identifiant. */
async function etat(session = lecteur) {
  const reponse = await session.appeler('GET', '/api/tiers/etat');
  assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
  return new Map(reponse.corps.tiers.map((t) => [t.id, t]));
}

describe('§1 — le barème est SERVI, pour que l’écran ne le recopie pas', () => {
  test('les poids et les six exigences de chaîne viennent du serveur', async () => {
    const { statut, corps } = await lecteur.appeler('GET', '/api/tiers/bareme');
    assert.equal(statut, 200);

    // ⚠️ La duplication que cette route ferme : `js/modules/pra_prestataires.js`
    // portait `CRIT_W` et `ACCES_W` — les mêmes poids, écrits une seconde fois.
    // À deux facteurs c'était visible ; à quatre, dont deux que le navigateur ne
    // connaît pas, cela divergerait sans que personne le voie.
    assert.equal(corps.bareme.criticite.vitale, 4);
    assert.equal(corps.bareme.acces.etendu, 3);
    assert.equal(corps.bareme.substituabilite.impossible, 2);
    assert.ok(corps.bareme.evaluation.froid_jours > corps.bareme.evaluation.tiede_jours);
    assert.deepEqual(corps.exigencesChaine, [
      'clause',
      'notif',
      'audit',
      'donnees',
      'reversibilite',
      'continuite',
    ]);
  });
});

describe('§2 — le score est dérivé, et « non évalué » n’est pas « faible »', () => {
  test('un tiers vital, irremplaçable et mal couvert sort en tête', async () => {
    const tiers = await etat();
    const complet = tiers.get('T-COMPLET');
    const lacunaire = tiers.get('T-LACUNAIRE');

    assert.ok(complet.score !== null, 'un tiers renseigné doit porter un score');
    assert.ok(lacunaire.score !== null);

    // ⚠️ **Ce qu'on mesure ici est que le score est COMPOSITE**, et non qu'un
    // tiers passe devant un autre — un classement dépend des données, une
    // composition dépend du code.
    //
    // « vitale × etendu » vaut 12 en criticité × accès seuls. Le tiers complet
    // est irremplaçable (+1) et intégralement couvert (−2), évalué ce jour (+0) :
    // son score doit donc valoir 11, et surtout PAS 12. Si les trois facteurs
    // ajoutés par l'action 21.4 cessaient d'agir, ce nombre reviendrait à 12 —
    // c'est-à-dire que le lot serait livré sans effet, vert.
    assert.equal(complet.score, 11, 'la couverture et la substituabilité doivent agir');

    // « forte × limite » vaut 6. Le lacunaire n'est jamais évalué (+2), sa
    // couverture est INCONNUE (−0, ne pas savoir ne protège pas) : 8, pas 6.
    assert.equal(lacunaire.score, 8, 'l’ancienneté de l’évaluation doit agir');
  });

  test('⚠️ un tiers SANS criticité rend « non_evalue » et un score NUL — jamais zéro', async () => {
    const tiers = await etat();
    const neuf = tiers.get('T-NEUF');

    assert.equal(neuf.score, null, '« je ne sais pas » ne se chiffre pas');
    assert.equal(neuf.niveau, 'non_evalue');
    // ⚠️ C'est la règle de `/api/consolidation` — « null, jamais zéro » —
    // appliquée à un score. Rendre 0 ferait passer l'ignorance pour de la
    // sécurité, et l'écran trierait ce tiers parmi les plus sûrs.
    assert.notEqual(neuf.niveau, 'faible');
  });
});

describe('§3 — une couverture INCONNUE ne protège pas', () => {
  test('le sac « supply_chain » vide rend une couverture nulle, pas zéro', async () => {
    const tiers = await etat();
    assert.equal(tiers.get('T-LACUNAIRE').couverture, null);
    assert.equal(tiers.get('T-COMPLET').couverture, 1);
  });

  test('⚠️ LA MUTATION : cocher les six exigences DOIT faire baisser le score', async () => {
    // Un essai qui ne fait jamais DÉCIDER la règle ne la couvre pas (Q-210). On
    // coche les six cases du tiers lacunaire et l'on vérifie que son score baisse
    // réellement — sans quoi la route pourrait ignorer la couverture sans que rien
    // ne rougisse, et l'écran demanderait un travail sans effet.
    const avant = (await etat()).get('T-LACUNAIRE').score;

    await base.avecPerimetre(
      applicatif,
      perimetre('semeur', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(
          `update prestataires
              set supply_chain = '{"clause":true,"notif":true,"audit":true,
                                   "donnees":true,"reversibilite":true,"continuite":true}'::jsonb
            where id = 'T-LACUNAIRE'`,
        );
      },
      { annuler: false },
    );

    const apres = (await etat()).get('T-LACUNAIRE').score;
    assert.ok(apres < avant, `la couverture doit retrancher (avant ${avant}, après ${apres})`);
  });
});

describe('§4 — le registre DORA dit ses propres manques', () => {
  test('chaque ligne nomme ce qui lui manque POUR LA REMISE', async () => {
    const { statut, corps } = await exportateur.appeler('GET', '/api/tiers/registre-dora');
    assert.equal(statut, 200, JSON.stringify(corps));

    const parId = new Map(corps.registre.map((l) => [l.id, l]));
    assert.deepEqual(parId.get('T-COMPLET').manques, [], 'un tiers complet ne manque de rien');

    const manques = parId.get('T-LACUNAIRE').manques;
    assert.ok(manques.includes('identifiant LEI'));
    assert.ok(manques.includes('pays du prestataire'));
    // ⚠️ La substituabilité et le plan de sortie ne sont réclamés QUE pour une
    // fonction critique (article 28 §8). Le tiers lacunaire en porte une.
    assert.ok(manques.some((m) => m.startsWith('substituabilité')));
    assert.ok(manques.some((m) => m.startsWith('plan de sortie daté')));

    // ⚠️ Et le tiers NON critique ne reçoit PAS ces deux reproches : réclamer
    // partout ferait cent quatre-vingts alertes sans objet sur deux cents, et la
    // première chose qu'on fait d'une alerte sans objet est de cesser de la lire.
    const neuf = parId.get('T-NEUF').manques;
    assert.ok(!neuf.some((m) => m.startsWith('substituabilité')));
    assert.ok(!neuf.some((m) => m.startsWith('plan de sortie daté')));

    // ⚠️ On ne compte PAS les lignes incomplètes en valeur absolue : le semis
    // partagé du banc (`semerJeuEssai`) apporte deux tiers de plus, et un essai
    // qui compterait tout rougirait au premier enrichissement du semis — pour
    // une raison étrangère à son sujet. On affirme la PROPRIÉTÉ : la seule ligne
    // sans manque est celle qu'on a renseignée entièrement.
    assert.equal(
      corps.lignesIncompletes,
      corps.registre.length - 1,
      'toutes les lignes sauf « T-COMPLET » doivent porter des manques',
    );
    assert.equal(corps.fonctionsCritiques, 2);
    // Le produit PRÉPARE, l'humain dépose : c'est dit, pas laissé à deviner.
    assert.match(corps.avertissement, /geste humain/);
  });

  test('la chaîne de sous-traitance voyage avec la ligne du registre', async () => {
    const { corps } = await exportateur.appeler('GET', '/api/tiers/registre-dora');
    const complet = corps.registre.find((l) => l.id === 'T-COMPLET');
    assert.equal(complet.sousTraitants.length, 1);
    assert.equal(complet.sousTraitants[0].id, 'T-LACUNAIRE');
    assert.equal(complet.sousTraitants[0].dansFonctionCritique, true);
  });
});

describe('§5 — ⚠️ le registre exige le droit d’EXPORT', () => {
  test('une session qui LIT les tiers ne peut pas extraire le registre', async () => {
    const reponse = await lecteur.appeler('GET', '/api/tiers/registre-dora');

    // 403 et non 404 : la route existe, et le refus porte sur la PERMISSION.
    // ⚠️ Le motif tient en une phrase, et il vaut d'être relu : un registre
    // d'information complet est la carte des dépendances critiques du groupe,
    // classée par criticité — c'est-à-dire l'indication de par où commencer.
    assert.equal(reponse.statut, 403, JSON.stringify(reponse.corps));
  });

  test('et les trois autres routes, elles, se lisent sans ce droit', async () => {
    // La nuance est le sujet : on ne verrouille pas l'écran de travail, on
    // verrouille l'EXTRACTION. Confondre les deux rendrait le lot inutilisable
    // pour qui saisit, et c'est ce qui pousse à donner le droit d'export à tout
    // le monde — c'est-à-dire à le vider de son sens.
    for (const url of ['/api/tiers/bareme', '/api/tiers/etat', '/api/tiers/chaine/T-COMPLET']) {
      const reponse = await lecteur.appeler('GET', url);
      assert.equal(reponse.statut, 200, `${url} doit rester lisible : ${JSON.stringify(reponse.corps)}`);
    }
  });
});

describe('§6 — la chaîne rend le CHEMIN, pas un rang à croire', () => {
  test('les deux maillons portent leur rang ET le chemin qui le justifie', async () => {
    const { statut, corps } = await lecteur.appeler('GET', '/api/tiers/chaine/T-COMPLET');
    assert.equal(statut, 200);

    const parId = new Map(corps.maillons.map((m) => [m.id, m]));
    assert.equal(parId.get('T-LACUNAIRE').rang, 1);
    assert.equal(parId.get('T-NEUF').rang, 2);

    // ⚠️ Le chemin est ce qui rend le rang VÉRIFIABLE par un auditeur. Sans lui,
    // « rang 2 » est un nombre qu'il faut croire sur parole, sur la pièce même
    // dont l'objet est de ne rien devoir croire sur parole.
    assert.deepEqual(parId.get('T-NEUF').chemin, ['T-COMPLET', 'T-LACUNAIRE', 'T-NEUF']);
    assert.equal(parId.get('T-LACUNAIRE').service, 'Sauvegarde des volumes');
  });

  test('un tiers sans sous-traitant DIT pourquoi sa chaîne est vide', async () => {
    const { corps } = await lecteur.appeler('GET', '/api/tiers/chaine/T-NEUF');
    assert.deepEqual(corps.maillons, []);
    // Un vide sans explication apprend à ne plus croire ce qu'on montre
    // (classe des constats Q-201 / Q-207).
    assert.match(corps.motif, /article 29/);
  });
});

describe('§7 — cloisonnement : « introuvable », jamais « interdit »', () => {
  test('la chaîne d’un tiers de la filiale voisine rend 404, et rien d’autre', async () => {
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur', FILIALE_B, [FILIALE_B]),
      async (c) => {
        await c.query(
          `insert into prestataires (id, filiale_id, societe) values ('T-VOISIN', $1, 'Voisin SA')`,
          [FILIALE_B],
        );
      },
      { annuler: false },
    );

    const reponse = await lecteur.appeler('GET', '/api/tiers/chaine/T-VOISIN');
    // ⚠️ **404 et non 403**, et c'est le contrôle S12 : un 403 dirait « cette
    // ressource existe, mais pas pour vous » — c'est-à-dire un oracle d'existence
    // sur la liste des fournisseurs des autres filiales. Le refus doit être
    // indiscernable de celui d'un identifiant inventé.
    assert.equal(reponse.statut, 404);

    const inventé = await lecteur.appeler('GET', '/api/tiers/chaine/T-INEXISTANT');
    assert.equal(inventé.statut, 404);
    // ⚠️ `reference` est l'identifiant de la REQUÊTE : il diffère à chaque appel
    // par construction, et le comparer mesurerait le compteur du serveur, pas
    // l'indiscernabilité du refus. On l'écarte — explicitement, plutôt que de
    // comparer deux ou trois champs choisis à la main, ce qui laisserait entrer
    // un champ discriminant ajouté plus tard.
    const sansReference = ({ reference, ...reste }) => reste;
    assert.deepEqual(
      sansReference(reponse.corps),
      sansReference(inventé.corps),
      'les deux refus doivent être identiques : un écart serait un oracle d’existence',
    );
  });

  test('et l’état ne montre aucun tiers de la voisine', async () => {
    const tiers = await etat();
    assert.equal(tiers.has('T-VOISIN'), false);
  });
});
