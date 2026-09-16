/**
 * horloge.test.mjs — L'HORLOGE RÉGLEMENTAIRE, PAR LA ROUTE (lot L20, action 20.1)
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Les **quatre paliers** sont armés, avec leur référence au TEXTE |
 * | 2 | L'**origine du calcul est dite** — instant précis ou date nue |
 * | 3 | Consigner une déclaration **arrête le reste-à-courir** |
 * | 4 | Un palier qui **n'appartient pas à son régime** est refusé |
 * | 5 | La route ne franchit **pas la frontière des filiales** |
 *
 * ⚠️ Tout passe par `appeler()` — constat **Q-325** : un refus soigné en base
 * peut arriver à l'utilisateur en 500 avec pile d'appel, et seul un essai qui
 * mesure ce que l'utilisateur REÇOIT le voit.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

let base;

function perimetreApi(filialeId, filiales) {
  return {
    utilisateurId: 'USER-A',
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
      // Un incident avec l'INSTANT précis : l'horloge de 24 h est défendable.
      await c.query(
        `insert into incidents (id, filiale_id, titre, gravite, statut, date_detection,
                                detecte_le, declaration_anssi)
         values ('INC-PRECIS', $1, 'Rançongiciel sur le réseau bureautique', 'élevée',
                 'en cours', current_date, now() - interval '2 hours', 'à déclarer')`,
        [FILIALE_A],
      );
      // Un incident SANS instant : l'horloge part de minuit, et la route le dit.
      await c.query(
        `insert into incidents (id, filiale_id, titre, gravite, statut, date_detection,
                                declaration_cnil)
         values ('INC-DATE-NUE', $1, 'Fuite de données RH', 'moyenne', 'en cours',
                 current_date, 'à déclarer')`,
        [FILIALE_A],
      );
    },
    { annuler: false },
  );

  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_B, [FILIALE_B]),
    async (c) => {
      await c.query(
        `insert into incidents (id, filiale_id, titre, statut, date_detection, declaration_anssi)
         values ('INC-DEU', $1, 'Vorfall in Deutschland', 'en cours', current_date, 'à déclarer')`,
        [FILIALE_B],
      );
    },
    { annuler: false },
  );
});

after(async () => {
  await base?.fermer();
});

describe('L’horloge réglementaire, par la route', () => {
  test('§1 et §2 — quatre paliers par incident, leur TEXTE, et l’origine du calcul', async () => {
    const monte = await monterGreffon(base, perimetreApi(FILIALE_A, [FILIALE_A]));
    try {
      const { statut, corps } = await monte.appeler('GET', '/api/reglementaire/echeances');
      assert.equal(statut, 200, JSON.stringify(corps).slice(0, 200));

      const precis = corps.echeances.filter((e) => e.incidentId === 'INC-PRECIS');
      assert.equal(
        precis.length,
        4,
        'Les quatre paliers doivent être armés : 24 h, 72 h et 1 mois pour NIS2, 72 h pour ' +
          'le RGPD. Un palier manquant est une obligation que le produit cesse d’armer.',
      );

      // Chaque échéance porte SA RÉFÉRENCE AU TEXTE : un délai réglementaire
      // sans sa source est un chiffre que personne ne peut vérifier.
      for (const e of precis) {
        assert.match(
          e.texte,
          /NIS2|RGPD/,
          `Le palier « ${e.palier} » ne dit pas d’où vient son délai.`,
        );
      }

      // §2 — l'origine : instant précis ici…
      assert.equal(
        precis.every((e) => e.origine === 'instant'),
        true,
        'L’incident porte « detecte_le » : l’horloge doit le dire.',
      );

      // …et date nue là. C'est la moitié qui compte : une horloge de 24 h qui
      // part d'une date sans heure peut se tromper de 24 h, soit le premier
      // palier entier.
      const nue = corps.echeances.filter((e) => e.incidentId === 'INC-DATE-NUE');
      assert.equal(nue.length, 4);
      assert.equal(
        nue.every((e) => e.origine === 'date_seule'),
        true,
        'Sans instant de détection, la route DOIT dire que sa précision est la journée.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('le reste-à-courir est calculé, et le retard se voit', async () => {
    const monte = await monterGreffon(base, perimetreApi(FILIALE_A, [FILIALE_A]));
    try {
      const { corps } = await monte.appeler('GET', '/api/reglementaire/echeances');
      const alerte = corps.echeances.find(
        (e) => e.incidentId === 'INC-PRECIS' && e.palier === 'alerte_precoce',
      );
      assert.ok(alerte);
      // Détecté il y a 2 h, palier à 24 h : il reste ~22 h.
      assert.equal(alerte.resteHeures > 21 && alerte.resteHeures < 23, true,
        `reste = ${String(alerte.resteHeures)} h`);
      assert.equal(alerte.enRetard, false);
      assert.equal(alerte.fait, false);
    } finally {
      await monte.fermer();
    }
  });

  test('§3 — consigner la déclaration ARRÊTE le reste-à-courir', async () => {
    const monte = await monterGreffon(base, perimetreApi(FILIALE_A, [FILIALE_A]));
    try {
      const pose = await monte.appeler(
        'POST',
        '/api/reglementaire/incidents/INC-PRECIS/declarations',
        { corps: { regime: 'nis2', palier: 'alerte_precoce', reference: 'ANSSI-2026-00871' } },
      );
      assert.equal(pose.statut, 201, JSON.stringify(pose.corps).slice(0, 200));

      const { corps } = await monte.appeler('GET', '/api/reglementaire/echeances');
      const alerte = corps.echeances.find(
        (e) => e.incidentId === 'INC-PRECIS' && e.palier === 'alerte_precoce',
      );
      assert.equal(alerte.fait, true);
      assert.equal(alerte.accuseReception, 'ANSSI-2026-00871',
        'Le récépissé est LA pièce qu’un auditeur demande : « vous dites avoir déclaré — ' +
        'montrez-moi ».');
      assert.equal(
        alerte.resteHeures,
        null,
        'Un reste-à-courir sur une obligation REMPLIE n’a pas de sens, et l’afficher en ' +
          '« en retard » annoncerait un problème qui n’existe pas (classe Q-201 / Q-207).',
      );
      assert.equal(alerte.enRetard, false);

      // Les trois autres paliers, eux, restent dus : consigner l'un n'acquitte
      // pas les autres.
      const autres = corps.echeances.filter(
        (e) => e.incidentId === 'INC-PRECIS' && e.palier !== 'alerte_precoce',
      );
      assert.equal(autres.every((e) => e.fait === false), true);
    } finally {
      await monte.fermer();
    }
  });

  test('§4 — un palier qui n’appartient pas à son régime est REFUSÉ', async () => {
    // « rapport_final » n'existe pas au RGPD. Sans cette barrière, on pourrait
    // déclarer un rapport final à la CNIL, et le tableau de conformité
    // l'afficherait comme une obligation remplie.
    const monte = await monterGreffon(base, perimetreApi(FILIALE_A, [FILIALE_A]));
    try {
      const { statut, corps } = await monte.appeler(
        'POST',
        '/api/reglementaire/incidents/INC-PRECIS/declarations',
        { corps: { regime: 'rgpd', palier: 'rapport_final' } },
      );
      assert.equal(statut >= 400 && statut < 500, true, `statut = ${String(statut)}`);
      assert.notEqual(
        corps.erreur,
        'erreur_interne',
        'La barrière arrive en 500 : c’est le constat Q-325, un refus soigné devenu un ' +
          'incident serveur.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('§5 — l’incident de la filiale VOISINE n’apparaît pas, et ne se déclare pas', async () => {
    const monte = await monterGreffon(base, perimetreApi(FILIALE_A, [FILIALE_A]));
    try {
      const { corps } = await monte.appeler('GET', '/api/reglementaire/echeances');
      assert.equal(
        corps.echeances.some((e) => e.incidentId === 'INC-DEU'),
        false,
        'Un incident de la filiale voisine est ressorti : fuite entre filiales.',
      );

      const tentative = await monte.appeler(
        'POST',
        '/api/reglementaire/incidents/INC-DEU/declarations',
        { corps: { regime: 'nis2', palier: 'notification' } },
      );
      assert.equal(tentative.statut, 404);
    } finally {
      await monte.fermer();
    }
  });

  test('TÉMOIN POSITIF — une session de portée GROUPE voit les deux filiales', async () => {
    // Sans ce contrôle, le précédent serait vert sur une route qui ne rend
    // jamais rien (motif Q-210).
    const monte = await monterGreffon(base, perimetreApi(FILIALE_B, [FILIALE_A, FILIALE_B]));
    try {
      const { corps } = await monte.appeler('GET', '/api/reglementaire/echeances');
      assert.equal(
        corps.echeances.some((e) => e.incidentId === 'INC-DEU'),
        true,
        'La route ne rend rien même en portée Groupe : le contrôle de cloisonnement ' +
          'ci-dessus ne mesurerait donc rien.',
      );
      assert.equal(corps.echeances.some((e) => e.incidentId === 'INC-PRECIS'), true);
    } finally {
      await monte.fermer();
    }
  });

  test('quand il n’y a rien à déclarer, l’écran peut DIRE pourquoi', async () => {
    const applicatif = await base.connexion('app');
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(
          "update incidents set declaration_anssi = 'non requise', declaration_cnil = 'non requise' " +
            "where id in ('INC-PRECIS','INC-DATE-NUE')",
        );
      },
      { annuler: false },
    );

    const monte = await monterGreffon(base, perimetreApi(FILIALE_A, [FILIALE_A]));
    try {
      const { corps } = await monte.appeler('GET', '/api/reglementaire/echeances');
      assert.deepEqual(corps.echeances, []);
      assert.equal(
        corps.motif.length > 20,
        true,
        'Une liste vide sans motif apprend à ne plus croire ce que l’écran montre.',
      );
    } finally {
      await monte.fermer();
    }
  });
});
