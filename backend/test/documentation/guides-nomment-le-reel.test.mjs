/**
 * guides-nomment-le-reel.test.mjs — **un guide ne nomme que des écrans qui existent**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi cette famille existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * La porte S7 a rendu quatre constats BLOQUANTS sur les guides, et deux tenaient
 * dans la même phrase : **le document envoie l'exploitant vers un écran qui
 * n'existe pas** (Q-265, Q-266). Le banc était vert, parce qu'aucun contrôle ne
 * confrontait la PROSE au produit — il ne sait vérifier que des chiffres.
 *
 * ⚠️ **Et la faute a été refaite le 16/09/2026, par moi, en une journée.** La
 * passe d'architecture a déplacé quatre entrées de menu vers des onglets ; trois
 * phrases du `GUIDE_UTILISATEUR.md` continuaient d'envoyer le lecteur vers
 * « Socle de risques », « Référentiels applicables » et « le bas de l'écran
 * `/rgpd` ». Le guide était juste la veille. Personne ne l'a vu : c'est
 * l'utilisateur qui a demandé *« les docs sont à jour ? »*.
 *
 * ── CE QUE CE CONTRÔLE MESURE, ET CE QU'IL NE PEUT PAS MESURER ──────────────
 *
 * Il prend, dans les guides, les **destinations d'écran** — la colonne « Où »
 * des tableaux « ce que vous pouvez faire » — et exige que chacune soit un
 * libellé RÉELLEMENT présent dans la barre latérale ou dans une barre d'onglets.
 *
 * Il ne sait pas dire qu'une explication est devenue fausse, ni qu'un conseil est
 * mauvais. Il ferme une classe précise : *le guide nomme une porte qui n'existe
 * plus*. C'est la classe qui a coûté deux bloquants, et c'est celle qui se
 * rouvre à chaque fois qu'on range le menu.
 *
 * ── ⚠️ LES DESTINATIONS SE LISENT, LES ÉCRANS SE DÉCOUVRENT ────────────────
 *
 * Les libellés viennent d'`index.html` et de `js/core/ui.js`, jamais d'une liste
 * écrite ici : une liste recopiée serait exactement le défaut qu'on ferme, un
 * cran plus haut.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_BACKEND, RACINE_FRONTEND } from '../aide/serveur.mjs';

const GUIDES = ['GUIDE_UTILISATEUR.md', 'GUIDE_EXPLOITATION.md'];

/** Les libellés d'entrée de menu, lus dans le balisage. */
function libellesDuMenu() {
  const html = readFileSync(join(RACINE_FRONTEND, 'index.html'), 'utf8');
  const labels = [];
  for (const m of html.matchAll(/data-route="[^"]+">.*?<span data-i18n="[^"]*">([^<]+)<\/span>/gs)) {
    labels.push(m[1].replace(/&amp;/g, '&').trim());
  }
  return labels;
}

/** Les libellés de SECTION du menu — ce sont des intertitres, pas des portes. */
function libellesDeSection() {
  const html = readFileSync(join(RACINE_FRONTEND, 'index.html'), 'utf8');
  return [...html.matchAll(/nav-section-btn[^>]*>.*?<span data-i18n="[^"]*">([^<]+)<\/span>/gs)]
    .map((m) => m[1].replace(/&amp;/g, '&').trim());
}

/** Les libellés d'ONGLET, lus dans le contrat de `js/core/ui.js`. */
function libellesDOnglet() {
  const source = readFileSync(join(RACINE_FRONTEND, 'js', 'core', 'ui.js'), 'utf8');
  return [...source.matchAll(/libelle:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) =>
    // Les libellés y sont écrits en échappement Unicode (`×`) pour que le
    // fichier reste lisible quel que soit l'éditeur : on les rend avant de comparer.
    JSON.parse(`"${m[1]}"`),
  );
}

/**
 * Les destinations citées par un guide.
 *
 * ── ⚠️ DEUX FORMES DE TABLEAU, ET L'EN-TÊTE DÉCIDE LAQUELLE ────────────────
 *
 * Les guides nomment des écrans de deux façons, et le balayage doit les
 * distinguer — sinon il lirait la colonne « Ce qu'il sert » comme une
 * destination, et rougirait sur des phrases parfaitement justes :
 *
 *   · `| Écran | Ce qu'il sert |`      → la destination est la colonne **1** ;
 *   · `| Geste | Où | À savoir |`      → la destination est la colonne **2**.
 *
 * L'en-tête est donc SUIVI, et une forme inconnue est **ignorée** plutôt
 * qu'interprétée : mieux vaut un tableau hors de portée du contrôle qu'un
 * contrôle qui invente ce qu'il mesure.
 *
 * Le reste de la prose n'est pas balayé : exiger que chaque mention au fil du
 * texte soit un libellé exact ferait rougir sur « le tableau de bord » ou
 * « votre registre », qui sont du français, pas des références.
 */
function destinationsDe(fichier) {
  const texte = readFileSync(join(RACINE_BACKEND, '..', 'docs', fichier), 'utf8');
  const destinations = [];
  let colonneUtile = null;
  for (const ligne of texte.split('\n')) {
    if (!ligne.startsWith('|')) {
      colonneUtile = null;   // hors d'un tableau : on oublie l'en-tête précédent
      continue;
    }
    const colonnes = ligne.split('|').map((c) => c.trim());
    if (ligne.includes('---')) continue;
    const entete = colonnes.map((c) => c.toLowerCase().replace(/\*\*/g, ''));
    if (entete.includes('écran') && entete.includes("ce qu'il sert")) {
      colonneUtile = entete.indexOf('écran');
      continue;
    }
    if (entete.includes('où')) {
      colonneUtile = entete.indexOf('où');
      continue;
    }
    if (colonneUtile === null || colonnes[colonneUtile] === undefined) continue;

    const cellule = colonnes[colonneUtile];
    // On écarte ce qui n'est PAS une destination d'écran : les cases vides, les
    // renvois explicites à l'API, et tout ce qui porte un avertissement
    // (« ⚠️ Aucun écran — par l'API »), qui dit précisément qu'il n'y en a pas.
    if (cellule === '' || cellule.includes('⚠️') || cellule.includes('API')
        || cellule.includes('`')) continue;
    // Une destination peut nommer un chemin : « Référentiels → onglet Applicables ici ».
    for (const morceau of cellule.split('→')) {
      // ⚠️ L'ORDRE compte : on retire le gras et les guillemets, on COUPE les
      // espaces, PUIS on retire le mot « onglet ». L'inverse laissait « onglet
      // Socle du Groupe » intact, parce que la cellule commence par un espace —
      // et le contrôle accusait alors une destination parfaitement juste.
      const propre = morceau
        .replace(/\*\*/g, '')
        .replace(/[«»]/g, '')
        .trim()
        .replace(/^onglet\s+/i, '')
        .trim();
      if (propre !== '') {
        destinations.push({ fichier, ligne: ligne.slice(0, 80), destination: propre });
      }
    }
  }
  return destinations;
}

describe('Les guides ne nomment que des écrans qui existent (constats Q-265 / Q-266)', () => {
  test('LA LECTURE A DE LA MATIÈRE : menu, onglets et destinations sont trouvés', () => {
    // ⚠️ Sans cette moitié, « toutes les destinations existent » serait vrai d'une
    // lecture qui ne trouve rien — et l'essai serait vert quoi qu'il arrive. C'est
    // le motif du constat Q-210, appliqué à un contrôle de document.
    const menu = libellesDuMenu();
    const onglets = libellesDOnglet();
    const destinations = GUIDES.flatMap(destinationsDe);

    assert.ok(menu.length >= 20, `Seulement ${menu.length} entrée(s) de menu lues.`);
    assert.ok(onglets.length >= 6, `Seulement ${onglets.length} libellé(s) d’onglet lus.`);
    assert.ok(
      destinations.length >= 5,
      `Seulement ${destinations.length} destination(s) lues dans les guides : le balayage ne ` +
        'reconnaît plus la forme des tableaux, et il passerait au vert sur n’importe quoi.',
    );
  });

  test('CHAQUE destination citée est une entrée de menu ou un onglet', () => {
    const connus = new Set([
      ...libellesDuMenu(),
      ...libellesDOnglet(),
      // Les intertitres de section sont admis : un guide qui dit « sous
      // Administration » désigne un endroit réel, même s'il ne se clique pas.
      ...libellesDeSection(),
    ]);

    const orphelines = GUIDES.flatMap(destinationsDe).filter(
      (d) => !connus.has(d.destination),
    );

    assert.deepEqual(
      orphelines.map((o) => `${o.fichier} : « ${o.destination} »`),
      [],
      'Ces guides envoient le lecteur vers un écran qui N’EXISTE PAS. C’est la classe des ' +
        'constats Q-265 et Q-266 — deux BLOQUANTS de la porte S7 —, et elle se rouvre à ' +
        'chaque fois qu’on range le menu : le 16/09/2026, déplacer quatre entrées vers des ' +
        'onglets a suffi à rendre trois phrases fausses en une journée.\n' +
        `  Libellés connus : ${[...connus].sort().join(' · ')}`,
    );
  });
});

/* =====================================================================
 *  Le CHIFFRE que l'exploitant lit — constat Q-331, refait le 18/09/2026
 * ===================================================================== */

describe('Le guide d’exploitation ne porte pas un compte périmé (constat Q-331)', () => {
  test('« N colonnes décidées » dit le registre de l’article 30 tel qu’il est', async () => {
    // ⚠️ **CE CONTRÔLE EXISTE PARCE QUE LA FAUTE A ÉTÉ REFAITE.** Le constat **Q-331**
    // avait fermé exactement cela : *« la correction avait porté sur les documents que
    // l'équipe relit, pas sur celui que l'exploitant lit »*. Trois jours plus tard, le
    // `GUIDE_EXPLOITATION` annonçait de nouveau un compte de six jours en retard — et le
    // garde-fou des chiffres, qui ne lit que le `README`, ne pouvait pas le voir.
    //
    // La parade n'est pas la vigilance : c'est que le nombre du guide soit confronté au
    // CATALOGUE, comme ceux du §8 le sont.
    const { ouvrirBaseEssai } = await import('../aide/base.mjs');
    const base = await ouvrirBaseEssai(import.meta.url);
    try {
      const client = await base.connexion('app');
      const reel = Number(
        (await client.query('select count(*)::int as n from colonnes_personnelles')).rows[0].n,
      );

      const texte = readFileSync(join(RACINE_BACKEND, '..', 'docs', 'GUIDE_EXPLOITATION.md'), 'utf8');
      const annonces = [...texte.matchAll(/\*\*(\d[\d\s]*) colonnes décidées\*\*/gu)].map((m) =>
        Number(m[1].replace(/\s/gu, '')),
      );

      assert.ok(
        annonces.length > 0,
        'Le guide d’exploitation n’annonce plus « N colonnes décidées » : ce contrôle n’a ' +
          'plus de sujet, et il vaut mieux le dire que rendre vert en ne lisant rien.',
      );
      for (const annonce of annonces) {
        assert.equal(
          annonce, reel,
          `Le guide d’exploitation annonce ${String(annonce)} colonnes décidées, le ` +
            `catalogue en porte ${String(reel)}. C’est le document que l’EXPLOITANT lit, ` +
            'et un chiffre faux y rassure au lieu de mesurer (constat Q-331).',
        );
      }
    } finally {
      await base.fermer();
    }
  });
});
