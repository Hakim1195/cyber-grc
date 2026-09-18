/**
 * descendantes.test.mjs — **LES CAMPAGNES DESCENDANTES** (lot L24, actions 24.1 et 24.2)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure, et pourquoi chaque point y est
 * ════════════════════════════════════════════════════════════════════════
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Les deux états sont DÉRIVÉS, et les deux ordres qui comptent tiennent |
 * | 2 | L'avancement se COMPTE dans les évaluations — et le serveur ne rend AUCUN taux |
 * | 3 | ⚠️ Une filiale ne voit QUE sa part, et n'apprend pas combien d'autres sont convoquées |
 * | 4 | La convocation ET la déconvocation : les trois barrières, et le refus qui n'est pas un oracle |
 * | 5 | La filiale RÉPOND dans sa part ; elle ne convoque pas, et ne convoque pas autrui |
 * | 6 | La chronologie du schéma mord |
 * | 7 | ⚠️ Supprimer sa part RESTE possible — sans quoi la reprise « remplacer » serait morte |
 *
 * ── ⚠️ LE §3 EST LE CRITÈRE D'ACCEPTATION DE L'ACTION 24.1 ─────────────────
 *
 * Le `docs/PLAN_PRODUIT.md` le dit mot pour mot : *« Une filiale ne voit que sa
 * part. Le cloisonnement de la campagne est éprouvé comme celui de la recherche :
 * l'essai rougit si la clause tombe. »*
 *
 * ⚠️ **LA MUTATION A ÉTÉ JOUÉE, ET ELLE DIT AUTRE CHOSE QUE CE QU'ON ATTENDAIT** —
 * ce qui vaut d'être écrit plutôt que d'être arrondi. `pol_campagne_filiales_lecture`
 * ramenée à `using (true)` ne fait pas rougir ce §3 : elle empêche la **migration
 * de s'appliquer**, parce que `f_verifier_couverture_rls()` refuse une politique de
 * lecture qui ne consulte pas le périmètre sur une table cloisonnée. La famille
 * entière s'arrête alors à l'ouverture de sa base — 0 essai joué, ce qui est un
 * refus encore plus net qu'un échec.
 *
 * Le cloisonnement est donc tenu par DEUX filets, et il faut savoir lequel parle :
 *
 *  · le **garde-fou du schéma**, qui refuse le déploiement d'une politique ouverte ;
 *  · ce §3, qui mesure ce que **l'utilisateur reçoit** — et c'est lui qui verrait un
 *    défaut de ROUTE, que le garde-fou ne peut pas voir. La mutation qui le prouve
 *    est celle du §1 : l'ordre des arguments de `f_etat_part_campagne()` inversé
 *    dans la route laisse la base intacte, le schéma vert, et fait rougir un essai
 *    et un seul (leçon du constat **Q-325**).
 *
 * *Un essai ne vaut pas par l'intention qu'on lui prête, mais par la mutation qui le
 * fait rougir — et il faut nommer LAQUELLE.*
 *
 * ── ⚠️ ET LE §7 GARDE L'INVERSE DE CE QU'ON CROIRAIT ──────────────────────
 *
 * La première rédaction de la migration `044` interdisait à une filiale de retirer
 * sa part — « la déconvocation est un geste de Groupe ». **Le banc a montré que cet
 * interdit rendait la reprise « remplacer » impossible** : `purgerFiliale()` vide
 * les tables cloisonnées de la filiale active, sans élever de drapeau
 * d'administration. C'est la classe des trois conflits de la migration `041`, et
 * l'arbitrage est le même : *la capacité de restaurer une sauvegarde gagne*.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let applicatif;
/** Session de la filiale A, sans administration Groupe. */
let filiale;
/** Session de portée Groupe, avec administration. */
let groupe;
/** Session de la filiale A sans le domaine « conformite » — pour le droit. */
let etranger;

function perimetreApi(filialeId, filiales, administration = false) {
  return {
    utilisateurId: 'USER-A',
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe: administration,
  };
}

const TOUS_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel', 'administration',
]);

/**
 * Une session dont on CHOISIT les droits — le dispositif de
 * `test/tiers/registre-dora.test.mjs`, repris parce qu'il est éprouvé.
 *
 * ⚠️ Sans elle, le §4 ne mesurerait rien : `monterGreffon` seul retombe sur
 * `DROITS_PROVISOIRES_DEVELOPPEMENT`, qui porte tous les domaines et le niveau
 * d'administration.
 */
class SessionDeBanc {
  constructor(perimetre_, droits) {
    this.provisoire = true;
    this._perimetre = Object.freeze({ ...perimetre_ });
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
    return 'session du banc d’essai (test/campagnes/descendantes.test.mjs)';
  }
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  const pFiliale = perimetreApi(FILIALE_A, [FILIALE_A]);
  const pGroupe = perimetreApi(FILIALE_A, [FILIALE_A, FILIALE_B], true);

  filiale = await monterGreffon(base, pFiliale, {
    resolveur: new SessionDeBanc(pFiliale, {
      niveau: 'validation', domaines: TOUS_DOMAINES, export: true,
    }),
  });
  groupe = await monterGreffon(base, pGroupe, {
    resolveur: new SessionDeBanc(pGroupe, {
      niveau: 'administration', domaines: TOUS_DOMAINES, export: true,
    }),
  });
  etranger = await monterGreffon(base, pFiliale, {
    resolveur: new SessionDeBanc(pFiliale, {
      niveau: 'validation',
      domaines: TOUS_DOMAINES.filter((d) => d !== 'conformite'),
      export: true,
    }),
  });

  // ── Le jeu propre à ce fichier, EN PLUS de `CAMP-G` du semis commun ──────────
  //
  // ⚠️ Les campagnes et les parts s'écrivent sous administration Groupe : c'est la
  // politique de la `044`. Le périmètre ci-dessous la déclare.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-l24', FILIALE_A, [FILIALE_A, FILIALE_B], true),
    async (c) => {
      await c.query(
        `insert into campagnes (id, ref_id, intitule, ouverte_le, echeance, close_le)
         values
             -- Jamais ouverte, avec une échéance DÉJÀ passée : un brouillon n'est pas
             -- un retard. La contrainte de chronologie l'autorise précisément parce que
             -- la date d'ouverture est nulle.
             ('CAMP-BROUILLON', 'anssi', 'Brouillon du Groupe', null, current_date - 10, null),
             -- Close APRÈS son échéance : l'affaire est terminée, et c'est le cas qui
             -- fait toute la valeur de l'ordre des branches.
             ('CAMP-CLOSE', 'anssi', 'Close en retard', current_date - 60, current_date - 30,
              current_date - 5),
             -- Ouverte, échéance dépassée : en retard, et il faut que ça se voie.
             ('CAMP-RETARD', 'anssi', 'En retard', current_date - 40, current_date - 3, null),
             -- Ouverte sans échéance : on attend, et rien ne dit qu'on attend trop.
             ('CAMP-SANS-DATE', 'anssi', 'Sans échéance', current_date - 15, null, null)`,
      );
      await c.query(
        `insert into campagne_filiales
             (id, filiale_id, campagne_id, repondant, accuse_le, termine_le)
         values
             -- La part de A sur la campagne en retard : non terminée.
             ('CF-A-RETARD', $1, 'CAMP-RETARD', 'RSSI Toulouse', current_date - 35, null),
             -- La part de B sur la MÊME campagne : c'est elle que A ne doit pas voir.
             ('CF-B-RETARD', $2, 'CAMP-RETARD', 'RSSI Allemagne', null, null),
             -- Terminée alors que la campagne est en retard : « terminee » l'emporte.
             ('CF-A-FINIE', $1, 'CAMP-SANS-DATE', 'RSSI Toulouse', current_date - 12,
              current_date - 2),
             -- Non faite sur une campagne CLOSE : un manque constaté, pas un retard.
             ('CF-A-MANQUE', $1, 'CAMP-CLOSE', null, null, null)`,
        [FILIALE_A, FILIALE_B],
      );
      // De quoi COMPTER un avancement : trois évaluations renseignées et une vide sur
      // le référentiel demandé. ⚠️ La vide doit rester hors du compte — sans elle,
      // l'essai ne mesurerait pas la clause « statut <> '' ».
      await c.query(
        `insert into evaluations (id, filiale_id, ref_id, code, statut)
         values ('EV-C1', $1, 'anssi', 'C1', 'conforme'),
                ('EV-C2', $1, 'anssi', 'C2', 'non conforme'),
                ('EV-C3', $1, 'anssi', 'C3', 'non applicable'),
                ('EV-C4', $1, 'anssi', 'C4', '')`,
        [FILIALE_A],
      );
    },
    { annuler: false },
  );
});

after(async () => {
  await filiale?.fermer();
  await groupe?.fermer();
  await etranger?.fermer();
  await base?.fermer();
});

/** L'état rendu par la route, indexé par identifiant de campagne. */
async function etat(session = filiale) {
  const reponse = await session.appeler('GET', '/api/campagnes/etat');
  assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
  return { corps: reponse.corps, parId: new Map(reponse.corps.campagnes.map((c) => [c.id, c])) };
}

/** Tente une écriture dans une transaction ANNULÉE et rend l'erreur de PostgreSQL. */
async function refus(texte, valeurs = [], administration = true) {
  try {
    await base.avecPerimetre(
      applicatif,
      perimetre('essai', FILIALE_A, [FILIALE_A, FILIALE_B], administration),
      async (c) => {
        await c.query(texte, valeurs);
      },
    );
  } catch (erreur) {
    return erreur;
  }
  return null;
}

describe('§1 — les deux états sont DÉRIVÉS, et les deux ordres qui comptent tiennent', () => {
  test('la campagne : brouillon, close, en retard, en cours', async () => {
    const { parId } = await etat(groupe);
    assert.equal(parId.get('CAMP-BROUILLON').etat, 'brouillon');
    // ⚠️ LE CAS QUI PORTE LE §1 : close APRÈS l'échéance. Si « close » n'était pas
    // testé en premier, le produit enverrait relancer vingt filiales pour une
    // campagne terminée.
    assert.equal(parId.get('CAMP-CLOSE').etat, 'close');
    assert.equal(parId.get('CAMP-RETARD').etat, 'en_retard');
    assert.equal(parId.get('CAMP-SANS-DATE').etat, 'en_cours');
  });

  test('la part : terminee, non_faite, en_retard, en_cours', async () => {
    const { parId } = await etat(groupe);
    const partDe = (campagne, id) =>
      parId.get(campagne).parts.find((p) => p.id === id);

    assert.equal(partDe('CAMP-RETARD', 'CF-A-RETARD').etat, 'en_retard');
    // Terminée alors que la campagne traîne : ma part ne me concerne plus.
    assert.equal(partDe('CAMP-SANS-DATE', 'CF-A-FINIE').etat, 'terminee');
    // ⚠️ « non_faite » et non « en_retard » : la campagne est CLOSE, donc ce qui n'a
    // pas été fait est un manque qu'on constate. Appeler « en retard » ce qui ne peut
    // plus être fait entretient une liste que personne ne peut vider.
    assert.equal(partDe('CAMP-CLOSE', 'CF-A-MANQUE').etat, 'non_faite');
  });

  test('la borne du jour, mesurée sur les FONCTIONS', async () => {
    const bornes = await base.avecPerimetre(
      applicatif,
      perimetre('essai', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (
          await c.query(
            `select f_etat_campagne(current_date - 5, current_date,     null) as aujourdhui,
                    f_etat_campagne(current_date - 5, current_date - 1, null) as hier,
                    f_etat_campagne(current_date - 5, current_date - 1,
                                    current_date)                            as close_tard,
                    f_etat_part_campagne(null, current_date,     null)        as part_aujourdhui,
                    f_etat_part_campagne(null, current_date - 1, null)        as part_hier,
                    f_etat_part_campagne(current_date, current_date - 9, null) as part_finie,
                    f_etat_part_campagne(null, current_date - 9,
                                         current_date - 1)                    as part_manque`,
          )
        ).rows[0],
    );
    assert.equal(bornes.aujourdhui, 'en_cours');
    assert.equal(bornes.hier, 'en_retard');
    assert.equal(bornes.close_tard, 'close');
    assert.equal(bornes.part_aujourdhui, 'en_cours');
    assert.equal(bornes.part_hier, 'en_retard');
    assert.equal(bornes.part_finie, 'terminee');
    assert.equal(bornes.part_manque, 'non_faite');
  });

  test('aucun état n’est STOCKÉ — le catalogue ne porte pas ces colonnes', async () => {
    const colonnes = await base.lignes(
      applicatif,
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public'
          and table_name in ('campagnes', 'campagne_filiales')
          and column_name in ('etat', 'statut', 'avancement', 'taux', 'progression')`,
    );
    assert.deepEqual(colonnes, []);
  });
});

describe('§2 — l’avancement se COMPTE, et le serveur ne rend AUCUN taux', () => {
  test('trois évaluations renseignées sur quatre : la vide ne compte pas', async () => {
    const { parId } = await etat(filiale);
    const part = parId.get('CAMP-RETARD').parts.find((p) => p.id === 'CF-A-RETARD');
    // ⚠️ TROIS, et le chiffre a été MESURÉ plutôt que déduit : la première rédaction en
    // attendait quatre, comptant l'`EVAL-A` du semis commun — qui porte bien le
    // référentiel « anssi », mais **sans statut**. Elle est donc exclue au même titre
    // que la ligne vide de ce fichier, et c'est exactement ce que la clause
    // « statut <> '' » doit faire : une exigence ouverte n'est pas une exigence
    // répondue. L'essai mesure donc l'exclusion DEUX fois, sur deux provenances.
    assert.equal(part.repondues, 3);
  });

  test('aucun POURCENTAGE : le serveur ne sait pas combien de questions porte un référentiel', async () => {
    const { corps } = await etat(groupe);
    const champs = Object.keys(corps.campagnes[0].parts[0] ?? {});
    for (const interdit of ['taux', 'pourcentage', 'avancement', 'progression', 'total']) {
      assert.equal(champs.includes(interdit), false, `« ${interdit} » ne doit pas être servi ici`);
    }
  });
});

describe('§3 — ⚠️ une filiale ne voit QUE sa part (critère de l’action 24.1)', () => {
  test('la part de la filiale voisine est invisible, et son nombre aussi', async () => {
    const { parId } = await etat(filiale);
    const campagne = parId.get('CAMP-RETARD');

    // ⚠️ C'est l'assertion qui rougit si `pol_campagne_filiales_lecture` tombe :
    // jouée contre une politique ramenée à `using (true)`, la filiale de Toulouse
    // recevait DEUX parts et le nom de la filiale allemande.
    assert.deepEqual(campagne.parts.map((p) => p.id), ['CF-A-RETARD']);
    assert.equal(campagne.partsVisibles, 1);

    const rendu = JSON.stringify(campagne);
    assert.equal(/Allemagne/u.test(rendu), false, 'le nom de la filiale voisine ne doit pas paraître');
    assert.equal(/CF-B-RETARD/u.test(rendu), false);
  });

  test('la campagne elle-même, en revanche, se LIT : une filiale doit voir ce qu’on lui demande', async () => {
    const { parId } = await etat(filiale);
    // La campagne est de niveau Groupe, sa lecture est ouverte à dessein. Ce qu'elle
    // ne dit pas est QUI D'AUTRE est convoqué.
    assert.ok(parId.has('CAMP-RETARD'));
    assert.equal(parId.get('CAMP-RETARD').intitule, 'En retard');
    // Une campagne à laquelle la filiale n'est PAS convoquée se lit aussi — et sans
    // aucune part. C'est cohérent : le Groupe peut avoir ouvert une demande qui ne la
    // concerne pas, et le lui cacher n'apporterait rien qu'un mystère.
    assert.deepEqual(parId.get('CAMP-BROUILLON').parts, []);
  });

  test('la vue de GROUPE, elle, porte les deux parts — et c’est la RLS qui fait la différence', async () => {
    const { parId } = await etat(groupe);
    const ids = parId.get('CAMP-RETARD').parts.map((p) => p.id).sort();
    assert.deepEqual(ids, ['CF-A-RETARD', 'CF-B-RETARD']);
    assert.equal(parId.get('CAMP-RETARD').partsVisibles, 2);
  });
});

describe('§4 — la convocation : les trois barrières', () => {
  test('BARRIÈRE 1 — sans le droit d’administration, la route refuse', async () => {
    const r = await filiale.appeler('POST', '/api/campagnes/CAMP-SANS-DATE/convoquer', {
      corps: { filiales: [FILIALE_A] },
    });
    assert.equal(r.statut, 403, JSON.stringify(r.corps));
  });

  test('BARRIÈRE 2 — une filiale hors du périmètre est refusée, et le refus n’est pas un ORACLE', async () => {
    const inexistante = await groupe.appeler('POST', '/api/campagnes/CAMP-SANS-DATE/convoquer', {
      corps: { filiales: ['FIL-QUI-N-EXISTE-PAS'] },
    });
    assert.equal(inexistante.statut, 403, JSON.stringify(inexistante.corps));

    // ⚠️ LE POINT DU §4 : le refus d'une filiale INEXISTANTE et celui d'une filiale
    // RÉELLE hors périmètre doivent être indistinguables. Sinon la route devient un
    // oracle d'existence de filiales — le défaut que le constat B-1 a fermé côté
    // comptes. Le périmètre de `groupe` couvre A et B ; on fabrique une troisième
    // filiale réelle, et on vérifie que le message est le MÊME.
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur-l24', FILIALE_A, [FILIALE_A, FILIALE_B], true),
      async (c) => {
        await c.query(
          `insert into filiales (id, code, raison_sociale, pays)
           values ('FIL-TIERCE', 'ZZTIER', 'Essai Tierce', 'FR')
           on conflict (id) do nothing`,
        );
      },
      { annuler: false },
    );

    const reelle = await groupe.appeler('POST', '/api/campagnes/CAMP-SANS-DATE/convoquer', {
      corps: { filiales: ['FIL-TIERCE'] },
    });
    assert.equal(reelle.statut, 403);
    assert.equal(reelle.corps.message, inexistante.corps.message,
      'les deux refus doivent être indistinguables à l’octet près');
  });

  test('BARRIÈRE 3 — la base refuse une part sans drapeau d’administration', async () => {
    const erreur = await refus(
      `insert into campagne_filiales (id, filiale_id, campagne_id)
       values ('CF-SANS-DRAPEAU', $1, 'CAMP-SANS-DATE')`,
      [FILIALE_A],
      false, // ← sans administration Groupe
    );
    assert.notEqual(erreur, null, 'la politique doit refuser une convocation sans le drapeau');
    assert.match(String(erreur.message), /row-level security|violates/u);
  });

  test('convoquer DEUX FOIS n’est pas une faute : le second passage ne double rien', async () => {
    const premier = await groupe.appeler('POST', '/api/campagnes/CAMP-SANS-DATE/convoquer', {
      corps: { filiales: [FILIALE_B] },
    });
    assert.equal(premier.statut, 201, JSON.stringify(premier.corps));
    assert.equal(premier.corps.convoquees, 1);

    const second = await groupe.appeler('POST', '/api/campagnes/CAMP-SANS-DATE/convoquer', {
      corps: { filiales: [FILIALE_B] },
    });
    assert.equal(second.statut, 201);
    assert.equal(second.corps.convoquees, 0);
    assert.equal(second.corps.deja, 1);
  });

  test('⚠️ LA DÉCONVOCATION existe, et sans elle une campagne convoquée serait INDESTRUCTIBLE', async () => {
    // ⚠️ **CE POINT A ÉTÉ AJOUTÉ APRÈS COUP**, et le défaut qui l'a imposé se mesure sur la
    // recette : la clé `fk_campagne_filiales_campagne` est en `restrict` (§18.2), donc
    // retirer une campagne exige de retirer ses parts d'abord. Or la couche d'entités ne
    // sert à une session QUE les lignes de sa filiale active : les parts des autres
    // filiales n'étaient dans aucune mémoire, et aucun écran ne pouvait les nommer. Trois
    // `409` « encore référencé ailleurs », et une campagne qu'on ne pouvait plus supprimer.
    const retiree = await groupe.appeler('POST', '/api/campagnes/CAMP-SANS-DATE/deconvoquer', {
      corps: { filiales: [FILIALE_B] },
    });
    assert.equal(retiree.statut, 200, JSON.stringify(retiree.corps));
    assert.equal(retiree.corps.deconvoquees, 1);

    // Rejouer n'est pas une faute : c'est un geste répété, comme la convocation.
    const rejeu = await groupe.appeler('POST', '/api/campagnes/CAMP-SANS-DATE/deconvoquer', {
      corps: { filiales: [FILIALE_B] },
    });
    assert.equal(rejeu.statut, 200);
    assert.equal(rejeu.corps.deconvoquees, 0);

    // ⚠️ ET CE QU'ELLE NE DÉTRUIT PAS : le travail. L'avancement vit dans `evaluations`,
    //    que la part ne porte pas — c'est ce qui rend l'arbitrage du §5 de la `044`
    //    tenable, et c'est mesuré plutôt que promis.
    // ⚠️ DANS UN PÉRIMÈTRE : `evaluations` est cloisonnée, et la lire sans périmètre
    //    déclaré lève « Périmètre non positionné » — la base refuse, et elle a raison.
    //    La première rédaction interrogeait la connexion nue et rendait `undefined`.
    const evaluations = await base.avecPerimetre(
      applicatif,
      perimetre('verif', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (
          await c.query(
            `select count(*)::int as n from evaluations
              where filiale_id = $1 and ref_id = 'anssi'`,
            [FILIALE_A],
          )
        ).rows[0].n,
    );
    assert.ok(Number(evaluations) > 0, 'les évaluations ne doivent pas bouger');
  });

  test('la déconvocation exige le droit, et son refus n’est pas un ORACLE', async () => {
    const sansDroit = await filiale.appeler('POST', '/api/campagnes/CAMP-RETARD/deconvoquer', {
      corps: { filiales: [FILIALE_A] },
    });
    assert.equal(sansDroit.statut, 403, JSON.stringify(sansDroit.corps));

    // Le même refus, mot pour mot, qu'une filiale hors périmètre — sinon la route
    // deviendrait un oracle d'existence de filiales.
    const horsPerimetre = await groupe.appeler('POST', '/api/campagnes/CAMP-RETARD/deconvoquer', {
      corps: { filiales: ['FIL-QUI-N-EXISTE-PAS'] },
    });
    assert.equal(horsPerimetre.statut, 403);
    const reelleHors = await groupe.appeler('POST', '/api/campagnes/CAMP-RETARD/deconvoquer', {
      corps: { filiales: ['FIL-TIERCE'] },
    });
    assert.equal(reelleHors.statut, 403);
    assert.equal(reelleHors.corps.message, horsPerimetre.corps.message,
      'les deux refus doivent être indistinguables à l’octet près');
  });

  test('une campagne inconnue rend 404, pas une part orpheline', async () => {
    const r = await groupe.appeler('POST', '/api/campagnes/CAMP-FANTOME/convoquer', {
      corps: { filiales: [FILIALE_A] },
    });
    assert.equal(r.statut, 404, JSON.stringify(r.corps));
  });
});

describe('§5 — la filiale répond dans SA part, et ne convoque personne', () => {
  test('elle consigne sa prise de connaissance et son achèvement', async () => {
    const erreur = await refus(
      `update campagne_filiales
          set accuse_le = current_date, termine_le = current_date, repondant = 'RSSI Toulouse'
        where id = 'CF-A-MANQUE'`,
      [],
      false, // sans administration : c'est bien la FILIALE qui écrit
    );
    assert.equal(erreur, null, 'une filiale doit pouvoir consigner sa propre part');
  });

  test('elle ne touche PAS la part de la voisine — la ligne est invisible, donc introuvable', async () => {
    const touchees = await base.avecPerimetre(
      applicatif,
      perimetre('essai', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (await c.query(`update campagne_filiales set termine_le = current_date
                         where id = 'CF-B-RETARD'`)).rowCount,
    );
    // ⚠️ ZÉRO ligne touchée, et non une erreur : la politique de lecture cache la
    // ligne, donc l'« update » ne la trouve pas. C'est la forme normale du refus RLS,
    // et c'est ce qui ferme l'oracle — un message d'erreur distinct apprendrait que la
    // ligne existe.
    assert.equal(touchees, 0);
  });
});

describe('§6 — la chronologie du schéma mord', () => {
  test('on ne CLÔT pas une campagne qu’on n’a pas ouverte', async () => {
    const erreur = await refus(
      `insert into campagnes (id, ref_id, intitule, close_le)
       values ('CAMP-X1', 'anssi', 'Close sans ouverture', current_date)`,
    );
    assert.notEqual(erreur, null);
    assert.equal(erreur.constraint, 'ck_campagnes_cloture');
  });

  test('une échéance ANTÉRIEURE à l’ouverture n’a jamais laissé le temps de répondre', async () => {
    const erreur = await refus(
      `insert into campagnes (id, ref_id, intitule, ouverte_le, echeance)
       values ('CAMP-X2', 'anssi', 'Échéance avant ouverture', current_date, current_date - 1)`,
    );
    assert.notEqual(erreur, null);
    assert.equal(erreur.constraint, 'ck_campagnes_echeance');
  });

  test('on ne TERMINE pas avant d’avoir pris connaissance', async () => {
    const erreur = await refus(
      `insert into campagne_filiales (id, filiale_id, campagne_id, accuse_le, termine_le)
       values ('CF-X3', $1, 'CAMP-SANS-DATE', current_date, current_date - 1)`,
      [FILIALE_A],
    );
    assert.notEqual(erreur, null);
    assert.equal(erreur.constraint, 'ck_campagne_filiales_chronologie');
  });

  test('UNE part par campagne et par filiale', async () => {
    const erreur = await refus(
      `insert into campagne_filiales (id, filiale_id, campagne_id)
       values ('CF-X4', $1, 'CAMP-RETARD')`,
      [FILIALE_A],
    );
    assert.notEqual(erreur, null);
    assert.equal(erreur.constraint, 'uq_campagne_filiales_part');
  });

  test('et une campagne ne se supprime pas tant qu’une filiale y est convoquée (§18.2)', async () => {
    const erreur = await refus(`delete from campagnes where id = 'CAMP-RETARD'`);
    assert.notEqual(erreur, null, 'la clé en restrict doit refuser');
    assert.equal(erreur.constraint, 'fk_campagne_filiales_campagne');
    // ⚠️ C'est la règle du §18.2 : une clé d'une table cloisonnée vers une table de
    // niveau Groupe ne porte ni `cascade` ni `set null`. Avec la cascade, supprimer
    // UNE ligne de niveau Groupe détruisait le travail de vingt filiales — y compris
    // celles que l'auteur du geste ne peut pas lire. Déconvoquer d'abord est un geste
    // explicite, et c'est très exactement ce qu'on veut.
  });
});

describe('§7 — ⚠️ supprimer sa part RESTE possible, sans quoi la reprise serait morte', () => {
  test('une filiale peut vider ses propres parts — c’est ce que « purgerFiliale » fait', async () => {
    const restant = await base.avecPerimetre(
      applicatif,
      perimetre('essai', FILIALE_A, [FILIALE_A]),
      async (c) => {
        // Le geste exact de `purgerFiliale()` : un « delete … where filiale_id = … »,
        // sans aucun drapeau d'administration.
        await c.query(`delete from campagne_filiales where filiale_id = $1`, [FILIALE_A]);
        return (await c.query(`select count(*)::int as n from campagne_filiales`)).rows[0].n;
      },
    );
    // Transaction ANNULÉE : ce qui est mesuré est que la base ne refuse pas. Zéro ligne
    // visible depuis A après la purge — celles de B restent, invisibles et intactes.
    assert.equal(Number(restant), 0);
  });

  test('et la politique de suppression MENTIONNE la filiale — sans quoi la purge échouerait', async () => {
    // ⚠️ Mesuré dans le catalogue, pas dans le texte de la migration. Le garde-fou
    // `f_verifier_campagnes()` tient la même propriété ; ici on la voit du côté du
    // banc, parce qu'un garde-fou qui se vérifie lui-même ne prouve rien (§17.5).
    const politique = await base.valeur(
      applicatif,
      `select pg_get_expr(p.polqual, p.polrelid)
         from pg_policy p
        where p.polrelid = to_regclass('public.campagne_filiales') and p.polcmd = 'd'`,
    );
    assert.match(String(politique), /f_filiale_ecriture/u);
  });
});
