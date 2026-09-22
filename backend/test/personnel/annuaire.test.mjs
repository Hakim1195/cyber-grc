/**
 * annuaire.test.mjs — **l'annuaire du produit alimenté depuis l'Active Directory.**
 *
 * ── Ce que ce fichier éprouve, et ce qu'il ne peut pas éprouver ──────────────
 *
 * Le banc n'a pas d'annuaire : les deux routes d'écriture refusent alors en
 * **503**, et c'est le bon comportement — dit en toutes lettres plutôt que rendu
 * comme une liste vide. *Une liste vide ferait croire que l'annuaire du client
 * ne contient personne.*
 *
 * Ce qui se mesure ici, c'est donc **la porte** : ce qui est refusé, et ce que
 * le refus dit. Tout se joue **en HTTP** — leçon du constat **Q-325**, où
 * dix-huit essais mesuraient une fonction sous un périmètre déjà posé et aucun
 * ne voyait ce que l'appelant reçoit.
 *
 * ── Les trois propriétés qui tiennent ce lot ────────────────────────────────
 *
 *  1. **on n'aspire pas un annuaire** : la recherche exige un filtre, refusé en
 *     deçà de deux caractères ;
 *  2. **un import reste un geste** : au-delà de deux cents personnes c'est un
 *     transfert de données personnelles, et ce bouton ne porte pas cette
 *     décision ;
 *  3. **le champ `_compteAd` est SERVI**, sans quoi l'écran ne peut pas dire
 *     qu'une fiche correspond à un compte — ce qui était le cas depuis la
 *     migration `002` : le rattachement était alimenté à chaque connexion, et lu
 *     par personne.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

let base;
let applicatif;
let site;

const PERIMETRE_SITE = {
  utilisateurId: 'essai-personnel',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A],
  perimetreGroupe: false,
  administrationGroupe: false,
};

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  site = await monterGreffon(base, PERIMETRE_SITE);
});

after(async () => {
  await site?.fermer();
  await applicatif?.end?.();
  await base?.fermer();
});

describe('§1 — la recherche n’aspire pas un annuaire', () => {
  test('un filtre trop court est refusé en 400, et le refus DIT pourquoi', async () => {
    const { statut, corps } = await site.appeler('GET', '/api/personnel/annuaire?recherche=a');
    assert.equal(statut, 400);
    assert.match(
      String(corps.message),
      /aspire pas/i,
      'le refus doit dire la RAISON — importer tout l’AD, c’est importer les données ' +
        'personnelles de gens qui ne sont pas utilisateurs de l’outil',
    );
  });

  test('sans filtre du tout, même refus', async () => {
    const { statut } = await site.appeler('GET', '/api/personnel/annuaire');
    assert.equal(statut, 400);
  });

  test('avec un filtre valable et SANS annuaire, elle DIT qu’il n’y a rien à interroger', async () => {
    // ⚠️ **503 et non « liste vide ».** « Aucun annuaire à interroger » et « personne
    //    ne correspond » sont deux faits différents, et les confondre ferait croire
    //    à l'exploitant que l'annuaire de son client ne contient personne. C'est la
    //    classe des constats Q-201 / Q-207, du côté de l'absence de configuration.
    const { statut, corps } = await site.appeler(
      'GET',
      '/api/personnel/annuaire?recherche=martin',
    );
    assert.equal(statut, 503);
    assert.match(String(corps.message), /rien à chercher/i);
  });

  test('l’ENTRÉE est validée AVANT la disponibilité — l’ordre n’est pas indifférent', async () => {
    // Un filtre d'un caractère est malformé que l'annuaire soit configuré ou non.
    // Rendre 503 enverrait l'exploitant vérifier sa configuration pour une faute
    // de frappe.
    const { statut } = await site.appeler('GET', '/api/personnel/annuaire?recherche=x');
    assert.equal(statut, 400, 'la faute de saisie doit primer sur l’absence d’annuaire');
  });
});

describe('§2 — l’import reste un GESTE', () => {
  test('sans annuaire configuré, il refuse en 503 et dit le repli', async () => {
    const { statut, corps } = await site.appeler('POST', '/api/personnel/annuaire/importer', {
      corps: { logins: ['rssi.tls'] },
    });
    assert.equal(statut, 503);
    assert.match(String(corps.message), /à la main/i);
  });

  test('une liste vide est refusée en 400', async () => {
    const { statut } = await site.appeler('POST', '/api/personnel/annuaire/importer', {
      corps: { logins: [] },
    });
    assert.equal(statut, 400);
  });

  test('🛑 au-delà de deux cents personnes, c’est un TRANSFERT et il est refusé', async () => {
    const logins = Array.from({ length: 201 }, (_, i) => `compte.${String(i)}`);
    const { statut, corps } = await site.appeler('POST', '/api/personnel/annuaire/importer', {
      corps: { logins },
    });
    assert.equal(statut, 400);
    assert.match(
      String(corps.message),
      /transfert/i,
      'la borne n’est pas technique : au-delà, c’est une décision que ce bouton ne porte pas',
    );
  });

  test('le rafraîchissement refuse aussi sans annuaire', async () => {
    const { statut } = await site.appeler('POST', '/api/personnel/annuaire/rafraichir', {
      corps: {},
    });
    assert.equal(statut, 503);
  });
});

describe('§3 — `_compteAd` est SERVI à l’écran', () => {
  test('une fiche rattachée porte le champ ; une fiche saisie à la main ne le porte pas', async () => {
    // Matière : les DEUX cas. Sans eux, « le champ existe » ne prouverait pas
    // qu'il DISTINGUE (motif du constat Q-210).
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur-personnel', FILIALE_A, [FILIALE_A]),
      async (c) => {
        const u = await c.query('select "id" from "utilisateurs" order by "identifiant" limit 1');
        await c.query(
          `insert into personnes (id, filiale_id, utilisateur_id, nom, fonction)
                values ('PERS-AD-1', $1, $2, 'Camille Rattachée', 'RSSI')`,
          [FILIALE_A, u.rows[0]?.id ?? null],
        );
        await c.query(
          `insert into personnes (id, filiale_id, nom, fonction)
                values ('PERS-AD-2', $1, 'Dominique Saisie', 'Contributeur')`,
          [FILIALE_A],
        );
      },
      { annuler: false },
    );

    const { statut, corps } = await site.appeler('GET', '/api/donnees');
    assert.equal(statut, 200);
    const personnes = corps.data.personnes;
    const rattachee = personnes.find((p) => p.id === 'PERS-AD-1');
    const saisie = personnes.find((p) => p.id === 'PERS-AD-2');

    assert.ok(rattachee, 'contrôle de matière : la fiche rattachée doit être servie');
    assert.ok(saisie, 'contrôle de matière : la fiche saisie à la main doit l’être aussi');
    assert.ok(
      rattachee._compteAd,
      'sans ce champ, l’écran « Personnel » ne peut PAS dire qu’une fiche correspond à un ' +
        'compte — ce qui était le cas depuis la migration 002 : le rattachement était ' +
        'alimenté à chaque connexion, et lu par personne.',
    );
    /* ⚠️ **Une valeur nulle est servie comme une CHAÎNE VIDE**, comme toute colonne
     * textuelle du produit — et c'est ce que l'écran doit savoir : il teste la
     * vérité de la valeur, pas son égalité à `null`. L'assertion le fige, parce
     * qu'un jour où la couche servirait `null` à la place, un écran qui écrirait
     * `=== null` se mettrait à afficher le badge sur toutes les fiches. */
    assert.equal(saisie._compteAd, '', 'une fiche saisie à la main ne porte aucun compte');
    assert.ok(!saisie._compteAd, 'et la valeur doit être FAUSSE : c’est ce que l’écran teste');
  });

  test('le champ n’est PAS écrivable : le souligné initial l’écarte à l’entrée', async () => {
    const { statut, corps } = await site.appeler('POST', '/api/entites/personnes', {
      corps: { nom: 'Forgeur', _compteAd: 'UTIL-FORGE' },
    });
    assert.ok(statut === 201 || statut === 400, `reçu ${statut} — ${JSON.stringify(corps)}`);
    if (statut !== 201) return;

    const lignes = await base.avecPerimetre(
      applicatif,
      perimetre('lecteur', FILIALE_A, [FILIALE_A]),
      async (c) => {
        const r = await c.query('select "utilisateur_id" from "personnes" where "id" = $1', [
          corps.id,
        ]);
        return r.rows;
      },
    );
    assert.equal(
      lignes[0].utilisateur_id,
      null,
      'un rattachement FORGÉ par le client est la seule chose que ce champ ne doit jamais ' +
        'accepter : il dirait qu’une fiche correspond à un compte qui n’est pas le sien.',
    );
  });
});
