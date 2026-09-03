/**
 * serveur-ldap.mjs — l'ANNUAIRE SIMULÉ du `CONVENTIONS.md` §25.
 *
 * ── Ce qu'il est, et ce qu'il n'est pas ─────────────────────────────────────
 *
 * Un **vrai serveur LDAP**, en processus, sur `127.0.0.1` et un **port éphémère**
 * (jamais un port fixe : deux familles d'essais tournent en parallèle). Il parle la
 * RFC 4511 sur le fil : un client tiers s'y connecte sans rien savoir de ce fichier,
 * et c'est la seule façon d'éprouver le client LDAP qu'écrit A1.
 *
 * Il vit dans `backend/test/annuaire/**` et **n'est jamais importé par
 * `backend/src/**`** (§25.1). Un `import` de `src` vers `test` est un défaut, pas un
 * raccourci — et le banc de `test/depot/` le verrait.
 *
 * ⚠️ **Il n'y a aucun Active Directory sur cette machine, et il ne faut pas en
 * viser un** : un banc qui éprouve le cas négatif verrouille des comptes réels, et
 * les groupes `GRC-*` n'existent nulle part encore.
 *
 * ── Les cinq comportements, et où chacun est écrit ──────────────────────────
 *
 *  · **D1** — liaison du compte de service en lecture, puis recherche par le filtre
 *    `LDAP_FILTRE_UTILISATEUR` avec `{login}` substitué → `traiterLiaison`, `traiterRecherche`
 *  · **D2** — liaison d'un utilisateur par son DN, succès **et** échec, l'échec
 *    rendant `InvalidCredentials` (49) → `verifierIdentifiants`
 *  · **D3** — appartenances imbriquées, **trois niveaux et un cycle** → les attributs
 *    `member` / `memberOf` construits depuis `comptes.mjs`
 *  · **D4** — compte désactivé (`userAccountControl` bit 2) et compte retiré d'un
 *    groupe, **modifiables en cours d'essai** → `desactiver`, `retirerDuGroupe`
 *  · **D5** — panne : refus de connexion, réponse lente au-delà de `LDAP_DELAI`,
 *    réponse tronquée → `definirPanne`
 *
 * ── Ce qu'il NE fait délibérément PAS, et pourquoi c'est écrit ──────────────
 *
 * Il n'implémente **pas** la règle de correspondance `1.2.840.113556.1.4.1941`
 * (`LDAP_MATCHING_RULE_IN_CHAIN`), qui ferait résoudre l'imbrication par le serveur.
 * Un client qui s'en servirait n'aurait plus besoin de descendre récursivement — et
 * le cycle de D3, qui existe pour figer un résolveur naïf, ne prouverait plus rien.
 * L'omission est donc une **décision**, pas une lacune ; si le déploiement réel
 * décide de s'appuyer sur cette règle, elle sera à ajouter ici *et* le cycle sera à
 * éprouver autrement.
 *
 * Il n'implémente ni `modify`, ni `add`, ni `delete` : le compte de service est en
 * **lecture seule** (§1.5), et un annuaire d'essai qui accepterait d'écrire
 * autoriserait un client fautif à passer.
 */

import { execFileSync } from 'node:child_process';
import { createServer as creerServeurTcp } from 'node:net';
import { createServer as creerServeurTls } from 'node:tls';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BASE_RECHERCHE, COMPTES, COMPTE_SERVICE, GROUPES, OU_GROUPES, OU_SERVICE, OU_UTILISATEURS,
  UAC_ACTIF, UAC_DESACTIVE, dnGroupe, dnUtilisateur,
} from './comptes.mjs';
import {
  ETIQUETTE, RESULTAT, chaine, encoder, ensemble, entier, enumere, lire, lireChaine,
  lireEntier, lireTous, sequence,
} from './ber.mjs';

/* =====================================================================
 *  Les entrées de l'annuaire
 * ===================================================================== */

const normaliserDn = (dn) =>
  String(dn)
    .split(',')
    .map((m) => m.trim())
    .join(',')
    .toLowerCase();

/** Construit les entrées : deux unités d'organisation, un compte de service, huit comptes, quinze groupes. */
function construireEntrees() {
  const entrees = new Map();
  const poser = (dn, attributs) => entrees.set(normaliserDn(dn), { dn, attributs });

  for (const [dn, ou] of [
    [BASE_RECHERCHE, null],
    [OU_UTILISATEURS, 'Utilisateurs'],
    [OU_GROUPES, 'Groupes'],
    [OU_SERVICE, 'Comptes de service'],
  ]) {
    poser(dn, ou === null
      ? { objectClass: ['top', 'domain', 'domainDNS'], dc: ['exemple'] }
      : { objectClass: ['top', 'organizationalUnit'], ou: [ou] });
  }

  poser(COMPTE_SERVICE.dn, {
    objectClass: ['top', 'person', 'organizationalPerson', 'user'],
    cn: ['svc-grc'],
    sAMAccountName: ['svc-grc'],
    displayName: ['Compte de service Cyber GRC'],
    userAccountControl: [String(UAC_ACTIF)],
    distinguishedName: [COMPTE_SERVICE.dn],
    memberOf: [],
  });

  for (const compte of COMPTES) {
    const dn = dnUtilisateur(compte.login);
    poser(dn, {
      objectClass: ['top', 'person', 'organizationalPerson', 'user'],
      cn: [compte.login],
      sAMAccountName: [compte.login],
      distinguishedName: [dn],
      userAccountControl: [String(UAC_ACTIF)],
      memberOf: compte.groupes.map(dnGroupe),
      ...Object.fromEntries(Object.entries(compte.profil).map(([c, v]) => [c, [v]])),
    });
  }

  for (const groupe of GROUPES) {
    const dn = dnGroupe(groupe.nom);
    poser(dn, {
      objectClass: ['top', 'group'],
      cn: [groupe.nom],
      sAMAccountName: [groupe.nom],
      distinguishedName: [dn],
      member: [],
      memberOf: groupe.membreDe.map(dnGroupe),
    });
  }

  // `member` est la réciproque de `memberOf` : un annuaire où les deux ne se
  // répondent pas laisserait passer un résolveur qui n'interroge que l'un des deux
  // sens. Elle est donc CALCULÉE, jamais recopiée.
  for (const entree of entrees.values()) {
    for (const dnGroupePere of entree.attributs.memberOf ?? []) {
      const pere = entrees.get(normaliserDn(dnGroupePere));
      if (pere !== undefined) pere.attributs.member.push(entree.dn);
    }
  }
  return entrees;
}

/* =====================================================================
 *  Les filtres LDAP
 * ===================================================================== */

/** Valeurs d'un attribut, insensible à la casse du nom (l'AD l'est). */
function valeurs(entree, nom) {
  const cle = Object.keys(entree.attributs).find((k) => k.toLowerCase() === String(nom).toLowerCase());
  return cle === undefined ? [] : entree.attributs[cle];
}

/**
 * Décode un `Filter` (RFC 4511 §4.5.1) et l'évalue.
 *
 * Les étiquettes sont contextuelles : `and [0]`, `or [1]`, `not [2]`,
 * `equalityMatch [3]`, `substrings [4]`, `present [7]`. `present` est **primitif**
 * (`0x87`) là où les autres sont construits — c'est l'erreur classique, et elle se
 * manifeste par un `(objectClass=*)` qui ne trouve jamais rien.
 */
function evaluerFiltre(element, entree) {
  switch (element.etiquette) {
    case 0xa0: // and
      return lireTous(element.contenu).every((sous) => evaluerFiltre(sous, entree));
    case 0xa1: // or
      return lireTous(element.contenu).some((sous) => evaluerFiltre(sous, entree));
    case 0xa2: // not
      return !evaluerFiltre(lireTous(element.contenu)[0], entree);
    case 0xa3: {
      // equalityMatch — AttributeValueAssertion { type, value }
      const [type, valeur] = lireTous(element.contenu);
      const attendu = lireChaine(valeur.contenu);
      const nom = lireChaine(type.contenu);
      // Les DN se comparent normalisés ; le reste, sans égard à la casse (AD).
      const estDn = ['member', 'memberof', 'distinguishedname'].includes(nom.toLowerCase());
      return valeurs(entree, nom).some((v) =>
        estDn ? normaliserDn(v) === normaliserDn(attendu) : String(v).toLowerCase() === attendu.toLowerCase(),
      );
    }
    case 0xa4: {
      // substrings — { type, substrings SEQUENCE OF CHOICE { initial[0], any[1], final[2] } }
      const [type, morceaux] = lireTous(element.contenu);
      const nom = lireChaine(type.contenu);
      const parties = lireTous(morceaux.contenu);
      return valeurs(entree, nom).some((brut) => {
        let reste = String(brut).toLowerCase();
        for (const partie of parties) {
          const texte = lireChaine(partie.contenu).toLowerCase();
          if (partie.etiquette === 0x80) {
            if (!reste.startsWith(texte)) return false;
            reste = reste.slice(texte.length);
          } else if (partie.etiquette === 0x81) {
            const rang = reste.indexOf(texte);
            if (rang === -1) return false;
            reste = reste.slice(rang + texte.length);
          } else if (partie.etiquette === 0x82) {
            if (!reste.endsWith(texte)) return false;
            reste = '';
          }
        }
        return true;
      });
    }
    case 0x87: // present — primitif
      return valeurs(entree, lireChaine(element.contenu)).length > 0;
    case 0xa9: {
      // extensibleMatch : refusé À DESSEIN (voir l'en-tête du fichier).
      const erreur = new Error('extensibleMatch non géré');
      erreur.codeLdap = RESULTAT.REFUS;
      erreur.diagnostic =
        'La règle de correspondance en chaîne (1.2.840.113556.1.4.1941) n’est pas servie par ' +
        'cet annuaire : l’imbrication doit être résolue par le client, cycle compris (§25.2, D3).';
      throw erreur;
    }
    default: {
      const erreur = new Error(`Filtre non géré : 0x${element.etiquette.toString(16)}`);
      erreur.codeLdap = RESULTAT.ERREUR_PROTOCOLE;
      throw erreur;
    }
  }
}

/** Rend le filtre en texte, pour le journal — un banc qui ne dit pas ce qu'il a reçu ne s'audite pas. */
function filtreEnTexte(element) {
  switch (element.etiquette) {
    case 0xa0: return `(&${lireTous(element.contenu).map(filtreEnTexte).join('')})`;
    case 0xa1: return `(|${lireTous(element.contenu).map(filtreEnTexte).join('')})`;
    case 0xa2: return `(!${filtreEnTexte(lireTous(element.contenu)[0])})`;
    case 0xa3: {
      const [type, valeur] = lireTous(element.contenu);
      return `(${lireChaine(type.contenu)}=${lireChaine(valeur.contenu)})`;
    }
    case 0xa4: {
      const [type, morceaux] = lireTous(element.contenu);
      const parts = lireTous(morceaux.contenu).map((p) =>
        p.etiquette === 0x80 ? `${lireChaine(p.contenu)}*`
          : p.etiquette === 0x82 ? `*${lireChaine(p.contenu)}`
            : `*${lireChaine(p.contenu)}*`);
      return `(${lireChaine(type.contenu)}=${parts.join('')})`;
    }
    case 0x87: return `(${lireChaine(element.contenu)}=*)`;
    default: return `(?0x${element.etiquette.toString(16)})`;
  }
}

/* =====================================================================
 *  Le serveur
 * ===================================================================== */

/**
 * Démarre l'annuaire simulé.
 *
 * @param {{tls?: boolean}} [options] `tls: true` monte du **LDAPS** avec un
 *   certificat auto-signé engendré à la volée — voir la réserve du §25.4 : sans
 *   lui, la vérification du certificat n'est éprouvée par rien.
 * @returns {Promise<object>} l'annuaire, ses leviers de panne, et `fermer()`
 */
export async function demarrerAnnuaire(options = {}) {
  const entrees = construireEntrees();
  const motsDePasse = new Map([
    [normaliserDn(COMPTE_SERVICE.dn), COMPTE_SERVICE.motDePasse],
    ...COMPTES.map((c) => [normaliserDn(dnUtilisateur(c.login)), c.motDePasse]),
  ]);

  /** Ce que le serveur a réellement reçu : liaisons, recherches, refus. */
  const journal = [];
  const panne = { refuserConnexions: false, delaiReponseMs: 0, tronquer: false };

  let repertoireTls = null;
  let optionsTls = null;
  if (options.tls === true) {
    repertoireTls = mkdtempSync(join(tmpdir(), 'grc-ldaps-'));
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', join(repertoireTls, 'annuaire.key'),
      '-out', join(repertoireTls, 'annuaire.crt'),
      '-days', '2', '-subj', '/CN=annuaire-simule.exemple.interne',
      '-addext', 'subjectAltName=DNS:annuaire-simule.exemple.interne,IP:127.0.0.1',
      '-addext', 'basicConstraints=critical,CA:FALSE',
    ], { stdio: 'ignore' });
    optionsTls = {
      key: readFileSync(join(repertoireTls, 'annuaire.key')),
      cert: readFileSync(join(repertoireTls, 'annuaire.crt')),
    };
  }

  /** Identités liées, par connexion : une recherche exige une liaison préalable. */
  const gererConnexion = (prise) => {
    if (panne.refuserConnexions) {
      journal.push({ operation: 'connexion', refusee: true });
      prise.destroy();
      return;
    }
    let tampon = Buffer.alloc(0);
    /** `null` = anonyme. Une recherche anonyme est refusée, comme sur un AD durci. */
    let liePar = null;
    prise.on('error', () => {});

    const repondre = (reponse) => {
      const envoyer = () => {
        if (prise.destroyed) return;
        if (panne.tronquer) {
          // Une réponse TRONQUÉE, pas une réponse absente : le client reçoit un
          // début de trame BER dont la longueur annonce plus que ce qui vient.
          // Un client qui décoderait « au mieux » ouvrirait une session sur une
          // réponse mutilée — c'est ce que D5 doit rendre observable.
          prise.write(reponse.subarray(0, Math.max(1, Math.floor(reponse.length / 2))));
          prise.destroy();
          return;
        }
        prise.write(reponse);
      };
      if (panne.delaiReponseMs > 0) setTimeout(envoyer, panne.delaiReponseMs).unref?.();
      else envoyer();
    };

    prise.on('data', (morceau) => {
      tampon = Buffer.concat([tampon, morceau]);
      for (;;) {
        let message;
        try {
          message = lire(tampon, 0);
        } catch {
          prise.destroy();
          return;
        }
        if (message === null) return; // trame incomplète : on attend la suite
        const brut = tampon.subarray(0, message.fin);
        tampon = tampon.subarray(message.fin);
        try {
          const reponse = traiter(message, () => liePar, (dn) => { liePar = dn; });
          if (reponse !== null) repondre(reponse);
        } catch (erreur) {
          journal.push({ operation: 'erreur', message: erreur.message, octets: brut.length });
          prise.destroy();
          return;
        }
      }
    });
  };

  function traiter(message, lecteurLie, poserLie) {
    const [idElement, operation] = lireTous(message.contenu);
    const id = lireEntier(idElement.contenu);

    if (operation.etiquette === ETIQUETTE.DEMANDE_DELIAISON || operation.etiquette === ETIQUETTE.DEMANDE_ABANDON) {
      journal.push({ operation: operation.etiquette === ETIQUETTE.DEMANDE_DELIAISON ? 'deliaison' : 'abandon' });
      return null;
    }
    if (operation.etiquette === ETIQUETTE.DEMANDE_LIAISON) return traiterLiaison(id, operation, poserLie);
    if (operation.etiquette === ETIQUETTE.DEMANDE_RECHERCHE) return traiterRecherche(id, operation, lecteurLie());
    if (operation.etiquette === ETIQUETTE.DEMANDE_COMPARAISON) return traiterComparaison(id, operation, lecteurLie());
    if (operation.etiquette === ETIQUETTE.DEMANDE_ETENDUE) {
      // StartTLS et consorts : refusés explicitement plutôt qu'ignorés.
      journal.push({ operation: 'etendue', refusee: true });
      return sequence(entier(id), encoder(ETIQUETTE.REPONSE_ETENDUE, Buffer.concat([
        enumere(RESULTAT.REFUS), chaine(''), chaine('Opération étendue non servie par l’annuaire simulé.'),
      ])));
    }
    const erreur = new Error(`Opération non gérée : 0x${operation.etiquette.toString(16)}`);
    erreur.codeLdap = RESULTAT.ERREUR_PROTOCOLE;
    throw erreur;
  }

  /** D1 et D2 — la liaison, avec son échec. */
  function traiterLiaison(id, operation, poserLie) {
    const elements = lireTous(operation.contenu);
    const version = lireEntier(elements[0].contenu);
    const dn = lireChaine(elements[1].contenu);
    const authentification = elements[2];

    const refuser = (code, diagnostic) => {
      journal.push({ operation: 'liaison', dn, succes: false, code, diagnostic });
      return sequence(entier(id), encoder(ETIQUETTE.REPONSE_LIAISON, Buffer.concat([
        enumere(code), chaine(''), chaine(diagnostic),
      ])));
    };

    if (version !== 3) return refuser(RESULTAT.ERREUR_PROTOCOLE, 'Seul LDAPv3 est servi.');
    if (authentification.etiquette !== 0x80) {
      return refuser(RESULTAT.REFUS, 'Seule l’authentification « simple » est servie (pas de SASL).');
    }
    const motDePasse = lireChaine(authentification.contenu);

    // ── La liaison anonyme et la liaison « non authentifiée » ────────────────
    // Un DN sans mot de passe est une LIAISON NON AUTHENTIFIÉE : la RFC 4513 §5.1.2
    // la déclare réussie, et c'est le piège historique — un client qui prend ce
    // succès pour une vérification laisse entrer n'importe qui avec un mot de passe
    // vide. L'AD la refuse ; cet annuaire aussi, et l'essai le fige.
    if (dn === '' && motDePasse === '') {
      journal.push({ operation: 'liaison', dn: '(anonyme)', succes: true });
      poserLie(null);
      return sequence(entier(id), encoder(ETIQUETTE.REPONSE_LIAISON, Buffer.concat([
        enumere(RESULTAT.SUCCES), chaine(''), chaine(''),
      ])));
    }
    if (motDePasse === '') return refuser(RESULTAT.IDENTIFIANTS_INVALIDES, 'Liaison non authentifiée refusée (RFC 4513 §5.1.2).');

    const cle = normaliserDn(dn);
    const attendu = motsDePasse.get(cle);
    if (attendu === undefined) {
      // Le message ne distingue PAS « compte inconnu » de « mot de passe faux » :
      // c'est le contrôle S12 de la grille, et un annuaire d'essai qui les
      // distinguerait apprendrait au client à s'en servir.
      return refuser(RESULTAT.IDENTIFIANTS_INVALIDES, '80090308: LdapErr: DSID-0C0903A9, comment: AcceptSecurityContext error, data 525');
    }
    if (attendu !== motDePasse) {
      return refuser(RESULTAT.IDENTIFIANTS_INVALIDES, '80090308: LdapErr: DSID-0C0903A9, comment: AcceptSecurityContext error, data 52e');
    }
    // ── D4 : le compte désactivé ─────────────────────────────────────────────
    // L'AD répond 49 avec « data 533 ». C'est un ÉCHEC DE LIAISON, pas un succès
    // suivi d'un contrôle applicatif : un client qui ne lirait le drapeau qu'après
    // coup ouvrirait une session à un compte désactivé.
    const entree = entrees.get(cle);
    if (entree !== undefined && Number(valeurs(entree, 'userAccountControl')[0] ?? UAC_ACTIF) & 0x0002) {
      return refuser(RESULTAT.IDENTIFIANTS_INVALIDES, '80090308: LdapErr: DSID-0C0903A9, comment: AcceptSecurityContext error, data 533');
    }

    journal.push({ operation: 'liaison', dn, succes: true });
    poserLie(dn);
    return sequence(entier(id), encoder(ETIQUETTE.REPONSE_LIAISON, Buffer.concat([
      enumere(RESULTAT.SUCCES), chaine(''), chaine(''),
    ])));
  }

  /** D1 et D3 — la recherche, source de l'appartenance. */
  function traiterRecherche(id, operation, liePar) {
    const elements = lireTous(operation.contenu);
    const base = lireChaine(elements[0].contenu);
    const portee = lireEntier(elements[1].contenu);
    const tailleMax = lireEntier(elements[3].contenu);
    const filtre = elements[6];
    const demandes = lireTous(elements[7].contenu).map((a) => lireChaine(a.contenu));

    const fin = (code, diagnostic = '') =>
      sequence(entier(id), encoder(ETIQUETTE.FIN_RECHERCHE, Buffer.concat([
        enumere(code), chaine(''), chaine(diagnostic),
      ])));

    // Le DSE racine : une recherche de portée « base » sur un DN vide. Un client
    // qui découvre le contexte de nommage passe par là avant tout le reste.
    if (base === '' && portee === 0) {
      journal.push({ operation: 'recherche', base: '(DSE racine)', filtre: filtreEnTexte(filtre), rendues: 1 });
      return Buffer.concat([
        entreeEnBer(id, { dn: '', attributs: { namingContexts: [BASE_RECHERCHE], supportedLDAPVersion: ['3'], vendorName: ['Annuaire simulé Cyber GRC'] } }, demandes),
        fin(RESULTAT.SUCCES),
      ]);
    }
    if (liePar === null) {
      journal.push({ operation: 'recherche', base, refusee: 'anonyme' });
      return fin(RESULTAT.DROITS_INSUFFISANTS, 'Recherche anonyme refusée : liez-vous d’abord avec le compte de service (§1.5).');
    }

    const cleBase = normaliserDn(base);
    if (!entrees.has(cleBase)) {
      journal.push({ operation: 'recherche', base, refusee: 'objet inexistant' });
      return fin(RESULTAT.OBJET_INEXISTANT, `Base de recherche inconnue : ${base}`);
    }

    const dansLaPortee = (entree) => {
      const cle = normaliserDn(entree.dn);
      if (portee === 0) return cle === cleBase;
      if (portee === 1) return cle !== cleBase && cle.endsWith(`,${cleBase}`) && cle.slice(0, -(cleBase.length + 1)).split(',').length === 1;
      return cle === cleBase || cle.endsWith(`,${cleBase}`);
    };

    const trouvees = [];
    for (const entree of entrees.values()) {
      if (!dansLaPortee(entree)) continue;
      if (!evaluerFiltre(filtre, entree)) continue;
      trouvees.push(entree);
      if (tailleMax > 0 && trouvees.length > tailleMax) {
        journal.push({ operation: 'recherche', base, filtre: filtreEnTexte(filtre), rendues: trouvees.length - 1, tailleDepassee: true });
        return Buffer.concat([
          ...trouvees.slice(0, tailleMax).map((e) => entreeEnBer(id, e, demandes)),
          fin(4, 'sizeLimitExceeded'),
        ]);
      }
    }
    journal.push({ operation: 'recherche', base, filtre: filtreEnTexte(filtre), attributs: demandes, rendues: trouvees.length });
    return Buffer.concat([...trouvees.map((e) => entreeEnBer(id, e, demandes)), fin(RESULTAT.SUCCES)]);
  }

  /**
   * `compare` — et l'annuaire ne l'avait PAS, jusqu'à ce qu'un client tiers le dise.
   *
   * ── Comment ce manque a été trouvé, parce que c'est l'argument du §25 ──────
   *
   * Le client d'essai de ce répertoire ne s'en sert pas : écrit par la même main
   * que la doublure, il n'interroge que ce qu'elle sait faire, et l'ensemble
   * restait vert. C'est le `mod_authnz_ldap` d'Apache — un client tiers, qui ne
   * partage aucune ligne avec ce dépôt — qui a envoyé une opération `0x6e` que
   * l'annuaire a refusée : **`compare` est la façon dont un client vérifie une
   * appartenance sans faire de recherche.**
   *
   * C'est exactement le défaut que le §25 anticipe en confiant l'annuaire et le
   * client à deux agents ; il s'est produit ici à l'échelle d'un seul fichier.
   *
   * `compareTrue` (6) et `compareFalse` (5) sont des RÉSULTATS, pas des erreurs :
   * un client qui traiterait tout code non nul comme un échec ne verrait jamais
   * une appartenance.
   */
  function traiterComparaison(id, operation, liePar) {
    const [dnElement, assertion] = lireTous(operation.contenu);
    const dn = lireChaine(dnElement.contenu);
    const [type, valeur] = lireTous(assertion.contenu);
    const nom = lireChaine(type.contenu);
    const attendu = lireChaine(valeur.contenu);

    const repondre = (code, diagnostic = '') =>
      sequence(entier(id), encoder(ETIQUETTE.REPONSE_COMPARAISON, Buffer.concat([
        enumere(code), chaine(''), chaine(diagnostic),
      ])));

    if (liePar === null) {
      journal.push({ operation: 'comparaison', dn, refusee: 'anonyme' });
      return repondre(RESULTAT.DROITS_INSUFFISANTS, 'Comparaison anonyme refusée.');
    }
    const entree = entrees.get(normaliserDn(dn));
    if (entree === undefined) {
      journal.push({ operation: 'comparaison', dn, refusee: 'objet inexistant' });
      return repondre(RESULTAT.OBJET_INEXISTANT, `Entrée inconnue : ${dn}`);
    }
    const estDn = ['member', 'memberof', 'distinguishedname'].includes(nom.toLowerCase());
    const vraie = valeurs(entree, nom).some((v) =>
      estDn ? normaliserDn(v) === normaliserDn(attendu) : String(v).toLowerCase() === attendu.toLowerCase());
    journal.push({ operation: 'comparaison', dn, attribut: nom, valeur: attendu, vraie });
    return repondre(vraie ? RESULTAT.COMPARAISON_VRAIE : RESULTAT.COMPARAISON_FAUSSE);
  }

  /** Une `SearchResultEntry`, filtrée sur les attributs demandés. */
  function entreeEnBer(id, entree, demandes) {
    const tout = demandes.length === 0 || demandes.includes('*');
    const aucun = demandes.length === 1 && demandes[0] === '1.1';
    const retenus = Object.entries(entree.attributs).filter(([nom, vals]) =>
      !aucun && vals.length > 0 && (tout || demandes.some((d) => d.toLowerCase() === nom.toLowerCase())));
    return sequence(
      entier(id),
      encoder(ETIQUETTE.ENTREE_RECHERCHE, Buffer.concat([
        chaine(entree.dn),
        sequence(retenus.map(([nom, vals]) => sequence(chaine(nom), ensemble(vals.map((v) => chaine(v)))))),
      ])),
    );
  }

  const serveur = optionsTls === null ? creerServeurTcp(gererConnexion) : creerServeurTls(optionsTls, gererConnexion);
  serveur.on('error', () => {});
  // ── PORT ÉPHÉMÈRE, jamais un port fixe (§25.1) ───────────────────────────
  await new Promise((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  const port = serveur.address().port;

  return {
    hote: '127.0.0.1',
    port,
    url: `${optionsTls === null ? 'ldap' : 'ldaps'}://127.0.0.1:${String(port)}`,
    tls: optionsTls !== null,
    /** Le certificat servi, quand `tls: true` — pour l'ancrer côté client. */
    certificat: optionsTls === null ? null : optionsTls.cert,
    journal,
    /** Efface le journal : un essai qui compte des opérations part d'un compteur net. */
    viderJournal() { journal.length = 0; },

    /* ── D4 : déprovisionnement, EN COURS D'ESSAI ─────────────────────────── */
    desactiver(login) {
      const entree = entrees.get(normaliserDn(dnUtilisateur(login)));
      if (entree === undefined) throw new Error(`Compte inconnu : ${login}`);
      entree.attributs.userAccountControl = [String(UAC_DESACTIVE)];
    },
    reactiver(login) {
      const entree = entrees.get(normaliserDn(dnUtilisateur(login)));
      if (entree === undefined) throw new Error(`Compte inconnu : ${login}`);
      entree.attributs.userAccountControl = [String(UAC_ACTIF)];
    },
    retirerDuGroupe(login, nomGroupe) {
      const membre = entrees.get(normaliserDn(dnUtilisateur(login)));
      const groupe = entrees.get(normaliserDn(dnGroupe(nomGroupe)));
      if (membre === undefined || groupe === undefined) throw new Error(`Retrait impossible : ${login} / ${nomGroupe}`);
      membre.attributs.memberOf = membre.attributs.memberOf.filter((d) => normaliserDn(d) !== normaliserDn(groupe.dn));
      groupe.attributs.member = groupe.attributs.member.filter((d) => normaliserDn(d) !== normaliserDn(membre.dn));
    },
    remettreDansGroupe(login, nomGroupe) {
      const membre = entrees.get(normaliserDn(dnUtilisateur(login)));
      const groupe = entrees.get(normaliserDn(dnGroupe(nomGroupe)));
      if (membre === undefined || groupe === undefined) throw new Error(`Ajout impossible : ${login} / ${nomGroupe}`);
      if (!membre.attributs.memberOf.some((d) => normaliserDn(d) === normaliserDn(groupe.dn))) {
        membre.attributs.memberOf.push(groupe.dn);
        groupe.attributs.member.push(membre.dn);
      }
    },

    /* ── D5 : la panne ────────────────────────────────────────────────────── */
    definirPanne(nouvelle) {
      Object.assign(panne, nouvelle);
    },

    async fermer() {
      await new Promise((resoudre) => serveur.close(resoudre));
      if (repertoireTls !== null) rmSync(repertoireTls, { recursive: true, force: true });
    },
  };
}
