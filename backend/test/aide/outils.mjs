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
 * Ajoute `/usr/sbin` et `/sbin` au `PATH` du processus d'essai — constat **Q-82**.
 *
 * ── Le défaut, mesuré le 03/09/2026 sur la VM Debian 13 ────────────────────
 *
 * Debian range les démons dans `/usr/sbin`, et **ne met pas ce répertoire dans le
 * `PATH` d'un compte non-root**. Un banc lancé par un développeur y trouve donc
 * `rsync` mais pas `apache2` — et `exigerOutil` annonçait alors, mot pour mot,
 * *« apache2 est introuvable sur cette machine »*. C'était **faux** : Apache était
 * installé, actif, et servait le produit à la même seconde depuis
 * `/usr/sbin/apache2`.
 *
 * La conséquence est pire que l'inconvénient : **29 essais** — dont la jonction du
 * contrôle S17 (Q-62), l'URL d'entrée (Q-36) et la liste blanche du frontal (Q-31),
 * c'est-à-dire l'endroit d'où sont sortis deux bloquants — étaient annulés en
 * accusant la machine. Un message d'échec qui se trompe de cause coûte plus cher
 * qu'un message absent : il envoie installer ce qui est déjà là.
 *
 * On complète donc le `PATH` au lieu de coder un chemin en dur, pour la même raison
 * qu'au constat **Q-80** : ce qui se découvre ne se recopie pas.
 */
function completerCheminSbin() {
  const separateur = ':';
  const chemins = (process.env.PATH ?? '').split(separateur);
  for (const sbin of ['/usr/sbin', '/sbin']) {
    if (!chemins.includes(sbin)) chemins.push(sbin);
  }
  process.env.PATH = chemins.join(separateur);
}

/**
 * Exige un outil, et ÉCHOUE bruyamment s'il manque.
 *
 * @param {string} commande le binaire attendu
 * @param {string[]} arguments_ de quoi le faire répondre sans rien produire
 * @param {string} pourquoi ce que l'essai ne peut pas montrer sans lui
 */
export function exigerOutil(commande, arguments_, pourquoi) {
  completerCheminSbin();
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
