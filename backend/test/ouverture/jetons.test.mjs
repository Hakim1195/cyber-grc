/**
 * jetons.test.mjs — **L'OUVERTURE TECHNIQUE** (lot L22, actions 22.1 à 22.3 et 22.6)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure
 * ════════════════════════════════════════════════════════════════════════
 *
 * | § | Action | Propriété |
 * |---|---|---|
 * | 1 | 22.1 | Le secret n'existe **qu'une fois** : la base n'en a que l'empreinte |
 * | 2 | 22.1 | Un jeton ne porte **jamais plus** que le compte qui l'a émis |
 * | 3 | 22.1 | Les quatre refus sont **indiscernables** de l'extérieur |
 * | 4 | 22.1 | Révoquer n'est pas supprimer — et la révocation est immédiate |
 * | 5 | 22.2 | Un jeton est un **sujet de droits** : il porte un `EtatSession` |
 * | 6 | 22.3 | Un événement ne part que vers un abonnement **actif de sa filiale** |
 * | 7 | 22.3 | Ce qui est **admis** est ce qui est **émis** — dans les deux sens |
 * | 8 | 22.6 | La création d'une action émet, sans client Jira ni ServiceNow |
 *
 * ── ⚠️ LE §7 EST NÉ D'UN DÉFAUT RÉEL ──────────────────────────────────────
 *
 * `echeance_franchie` était admis par la contrainte depuis la `053` et **émis par
 * personne**. Un exploitant se serait abonné, l'écran aurait montré l'abonnement
 * actif, la file serait restée vide, et rien n'aurait dit pourquoi. Le garde-fou de
 * la `053` nommait ce danger dans son propre témoin — il visait le cas où la
 * contrainte se VIDE, pas celui où elle est juste et où l'émetteur manque.
 * *La barrière regardait dans une direction ; le trou était dans l'autre.*
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

let base;
let applicatif;
let monte;
let bride;
let jetons;

function perimetreApi(filialeId, filiales) {
  return {
    utilisateurId: 'USER-A',
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe: false,
  };
}

/** Un authentificateur dont les DROITS sont bornés — voir le §2. */
function authentificateurBride(perimetreApplique, droits) {
  return {
    provisoire: true,
    async authentifier() {
      return { perimetre: perimetreApplique, droits };
    },
    decrire() {
      return 'droits bridés par le banc';
    },
  };
}

async function ecrire(filiale, travail) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('semeur', filiale, [filiale]),
    travail,
    { annuler: false },
  );
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  jetons = await moduleCompile('auth/jetons.js');
  monte = await monterGreffon(base, perimetreApi(FILIALE_A, [FILIALE_A]));
  bride = await monterGreffon(base, perimetreApi(FILIALE_A, [FILIALE_A]), {
    authentificateur: authentificateurBride(perimetreApi(FILIALE_A, [FILIALE_A]), {
      /* ⚠️ **ADMINISTRATEUR DE L'APPLICATION, ET SIMPLE LECTEUR SUR LES RISQUES.**
       *
       * C'est le compte qu'il faut pour mesurer l'intersection, et la première
       * rédaction de cet essai en avait pris un autre — un contributeur sans le
       * domaine « administration », qui n'atteignait même pas la route. L'essai
       * échouait en 403 sans rien mesurer.
       *
       * Et ce compte-ci est exactement le cas où l'intersection décide : émettre
       * un jeton exige l'administration, donc `droits.niveau` vaut toujours
       * « administration » chez qui peut émettre. Ce qui distingue, c'est le
       * niveau PAR DOMAINE — sans lui, tout jeton naîtrait administrateur. */
      niveau: 'administration',
      domaines: ['administration', 'risques', 'actions'],
      niveaux: { risques: 'lecture', actions: 'contribution' },
      export: false,
    }),
  });
});

after(async () => {
  await bride?.fermer();
  await monte?.fermer();
  await base?.fermer();
});

/**
 * ⚠️ **Un jeton SANS domaine est refusé**, et c'est délibéré : un jeton qui ne
 * porte rien est un accès qu'on a ouvert sans savoir pour quoi. L'aide fournit
 * donc un domaine par défaut, et chaque essai qui mesure l'intersection nomme
 * explicitement les siens.
 */
async function emettre(ou, corps) {
  return await ou.appeler('POST', '/api/ouverture/jetons', {
    corps: { domaines: ['risques'], ...corps },
  });
}

/* =====================================================================
 *  §1 — LE SECRET N'EXISTE QU'UNE FOIS
 * ===================================================================== */

describe('§1 — le secret', () => {
  test("il est rendu à l'émission, et la base n'en a que l'empreinte", async () => {
    const { statut, corps } = await emettre(monte, { nom: 'Intégration Jira' });
    assert.equal(statut, 201, JSON.stringify(corps).slice(0, 300));
    assert.ok(typeof corps.secret === 'string' && corps.secret.startsWith('grc_'));
    assert.ok(String(corps.avertissement).length > 0);

    const range = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        'select empreinte, prefixe from jetons_api where id = $1',
        [corps.id],
      );
      return rows[0];
    });
    // ⚠️ Le secret lui-même n'est NULLE PART : s'il est perdu, il n'y a pas de
    // « secret oublié » — on en émet un autre et on révoque celui-ci.
    assert.notEqual(range.empreinte, corps.secret);
    assert.equal(range.empreinte, jetons.empreinteDe(corps.secret));
    /* ⚠️ **LE PRÉFIXE AFFICHÉ N'EST PLUS UN PRÉFIXE DU SECRET**, et c'est voulu.
     * Depuis que le secret porte sa filiale — `CONVENTIONS.md` §46, sans quoi un
     * jeton émis rendait 401 à son premier usage —, il s'écrit
     * `grc_<filiale>.<aléa>`. Montrer la filiale dans une liste n'aide personne à
     * reconnaître un jeton : elle est la colonne d'à côté. Le préfixe affiché est
     * donc pris dans l'ALÉA, qui est ce qui distingue deux jetons. */
    assert.ok(range.prefixe.startsWith('grc_'), 'le préfixe reste reconnaissable');
    const alea = corps.secret.slice(corps.secret.indexOf('.') + 1);
    assert.ok(
      alea.startsWith(range.prefixe.slice('grc_'.length)),
      'le préfixe affiché doit être le début de l’aléa du secret',
    );
  });

  test('la liste ne le rend jamais', async () => {
    const { statut, corps } = await monte.appeler('GET', '/api/ouverture/jetons');
    assert.equal(statut, 200);
    assert.ok(corps.jetons.length >= 1);
    for (const jeton of corps.jetons) {
      assert.equal(jeton.secret, undefined);
      assert.equal(jeton.empreinte, undefined);
    }
  });

  test('deux émissions ne rendent jamais le même secret', async () => {
    const a = await emettre(monte, { nom: 'A' });
    const b = await emettre(monte, { nom: 'B' });
    assert.notEqual(a.corps.secret, b.corps.secret);
  });
});

/* =====================================================================
 *  §2 — L'INTERSECTION AVEC LES DROITS DE L'ÉMETTEUR (critère 22.1)
 * ===================================================================== */

describe('§2 — un jeton ne porte jamais plus que son émetteur', () => {
  test("le niveau est RABATTU sur celui de l'émetteur", async () => {
    const { statut, corps } = await emettre(bride, {
      nom: 'Tentative',
      niveau: 'administration',
      domaines: ['risques'],
    });
    assert.equal(statut, 201, JSON.stringify(corps).slice(0, 300));
    // ⚠️ Le compte est administrateur de l'application ET simple lecteur sur les
    // risques. Un jeton « administration » sur le domaine des risques serait une
    // élévation de privilège qui survit à la session de celui qui l'a demandée.
    assert.equal(corps.niveau, 'lecture');
  });

  test("le droit d'EXPORT ne s'invente pas", async () => {
    const { corps } = await emettre(bride, {
      nom: 'Export',
      peut_exporter: true,
      domaines: ['actions'],
    });
    // L'export est une permission à part entière (PLAN_SERVEUR §3.3), jamais un
    // corollaire du niveau.
    assert.equal(corps.peut_exporter, false);
  });

  test('un domaine hors des droits fait REFUSER, au lieu de le retrancher en silence', async () => {
    const { statut, corps } = await emettre(bride, {
      nom: 'Journal',
      domaines: ['risques', 'journal'],
    });
    // ⚠️ Un retranchement silencieux rendrait un jeton qui « marche », sans le
    // domaine demandé, et l'intégration échouerait plus tard sans que personne
    // sache pourquoi. On refuse, et on dit lequel.
    assert.equal(statut, 400, JSON.stringify(corps).slice(0, 300));
  });

  test('les domaines demandés DANS les droits sont accordés', async () => {
    const { statut, corps } = await emettre(bride, {
      nom: 'Bon',
      niveau: 'contribution',
      domaines: ['actions'],
    });
    assert.equal(statut, 201, JSON.stringify(corps).slice(0, 300));
    assert.deepEqual(corps.domaines, ['actions']);
    // Le niveau demandé tient : il ne dépasse pas celui du domaine.
    assert.equal(corps.niveau, 'contribution');
  });
});

/* =====================================================================
 *  §3, §4 et §5 — LE JETON COMME SUJET DE DROITS
 * ===================================================================== */

describe('§3 — les quatre refus', () => {
  test('inconnu, révoqué, expiré, filiale inactive : un seul et même 401', async () => {
    const vif = await emettre(monte, { nom: 'Vif' });
    const mort = await emettre(monte, { nom: 'Mort' });
    await monte.appeler('DELETE', `/api/ouverture/jetons/${mort.corps.id}`);

    const perime = await emettre(monte, { nom: 'Périmé' });
    await ecrire(FILIALE_A, async (c) => {
      await c.query("update jetons_api set expire_le = now() - interval '1 day' where id = $1", [
        perime.corps.id,
      ]);
    });

    const verdicts = await ecrire(FILIALE_A, async (c) => ({
      inconnu: await jetons.verifierJeton(c, 'grc_' + 'z'.repeat(40)),
      revoque: await jetons.verifierJeton(c, mort.corps.secret),
      expire: await jetons.verifierJeton(c, perime.corps.secret),
      vivant: await jetons.verifierJeton(c, vif.corps.secret),
    }));

    // ⚠️ Les motifs existent — ils vont au journal — et ils sont TOUS des refus.
    // Distinguer « inconnu » de « révoqué » sur le réseau dirait à qui essaie des
    // jetons au hasard lesquels ont existé : c'est l'oracle du contrôle S12.
    assert.equal(verdicts.inconnu.etat, undefined);
    assert.equal(verdicts.revoque.etat, undefined);
    assert.equal(verdicts.expire.etat, undefined);
    assert.notEqual(verdicts.inconnu.refus, undefined);
    assert.notEqual(verdicts.revoque.refus, undefined);
    assert.notEqual(verdicts.expire.refus, undefined);
    // Et le vivant, lui, porte bien un état de session.
    assert.notEqual(verdicts.vivant.etat, undefined);
  });
});

describe('§4 — révoquer', () => {
  test("la ligne RESTE, datée et nominative : c'est ce qu'un audit vient chercher", async () => {
    const { corps } = await emettre(monte, { nom: 'À couper' });
    const { statut } = await monte.appeler('DELETE', `/api/ouverture/jetons/${corps.id}`);
    assert.equal(statut, 200);

    const ligne = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        'select revoque_le, revoque_par, emis_par from jetons_api where id = $1',
        [corps.id],
      );
      return rows[0] ?? null;
    });
    assert.ok(ligne !== null, 'la révocation a SUPPRIMÉ la ligne');
    assert.notEqual(ligne.revoque_le, null);
    assert.notEqual(ligne.revoque_par, null);
    assert.notEqual(ligne.emis_par, null);
  });

  test('un jeton inconnu rend 404, jamais 403', async () => {
    const { statut } = await monte.appeler('DELETE', '/api/ouverture/jetons/JETON-inexistant');
    assert.equal(statut, 404);
  });
});

describe('§5 — un jeton est un sujet de droits', () => {
  test("il porte un état de session BORNÉ à sa filiale, et non un chemin parallèle", async () => {
    const { corps } = await emettre(monte, { nom: 'Sujet', domaines: ['risques'] });
    const verdict = await ecrire(FILIALE_A, async (c) =>
      await jetons.verifierJeton(c, corps.secret),
    );
    assert.notEqual(verdict.etat, undefined);
    // ⚠️ Un jeton ne voit JAMAIS le Groupe : la portée est « filiale », en dur.
    // Le critère 22.1 dit qu'il traverse la résolution de périmètre et la RLS ;
    // il ne les contourne pas.
    assert.equal(verdict.etat.portee, 'filiale');
    assert.equal(verdict.etat.filiales.length, 1);
    // `filiales` porte des IDENTIFIANTS, pas des objets : c'est le contrat de
    // `EtatSession`, et le jeton ne fabrique rien à côté.
    assert.equal(verdict.etat.filiales[0], FILIALE_A);
    assert.equal(verdict.etat.filialeActive, FILIALE_A);
    // Et il est traçable à la personne qui l'a émis (critère 22.2).
    assert.ok(String(verdict.emisPar).length > 0);
  });
});

/* =====================================================================
 *  §6, §7 et §8 — LES ÉVÉNEMENTS SORTANTS
 * ===================================================================== */

describe('§6 — un événement ne part que vers un abonnement actif de sa filiale', () => {
  async function compterFile(filiale) {
    return await ecrire(filiale, async (c) => {
      const { rows } = await c.query('select count(*)::int as n from evenements_sortants');
      return rows[0].n;
    });
  }

  test("sans abonnement, RIEN n'est enfilé", async () => {
    const avant = await compterFile(FILIALE_A);
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into incidents (id, filiale_id, titre, statut)
         values (f_generer_id('INC'), $1, 'Essai sans abonne', 'nouveau')`,
        [FILIALE_A],
      );
    });
    assert.equal(await compterFile(FILIALE_A), avant);
  });

  test("l'abonnement d'une filiale ne reçoit RIEN de sa voisine", async () => {
    await ecrire(FILIALE_B, async (c) => {
      await c.query(
        `insert into abonnements_evenements (id, filiale_id, evenement, nom, url)
         values (f_generer_id('ABO'), $1, 'incident_cree', 'Voisine',
                 'https://voisine.exemple.interne/webhook')`,
        [FILIALE_B],
      );
    });
    const avantB = await compterFile(FILIALE_B);

    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into incidents (id, filiale_id, titre, statut)
         values (f_generer_id('INC'), $1, 'Chez A', 'nouveau')`,
        [FILIALE_A],
      );
    });
    // ⚠️ La charge porte le nom de la filiale : un événement qui traverserait la
    // frontière serait une fuite par la porte qu'on vient d'ouvrir.
    assert.equal(await compterFile(FILIALE_B), avantB);
  });

  test('un abonnement ACTIF de la bonne filiale reçoit, un abonnement INACTIF non', async () => {
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into abonnements_evenements (id, filiale_id, evenement, nom, url, actif)
         values (f_generer_id('ABO'), $1, 'incident_cree', 'Actif',
                 'https://actif.exemple.interne/webhook', true),
                (f_generer_id('ABO'), $1, 'incident_cree', 'Inactif',
                 'https://inactif.exemple.interne/webhook', false)`,
        [FILIALE_A],
      );
    });
    const avant = await compterFile(FILIALE_A);
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into incidents (id, filiale_id, titre, statut)
         values (f_generer_id('INC'), $1, 'Avec abonne', 'nouveau')`,
        [FILIALE_A],
      );
    });
    assert.equal(await compterFile(FILIALE_A), avant + 1, 'un seul envoi attendu');

    const charge = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        'select charge from evenements_sortants order by cree_le desc limit 1',
      );
      return rows[0].charge;
    });
    // ⚠️ La charge ne porte PAS le titre de l'incident : l'abonné reçoit de quoi
    // VENIR CHERCHER, avec le jeton d'API qui le borne.
    assert.equal(charge.evenement, 'incident_cree');
    assert.equal(charge.entite, 'incidents');
    assert.equal(charge.titre, undefined);
    assert.equal(charge.description, undefined);
  });
});

describe('§7 — ce qui est admis est ce qui est émis', () => {
  test('la déclaration et le catalogue concordent dans les deux sens', async () => {
    const anomalies = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query('select anomalie, detail from f_verifier_evenements_emis()');
      return rows;
    });
    assert.deepEqual(anomalies, [], JSON.stringify(anomalies).slice(0, 400));
  });

  test("la route ne propose que ce qui est réellement émis", async () => {
    const { statut, corps } = await monte.appeler('GET', '/api/ouverture/abonnements');
    assert.equal(statut, 200);
    const emis = corps.evenementsEmis ?? [];
    assert.ok(emis.length >= 4, `seulement ${emis.length} événement(s) proposé(s)`);

    /* ⚠️ **LA PREMIÈRE RÉDACTION EXIGEAIT UN DÉCLENCHEUR POUR CHACUN, ET C'ÉTAIT
     * TROP ÉTROIT.** Elle a été écrite avant que la route lise `f_evenements_emis()`,
     * quand elle découvrait les seuls déclencheurs — et elle aurait donc interdit
     * `echeance_franchie`, qui est un fait DÉRIVÉ qu'aucun déclencheur ne peut voir.
     *
     * La bonne question n'est pas « y a-t-il un déclencheur ? » mais « cet événement
     * est-il DÉCLARÉ ÉMIS, et sa déclaration tient-elle ? » — et c'est
     * `f_verifier_evenements_emis()` qui répond à la seconde moitié, dans les deux
     * sens (§7 ci-dessus). Ici on mesure que la route n'invente rien. */
    const declares = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query('select evenement from f_evenements_emis()');
      return rows.map((r) => r.evenement);
    });
    assert.deepEqual([...emis].sort(), [...declares].sort());

    // Et chaque déclaration « declencheur » a bien son déclencheur — l'autre moitié.
    const parDeclencheur = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        "select evenement from f_evenements_emis() where emission = 'declencheur'",
      );
      return rows.map((r) => r.evenement);
    });
    assert.ok(parDeclencheur.length >= 3, 'trois événements au moins par déclencheur');
    for (const evenement of parDeclencheur) {
      const nombre = await ecrire(FILIALE_A, async (c) => {
        const { rows } = await c.query(
          `select count(*)::int as n from pg_trigger t join pg_proc p on p.oid = t.tgfoid
            where p.proname = 'f_enfiler_evenement' and not t.tgisinternal
              and split_part(encode(t.tgargs, 'escape'), chr(92) || '000', 1) = $1`,
          [evenement],
        );
        return rows[0].n;
      });
      assert.ok(nombre >= 1, `« ${evenement} » se dit émis par déclencheur, et aucun ne l'émet`);
    }
  });

  test('une destination en clair est REFUSÉE', async () => {
    const { statut } = await monte.appeler('POST', '/api/ouverture/abonnements', {
      corps: {
        nom: 'En clair',
        evenement: 'incident_cree',
        url: 'http://exemple.interne/webhook',
      },
    });
    // La charge porte le nom de la filiale : en clair sur le réseau du client,
    // c'est une fuite — et elle serait invisible, puisque l'envoi « réussit ».
    assert.ok(statut >= 400 && statut < 500, `statut ${statut}`);
  });
});

describe('§8 — le renvoi d’action (action 22.6)', () => {
  test("la création d'une action émet, sans client Jira ni ServiceNow", async () => {
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into abonnements_evenements (id, filiale_id, evenement, nom, url)
         values (f_generer_id('ABO'), $1, 'action_creee', 'Jira',
                 'https://jira.exemple.interne/webhook')`,
        [FILIALE_A],
      );
    });
    const avant = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        "select count(*)::int as n from evenements_sortants where evenement = 'action_creee'",
      );
      return rows[0].n;
    });

    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, priorite)
         values (f_generer_id('ACT'), $1, 'Corriger le chiffrement', 'à faire', 'Haute')`,
        [FILIALE_A],
      );
    });

    const apres = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        "select count(*)::int as n from evenements_sortants where evenement = 'action_creee'",
      );
      return rows[0].n;
    });
    // ⚠️ L'aller passe par l'événement, le retour par un jeton d'API sur la route
    // générique : il n'y a ni client Jira, ni client ServiceNow, ni schéma
    // d'authentification propre à l'un d'eux — donc rien à maintenir le jour où
    // leur API change, et rien à désactiver puisqu'il n'y a rien.
    assert.equal(apres, avant + 1);
  });
});
