/**
 * retention.test.mjs — **la rétention du journal d'audit**, `deploy/retention.sh`
 * (`CONVENTIONS.md` §12, §35.4).
 *
 * ── Ce que le script doit prouver, et ce que cet essai lui demande ───────────
 *
 * Le §12 décrit quatre étapes ; ce qui compte n'est pas qu'elles aient lieu, mais
 * qu'elles **ne laissent pas la chaîne indémontrable** :
 *
 *  1. le segment est **exporté** avant d'être supprimé, et l'archive porte
 *     exactement le nombre d'entrées annoncé ;
 *  2. l'**empreinte du dernier maillon archivé** est ancrée dans `parametres` ;
 *  3. les déclencheurs sont désarmés, le segment supprimé, **puis réarmés en
 *     « always »** — et non en « origin », qu'un
 *     `set session_replication_role = replica` désarmerait de nouveau ;
 *  4. l'opération est **journalisée**.
 *
 * Et surtout : **la chaîne se vérifie DES DEUX CÔTÉS de la coupure** — l'ancrage
 * est l'empreinte du dernier archivé, et c'est elle que déclare le premier
 * survivant. Sans ce recoupement, l'archivage détruit la seule preuve que la
 * chaîne était saine.
 *
 * ── Comment on obtient un journal ancien, sans mentir ────────────────────────
 *
 * `f_journal_audit_chainage()` écrase `horodatage` par `clock_timestamp()` : rien
 * ne peut insérer une entrée datée de 2023 par le chemin normal. Le semis
 * emprunte donc le chemin que le §12 reconnaît au **propriétaire** — désarmer le
 * déclencheur de chaînage, écrire, réarmer — et il calcule chaque empreinte avec
 * `f_journal_audit_charge_utile()`, **la fonction du produit**. La chaîne semée
 * est donc authentique, et le contrôle d'entrée du script la valide avant toute
 * chose : si elle ne l'était pas, le script refuserait et l'essai le verrait.
 *
 * ⚠️ **Le code de retour n'est jamais mesuré à travers un tube.** `execFileSync`
 * lance `bash` directement et rend le statut ; un `| grep` le remplacerait par
 * celui de `grep`.
 *
 * Prérequis machine : PostgreSQL prêt, `psql` et `sha256sum` sur le PATH ;
 * sur SRV-Infra, `source ~/.grc-essais.env`.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { RACINE_BACKEND } from '../aide/serveur.mjs';

const SCRIPT = join(RACINE_BACKEND, 'deploy', 'retention.sh');

/** Entrées anciennes semées, et donc destinées à l'archive. */
const ANCIENNES = 8;
/** Entrées récentes, écrites par le chemin normal : ce sont les survivantes. */
const RECENTES = 4;

let base;
let applicatif;
let proprietaire;
let coffre;
/** Empreinte du dernier maillon archivé, relevée AVANT l'archivage. */
let empreinteHuit;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  coffre = mkdtempSync(join(tmpdir(), 'grc-retention-'));

  // Une filiale, pour que les entrées récentes puissent lui être attribuées.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', null, [], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays)
              values ($1, 'ZZRET', 'Essai rétention', 'FR')`,
        [FILIALE_A],
      );
    },
    { annuler: false },
  );

  // ── Le segment ANCIEN, écrit par le chemin que le §12 reconnaît au
  //    propriétaire, et chaîné par la fonction du produit.
  await proprietaire.query('begin');
  await proprietaire.query('alter table journal_audit disable trigger trg_journal_audit_chainage');
  await proprietaire.query(
    `do $$
     declare
         i      int;
         v_prec text := null;
         v_id   text;
         v_h    timestamptz;
         v_res  constant text := 'Entrée ancienne, semée pour éprouver la rétention.';
     begin
         for i in 1..${String(ANCIENNES)} loop
             v_id := 'JOUR-ANCIEN-' || i;
             v_h  := timestamptz '2023-03-01 09:00:00+00' + (i || ' days')::interval;
             insert into journal_audit
                 (numero, id, horodatage, filiale_id, utilisateur_id, utilisateur_libelle,
                  session_id, adresse_ip, action, entite_type, entite_id, resume,
                  valeurs_avant, valeurs_apres, version_application,
                  empreinte_precedente, empreinte)
             values
                 (i, v_id, v_h, null, null, 'archive.essai', null, null,
                  'connexion_reussie', null, null, v_res, null, null, null, v_prec,
                  encode(sha256(convert_to(f_journal_audit_charge_utile(
                      i, v_id, v_h, null, null, 'archive.essai', null, null,
                      'connexion_reussie', null, null, v_res, null, null, null, v_prec),
                      'UTF8')), 'hex'))
             returning empreinte into v_prec;
         end loop;
     end $$;`,
  );
  await proprietaire.query('select f_armer_declencheurs()');
  await proprietaire.query('commit');

  // ── Les entrées RÉCENTES, par le chemin normal : elles portent la date du
  //    jour et se chaînent à la huitième.
  await base.avecPerimetre(
    applicatif,
    perimetre('rssi.tls', FILIALE_A, [FILIALE_A]),
    async (c) => {
      for (let i = 0; i < RECENTES; i += 1) {
        await c.query(
          `insert into journal_audit (filiale_id, utilisateur_libelle, action, resume)
                values ($1, 'rssi.tls', 'export', 'Entrée récente, écrite par le chemin normal.')`,
          [FILIALE_A],
        );
      }
    },
    { annuler: false },
  );

  empreinteHuit = (
    await proprietaire.query('select empreinte from journal_audit where numero = $1', [ANCIENNES])
  ).rows[0].empreinte;
});

after(async () => {
  if (coffre !== undefined) rmSync(coffre, { recursive: true, force: true });
  await base?.fermer();
});

/** Environnement du script : il lit la base d'essai, jamais `/etc`. */
function environnement() {
  const conf = base.reglages;
  return {
    ...process.env,
    CYBER_GRC_CONFIG: join(coffre, 'sans-configuration'),
    BASE_HOTE: conf.hote,
    BASE_PORT: String(conf.port),
    BASE_NOM: base.nom,
    BASE_UTILISATEUR_PROPRIETAIRE: conf.proprietaire.nom,
    BASE_MOT_DE_PASSE_PROPRIETAIRE: conf.proprietaire.motDePasse,
  };
}

/**
 * Joue le script et rend `{ code, sortie }`.
 *
 * ⚠️ **`execFileSync` sur `bash`, jamais un tube.** Le `CLAUDE.md` le répète :
 * un code de retour mesuré à travers `| grep` est celui de `grep`, et l'échec du
 * script devient invisible.
 */
function jouer(...arguments_) {
  try {
    const sortie = execFileSync('bash', [SCRIPT, ...arguments_], {
      env: environnement(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: RACINE_BACKEND,
    });
    return { code: 0, sortie };
  } catch (erreur) {
    return {
      code: erreur.status ?? -1,
      sortie: `${erreur.stdout ?? ''}${erreur.stderr ?? ''}`,
    };
  }
}

/** Lecture directe, sous le propriétaire. */
async function lire(texte, valeurs = []) {
  return (await proprietaire.query(texte, valeurs)).rows;
}
async function scalaire(texte, valeurs = []) {
  const lignes = await lire(texte, valeurs);
  return lignes.length === 0 ? undefined : Object.values(lignes[0])[0];
}

/* =====================================================================
 *  §0 — La matière : une chaîne réelle, saine, et à cheval sur deux années
 * ===================================================================== */

describe('§0 — le journal semé est une vraie chaîne', () => {
  test('douze maillons, numérotés sans trou, dont huit antérieurs à 2024', async () => {
    assert.equal(Number(await scalaire('select count(*) from journal_audit')), ANCIENNES + RECENTES);
    assert.equal(Number(await scalaire('select min(numero) from journal_audit')), 1);
    assert.equal(Number(await scalaire('select max(numero) from journal_audit')), ANCIENNES + RECENTES);
    assert.equal(
      Number(
        await scalaire("select count(*) from journal_audit where horodatage < timestamptz '2024-01-01'"),
      ),
      ANCIENNES,
      'sans segment ancien, la rétention n’aurait rien à archiver et l’essai ne mesurerait rien',
    );
  });

  test('LA CHAÎNE SEMÉE EST VALIDE — sinon tout ce qui suit serait sans objet', async () => {
    const anomalies = await lire('select numero_entree, anomalie, detail from f_journal_audit_verifier()');
    assert.deepEqual(
      anomalies,
      [],
      'le semis a fabriqué une chaîne incohérente : le script refuserait, et à raison',
    );
  });

  test('les quatre déclencheurs du journal sont armés en « always »', async () => {
    const etats = await lire(
      `select tgname, tgenabled from pg_trigger
        where tgrelid = 'journal_audit'::regclass and not tgisinternal order by tgname`,
    );
    assert.equal(etats.length, 4);
    for (const t of etats) assert.equal(t.tgenabled, 'A', `${t.tgname} n'est pas armé « always »`);
  });
});

/* =====================================================================
 *  §1 — La simulation ne touche à rien
 * ===================================================================== */

describe('§1 — « --simuler » dit ce qu’il ferait, et ne le fait pas', () => {
  test('code 0, aucune ligne supprimée, aucun fichier écrit', async () => {
    const { code, sortie } = jouer('--annee', '2023', '--repertoire', coffre, '--simuler');
    assert.equal(code, 0, sortie);
    assert.match(sortie, /Simulation/u);
    assert.match(sortie, /journal\.ancrage_2023/u);

    assert.equal(Number(await scalaire('select count(*) from journal_audit')), ANCIENNES + RECENTES);
    assert.equal(
      Number(await scalaire("select count(*) from parametres where cle like 'journal.ancrage%'")),
      0,
    );
    assert.equal(existsSync(join(coffre, `journal-audit-2023-1-${String(ANCIENNES)}.csv`)), false);
  });
});

/* =====================================================================
 *  §2 — Les refus, AVANT toute suppression
 * ===================================================================== */

describe('§2 — ce que le script refuse de faire', () => {
  test('une année sans entrée ne fait rien, et le dit — code 0', async () => {
    const { code, sortie } = jouer('--annee', '2019', '--repertoire', coffre);
    assert.equal(code, 0, sortie);
    assert.match(sortie, /rien à archiver/u);
    assert.equal(Number(await scalaire('select count(*) from journal_audit')), ANCIENNES + RECENTES);
  });

  test('ARCHIVER TOUTE LA TABLE est REFUSÉ — la chaîne repartirait de zéro', async () => {
    // ⚠️ Le piège que ce refus ferme : `f_journal_audit_chainage()` attribue
    // `max(numero) + 1`. Sur une table vide, cela vaut **1**, avec une empreinte
    // précédente nulle — une genèse parfaitement cohérente. La chaîne serait
    // coupée de son passé SANS qu'aucune anomalie ne le dise.
    const annee = String(new Date().getUTCFullYear());
    const { code, sortie } = jouer('--annee', annee, '--repertoire', coffre);
    assert.notEqual(code, 0, `le script a accepté d’archiver toute la table :\n${sortie}`);
    assert.match(sortie, /TOUTE la table/u);
    assert.equal(
      Number(await scalaire('select count(*) from journal_audit')),
      ANCIENNES + RECENTES,
      'un refus qui supprime quand même',
    );
  });

  test('une année mal écrite est refusée avant toute connexion', () => {
    const { code, sortie } = jouer('--annee', '23');
    assert.notEqual(code, 0);
    assert.match(sortie, /quatre chiffres/u);
  });

  test('un répertoire portant une apostrophe est REFUSÉ — il finirait dans du SQL', () => {
    // ⚠️ Ce script s'exécute sous le PROPRIÉTAIRE, déclencheurs de suppression
    // désarmés. Le chemin est interpolé dans le `\copy` et dans la description de
    // l'ancrage : une apostrophe y refermerait la chaîne. C'est la surface
    // d'injection la plus dangereuse du dépôt, parce qu'elle n'est ouverte qu'au
    // seul compte qui puisse réécrire le journal d'audit.
    const { code, sortie } = jouer('--annee', '2023', '--repertoire', "/tmp/o'brien");
    assert.notEqual(code, 0, 'un chemin porteur d’apostrophe a été accepté');
    assert.match(sortie, /apostrophe/u);
  });
});

/* =====================================================================
 *  §3 — L'archivage nominal
 * ===================================================================== */

describe('§3 — exporter, ancrer, supprimer, journaliser', () => {
  let fichier;

  test('le script s’exécute et rend 0', () => {
    const { code, sortie } = jouer('--annee', '2023', '--repertoire', coffre);
    assert.equal(code, 0, sortie);
    assert.match(sortie, /rétention 2023 terminée/u);
    fichier = join(coffre, `journal-audit-2023-1-${String(ANCIENNES)}.csv`);
  });

  test('ÉTAPE 1 — l’archive existe, porte les huit entrées, et son empreinte', () => {
    assert.equal(existsSync(fichier), true, `archive absente : ${fichier}`);
    const lignes = readFileSync(fichier, 'utf8').split('\n').filter((l) => l !== '');
    assert.equal(
      lignes.length,
      ANCIENNES + 1,
      'l’archive ne porte pas l’en-tête plus les huit entrées attendues',
    );
    // Les numéros archivés sont 1..8. La colonne est retrouvée PAR SON NOM dans
    // l'en-tête : supposer sa position figerait ici l'ordre physique des colonnes
    // de `journal_audit`, que rien ne promet et qu'une migration peut changer.
    // ⚠️ `force_quote *` ne cite QUE les lignes de données : l'en-tête sort nu.
    // Les deux se lisent donc différemment, et l'avoir supposé identique a coûté
    // un rouge — ce qui est la bonne façon de l'apprendre.
    const champs = (ligne) => ligne.slice(1, -1).split('","');
    const entete = lignes[0].split(',');
    const iNumero = entete.indexOf('numero');
    assert.notEqual(iNumero, -1, `l'archive n'a pas d'en-tête « numero » : ${lignes[0].slice(0, 120)}`);
    for (let i = 1; i <= ANCIENNES; i += 1) {
      assert.equal(champs(lignes[i])[iNumero], String(i), `ligne ${String(i)} : ${lignes[i].slice(0, 60)}`);
    }

    const sidecar = `${fichier}.sha256`;
    assert.equal(existsSync(sidecar), true, 'l’empreinte de l’archive n’est pas écrite à côté');
    const attendue = execFileSync('sha256sum', [fichier], { encoding: 'utf8' }).split(' ')[0];
    assert.match(readFileSync(sidecar, 'utf8'), new RegExp(attendue, 'u'));
  });

  test('ÉTAPE 2 — l’ancrage porte l’empreinte du DERNIER maillon archivé', async () => {
    const ancrage = await scalaire(
      "select valeur from parametres where filiale_id is null and cle = 'journal.ancrage_2023'",
    );
    assert.equal(
      ancrage,
      empreinteHuit,
      'l’ancrage n’est pas l’empreinte du maillon 8 : la coupure n’est pas vérifiable',
    );
    const ligne = (
      await lire("select categorie, description, modifiable from parametres where cle = 'journal.ancrage_2023'")
    )[0];
    assert.equal(ligne.categorie, 'journal');
    assert.equal(ligne.modifiable, false);
    assert.match(ligne.description, /maillon 8/u);
    assert.match(ligne.description, /sha256 [0-9a-f]{64}/u);
  });

  test('ÉTAPE 3 — le segment a disparu, et LUI SEUL', async () => {
    assert.equal(Number(await scalaire('select count(*) from journal_audit where numero <= $1', [ANCIENNES])), 0);
    // Les récentes, plus l'entrée de purge que le script vient d'écrire.
    assert.equal(Number(await scalaire('select count(*) from journal_audit')), RECENTES + 1);
    assert.equal(Number(await scalaire('select min(numero) from journal_audit')), ANCIENNES + 1);
  });

  test('ÉTAPE 3 bis — les déclencheurs sont RÉARMÉS EN « ALWAYS », pas en « origin »', async () => {
    // ⚠️ `alter table … enable trigger` remet en « origin » : un
    // `set session_replication_role = replica` désarmerait alors la couche 3 de
    // la garantie d'ajout seul. Le script réarme par `f_armer_declencheurs()`.
    const etats = await lire(
      `select tgname, tgenabled from pg_trigger
        where tgrelid = 'journal_audit'::regclass and not tgisinternal order by tgname`,
    );
    assert.equal(etats.length, 4);
    for (const t of etats) assert.equal(t.tgenabled, 'A', `${t.tgname} est retombé en « ${t.tgenabled} »`);
    assert.deepEqual(await lire('select objet, anomalie from f_verifier_armement()'), []);
  });

  test('ÉTAPE 3 ter — l’ajout seul est REVENU : une suppression échoue en GRC01', async () => {
    // Le contrôle qui manquerait le plus : le script désarme un déclencheur, et
    // rien ne prouverait qu'il l'a remis si on ne le mordait pas.
    let code = null;
    try {
      await proprietaire.query('delete from journal_audit where numero = $1', [ANCIENNES + 1]);
    } catch (erreur) {
      code = erreur.code;
    }
    assert.equal(code, 'GRC01', 'le journal accepte une suppression : l’ajout seul n’est plus garanti');
  });

  test('ÉTAPE 4 — l’opération est journalisée, avec ses comptes', async () => {
    const entrees = await lire(
      `select filiale_id, utilisateur_libelle, entite_type, resume, valeurs_apres
         from journal_audit where action = 'purge' order by numero`,
    );
    assert.equal(entrees.length, 1, 'ni zéro, ni deux entrées pour un archivage');
    const entree = entrees[0];
    assert.equal(entree.filiale_id, null, 'l’archivage porte sur le journal du groupe entier');
    assert.equal(entree.utilisateur_libelle, 'retention_journal');
    assert.equal(entree.valeurs_apres.annee, '2023');
    assert.equal(entree.valeurs_apres.numero_debut, 1);
    assert.equal(entree.valeurs_apres.numero_fin, ANCIENNES);
    assert.equal(entree.valeurs_apres.entrees_archivees, ANCIENNES);
    assert.equal(entree.valeurs_apres.ancrage, empreinteHuit);
    assert.match(entree.valeurs_apres.archive_sha256, /^[0-9a-f]{64}$/u);
  });
});

/* =====================================================================
 *  §4 — LA COUPURE SE VÉRIFIE DES DEUX CÔTÉS
 * ===================================================================== */

describe('§4 — de part et d’autre de la coupure', () => {
  test('CÔTÉ SURVIVANT : le premier maillon déclare l’ancrage comme précédent', async () => {
    const premier = (
      await lire('select numero, empreinte_precedente from journal_audit order by numero limit 1')
    )[0];
    assert.equal(Number(premier.numero), ANCIENNES + 1);
    assert.equal(
      premier.empreinte_precedente,
      empreinteHuit,
      'le survivant ne se rattache pas à l’archive : la chaîne est coupée de son passé',
    );
  });

  test('CÔTÉ ARCHIVE : la dernière ligne du fichier porte cette même empreinte', () => {
    const fichier = join(coffre, `journal-audit-2023-1-${String(ANCIENNES)}.csv`);
    const lignes = readFileSync(fichier, 'utf8').split('\n').filter((l) => l !== '');
    const derniere = lignes[lignes.length - 1];
    assert.ok(
      derniere.includes(`"${empreinteHuit}"`),
      'l’archive ne porte pas l’empreinte ancrée : le recoupement est impossible',
    );
  });

  test('la chaîne survivante ne porte QUE « chaine_tronquee », et sur le bon maillon', async () => {
    const anomalies = await lire(
      'select numero_entree, anomalie from f_journal_audit_verifier() order by numero_entree',
    );
    assert.equal(anomalies.length, 1, `anomalies inattendues : ${JSON.stringify(anomalies)}`);
    assert.equal(anomalies[0].anomalie, 'chaine_tronquee');
    assert.equal(Number(anomalies[0].numero_entree), ANCIENNES + 1);
  });

  test('une vérification PARTIELLE, celle que le §12 prescrit, reste propre', async () => {
    const anomalies = await lire(
      'select anomalie from f_journal_audit_verifier($1) where anomalie <> $2',
      [ANCIENNES + 2, 'chaine_tronquee'],
    );
    assert.deepEqual(anomalies, []);
  });

  test('rejouer 2023 ne trouve plus rien à archiver — et ne casse rien', async () => {
    const avant = Number(await scalaire('select count(*) from journal_audit'));
    const { code, sortie } = jouer('--annee', '2023', '--repertoire', coffre);
    assert.equal(code, 0, sortie);
    assert.match(sortie, /rien à archiver/u);
    assert.equal(Number(await scalaire('select count(*) from journal_audit')), avant);
  });
});

/* =====================================================================
 *  §5 — MORSURE : on n'archive pas par-dessus une chaîne rompue
 * ===================================================================== */

describe('§5 — la chaîne se vérifie AVANT de couper', () => {
  test('MORSURE : une chaîne falsifiée fait refuser l’archivage, et rien n’est supprimé', async () => {
    // ⚠️ Ce contrôle est la raison d'être de l'ordre choisi : archiver détruit la
    // seule preuve directe que le segment était intact. Si la chaîne est déjà
    // rompue, couper la rend indémontrable pour toujours.
    //
    // La falsification emprunte le seul chemin qui existe — le propriétaire, qui
    // désarme le déclencheur —, c'est-à-dire exactement l'attaque que le §12
    // reconnaît ne pas pouvoir empêcher et que le chaînage rend DÉTECTABLE.
    const cible = Number(await scalaire('select max(numero) from journal_audit'));
    await proprietaire.query('begin');
    await proprietaire.query('alter table journal_audit disable trigger trg_journal_audit_interdit_maj');
    await proprietaire.query('update journal_audit set resume = $1 where numero = $2', [
      'Résumé réécrit après coup.',
      cible,
    ]);
    await proprietaire.query('select f_armer_declencheurs()');
    await proprietaire.query('commit');

    const accusatrices = Number(
      await scalaire(
        "select count(*) from f_journal_audit_verifier() where anomalie <> 'chaine_tronquee'",
      ),
    );
    assert.ok(accusatrices >= 1, 'la falsification n’a pas été détectée : l’essai ne mesure rien');

    const avant = Number(await scalaire('select count(*) from journal_audit'));
    const { code, sortie } = jouer('--annee', '2026', '--repertoire', coffre);
    assert.notEqual(code, 0, `le script a archivé par-dessus une chaîne rompue :\n${sortie}`);
    assert.match(sortie, /anomalie\(s\) accusatrice\(s\)/u);
    assert.equal(
      Number(await scalaire('select count(*) from journal_audit')),
      avant,
      'un refus qui supprime quand même',
    );
  });
});
