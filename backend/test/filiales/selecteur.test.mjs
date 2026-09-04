/**
 * selecteur.test.mjs — **le sélecteur de filiale, éprouvé là où il peut mentir.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce qui est en jeu, en une phrase
 * ════════════════════════════════════════════════════════════════════════
 *
 * `CONVENTIONS.md` §30.1 : *« un sélecteur de filiale introduit, par définition,
 * une valeur choisie par le client. Il est donc le seul endroit du produit où
 * l'invariant peut se perdre — et il se perdrait silencieusement : l'utilisateur
 * croirait écrire chez A en écrivant chez B. »*
 *
 * Un essai qui se contenterait de lire le code de retour ne verrait rien de ce
 * défaut-là : un `403` bien rendu et une filiale active déplacée quand même
 * donnent exactement la même réponse HTTP. **Chaque assertion de ce fichier va
 * donc jusqu'à la ligne en base** — `sessions.filiale_active_id`, `risques.filiale_id`,
 * `journal_audit` — et non jusqu'au corps de la réponse.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Rien n'est fabriqué : la chaîne entière
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'annuaire simulé du `CONVENTIONS.md` §25.3 sert les comptes, `POST /api/connexion`
 * ouvre une vraie session, `groupes_ad` traduit les groupes en périmètre, et c'est
 * `session_filiales` — la table, pas un objet JavaScript — que le sélecteur
 * interroge. Deux comptes suffisent, et ils ne sont pas interchangeables :
 *
 *  · `rssi.groupe` porte **deux** filiales : c'est le seul qui puisse basculer ;
 *  · `rssi.tls` n'en porte **qu'une** : c'est le seul qui donne un sens à
 *    « la filiale existe, et elle n'est pas à vous » — le cas où un oracle
 *    d'existence se glisserait.
 *
 * ⚠️ **Toute lecture du journal déclare un périmètre** (`CONVENTIONS.md` §29.7) :
 * la politique de lecture est cloisonnée depuis `008_journal_lecture.sql`, et un
 * `select` sans périmètre rend zéro ligne **en silence**. `PERIMETRE_LECTEUR`
 * couvre les deux filiales du jeu, donc `f_perimetre_groupe()` est vrai et les
 * entrées transversales (`filiale_id` nul) sont visibles elles aussi.
 *
 * Prérequis machine : PostgreSQL prêt ; sur SRV-Infra, `source ~/.grc-essais.env`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { moduleCompile, monterServeurReel } from '../aide/serveur.mjs';
import { BASE_RECHERCHE, COMPTE_SERVICE } from '../annuaire/comptes.mjs';
import { demarrerAnnuaire } from '../annuaire/serveur-ldap.mjs';

const TLS = 'FIL-SEL-TLS';
const DEU = 'FIL-SEL-DEU';

/** Un identifiant qui ne désigne AUCUNE filiale. Sert au contrôle d'oracle. */
const FANTOME = 'FIL-SEL-FANTOME-0000000000000000';

const RSSI_GROUPE = { identifiant: 'rssi.groupe', motDePasse: 'rssi.groupe!2026' };
const RSSI_TLS = { identifiant: 'rssi.tls', motDePasse: 'rssi.tls!2026' };

/** Périmètre de LECTURE du journal : les deux filiales, donc « Groupe » (§29.7). */
const PERIMETRE_LECTEUR = perimetre('verificateur', TLS, [TLS, DEU]);

let base;
let applicatif;
let temoin;
let doublure;
let serveur;
let droits;
let sessions;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  temoin = await base.nouvelleConnexion('app');
  doublure = await demarrerAnnuaire();
  droits = await moduleCompile('droits/index.js');
  sessions = await moduleCompile('auth/sessions.js');

  await base.avecPerimetre(
    applicatif,
    perimetre('decor', null, [], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays) values
             ($1, 'TLS', 'Dedienne Aerospace Toulouse', 'FR'),
             ($2, 'DEU', 'Dedienne Deutschland', 'DE')`,
        [TLS, DEU],
      );
      // Les groupes AD sont ENGENDRÉS depuis la configuration, jamais écrits à la
      // main (PLAN_SERVEUR §3.4). C'est le geste que `deploy/` rejoue à l'installation.
      const attendus = droits.groupesAttendus(
        'GRC-',
        await droits.lireFilialesActives(c),
        await droits.lireProfilsActifs(c),
      );
      await droits.synchroniserGroupesAd(c, attendus);
    },
    { annuler: false },
  );

  serveur = await monterServeurReel(base, {
    authentification: 'reelle',
    env: {
      LDAP_URL: doublure.url,
      LDAP_VERIFIER_CERTIFICAT: 'non',
      LDAP_DN_SERVICE: COMPTE_SERVICE.dn,
      LDAP_MOT_DE_PASSE_SERVICE: COMPTE_SERVICE.motDePasse,
      LDAP_BASE_RECHERCHE: BASE_RECHERCHE,
    },
  });
});

after(async () => {
  await serveur?.fermer();
  await temoin?.end().catch(() => {});
  await doublure?.fermer();
  await base?.fermer();
});

/* =====================================================================
 *  Outillage
 * ===================================================================== */

/** Ouvre une session par la VRAIE route et rend son cookie et sa charte. */
async function connecter(compte) {
  const reponse = await serveur.appeler('POST', '/api/connexion', {
    corps: compte,
    entetes: { 'content-type': 'application/json' },
  });
  assert.equal(reponse.statut, 200, `connexion refusée : ${JSON.stringify(reponse.corps)}`);
  const cookie = String(reponse.entetes['set-cookie']).split(';')[0];
  return { cookie, charte: reponse.corps };
}

const avec = (cookie, options = {}) => ({
  ...options,
  entetes: { cookie, 'content-type': 'application/json', ...(options.entetes ?? {}) },
});

const basculer = (cookie, filiale, options = {}) =>
  serveur.appeler('PUT', '/api/session/filiale-active', avec(cookie, { corps: { filiale }, ...options }));

/** Lit la charte de session, telle que la SPA la lit à chaque démarrage. */
async function lireSession(cookie) {
  const r = await serveur.appeler('GET', '/api/session', avec(cookie));
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  return r.corps;
}

/**
 * **LA** ligne de session que ce cookie désigne — pas « une session de ce compte ».
 *
 * Chaque `connecter()` ouvre une session de plus, et aucune n'est révoquée : une
 * requête sur `utilisateurs.identifiant` en rendrait plusieurs, et l'essai
 * mesurerait alors une session prise au hasard. C'est exactement le défaut qui a
 * fait passer au vert, au premier jet de ce fichier, un contrôle qui retirait une
 * filiale du périmètre d'une **autre** session que celle qu'il interrogeait
 * ensuite.
 *
 * L'empreinte est calculée par la fonction du produit (`empreinteJeton`), et non
 * par une seconde rédaction du même hachage.
 */
async function ligneSession(cookie) {
  const jeton = cookie.slice(cookie.indexOf('=') + 1);
  assert.ok(jeton.length > 20, 'Le cookie doit porter un jeton : sinon rien à retrouver.');
  const lignes = await lire(
    `select s."id", s."filiale_active_id", u."identifiant"
       from sessions s join utilisateurs u on u."id" = s."utilisateur_id"
      where s."jeton_empreinte" = $1`,
    [sessions.empreinteJeton(jeton)],
  );
  assert.equal(lignes.length, 1, 'Un jeton, une ligne de session.');
  return lignes[0];
}

/** Le périmètre de LECTURE de cette session-ci, lu dans `session_filiales`. */
async function filialesDeLaSession(cookie) {
  const { id } = await ligneSession(cookie);
  const lignes = await lire(
    `select "filiale_id" from session_filiales where "session_id" = $1 order by "filiale_id"`,
    [id],
  );
  return lignes.map((l) => l.filiale_id);
}

/** Lecture directe en base, sous un périmètre déclaré (§29.7). */
async function lire(sql, valeurs = [], p = PERIMETRE_LECTEUR) {
  return await base.avecPerimetre(temoin, p, async (c) => (await c.query(sql, valeurs)).rows);
}

/**
 * Écrit dans le substrat de session, **par le chemin légitime**.
 *
 * `sessions`, `session_filiales` et `session_domaines` exigent
 * `grc.authentification` depuis la migration `007` (condition E1). Sans le
 * réglage, un `delete` n'affecte **aucune ligne et annonce un succès** : c'est la
 * nature d'une politique `using`, et c'est pourquoi le nombre de lignes touchées
 * est asserté ici plutôt que supposé.
 */
async function ecrireSubstrat(sql, valeurs, attendues) {
  const touchees = await base.avecPerimetre(
    applicatif,
    perimetre('essai-substrat', null, []),
    async (c) => {
      await c.query(`select set_config('grc.authentification', 'oui', true)`);
      return (await c.query(sql, valeurs)).rowCount;
    },
    { annuler: false },
  );
  assert.equal(
    touchees,
    attendues,
    `Écriture du substrat sans l’effet attendu (${String(touchees)} ligne(s)) : l’essai ` +
      'mesurerait alors sa propre inaction.',
  );
  return touchees;
}

/** Crée un risque par la vraie route, et rend son identifiant. */
async function creerRisque(cookie, nom, corpsSupplementaire = {}) {
  const r = await serveur.appeler(
    'POST',
    '/api/entites/risques',
    avec(cookie, { corps: { champs: { nom }, ...corpsSupplementaire } }),
  );
  return r;
}

/** La filiale où un enregistrement a réellement atterri. */
async function filialeDe(table, id) {
  const lignes = await lire(`select "filiale_id" from ${table} where "id" = $1`, [id]);
  assert.equal(lignes.length, 1, `L’enregistrement ${id} est introuvable : rien à mesurer.`);
  return lignes[0].filiale_id;
}

/* =====================================================================
 *  §1 — La bascule : une session change de filiale, l'écriture suit
 * ===================================================================== */

describe('§30.2 — une session bascule entre deux filiales de SON périmètre', () => {
  test('l’écriture suivante atterrit dans la NOUVELLE filiale, la précédente dans l’ancienne', async (t) => {
    const { cookie, charte } = await connecter(RSSI_GROUPE);

    const depart = charte.filiale_active.id;
    const lecture = charte.perimetre_lecture;
    // ── Exigence de MATIÈRE ────────────────────────────────────────────
    // Un compte à une seule filiale rendrait cet essai vert sans qu'aucune
    // bascule ait eu lieu : il comparerait A à A. On refuse de passer.
    assert.equal(lecture.length, 2, 'Le compte doit porter DEUX filiales, sinon rien à basculer.');
    assert.ok(lecture.includes(TLS) && lecture.includes(DEU));
    const arrivee = depart === TLS ? DEU : TLS;
    t.diagnostic(`départ ${depart} → arrivée ${arrivee}`);

    // Avant la bascule : l'écriture atterrit dans la filiale de départ.
    const avant = await creerRisque(cookie, 'Risque écrit avant la bascule');
    assert.equal(avant.statut, 201, JSON.stringify(avant.corps));
    assert.equal(await filialeDe('risques', avant.corps.enregistrement.id), depart);

    // La bascule.
    const r = await basculer(cookie, arrivee);
    assert.equal(r.statut, 200, JSON.stringify(r.corps));
    assert.equal(r.corps.change, true);
    assert.equal(r.corps.filiale_active.id, arrivee);
    assert.ok(
      typeof r.corps.filiale_active.code === 'string' && r.corps.filiale_active.code.length > 0,
      'La réponse nomme la filiale : un identifiant technique seul est le constat Q-85.',
    );

    // Le choix vit DANS LA LIGNE DE SESSION, côté serveur (§30.2) — pas dans un
    // cookie, pas dans une entête, pas dans une URL. On le lit donc là.
    assert.equal((await ligneSession(cookie)).filiale_active_id, arrivee);

    // La requête suivante le voit — sans que le client n'ait rien à joindre.
    assert.equal((await lireSession(cookie)).filiale_active.id, arrivee);

    // Et l'écriture suivante atterrit dans la NOUVELLE filiale.
    const apres = await creerRisque(cookie, 'Risque écrit après la bascule');
    assert.equal(apres.statut, 201, JSON.stringify(apres.corps));
    assert.equal(
      await filialeDe('risques', apres.corps.enregistrement.id),
      arrivee,
      'C’est LA propriété du lot : ce que l’utilisateur écrit va où il croit l’écrire.',
    );

    // Les deux enregistrements sont dans deux filiales différentes : la mesure a
    // porté sur un mouvement réel, pas sur deux fois le même état.
    assert.notEqual(
      await filialeDe('risques', avant.corps.enregistrement.id),
      await filialeDe('risques', apres.corps.enregistrement.id),
    );
  });

  test('le périmètre de LECTURE et les droits ne bougent pas (§30.3)', async () => {
    const { cookie, charte } = await connecter(RSSI_GROUPE);
    const arrivee = charte.filiale_active.id === TLS ? DEU : TLS;

    const r = await basculer(cookie, arrivee);
    assert.equal(r.statut, 200, JSON.stringify(r.corps));

    const apres = await lireSession(cookie);
    assert.deepEqual(
      [...apres.perimetre_lecture].sort(),
      [...charte.perimetre_lecture].sort(),
      '§30.3 : le sélecteur ne déplace que la filiale ACTIVE. `session_filiales` vient ' +
        'des groupes AD et ne bouge qu’à la ré-authentification.',
    );
    assert.deepEqual(apres.droits, charte.droits, '§30.3 : « il n’accorde aucun droit ».');
    assert.equal(apres.perimetre_groupe, charte.perimetre_groupe);
    assert.equal(apres.administration_groupe, charte.administration_groupe);
    // Le périmètre de lecture inchangé se mesure AUSSI en base : la table qui le
    // produit ne doit pas avoir été touchée.
    assert.deepEqual(await filialesDeLaSession(cookie), [DEU, TLS].sort());
  });

  test('rebasculer sur la filiale COURANTE ne change rien et n’écrit aucune trace', async () => {
    const { cookie, charte } = await connecter(RSSI_GROUPE);
    const courante = charte.filiale_active.id;

    const avant = await compterJournal('changement_perimetre');
    const r = await basculer(cookie, courante);
    assert.equal(r.statut, 200, JSON.stringify(r.corps));
    assert.equal(r.corps.change, false, 'Un non-mouvement n’est pas un mouvement.');
    assert.equal(r.corps.filiale_active.id, courante);
    assert.equal(
      await compterJournal('changement_perimetre'),
      avant,
      'Une entrée « A → A » dans un registre scellé trois ans n’apprend rien, et un ' +
        'rechargement de page en écrirait une à chaque fois.',
    );
    assert.equal((await lireSession(cookie)).filiale_active.id, courante);
  });
});

/** Combien d'entrées de cette action au journal. Lue sous périmètre (§29.7). */
async function compterJournal(action) {
  const [ligne] = await lire(
    `select count(*)::int as n from journal_audit where action = $1`,
    [action],
  );
  return ligne.n;
}

/* =====================================================================
 *  §2 — Le refus : 403, filiale active INCHANGÉE, et pas d'oracle
 * ===================================================================== */

describe('§30.2 — un identifiant hors périmètre rend 403 et NE CHANGE RIEN', () => {
  test('la filiale voisine est refusée, et la filiale active reste celle d’avant', async () => {
    // `rssi.tls` ne porte QUE Toulouse : Deutschland existe, est active, et ne
    // lui appartient pas. C'est le cas exact du §30.2.
    const { cookie, charte } = await connecter(RSSI_TLS);
    assert.deepEqual(charte.perimetre_lecture, [TLS], 'Une seule filiale, sinon rien à refuser.');
    assert.equal(charte.filiale_active.id, TLS);

    const r = await basculer(cookie, DEU);
    assert.equal(r.statut, 403, JSON.stringify(r.corps));
    assert.equal(r.corps.erreur, 'hors_perimetre');

    // ── La moitié qu'on oublie : rien n'a bougé ────────────────────────
    // Un refus bien rendu ET une filiale active déplacée quand même donnent la
    // même réponse HTTP. On regarde donc la ligne de session, pas la réponse.
    assert.equal(
      (await ligneSession(cookie)).filiale_active_id,
      TLS,
      '§30.2 : « un choix refusé laisse la filiale active inchangée ».',
    );
    assert.equal((await lireSession(cookie)).filiale_active.id, TLS);

    // Et l'écriture suivante va toujours à Toulouse.
    const risque = await creerRisque(cookie, 'Écrit après un refus de bascule');
    assert.equal(risque.statut, 201, JSON.stringify(risque.corps));
    assert.equal(await filialeDe('risques', risque.corps.enregistrement.id), TLS);
  });

  test('AUCUN ORACLE : une filiale inexistante a exactement le sort d’une filiale non autorisée', async () => {
    const { cookie } = await connecter(RSSI_TLS);

    const existante = await basculer(cookie, DEU);
    const fantome = await basculer(cookie, FANTOME);

    // Exigence de matière : les deux appels doivent avoir eu lieu et échoué.
    assert.equal(existante.statut, 403, JSON.stringify(existante.corps));
    assert.equal(fantome.statut, 403, JSON.stringify(fantome.corps));

    // `reference` est l'identifiant de requête : il diffère par construction.
    const sansReference = (corps) => {
      const { reference, ...reste } = corps;
      assert.ok(typeof reference === 'string' && reference.length > 0, 'La référence existe.');
      return reste;
    };
    assert.deepEqual(
      sansReference(fantome.corps),
      sansReference(existante.corps),
      'Distinguer « inconnue » de « pas à vous » donnerait, en une requête, l’annuaire ' +
        'des filiales du groupe à qui n’en lit qu’une — l’oracle d’existence que le ' +
        'constat M-3 a fermé sur les identifiants d’enregistrement.',
    );
    assert.deepEqual(
      Object.keys(existante.entetes).sort(),
      Object.keys(fantome.entetes).sort(),
      'Les en-têtes ne doivent pas non plus trahir la différence.',
    );
  });

  test('le refus laisse une trace, et la trace nomme ce qui a été demandé', async () => {
    const { cookie } = await connecter(RSSI_TLS);
    const refus = await basculer(cookie, DEU);
    assert.equal(refus.statut, 403);

    const entrees = await lire(
      `select resume, filiale_id, utilisateur_libelle, valeurs_apres
         from journal_audit
        where action = 'refus_autorisation'
          and valeurs_apres->>'motif' = 'filiale_hors_perimetre'
        order by numero desc limit 5`,
    );
    assert.ok(entrees.length >= 1, 'Un refus de périmètre sans trace est un refus qu’on ne peut pas auditer.');
    const [entree] = entrees;
    assert.equal(entree.utilisateur_libelle, RSSI_TLS.identifiant);
    assert.equal(entree.filiale_id, TLS, 'Le refus est imputé à la filiale où la session opère.');
    assert.equal(entree.valeurs_apres.filiale_demandee, DEU);
    assert.equal(entree.valeurs_apres.filiale_active, TLS);
    // §29.5 : la phrase est celle du développeur. Aucune des deux valeurs n'y est.
    assert.ok(!entree.resume.includes(DEU) && !entree.resume.includes(TLS), entree.resume);
  });
});

/* =====================================================================
 *  §3 — La trace du mouvement (§30.4)
 * ===================================================================== */

describe('§30.4 — le mouvement est tracé, et l’entrée dit d’où et vers où', () => {
  test('une entrée « changement_perimetre » porte la filiale quittée et la rejointe', async () => {
    const { cookie, charte } = await connecter(RSSI_GROUPE);
    const depart = charte.filiale_active.id;
    const arrivee = depart === TLS ? DEU : TLS;

    const avant = await compterJournal('changement_perimetre');
    assert.equal((await basculer(cookie, arrivee)).statut, 200);
    const apres = await compterJournal('changement_perimetre');
    assert.equal(apres, avant + 1, 'Un mouvement, une entrée — ni zéro, ni deux.');

    const [entree] = await lire(
      `select action, resume, filiale_id, utilisateur_libelle, entite_type, entite_id,
              valeurs_avant, valeurs_apres, adresse_ip
         from journal_audit where action = 'changement_perimetre'
        order by numero desc limit 1`,
    );
    assert.equal(entree.valeurs_avant.filiale_active, depart, '§30.4 : la filiale QUITTÉE.');
    assert.equal(entree.valeurs_apres.filiale_active, arrivee, '§30.4 : la filiale REJOINTE.');
    assert.equal(entree.filiale_id, depart, 'Attribuée à la filiale active de la transaction.');
    assert.equal(entree.utilisateur_libelle, RSSI_GROUPE.identifiant);
    assert.equal(entree.entite_type, 'sessions');
    assert.ok(typeof entree.entite_id === 'string' && entree.entite_id.startsWith('SESS-'));
    assert.ok(entree.adresse_ip !== null, 'D’où le mouvement a-t-il été demandé ?');
    // §29.5 : phrase fixe, sans aucune des deux valeurs.
    assert.equal(entree.resume, 'Filiale active de la session changée.');
  });

  test('le vocabulaire de la base et celui du code se font face', async () => {
    // La contrainte est lue dans `pg_catalog`, jamais recopiée : c'est elle qui
    // décide, et c'est elle qui ferait échouer l'insertion en 23514.
    const [ligne] = await lire(
      `select pg_get_constraintdef(k.oid) as definition
         from pg_constraint k join pg_class c on c.oid = k.conrelid
        where c.relname = 'journal_audit' and k.conname = 'ck_journal_audit_action'`,
    );
    assert.ok(
      ligne.definition.includes('changement_perimetre'),
      'Sans la valeur au schéma, le changement de filiale échouerait en 23514 au clic.',
    );
    // Et le garde-fou de la migration 009 est branché sur le point d'appel unique.
    const consignes = await lire(
      `select fonction from controles_schema where fonction = 'f_verifier_vocabulaire_journal'`,
    );
    assert.equal(consignes.length, 1, 'Un garde-fou que rien n’appelle est un commentaire.');
    const anomalies = await lire(`select * from f_verifier_vocabulaire_journal()`);
    assert.deepEqual(anomalies, [], 'Un schéma sain ne renvoie AUCUNE ligne.');
  });
});

/* =====================================================================
 *  §3 bis — De quoi NOMMER le choix, sans rien dire de plus
 * ===================================================================== */

describe('GET /api/filiales — le périmètre de lecture, nommé, et RIEN d’autre', () => {
  test('un compte à deux filiales les voit toutes deux, nommées, et sait laquelle est active', async () => {
    const { cookie, charte } = await connecter(RSSI_GROUPE);
    const r = await serveur.appeler('GET', '/api/filiales', avec(cookie));
    assert.equal(r.statut, 200, JSON.stringify(r.corps));

    const parId = new Map(r.corps.filiales.map((f) => [f.id, f]));
    assert.deepEqual([...parId.keys()].sort(), [DEU, TLS].sort());
    for (const f of r.corps.filiales) {
      assert.ok(typeof f.code === 'string' && f.code.length > 0, 'Un code, pas un identifiant nu.');
      assert.ok(
        typeof f.raison_sociale === 'string' && f.raison_sociale.length > 0,
        'Constat Q-85 : choisir sa filiale dans une liste de chaînes techniques est une ' +
          'invitation à se tromper de filiale.',
      );
      assert.equal(f.statut, 'active');
    }
    assert.equal(parId.get(charte.filiale_active.id).active, true, 'Une seule est « active »…');
    assert.equal(r.corps.filiales.filter((f) => f.active).length, 1, '…et une seule.');

    // Et le drapeau SUIT le sélecteur : sinon il décrirait autre chose.
    const autre = charte.filiale_active.id === TLS ? DEU : TLS;
    assert.equal((await basculer(cookie, autre)).statut, 200);
    const apres = await serveur.appeler('GET', '/api/filiales', avec(cookie));
    assert.equal(apres.corps.filiales.find((f) => f.id === autre).active, true);
    assert.equal(apres.corps.filiales.find((f) => f.id !== autre).active, false);
  });

  test('un compte à UNE filiale n’apprend rien des autres — la RLS ne protège PAS cette table', async () => {
    // `pol_filiales_lecture` est `using (true)` : sans le filtre écrit dans la
    // route, cet essai rendrait DEUX lignes. C'est la seule barrière, et c'est
    // pourquoi elle est mesurée plutôt qu'affirmée.
    const { cookie } = await connecter(RSSI_TLS);
    const r = await serveur.appeler('GET', '/api/filiales', avec(cookie));
    assert.equal(r.statut, 200, JSON.stringify(r.corps));
    assert.deepEqual(
      r.corps.filiales.map((f) => f.id),
      [TLS],
      'Rendre la liste complète donnerait à un RSSI de site la cartographie des filiales ' +
        'du groupe, acquisitions comprises : c’est l’oracle d’existence inter-filiales.',
    );

    // Exigence de matière : la filiale voisine EXISTE bien, et est active. Sans
    // ce contrôle, la ligne du dessus serait vraie d’une base à une seule filiale.
    const toutes = await lire(`select "id" from filiales where "statut" = 'active' order by "id"`);
    assert.deepEqual(toutes.map((l) => l.id).sort(), [DEU, TLS].sort());
  });
});

/* =====================================================================
 *  §4 — La revérification par requête (§30.3)
 * ===================================================================== */

describe('§30.3 — la filiale active est revérifiée à CHAQUE requête', () => {
  test('retirée de session_filiales, elle fait refuser la requête suivante — puis rendue, elle la fait passer', async (t) => {
    const { cookie, charte } = await connecter(RSSI_GROUPE);
    const active = charte.filiale_active.id;

    // Le vert AVANT : sans cela, l'essai ne saurait pas distinguer « refusé
    // parce qu'on a retiré la ligne » de « refusé depuis toujours ».
    assert.equal((await lireSession(cookie)).filiale_active.id, active);
    const risqueAvant = await creerRisque(cookie, 'Avant le retrait du périmètre');
    assert.equal(risqueAvant.statut, 201, JSON.stringify(risqueAvant.corps));

    const session = await ligneSession(cookie);

    // ── On simule le changement de groupes AD : la filiale ACTIVE sort du
    //    périmètre de lecture, la session, elle, reste ouverte.
    await ecrireSubstrat(
      `delete from session_filiales where "session_id" = $1 and "filiale_id" = $2`,
      [session.id, active],
      1,
    );
    t.diagnostic(`filiale ${active} retirée de session_filiales de ${session.id}`);

    const refusee = await serveur.appeler('GET', '/api/session', avec(cookie));
    assert.equal(
      refusee.statut,
      403,
      'Une session ne doit pas continuer d’écrire dans une filiale qui a quitté son ' +
        'périmètre (§30.3) — et elle ne doit pas non plus rendre 500.',
    );
    assert.equal(refusee.corps.erreur, 'hors_perimetre');

    const ecriture = await creerRisque(cookie, 'Pendant le retrait du périmètre');
    assert.equal(ecriture.statut, 403, JSON.stringify(ecriture.corps));

    // Le refus est tracé, et il dit ce qui s'est passé.
    const traces = await lire(
      `select valeurs_apres, filiale_id, utilisateur_libelle from journal_audit
        where action = 'refus_autorisation'
          and valeurs_apres->>'motif' = 'filiale_active_hors_perimetre'
        order by numero desc limit 3`,
    );
    assert.ok(traces.length >= 1, 'Le refus le plus intéressant du lot ne doit pas être le seul sans trace.');
    assert.equal(traces[0].utilisateur_libelle, RSSI_GROUPE.identifiant);
    assert.equal(
      traces[0].filiale_id,
      null,
      'La filiale active n’étant plus lisible, l’entrée est transversale : la lui ' +
        'attribuer serait refusé par f_filiale_ecriture().',
    );

    // ── Restauration : le vert revient, donc c'est bien CE retrait qui mordait.
    await ecrireSubstrat(
      `insert into session_filiales ("session_id", "filiale_id") values ($1, $2)`,
      [session.id, active],
      1,
    );
    const revenue = await lireSession(cookie);
    assert.equal(revenue.filiale_active.id, active);
    const risqueApres = await creerRisque(cookie, 'Après restauration du périmètre');
    assert.equal(risqueApres.statut, 201, JSON.stringify(risqueApres.corps));
    assert.equal(await filialeDe('risques', risqueApres.corps.enregistrement.id), active);
  });
});
