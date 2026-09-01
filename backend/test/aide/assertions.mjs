/**
 * assertions.mjs — les assertions qui ne valent qu'appariées.
 *
 * ── Deux familles d'assertions négatives, et une seule est sûre ──────────────
 *
 *  · **La famille sûre** : « la filiale voisine n'est nommée nulle part ».
 *    Casser le cloisonnement fait APPARAÎTRE la chaîne : l'assertion mord
 *    d'elle-même, elle se suffit.
 *  · **La famille piégeuse** : « le bandeau ne dit rien », « aucun défaut
 *    interne n'est annoncé ». Ce qu'on observe est le silence d'un mécanisme —
 *    et retirer le mécanisme produit le même silence.
 *
 * C'est le constat **Q-21**. Le troisième argument d'`exigerSilence` force à
 * nommer l'essai qui fait parler le même mécanisme : sans lui, un silence ne
 * prouve rien.
 *
 * ── Et une troisième forme, trouvée au septième passage (constat Q-37) ───────
 *
 * Une assertion peut être exécutée, être FAUSSE, et rester verte — parce que
 * l'étape qui aurait produit le contre-exemple n'a jamais eu lieu. Le cas réel :
 * « la sortie ne contient pas “fichier non publiable” » était vrai tant que le
 * script mourait avant d'écrire son message de succès… lequel contient
 * « aucun fichier non publiable ». L'assertion était fausse en soi ; seule la
 * mort prématurée du script la maintenait verte.
 *
 * `exigerSilenceApres` referme cette forme-là : on ne juge une absence qu'après
 * avoir PROUVÉ que l'étape observée est allée jusqu'au bout. C'est la même règle
 * qu'`exigerSilence`, appliquée non plus au mécanisme mais à son exécution.
 */

import assert from 'node:assert/strict';

/**
 * Exige qu'un avertissement ne paraisse pas — en nommant l'essai qui le fait
 * parler.
 *
 * @param {string} texte ce qu'on a lu (bandeau, console, corps de réponse)
 * @param {RegExp} avertissement le motif qui NE doit pas y figurer
 * @param {string} essaiQuiFaitParler nom de l'essai qui exige le même
 *   avertissement quand il DOIT paraître. Sans lui, ce silence ne vaut rien.
 */
export function exigerSilence(texte, avertissement, essaiQuiFaitParler) {
  assert.equal(
    avertissement.test(texte),
    false,
    `Un avertissement paraît alors que rien ne le justifie (${String(avertissement)}). ` +
      `Sa moitié symétrique — l'essai qui le fait parler — est « ${essaiQuiFaitParler} ». ` +
      `Vu : ${texte.slice(0, 300)}`,
  );
}

/**
 * Exige qu'un avertissement ne paraisse pas, APRÈS avoir prouvé que l'étape
 * observée est allée jusqu'au bout.
 *
 * @param {string} texte la sortie observée
 * @param {RegExp} avertissement le motif qui ne doit pas y figurer
 * @param {RegExp} preuveDAboutissement un motif que la sortie DOIT porter, et
 *   qui n'apparaît que si l'étape a été menée à son terme. Sans lui, l'absence
 *   du premier motif ne dit rien : il suffit que rien ne se soit produit.
 * @param {string} essaiQuiFaitParler nom de l'essai qui exige l'avertissement
 *   quand il est dû.
 */
export function exigerSilenceApres(texte, avertissement, preuveDAboutissement, essaiQuiFaitParler) {
  assert.match(
    texte,
    preuveDAboutissement,
    `L'étape observée n'est pas allée jusqu'au bout : rien ne prouve que l'avertissement ` +
      `${String(avertissement)} aurait PU paraître, et son absence ne vaut donc rien ` +
      `(constat Q-37). Sortie :\n${texte.slice(0, 800)}`,
  );
  exigerSilence(texte, avertissement, essaiQuiFaitParler);
}
