/**
 * sauvegarde-migration.test.mjs — **le cliché qui précède toute migration.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Constat **Q-224**
 * ════════════════════════════════════════════════════════════════════════
 *
 * `install.sh` créait `/var/backups/cyber-grc` et **n'y écrivait jamais rien**.
 * Un répertoire de sauvegarde vide est pire qu'absent : il donne à croire qu'il
 * y en a une. Or les migrations vont dans un seul sens — leurs blocs
 * « ANNULATION » sont des **commentaires**, que rien n'exécute et que personne
 * ne garantit. Le seul retour arrière réel est la restauration d'un cliché.
 *
 * ── Les deux branches, et pourquoi il faut les deux ──────────────────────
 *
 * Vérifier que le cliché **n'est pas pris** quand il n'y a rien à migrer est
 * facile, et c'est ce que la machine montre après un `--maj` ordinaire. Mais un
 * essai qui ne joue que cette branche est vert **exactement comme** un essai qui
 * jouerait un bloc mort : c'est le motif que ce chantier traque depuis le début.
 *
 * On joue donc les deux, en doublant `migrate.mjs` et `pg_dump` — le bloc est
 * extrait du vrai `install.sh` par ses ancres, jamais recopié.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { extraireBloc } from '../aide/install.mjs';

let atelier;
before(() => {
  atelier = mkdtempSync(join(tmpdir(), 'grc-cliche-'));
});
after(() => {
  if (atelier !== undefined) rmSync(atelier, { recursive: true, force: true });
});

/**
 * Joue le bloc de sauvegarde avec `migrate.mjs` et `pg_dump` doublés.
 *
 * @param {{enAttente: boolean, dumpEchoue?: boolean, anciens?: number}} cas
 */
function jouerSauvegarde({ enAttente, dumpEchoue = false, anciens = 0 }) {
  const racine = mkdtempSync(join(atelier, 'cas-'));
  const sauvegardes = join(racine, 'backups');
  const journal = join(racine, 'appels.txt');
  execFileSync('mkdir', ['-p', sauvegardes]);
  // Des clichés déjà là, pour éprouver la rétention.
  for (let i = 0; i < anciens; i += 1) {
    writeFileSync(join(sauvegardes, `avant-migration-2026010${String(i)}T000000Z.sql.gz`), 'x');
  }

  const script = `
set -uo pipefail
JOURNAL='${journal}'; : > "$JOURNAL"
info()   { printf 'INFO %s\\n'   "$*" >> "$JOURNAL"; }
succes() { printf 'OK %s\\n'     "$*" >> "$JOURNAL"; }
alerte() { printf 'ALERTE %s\\n' "$*" >> "$JOURNAL"; }
echec()  { printf 'ECHEC %s\\n'  "$*" >> "$JOURNAL"; exit 1; }
lire_variable() { printf 'secret'; }

# ── Les doublures ─────────────────────────────────────────────────────────
node() { printf 'migrate --verifier\\n' >> "$JOURNAL"; return ${enAttente ? 10 : 0}; }
pg_dump() { printf 'pg_dump\\n' >> "$JOURNAL"; ${dumpEchoue ? 'return 1' : "printf 'CLICHÉ'"}; }
du() { printf '12K\\tx\\n'; }

SAUVEGARDES='${sauvegardes}'
SEULEMENT_BASE=0
RACINE_MIGRATIONS='/inexistant'
BASE_HOTE=h; BASE_PORT=5432; BASE_NOM=cyber_grc
ROLE_APP=grc_app; ROLE_PROPRIETAIRE=grc_proprietaire

${extraireBloc('sauvegarde')}
`;
  const chemin = join(racine, 'jouer.sh');
  writeFileSync(chemin, script);
  let code = 0;
  try {
    execFileSync('bash', [chemin], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (erreur) {
    code = erreur.status ?? 1;
  }
  return {
    code,
    lignes: readFileSync(journal, 'utf8').split('\n').filter(Boolean),
    cliches: readdirSync(sauvegardes).filter((f) => f.startsWith('avant-migration-')),
  };
}

describe('Q-224 — le cliché précède la migration, et seulement quand il le faut', () => {
  test('AUCUNE migration en attente : PAS de cliché — sinon le répertoire devient un bruit', () => {
    const { code, lignes, cliches } = jouerSauvegarde({ enAttente: false });
    assert.equal(code, 0);
    assert.equal(
      lignes.filter((l) => l === 'pg_dump').length,
      0,
      'Un cliché à chaque `--maj` — y compris les dizaines qui ne changent que du code — ' +
        'ferait du répertoire une collection qu’on purge sans regarder.',
    );
    assert.deepEqual(cliches, []);
  });

  test('DES migrations en attente : le cliché est pris, et il porte des octets', () => {
    // ⚠️ La branche que le `--maj` ordinaire ne montre jamais. Sans elle, cet
    //    essai serait vert sur un bloc entièrement mort.
    const { code, lignes, cliches } = jouerSauvegarde({ enAttente: true });
    assert.equal(code, 0, lignes.join('\n'));
    assert.ok(lignes.includes('pg_dump'), '`pg_dump` doit être appelé');
    assert.equal(cliches.length, 1, `clichés obtenus : ${JSON.stringify(cliches)}`);
    assert.match(cliches[0], /^avant-migration-\d{8}T\d{6}Z\.sql\.gz$/u, 'nommé et horodaté');
  });

  test('UN ÉCHEC DU CLICHÉ ARRÊTE L’INSTALLATION — c’est tout le propos', () => {
    /* Migrer sans retour possible est exactement ce que ce bloc existe pour
       empêcher. Continuer « puisque la migration, elle, marchera » serait
       reconduire le défaut sous une autre forme. */
    const { code, lignes, cliches } = jouerSauvegarde({ enAttente: true, dumpEchoue: true });
    assert.equal(code, 1, 'l’installation doit s’arrêter');
    // Le message tient sur plusieurs lignes : on le recompose avant de le lire.
    const messageEchec = lignes.slice(lignes.findIndex((l) => l.startsWith('ECHEC'))).join(' ');
    assert.match(
      messageEchec,
      /ANNULATION|retour arrière|sans cliché/u,
      `Le refus doit dire POURQUOI. Journal : ${lignes.join(' | ')}`,
    );
    assert.deepEqual(cliches, [], 'et le fichier tronqué ne doit pas rester');
  });

  test('LA RÉTENTION garde les cinq derniers, et pas davantage', () => {
    const { cliches } = jouerSauvegarde({ enAttente: true, anciens: 8 });
    assert.equal(
      cliches.length,
      5,
      `${String(cliches.length)} clichés conservés. Trop peu, on perd le retour arrière ; ` +
        'trop, un disque plein devient le prochain incident.',
    );
  });
});
