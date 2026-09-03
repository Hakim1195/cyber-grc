/**
 * client-ldap.mjs — un client LDAP minimal, POUR LE BANC SEULEMENT.
 *
 * ── Ce qu'il est, et ce qu'il ne prétend pas être ───────────────────────────
 *
 * Le client LDAP du produit est écrit par l'agent **A1**, dans `backend/src/auth/**`.
 * Celui-ci ne le remplace pas et ne le préfigure pas : il sert à **éprouver
 * l'annuaire simulé** — à vérifier que la doublure parle bien la RFC 4511 avant que
 * quiconque code contre elle.
 *
 * ⚠️ **Il ne peut pas, à lui seul, prouver que la doublure est juste.** Écrits par la
 * même main, un serveur et son client se trompent volontiers de la même façon — c'est
 * le défaut mesuré en **Q-61**, et c'est la raison même pour laquelle le §25 confie
 * l'annuaire à A4 et le client à A1. La contre-épreuve est donc faite par un client
 * **tiers** : `oracle-apache.test.mjs` interroge la même doublure avec le
 * `mod_authnz_ldap` d'Apache, qui ne partage aucune ligne avec ce fichier.
 */

import { connect as connecterTcp } from 'node:net';
import { connect as connecterTls } from 'node:tls';

import {
  ETIQUETTE, RESULTAT, chaine, encoder, entier, enumere, booleen, lire, lireChaine,
  lireEntier, lireTous, sequence,
} from './ber.mjs';

/* =====================================================================
 *  Filtres : du texte vers le BER
 * ===================================================================== */

/**
 * Analyse un filtre LDAP textuel — `(&(objectClass=user)(sAMAccountName=x))` — et
 * l'encode. Le sous-ensemble couvert est celui que `LDAP_FILTRE_UTILISATEUR` et la
 * résolution des groupes emploient : `&`, `|`, `!`, égalité, présence, sous-chaînes.
 */
export function encoderFiltre(texte) {
  let rang = 0;
  const source = String(texte);

  function analyser() {
    if (source[rang] !== '(') throw new Error(`Filtre mal formé à ${String(rang)} : ${source}`);
    rang += 1;
    const operateur = source[rang];
    if (operateur === '&' || operateur === '|' || operateur === '!') {
      rang += 1;
      const sous = [];
      while (source[rang] === '(') sous.push(analyser());
      if (source[rang] !== ')') throw new Error(`Parenthèse manquante dans : ${source}`);
      rang += 1;
      const etiquette = operateur === '&' ? 0xa0 : operateur === '|' ? 0xa1 : 0xa2;
      return encoder(etiquette, Buffer.concat(sous));
    }
    const fin = source.indexOf(')', rang);
    if (fin === -1) throw new Error(`Parenthèse manquante dans : ${source}`);
    const contenu = source.slice(rang, fin);
    rang = fin + 1;
    const egal = contenu.indexOf('=');
    if (egal === -1) throw new Error(`Assertion sans « = » : ${contenu}`);
    const attribut = contenu.slice(0, egal);
    const valeur = contenu.slice(egal + 1);
    if (valeur === '*') return chaine(attribut, 0x87); // present : PRIMITIF
    if (valeur.includes('*')) {
      const morceaux = valeur.split('*');
      const parties = [];
      if (morceaux[0] !== '') parties.push(chaine(morceaux[0], 0x80)); // initial
      for (const milieu of morceaux.slice(1, -1)) if (milieu !== '') parties.push(chaine(milieu, 0x81)); // any
      const dernier = morceaux[morceaux.length - 1];
      if (dernier !== '') parties.push(chaine(dernier, 0x82)); // final
      return encoder(0xa4, Buffer.concat([chaine(attribut), sequence(parties)]));
    }
    return encoder(0xa3, Buffer.concat([chaine(attribut), chaine(valeur)]));
  }

  const resultat = analyser();
  if (rang !== source.length) throw new Error(`Filtre non consommé en entier : ${source}`);
  return resultat;
}

/* =====================================================================
 *  La connexion
 * ===================================================================== */

export class ErreurLdap extends Error {
  constructor(message, codeLdap, diagnostic) {
    super(message);
    this.name = 'ErreurLdap';
    this.codeLdap = codeLdap;
    this.diagnostic = diagnostic ?? '';
  }
}

/**
 * Ouvre une connexion à l'annuaire.
 *
 * @param {{url: string, ca?: Buffer|null, verifierCertificat?: boolean, delaiMs?: number}} options
 */
export async function connecter(options) {
  const url = new URL(options.url);
  const delaiMs = options.delaiMs ?? 8000;
  const securise = url.protocol === 'ldaps:';

  const prise = await new Promise((resoudre, rejeter) => {
    const commun = { host: url.hostname, port: Number(url.port), timeout: delaiMs };
    const p = securise
      ? connecterTls({
        ...commun,
        // La vérification du certificat est le point même de LDAPS : elle se règle,
        // elle ne se contourne pas en silence (`src/config/index.ts` la refuse
        // désactivée en production).
        rejectUnauthorized: options.verifierCertificat !== false,
        ca: options.ca === undefined || options.ca === null ? undefined : [options.ca],
        servername: options.servername ?? 'annuaire-simule.exemple.interne',
      }, () => resoudre(p))
      : connecterTcp(commun, () => resoudre(p));
    p.once('error', rejeter);
  });
  prise.setTimeout(0);

  let identifiantMessage = 0;
  let tampon = Buffer.alloc(0);
  const enAttente = new Map(); // id → { messages, resoudre, rejeter, minuteur }
  let rompue = null;

  const rompre = (erreur) => {
    rompue = erreur;
    for (const attente of enAttente.values()) {
      clearTimeout(attente.minuteur);
      attente.rejeter(erreur);
    }
    enAttente.clear();
  };

  prise.on('data', (morceau) => {
    tampon = Buffer.concat([tampon, morceau]);
    for (;;) {
      let message;
      try {
        message = lire(tampon, 0);
      } catch (erreur) {
        rompre(new ErreurLdap(`Trame illisible : ${erreur.message}`, null));
        prise.destroy();
        return;
      }
      if (message === null) return;
      tampon = tampon.subarray(message.fin);
      const [idElement, operation] = lireTous(message.contenu);
      const id = lireEntier(idElement.contenu);
      const attente = enAttente.get(id);
      if (attente === undefined) continue;
      attente.messages.push(operation);
      // Une réponse de liaison est terminale ; une recherche l'est à sa `searchResDone`.
      if (operation.etiquette === ETIQUETTE.REPONSE_LIAISON
        || operation.etiquette === ETIQUETTE.FIN_RECHERCHE
        || operation.etiquette === ETIQUETTE.REPONSE_ETENDUE) {
        clearTimeout(attente.minuteur);
        enAttente.delete(id);
        attente.resoudre(attente.messages);
      }
    }
  });
  prise.on('error', (erreur) => rompre(erreur));
  prise.on('close', () => {
    // ── Une connexion coupée au milieu n'est PAS une réponse ────────────────
    // C'est la panne « réponse tronquée » de D5 : le client doit s'en apercevoir,
    // et non décoder « au mieux » ce qui est arrivé.
    if (enAttente.size > 0) rompre(new ErreurLdap('Connexion fermée avant la fin de la réponse (réponse tronquée).', null));
  });

  const envoyer = (corpsOperation) =>
    new Promise((resoudre, rejeter) => {
      if (rompue !== null) { rejeter(rompue); return; }
      identifiantMessage += 1;
      const id = identifiantMessage;
      const minuteur = setTimeout(() => {
        enAttente.delete(id);
        rejeter(new ErreurLdap(`L’annuaire n’a pas répondu en ${String(delaiMs)} ms (LDAP_DELAI).`, 'DELAI'));
      }, delaiMs);
      minuteur.unref?.();
      enAttente.set(id, { messages: [], resoudre, rejeter, minuteur });
      prise.write(sequence(entier(id), corpsOperation));
    });

  return {
    prise,

    /** D1 et D2 — liaison simple. Rejette avec `codeLdap` en cas d'échec. */
    async lier(dn, motDePasse) {
      const [reponse] = await envoyer(encoder(ETIQUETTE.DEMANDE_LIAISON, Buffer.concat([
        entier(3), chaine(dn), chaine(motDePasse, 0x80),
      ])));
      const [code, , diagnostic] = lireTous(reponse.contenu);
      const valeur = lireEntier(code.contenu);
      if (valeur !== RESULTAT.SUCCES) {
        throw new ErreurLdap(`Liaison refusée pour « ${dn} » (code ${String(valeur)}).`, valeur, lireChaine(diagnostic.contenu));
      }
      return true;
    },

    /**
     * Recherche. `portee` : 0 base, 1 un niveau, 2 sous-arbre.
     * Rend les entrées `{ dn, attributs }` ; `attributs` est un objet de tableaux.
     */
    async rechercher({ base, portee = 2, filtre, attributs = [], tailleMax = 0, delaiSecondes = 0 }) {
      const messages = await envoyer(encoder(ETIQUETTE.DEMANDE_RECHERCHE, Buffer.concat([
        chaine(base), enumere(portee), enumere(0), entier(tailleMax), entier(delaiSecondes), booleen(false),
        encoderFiltre(filtre), sequence(attributs.map((a) => chaine(a))),
      ])));
      const entrees = [];
      /**
       * Les renvois reçus. Ils sont EXPOSÉS et non ignorés en silence : un client
       * qui les ignore rend une liste incomplète en annonçant un succès, et c'est
       * précisément ce qu'il faut pouvoir mesurer (constat Q-68).
       */
      const renvois = [];
      Object.defineProperty(entrees, 'renvois', { value: renvois, enumerable: false });
      for (const message of messages) {
        if (message.etiquette === ETIQUETTE.RENVOI_RECHERCHE) {
          for (const url of lireTous(message.contenu)) renvois.push(lireChaine(url.contenu));
        } else if (message.etiquette === ETIQUETTE.ENTREE_RECHERCHE) {
          const [dn, liste] = lireTous(message.contenu);
          const attributsLus = {};
          for (const attribut of lireTous(liste.contenu)) {
            const [nom, valeurs] = lireTous(attribut.contenu);
            attributsLus[lireChaine(nom.contenu)] = lireTous(valeurs.contenu).map((v) => lireChaine(v.contenu));
          }
          entrees.push({ dn: lireChaine(dn.contenu), attributs: attributsLus });
        } else if (message.etiquette === ETIQUETTE.FIN_RECHERCHE) {
          const [code, , diagnostic] = lireTous(message.contenu);
          const valeur = lireEntier(code.contenu);
          if (valeur !== RESULTAT.SUCCES) {
            throw new ErreurLdap(`Recherche refusée (code ${String(valeur)}).`, valeur, lireChaine(diagnostic.contenu));
          }
        }
      }
      return entrees;
    },

    async fermer() {
      try {
        identifiantMessage += 1;
        prise.write(sequence(entier(identifiantMessage), encoder(ETIQUETTE.DEMANDE_DELIAISON, Buffer.alloc(0))));
      } catch { /* déjà rompue */ }
      prise.destroy();
    },
  };
}

/**
 * La résolution RÉCURSIVE des groupes imbriqués, telle que le `PLAN_SERVEUR` §3.4
 * l'exige — **avec** l'ensemble des visités.
 *
 * Elle est ici pour une raison précise : elle est la **contre-épreuve du cycle**.
 * Un essai qui ne montrerait que « le résolveur du banc s'en sort » ne dirait rien ;
 * `annuaire.test.mjs` montre d'abord qu'un résolveur SANS cet ensemble se fige sur
 * la même doublure. C'est ce que le §25.2 attend de D3.
 */
export async function resoudreGroupesRecursivement(client, dnDepart, { base, avecEnsembleDesVisites = true, maxOperations = 500 } = {}) {
  const vus = new Set();
  const aVoir = [dnDepart];
  let operations = 0;
  while (aVoir.length > 0) {
    const dn = aVoir.shift();
    if (avecEnsembleDesVisites) {
      const cle = dn.toLowerCase();
      if (vus.has(cle)) continue;
      vus.add(cle);
    }
    operations += 1;
    if (operations > maxOperations) {
      throw new ErreurLdap(
        `Résolution récursive non terminée après ${String(maxOperations)} opérations : ` +
        'l’imbrication porte un CYCLE, et un résolveur qui ne tient pas la liste des groupes ' +
        'déjà visités tourne indéfiniment (CONVENTIONS.md §25.2, D3).',
        'CYCLE',
      );
    }
    const entrees = await client.rechercher({
      base, portee: 2, filtre: `(&(objectClass=group)(member=${dn}))`, attributs: ['cn', 'distinguishedName'],
    });
    for (const entree of entrees) aVoir.push(entree.dn);
  }
  return [...vus].filter((cle) => cle !== dnDepart.toLowerCase());
}
