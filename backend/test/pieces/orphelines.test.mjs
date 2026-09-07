/**
 * orphelines.test.mjs — **une pièce jointe suit l'enregistrement qu'elle documente.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Constat **Q-230**, cinquième passage de la porte S8
 * ════════════════════════════════════════════════════════════════════════
 *
 * Mesuré à travers Apache, sur la recette : un risque supprimé laissait sa pièce
 * jointe **en base**, **sur le disque**, **dans le quota de la filiale**, et
 * `GET /api/pieces/risques/<supprimé>/<pj>` rendait **200 avec le contenu du
 * document**.
 *
 * La cause est structurelle et vaut d'être retenue : `pieces_jointes` porte un
 * lien **polymorphe** (`entite_type`, `entite_id`) et **aucune clé étrangère**
 * vers l'entité — relevé dans `pg_constraint`, la seule de la table vise
 * `filiales`. Le schéma ne PEUT donc pas cascader, et personne n'avait pris le
 * relais : `src/entites/` ne mentionnait jamais la table.
 *
 * ⚠️ **« Supprimer » qui ne supprime pas est une promesse rompue**, et elle
 * l'est deux fois ici : dans un outil qui sert de preuve en audit ISO 27001, et
 * dans un produit qui porte un registre RGPD — le droit à l'effacement de
 * l'article 17 ne s'arrête pas à la ligne métier.
 *
 * ── Pourquoi aucun essai ne le voyait ────────────────────────────────────
 *
 * Le banc éprouvait abondamment le dépôt, l'analyse, la délivrance et la
 * suppression **d'une pièce**. Aucun ne supprimait **son porteur**. C'est la
 * jointure entre deux familles d'essais — celle des pièces et celle des entités
 * — et personne n'habite la jointure. Quatrième occurrence sur ce chantier du
 * motif « le défaut vit ENTRE deux fichiers dont aucun n'a tort seul ».
 */

import assert from 'node:assert/strict';
import { access, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { monterPieces, pdfValide, perimetreDe, SessionDEssai } from './aide.mjs';

const { TOUS_LES_DOMAINES } = await moduleCompile('api/droits.js');
const TOUS_DROITS = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

let base;
let serveur;
let applicatif;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  const session = new SessionDEssai(perimetreDe('admin.grc', FILIALE_A, [FILIALE_A]), TOUS_DROITS);
  serveur = await monterPieces(base, session);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Compte les lignes de `pieces_jointes` sous périmètre. */
async function comptePieces() {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', FILIALE_A, [FILIALE_A]),
    async (c) =>
      Number((await c.query('select count(*)::text as n from pieces_jointes')).rows[0].n),
  );
}

/** Le chemin de stockage d'une pièce — il ne sort jamais par l'API. */
async function cheminDe(pieceId) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', FILIALE_A, [FILIALE_A]),
    async (c) =>
      (await c.query('select chemin_stockage from pieces_jointes where id = $1', [pieceId]))
        .rows[0]?.chemin_stockage ?? null,
  );
}

const existe = async (chemin) =>
  await access(chemin).then(
    () => true,
    () => false,
  );

describe('Q-230 — supprimer un enregistrement retire ses pièces', () => {
  let risque;
  let piece;
  let cheminDisque;

  test('LA MATIÈRE : un risque, une pièce déposée dessus, un fichier sur le disque', async () => {
    const cree = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Risque qui portera une pièce' } },
    });
    assert.equal(cree.statut, 201, JSON.stringify(cree.corps));
    risque = cree.corps.enregistrement.id;

    const avant = await comptePieces();
    const depot = await serveur.deposer(`/api/pieces/risques/${risque}`, {
      nom: 'preuve.pdf',
      type: 'application/pdf',
      contenu: pdfValide('preuve attachée au risque supprimé'),
    });
    assert.equal(depot.statut, 201, JSON.stringify(depot.corps));
    piece = depot.corps.id;
    assert.equal(await comptePieces(), avant + 1, 'la pièce doit exister avant qu’on la perde');

    const relatif = await cheminDe(piece);
    assert.ok(relatif, 'la ligne doit porter un chemin de stockage');
    cheminDisque = join(serveur.magasin, 'pieces', relatif);
    assert.equal(await existe(cheminDisque), true, 'le fichier doit être sur le disque');

    // Et il se délivre : sans quoi la suite ne prouverait rien.
    const lecture = await serveur.appeler('GET', `/api/pieces/risques/${risque}/${piece}`);
    assert.equal(lecture.statut, 200, 'la pièce doit être délivrable AVANT la suppression');
  });

  test('SUPPRIMER LE RISQUE retire la ligne, le fichier, et la délivrance', async () => {
    const avant = await comptePieces();
    const suppression = await serveur.appeler(
      'DELETE',
      `/api/entites/risques/${risque}?version=1`,
    );
    assert.equal(suppression.statut, 200, JSON.stringify(suppression.corps));

    assert.equal(
      await comptePieces(),
      avant - 1,
      'La ligne survit à son porteur : elle consomme le quota de la filiale POUR TOUJOURS, ' +
        'et personne ne peut la libérer depuis l’interface.',
    );
    assert.equal(
      await existe(cheminDisque),
      false,
      'Le fichier reste sur le disque, sans réclamant.',
    );

    const apres = await serveur.appeler('GET', `/api/pieces/risques/${risque}/${piece}`);
    assert.notEqual(
      apres.statut,
      200,
      'Le document d’un enregistrement SUPPRIMÉ reste téléchargeable. Dans un produit qui ' +
        'porte un registre RGPD, « supprimer » qui ne supprime pas est une promesse rompue.',
    );
  });

  test('SUPPRIMER UN PORTEUR NE TOUCHE PAS LA PIÈCE D’UN AUTRE', async () => {
    /* ⚠️ La moitié qui empêche le correctif d'être pire que le défaut : un
       « delete » trop large — par filiale, par type d'entité — emporterait les
       pièces des voisins, et ce serait une perte de données là où l'on voulait
       en fermer une.

       ⚠️ **Et une hypothèse que j'avais écrite à tort** : je croyais le magasin
       adressé par le CONTENU, donc deux dépôts identiques partageant un fichier.
       Mesuré ici : `engendrerCheminStockage` tire 256 bits au hasard par pièce,
       et deux dépôts du même document rendent DEUX chemins. L'essai vérifie donc
       ce qui est vrai — la pièce du voisin survit — et non ce que je supposais. */
    const contenu = pdfValide('un même document, attaché deux fois');
    const a = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Premier porteur' } },
    });
    const b = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Second porteur' } },
    });
    const idA = a.corps.enregistrement.id;
    const idB = b.corps.enregistrement.id;

    const pjA = await serveur.deposer(`/api/pieces/risques/${idA}`, {
      nom: 'partage.pdf',
      type: 'application/pdf',
      contenu,
    });
    const pjB = await serveur.deposer(`/api/pieces/risques/${idB}`, {
      nom: 'partage.pdf',
      type: 'application/pdf',
      contenu,
    });
    assert.equal(pjA.statut, 201, JSON.stringify(pjA.corps));
    assert.equal(pjB.statut, 201, JSON.stringify(pjB.corps));

    const cheminA = await cheminDe(pjA.corps.id);
    const cheminB = await cheminDe(pjB.corps.id);
    // LA MATIÈRE : deux pièces distinctes, deux fichiers distincts.
    assert.notEqual(cheminA, cheminB, 'chaque pièce a son propre objet sur le disque');
    assert.ok(cheminA && cheminB, 'les deux lignes doivent porter un chemin');

    const suppression = await serveur.appeler('DELETE', `/api/entites/risques/${idA}?version=1`);
    assert.equal(suppression.statut, 200, JSON.stringify(suppression.corps));

    assert.equal(
      await existe(join(serveur.magasin, 'pieces', cheminB)),
      true,
      'Le fichier a été retiré alors qu’un AUTRE enregistrement le réclame encore : ' +
        'supprimer un risque vient d’effacer la pièce jointe d’un second.',
    );
    const lecture = await serveur.appeler('GET', `/api/pieces/risques/${idB}/${pjB.corps.id}`);
    assert.equal(lecture.statut, 200, 'et la pièce du second porteur doit rester délivrable');
  });
});

/* =====================================================================
 *  Q-232 / Q-233 — LA CLASSE, pas l'instance
 * =====================================================================
 *
 * Le correctif de Q-230 — celui qu'éprouve la suite ci-dessus — tenait sur
 * **son** chemin et pas sur la classe : il nommait `entite_type = <l'entité de
 * l'URL>`, et la **cascade** du schéma, qui s'exécute ensuite, détruit des
 * enfants qu'il ne nomme jamais. Le 6ᵉ passage de la porte S8 l'a mesuré :
 * supprimer un scénario PRA laissait la pièce de son test — `GET` rendait
 * **200, 125 octets** —, et supprimer un risque laissait celle de son action.
 *
 * ⚠️ **Sixième fois sur ce chantier qu'un correctif traite l'instance.** Le
 * remède demandé par l'auditeur était explicite : *« un seul endroit que tous
 * les chemins traversent — pas six correctifs »*. C'est la migration `017` :
 * un déclencheur en base sur chaque table porteuse, et une file de purge que
 * l'application vide après le commit.
 *
 * ── Ce que ce fichier ne fait PAS, et c'est le point ─────────────────────
 *
 * **Il ne récite pas les six chemins.** Il les DÉRIVE de `pg_constraint` : tout
 * `on delete cascade` entre deux tables porteuses est un chemin, et il est
 * éprouvé. Une septième cascade ajoutée demain entre dans le balayage sans que
 * personne y pense — alors qu'une liste écrite à la main aurait exactement le
 * défaut qu'elle prétend fermer (`CLAUDE.md` §3, premier cas : une omission qui
 * fait « réussir en silence quelque chose de faux »).
 */

/** Les cascades du schéma entre deux tables qui peuvent porter une pièce. */
async function cascadesDuSchema() {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', FILIALE_A, [FILIALE_A]),
    async (c) =>
      (
        await c.query(`
        select cl.relname as enfant, cp.relname as parent,
               (select a.attname
                  from unnest(c.conkey) with ordinality k(att, ord)
                  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att
                 where a.attname <> 'filiale_id'
                 order by k.ord limit 1) as colonne
          from pg_constraint c
          join pg_class cl on cl.oid = c.conrelid
          join pg_class cp on cp.oid = c.confrelid
          join pg_namespace n on n.oid = cl.relnamespace
         where c.contype = 'f' and c.confdeltype = 'c' and n.nspname = 'public'
           and exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                        where t.tgrelid = cl.oid and not t.tgisinternal
                          and p.proname = 'f_pieces_suivent_leur_porteur')
           and exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                        where t.tgrelid = cp.oid and not t.tgisinternal
                          and p.proname = 'f_pieces_suivent_leur_porteur')
         order by cp.relname, cl.relname`)
      ).rows,
  );
}

/** Le modèle rendu par l'API : c'est lui qui dit les champs obligatoires. */
let modeleEntites;

/** Crée un enregistrement en remplissant ses seuls champs obligatoires. */
async function creer(entite, champs = {}) {
  // Chargé à la demande plutôt que dans un `before` : le modèle sert à plusieurs
  // suites, et dépendre de l'ordre de leurs crochets rendrait l'essai fragile
  // pour une raison qui n'a rien à voir avec ce qu'il mesure.
  modeleEntites ??= (await serveur.appeler('GET', '/api/modele')).corps.entites;
  const description = modeleEntites[entite];
  assert.ok(description, `« ${entite} » n’est pas une entité du modèle.`);
  const corps = { ...champs };
  for (const [champ, forme] of Object.entries(description.champs)) {
    if (!forme.obligatoire || corps[champ] !== undefined) continue;
    corps[champ] =
      forme.type === 'entier' || forme.type === 'nombre'
        ? 1
        : forme.type === 'booleen'
          ? false
          : forme.type === 'date'
            ? '2026-12-24'
            : forme.valeurs !== undefined && forme.valeurs.length > 0
              ? forme.valeurs[0]
              : `Q232 ${entite} ${champ}`;
  }
  const reponse = await serveur.appeler('POST', `/api/entites/${entite}`, { corps: { champs: corps } });
  assert.equal(reponse.statut, 201, `${entite} : ${JSON.stringify(reponse.corps)}`);
  return reponse.corps.enregistrement.id;
}

/** Dépose une pièce et rend `{ id, chemin, disque }`. */
async function deposerSur(entite, identifiant, nom) {
  const depot = await serveur.deposer(`/api/pieces/${entite}/${identifiant}`, {
    nom,
    type: 'application/pdf',
    contenu: pdfValide(`pièce de ${entite} ${identifiant}`),
  });
  assert.equal(depot.statut, 201, JSON.stringify(depot.corps));
  const chemin = await cheminDe(depot.corps.id);
  assert.ok(chemin, 'la ligne doit porter un chemin de stockage');
  const disque = join(serveur.magasin, 'pieces', chemin);
  assert.equal(await existe(disque), true, 'le fichier doit être sur le disque');
  const lecture = await serveur.appeler('GET', `/api/pieces/${entite}/${identifiant}/${depot.corps.id}`);
  assert.equal(lecture.statut, 200, 'la pièce doit être délivrable AVANT la suppression');
  return { id: depot.corps.id, chemin, disque };
}

/** Combien de lignes `pieces_jointes` visent encore ce porteur ? */
async function piecesDe(entiteType, entiteId) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', FILIALE_A, [FILIALE_A]),
    async (c) =>
      Number(
        (
          await c.query(
            'select count(*)::text as n from pieces_jointes where entite_type = $1 and entite_id = $2',
            [entiteType, entiteId],
          )
        ).rows[0].n,
      ),
  );
}

/** La file de purge du magasin : elle doit être VIDE une fois la réponse rendue. */
async function fileDePurge() {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', FILIALE_A, [FILIALE_A]),
    async (c) => Number((await c.query('select count(*)::text as n from pieces_a_purger')).rows[0].n),
  );
}

/**
 * Le verdict complet, appliqué identiquement à tous les chemins.
 *
 * ⚠️ **Le critère est DOUBLE**, et c'est ce que le plan d'exécution exige de
 * D2 : zéro ligne orpheline **et** zéro fichier résiduel. Une moitié sans
 * l'autre laisse soit une preuve d'audit qui se télécharge encore, soit un
 * quota qui se remplit de fantômes.
 */
async function rienNaSurvecu(entite, identifiant, piece, chemin) {
  assert.equal(
    await piecesDe(entite, identifiant),
    0,
    `LIGNE ORPHELINE : ${entite}/${identifiant} a disparu et sa pièce est restée en base. ` +
      'Elle consomme le quota de la filiale pour toujours, et aucun écran n’y mène.',
  );
  assert.equal(
    await existe(chemin),
    false,
    `FICHIER RÉSIDUEL : ${entite}/${identifiant} a disparu et son fichier est resté dans le magasin.`,
  );
  const lecture = await serveur.appeler('GET', `/api/pieces/${entite}/${identifiant}/${piece}`);
  assert.equal(
    lecture.statut,
    404,
    `DÉLIVRANCE : GET /api/pieces/${entite}/${identifiant}/${piece} rend ${String(lecture.statut)}. ` +
      'Le document d’un enregistrement supprimé se télécharge encore — dans un produit qui porte ' +
      'un registre RGPD, l’article 17 n’est pas tenu.',
  );
  assert.equal(await fileDePurge(), 0, 'La file de purge doit être vide quand la réponse est rendue.');
}

describe('Q-232 — la CASCADE emporte aussi les pièces des enfants', () => {
  test('LA MATIÈRE : les chemins sont DÉRIVÉS du schéma, jamais récités', async () => {
    const cascades = await cascadesDuSchema();
    // Six au 07/09/2026 — clients→exigences, exigences/risques/evaluations/incidents→actions,
    // scenarios_pra→tests_pra. Le nombre n'est PAS gardé : ce qui compte est qu'il
    // n'y en ait aucune que le balayage ignore, et une septième doit entrer toute
    // seule. Ce qui est gardé, c'est qu'il y en ait — un balayage qui ne balaie rien
    // rend « aucun défaut » exactement comme un produit sain.
    assert.ok(
      cascades.length >= 6,
      `Seulement ${String(cascades.length)} cascade(s) découverte(s) : le prédicat ne reconnaît ` +
        'plus le schéma, et « aucune orpheline » ne voudrait plus rien dire.',
    );
    for (const c of cascades) {
      assert.ok(c.colonne, `${c.enfant} → ${c.parent} : colonne de rattachement introuvable.`);
    }
  });

  test('CHAQUE cascade : la pièce de l’enfant suit — ligne, fichier, délivrance', async () => {
    const cascades = await cascadesDuSchema();
    const echecs = [];

    for (const { parent, enfant, colonne } of cascades) {
      const idParent = await creer(parent);
      const idEnfant = await creer(enfant, { [colonne]: idParent });
      const piece = await deposerSur(enfant, idEnfant, `cascade-${enfant}.pdf`);

      const suppression = await serveur.appeler('DELETE', `/api/entites/${parent}/${idParent}?version=1`);
      assert.equal(suppression.statut, 200, `${parent} : ${JSON.stringify(suppression.corps)}`);

      // L'enfant DOIT avoir disparu : sans quoi l'essai mesurerait l'absence de
      // cascade et non la présence du correctif — un essai qui passe pour la
      // mauvaise raison est pire qu'un essai absent.
      const restant = await serveur.appeler('GET', `/api/pieces/${enfant}/${idEnfant}`);
      try {
        assert.equal(await piecesDe(enfant, idEnfant), 0);
        assert.equal(await existe(piece.disque), false);
        assert.equal(restant.statut, 200, 'la route de liste répond même sur un porteur disparu');
        assert.deepEqual(restant.corps.pieces, []);
      } catch (erreur) {
        echecs.push(`${parent} → ${enfant} (${colonne}) : ${erreur.message}`);
      }
    }

    assert.deepEqual(
      echecs,
      [],
      'Des cascades laissent des pièces derrière elles :\n  · ' + echecs.join('\n  · '),
    );
    assert.equal(await fileDePurge(), 0, 'La file de purge doit être vide quand la réponse est rendue.');
  });

  test('DEUX NIVEAUX : supprimer un donneur d’ordre emporte l’exigence ET l’action', async () => {
    /* Le chemin que le rapport de la porte S8 place en tête de son tableau, et
       le seul à deux étages : `clients` → `exigences` → `actions`. Deux pièces
       sont déposées, une à chaque étage. */
    const client = await creer('clients');
    const exigence = await creer('exigences', { client_id: client });
    const action = await creer('actions', { exigence_id: exigence });

    const pieceExigence = await deposerSur('exigences', exigence, 'exigence.pdf');
    const pieceAction = await deposerSur('actions', action, 'action.pdf');

    const suppression = await serveur.appeler('DELETE', `/api/entites/clients/${client}?version=1`);
    assert.equal(suppression.statut, 200, JSON.stringify(suppression.corps));

    await rienNaSurvecu('exigences', exigence, pieceExigence.id, pieceExigence.disque);
    await rienNaSurvecu('actions', action, pieceAction.id, pieceAction.disque);
  });

  test('LA MORSURE : sans le déclencheur, l’essai rougit', async () => {
    /* ⚠️ Un correctif ne compte que s'il MORD (`CLAUDE.md` §8). Q-210 est né de
       là : deux correctifs de « fuite de données » étaient justes dans le code,
       l'auditeur les a cassés un par un, et le banc est resté 30/30 vert — ils
       étaient fermés dans le code, pas dans le banc.

       On désarme donc le déclencheur de `tests_pra`, on rejoue la cascade, et on
       VÉRIFIE QUE LE DÉFAUT REVIENT. Le désarmement passe par le propriétaire :
       `grc_app` ne le peut pas, et c'est la couche 4 de la garantie d'ajout seul
       du journal (`CONVENTIONS.md` §12). */
    const proprietaire = await base.connexion('proprietaire');
    const scenario = await creer('scenarios_pra');
    const test = await creer('tests_pra', { scenario_id: scenario });
    const piece = await deposerSur('tests_pra', test, 'morsure.pdf');

    await proprietaire.query('alter table tests_pra disable trigger trg_tests_pra_pieces');
    try {
      const suppression = await serveur.appeler(
        'DELETE',
        `/api/entites/scenarios_pra/${scenario}?version=1`,
      );
      assert.equal(suppression.statut, 200, JSON.stringify(suppression.corps));

      assert.equal(
        await piecesDe('tests_pra', test),
        1,
        'LE CONTRÔLE NE MORD PAS : le déclencheur est désarmé et la pièce disparaît quand même. ' +
          'Quelque chose d’autre la retire, et l’essai vert ne prouve donc rien du déclencheur.',
      );
      assert.equal(await existe(piece.disque), true, 'le fichier doit rester quand le garde est retiré');
    } finally {
      await proprietaire.query('alter table tests_pra enable always trigger trg_tests_pra_pieces');
    }

    // Et le ménage : la pièce orpheline volontairement produite ne doit pas
    // fausser le compte des essais suivants.
    await base.avecPerimetre(applicatif, perimetre('menage', FILIALE_A, [FILIALE_A]), async (c) => {
      await c.query('delete from pieces_jointes where entite_type = $1 and entite_id = $2', [
        'tests_pra',
        test,
      ]);
    });
  });
});

describe('LA QUARANTAINE ne perd PAS son fichier — l’exception, et elle est voulue', () => {
  test('supprimer le porteur d’une pièce INFECTÉE retire la ligne et GARDE le fichier', async () => {
    /* ⚠️ **La moitié qui empêche le correctif d'être pire que le défaut.** Un
       balayeur qui effacerait tout supprimerait, avec un risque, la preuve d'une
       tentative d'intrusion — `DELETE /api/pieces/…` s'en abstient déjà
       explicitement, et la file doit dire la même chose.

       ⚠️ **Ce que cet essai verrouille exactement, et je le dis parce qu'un essai
       qui promet plus qu'il ne mesure est le motif de la moitié des constats de ce
       chantier.** Le fichier de quarantaine est aujourd'hui hors d'atteinte *par
       construction* : `retirerDuMagasin()` résout sous la racine du MAGASIN, et le
       fichier n'y est plus. L'assertion sur sa présence est donc un **filet pour
       demain** — elle mordra le jour où quelqu'un élargira le balayeur —, pas la
       preuve d'une décision d'aujourd'hui.

       Ce qui est **discriminant maintenant**, c'est la ligne de file : elle doit
       être **consommée**. La première rédaction la laissait — « pour que le fichier
       reste recensé » — et la file se serait remplie de lignes permanentes, ruinant
       le seul signal que l'exploitant a (`GUIDE_EXPLOITATION` §4 bis) : « vide »
       veut dire « tout va bien ». Une alarme qui sonne toujours ne dit plus rien.
       Cette assertion-là rougit sur la rédaction précédente. */
    const risque = await creer('risques');
    const piece = await deposerSur('risques', risque, 'piece-qui-sera-infectee.pdf');

    // Mise en quarantaine, telle que la chaîne d'analyse la produit : la ligne
    // porte l'état, et le fichier quitte le magasin pour la quarantaine.
    await base.avecPerimetre(applicatif, perimetre('antivirus', FILIALE_A, [FILIALE_A]), async (c) => {
      await c.query(
        `update pieces_jointes
            set etat_analyse = 'infectee', quarantaine = true, date_analyse = now(),
                signature_virale = 'Essai.Q232'
          where id = $1`,
        [piece.id],
      );
    });
    const enQuarantaine = join(serveur.magasin, 'quarantaine', piece.chemin);
    await mkdir(dirname(enQuarantaine), { recursive: true });
    await rename(piece.disque, enQuarantaine);

    const suppression = await serveur.appeler('DELETE', `/api/entites/risques/${risque}?version=1`);
    assert.equal(suppression.statut, 200, JSON.stringify(suppression.corps));

    assert.equal(await piecesDe('risques', risque), 0, 'la ligne suit son porteur, infectée ou non');
    assert.equal(
      await existe(enQuarantaine),
      true,
      'LE FICHIER EN QUARANTAINE A ÉTÉ EFFACÉ. Supprimer un risque vient de détruire la ' +
        'preuve d’une tentative d’intrusion — c’est exactement ce que la route de suppression ' +
        'd’une pièce refuse de faire, et les deux chemins doivent dire la même chose.',
    );
    assert.equal(
      await fileDePurge(),
      0,
      'La ligne de file d’une pièce en quarantaine doit être CONSOMMÉE : la garder ferait ' +
        'grossir indéfiniment une file dont « vide » est le signal de bonne santé.',
    );
  });
});

describe('Q-233 — la reprise « remplacer » n’oublie plus les pièces', () => {
  test('PURGER LA FILIALE emporte les pièces de tout ce qu’elle vide', async () => {
    /* Mesuré au 6ᵉ passage de la porte S8 : seize collections vidées, **zéro
       pièce retirée**, et `GET /api/pieces/risques/<risque purgé>/<pj>` rendait
       200 avec « preuve-confidentielle.pdf ». La cause : `pieces_jointes` n'est
       pas dans le registre des entités, donc `purgerFiliale` ne la nomme pas —
       et ne peut pas la nommer, le lien étant polymorphe.

       ⚠️ **Conséquence assumée, et elle doit être dite** : restaurer un export
       en mode « remplacer » DÉTRUIT désormais les pièces jointes de l'état
       remplacé. Le fichier `grc-backup` ne les transporte pas ; les conserver
       « au cas où les identifiants coïncideraient » était la situation d'avant,
       et le rapport de la porte la qualifie — « par accident, pas par
       conception ». Voir `docs/GUIDE_EXPLOITATION.md`. */
    const risque = await creer('risques');
    const piece = await deposerSur('risques', risque, 'preuve-confidentielle.pdf');

    const reponse = await serveur.appeler('POST', '/api/reprise', {
      corps: {
        mode: 'remplacer',
        fichier: {
          nom: 'export.json',
          contenu: JSON.stringify({
            format: 'grc-backup',
            version: 12,
            encrypted: false,
            createdAt: new Date().toISOString(),
            app: 'cyber-grc',
            payload: { schemaVersion: 12, risques: [] },
          }),
        },
      },
    });
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.applique, true, JSON.stringify(reponse.corps));

    await rienNaSurvecu('risques', risque, piece.id, piece.disque);
  });
});

describe('LA CLASSE EST FERMÉE — toute entité où une pièce se dépose porte le déclencheur', () => {
  /* ⚠️ **C'est l'essai qui empêche la septième occurrence.** Les deux moitiés de
     la règle vivent dans deux langages : la migration `017` équipe les tables
     qu'elle DÉCOUVRE dans le catalogue, et le garde-fou `f_verifier_declencheurs_pieces()`
     le vérifie ; mais ni l'une ni l'autre ne sait ce que la ROUTE DE DÉPÔT
     accepte — c'est `Object.keys(DOMAINE_PAR_ENTITE)`, une liste TypeScript.
     Une entité ajoutée là demain, dont la table ne serait pas équipée, rouvrirait
     Q-232 en silence. Cet essai est la couture. */

  test('chaque entité admise par la route de dépôt a une table équipée', async () => {
    const { DOMAINE_PAR_ENTITE } = await moduleCompile('api/droits.js');
    // « filiales » n'est pas une entité métier : le logo a ses propres routes
    // statiques (`/api/pieces/logo`), et il se rattache sous ce nom-là.
    const admises = [...Object.keys(DOMAINE_PAR_ENTITE), 'filiales'].sort();

    const couverts = await base.avecPerimetre(
      applicatif,
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (
          await c.query(`
          select distinct m[1] as valeur
            from pg_trigger t
            join pg_proc p on p.oid = t.tgfoid,
                 lateral regexp_matches(pg_get_triggerdef(t.oid), '''([a-z_]+)''', 'g') m
           where p.proname = 'f_pieces_suivent_leur_porteur' and not t.tgisinternal`)
        ).rows.map((l) => l.valeur),
    );

    const manquantes = admises.filter((e) => !couverts.includes(e));
    assert.deepEqual(
      manquantes,
      [],
      'Ces entités acceptent un dépôt de pièce jointe mais aucune table n’est équipée du ' +
        'déclencheur qui les retire quand leur porteur disparaît :\n  · ' +
        manquantes.join('\n  · ') +
        '\nUne pièce déposée là survivrait à son porteur, en base, sur le disque et dans le ' +
        'quota — c’est le constat Q-232, rouvert un cran plus haut.',
    );
  });

  test('le garde-fou du schéma ne rend AUCUNE ligne, et il est joué par f_verifier_schema()', async () => {
    const anomalies = await base.avecPerimetre(
      applicatif,
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) => (await c.query('select * from f_verifier_declencheurs_pieces()')).rows,
    );
    assert.deepEqual(
      anomalies,
      [],
      'Le garde-fou des déclencheurs de pièces jointes signale :\n  · ' +
        anomalies.map((a) => `${a.objet} : ${a.anomalie} — ${a.detail}`).join('\n  · '),
    );

    // Un garde-fou que rien n'appelle est un commentaire (`CONVENTIONS.md` §18.4) :
    // il doit être DÉCOUVERT par le point d'appel unique, pas seulement exister.
    const registre = await base.avecPerimetre(
      applicatif,
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (
          await c.query(
            "select fonction from controles_schema where fonction = 'f_verifier_declencheurs_pieces'",
          )
        ).rows,
    );
    assert.equal(
      registre.length,
      1,
      'Le garde-fou n’est pas au registre `controles_schema` : il cesserait d’être joué sans ' +
        'que rien ne le dise (constat Q-5).',
    );
  });
});
