/**
 * indicateur-marche.test.mjs — **LE VERDICT ANNONCÉ EST CELUI DU TABLEAU**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe, et ce qu'il a coûté de ne pas l'avoir
 * ════════════════════════════════════════════════════════════════════════
 *
 * `docs/COMPARATIF_MARCHE.md` ouvre sur un verdict — « N ✅ · N 🟡 · N ❌ » —
 * et le `PLAN_ACHEVEMENT.md` §4 en fait **l'indicateur du chantier** : c'est
 * lui qu'on regarde pour dire où en est le produit.
 *
 * ⚠️ **Il n'était gardé par RIEN.** Le `CHANGELOG` affirme pourtant, à trois
 * reprises, que « le recompte mécanique » a attrapé des en-têtes faux — et
 * c'est vrai qu'ils ont été attrapés, mais **à la main**. Le 21/09/2026, une
 * ligne a été déplacée dans le texte sans que son VERDICT change, et l'en-tête
 * a annoncé un compte que le tableau ne portait pas. Personne n'aurait rougi.
 *
 * *Écrire la règle dans un commentaire ne suffit pas : il faut qu'une machine
 * la vérifie* (leçon du constat Q-215, appliquée ici à un document).
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Le tableau porte bien 86 fonctionnalités, et chacune a UN verdict |
 * | 2 | ⚠️ L'en-tête annonce EXACTEMENT ce que le tableau compte |
 * | 3 | Le pourcentage pondéré annoncé est celui qui se calcule |
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DOCUMENT = join(RACINE, 'docs', 'COMPARATIF_MARCHE.md');

/**
 * Les verdicts du tableau, comptés.
 *
 * ⚠️ **`✅✅` compte pour un ✅.** Le document emploie le doublement pour
 * marquer une couverture qu'il juge remarquable ; le compter comme un verdict
 * distinct ferait un quatrième symbole que l'en-tête ne connaît pas. On
 * regarde donc le PREMIER signe de la cellule.
 */
function compter(texte) {
  const compte = { '✅': 0, '🟡': 0, '❌': 0 };
  const inconnus = [];
  const motif = /^\|\s*(\d+)\s*\|[^|]*\|\s*([^|]*?)\s*\|/gmu;
  let m;
  while ((m = motif.exec(texte)) !== null) {
    const cellule = m[2].trim();
    const signe = ['✅', '🟡', '❌'].find((s) => cellule.startsWith(s));
    if (signe === undefined) inconnus.push([m[1], cellule.slice(0, 20)]);
    else compte[signe] += 1;
  }
  return { compte, inconnus };
}

describe('l’indicateur de marché dit ce que son tableau porte', () => {
  const texte = readFileSync(DOCUMENT, 'utf8');

  test('§1 — chaque fonctionnalité numérotée porte UN verdict reconnu', () => {
    const { compte, inconnus } = compter(texte);
    assert.deepEqual(
      inconnus,
      [],
      'Ces lignes du tableau ne portent aucun des trois verdicts en tête de leur cellule. ' +
        'Une ligne au verdict illisible sort du compte SANS que le total change de forme — ' +
        'c’est-à-dire qu’elle disparaît de l’indicateur en silence.',
    );
    const total = compte['✅'] + compte['🟡'] + compte['❌'];
    assert.equal(
      total,
      86,
      `Le tableau porte ${String(total)} fonctionnalités et le plan en annonce 86. Si le ` +
        'périmètre de la comparaison a bougé, c’est une décision — elle s’écrit, elle ne se ' +
        'constate pas.',
    );
  });

  test('§2 — ⚠️ l’en-tête annonce EXACTEMENT ce que le tableau compte', () => {
    const { compte } = compter(texte);
    const annonce = /\*\*Verdict global au [^*]*?:\s*(\d+)\s*✅\s*·\s*(\d+)\s*🟡\s*·\s*(\d+)\s*❌/u.exec(texte);
    assert.notEqual(
      annonce,
      null,
      'Le verdict global est introuvable en tête du document : c’est lui que le ' +
        '`PLAN_ACHEVEMENT.md` §4 désigne comme l’indicateur du chantier.',
    );
    assert.deepEqual(
      [Number(annonce[1]), Number(annonce[2]), Number(annonce[3])],
      [compte['✅'], compte['🟡'], compte['❌']],
      `L’en-tête annonce ${annonce[1]} ✅ · ${annonce[2]} 🟡 · ${annonce[3]} ❌ quand le ` +
        `tableau porte ${String(compte['✅'])} ✅ · ${String(compte['🟡'])} 🟡 · ` +
        `${String(compte['❌'])} ❌. ⚠️ Le cas qui arrive vraiment n’est pas la faute de ` +
        'frappe : c’est une ligne dont on a changé le TEXTE sans changer le verdict, ou ' +
        'l’inverse. Les deux se voient d’ici, et de nulle part ailleurs.',
    );
  });

  test('§3 — le pourcentage pondéré annoncé est celui qui se calcule', () => {
    const { compte } = compter(texte);
    const total = compte['✅'] + compte['🟡'] + compte['❌'];
    const attendu = Math.round(((compte['✅'] + compte['🟡'] / 2) / total) * 100);
    const annonce = /soit\s+\*{0,2}(\d+)\s*%\*{0,2}\s+en pondérant/u.exec(texte);
    assert.notEqual(annonce, null, 'le pourcentage pondéré est introuvable');
    assert.equal(
      Number(annonce[1]),
      attendu,
      `Le document annonce ${annonce[1]} % là où les verdicts en donnent ${String(attendu)} %. ` +
        'Un pourcentage arrondi à la main dérive d’un point à chaque livraison, et c’est ce ' +
        'chiffre-là qu’on cite en réunion.',
    );
  });
});
