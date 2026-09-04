/**
 * Tout réglage documenté est un réglage LU — constat Q-91.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le défaut, et pourquoi il mérite un garde-fou plutôt qu'une relecture
 * ════════════════════════════════════════════════════════════════════════
 *
 * Trois variables vivaient dans `.env.example`, chacune avec un paragraphe
 * expliquant ce qu'elle règle, et **aucune n'était lue nulle part** :
 * `API_RYTHME_MAX_ANONYME`, `API_RYTHME_FENETRE`, `AUTH_REVERIFICATION_AD`. Un
 * exploitant qui les réglait croyait agir. Pire pour deux d'entre elles : le
 * code *empruntait* les valeurs de connexion à leur place, et le fichier
 * d'exemple écrivait lui-même la règle qu'il enfreignait — *« un emprunt écrit
 * dans le code n'est pas un réglage »*.
 *
 * Le registre le compte comme **deuxième et troisième récidives** du constat
 * m-2. Trois occurrences du même motif, c'est le moment où une relecture cesse
 * d'être une réponse : un garde-fou que rien n'appelle est un commentaire
 * (`CONVENTIONS.md` §18.4), et une consigne que rien ne vérifie en est un aussi.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi cet essai DÉCOUVRE au lieu d'énumérer
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le `CLAUDE.md` §3 tranche par le résultat d'une omission. Ici, une variable
 * oubliée d'une liste écrite à la main **réussirait en silence** : l'essai
 * resterait vert en n'éprouvant rien, et la quatrième récidive passerait comme
 * les trois premières. La liste est donc lue **dans `.env.example`** — la
 * source même du défaut —, jamais recopiée.
 *
 * Symétriquement, l'essai refuse de passer s'il trouve moins de vingt réglages :
 * un `.env.example` déplacé ou un motif d'extraction cassé rendraient une liste
 * vide, et une liste vide satisfait toutes les assertions du monde.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racineBackend = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Toutes les affectations `NOM=…` de `.env.example`, commentaires exclus. */
function reglagesDocumentes() {
  const texte = readFileSync(join(racineBackend, '.env.example'), 'utf8');
  const noms = new Set();
  for (const ligne of texte.split('\n')) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(ligne);
    if (m !== null) noms.add(m[1]);
  }
  return [...noms].sort();
}

/**
 * Le texte de tout ce qui, dans le produit livré, peut lire un réglage.
 *
 * ⚠️ **Trois répertoires, et le troisième a été ajouté par une morsure.** Le
 * premier jet ne parcourait que `src/`, et l'essai a dénoncé
 * `BASE_UTILISATEUR_LECTURE` et `BASE_MOT_DE_PASSE_LECTURE` comme muets. Ils ne
 * le sont pas : `deploy/install.sh` crée le rôle de supervision avec, et
 * `deploy/groupes-ad.sh` s'en sert. Le serveur, lui, ne les lit jamais — il se
 * connecte sous `grc_app`.
 *
 * La leçon vaut d'être écrite, parce qu'elle a failli produire un faux constat :
 * *un réglage n'est pas muet parce que le serveur l'ignore ; il est muet quand
 * RIEN dans le produit ne le lit.* Un installateur est du produit.
 */
function sourcesDuProduit() {
  const morceaux = [];
  const extensions = ['.ts', '.mjs', '.sh', '.sql'];
  const parcourir = (repertoire) => {
    for (const entree of readdirSync(repertoire)) {
      const chemin = join(repertoire, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (extensions.some((e) => entree.endsWith(e))) {
        morceaux.push(readFileSync(chemin, 'utf8'));
      }
    }
  };
  for (const racine of ['src', 'db', 'deploy']) parcourir(join(racineBackend, racine));
  return sansCommentaires(morceaux.join('\n'));
}

/**
 * Réglages qu'aucun code ne lit **et dont c'est normal**, chacun avec son motif
 * et le lot qui les activera.
 *
 * ⚠️ Cette liste-ci est écrite à la main **à dessein**, et c'est le cas où le
 * `CLAUDE.md` §3 le permet : son incomplétude fait **échouer bruyamment** et
 * oblige quelqu'un à trancher — précisément ce qu'on veut d'un réglage qui ne
 * sert encore à rien. Ajouter une ligne ici est une décision, pas un contournement.
 *
 * ⚠️ **Elle est vide, et c'est une mesure, pas une intention.** Le premier jet y
 * plaçait les trois réglages `SMTP_OAUTH_*`, au motif que les notifications sont
 * le lot L12 — et l'essai a immédiatement rougi : `src/config/index.ts` les lit
 * déjà. La supposition était fausse, l'essai l'a dit dans la seconde. C'est
 * exactement ce qu'on attend d'un garde-fou, et c'est pour cela que le dernier
 * cas ci-dessous existe : une exemption qui survit à sa cause protège un défaut
 * qui n'existe plus, et masquerait sa réapparition.
 */
const REPORTES = new Map([]);

/**
 * Retire les commentaires d'un fichier avant toute recherche.
 *
 * ⚠️ **Ajouté par une morsure ratée, et c'est le point le plus utile de cet
 * essai.** La première version cherchait le nom dans le texte brut. Débrancher
 * `API_RYTHME_MAX_ANONYME` du code aurait dû la faire rougir : elle est restée
 * **verte**, parce que le nom subsistait dans le commentaire que le débranchement
 * venait justement d'écrire à côté.
 *
 * Un détecteur qui compte une mention pour une lecture ne mesure pas le produit,
 * il se mesure lui-même — le motif que ce chantier traque depuis le 7ᵉ passage de
 * la porte S2. Les commentaires sont donc retirés d'abord : `//` et `/* … *\/`
 * pour TypeScript, `#` pour le shell et SQL — le SQL emploie aussi `--`.
 *
 * Le retrait est **grossier à dessein** : il peut amputer une chaîne de
 * caractères contenant `//`. Cela ne peut que rendre l'essai plus sévère (un
 * réglage déclaré muet à tort se voit immédiatement), jamais plus permissif —
 * et c'est le sens dans lequel on veut se tromper.
 */
function sansCommentaires(texte) {
  return texte
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').replace(/#.*$/, '').replace(/--.*$/, ''))
    .join('\n');
}

/**
 * Ce nom apparaît-il dans du CODE, ailleurs que dans une affectation `NOM=…` ?
 *
 * L'affectation est ce que `.env.example` contient par définition : la compter
 * ferait déclarer « lu » tout réglage, y compris celui que personne ne lit.
 */
function estLu(sources, nom) {
  const motif = new RegExp(`\\b${nom}\\b(?!\\s*=)`);
  return motif.test(sources);
}

describe('Un réglage documenté est un réglage lu (constat Q-91)', () => {
  test('LA SOURCE N’EST PAS VIDE : `.env.example` livre bien ses réglages', () => {
    const noms = reglagesDocumentes();
    assert.ok(
      noms.length >= 20,
      `Seulement ${noms.length} réglages extraits de .env.example : le motif d’extraction ` +
        'ou le chemin du fichier est cassé, et cet essai rendrait vert en n’éprouvant rien.',
    );
  });

  test('CHAQUE réglage de `.env.example` est lu quelque part dans le produit', () => {
    const sources = sourcesDuProduit();
    // Le nom est cherché **nu**, sans guillemets : TypeScript écrit
    // `lecteur.entier('NOM', …)`, un shell écrit `lire_variable NOM` ou `$NOM`.
    // Un motif qui n'aurait convenu qu'au premier aurait dénoncé tout `deploy/`.
    const muets = reglagesDocumentes().filter(
      (nom) => !REPORTES.has(nom) && !estLu(sources, nom),
    );
    assert.deepEqual(
      muets,
      [],
      'Ces réglages sont documentés et lus NULLE PART : un exploitant qui les règle croit ' +
        'agir. Les brancher, les retirer, ou les inscrire dans REPORTES avec leur lot.',
    );
  });

  test('MORSURE : un réglage inventé est bien vu comme muet', () => {
    const sources = sourcesDuProduit();
    assert.ok(
      !estLu(sources, 'API_RYTHME_REGLAGE_QUI_N_EXISTE_PAS'),
      'Le détecteur dirait « lu » de n’importe quoi : il ne prouverait rien.',
    );
  });

  test('LES TROIS de Q-91 sont branchés, nommément', () => {
    const sources = sourcesDuProduit();
    for (const nom of ['API_RYTHME_MAX_ANONYME', 'API_RYTHME_FENETRE', 'AUTH_REVERIFICATION_AD']) {
      assert.ok(estLu(sources, nom), `${nom} : le constat Q-91 est rouvert.`);
    }
  });

  test('LES REPORTS sont justifiés : aucun n’est resté après avoir été branché', () => {
    const sources = sourcesDuProduit();
    const inutiles = [...REPORTES.keys()].filter((nom) => estLu(sources, nom));
    assert.deepEqual(
      inutiles,
      [],
      'Ces réglages sont désormais lus : les retirer de REPORTES, sinon la liste protège ' +
        'un défaut qui n’existe plus et masquerait sa réapparition.',
    );
  });
});
