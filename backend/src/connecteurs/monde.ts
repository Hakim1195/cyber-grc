/**
 * `src/connecteurs/monde.ts` — LE MONDE EXTÉRIEUR, POUR DE VRAI (lot L23)
 *
 * ⚠️ **C'est le seul fichier du lot qui touche le disque et le réseau.** Les exécuteurs
 * de `executeurs.ts` décident ; celui-ci regarde. La séparation n'est pas de la
 * cosmétique : elle est ce qui permet d'éprouver les chemins d'**échec** — un annuaire
 * injoignable, un répertoire illisible, un démon muet —, que le réel ne produit pas à la
 * demande.
 *
 * ⚠️ **Chaque membre JETTE quand la source ne répond pas**, et ne rend jamais une valeur
 * de repli. Rendre « 0 membre » pour un annuaire injoignable ferait constater un groupe
 * vidé là où il y a une panne de réseau — une accusation, au lieu d'un « je ne sais pas ».
 */

import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { ClientLdap } from '../auth/client-ldap.js';
import { echapperValeur } from '../auth/filtre-ldap.js';
import type { Configuration } from '../config/index.js';

import type { Monde } from './executeurs.js';

/** Bornes — un connecteur ne doit pas pouvoir faire tomber le service (contrôle S13). */
const ENTREES_MAX = 5_000;
const PROFONDEUR_MAX = 3;
const DELAI_CLAMAV_MS = 5_000;

/**
 * La plus récente écriture sous un chemin, à trois niveaux de profondeur au plus.
 *
 * ⚠️ **Borné en nombre d'entrées ET en profondeur.** Un dépôt de sauvegarde peut porter
 * des centaines de milliers de fichiers ; un balayage sans borne y passerait la journée,
 * pendant que le minuteur relancerait le suivant.
 */
async function plusRecenteEcriture(
  chemin: string,
): Promise<{ nom: string; le: Date } | null> {
  let vues = 0;
  let meilleure: { nom: string; le: Date } | null = null;

  async function descendre(racine: string, profondeur: number): Promise<void> {
    if (profondeur > PROFONDEUR_MAX || vues >= ENTREES_MAX) return;
    const entrees = await fs.readdir(racine, { withFileTypes: true });
    for (const entree of entrees) {
      if (vues >= ENTREES_MAX) return;
      vues += 1;
      const complet = path.join(racine, entree.name);
      if (entree.isDirectory()) {
        // ⚠️ Un sous-répertoire illisible ne fait pas échouer le tout : la question
        // posée est « quelque chose a-t-il été écrit ? », et la réponse peut venir
        // d'ailleurs. Le chemin RACINE illisible, lui, jette — et c'est le bon.
        try {
          await descendre(complet, profondeur + 1);
        } catch {
          /* ignoré à dessein — voir ci-dessus */
        }
        continue;
      }
      if (!entree.isFile()) continue;
      const infos = await fs.stat(complet);
      if (meilleure === null || infos.mtime > meilleure.le) {
        meilleure = { nom: entree.name, le: infos.mtime };
      }
    }
  }

  await descendre(chemin, 0);
  return meilleure;
}

/**
 * Interroge le démon antivirus : `VERSION` rend `ClamAV 1.x/27123/Mon Sep 15 ...`.
 *
 * ⚠️ **La date est lue par DÉCOUPAGE, jamais par une expression rationnelle** — règle
 * n° 3 issue de la porte S8 (constats Q-208, Q-215, Q-216) : aucune expression à coût
 * non borné dans `src/`, et le sujet vient ici d'un démon, c'est-à-dire du dehors.
 */
function lireVersionClamav(ligne: string): { version: string; signaturesLe: Date | null } {
  const morceaux = ligne.trim().split('/');
  const version = (morceaux[0] ?? ligne).trim().slice(0, 120);
  if (morceaux.length < 3) return { version, signaturesLe: null };
  const brut = morceaux.slice(2).join('/').trim();
  const quand = new Date(brut);
  // ⚠️ Une date illisible rend `null`, et `null` fait rendre « indeterminé » à
  // l'exécuteur — jamais « conforme ». On ne devine pas la fraîcheur d'une base.
  return { version, signaturesLe: Number.isNaN(quand.getTime()) ? null : quand };
}

async function interrogerClamav(
  socket: string,
  delaiMs: number,
): Promise<{ version: string; signaturesLe: Date | null }> {
  return await new Promise((resoudre, rejeter) => {
    const lien = net.createConnection(socket);
    let recu = '';
    let fini = false;

    const clore = (erreur: Error | null): void => {
      if (fini) return;
      fini = true;
      lien.destroy();
      if (erreur) rejeter(erreur);
      else resoudre(lireVersionClamav(recu.replace(/\0+$/u, '')));
    };

    lien.setTimeout(delaiMs, () =>
      clore(new Error(`le démon n'a pas répondu en ${delaiMs} ms`)),
    );
    lien.on('error', (erreur) => clore(erreur));
    lien.on('connect', () => lien.write('nVERSION\n'));
    lien.on('data', (morceau: Buffer) => {
      recu += morceau.toString('utf8');
      // ⚠️ Borné : le démon répond une ligne, mais rien ne le garantit d'un socket
      // qui parlerait un autre protocole.
      if (recu.includes('\n') || recu.length > 4_096) clore(null);
    });
    lien.on('end', () => clore(null));
  });
}

/**
 * Effectif d'un groupe de l'annuaire.
 *
 * ⚠️ **Le nom du groupe est ÉCHAPPÉ** (RFC 4515 §3) avant d'entrer dans le filtre : il
 * vient d'une ligne de table, donc d'une saisie. Sans cela, une configuration de
 * connecteur deviendrait une injection de filtre LDAP.
 */
async function effectifDuGroupe(groupe: string, config: Configuration): Promise<number> {
  const ldap = config.auth.ldap;
  if (!config.auth.ldapActif || ldap === null) {
    throw new Error("le lien avec l'annuaire n'est pas configuré sur ce serveur");
  }
  const client = await ClientLdap.connecter({
    url: ldap.url,
    ca: ldap.ca,
    verifierCertificat: ldap.verifierCertificat,
    delaiMs: ldap.delaiMs,
  });
  try {
    await client.lier(ldap.dnService, ldap.motDePasseService);
    const entrees = await client.rechercher({
      base: ldap.baseRecherche,
      portee: 'sousArbre',
      filtre: `(&(objectClass=group)(cn=${echapperValeur(groupe)}))`,
      attributs: ['member'],
      tailleMax: 2,
      // Deux entrées sous le même `cn` seraient une anomalie d'annuaire, pas une
      // troncature : c'est l'appelant qui interprète (voir `OptionsRecherche`).
      bornePleineEstTroncature: false,
    });
    if (entrees.length === 0) {
      // ⚠️ **Un groupe ABSENT est une réponse, pas une panne** : l'annuaire a répondu,
      // et il a répondu « ce groupe n'existe pas ». C'est un effectif de zéro, donc un
      // constat « non conforme » — et non un « je ne sais pas ».
      return 0;
    }
    return entrees[0]?.attributs.get('member')?.length ?? 0;
  } finally {
    await client.fermer();
  }
}

/** Le monde tel qu'il est. */
export function mondeReel(config: Configuration): Monde {
  return {
    plusRecenteEcriture,
    antivirus: () =>
      interrogerClamav(
        config.piecesJointes.clamavSocket,
        Math.min(config.piecesJointes.clamavDelaiMs, DELAI_CLAMAV_MS),
      ),
    effectifDuGroupe: (groupe) => effectifDuGroupe(groupe, config),
    maintenant: () => new Date(),
  };
}
