/**
 * `test/sous-traitance/` — LE REGISTRE DE L'ARTICLE 30 §2 ET CE QU'IL FAIT RESPECTER
 * (migrations `070` et `071`)
 *
 * Demande du RSSI du client, 24/09/2026 : *« montrer au client comment on traite ses
 * données »*, conformément au RGPD, à DORA et à ISO 27001, *« et que ça soit respecté dans
 * le reste du logiciel »*.
 *
 * 🛑 **CE QUE CETTE FAMILLE MESURE, ET QUI NE SE VOIT NULLE PART AILLEURS :**
 *
 * §1 le registre §2 est un registre **distinct** du §1, et la base l'impose ;
 * §2 un transfert hors Union **sans garantie** est refusé (RGPD art. 46) ;
 * §3 le plancher de diffusion d'un client **mord dans les deux sens d'écriture** — sur le
 *    document qui descend dessous, ET sur le client qui relève son plancher ;
 * §4 une reprise « remplacer » **passe** malgré l'ordre d'insertion, parce que le
 *    déclencheur est DIFFÉRÉ (classe Q-194 / Q-280 / Q-284) ;
 * §5 une mesure **locale d'une filiale voisine** ne peut pas entrer au registre ;
 * §6 le dossier client **exige l'export**, **dit ses manques** et **dit ce qu'il retient** ;
 * §7 le cloisonnement : le client d'une voisine rend **404, jamais 403** ;
 * §8 l'échéance contractuelle est **dérivée** et se **tait** quand elle le doit.
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

/**
 * Une session dont on CHOISIT les droits.
 *
 * 🛑 **Sans elle, les deux essais du §6 ne mesureraient RIEN, et j'ai refait la faute
 * avant de la lire.** `monterGreffon` seul retombe sur
 * `DROITS_PROVISOIRES_DEVELOPPEMENT`, qui porte `export: true` et tous les domaines : un
 * périmètre auquel on ajoute « peutExporter: false » est **ignoré**, le serveur rend 200,
 * et l'essai consacre le défaut qu'il cherchait. Le motif est écrit en toutes lettres dans
 * `test/tiers/registre-dora.test.mjs` — *un essai qui croit régler un droit qu'il ne règle
 * pas est un essai qui consacre le défaut qu'il cherche.*
 *
 * Le contrat est respecté à la lettre : `resoudre()` ne prend aucun argument et
 * `authentifier()` ne lit rien de la requête (`PLAN_SERVEUR` §1.4).
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
    return 'session du banc (test/sous-traitance/registre-article-30-2.test.mjs)';
  }
}

const TOUS_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel', 'administration',
]);

let base;
let applicatif;
let admin;

const PERIMETRE_ADMIN = {
  utilisateurId: 'admin.grc',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A, FILIALE_B],
  perimetreGroupe: true,
  administrationGroupe: true,
};

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  admin = await monterGreffon(base, PERIMETRE_ADMIN);
});

after(async () => {
  // ⚠️ Le greffon d'abord : tant qu'il vit, la base d'essai ne peut pas être
  //    supprimée (« permission denied to terminate process ») — motif Q-321.
  await admin?.fermer();
  await base?.fermer();
});

/** Écrit dans la filiale donnée, hors transaction annulée (l'effet doit survivre). */
async function ecrire(sql, valeurs = [], filiale = FILIALE_A) {
  return await base.avecPerimetre(
    applicatif,
    { ...PERIMETRE_ADMIN, filialeId: filiale },
    async (client) => await client.query(sql, valeurs),
    { annuler: false },
  );
}

/** Tente une écriture et rend le message d'erreur, ou `null` si elle passe. */
async function tenter(sql, valeurs = [], filiale = FILIALE_A) {
  try {
    await base.avecPerimetre(
      applicatif,
      { ...PERIMETRE_ADMIN, filialeId: filiale },
      async (client) => await client.query(sql, valeurs),
      { annuler: false },
    );
    return null;
  } catch (e) {
    return String(e.message);
  }
}

describe('§1 — le registre de l’article 30 §2 est DISTINCT de celui du §1', () => {
  test('il porte un client, et ses colonnes ne sont pas celles de « traitements »', async () => {
    await ecrire(
      `insert into clients (id, filiale_id, nom, confidentialite_plancher,
                           notification_incident_h, fin_de_contrat)
       values ('CLI-S1', $1, 'Donneur exigeant', 'confidentiel', 24, 'suppression')`,
      [FILIALE_A],
    );
    await ecrire(
      `insert into traitements_pour_client
              (id, filiale_id, client_id, intitule, categories_traitement,
               instruction_reference)
       values ('TPC-S1', $1, 'CLI-S1', 'Hébergement de son portail',
               'Hébergement et sauvegarde', 'Annexe 3 du contrat CONV-2026-014')`,
      [FILIALE_A],
    );

    const { rows } = await base.avecPerimetre(applicatif, PERIMETRE_ADMIN, async (c) =>
      await c.query(
        `select column_name from information_schema.columns
          where table_name = 'traitements_pour_client' order by column_name`,
      ),
    );
    const colonnes = rows.map((r) => r.column_name);

    /* 🛑 **LE CŒUR DE L'ARBITRAGE, ET IL SE MESURE.** Côté sous-traitant, la finalité est
     * l'INSTRUCTION du client et la base légale est LA SIENNE. Porter ces deux colonnes
     * ici inviterait à les remplir — et un sous-traitant qui déclare sa propre base légale
     * s'attribue un rôle qu'il n'a pas. Leur ABSENCE est la propriété. */
    assert.ok(!colonnes.includes('finalite'),
      'Le registre §2 ne doit PAS porter « finalite » : la finalité est l’instruction du client.');
    assert.ok(!colonnes.includes('base_legale'),
      'Le registre §2 ne doit PAS porter « base_legale » : la base légale est celle du client.');
    assert.ok(colonnes.includes('categories_traitement'),
      'L’article 30 §2 b) exige les catégories de traitements effectués pour le compte du responsable.');
    assert.ok(colonnes.includes('instruction_reference'),
      'L’article 28 §3 a) exige une instruction documentée : sans pièce, c’est une affirmation.');
  });

  test('les deux contacts de l’article 30 §2 a) vivent sur le client', async () => {
    const { rows } = await base.avecPerimetre(applicatif, PERIMETRE_ADMIN, async (c) =>
      await c.query(
        `select column_name from information_schema.columns
          where table_name = 'clients' and column_name like 'contact_%'`,
      ),
    );
    const noms = rows.map((r) => r.column_name).sort();
    assert.deepEqual(noms,
      ['contact_dpo_email', 'contact_dpo_nom', 'contact_rt_email', 'contact_rt_nom'],
      'Le texte NOMME le responsable de traitement ET son délégué à la protection des données.');
  });
});

describe('§2 — un transfert hors Union exige sa garantie (RGPD art. 46)', () => {
  test('déclaré sans garantie, il est REFUSÉ', async () => {
    const erreur = await tenter(
      `insert into traitements_pour_client
              (id, filiale_id, client_id, intitule, categories_traitement, transfert_hors_ue)
       values ('TPC-S2', $1, 'CLI-S1', 'Analytique', 'Mesure d’audience', 'États-Unis')`,
      [FILIALE_A],
    );
    assert.match(String(erreur), /ck_traitements_pour_client_transfert/,
      'Un transfert sans garantie identifiée donnerait un registre qui a l’air complet et '
      + 'documente une infraction — c’est le constat d’audit le plus fréquent.');
  });

  test('avec sa garantie, il PASSE — sinon la contrainte interdirait le cas légitime', async () => {
    const erreur = await tenter(
      `insert into traitements_pour_client
              (id, filiale_id, client_id, intitule, categories_traitement,
               transfert_hors_ue, transfert_garantie)
       values ('TPC-S2', $1, 'CLI-S1', 'Analytique', 'Mesure d’audience',
               'États-Unis', 'Clauses contractuelles types 2021/914')`,
      [FILIALE_A],
    );
    assert.equal(erreur, null,
      'Une contrainte qui refuse le cas nominal est pire que son absence.');
  });
});

describe('§3 — le plancher de diffusion MORD, dans les deux sens d’écriture', () => {
  test('un document classé SOUS le plancher du client est refusé, et le message le dit', async () => {
    const erreur = await tenter(
      `insert into documents (id, filiale_id, titre, client_id, confidentialite)
       values ('DOC-S3', $1, 'Procédure de sauvegarde', 'CLI-S1', 'interne')`,
      [FILIALE_A],
    );
    assert.match(String(erreur), /impose au minimum/,
      'Le refus doit NOMMER le plancher : un refus qui ne dit pas ce qu’on attend fait '
      + 'chercher au hasard.');
  });

  test('au-dessus du plancher, il passe', async () => {
    const erreur = await tenter(
      `insert into documents (id, filiale_id, titre, client_id, confidentialite)
       values ('DOC-S3', $1, 'Procédure de sauvegarde', 'CLI-S1', 'restreint')`,
      [FILIALE_A],
    );
    assert.equal(erreur, null);
  });

  test('🛑 RELEVER le plancher est refusé tant qu’un document est dessous', async () => {
    await ecrire(
      `insert into clients (id, filiale_id, nom, confidentialite_plancher)
       values ('CLI-S3', $1, 'Donneur modeste', 'interne')`,
      [FILIALE_A],
    );
    await ecrire(
      `insert into documents (id, filiale_id, titre, client_id, confidentialite)
       values ('DOC-S3b', $1, 'Note', 'CLI-S3', 'interne')`,
      [FILIALE_A],
    );
    const erreur = await tenter(
      `update clients set confidentialite_plancher = 'restreint' where id = 'CLI-S3'`,
      [], FILIALE_A,
    );
    /* 🛑 **SANS CETTE MOITIÉ, LE PLANCHER SERAIT UNE PROMESSE QU'UN SEUL `UPDATE` DÉFAIT
     * EN SILENCE** : le contrat s'afficherait comme tenu, et le dossier remis au client
     * l'affirmerait. C'est la classe « on a corrigé un sens, pas la propriété ». */
    assert.match(String(erreur), /ne peut pas être posé/,
      'Relever un plancher sans reclasser afficherait au client une exigence que le '
      + 'produit ne tient pas.');
  });

  test('le BAISSER reste libre — c’est une décision contractuelle, pas un défaut', async () => {
    const erreur = await tenter(
      `update clients set confidentialite_plancher = 'public' where id = 'CLI-S3'`,
      [], FILIALE_A,
    );
    assert.equal(erreur, null);
  });
});

describe('§4 — le déclencheur est DIFFÉRÉ, et c’est ce qui sauve une reprise saine', () => {
  test('le document inséré AVANT son client ne provoque aucun faux refus', async () => {
    /* C'est la classe des constats Q-194, Q-280 et Q-284, tranchée quatre fois de la même
     * façon : **restaurer une sauvegarde gagne.** Une barrière immédiate refuserait une
     * reprise « remplacer » parfaitement saine, pour la seule raison que l'ordre
     * d'insertion place le document avant le client. */
    const erreur = await base.avecPerimetre(
      applicatif,
      { ...PERIMETRE_ADMIN, filialeId: FILIALE_A },
      async (client) => {
        try {
          await client.query(
            `insert into documents (id, filiale_id, titre, confidentialite)
             values ('DOC-S4', $1, 'Procédure reprise', 'restreint')`,
            [FILIALE_A],
          );
          await client.query(
            `insert into clients (id, filiale_id, nom, confidentialite_plancher)
             values ('CLI-S4', $1, 'Donneur repris', 'confidentiel')`,
            [FILIALE_A],
          );
          await client.query(`update documents set client_id = 'CLI-S4' where id = 'DOC-S4'`);
          await client.query('set constraints all immediate');
          return null;
        } catch (e) {
          return String(e.message);
        }
      },
      { annuler: true },
    );
    assert.equal(erreur, null,
      'Un ordre d’insertion différent ne doit pas faire échouer une restauration cohérente.');
  });
});

describe('§5 — une mesure LOCALE d’une filiale voisine n’entre pas au registre', () => {
  test('elle est refusée, et aucune clé étrangère ne pouvait l’exprimer', async () => {
    await ecrire(
      `insert into mesure_catalogue (id, filiale_id, nom)
       values ('MES-S5', $1, 'Mesure locale de la voisine')`,
      [FILIALE_B], FILIALE_B,
    );
    const erreur = await tenter(
      `insert into traitement_client_mesures
              (traitement_pour_client_id, mesure_id, filiale_id)
       values ('TPC-S1', 'MES-S5', $1)`,
      [FILIALE_A],
    );
    /* ⚠️ `mesure_catalogue` est MIXTE : son `filiale_id` est nullable, donc aucune clé
     * composite ne peut viser le couple (§45). Sans le déclencheur de cohérence, cette
     * mesure invisible apparaîtrait dans le dossier remis au client comme une mesure de
     * sécurité que la filiale n'a jamais mise en œuvre. ⚠️ **Aucun garde-fou du schéma ne
     * l'a réclamée** : elle a été posée en relisant les quatre tables que la `004` avait
     * équipées, et celle-ci est la cinquième. */
    assert.match(String(erreur), /inaccessible à la filiale|locale à une autre/,
      'Le registre remis au client nommerait une mesure que cette filiale n’a jamais mise '
      + 'en œuvre.');
  });
});

describe('§6 — le dossier client exige l’export, dit ses manques, et dit ce qu’il RETIENT', () => {
  test('sans droit d’export, la route refuse', async () => {
    const lecteur = await monterGreffon(base, PERIMETRE_ADMIN, {
      resolveur: new SessionDeBanc(PERIMETRE_ADMIN, {
        niveau: 'validation',
        domaines: TOUS_DOMAINES,
        export: false,
      }),
    });
    try {
      const r = await lecteur.appeler('GET', '/api/clients/CLI-S1/dossier');
      if (r.statut === 500) console.error('CORPS 500 :', JSON.stringify(r.corps));
      assert.equal(r.statut, 403,
        'Un dossier de conformité complet est une EXTRACTION (PLAN_SERVEUR §3.3).');
    } finally {
      await lecteur.fermer();
    }
  });

  test('il NOMME ses manques, avec la référence du texte qui les exige', async () => {
    const r = await admin.appeler('GET', '/api/clients/CLI-S1/dossier');
    assert.equal(r.statut, 200, 'corps=' + JSON.stringify(r.corps));
    const sujets = r.corps.manques.map((m) => m.sujet).join(' | ');
    assert.match(sujets, /art\. 30 §2 a\)/,
      'Le contact du responsable de traitement manque, et le texte qui l’exige est cité.');
    assert.ok(r.corps.manques.some((m) => m.gravite === 'bloquant'),
      'Un manque « bloquant » veut dire qu’envoyer le dossier documente une infraction.');
  });

  test('il porte son avertissement EN TÊTE — le produit ne transmet rien', async () => {
    const r = await admin.appeler('GET', '/api/clients/CLI-S1/dossier');
    assert.match(r.corps.avertissement, /ne transmet rien/,
      'Rendu par le serveur et non déduit par l’écran : une mention que l’écran doit '
      + 'reconstituer finit par manquer à l’impression (leçon du lot L18).');
  });

  test('🛑 une rubrique non lisible est dite RETENUE, jamais omise (constat Q-335)', async () => {
    /* C'est le constat Q-335 : l'écran du journal faisait disparaître deux blocs SANS UN
     * MOT, et rien ne distinguait « il n'y a rien » de « on vous le cache ». Ici, un
     * compte qui porte l'export RGPD mais pas le domaine « documents » doit recevoir une
     * rubrique MARQUÉE — sans quoi le dossier affirmerait « aucun document » à un client
     * qui en a douze. */
    const sansDocuments = await monterGreffon(base, PERIMETRE_ADMIN, {
      resolveur: new SessionDeBanc(PERIMETRE_ADMIN, {
        niveau: 'validation',
        // ⚠️ Tous les domaines SAUF « documents » : c'est le cas réel d'un DPO qui porte
        //    le registre et l'export, et qui n'a pas la gestion documentaire.
        domaines: ['pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
                   'continuite', 'audits', 'tiers', 'rgpd', 'personnel', 'administration'],
        export: true,
      }),
    });
    try {
      const r = await sansDocuments.appeler('GET', '/api/clients/CLI-S1/dossier');
      assert.equal(r.statut, 200);
      assert.equal(r.corps.documents.retenue, 'documents',
        'La rubrique doit DIRE qu’elle est retenue, et pour quel domaine.');
      assert.equal(r.corps.documents.lignes, undefined,
        'Une rubrique retenue ne rend aucune ligne : elle ne les filtre pas, elle se tait '
        + 'en le disant.');
    } finally {
      await sansDocuments.fermer();
    }
  });
});

describe('§7 — cloisonnement : le donneur d’ordre d’une voisine rend 404, jamais 403', () => {
  test('« introuvable » et non « interdit » — sinon le refus confirme l’existence', async () => {
    await ecrire(
      `insert into clients (id, filiale_id, nom) values ('CLI-VOISINE', $1, 'Chez la voisine')`,
      [FILIALE_B], FILIALE_B,
    );
    const seuleA = await monterGreffon(base, {
      utilisateurId: 'admin.grc',
      filialeId: FILIALE_A,
      filiales: [FILIALE_A],
      perimetreGroupe: false,
      administrationGroupe: false,
    });
    try {
      const r = await seuleA.appeler('GET', '/api/clients/CLI-VOISINE/dossier');
      assert.equal(r.statut, 404,
        'Répondre 403 confirmerait qu’un donneur d’ordre de ce nom existe ailleurs dans '
        + 'le groupe — c’est un oracle d’existence.');
    } finally {
      await seuleA.fermer();
    }
  });
});

describe('§8 — l’échéance contractuelle est DÉRIVÉE, et elle se TAIT quand elle le doit', () => {
  test('24 h après la détection, et pas une heure de plus', async () => {
    const { rows } = await base.avecPerimetre(applicatif, PERIMETRE_ADMIN, async (c) =>
      await c.query(
        `select extract(epoch from (echeance - timestamptz '2026-03-01 09:00:00+00')) / 3600
                  as heures,
                regime, palier
           from f_echeance_contractuelle(timestamptz '2026-03-01 09:00:00+00',
                                         date '2026-03-01', 24)`,
      ),
    );
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].heures), 24);
    assert.equal(rows[0].regime, 'contractuel');
    assert.equal(rows[0].palier, 'notification_client');
  });

  test('sans délai convenu, elle ne rend RIEN — pas une date inventée', async () => {
    const { rows } = await base.avecPerimetre(applicatif, PERIMETRE_ADMIN, async (c) =>
      await c.query(
        `select 1 from f_echeance_contractuelle(now(), current_date, null)`,
      ),
    );
    assert.equal(rows.length, 0,
      'Une échéance sans délai convenu est une date que rien ne fonde — et c’est '
      + 'précisément celle qu’on ne peut pas montrer à un client.');
  });

  test('🛑 et elle n’a PAS déteint sur la fonction des échéances LÉGALES', async () => {
    const { rows } = await base.avecPerimetre(applicatif, PERIMETRE_ADMIN, async (c) =>
      await c.query(
        `select count(*)::integer as n from f_echeances_reglementaires(now(), current_date)`,
      ),
    );
    /* La loi impose QUATRE paliers — trois NIS2 et un RGPD — et le garde-fou de la `034`
     * le mesure. Ajouter le palier contractuel là-dedans présenterait un délai de contrat
     * comme une obligation légale, et il faudrait DÉSARMER ce garde pour l'accepter. */
    assert.equal(rows[0].n, 4,
      'Le délai d’un contrat ne doit jamais se présenter comme une obligation légale.');
  });
});

describe('§9 — la notification au client ne se consigne pas sans destinataire', () => {
  test('régime « contractuel » sans client : refusé', async () => {
    await ecrire(
      `insert into incidents (id, filiale_id, titre, type, gravite, statut, client_id)
       values ('INC-S9', $1, 'Fuite de plan', 'Fuite de données', 'élevée',
               'en cours', 'CLI-S1')`,
      [FILIALE_A],
    );
    const erreur = await tenter(
      `insert into declarations_reglementaires (filiale_id, incident_id, regime, palier)
       values ($1, 'INC-S9', 'contractuel', 'notification_client')`,
      [FILIALE_A],
    );
    assert.match(String(erreur), /ck_declarations_reg_destinataire/,
      'Une ligne qui dit « nous avons prévenu quelqu’un » sans dire qui serait comptée '
      + 'comme une notification faite.');
  });

  test('et une déclaration à une AUTORITÉ avec un client désigné : refusée aussi', async () => {
    const erreur = await tenter(
      `insert into declarations_reglementaires
              (filiale_id, incident_id, regime, palier, client_id)
       values ($1, 'INC-S9', 'nis2', 'notification', 'CLI-S1')`,
      [FILIALE_A],
    );
    /* Les DEUX sens sont nécessaires : sans celui-ci, l'écran ferait croire que le client
     * a été prévenu alors que seule l'autorité l'a été — et c'est au client que le contrat
     * nous oblige. C'est la leçon §39.6, dans sa forme la plus simple. */
    assert.match(String(erreur), /ck_declarations_reg_destinataire/);
  });

  test('avec son destinataire, la notification se consigne', async () => {
    const erreur = await tenter(
      `insert into declarations_reglementaires
              (filiale_id, incident_id, regime, palier, client_id, reference)
       values ($1, 'INC-S9', 'contractuel', 'notification_client', 'CLI-S1', 'MAIL-2026-88')`,
      [FILIALE_A],
    );
    assert.equal(erreur, null);
  });
});

describe('§10 — les sous-traitants ultérieurs (RGPD art. 28 §2)', () => {
  test('un prestataire d’une filiale voisine ne peut pas être déclaré', async () => {
    await ecrire(
      `insert into prestataires (id, filiale_id, societe)
       values ('PRE-VOISIN', $1, 'Hébergeur de la voisine')`,
      [FILIALE_B], FILIALE_B,
    );
    const erreur = await tenter(
      `insert into client_sous_traitants (client_id, prestataire_id, filiale_id)
       values ('CLI-S1', 'PRE-VOISIN', $1)`,
      [FILIALE_A],
    );
    assert.ok(erreur !== null,
      'Le dossier remis au client nommerait une société que cette filiale n’a jamais '
      + 'contractée.');
  });

  test('sans autorisation datée, le dossier le signale comme BLOQUANT', async () => {
    await ecrire(
      `insert into prestataires (id, filiale_id, societe)
       values ('PRE-S10', $1, 'Hébergeur Alpha')`,
      [FILIALE_A],
    );
    await ecrire(
      `insert into client_sous_traitants (client_id, prestataire_id, filiale_id, role)
       values ('CLI-S1', 'PRE-S10', $1, 'Hébergement des sauvegardes')`,
      [FILIALE_A],
    );
    const r = await admin.appeler('GET', '/api/clients/CLI-S1/dossier');
    const bloquants = r.corps.manques.filter((m) => m.gravite === 'bloquant');
    assert.ok(bloquants.some((m) => /art\. 28 §2/.test(m.sujet)),
      'Recruter un sous-traitant ultérieur sans l’autorisation écrite du responsable de '
      + 'traitement est une INFRACTION, pas un retard administratif.');
  });
});
