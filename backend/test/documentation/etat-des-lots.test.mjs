/**
 * etat-des-lots.test.mjs — la documentation d'état ne peut plus décrire l'état d'AVANT.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe : dix fois le même défaut
 * ════════════════════════════════════════════════════════════════════════
 *
 * La famille **Q-4** — *« un nombre ou un état du `README` diverge du réel »* — a été
 * signalée **dix fois** sur ce chantier. Deux fois en vingt-quatre heures : **Q-124** à la
 * porte S4 (« le travail en cours est L5 » dans le commit qui livre L5), puis **Q-145** à
 * la porte S5 (« L4 → L15 ⬜ à faire » dans le commit qui livre L4 et L6). La seconde a été
 * commise **après** que la première eut été corrigée, par la même main.
 *
 * ⚠️ **À la dixième occurrence, corriger le texte n'est plus une réponse.** Ce chantier a
 * une doctrine pour cela, et elle vaut ici : *la parade n'est jamais la vigilance, c'est la
 * découverte* (`CONVENTIONS.md` §19.5).
 *
 * ── Ce que ce contrôle confronte, et à quoi ──────────────────────────────
 *
 * Il ne compte pas des lignes et ne juge pas de la prose. Il confronte **la table des lots
 * de la documentation** à une source que personne n'écrit à la main : **les migrations
 * réellement présentes** et **les familles d'essais réellement présentes**. Un lot dont le
 * livrable est là mais que la table dit « à faire » est un mensonge mécaniquement visible.
 *
 * ── Ce qu'il NE fait PAS, et il faut le dire (§17.5) ─────────────────────
 *
 * Il ne vérifie pas qu'un lot déclaré livré **fonctionne** — c'est l'objet du reste du banc
 * et des portes de sécurité. Il attrape une seule chose, celle qui s'est produite dix fois :
 * un livrable présent dans le dépôt et absent de la table.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

// ⚠️ TROIS niveaux, pas deux : ce fichier vit dans `backend/test/documentation/`, et les
// chemins ci-dessous partent de la RACINE DU DÉPÔT (`backend/…`, `CLAUDE.md`). Le premier
// jet en mettait deux, et pointait donc `backend/backend/…`.
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * La preuve qu'un lot est livré, sous une forme que personne n'écrit à la main.
 *
 * ⚠️ Liste écrite à la main **à dessein**, et c'est le bon outil (`CLAUDE.md` §3) : son
 * incomplétude fait **échouer bruyamment** — un lot livré sans preuve déclarée ici n'est
 * simplement pas contrôlé, et l'assertion de matière plus bas le dit. Ce qui serait le
 * mauvais outil, ce serait une liste des lots **exemptés** du contrôle.
 */
const PREUVE_DE_LIVRAISON = [
  { lot: 'L1', preuve: 'backend/db/migrations/002_metier_noyau.sql' },
  { lot: 'L2', preuve: 'backend/src/entites/index.ts' },
  { lot: 'L3', preuve: 'backend/src/auth/client-ldap.ts' },
  { lot: 'L4', preuve: 'backend/db/migrations/009_perimetre_actif.sql' },
  { lot: 'L5', preuve: 'backend/src/api/journal.ts' },
  { lot: 'L6', preuve: 'backend/src/pieces/clamav.ts' },
  // ── ⚠️ HUIT LOTS AJOUTÉS LE 18/09/2026, ET L'OMISSION AVAIT COÛTÉ DIX JOURS ─────
  //
  // La liste s'arrêtait à L6. Conséquence mesurée à la question « les docs sont à jour ? » :
  // la table des lots du `README` annonçait **« L19 → L26 ⬜ planifiés »** alors que L19
  // était entier, L20 livré sauf 20.2, L21 et L24 livrés — c'est-à-dire l'état du 08/09,
  // trois vagues en arrière. Ce contrôle existe POUR CELA (famille Q-4, signalée dix fois),
  // et il était vert : il ne surveillait que six lots sur vingt-huit.
  //
  // ⚠️ La leçon n'est pas « il fallait y penser » : c'est qu'un contrôle dont la MATIÈRE est
  // écrite à la main vieillit comme le document qu'il garde. La parade tenable est
  // l'assertion de matière plus bas — « trop peu de lots suivis pour que ceci morde » —, et
  // elle est désormais calibrée sur ce que le dépôt porte réellement.
  { lot: 'L16', preuve: 'backend/db/migrations/017_pieces_suivent_leur_porteur.sql' },
  { lot: 'L17', preuve: 'backend/src/recherche/index.ts' },
  { lot: 'L18', preuve: 'docs/INSTALLER.md' },
  { lot: 'L19', preuve: 'backend/db/migrations/033_l_attestation_de_lecture.sql' },
  { lot: 'L20', preuve: 'backend/db/migrations/034_l_horloge_reglementaire.sql' },
  { lot: 'L21', preuve: 'backend/db/migrations/042_le_registre_dora_et_la_chaine.sql' },
  { lot: 'L24', preuve: 'backend/db/migrations/044_les_campagnes_descendantes.sql' },
];

/** Les documents qui portent une table des lots, et qui mentent tous les dix commits. */
const DOCUMENTS = ['backend/README.md', 'CLAUDE.md'];

describe('La documentation d’état ne décrit pas l’état d’AVANT (famille Q-4)', () => {
  test('LA SOURCE N’EST PAS VIDE : les preuves de livraison existent', () => {
    const absentes = PREUVE_DE_LIVRAISON.filter((p) => !existsSync(join(RACINE, p.preuve)));
    assert.deepEqual(
      absentes.map((p) => `${p.lot} → ${p.preuve}`),
      [],
      'Ces preuves de livraison ont disparu : soit un lot a été défait, soit ce contrôle ' +
        'confronte la documentation à des fichiers qui n’existent plus — et rendrait alors ' +
        'vert en n’éprouvant rien.',
    );
    assert.ok(PREUVE_DE_LIVRAISON.length >= 13, 'Trop peu de lots suivis pour que ceci morde.');
  });

  test('AUCUN lot dont le livrable est là n’est encore annoncé « à faire »', () => {
    const menteurs = [];
    for (const document of DOCUMENTS) {
      const texte = readFileSync(join(RACINE, document), 'utf8');
      for (const { lot } of PREUVE_DE_LIVRAISON) {
        // « L4 → L15 ⬜ à faire », « L4 → L15 | ⬜ », etc. : un intervalle qui ENGLOBE un
        // lot livré. C'est la forme exacte qu'a prise le défaut dix fois de suite.
        for (const [, debut, fin] of texte.matchAll(/L(\d+)\s*(?:→|->|à)\s*L(\d+)\s*[*\s]*\|?\s*⬜/gu)) {
          const n = Number(lot.slice(1));
          if (n >= Number(debut) && n <= Number(fin)) {
            menteurs.push(`${document} : « L${debut} → L${fin} ⬜ à faire » englobe ${lot}, livré`);
          }
        }
      }
    }
    assert.deepEqual(
      [...new Set(menteurs)],
      [],
      'La documentation annonce « à faire » un lot dont le livrable est DANS LE DÉPÔT. ' +
        'C’est la famille Q-4, signalée DIX fois — dont deux en vingt-quatre heures, la ' +
        'seconde après que la première eut été corrigée :\n' +
        menteurs.map((m) => `  · ${m}`).join('\n'),
    );
  });

  test('MORSURE : un intervalle qui engloberait un lot livré serait vu', () => {
    // ⚠️ **LE MOTIF NE VOYAIT PAS LA FORME EN GRAS, et c'est ce qui a laissé passer dix
    //    jours de retard.** Le `README` écrivait « | **L19 → L26** | ⬜ planifiés », avec
    //    les deux astérisques de fermeture entre le numéro et le carré : le motif exigeait
    //    au plus une barre et des espaces, et ne reconnaissait donc rien. Le contrôle
    //    rendait vert sur un document qui annonçait « à faire » quatre lots livrés.
    //
    //    *Un contrôle qui ne reconnaît qu'UNE écriture de ce qu'il cherche ne garde pas la
    //    propriété, il garde une mise en forme.* Les deux formes sont désormais éprouvées.
    const faux = '| L4 → L15 | ⬜ à faire — voir le plan |';
    const trouve = [...faux.matchAll(/L(\d+)\s*(?:→|->|à)\s*L(\d+)\s*[*\s]*\|?\s*⬜/gu)];
    assert.equal(trouve.length, 1, 'Le motif ne reconnaît plus la forme qui a menti dix fois.');
    assert.deepEqual([trouve[0][1], trouve[0][2]], ['4', '15']);

    // La forme EN GRAS, celle du README — elle a échappé au motif jusqu'au 18/09/2026.
    const fauxGras = '| **L19 → L26** | ⬜ **planifiés** (`../docs/PLAN_PRODUIT.md`) |';
    const trouveGras = [...fauxGras.matchAll(/L(\d+)\s*(?:→|->|à)\s*L(\d+)\s*[*\s]*\|?\s*⬜/gu)];
    assert.equal(trouveGras.length, 1, 'La forme en gras doit être reconnue elle aussi.');
    assert.deepEqual([trouveGras[0][1], trouveGras[0][2]], ['19', '26']);
  });
});
