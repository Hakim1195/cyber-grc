/**
 * purge.test.mjs — **la purge RGPD anonymise, elle ne supprime pas**
 * (`CONVENTIONS.md` §35.3).
 *
 * ── Le défaut que ce fichier existe pour attraper ────────────────────────────
 *
 * Les entités stockent les noms **en texte** (`responsable`, `proprietaire`,
 * `auditeur`, `participants`) : c'est la décision « annuaire + autocomplétion,
 * pas de clé étrangère ». Une purge qui se contenterait de supprimer la fiche
 * `personnes` retirerait la **suggestion** et laisserait le nom partout ailleurs
 * — elle **prétendrait** effacer sans effacer, et le rapport dirait « purgé ».
 *
 * L'essai cherche donc le nom **partout après la purge**, avec son propre
 * balayage : celui du produit ne peut pas être son propre juge.
 *
 * ── L'exigence de matière ────────────────────────────────────────────────────
 *
 * *Une purge qui n'avait rien à purger et conclut « purgé » ne prouve rien.* Ce
 * dépôt a produit trois essais de cette forme. Le §0 pose donc un plancher : le
 * nom **doit** être présent dans au moins dix emplacements avant la purge, et
 * l'essai échoue si le semis ne l'a pas fait.
 *
 * Prérequis machine : PostgreSQL prêt ; sur SRV-Infra, `source ~/.grc-essais.env`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { lireEnBase, monterCycle, perimetreDe, profil, SessionDEssai, valeurEnBase } from './aide.mjs';

/**
 * Le nom purgé. Deux apostrophes typographiques et un tiret : il traverse des
 * requêtes paramétrées, jamais concaténées, et l'essai le prouve en le
 * retrouvant intact avant la purge.
 */
const NOM = "Amélie D'Urand-N'Guyen";
/** La mention neutre du §35.3, écrite ici mot pour mot — elle est normative. */
const NEUTRE = 'personne retirée';

/** Un nom forgé pour piéger un `like` : `%` et `_` y sont des méta-caractères. */
const NOM_PIEGE = 'Ana%s_Kuo';
/** Ce qu'un `like '%Ana%s_Kuo%'` attraperait à tort, et qui doit rester intact. */
const NOM_VOISIN = 'AnaXsYKuo';

let base;
let applicatif;
let proprietaire;
let session;
let serveur;
let chemins;

const DROITS_ADMIN = profil('administration', { export: false });
const perimetreAdmin = () =>
  perimetreDe('admin.grc', FILIALE_A, [FILIALE_A, FILIALE_B], {
    perimetreGroupe: true,
    administrationGroupe: true,
  });

/** Écrit dans la base par le chemin du PRODUIT : compte applicatif, sous périmètre. */
async function semer(travail, p = {}) {
  return await base.avecPerimetre(
    applicatif,
    perimetre(
      p.utilisateur ?? 'semeur',
      p.filialeId ?? FILIALE_A,
      p.filiales ?? [FILIALE_A, FILIALE_B],
      p.administrationGroupe ?? true,
    ),
    travail,
    { annuler: false },
  );
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, applicatif);

  // ── LA MATIÈRE ─────────────────────────────────────────────────────────
  // Le nom est semé dans les DIX colonnes que le produit doit connaître, plus
  // trois emplacements qu'il ne doit PAS toucher (incidents, journal, compte
  // d'annuaire), plus un chez la filiale voisine.
  await semer(async (c) => {
    await c.query('insert into personnes (id, filiale_id, nom, fonction) values ($1, $2, $3, $4)', [
      'PERS-PURGE',
      FILIALE_A,
      NOM,
      'Responsable conformité',
    ]);
    await c.query('update actifs      set responsable  = $1 where id = $2', [NOM, 'ACTIF-A']);
    await c.query('update actions     set responsable  = $1 where id = $2', [NOM, 'ACT-A']);
    await c.query('update audits      set auditeur     = $1 where id = $2', [NOM, 'AUD-A']);
    await c.query('update exigences   set responsable  = $1 where id = $2', [NOM, 'EX-A']);
    await c.query('update mco_actions set responsable  = $1 where id = $2', [NOM, 'MCO-A']);
    await c.query('update processus   set responsable  = $1 where id = $2', [NOM, 'BIA-A']);
    await c.query('update traitements set responsable  = $1 where id = $2', [NOM, 'TRT-A']);
    await c.query('update mesure_mise_en_oeuvre set responsable = $1 where id = $2', [NOM, 'MMO-A']);
    await c.query('update documents   set proprietaire = $1 where id = $2', [NOM, 'DOC-A']);

    // Champ MULTI-PERSONNES : un nom par ligne. Les deux autres doivent survivre.
    await c.query('update revues set participants = $1 where id = $2', [
      `Jean Martin\n${NOM}\nSophie Bernard`,
      'REV-A',
    ]);

    // Cellule de crise : le titulaire ici, le suppléant dans une seconde fiche.
    await c.query(
      'update crise set nom = $1, telephone = $2, email = $3 where id = $4',
      [NOM, '+33 6 12 34 56 78', 'amelie.durand@exemple.fr', 'CRISE-A'],
    );
    await c.query(
      `insert into crise (id, filiale_id, role, nom, suppleant, telephone, email)
            values ('CRISE2-A', $1, 'Responsable communication', 'Marc Petit', $2,
                    '+33 6 98 76 54 32', 'marc.petit@exemple.fr')`,
      [FILIALE_A, NOM],
    );

    // ── Ce que la purge NE DOIT PAS toucher ─────────────────────────────
    await c.query('update incidents set description = $1 where id = $2', [
      `Tentative d'hameçonnage signalée par ${NOM} le 3 mars.`,
      'INC-A',
    ]);
    await c.query('update utilisateurs set nom = $1 where id = $2', [NOM, 'USER-A']);
    await c.query(
      `insert into journal_audit (filiale_id, utilisateur_libelle, action, resume)
            values ($1, $2, 'connexion_reussie', 'Connexion réussie.')`,
      [FILIALE_A, NOM],
    );

    // Le piège du `like`, et son voisin qui doit survivre.
    await c.query('insert into personnes (id, filiale_id, nom) values ($1, $2, $3)', [
      'PERS-PIEGE',
      FILIALE_A,
      NOM_PIEGE,
    ]);
    await c.query(
      `insert into actifs (id, filiale_id, nom, responsable) values
           ('ACTIF-PIEGE',  $1, 'Sauvegarde',  $2),
           ('ACTIF-VOISIN', $1, 'Supervision', $3)`,
      [FILIALE_A, NOM_PIEGE, NOM_VOISIN],
    );
  });

  // La filiale voisine : le même nom, hors de portée de la purge.
  await semer(async (c) => c.query('update actifs set responsable = $1 where id = $2', [NOM, 'ACTIF-B']), {
    filialeId: FILIALE_B,
    administrationGroupe: false,
  });

  // Portée Groupe : la session de purge porte l'administration Groupe, donc elle
  // en répond.
  await semer(async (c) => c.query('update documents set proprietaire = $1 where id = $2', [NOM, 'DOC-G']));

  session = new SessionDEssai(perimetreAdmin(), DROITS_ADMIN);
  serveur = await monterCycle(base, session);
  chemins = serveur.chemins;
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/**
 * **Le balayage de l'essai**, indépendant de celui du produit.
 *
 * Le produit rend un rapport de ce qu'il a laissé derrière lui ; s'en contenter
 * reviendrait à lui demander de se juger lui-même. Celui-ci découvre les colonnes
 * dans `pg_catalog`, lit sous le compte PROPRIÉTAIRE, et rend chaque emplacement
 * où le nom subsiste, avec la filiale de la ligne.
 */
async function ouEstLeNom(nom) {
  return await base.avecPerimetre(
    proprietaire,
    { utilisateur: 'auditeur', filialeId: null, filiales: [FILIALE_A, FILIALE_B] },
    async (c) => {
      const { rows: colonnes } = await c.query(
        `select cl.relname::text as t, a.attname::text as col,
                exists (select 1 from pg_attribute f
                         where f.attrelid = cl.oid and f.attname = 'filiale_id'
                           and f.attnum > 0 and not f.attisdropped) as cloisonnee
           from pg_class cl
           join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
           join pg_attribute a on a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped
          where cl.relkind = 'r'
            and format_type(a.atttypid, a.atttypmod) in ('text', 'character varying')
          order by 1, 2`,
      );
      const trouves = [];
      for (const { t, col, cloisonnee } of colonnes) {
        const { rows } = await c.query(
          `select ${cloisonnee ? '"filiale_id"' : 'null::text'} as filiale, count(*)::int as n
             from "${t}" where strpos(lower(coalesce("${col}", '')), lower($1)) > 0
            group by 1`,
          [nom],
        );
        for (const r of rows) trouves.push({ table: t, colonne: col, filiale: r.filiale, lignes: r.n });
      }
      return trouves;
    },
  );
}

const dans = (trouves, filiale) => trouves.filter((t) => t.filiale === filiale);
const emplacements = (trouves) => trouves.map((t) => `${t.table}.${t.colonne}`).sort();

/* =====================================================================
 *  §0 — La matière
 * ===================================================================== */

let AVANT;

describe('§0 — le nom est réellement partout avant la purge', () => {
  test('au moins dix emplacements, dont le journal, un incident et la voisine', async () => {
    AVANT = await ouEstLeNom(NOM);
    const noms = emplacements(AVANT);
    assert.ok(
      noms.length >= 10,
      `seulement ${String(noms.length)} emplacement(s) semés : l'essai ne mesurerait rien.\n  ${noms.join('\n  ')}`,
    );
    for (const attendu of [
      'actifs.responsable',
      'actions.responsable',
      'audits.auditeur',
      'crise.nom',
      'crise.suppleant',
      'documents.proprietaire',
      'exigences.responsable',
      'incidents.description',
      'journal_audit.utilisateur_libelle',
      'mco_actions.responsable',
      'mesure_mise_en_oeuvre.responsable',
      'personnes.nom',
      'processus.responsable',
      'revues.participants',
      'traitements.responsable',
      'utilisateurs.nom',
    ]) {
      assert.ok(noms.includes(attendu), `le semis n'a pas posé le nom dans « ${attendu} »`);
    }
    assert.ok(
      dans(AVANT, FILIALE_B).length >= 1,
      'la filiale voisine doit porter le nom : sinon « rien n’a bougé chez elle » vaut pour une table vide',
    );
  });
});

/* =====================================================================
 *  §1 — La purge, et ce qu'elle rapporte
 * ===================================================================== */

describe('§1 — la purge rend des COMPTES, et ils sont exacts', () => {
  let reponse;

  test('la route répond, et dit ce qu’elle a fait', async () => {
    reponse = await serveur.appeler('POST', chemins.purge, { corps: { personne_id: 'PERS-PURGE' } });
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));

    const { corps } = reponse;
    assert.equal(corps.personne.id, 'PERS-PURGE');
    assert.equal(corps.fiche_supprimee, true);

    // ── MATIÈRE : l'état de départ est mesuré, pas supposé
    assert.ok(
      corps.avant.reduce((s, r) => s + r.lignes, 0) >= 16,
      'l’état de départ rendu est plus maigre que le semis : le balayage ne voit pas tout',
    );

    // ── Les DIX colonnes attendues, nommées
    for (const emplacement of [
      'actifs.responsable',
      'actions.responsable',
      'audits.auditeur',
      'crise.nom',
      'crise.suppleant',
      'documents.proprietaire',
      'exigences.responsable',
      'mco_actions.responsable',
      'mesure_mise_en_oeuvre.responsable',
      'processus.responsable',
      'revues.participants',
      'traitements.responsable',
    ]) {
      assert.ok(
        corps.anonymisees[emplacement] >= 1,
        `« ${emplacement} » n'a pas été anonymisée (rapport : ${JSON.stringify(corps.anonymisees)})`,
      );
    }
    assert.equal(corps.contacts_vides, 2, 'les deux fiches de crise doivent perdre leurs coordonnées');
    assert.ok(corps.total_lignes >= 14);
  });

  test('les incidents sont SIGNALÉS, avec la colonne concernée et sans son texte', () => {
    assert.equal(reponse.corps.incidents_a_examiner.length, 1);
    const signale = reponse.corps.incidents_a_examiner[0];
    assert.equal(signale.id, 'INC-A');
    assert.deepEqual(signale.colonnes, ['description']);
    assert.equal(
      JSON.stringify(signale).includes(NOM),
      false,
      'le signalement transporte le texte : ce n’est pas à cette réponse-ci de le faire',
    );
  });

  test('ce qui RESTE est nommé et classé — aucune « anomalie »', () => {
    const restes = reponse.corps.restes;
    const anomalies = restes.filter((r) => r.classe === 'anomalie');
    assert.deepEqual(
      anomalies,
      [],
      'la purge a laissé le nom là où elle aurait dû l’effacer :\n  ' +
        anomalies.map((r) => `${r.table}.${r.colonne} (${String(r.lignes)})`).join('\n  '),
    );
    const parClasse = Object.fromEntries(restes.map((r) => [`${r.table}.${r.colonne}`, r.classe]));
    assert.equal(parClasse['incidents.description'], 'incidents');
    assert.equal(parClasse['utilisateurs.nom'], 'compte_annuaire');
    assert.equal(
      parClasse['actifs.responsable'],
      'autre_filiale',
      'le nom chez la filiale voisine est une purge de PLUS à faire, pas un défaut ici',
    );
    // Le journal d'audit n'est pas balayé : il n'apparaît donc jamais en reste.
    assert.equal(
      restes.some((r) => r.table === 'journal_audit'),
      false,
      'le journal ne doit pas figurer au balayage — un garde-fou qui crie sur le cas nominal ' +
        's’apprend à être ignoré (Q-123)',
    );
  });
});

/* =====================================================================
 *  §2 — Le balayage de l'ESSAI : le nom a-t-il vraiment disparu ?
 * ===================================================================== */

describe('§2 — le nom cherché PARTOUT, par l’essai et non par le produit', () => {
  let apres;

  test('dans la filiale purgée, il ne reste QUE l’incident et le journal', async () => {
    // ⚠️ Ce balayage-ci, contrairement à celui du produit, N'EXCLUT PAS
    // `journal_audit` : c'est ainsi qu'il PROUVE que la purge ne l'a pas touché.
    // Les deux emplacements attendus sont donc exactement les deux que le §35.3
    // met hors d'atteinte — le texte libre d'un incident, et le registre.
    apres = await ouEstLeNom(NOM);
    const restants = emplacements(dans(apres, FILIALE_A));
    assert.deepEqual(
      restants,
      ['incidents.description', 'journal_audit.utilisateur_libelle'],
      'le nom subsiste dans la filiale purgée ailleurs que dans un texte libre d’incident ' +
        'ou dans le journal — c’est-à-dire là où la purge aurait dû l’effacer',
    );
  });

  test('la fiche d’annuaire a disparu, et le nom avec elle', async () => {
    assert.equal(
      await valeurEnBase(base, proprietaire, 'select count(*) from personnes where id = $1', ['PERS-PURGE'], {
        filiales: [FILIALE_A, FILIALE_B],
      }),
      '0',
    );
  });

  test('les DIX colonnes portent la mention neutre, exactement', async () => {
    const attendus = [
      ['actifs', 'responsable', 'ACTIF-A'],
      ['actions', 'responsable', 'ACT-A'],
      ['audits', 'auditeur', 'AUD-A'],
      ['exigences', 'responsable', 'EX-A'],
      ['mco_actions', 'responsable', 'MCO-A'],
      ['processus', 'responsable', 'BIA-A'],
      ['traitements', 'responsable', 'TRT-A'],
      ['mesure_mise_en_oeuvre', 'responsable', 'MMO-A'],
      ['documents', 'proprietaire', 'DOC-A'],
      ['documents', 'proprietaire', 'DOC-G'],
    ];
    for (const [table, colonne, id] of attendus) {
      const valeur = await valeurEnBase(
        base,
        proprietaire,
        `select "${colonne}" from "${table}" where id = $1`,
        [id],
        { filiales: [FILIALE_A, FILIALE_B] },
      );
      assert.equal(valeur, NEUTRE, `${table}.${colonne} de ${id} n'est pas la mention neutre`);
    }
  });

  test('le champ MULTI-PERSONNES ne perd que la ligne du purgé', async () => {
    const valeur = await valeurEnBase(
      base,
      proprietaire,
      'select participants from revues where id = $1',
      ['REV-A'],
      { filiales: [FILIALE_A, FILIALE_B] },
    );
    assert.equal(
      valeur,
      `Jean Martin\n${NEUTRE}\nSophie Bernard`,
      'les autres participants doivent survivre, à la ligne près',
    );
  });

  test('la cellule de crise garde ses RÔLES et perd ses coordonnées', async () => {
    const lignes = await lireEnBase(
      base,
      proprietaire,
      'select id, role, nom, suppleant, telephone, email from crise where id = any($1) order by id',
      [['CRISE-A', 'CRISE2-A']],
      { filiales: [FILIALE_A, FILIALE_B] },
    );
    const [titulaire, second] = lignes;
    assert.equal(titulaire.role, 'Directeur de crise', 'le rôle n’est pas une donnée personnelle');
    assert.equal(titulaire.nom, NEUTRE);
    assert.equal(titulaire.telephone, null);
    assert.equal(titulaire.email, null);

    assert.equal(second.role, 'Responsable communication');
    assert.equal(second.nom, 'Marc Petit', 'le titulaire d’une autre fiche ne doit pas bouger');
    assert.equal(second.suppleant, NEUTRE);
    assert.equal(second.telephone, null, 'les coordonnées d’une fiche où le purgé est SUPPLÉANT');
    assert.equal(second.email, null);
  });

  test('l’incident est INTACT — le produit signale, un humain tranche', async () => {
    const description = await valeurEnBase(
      base,
      proprietaire,
      'select description from incidents where id = $1',
      ['INC-A'],
      { filiales: [FILIALE_A, FILIALE_B] },
    );
    assert.equal(
      description,
      `Tentative d'hameçonnage signalée par ${NOM} le 3 mars.`,
      'une description libre peut être la seule preuve d’un incident : la purger serait ' +
        'détruire une preuve d’audit sans que personne l’ait décidé (§35.3)',
    );
  });

  test('la filiale voisine n’a pas bougé — le cloisonnement tient dans les deux sens', async () => {
    const valeur = await valeurEnBase(
      base,
      proprietaire,
      'select responsable from actifs where id = $1',
      ['ACTIF-B'],
      { filiales: [FILIALE_A, FILIALE_B] },
    );
    assert.equal(valeur, NOM, 'la purge a écrit chez la filiale voisine');
  });
});

/* =====================================================================
 *  §3 — Le journal d'audit n'est JAMAIS touché
 * ===================================================================== */

describe('§3 — le journal survit intact, chaîne comprise', () => {
  test('l’entrée qui portait le nom est toujours là, mot pour mot', async () => {
    const n = await valeurEnBase(
      base,
      proprietaire,
      'select count(*) from journal_audit where utilisateur_libelle = $1',
      [NOM],
      { filiales: [FILIALE_A, FILIALE_B] },
    );
    assert.equal(
      Number(n),
      1,
      'la purge a touché le journal : la chaîne est la promesse centrale du produit (§35.3)',
    );
  });

  test('f_journal_audit_verifier() ne rend AUCUNE anomalie', async () => {
    const anomalies = await lireEnBase(
      base,
      proprietaire,
      'select numero_entree, anomalie, detail from f_journal_audit_verifier()',
      [],
      { filiales: [FILIALE_A, FILIALE_B] },
    );
    assert.deepEqual(
      anomalies,
      [],
      'la chaîne du journal porte des anomalies après une purge RGPD :\n  ' +
        anomalies.map((a) => `${String(a.numero_entree)} ${a.anomalie}`).join('\n  '),
    );
  });

  test('l’entrée « purge » porte les COMPTES, et jamais le nom', async () => {
    const lignes = await lireEnBase(
      base,
      proprietaire,
      `select filiale_id, entite_type, entite_id, resume, valeurs_avant, valeurs_apres,
              utilisateur_libelle
         from journal_audit where action = 'purge' order by numero`,
      [],
      { filiales: [FILIALE_A, FILIALE_B] },
    );
    assert.equal(lignes.length, 1, 'ni zéro, ni deux entrées pour une purge');
    const entree = lignes[0];
    assert.equal(entree.filiale_id, FILIALE_A);
    assert.equal(entree.entite_type, 'personnes');
    assert.equal(entree.entite_id, 'PERS-PURGE');
    assert.equal(entree.utilisateur_libelle, 'admin.grc');
    assert.ok(entree.valeurs_apres.total_lignes >= 14);
    assert.equal(entree.valeurs_apres.fiche_supprimee, true);
    assert.equal(entree.valeurs_apres.incidents_signales, 1);
    assert.equal(entree.valeurs_apres.anomalies, 0);
    assert.ok(entree.valeurs_apres.lignes_par_table['actifs.responsable'] >= 1);

    // ⚠️ LE POINT DU §35.3 : « le nombre de lignes touchées par table, JAMAIS
    // leur contenu ». Recopier le nom dans un registre inaltérable conservé trois
    // ans serait l'exact contraire d'une purge.
    assert.equal(
      JSON.stringify(entree).includes(NOM),
      false,
      'l’entrée de journal transporte le nom que la purge vient d’effacer partout ailleurs',
    );
    assert.equal(JSON.stringify(entree).includes('Amélie'), false);
  });

  test('une entrée « administration » accompagne la purge (crochet onResponse)', async () => {
    const n = await valeurEnBase(
      base,
      proprietaire,
      "select count(*) from journal_audit where action = 'administration'",
      [],
      { filiales: [FILIALE_A, FILIALE_B] },
    );
    assert.ok(Number(n) >= 1, 'la route est déclarée « administrer » : le crochet doit tracer l’acte');
  });
});

/* =====================================================================
 *  §4 — Le piège du « like »
 * ===================================================================== */

describe('§4 — un nom porteur de « % » et de « _ » n’est pas un motif', () => {
  test('le porteur du nom piégé est purgé, son homonyme approché ne l’est pas', async () => {
    const reponse = await serveur.appeler('POST', chemins.purge, {
      corps: { personne_id: 'PERS-PIEGE' },
    });
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.anonymisees['actifs.responsable'], 1, 'une ligne, et une seule');

    const purge = await valeurEnBase(
      base,
      proprietaire,
      'select responsable from actifs where id = $1',
      ['ACTIF-PIEGE'],
      { filiales: [FILIALE_A, FILIALE_B] },
    );
    assert.equal(purge, NEUTRE);

    const voisin = await valeurEnBase(
      base,
      proprietaire,
      'select responsable from actifs where id = $1',
      ['ACTIF-VOISIN'],
      { filiales: [FILIALE_A, FILIALE_B] },
    );
    assert.equal(
      voisin,
      NOM_VOISIN,
      `« ${NOM_PIEGE} » a été traité comme un motif : « ${NOM_VOISIN} » a été effacé avec lui`,
    );
  });
});

/* =====================================================================
 *  §5 — Les refus
 * ===================================================================== */

describe('§5 — ce qui est refusé', () => {
  const rendreLaSession = () => session.poser(perimetreAdmin(), DROITS_ADMIN);

  test('une personne inconnue rend 404', async () => {
    rendreLaSession();
    const { statut } = await serveur.appeler('POST', chemins.purge, {
      corps: { personne_id: 'PERS-INEXISTANTE' },
    });
    assert.equal(statut, 404);
  });

  test('un niveau « contribution » ne purge rien', async () => {
    session.poser(perimetreAdmin(), profil('contribution'));
    const avant = await valeurEnBase(
      base,
      proprietaire,
      'select count(*) from personnes where id = $1',
      ['PERS-A'],
      { filiales: [FILIALE_A, FILIALE_B] },
    );
    assert.equal(Number(avant), 1, 'matière : la fiche doit exister avant le refus');

    const { statut } = await serveur.appeler('POST', chemins.purge, { corps: { personne_id: 'PERS-A' } });
    assert.equal(statut, 403);
    assert.equal(
      Number(
        await valeurEnBase(base, proprietaire, 'select count(*) from personnes where id = $1', ['PERS-A'], {
          filiales: [FILIALE_A, FILIALE_B],
        }),
      ),
      1,
      'un refus qui purge quand même',
    );
    rendreLaSession();
  });

  test('un champ inconnu est refusé, pas ignoré', async () => {
    const { statut, corps } = await serveur.appeler('POST', chemins.purge, {
      corps: { personne_id: 'PERS-A', nom: 'peu importe' },
    });
    assert.equal(statut, 400);
    assert.match(String(corps.message ?? ''), /« nom »/u);
  });

  test('une fiche d’une AUTRE filiale que la filiale active est refusée, en le disant', async () => {
    // PERS-B appartient à la filiale voisine : elle est LISIBLE du périmètre
    // Groupe, et n'est pas ÉCRIVABLE. Le produit doit le dire plutôt que de
    // rendre « purgé » sur une fiche intacte.
    const { statut, corps } = await serveur.appeler('POST', chemins.purge, {
      corps: { personne_id: 'PERS-B' },
    });
    assert.equal(statut, 403);
    assert.equal(corps.erreur, 'hors_perimetre');
    assert.equal(
      Number(
        await valeurEnBase(base, proprietaire, 'select count(*) from personnes where id = $1', ['PERS-B'], {
          filiales: [FILIALE_A, FILIALE_B],
        }),
      ),
      1,
      'la fiche de la filiale voisine a été supprimée',
    );
  });
});

/* =====================================================================
 *  §6 — Mécanique
 * ===================================================================== */

describe('§6 — la déclaration d’accès de la purge', () => {
  test('la route déclare l’administration sur le domaine « administration »', () => {
    const route = serveur.toutesRoutes.find(
      (r) => r.url === chemins.purge && String(r.methode).toUpperCase().includes('POST'),
    );
    assert.notEqual(route, undefined, 'la route n’est pas montée : le harnais ne mesure rien');
    assert.deepEqual(route.acces, {
      action: 'administrer',
      domaine: 'administration',
      niveau: 'administration',
    });
  });
});

/* =====================================================================
 *  §6 — UNE OCCURRENCE, UNE LIGNE — constat **Q-205 a** de la porte S6
 * =====================================================================
 *
 * Ce que l'auditeur a mesuré : une purge **nominale** — `dans_la_filiale: 0`,
 * donc la purge a fait exactement son travail — rapportait `anomalies: 1`.
 *
 * La cause n'était pas la classification, c'était la **fusion**. `chercherPartout`
 * émettait UNE ligne par `table.colonne`, portant les trois comptes, et
 * `classer()` en décidait la classe sur la première branche non nulle. Une
 * colonne portant à la fois une occurrence de portée Groupe et une chez une
 * filiale sœur — le cas d'un homonyme, qui n'a rien d'exceptionnel dans un
 * groupe de vingt filiales — rendait une seule ligne, dont le verdict taisait
 * l'une des deux.
 *
 * ⚠️ C'est la régression exacte que l'en-tête de `src/cycle/index.ts` dit avoir
 * corrigée : « la première rédaction appelait *anomalie* ce qui n'en était pas
 * une ». Elle est revenue par une autre porte — non par la classification, mais
 * par la structure qui l'alimente. Et le §1 de ce fichier ne pouvait pas la
 * voir : sa `parClasse` est indexée par `table.colonne`, si bien que deux lignes
 * de même clé s'écrasent en silence.
 *
 * ⚠️ **Pourquoi un garde-fou qui crie sur le cas nominal est grave** : c'est le
 * constat Q-123, et il se paie deux fois. On apprend à ignorer le rapport ; puis
 * le jour où il annonce une vraie anomalie, personne ne le lit.
 */

describe('§6 — deux situations sur une colonne font DEUX lignes (Q-205 a)', () => {
  const HOMONYME = 'Homonyme Partagé';
  let restes;

  before(async () => {
    // ── LA MATIÈRE : le même nom à trois endroits de significations différentes,
    //    sur UNE SEULE colonne — c'est la configuration qui fusionnait.
    await semer(async (c) => {
      // La fiche que l'on purgera : c'est elle qui porte le nom cherché.
      await c.query('insert into personnes (id, filiale_id, nom, fonction) values ($1, $2, $3, $4)', [
        'PERS-HOMONYME',
        FILIALE_A,
        HOMONYME,
        'Responsable qualité',
      ]);
      // (1) dans la filiale purgée — la purge doit l'effacer ;
      await c.query('update actifs set responsable = $1 where id = $2', [HOMONYME, 'ACTIF-A']);
      // (2) DE PORTÉE GROUPE, sur la PSSI du socle commun. C'est la moitié qui
      //     manquait : `documents` est une table MIXTE, donc `documents.proprietaire`
      //     peut porter en même temps une occurrence Groupe et une chez une sœur —
      //     la configuration exacte que la fusion écrasait.
      await c.query(
        'insert into personnes (id, filiale_id, nom, fonction) values ($1, null, $2, $3)',
        ['PERS-HOMONYME-G', HOMONYME, 'Responsable groupe'],
      );
    });
    // (3) chez la filiale sœur, SUR LA MÊME COLONNE — hors du périmètre
    //     d'écriture, jamais un défaut ici.
    await semer(
      async (c) => {
        await c.query('update actifs set responsable = $1 where id = $2', [HOMONYME, 'ACTIF-B']);
        await c.query('insert into personnes (id, filiale_id, nom, fonction) values ($1, $2, $3, $4)', [
          'PERS-HOMONYME-B',
          FILIALE_B,
          HOMONYME,
          'Responsable site',
        ]);
      },
      { filialeId: FILIALE_B },
    );

    const reponse = await serveur.appeler('POST', chemins.purge, {
      corps: { personne_id: 'PERS-HOMONYME' },
    });
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    restes = reponse.corps.restes;
  });

  test('LA MATIÈRE : « personnes.nom » porte bien DEUX situations', () => {
    // Sans cette moitié, tout ce qui suit serait vert sur une base où rien n'a
    // été semé — et c'est très exactement le vert qui a laissé passer Q-108.
    // La configuration éprouvée est PRÉCISE : une occurrence de portée Groupe ET
    // une chez une filiale sœur, sur la MÊME colonne. Une seule des deux ne
    // reproduirait pas la fusion.
    const surDocs = restes.filter((r) => r.table === 'personnes' && r.colonne === 'nom');
    assert.ok(
      surDocs.some((r) => r.portee_groupe > 0),
      'Aucune occurrence de portée Groupe : la fusion ne peut pas se produire, l’essai ne ' +
        'mesure rien. (la fiche « PERS-HOMONYME-G » a-t-elle encore filiale_id nul ?)',
    );
    assert.ok(
      surDocs.some((r) => r.autres_filiales > 0),
      'Aucune occurrence chez la filiale sœur : même remarque.',
    );
  });

  test('UNE LIGNE PAR SITUATION, jamais une ligne fondue', () => {
    for (const ligne of restes) {
      const nonNuls = [ligne.dans_la_filiale, ligne.portee_groupe, ligne.autres_filiales].filter(
        (n) => n > 0,
      );
      assert.equal(
        nonNuls.length,
        1,
        'Une ligne ne décrit qu’UNE situation. Deux comptes non nuls sur la même ligne, ' +
          'c’est la fusion de Q-205 a : son verdict tait l’une des deux. Ligne : ' +
          JSON.stringify(ligne),
      );
      assert.equal(ligne.lignes, nonNuls[0], '`lignes` est le compte de CETTE situation.');
    }
    assert.equal(
      restes.some(
        (r) => r.table === 'personnes' && r.classe === 'autre_filiale' && r.autres_filiales > 0,
      ),
      true,
      'L’occurrence chez la filiale sœur doit apparaître AVEC SON PROPRE VERDICT : c’est une ' +
        'purge de plus à faire là-bas, jamais un défaut ici.',
    );
  });

  test('LE CAS NOMINAL NE CRIE PAS : rien d’effaçable ne reste, donc aucune anomalie', () => {
    // La question que l'essai du §1 ne posait pas : ce qui reste est-il, oui ou
    // non, quelque chose que la purge aurait DÛ effacer ?
    const anomalies = restes.filter((r) => r.classe === 'anomalie');
    assert.deepEqual(
      anomalies.filter((r) => r.dans_la_filiale > 0),
      [],
      'La purge a laissé le nom dans SA filiale : c’est le seul défaut vrai.\n  ' +
        anomalies.map((r) => `${r.table}.${r.colonne} (${String(r.lignes)})`).join('\n  '),
    );
  });
});
