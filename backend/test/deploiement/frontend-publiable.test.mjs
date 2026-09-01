/**
 * frontend-publiable.test.mjs — ce qui a le droit d'être servi sans mot de passe.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Constat **Q-31** : `cyber-gouvernance_V4/` — la racine web, servie par Apache
 * avec `Require all granted` — a contenu **quatre classeurs de données réelles**
 * (registre de risques, plan de continuité, exigences client, et un fichier de
 * verrou Excel nommant une personne). Ils étaient téléchargeables par une URL
 * devinable, **sans aucune authentification**, dans un produit dont la promesse
 * centrale est le cloisonnement par filiale.
 *
 * Le remède est double : `deploy/install.sh` refuse de copier ce qui n'est pas
 * publiable, et le vhost refuse de servir ce qui n'est pas sur sa liste
 * blanche. Constat **Q-35** : **aucun essai du dépôt ne joue `install.sh`**, et
 * l'auteur du correctif l'a démontré par huit mutations que le banc laissait
 * passer — dont la régression de Q-31 elle-même.
 *
 * Ce fichier tient le niveau qui porte l'essentiel du risque et ne dépend de
 * rien : ni Apache, ni rsync, ni root. Il lit les **fichiers versionnés** et ne
 * recopie aucune de leurs valeurs — une troisième liste serait la divergence
 * suivante.
 *
 * ⚠️ Le premier essai est le seul qui morde le jour où quelqu'un redépose un
 * classeur, **que `install.sh` soit joué ou non**. C'est celui-là qui compte.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_BACKEND, RACINE_FRONTEND } from '../aide/serveur.mjs';

const INSTALL = join(RACINE_BACKEND, 'deploy', 'install.sh');
const VHOST = join(RACINE_BACKEND, 'deploy', 'apache', 'cyber-grc.conf');

/**
 * Lit un tableau Bash de `install.sh` — `NOM=(a b c)` — sans le recopier.
 *
 * On lit la source de vérité plutôt qu'une liste d'essai : le jour où quelqu'un
 * ajoute un type publiable, cet essai le suit au lieu de rougir à tort, et le
 * jour où il en retire un, l'essai suit aussi. Ce qui doit rougir, c'est la
 * DIVERGENCE entre les deux barrières, et c'est le troisième essai qui la tient.
 */
function tableauBash(nom) {
  const source = readFileSync(INSTALL, 'utf8');
  const trouve = new RegExp(`^\\s*${nom}=\\(([^)]*)\\)`, 'm').exec(source);
  assert.notEqual(
    trouve,
    null,
    `« ${nom} » a disparu de deploy/install.sh, ou a changé de forme : cet essai ne peut ` +
      'plus lire la règle qu’il éprouve, et ne doit surtout pas en inventer une.',
  );
  const valeurs = trouve[1].split(/\s+/).filter(Boolean);
  assert.ok(valeurs.length > 0, `« ${nom} » est vide dans deploy/install.sh.`);
  return valeurs;
}

/** Tous les fichiers de la racine web versionnée, chemins relatifs. */
function fichiersDuFrontend(racine = RACINE_FRONTEND, resultat = []) {
  for (const entree of readdirSync(racine, { withFileTypes: true })) {
    const chemin = join(racine, entree.name);
    if (entree.isDirectory()) fichiersDuFrontend(chemin, resultat);
    else if (statSync(chemin).isFile()) resultat.push(relative(RACINE_FRONTEND, chemin));
  }
  return resultat;
}

describe('Aucun fichier non publiable dans la racine web (constat Q-31)', () => {
  test('LE RÉGRESSEUR : le dépôt ne porte que ce qu’Apache a le droit de servir', async () => {
    // ── Ce que cet essai empêche de revenir ─────────────────────────────────
    //
    // Il ne vérifie pas `install.sh` : il vérifie le DÉPÔT. C'est délibéré, et
    // c'est ce qui le rend utile — le jour où quelqu'un recommite un classeur,
    // il rougit, que l'installation ait été jouée ou non. Sans lui, le fichier
    // dort dans le dépôt jusqu'au prochain déploiement, et l'exposition repart.
    const publiables = tableauBash('FRONTEND_PUBLIABLE').map((e) => e.toLowerCase());
    const toleres = tableauBash('FRONTEND_TOLERE').map((e) => e.toLowerCase());
    const admis = new Set([...publiables, ...toleres]);

    const intrus = [];
    for (const relatif of fichiersDuFrontend()) {
      const base = relatif.split('/').pop();
      // Fichiers cachés : plomberie de dépôt, jamais du produit livré — le
      // vhost les refuse déjà par son motif « ^\. ». Même tolérance qu'`install.sh`.
      if (base.startsWith('.')) continue;
      const point = base.lastIndexOf('.');
      const extension = point <= 0 ? '' : base.slice(point + 1).toLowerCase();
      if (!admis.has(extension)) intrus.push(relatif);
    }

    // Le message NOMME les fichiers : le jour où il rougira, ce sera devant
    // quelqu'un qui ne saura pas ce qu'est Q-31.
    assert.deepEqual(
      intrus,
      [],
      `Ces fichiers sont dans « cyber-gouvernance_V4/ », c'est-à-dire dans la racine web ` +
        `qu'Apache sert SANS authentification :\n` +
        intrus.map((f) => `    · cyber-gouvernance_V4/${f}`).join('\n') +
        '\n\n  Quatre classeurs de données réelles y ont déjà séjourné — registre de risques, ' +
        'plan de continuité, exigences client, et un verrou Excel nommant une personne ; ' +
        'ils étaient téléchargeables par une URL devinable (constat Q-31). Retirez-les : ' +
        'les jeux d’essai vivent hors du dépôt. Si le type est légitimement servable, ' +
        'ajoutez-le à FRONTEND_PUBLIABLE dans deploy/install.sh ET au <FilesMatch> de ' +
        'deploy/apache/cyber-grc.conf — les deux barrières vont par paire.',
    );

    // Contrôle de morsure du balayage : il doit VOIR les fichiers du frontend.
    // Un parcours qui ne trouverait rien rendrait cet essai vert pour toujours.
    const tous = fichiersDuFrontend();
    assert.ok(tous.length >= 50, `Balayage suspect : ${String(tous.length)} fichier(s) trouvé(s).`);
    assert.ok(tous.includes('index.html'), 'Le balayage doit voir la page elle-même.');
  });
});

describe('Le motif du vhost refuse tout ce qui n’est pas publiable (constat Q-31)', () => {
  /**
   * Le motif `<FilesMatch>` de la liste blanche, extrait du fichier LIVRÉ.
   *
   * Jamais recopié : c'est ce qui refuse réellement en production qu'on éprouve.
   * Le `(?i)` d'Apache est un drapeau en ligne que JavaScript ne connaît pas —
   * on le retire et on pose le drapeau `i`, ce qui est la même chose.
   */
  function motifDuVhost() {
    const source = readFileSync(VHOST, 'utf8');
    const trouve = /<FilesMatch\s+"\(\?i\)(\^\(\?!.*?)"\s*>/.exec(source);
    assert.notEqual(
      trouve,
      null,
      'Le <FilesMatch> en liste blanche a disparu du vhost, ou a changé de forme. La ' +
        'barrière du frontal n’est plus vérifiable ici — et « Require all denied » par ' +
        'défaut avec elle (constat Q-31).',
    );
    return new RegExp(trouve[1], 'i');
  }

  /** Apache refuse quand le motif CORRESPOND (`Require all denied`). */
  function refuse(motif, nom) {
    return motif.test(nom);
  }

  test('LES QUATRE NOMS DU CONSTAT, et douze contournements, sont refusés', async () => {
    const motif = motifDuVhost();

    const refusesAttendus = [
      // Les quatre classeurs qui ont réellement séjourné dans la racine web.
      'Registre_des_risques.xlsx',
      'Plan_de_continuite.xlsx',
      'Exigences_client.xlsx',
      '~$Registre_des_risques.xlsx',
      // Douze contournements : double extension, extension ajoutée, sauvegarde
      // d'éditeur, casse mêlée, absence d'extension. Chacun a déjà servi, dans
      // un produit ou un autre, à faire passer un fichier sous une règle écrite
      // pour le type « final ».
      'archive.xlsx.js.xlsx',
      'x.js.pdf',
      'app.js.bak',
      'index.html.orig',
      'notes.md',
      'sauvegarde.sql',
      'config.env',
      'export.CSV',
      'donnees.json',
      'rapport.PDF',
      'script.sh',
      'LISEZMOI',
    ];

    const servisAtort = refusesAttendus.filter((nom) => !refuse(motif, nom));
    assert.deepEqual(
      servisAtort,
      [],
      'Ces noms seraient SERVIS par le frontal, sans authentification :\n' +
        servisAtort.map((n) => `    · ${n}`).join('\n'),
    );
  });

  test('CONTRÔLE SYMÉTRIQUE : treize noms légitimes restent servables, casse comprise', async () => {
    // ── La moitié sans laquelle les trois autres essais ne prouvent rien ────
    //
    // Un motif qui refuse TOUT passe les essais de refus et livre une page
    // blanche : l'application serait muette, et la cause introuvable. `LOGO.PNG`
    // est là pour la casse — le `(?i)` d'Apache est ce qui la rend servable, et
    // c'est exactement le genre de détail qu'une réécriture perd.
    const motif = motifDuVhost();
    const servables = [
      'index.html',
      'app.js',
      'style.css',
      'tokens.css',
      'logo-dedienne.png',
      'LOGO.PNG',
      'favicon.ico',
      'icone.svg',
      'photo.jpg',
      'photo.jpeg',
      'anime.gif',
      'image.webp',
      'police.woff2',
    ];

    const refusesAtort = servables.filter((nom) => refuse(motif, nom));
    assert.deepEqual(
      refusesAtort,
      [],
      'Ces noms sont légitimes et le frontal les refuserait : la page serait livrée ' +
        'incomplète, et le défaut ne se verrait qu’à l’usage.\n' +
        refusesAtort.map((n) => `    · ${n}`).join('\n'),
    );
  });

  test('LES 64 FICHIERS RÉELLEMENT PUBLIÉS passent le motif du vhost', async () => {
    // Le contrôle de bout en bout : ce que `install.sh` copierait doit être ce
    // que le frontal accepte de servir. Les deux barrières se rencontrent ici.
    const motif = motifDuVhost();
    const publiables = new Set(tableauBash('FRONTEND_PUBLIABLE').map((e) => e.toLowerCase()));

    const aPublier = fichiersDuFrontend().filter((relatif) => {
      const base = relatif.split('/').pop();
      if (base.startsWith('.')) return false;
      const point = base.lastIndexOf('.');
      return point > 0 && publiables.has(base.slice(point + 1).toLowerCase());
    });

    assert.ok(aPublier.length >= 60, `Balayage suspect : ${String(aPublier.length)} fichier(s).`);
    const refuses = aPublier.filter((relatif) => refuse(motif, relatif.split('/').pop()));
    assert.deepEqual(
      refuses,
      [],
      'Ces fichiers seraient copiés par install.sh et refusés par Apache — page cassée :\n' +
        refuses.map((f) => `    · ${f}`).join('\n'),
    );
  });
});

describe('Les deux listes blanches disent la même chose (constat Q-31)', () => {
  test('celle d’install.sh et celle du vhost sont ÉGALES, et lues dans les deux fichiers', async () => {
    // ── Aucune valeur recopiée dans un troisième endroit ────────────────────
    //
    // C'est le point de méthode : deux listes qui doivent rester égales
    // divergent, et la divergence est silencieuse — un type ajouté d'un seul
    // côté est soit copié puis refusé (page cassée), soit servable mais jamais
    // livré (personne ne le remarque). Un essai qui porterait sa propre copie
    // de la liste serait la troisième source, donc la divergence suivante.
    const cote = tableauBash('FRONTEND_PUBLIABLE').map((e) => e.toLowerCase());

    const vhost = readFileSync(VHOST, 'utf8');
    const trouve = /<FilesMatch\s+"\(\?i\)\^\(\?!\.\*\\\.\(([^)]*)\)\$\)"\s*>/.exec(vhost);
    assert.notEqual(
      trouve,
      null,
      'La liste blanche du vhost n’est plus lisible dans son <FilesMatch> : la paire de ' +
        'barrières n’est plus vérifiable.',
    );
    const cotéVhost = trouve[1].split('|').map((e) => e.toLowerCase());

    assert.deepEqual(
      cotéVhost,
      cote,
      'Les deux listes blanches du frontend ont divergé (constat Q-31) :\n' +
        `    install.sh : ${cote.join(' ')}\n` +
        `    vhost      : ${cotéVhost.join(' ')}\n` +
        '  Ce qui est copié et ce qui est servi ne coïncident plus.',
    );

    // Contrôle de morsure : les deux lectures doivent VOIR quelque chose de
    // substantiel, sinon l'égalité serait celle de deux listes vides.
    assert.ok(cote.length >= 10, `Liste d’install.sh suspecte : ${cote.join(' ')}`);
    assert.ok(cote.includes('html') && cote.includes('js') && cote.includes('css'));
  });
});
