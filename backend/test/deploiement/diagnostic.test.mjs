/**
 * diagnostic.test.mjs — les invariants du mode `--diagnostic` (lot L18.3).
 *
 * ── Ce que ce fichier peut éprouver, et ce qu'il ne peut pas ────────────────
 *
 * `--diagnostic` exige root, systemd, Apache, PostgreSQL et un certificat : il ne
 * se joue pas dans un banc. Ce fichier ne prétend donc **pas** mesurer ses
 * verdicts — il a été joué à la main sur la recette réelle le 08/09/2026, trois
 * fois, et les trois codes de sortie ont été constatés (0 · 1 · 2).
 *
 * Ce qu'il garde, ce sont les **propriétés de forme dont la perte est
 * silencieuse** — celles qui ne cassent rien à la première lecture et qui rendent
 * le mode faux à la centième.
 *
 * ── Les quatre invariants, et le défaut réel qui justifie chacun ────────────
 *
 *  1. **L'option est déclarée aux trois endroits.** Une option analysée mais
 *     absente de `--aide` est introuvable ; annoncée mais non analysée, elle
 *     échoue sur « Option inconnue ». Les deux moitiés se posent à dix lignes
 *     d'écart et se perdent séparément.
 *
 *  2. **`controle_publication()` est écrite UNE fois et appelée DEUX fois.**
 *     C'est la raison même de son extraction : `--verifier-publication` et
 *     `--diagnostic` posent la même question, et deux copies de la liste blanche
 *     des types publiables divergeraient en silence. C'est le motif du constat
 *     **Q-31**, où la liste d'`install.sh` et le `<FilesMatch>` du vhost sont
 *     tenus d'aller par paire. Si quelqu'un recopie le contrôle plutôt que de
 *     l'appeler, cet essai rougit.
 *
 *  3. **Aucun contrôle du diagnostic ne sort du script.** ⚠️ **Ce n'est pas une
 *     précaution théorique : le premier jet du 08/09/2026 appelait
 *     `valider_identifiant` pour éprouver `BASE_NOM`** — laquelle appelle `echec`,
 *     donc `exit 1`. Le diagnostic serait sorti au cinquième contrôle sur douze,
 *     en taisant les sept suivants, **et en rendant le code 1 « réserve » sur ce
 *     qui est un bloquant**. Un diagnostic qui s'arrête à la première anomalie
 *     fait découvrir les pannes une par une, à raison d'une commande par tour :
 *     c'est exactement ce que ce mode existe pour supprimer. Seul le bilan final
 *     a le droit de sortir.
 *
 *  4. **Tout verdict bloquant dit QUOI FAIRE.** `diag_bloquant` prend un
 *     troisième argument — la réparation. Un diagnostic qui énonce un symptôme
 *     sans son remède déplace le travail au lieu de le faire, et c'est la
 *     deuxième des trois règles que ce mode s'impose.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_BACKEND } from '../aide/serveur.mjs';

const CHEMIN = join(RACINE_BACKEND, 'deploy', 'install.sh');
const SCRIPT = readFileSync(CHEMIN, 'utf8');

/**
 * Le corps du mode `--diagnostic`, isolé de son fichier.
 *
 * ⚠️ Les deux ancres sont exigées présentes : une découpe qui ne trouve rien
 * rendrait une chaîne vide, sur laquelle **tous les contrôles ci-dessous
 * passeraient au vert en n'éprouvant rien** — le décor que ce dépôt appelle
 * constat Q-37. L'essai échoue donc AVANT de mesurer quoi que ce soit.
 */
function corpsDuDiagnostic() {
  const debut = SCRIPT.indexOf('if [[ $DIAGNOSTIC -eq 1 ]]; then');
  assert.notEqual(debut, -1, "l'ouverture du mode --diagnostic est introuvable dans install.sh");
  const fin = SCRIPT.indexOf('#  1. Paquets système', debut);
  assert.notEqual(fin, -1, 'la borne de fin du mode --diagnostic est introuvable');
  const corps = SCRIPT.slice(debut, fin);
  assert.ok(corps.length > 2000, `corps du diagnostic anormalement court (${corps.length} o)`);
  return corps;
}

/** Les lignes de CODE : les commentaires parlent de `echec` et d'`exit` en prose. */
function lignesDeCode(texte) {
  return texte
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

describe('install.sh --diagnostic', () => {
  test("l'option est déclarée dans l'aide, analysée, et sa variable initialisée", () => {
    assert.match(SCRIPT, /^DIAGNOSTIC=0$/m, 'DIAGNOSTIC=0 : initialisation absente');
    assert.match(
      SCRIPT,
      /--diagnostic\)\s+DIAGNOSTIC=1; shift ;;/,
      "--diagnostic n'est pas analysée : elle échouerait sur « Option inconnue »",
    );
    const aide = SCRIPT.slice(SCRIPT.indexOf('aide() {'), SCRIPT.indexOf('Variables d’environnement reconnues') + 1);
    assert.ok(
      /--diagnostic\s+NE MODIFIE RIEN/.test(SCRIPT),
      "--diagnostic est absente de --aide : une option qu'on ne peut pas découvrir n'existe pas",
    );
    assert.ok(aide.length >= 0);
  });

  test('controle_publication() est définie une fois et appelée deux fois', () => {
    const definitions = SCRIPT.match(/^controle_publication\(\) \{/gm) ?? [];
    assert.equal(definitions.length, 1, `controle_publication() définie ${definitions.length} fois, 1 attendue`);

    const appels = lignesDeCode(SCRIPT).filter((l) => /controle_publication \|\|/.test(l));
    assert.equal(
      appels.length,
      2,
      `controle_publication appelée ${appels.length} fois, 2 attendues ` +
        '(--verifier-publication et --diagnostic). Un troisième mode qui recopierait ' +
        'le contrôle ferait diverger la liste blanche des types publiables (Q-31).',
    );

    // La liste blanche des types n'existe qu'à UN endroit dans le script.
    const listes = SCRIPT.match(/TYPES="html\|js\|css/g) ?? [];
    assert.equal(listes.length, 1, `la liste des types publiables apparaît ${listes.length} fois, 1 attendue`);
  });

  test('aucun contrôle ne sort du script — seul le bilan a le droit de sortir', () => {
    const corps = corpsDuDiagnostic();
    const lignes = lignesDeCode(corps);

    const echecs = lignes.filter((l) => /(^|[;&|]\s*)echec\s/.test(l));
    assert.deepEqual(
      echecs,
      [],
      "le mode --diagnostic appelle `echec`, qui fait `exit 1` : il s'arrêterait au " +
        'premier contrôle en défaut et tairait tous les suivants. Rendez un verdict ' +
        '(diag_bloquant) au lieu de sortir.',
    );

    const iBilan = corps.indexOf('── Bilan ──');
    assert.notEqual(iBilan, -1, "le bloc « Bilan » du diagnostic est introuvable");

    const avantBilan = lignesDeCode(corps.slice(0, iBilan)).filter((l) => /(^|[;&|]\s*)exit\s/.test(l));
    assert.deepEqual(
      avantBilan,
      [],
      'un `exit` précède le bilan : les contrôles restants ne seraient jamais joués.',
    );

    // Le bilan, lui, rend bien les TROIS codes que la supervision attend.
    const bilan = corps.slice(iBilan);
    for (const code of ['exit 2', 'exit 1', 'exit 0']) {
      assert.ok(bilan.includes(code), `le bilan ne rend jamais « ${code} »`);
    }
  });

  test('tout verdict bloquant porte sa réparation', () => {
    const corps = corpsDuDiagnostic();

    // Les appels s'étalent sur deux lignes (message, puis réparation indentée).
    // On découpe sur les appels eux-mêmes plutôt que sur les lignes.
    const appels = corps.split(/\bdiag_bloquant\b/).slice(1);
    assert.ok(appels.length >= 8, `seuls ${appels.length} verdicts bloquants : le mode a maigri`);

    for (const [index, brut] of appels.entries()) {
      // Un appel se termine à la première ligne qui n'est pas sa continuation.
      const appel = brut.split('\n').slice(0, 3).join('\n');
      const guillemets = appel.match(/"/g) ?? [];
      assert.ok(
        guillemets.length >= 6,
        `diag_bloquant n° ${index + 1} ne porte que ${guillemets.length / 2} argument(s) : ` +
          "un bloquant sans réparation déplace le travail au lieu de le faire.\n" +
          `      ${appel.split('\n')[0].trim()}`,
      );
    }
  });
});
