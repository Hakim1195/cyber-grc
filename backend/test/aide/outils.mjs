/**
 * outils.mjs — les trois gestes que tout banc à processus externe refait.
 *
 * ── Pourquoi ils quittent `test/deploiement/vhost-apache.test.mjs` ──────────
 *
 * La vague 3 ajoute deux familles qui montent, elles aussi, un vrai processus qui
 * écoute : l'oracle Apache de l'annuaire simulé (`test/annuaire/`) et la jonction
 * complète du contrôle S17 (`test/deploiement/chaine-complete.test.mjs`, constat
 * Q-62). Les recopier eût été la troisième et la quatrième copie.
 *
 * `exigerOutil` porte l'arbitrage du constat **Q-37**, et c'est le seul qui compte
 * ici : **un essai vert parce qu'un binaire est absent est un décor.** Il échoue en
 * disant quoi installer ; il ne se saute pas.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import net from 'node:net';

/**
 * Exige un outil, et ÉCHOUE bruyamment s'il manque.
 *
 * @param {string} commande le binaire attendu
 * @param {string[]} arguments_ de quoi le faire répondre sans rien produire
 * @param {string} pourquoi ce que l'essai ne peut pas montrer sans lui
 */
export function exigerOutil(commande, arguments_, pourquoi) {
  let present = true;
  try {
    execFileSync(commande, arguments_, { stdio: 'ignore' });
  } catch {
    present = false;
  }
  assert.ok(
    present,
    `« ${commande} » est introuvable sur cette machine. ${pourquoi} Installez-le plutôt que ` +
      'de neutraliser cet essai : un contrôle qui se saute quand l’outil manque ne protège ' +
      'que les machines où il n’y avait rien à protéger (constat Q-37).',
  );
}

/** Un port libre sur la boucle locale. Jamais un port fixe : les familles cohabitent. */
export function portLibre() {
  return new Promise((resoudre, rejeter) => {
    const serveur = net.createServer();
    serveur.on('error', rejeter);
    serveur.listen(0, '127.0.0.1', () => {
      const { port } = serveur.address();
      serveur.close(() => resoudre(port));
    });
  });
}

/**
 * Attend qu'un port accepte les connexions, et ÉCHOUE en le disant sinon.
 *
 * `contexte` rend ce que le processus attendu a écrit — sans quoi le message
 * d'échec dit « ça n'écoute pas » et rien d'autre, ce qui coûte une demi-heure à
 * chaque fois.
 */
export async function attendrePort(port, quoi, delai = 20000, contexte = () => '') {
  const echeance = Date.now() + delai;
  for (;;) {
    const ouvert = await new Promise((resoudre) => {
      const prise = net.connect(port, '127.0.0.1');
      prise.on('connect', () => {
        prise.destroy();
        resoudre(true);
      });
      prise.on('error', () => resoudre(false));
    });
    if (ouvert) return;
    if (Date.now() > echeance) {
      throw new Error(`${quoi} n’écoute toujours pas sur ${String(port)} après ${String(delai)} ms.\n${contexte()}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}
