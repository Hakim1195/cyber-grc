/**
 * lecture.test.mjs — L'ATTESTATION DE LECTURE, PAR LA ROUTE (lot L19, action 19.1)
 *
 * ── Pourquoi « par la route », et pas en SQL ────────────────────────────────
 *
 * Le constat **Q-325** du 9ᵉ passage de la porte S8 a coûté cher pour une raison
 * simple : le code `GRC07` **était** éprouvé — en SQL direct —, et il arrivait à
 * l'utilisateur sous forme d'un **500 avec pile d'appel**. *L'essai prouvait que
 * le déclencheur se déclenche ; personne ne mesurait ce que l'utilisateur
 * reçoit.* Tout ce qui suit passe donc par `appeler()`.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | On n'atteste **que pour soi** — la personne vient de la session |
 * | 2 | La **version vient du serveur**, et elle est figée |
 * | 3 | Réattester après révision **met à jour**, ne duplique pas |
 * | 4 | La barrière de portée **arrive à l'utilisateur**, pas en 500 |
 * | 5 | Le geste est **journalisé** en action « attestation » |
 * | 6 | Le taux de couverture rend **`null`**, jamais `0`, sur un effectif nul |
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

let base;

/**
 * ⚠️ **C'est l'`id` du compte, pas son identifiant de connexion**, et la
 * distinction a coûté deux tentatives. `personnes.utilisateur_id` référence
 * `utilisateurs.id` ; et `perimetre.utilisateurId` porte lui aussi cet `id`
 * (`src/auth/index.ts` : `utilisateurId: compte.id`). Le §18.3 exige justement
 * qu'un essai provisionne le cas où les deux diffèrent — `semerJeuEssai()` crée
 * « USER-A » pour l'identifiant « rssi.toulouse » —, sans quoi on validerait une
 * coïncidence plutôt qu'une propriété.
 */
const COMPTE = 'USER-A';

function perimetreApi(utilisateurId, filialeId, filiales) {
  return {
    utilisateurId,
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe: false,
  };
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));

  const applicatif = await base.connexion('app');

  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A]),
    async (c) => {
      // La personne, RATTACHÉE au compte : c'est ce rattachement qui fait que la
      // session sait au nom de qui elle atteste.
      await c.query(
        'insert into personnes (id, filiale_id, nom, utilisateur_id) values ($1,$2,$3,$4)',
        ['PER-ATT-1', FILIALE_A, 'Claire Vasseur', COMPTE],
      );
      await c.query('insert into personnes (id, filiale_id, nom) values ($1,$2,$3)', [
        'PER-ATT-2',
        FILIALE_A,
        'Malik Benali',
      ]);
      // Un document LOCAL qui exige une attestation.
      await c.query(
        `insert into documents (id, filiale_id, titre, statut, version_document, attestation_requise)
         values ('DOC-ATT-TLS', $1, 'Charte informatique', 'en vigueur', '1.0', true)`,
        [FILIALE_A],
      );
      // Et un qui n'en exige pas — le témoin négatif.
      await c.query(
        `insert into documents (id, filiale_id, titre, statut, attestation_requise)
         values ('DOC-LIBRE', $1, 'Note de service', 'en vigueur', false)`,
        [FILIALE_A],
      );
    },
    { annuler: false },
  );

  // Un document LOCAL de la filiale voisine : la cible de la barrière.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_B, [FILIALE_B]),
    async (c) => {
      await c.query(
        `insert into documents (id, filiale_id, titre, statut, attestation_requise)
         values ('DOC-ATT-DEU', $1, 'Deutsche Richtlinie', 'en vigueur', true)`,
        [FILIALE_B],
      );
    },
    { annuler: false },
  );
});

after(async () => {
  await base?.fermer();
});

async function monterPour(compte) {
  return await monterGreffon(base, perimetreApi(compte, FILIALE_A, [FILIALE_A]));
}

describe('L’attestation de lecture, par la route', () => {
  test('§1 et §2 — j’atteste, la personne et la version viennent du SERVEUR', async () => {
    const monte = await monterPour(COMPTE);
    try {
      const { statut, corps } = await monte.appeler(
        'POST',
        '/api/attestations/documents/DOC-ATT-TLS',
        { corps: {} },
      );
      assert.equal(statut, 201, JSON.stringify(corps).slice(0, 250));
      assert.equal(corps.personne.id, 'PER-ATT-1', 'La personne est déduite de la session.');
      assert.equal(
        corps.version,
        '1.0',
        'La version attestée vient du document, pas du client : sinon on attesterait d’une ' +
          'version qu’on a choisie, et l’attestation ne vaudrait rien.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('§5 — le geste est JOURNALISÉ en action « attestation »', async () => {
    const lecture = await base.connexion('proprietaire');
    const r = await lecture.query(
      `select action, entite_type, entite_id, resume, valeurs_apres
         from journal_audit where action = 'attestation' order by numero desc limit 1`,
    );
    assert.equal(r.rows.length, 1, 'Aucune entrée « attestation » : le geste n’est pas tracé.');
    const e = r.rows[0];
    assert.equal(e.entite_type, 'documents');
    assert.equal(e.entite_id, 'DOC-ATT-TLS');
    // §29.5 : la phrase est du développeur, les valeurs sont en jsonb.
    assert.equal(e.resume, 'Attestation de lecture d’un document.');
    assert.equal(e.valeurs_apres.personne_id, 'PER-ATT-1');
    assert.equal(e.valeurs_apres.version_document, '1.0');
  });

  test('§6 — la couverture compte la version EN VIGUEUR, et le dénominateur est local', async () => {
    const monte = await monterPour(COMPTE);
    try {
      const { statut, corps } = await monte.appeler(
        'GET',
        '/api/attestations/documents/DOC-ATT-TLS',
      );
      assert.equal(statut, 200);
      assert.equal(corps.couverture.aJour, 1);

      // ⚠️ L'effectif se MESURE, il ne se suppose pas. La première rédaction
      // écrivait « 2 » — le nombre de personnes que CE fichier sème —, et le
      // semis partagé en crée une de plus : l'essai accusait le produit d'une
      // faute qui était la sienne. *Un essai qui fige une hypothèse sur son
      // décor mesure son décor.*
      // ⚠️ Et la lecture DÉCLARE son périmètre : `force row level security` vaut
      // pour le propriétaire lui-même, et une lecture sans `grc.filiales` rend
      // GRC04 — pas une liste vide. C'est le §11 des conventions, et c'est une
      // propriété du produit, pas une gêne de l'essai.
      const applicatif = await base.connexion('app');
      const attendu = await base.avecPerimetre(
        applicatif,
        perimetre('compteur', FILIALE_A, [FILIALE_A]),
        async (c) => {
          const r = await c.query(
            'select count(*)::int as n from personnes where filiale_id = $1',
            [FILIALE_A],
          );
          return r.rows[0].n;
        },
      );
      assert.equal(corps.couverture.effectif, attendu);
      assert.equal(corps.couverture.taux, Math.round((1 / attendu) * 100));
      assert.equal(corps.attestations[0].aJour, true);
    } finally {
      await monte.fermer();
    }
  });

  test('§3 — une RÉVISION rend l’attestation périmée, et la relecture MET À JOUR', async () => {
    const applicatif = await base.connexion('app');
    await base.avecPerimetre(
      applicatif,
      perimetre('reviseur', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(
          "update documents set version_document = '2.0' where id = 'DOC-ATT-TLS'",
        );
      },
      { annuler: false },
    );

    const monte = await monterPour(COMPTE);
    try {
      // Ce qui est DÛ dit le motif : « version_perimee », pas « jamais_atteste ».
      const aFaire = await monte.appeler('GET', '/api/attestations/a-faire');
      assert.equal(aFaire.statut, 200);
      const ligne = aFaire.corps.aFaire.find((d) => d.id === 'DOC-ATT-TLS');
      assert.ok(ligne, 'Une politique révisée doit redevenir « à lire ».');
      assert.equal(
        ligne.motif,
        'version_perimee',
        'Ne compter que « jamais attesté » ferait dire au produit « tout le monde est à ' +
          'jour » le lendemain d’une refonte de la PSSI.',
      );
      assert.equal(ligne.versionAttestee, '1.0');

      // Et la couverture est retombée : une attestation périmée n'en est pas une.
      const avant = await monte.appeler('GET', '/api/attestations/documents/DOC-ATT-TLS');
      assert.equal(avant.corps.couverture.aJour, 0);

      // Réattester MET À JOUR — une seule ligne, pas deux.
      const re = await monte.appeler('POST', '/api/attestations/documents/DOC-ATT-TLS', {
        corps: { commentaire: 'Relu après révision.' },
      });
      assert.equal(re.statut, 201, JSON.stringify(re.corps).slice(0, 200));

      const apres = await monte.appeler('GET', '/api/attestations/documents/DOC-ATT-TLS');
      assert.equal(
        apres.corps.attestations.length,
        1,
        'Réattester a créé une SECONDE ligne : la question est « qui a lu la version en ' +
          'vigueur », pas « combien de fois quelqu’un a cliqué ».',
      );
      assert.equal(apres.corps.attestations[0].version, '2.0');
      assert.equal(apres.corps.couverture.aJour, 1);
    } finally {
      await monte.fermer();
    }
  });

  test('§4 — le document de la filiale VOISINE est refusé, et l’utilisateur le comprend', async () => {
    const monte = await monterPour(COMPTE);
    try {
      const { statut, corps } = await monte.appeler(
        'POST',
        '/api/attestations/documents/DOC-ATT-DEU',
        { corps: {} },
      );
      // ⚠️ 404 et non 403 : distinguer « n'existe pas » de « pas votre périmètre »
      // serait l'oracle d'existence que le produit ferme depuis la porte S2.
      assert.equal(statut, 404, JSON.stringify(corps).slice(0, 250));
      assert.notEqual(
        corps.erreur,
        'erreur_interne',
        'La barrière arrive en 500 : c’est le constat Q-325, où un refus soigné devenait ' +
          'un incident serveur avec pile d’appel pour une faute de saisie.',
      );
      assert.equal(
        JSON.stringify(corps).includes('filiale_id'),
        false,
        'Le refus nomme une colonne interne : c’est le constat Q-326.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('un document qui n’exige PAS d’attestation refuse le geste, en le disant', async () => {
    const monte = await monterPour(COMPTE);
    try {
      const { statut, corps } = await monte.appeler('POST', '/api/attestations/documents/DOC-LIBRE', {
        corps: {},
      });
      assert.equal(statut, 409, JSON.stringify(corps).slice(0, 200));
      assert.equal(corps.message.length > 20, true);
    } finally {
      await monte.fermer();
    }
  });

  test('un compte SANS fiche de personnel peut consulter, jamais attester — et on lui dit pourquoi', async () => {
    // ⚠️ La moitié qui compte : le refus DIT sa raison. Une liste vide sans
    // explication est la classe des constats Q-201 / Q-207.
    const monte = await monterPour('compte.sans.fiche');
    try {
      const consultation = await monte.appeler('GET', '/api/attestations/a-faire');
      assert.equal(consultation.statut, 200);
      assert.deepEqual(consultation.corps.aFaire, []);
      assert.equal(
        consultation.corps.motif.length > 40,
        true,
        'Une liste vide sans motif apprend à ne plus croire ce que l’écran montre.',
      );

      const tentative = await monte.appeler('POST', '/api/attestations/documents/DOC-ATT-TLS', {
        corps: {},
      });
      assert.equal(tentative.statut, 403);
      assert.equal(tentative.corps.message.length > 40, true);
    } finally {
      await monte.fermer();
    }
  });

  test('CONTRÔLE DE MORSURE — nul ne peut attester au nom d’un autre', async () => {
    // La propriété centrale, et elle se vérifie en ESSAYANT : le corps de la
    // requête porte un « personne_id », et le serveur doit soit le refuser, soit
    // l'ignorer — jamais l'employer.
    const monte = await monterPour(COMPTE);
    try {
      const { statut, corps } = await monte.appeler(
        'POST',
        '/api/attestations/documents/DOC-ATT-TLS',
        { corps: { personne_id: 'PER-ATT-2' } },
      );
      if (statut === 400) {
        // Le schéma refuse la clé inconnue : c'est la bonne réponse.
        assert.equal(corps.erreur, 'donnee_invalide');
      } else {
        assert.equal(statut, 201);
        assert.equal(
          corps.personne.id,
          'PER-ATT-1',
          'Le serveur a attesté au nom de QUELQU’UN D’AUTRE : une preuve d’audit qu’un tiers ' +
            'peut fabriquer ne prouve rien.',
        );
      }
    } finally {
      await monte.fermer();
    }
  });
});
