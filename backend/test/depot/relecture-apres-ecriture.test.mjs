/**
 * relecture-apres-ecriture.test.mjs — **un panneau qui relit le serveur après
 * avoir écrit attend que le serveur SACHE.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Trouvé sur la recette le 16/09/2026, invisible au banc
 * ════════════════════════════════════════════════════════════════════════
 *
 * Certains panneaux tirent leur contenu du SERVEUR et non de l'instantané —
 * les dérogations (19.2) et les analyses d'impact (20.3), parce que leur **état
 * se dérive** et qu'aucune donnée de `data` ne le porte. Ils relisent donc après
 * chaque écriture, et ils ont raison de le faire.
 *
 * Mais `DataStore.addX()` **n'écrit qu'en mémoire** : la poussée vers le serveur
 * est asynchrone. Relire tout de suite interroge un serveur qui n'a encore rien
 * reçu — et **le panneau affiche « aucune analyse » juste après en avoir créé
 * une**.
 *
 * ⚠️ **Le banc navigateur ne pouvait pas le voir.** Il monte le serveur dans le
 * même processus : la poussée y aboutit dans la même milliseconde, et la course
 * n'a pas le temps de se produire. Le défaut s'est vu **à travers Apache et
 * TLS**, sur l'instance déployée. C'est la classe du constat **Q-325** prise par
 * l'autre bout : *l'essai prouve que le mécanisme fonctionne ; personne ne
 * mesure ce que l'utilisateur reçoit.*
 *
 * ── CE QUE CE CONTRÔLE FERME, ET CE QU'IL NE FERME PAS ─────────────────────
 *
 * Il ferme la **classe** : tout module qui écrit par `DataStore` *et* lit par
 * `Api` doit passer par `UI.apresEcriture()`. Il ne dit pas que l'appel est au
 * bon endroit — c'est le §6 de `test/navigateur/analyse-impact.test.mjs` qui le
 * mesure, en tenant la poussée à la main et en comptant les lectures.
 *
 * La liste des modules est **découverte**, jamais récitée : un panneau neuf qui
 * mêlerait les deux couches entre ici tout seul, et rougit s'il a oublié.
 *
 * ── ⚠️ LA DISPENSE EST ÉCRITE À LA MAIN, ET C'EST LE BON CAS ───────────────
 *
 * `CLAUDE.md` §3 : une liste est le bon outil quand son incomplétude fait
 * **échouer bruyamment** et qu'un humain doit trancher. C'est ici le cas — un
 * module découvert et non dispensé fait rougir, et le geste attendu est de
 * regarder si sa lecture suit vraiment une écriture. Elle se **fige aux deux
 * bouts** : une dispense qui ne correspond à aucun module découvert rougit
 * aussi, faute de quoi elle survivrait au module qu'elle excusait.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_FRONTEND } from '../aide/serveur.mjs';

const MODULES = join(RACINE_FRONTEND, 'js', 'modules');

/** Les sources du répertoire des modules, lues une fois. */
function sources() {
  return readdirSync(MODULES)
    .filter((nom) => nom.endsWith('.js'))
    .map((nom) => ({ nom, texte: readFileSync(join(MODULES, nom), 'utf8') }));
}

/**
 * Les modules dispensés, **avec leur motif**.
 *
 * ⚠️ Un module ne figure ici que parce qu'un humain a regardé : « il lit le
 * serveur » et « il relit le serveur APRÈS avoir écrit » ne sont pas la même
 * chose, et aucune lecture de texte ne les distingue. Ce qui est mécanisé est la
 * DÉCOUVERTE ; ce qui est écrit est la décision.
 */
const DISPENSES = Object.freeze({
  'rgpd.js':
    'sa seule lecture réseau — Api.registreProduit() — vit dans un AUTRE écran, l’onglet ' +
    '« L’outil lui-même », chargé à la demande sur un bouton. Elle ne suit aucune écriture, ' +
    'et rien de ce qu’elle rend ne dépend de ce que l’utilisateur vient de saisir. ' +
    '⚠️ L’encart d’analyse d’impact de la fiche traitement, LUI, relit après écriture — et ' +
    'il est dans « aipd.js », qui passe bien par UI.apresEcriture().',
});

/**
 * Le module écrit-il par `DataStore` **et** interroge-t-il le réseau par `Api` ?
 *
 * ⚠️ **`Api.` APPELÉ, jamais `Api.` lu.** `preuves.js` référence
 * `Api.CONTRAT_AUTH.niveaux` — une CONSTANTE, qui n'émet rien. Le discriminant
 * n'est pas le nom, c'est la forme : une parenthèse derrière le membre. Sans
 * cette nuance, le contrôle réclamerait une attente à un module qui n'attend
 * rien, et la première réponse serait de l'ajouter à la liste des dispenses —
 * c'est-à-dire d'user la liste jusqu'à ce qu'elle ne dise plus rien.
 */
function ecritEtLit(texte) {
  const code = sansCommentaires(texte);
  return (
    /DataStore\.(add|update|delete)[A-Za-z]+\s*\(/u.test(code) && /\bApi\.[a-zA-Z_]+\s*\(/u.test(code)
  );
}

/**
 * Le texte débarrassé de ses commentaires de bloc.
 *
 * ⚠️ Sans cela, l'entête de ce fichier-ci suffirait à faire passer un module
 * pour conforme : les commentaires de ce dépôt NOMMENT abondamment les fonctions
 * dont ils parlent. Un garde qui lit un commentaire ne mesure pas le code.
 */
function sansCommentaires(texte) {
  return texte.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

describe('Un panneau qui écrit PUIS relit le serveur attend que le serveur sache', () => {
  test('LA MATIÈRE : des modules mêlent bien les deux couches', () => {
    // Sans cette moitié, « tous les modules concernés sont conformes » serait
    // vrai d'une découverte qui ne trouve personne — et l'essai passerait au vert
    // le jour où le répertoire change de nom (motif Q-210).
    const concernes = sources().filter(({ texte }) => {
      return ecritEtLit(texte);
    });
    assert.ok(
      concernes.length >= 2,
      `Seulement ${String(concernes.length)} module(s) découvert(s) : la découverte ne reconnaît ` +
        'plus le produit, et ce contrôle cesserait de mesurer quoi que ce soit.',
    );
  });

  test('CHACUN passe par UI.apresEcriture()', () => {
    const decouverts = sources().filter(({ texte }) => ecritEtLit(texte));
    const fautifs = decouverts
      .filter(({ nom }) => DISPENSES[nom] === undefined)
      .filter(({ texte }) => !/UI\.apresEcriture\s*\(/u.test(sansCommentaires(texte)))
      .map(({ nom }) => nom);

    // ── LA DISPENSE SE FIGE AUX DEUX BOUTS ────────────────────────────────
    // Une dispense qui ne correspond à aucun module découvert a survécu à ce
    // qu'elle excusait : elle excuserait alors le prochain module du même nom,
    // sans que personne ait rien décidé.
    const fantomes = Object.keys(DISPENSES).filter(
      (nom) => !decouverts.some((m) => m.nom === nom),
    );
    assert.deepEqual(
      fantomes,
      [],
      'Ces dispenses ne correspondent à aucun module qui mêle les deux couches : elles ont ' +
        'survécu à ce qu’elles excusaient, et elles excuseraient le prochain sans qu’on ait ' +
        `rien décidé.\n  Fantômes : ${fantomes.join(' · ')}`,
    );

    assert.deepEqual(
      fautifs,
      [],
      'Ces modules écrivent par « DataStore » et lisent par « Api » sans passer par ' +
        '« UI.apresEcriture() ». Ils relisent donc un serveur qui n’a peut-être pas encore ' +
        'reçu l’écriture, et affichent « aucune ligne » juste après en avoir créé une. ' +
        '⚠️ Le banc navigateur ne peut PAS le voir — il monte le serveur dans le même ' +
        'processus, où la poussée aboutit dans la même milliseconde. Le défaut s’est vu à ' +
        'travers Apache et TLS, sur l’instance déployée.\n' +
        `  Fautifs : ${fautifs.join(' · ')}`,
    );
  });

  test('LA FONCTION EXISTE, et elle attend vraiment la poussée', () => {
    // Un garde qui exigerait un NOM sans vérifier ce que ce nom fait serait
    // satisfait par une fonction vide (`CONVENTIONS.md` §39). On lit donc le
    // corps de celle-ci, et l'on exige qu'il nomme la poussée de `sync.js`.
    const ui = readFileSync(join(RACINE_FRONTEND, 'js', 'core', 'ui.js'), 'utf8');
    const corps = /function apresEcriture\s*\([\s\S]*?\n {4}\}/u.exec(sansCommentaires(ui));
    assert.notEqual(corps, null, 'UI.apresEcriture() a disparu de js/core/ui.js.');
    assert.match(
      corps[0],
      /Sync\.pousser\s*\(/u,
      'UI.apresEcriture() n’attend plus la poussée de sync.js : elle ne retarde plus rien, et ' +
        'les panneaux qui l’appellent relisent un serveur qui n’a rien reçu.',
    );
    assert.match(
      corps[0],
      /\.then\s*\(/u,
      'UI.apresEcriture() n’enchaîne plus : le rappel partirait sans attendre.',
    );
  });
});
