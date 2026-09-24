/**
 * delegations.test.mjs — **la délégation temporaire de droits** (migration `068`).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce fichier éprouve, et pourquoi il éprouve d'abord les REFUS
 * ════════════════════════════════════════════════════════════════════════
 *
 * C'est le seul lot de cette série qui touche **la résolution des droits
 * elle-même**. Tout le reste — filiales, groupes d'annuaire, personnel — tournait
 * autour. Un essai qui ne mesurerait que « ça marche » serait ici le plus
 * dangereux des essais verts.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | 🛑 **Pas d'auto-délégation** — l'invariant de sécurité, et son contre-témoin |
 * | 2 | 🛑 **Ni export, ni administration, ni profil ADMIN** |
 * | 3 | La délégation **ouvre réellement** un accès — y compris sans aucun groupe `GRC-*` |
 * | 4 | Elle **expire d'elle-même**, sans qu'aucun traitement passe |
 * | 5 | Elle se **révoque**, elle ne se supprime pas |
 * | 6 | Durée bornée, motif substantiel — et les messages **nomment la conséquence** |
 *
 * ⚠️ Le §3 est celui qui mord le plus : il résout des droits AVANT et APRÈS
 * l'octroi, sur le même compte, et compare. Sans le « avant », on mesurerait un
 * accès qui existait déjà (motif du constat Q-210).
 *
 * Prérequis machine : PostgreSQL prêt ; sur SRV-Infra, `source ~/.grc-essais.env`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

let base;
let applicatif;
/** Compte propriétaire : il ne sert qu'au TÉMOIN, jamais au scénario. */
let proprietaire;
let admin;
let droits;

const PERIMETRE_ADMIN = {
  utilisateurId: 'admin.grc',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A, FILIALE_B],
  perimetreGroupe: true,
  administrationGroupe: true,
};

/** Le bénéficiaire : un compte qui n'a AUCUN groupe `GRC-*`. C'est l'auditeur externe. */
const BENEFICIAIRE = 'auditeur.externe';

const dansNJours = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, applicatif);
  admin = await monterGreffon(base, PERIMETRE_ADMIN);
  droits = await moduleCompile('droits/index.js');
});

after(async () => {
  /* ⚠️ **Le greffon d'abord, la base ensuite.** Un greffon garde son propre pool :
   * tant qu'il vit, `base.fermer()` ne peut pas supprimer la base d'essai — il
   * reçoit « permission denied to terminate process », et la base reste sur la
   * grappe. C'est le motif des 81 bases orphelines du constat Q-321, et c'est la
   * forme que prennent tous les `after` de ce dossier. */
  await admin?.fermer();
  await base?.fermer();
});

/** Un profil de socle, par son code — aucun identifiant n'est écrit en dur. */
async function profil(code) {
  const etat = await admin.appeler('GET', '/api/habilitations/etat');
  const p = etat.corps.profils.find((x) => x.code === code);
  if (p === undefined) throw new Error(`Profil « ${code} » absent du socle.`);
  return p;
}

/** Ce que le produit accorderait à ce compte, MAINTENANT. */
async function resoudre(login, groupes = []) {
  return await base.avecPerimetre(
    applicatif,
    { ...PERIMETRE_ADMIN, utilisateurId: 'resolution-essai' },
    async (client) => droits.resoudreDroits(client, groupes, { login }),
  );
}

/**
 * Déplacer les dates d'une délégation, pour éprouver l'expiration.
 *
 * ⚠️ **Par le rôle applicatif AVEC l'administration Groupe posée, et non par le
 * propriétaire.** `delegations_droits` porte `force row level security` : la
 * politique de modification (`f_administration_groupe()`) s'applique **jusqu'au
 * propriétaire de la base**, et un `update` sans ce réglage touche **zéro ligne
 * SANS erreur**. La première rédaction de ce fichier est tombée dans ce piège —
 * les deux essais du §4 échouaient en accusant le produit, alors que c'était le
 * témoin qui n'écrivait pas. C'est le piège documenté du `CLAUDE.md` §8.
 */
async function deplacerLesDates(login, debutJours, finJours) {
  const lignes = await base.avecPerimetre(
    applicatif,
    PERIMETRE_ADMIN,
    async (client) => {
      const r = await client.query(
        // ⚠️ `$2::integer` : sans le type, PostgreSQL ne sait pas quel « date + ? »
        //    choisir et refuse (« operator is not unique »). Un paramètre non typé
        //    est une ambiguïté, pas une commodité.
        `update "delegations_droits"
            set "debut" = current_date + $2::integer, "fin" = current_date + $3::integer
          where lower("login") = $1`,
        [login, debutJours, finJours],
      );
      return r.rowCount;
    },
    { annuler: false },
  );
  assert.ok(lignes > 0, `Le témoin n’a rien écrit pour « ${login} » : il ne mesure rien.`);
}

async function accorder(corps) {
  return await admin.appeler('POST', '/api/habilitations/delegations', { corps });
}

/* =====================================================================
 *  §1 — L'INVARIANT DE SÉCURITÉ
 * ===================================================================== */

describe('§1 — pas d’auto-délégation', () => {
  test('🛑 un compte ne peut PAS s’accorder des droits à lui-même', async () => {
    /* Sans cette règle, qui détient le domaine « administration » s'accorde
     * n'importe quel profil sur n'importe quelle filiale : ce dispositif serait
     * un chemin d'élévation de privilège, et le seul qu'il ouvrirait.
     *
     * ⚠️ Elle est posée DANS LA BASE (`ck_delegations_pas_soi_meme`), pas dans la
     * route : une route s'oublie, une contrainte non. L'essai passe donc par la
     * route pour mesurer ce que l'appelant REÇOIT (motif Q-325), mais le refus
     * vient d'un cran plus bas. */
    const rssi = await profil('RSSI');
    const refus = await accorder({
      login: PERIMETRE_ADMIN.utilisateurId,
      profilId: rssi.id,
      perimetre: 'filiale',
      filialeId: FILIALE_A,
      fin: dansNJours(10),
      motif: 'Je m’accorde des droits à moi-même',
    });
    assert.equal(refus.statut, 409, JSON.stringify(refus.corps));
    assert.match(
      refus.corps.message,
      /soi-même/u,
      'Le refus doit NOMMER ce qu’il refuse, pas citer une contrainte.',
    );
  });

  test('la CASSE ne contourne pas la règle', async () => {
    // `Admin.GRC` et `admin.grc` sont la même personne. La contrainte compare en
    // minuscules — sans quoi la règle se contournerait en tapant une majuscule.
    const rssi = await profil('RSSI');
    const refus = await accorder({
      login: 'Admin.GRC',
      profilId: rssi.id,
      perimetre: 'filiale',
      filialeId: FILIALE_A,
      fin: dansNJours(10),
      motif: 'Contournement par la casse, qui doit échouer',
    });
    assert.equal(refus.statut, 409, JSON.stringify(refus.corps));
  });

  test('CONTRE-TÉMOIN : déléguer à QUELQU’UN D’AUTRE passe', async () => {
    /* Sans cette moitié, l'interdit ci-dessus serait satisfait par une contrainte
     * devenue « false », qui refuserait TOUT — y compris ce qu'on a le droit de
     * faire. Un garde qui n'éprouve que des refus est muet là-dessus. */
    const rssi = await profil('RSSI');
    const ok = await accorder({
      login: BENEFICIAIRE,
      profilId: rssi.id,
      perimetre: 'filiale',
      filialeId: FILIALE_A,
      fin: dansNJours(20),
      motif: 'Audit externe de trois semaines sur le périmètre de Toulouse',
    });
    assert.equal(ok.statut, 201, JSON.stringify(ok.corps));
    assert.equal(ok.corps.effetDifferé, true, 'L’écriture rappelle que l’effet est différé.');
  });
});

/* =====================================================================
 *  §2 — CE QU'UNE DÉLÉGATION N'ACCORDE JAMAIS
 * ===================================================================== */

describe('§2 — ni export, ni administration', () => {
  test('🛑 le profil d’ADMINISTRATION ne se délègue pas', async () => {
    const adminProfil = await profil('ADMIN');
    const refus = await accorder({
      login: BENEFICIAIRE,
      profilId: adminProfil.id,
      perimetre: 'groupe',
      fin: dansNJours(5),
      motif: 'Remplacement de l’administrateur pendant ses congés',
    });
    assert.equal(refus.statut, 409, JSON.stringify(refus.corps));
    assert.match(
      refus.corps.message,
      /annuaire/u,
      'Le refus doit dire OÙ se prend cette décision : dans l’annuaire.',
    );
  });

  test('une délégation n’ouvre NI l’export NI l’administration Groupe', async () => {
    /* ⚠️ C'est la propriété la plus facile à perdre en ajoutant une colonne : on
     * mesure donc ce que la RÉSOLUTION rend, pas ce que la table contient. */
    const resolus = await resoudre(BENEFICIAIRE, []);
    assert.equal(resolus.peutExporter, false, 'L’export vient de GRC-EXPORT, et de lui seul.');
    assert.equal(
      resolus.administrateur,
      false,
      'L’administration vient de GRC-ADMIN, et d’elle seule.',
    );
  });
});

/* =====================================================================
 *  §3 — ELLE OUVRE RÉELLEMENT UN ACCÈS
 * ===================================================================== */

describe('§3 — la délégation ouvre un accès, y compris sans aucun groupe', () => {
  test('AVANT / APRÈS sur le même compte, sans un seul groupe GRC-*', async () => {
    /* ⚠️ Le « avant » est indispensable : sans lui, on mesurerait un accès qui
     * existait déjà, et l'essai serait vert quoi qu'il arrive (motif Q-210).
     * Le « avant » est pris sur un compte SANS délégation. */
    const avant = await resoudre('personne.sans.delegation', []);
    assert.deepEqual(avant.filiales, [], 'Sans groupe ni délégation, aucun périmètre.');
    assert.equal(avant.domaines.size ?? Object.keys(avant.domaines).length, 0);

    const apres = await resoudre(BENEFICIAIRE, []);
    assert.deepEqual(
      apres.filiales,
      [FILIALE_A],
      'La délégation du §1 ouvre la filiale A, et elle seule.',
    );
    assert.ok(
      (apres.domaines.size ?? Object.keys(apres.domaines).length) > 0,
      'Le profil délégué ouvre ses domaines.',
    );
  });

  test('elle est ADDITIVE : elle s’ajoute aux groupes, elle ne les remplace pas', async () => {
    // Le compte porte un groupe sur la filiale B ET une délégation sur la A.
    await base.avecPerimetre(
      applicatif,
      PERIMETRE_ADMIN,
      async (client) => {
        const { rows } = await client.query(`select "id" from "profils" where "code" = 'CONTRIB'`);
        await client.query(
          `insert into "groupes_ad" ("id", "nom", "perimetre", "filiale_id", "profil_id")
               values ('GRAD-DELEG-ESSAI', 'GRC-ESSAI-CONTRIB', 'filiale', $1, $2)
           on conflict ("id") do nothing`,
          [FILIALE_B, rows[0].id],
        );
      },
      { annuler: false },
    );

    const resolus = await resoudre(BENEFICIAIRE, ['GRC-ESSAI-CONTRIB']);
    assert.deepEqual(
      [...resolus.filiales].sort(),
      [FILIALE_A, FILIALE_B].sort(),
      'Les deux périmètres coexistent : la délégation AJOUTE, elle ne remplace pas.',
    );
  });

  test('⚠️ sans LOGIN, aucune délégation n’est lue — la simulation ne ment pas', async () => {
    /* `simuler()` de l'écran des habilitations résout des droits à partir d'une
     * LISTE DE GROUPES : il ne parle de personne en particulier. Lui faire lire
     * des délégations attribuerait à un groupe ce qui a été accordé à quelqu'un,
     * et l'écran de simulation dirait faux. */
    const sansLogin = await base.avecPerimetre(
      applicatif,
      { ...PERIMETRE_ADMIN, utilisateurId: 'resolution-essai' },
      async (client) => droits.resoudreDroits(client, []),
    );
    assert.deepEqual(sansLogin.filiales, [], 'Aucun groupe, aucun login : aucun périmètre.');
  });
});

/* =====================================================================
 *  §4 — ELLE EXPIRE D'ELLE-MÊME
 * ===================================================================== */

describe('§4 — l’expiration est DÉRIVÉE, aucun traitement ne passe', () => {
  test('une délégation dont la fin est passée n’accorde plus rien', async () => {
    /* ⚠️ On ne « fait pas tourner un traitement » : on recule la date de fin dans
     * la base et l'on reconstate. C'est tout l'intérêt d'un état dérivé — une
     * délégation expirée l'est par le CALENDRIER, et il n'existe aucune fenêtre
     * pendant laquelle elle accorderait encore quelque chose. */
    await deplacerLesDates(BENEFICIAIRE, -30, -1);
    const apres = await resoudre(BENEFICIAIRE, []);
    assert.deepEqual(
      apres.filiales,
      [],
      'Une délégation expirée n’accorde plus rien, sans qu’aucun traitement soit passé.',
    );

    const { rows } = await proprietaire.query(
      `select f_etat_delegation("debut", "fin", "revoquee_le") as "etat"
         from "delegations_droits" where lower("login") = $1`,
      [BENEFICIAIRE],
    );
    assert.equal(rows[0].etat, 'expiree');
  });

  test('une délégation À VENIR n’accorde rien non plus', async () => {
    await deplacerLesDates(BENEFICIAIRE, 5, 10);
    const apres = await resoudre(BENEFICIAIRE, []);
    assert.deepEqual(apres.filiales, [], 'Une délégation à venir n’accorde rien aujourd’hui.');
  });
});

/* =====================================================================
 *  §5 — ELLE SE RÉVOQUE, ELLE NE SE SUPPRIME PAS
 * ===================================================================== */

describe('§5 — la révocation', () => {
  test('révoquer ferme l’accès et GARDE la trace', async () => {
    await deplacerLesDates(BENEFICIAIRE, 0, 10);
    const avant = await resoudre(BENEFICIAIRE, []);
    assert.deepEqual(avant.filiales, [FILIALE_A], 'Témoin : l’accès est bien rouvert.');

    const liste = await admin.appeler('GET', '/api/habilitations/delegations');
    const cible = liste.corps.delegations.find((d) => d.login === BENEFICIAIRE);
    assert.ok(cible !== undefined);

    const r = await admin.appeler(
      `POST`,
      `/api/habilitations/delegations/${cible.id}/revoquer`,
      { corps: { motif: 'La mission d’audit s’est terminée en avance', version: cible.version } },
    );
    assert.equal(r.statut, 200, JSON.stringify(r.corps));

    const apres = await resoudre(BENEFICIAIRE, []);
    assert.deepEqual(apres.filiales, [], 'L’accès est fermé.');

    // 🛑 ET LA TRACE SURVIT : ce registre doit répondre « qui a eu quoi » trois
    //    ans plus tard. Une révocation qui effacerait la ligne détruirait
    //    exactement ce qu'un auditeur vient chercher.
    const apresListe = await admin.appeler('GET', '/api/habilitations/delegations');
    const gardee = apresListe.corps.delegations.find((d) => d.id === cible.id);
    assert.ok(gardee !== undefined, 'La délégation révoquée reste au registre.');
    assert.equal(gardee.etat, 'revoquee');
    assert.match(gardee.motifRevocation, /avance/u);
    assert.equal(gardee.revoqueePar, PERIMETRE_ADMIN.utilisateurId);
  });

  test('🛑 la base REFUSE la suppression — il n’existe aucune politique', async () => {
    /* La barrière n'est pas le choix des verbes HTTP : c'est l'absence de
     * politique de suppression. On le mesure en ESSAYANT, sous le rôle
     * applicatif, avec l'administration Groupe posée. */
    const supprimees = await base.avecPerimetre(
      applicatif,
      PERIMETRE_ADMIN,
      async (client) => {
        const r = await client.query(`delete from "delegations_droits"`);
        return r.rowCount;
      },
      { annuler: false },
    );
    assert.equal(
      supprimees,
      0,
      'Aucune ligne ne doit pouvoir être supprimée : sans politique de suppression, la RLS ' +
        'filtre tout — et la trace d’un droit qui a existé survit.',
    );
    const { rows } = await proprietaire.query(`select count(*)::int as n from "delegations_droits"`);
    assert.ok(rows[0].n > 0, 'Le registre est intact.');
  });

  test('révoquer deux fois est refusé', async () => {
    const liste = await admin.appeler('GET', '/api/habilitations/delegations');
    const cible = liste.corps.delegations.find((d) => d.etat === 'revoquee');
    const r = await admin.appeler(
      'POST',
      `/api/habilitations/delegations/${cible.id}/revoquer`,
      { corps: { motif: 'Une seconde révocation', version: cible.version } },
    );
    assert.equal(r.statut, 409, 'Une révocation est une décision datée : la rejouer l’écraserait.');
  });
});

/* =====================================================================
 *  §6 — LES BORNES, ET CE QUE LES REFUS DISENT
 * ===================================================================== */

describe('§6 — les bornes nomment leur conséquence', () => {
  test('une durée de plus de 90 jours est refusée, et le refus dit pourquoi', async () => {
    const rssi = await profil('RSSI');
    const refus = await accorder({
      login: 'temporaire.long',
      profilId: rssi.id,
      perimetre: 'filiale',
      filialeId: FILIALE_A,
      fin: dansNJours(200),
      motif: 'Une délégation de plus de six mois, qui doit être refusée',
    });
    assert.equal(refus.statut, 400, JSON.stringify(refus.corps));
    assert.match(refus.corps.message, /90 jours/u);
    assert.match(
      refus.corps.message,
      /NOUVELLE décision|nouvelle décision/u,
      'Le refus doit dire ce qu’il faut faire à la place.',
    );
  });

  test('un motif creux est refusé', async () => {
    const rssi = await profil('RSSI');
    const refus = await accorder({
      login: 'motif.creux',
      profilId: rssi.id,
      perimetre: 'filiale',
      filialeId: FILIALE_A,
      fin: dansNJours(10),
      motif: 'RAS',
    });
    assert.equal(refus.statut, 400, JSON.stringify(refus.corps));
    assert.match(refus.corps.message, /auditeur lit/u);
  });

  test('« transversal » n’existe pas comme périmètre de délégation', async () => {
    const rssi = await profil('RSSI');
    const refus = await accorder({
      login: 'portee.transversale',
      profilId: rssi.id,
      perimetre: 'transversal',
      fin: dansNJours(10),
      motif: 'Une délégation transversale, qui n’existe pas',
    });
    assert.equal(refus.statut, 400, JSON.stringify(refus.corps));
    assert.match(refus.corps.message, /export/u, 'Le refus doit dire d’où vient l’export.');
  });

  test('la lecture est RÉSERVÉE : un compte sans le domaine « administration » est refusé', async () => {
    /* ⚠️ **Il est FERMÉ en fin d'essai**, et ce n'est pas de l'hygiène : un greffon
     * monté dans un `test` garde son pool ouvert, et `base.fermer()` ne peut plus
     * supprimer la base d'essai — « permission denied to terminate process ». La
     * première rédaction laissait une base orpheline sur la grappe à chaque
     * exécution, et le fichier échouait dans son `after`. Payé une fois ; c'est
     * aussi le motif des 81 bases accumulées du constat Q-321. */
    const simple = await monterGreffon(
      base,
      { ...PERIMETRE_ADMIN, utilisateurId: 'contrib', administrationGroupe: false },
      {
        authentificateur: {
          provisoire: true,
          async authentifier() {
            return {
              perimetre: { ...PERIMETRE_ADMIN, utilisateurId: 'contrib', administrationGroupe: false },
              droits: Object.freeze({
                niveau: 'contribution',
                domaines: Object.freeze(['risques']),
                niveaux: Object.freeze({ risques: 'contribution' }),
                export: false,
              }),
            };
          },
          decrire: () => 'contributeur bridé par le banc',
        },
      },
    );
    try {
      const refus = await simple.appeler('GET', '/api/habilitations/delegations');
      assert.equal(refus.statut, 403, 'Le registre des délégations dit QUI a quoi : il est réservé.');
    } finally {
      await simple.fermer();
    }
  });
});
