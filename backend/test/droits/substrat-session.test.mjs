/**
 * substrat-session.test.mjs — **la condition d'entrée E1, éprouvée dans les deux sens.**
 *
 * ── Ce qui est en jeu ────────────────────────────────────────────────────────
 *
 * `CONVENTIONS.md` §22, ligne **E1** : « `sessions`, `session_filiales` et
 * `session_domaines` ne sont plus écrivables sans condition par le rôle applicatif ».
 * Jusqu'à la migration `007`, ces trois tables étaient **intégralement
 * réinscriptibles** — n'importe quel chemin de code pouvait fabriquer une session, lui
 * donner les vingt filiales et le drapeau d'administration, puis s'en servir.
 *
 * ── Pourquoi ce fichier n'éprouve pas seulement le succès ────────────────────
 *
 * `CONVENTIONS.md` §20.2 : *un garde-fou se vérifie dans les deux sens.* Un banc qui
 * montre seulement que la transaction d'ouverture réussit ne démontre aucune barrière —
 * il démontre qu'un chemin existe. Chaque contrôle est donc joué **deux fois** : la
 * session ordinaire est refusée, la transaction d'authentification passe.
 *
 * Trois pièges y sont éprouvés explicitement, parce qu'ils ont chacun une histoire :
 *
 *  1. **`grc.administration_groupe` ne remplace pas `grc.authentification`.** Réutiliser
 *     le drapeau d'administration aurait signifié que toute connexion s'ouvre en
 *     administration Groupe. Une session qui le pose est refusée ici comme une autre.
 *  2. **Le réglage ne survit pas à sa transaction** (constat N-4 de la porte S1) : la
 *     même connexion, réemployée, n'écrit plus rien. C'est ce qui rend la barrière
 *     compatible avec un pool.
 *  3. **`update` et `delete` sont SILENCIEUX** quand le `using` ne passe pas : zéro
 *     ligne, aucun message. C'est écrit dans la migration, c'est mesuré ici, et c'est
 *     pour cela que `src/auth/sessions.ts` compte les lignes affectées.
 *
 * Enfin, le garde-fou neuf `f_verifier_substrat_session()` est éprouvé **par mutation** :
 * on rouvre une politique, on montre qu'il rougit, on répare, on montre qu'il redevient
 * vert. Un garde-fou qu'on n'a jamais vu échouer n'est pas un garde-fou.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let proprietaire;
/** @type {import('pg').Client} */
let applicatif;

const FILIALE = 'FIL-E1-TLS';
const UTILISATEUR = 'USR-E1-RSSI';

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  applicatif = await base.connexion('app');

  // Le décor : une filiale et un compte, posés par les chemins légitimes.
  await base.avecPerimetre(
    applicatif,
    perimetre('decor', null, [], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale) values ($1, 'ZZE1A', 'Essai E1')`,
        [FILIALE],
      );
    },
    { annuler: false },
  );

  await base.avecPerimetre(
    applicatif,
    perimetre('decor', FILIALE, [FILIALE]),
    async (c) => {
      // L'écriture d'`utilisateurs` exige désormais l'un des deux réglages : la
      // migration 007 §3 y a ajouté la transaction d'ouverture de session.
      await c.query(`select set_config('grc.authentification', 'oui', true)`);
      await c.query(
        `insert into utilisateurs (id, identifiant, nom_affichage) values ($1, 'essai.e1', 'Essai E1')`,
        [UTILISATEUR],
      );
    },
    { annuler: false },
  );
});

after(async () => {
  await base?.fermer();
});

/** Insère une session, et rend l'erreur PostgreSQL s'il y en a une. */
async function tenterOuverture(p, avecAuthentification, suffixe) {
  try {
    await base.avecPerimetre(applicatif, p, async (c) => {
      if (avecAuthentification) await c.query(`select set_config('grc.authentification', 'oui', true)`);
      await c.query(
        `insert into sessions (id, jeton_empreinte, utilisateur_id, filiale_active_id, perimetre, expire_le)
             values ($1, $2, $3, $4, 'filiale', now() + interval '1 hour')`,
        [`SESS-${suffixe}`, suffixe.padEnd(64, '0').slice(0, 64).replace(/[^0-9a-f]/g, '0'), UTILISATEUR, FILIALE],
      );
      await c.query(`insert into session_filiales (session_id, filiale_id) values ($1, $2)`, [
        `SESS-${suffixe}`,
        FILIALE,
      ]);
      await c.query(
        `insert into session_domaines (session_id, domaine, niveau) values ($1, 'risques', 'contribution')`,
        [`SESS-${suffixe}`],
      );
    });
    return null;
  } catch (erreur) {
    return erreur;
  }
}

describe('E1 — le substrat de session n’est plus écrivable sans condition', () => {
  test('une session applicative ORDINAIRE ne peut plus ouvrir de session', async () => {
    const erreur = await tenterOuverture(perimetre('alice', FILIALE, [FILIALE]), false, 'a1');
    assert.notEqual(erreur, null, 'Le refus est la propriété centrale de la condition E1.');
    assert.equal(erreur.code, '42501', 'Refus de politique, pas de contrainte.');
    assert.match(erreur.message, /row-level security/);
  });

  test('poser grc.administration_groupe ne suffit PAS — c’est un autre drapeau', async () => {
    // Le piège que la migration 007 §1 nomme : réutiliser le drapeau d'administration
    // aurait fait de toute connexion une transaction d'administration Groupe.
    const erreur = await tenterOuverture(perimetre('alice', FILIALE, [FILIALE], true), false, 'a2');
    assert.notEqual(erreur, null);
    assert.equal(erreur.code, '42501');
  });

  test('la TRANSACTION D’OUVERTURE DE SESSION, elle, écrit les trois tables', async () => {
    const erreur = await tenterOuverture(perimetre('alice', FILIALE, [FILIALE]), true, 'a3');
    assert.equal(erreur, null, `Le chemin légitime doit passer : ${erreur?.message ?? ''}`);
  });

  test('les trois tables sont refermées, pas seulement « sessions »', async () => {
    for (const table of ['sessions', 'session_filiales', 'session_domaines']) {
      const predicats = await base.lignes(
        proprietaire,
        `select coalesce(pg_get_expr(p.polwithcheck, p.polrelid),
                         pg_get_expr(p.polqual, p.polrelid)) as predicat
           from pg_policy p join pg_class c on c.oid = p.polrelid
          where c.relname = $1 and p.polcmd in ('a', 'w', 'd')`,
        [table],
      );
      assert.equal(predicats.length, 3, `${table} : ajout / modification / suppression.`);
      assert.deepEqual(
        [...new Set(predicats.map((l) => l.predicat))],
        ['f_authentification()'],
        `${table} : l’écriture doit exiger la transaction d’ouverture de session.`,
      );
    }
  });

  test('la LECTURE reste ouverte — et elle doit l’être', async () => {
    // Circulaire autrement : ces tables sont lues POUR résoudre le périmètre.
    const lectures = await base.lignes(
      proprietaire,
      `select pg_get_expr(p.polqual, p.polrelid) as predicat
         from pg_policy p join pg_class c on c.oid = p.polrelid
        where c.relname in ('sessions', 'session_filiales', 'session_domaines')
          and p.polcmd = 'r'`,
    );
    assert.equal(lectures.length, 3);
    assert.deepEqual([...new Set(lectures.map((l) => l.predicat))], ['true']);
  });
});

describe('E1 — le réglage ne survit pas à sa transaction (constat N-4)', () => {
  test('la MÊME connexion, réemployée, n’écrit plus rien', async () => {
    const solo = await base.nouvelleConnexion('app');
    try {
      // Transaction 1 : légitime, elle valide.
      await base.avecPerimetre(
        solo,
        perimetre('alice', FILIALE, [FILIALE]),
        async (c) => {
          await c.query(`select set_config('grc.authentification', 'oui', true)`);
          await c.query(
            `insert into sessions (id, jeton_empreinte, utilisateur_id, filiale_active_id, perimetre, expire_le)
                 values ('SESS-n4', $1, $2, $3, 'filiale', now() + interval '1 hour')`,
            ['b'.repeat(64), UTILISATEUR, FILIALE],
          );
        },
        { annuler: false },
      );

      // Transaction 2, même connexion : le réglage doit avoir disparu.
      const herite = await base.avecPerimetre(
        solo,
        perimetre('alice', FILIALE, [FILIALE]),
        async (c) => await base.valeur(c, 'select f_authentification()'),
      );
      assert.equal(herite, false, 'Un réglage local meurt au commit — sinon, c’est le défaut N-4.');

      let refus = null;
      try {
        await base.avecPerimetre(solo, perimetre('alice', FILIALE, [FILIALE]), async (c) => {
          await c.query(
            `insert into sessions (id, jeton_empreinte, utilisateur_id, filiale_active_id, perimetre, expire_le)
                 values ('SESS-n4b', $1, $2, $3, 'filiale', now() + interval '1 hour')`,
            ['c'.repeat(64), UTILISATEUR, FILIALE],
          );
        });
      } catch (erreur) {
        refus = erreur;
      }
      assert.notEqual(refus, null, 'La connexion réemployée ne doit rien avoir hérité.');
      assert.equal(refus.code, '42501');
    } finally {
      await solo.end();
    }
  });
});

describe('E1 — ce que la fermeture rend SILENCIEUX, et qui est mesuré', () => {
  test('un update sans le réglage n’échoue pas : il n’affecte AUCUNE ligne', async () => {
    const touchees = await base.avecPerimetre(
      applicatif,
      perimetre('alice', FILIALE, [FILIALE]),
      async (c) => {
        const resultat = await c.query(
          `update sessions set derniere_activite = now() where id = 'SESS-n4'`,
        );
        return resultat.rowCount;
      },
    );
    assert.equal(
      touchees,
      0,
      'Une politique « using » filtre les lignes, elle ne lève pas : c’est pourquoi ' +
        '`src/auth/sessions.ts` compte les lignes affectées.',
    );
  });

  test('le même update, dans la transaction d’ouverture, touche bien la ligne', async () => {
    const touchees = await base.avecPerimetre(
      applicatif,
      perimetre('alice', FILIALE, [FILIALE]),
      async (c) => {
        await c.query(`select set_config('grc.authentification', 'oui', true)`);
        const resultat = await c.query(
          `update sessions set derniere_activite = now() where id = 'SESS-n4'`,
        );
        return resultat.rowCount;
      },
    );
    assert.equal(touchees, 1);
  });

  test('un delete sans le réglage est tout aussi silencieux', async () => {
    const supprimees = await base.avecPerimetre(
      applicatif,
      perimetre('alice', FILIALE, [FILIALE]),
      async (c) => (await c.query(`delete from sessions where id = 'SESS-n4'`)).rowCount,
    );
    assert.equal(supprimees, 0);
  });
});

describe('Le garde-fou f_verifier_substrat_session() — éprouvé par mutation (§20.2)', () => {
  test('sur une base saine, il ne remonte rien', async () => {
    const anomalies = await base.lignes(proprietaire, 'select * from f_verifier_substrat_session()');
    assert.deepEqual(anomalies, []);
  });

  test('il DÉCOUVRE le substrat au lieu de le réciter', async () => {
    // La preuve : une table neuve qui référence `sessions` est réclamée sans que
    // personne l'ait inscrite nulle part. C'est la différence entre une liste et un
    // critère (CONVENTIONS.md §19.5).
    await proprietaire.query(
      `create table session_essai_a1 (
         session_id id_metier not null references sessions(id) on delete cascade,
         marque text)`,
    );
    await proprietaire.query('alter table session_essai_a1 enable row level security');
    await proprietaire.query('alter table session_essai_a1 force row level security');
    await proprietaire.query(
      `create policy pol_session_essai_a1_ajout on session_essai_a1 for insert with check (true)`,
    );
    try {
      const anomalies = await base.lignes(
        proprietaire,
        `select objet, anomalie from f_verifier_substrat_session() order by 1, 2`,
      );
      assert.deepEqual(anomalies, [
        { objet: 'session_essai_a1', anomalie: 'ecriture_sans_authentification' },
      ]);
    } finally {
      await proprietaire.query('drop table session_essai_a1');
    }

    const apres = await base.lignes(proprietaire, 'select * from f_verifier_substrat_session()');
    assert.deepEqual(apres, [], 'Réparé : le garde-fou redevient vert.');
  });

  test('MUTATION : rouvrir « sessions » le fait rougir, la réparer le rend vert', async () => {
    await proprietaire.query('drop policy pol_sessions_ajout on sessions');
    await proprietaire.query(
      'create policy pol_sessions_ajout on sessions for insert with check (true)',
    );
    try {
      const rouge = await base.lignes(
        proprietaire,
        `select objet, anomalie from f_verifier_substrat_session()`,
      );
      assert.deepEqual(rouge, [{ objet: 'sessions', anomalie: 'ecriture_sans_authentification' }]);

      // Et le point d'appel unique le voit aussi : un garde-fou que rien n'invoque
      // est un commentaire (contrôle S16, CONVENTIONS.md §18.4).
      const vuParLePointDAppel = await base.lignes(
        proprietaire,
        `select controle, objet from f_verifier_schema() where objet = 'sessions'`,
      );
      assert.deepEqual(vuParLePointDAppel, [{ controle: 'substrat_session', objet: 'sessions' }]);
    } finally {
      await proprietaire.query('drop policy pol_sessions_ajout on sessions');
      await proprietaire.query(
        'create policy pol_sessions_ajout on sessions for insert with check (f_authentification())',
      );
    }

    const vert = await base.lignes(proprietaire, 'select * from f_verifier_schema()');
    assert.deepEqual(vert, []);
  });

  test('MUTATION : une politique de LECTURE qui s’adosse au réglage est refusée', async () => {
    // Symétrique du 004 §8 : un réglage de session ne doit JAMAIS élargir la lecture.
    await proprietaire.query('drop policy pol_session_domaines_lecture on session_domaines');
    await proprietaire.query(
      'create policy pol_session_domaines_lecture on session_domaines for select using (f_authentification())',
    );
    try {
      const rouge = await base.lignes(
        proprietaire,
        `select objet, anomalie from f_verifier_substrat_session()
          where anomalie = 'authentification_en_lecture'`,
      );
      assert.deepEqual(rouge, [
        { objet: 'session_domaines', anomalie: 'authentification_en_lecture' },
      ]);
    } finally {
      await proprietaire.query('drop policy pol_session_domaines_lecture on session_domaines');
      await proprietaire.query(
        'create policy pol_session_domaines_lecture on session_domaines for select using (true)',
      );
    }

    const vert = await base.lignes(proprietaire, 'select * from f_verifier_schema()');
    assert.deepEqual(vert, []);
  });
});

describe('E1 — le provisionnement à la première connexion (migration 007 §3)', () => {
  test('une session ordinaire ne crée toujours PAS de compte', async () => {
    let refus = null;
    try {
      await base.avecPerimetre(applicatif, perimetre('alice', FILIALE, [FILIALE]), async (c) => {
        await c.query(
          `insert into utilisateurs (id, identifiant, nom_affichage)
               values ('USR-forge', 'forge', 'Compte forgé')`,
        );
      });
    } catch (erreur) {
      refus = erreur;
    }
    assert.notEqual(refus, null, 'Le fonctionnement courant n’écrit pas dans « utilisateurs ».');
    assert.equal(refus.code, '42501');
  });

  test('la transaction d’ouverture de session, elle, provisionne', async () => {
    const cree = await base.avecPerimetre(
      applicatif,
      perimetre('nouveau.venu', FILIALE, [FILIALE]),
      async (c) => {
        await c.query(`select set_config('grc.authentification', 'oui', true)`);
        const resultat = await c.query(
          `insert into utilisateurs (id, identifiant, nom_affichage)
               values ('USR-provisionne', 'nouveau.venu', 'Nouveau Venu') returning id`,
        );
        return resultat.rows[0].id;
      },
    );
    assert.equal(cree, 'USR-provisionne');
  });

  test('la SUPPRESSION d’un compte reste à l’administration Groupe seule', async () => {
    const predicat = await base.valeur(
      proprietaire,
      `select pg_get_expr(p.polqual, p.polrelid)
         from pg_policy p join pg_class c on c.oid = p.polrelid
        where c.relname = 'utilisateurs' and p.polcmd = 'd'`,
    );
    assert.equal(
      predicat,
      'f_administration_groupe()',
      'Un compte se désactive, il ne s’efface pas : le journal le référence sur trois ans.',
    );
  });
});
