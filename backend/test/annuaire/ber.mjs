/**
 * ber.mjs — l'encodage ASN.1/BER que parle LDAP, réduit à ce que le protocole emploie.
 *
 * ── Pourquoi ce fichier existe, plutôt qu'une dépendance ────────────────────
 *
 * `backend/package.json` est réservé à l'orchestrateur (`PLAN_EXECUTION` §2) et ne
 * porte aujourd'hui ni client ni serveur LDAP. Le contrat de l'annuaire simulé
 * (`CONVENTIONS.md` §25.1) exige pourtant un **vrai serveur LDAP en processus** :
 * une doublure qui parlerait un dialecte inventé ne prouverait rien du client que
 * l'agent A1 écrit, et le jour où ce client viserait un contrôleur de domaine, la
 * première trame le dirait.
 *
 * On implémente donc le sous-ensemble de BER que la RFC 4511 emploie. Il est
 * petit — sept formes — et il est **vérifiable** : les essais d'`annuaire.test.mjs`
 * confrontent cet encodeur à un client LDAP tiers (le `mod_authnz_ldap` d'Apache),
 * qui n'a pas été écrit ici et ne partage aucune erreur avec lui.
 *
 * ── Les règles, et les deux qui se trompent toutes seules ───────────────────
 *
 *  · **Longueur** : < 128 sur un octet ; sinon `0x80 | n` puis les `n` octets de
 *    poids fort en tête. Une longueur écrite sur un octet de trop est acceptée par
 *    beaucoup de décodeurs et refusée par OpenLDAP — on écrit donc la forme
 *    minimale.
 *  · **Entier** : complément à deux, **minimal**. `0x00 0x80` et non `0x80` pour
 *    128 : sans l'octet de tête, la valeur est négative. C'est l'erreur classique,
 *    et elle ne se voit que sur les identifiants de message > 127, c'est-à-dire
 *    après cent vingt-huit requêtes — jamais dans un essai court.
 */

/* =====================================================================
 *  Étiquettes
 * ===================================================================== */

/** Classes et formes, telles que la RFC 4511 les emploie. */
export const ETIQUETTE = Object.freeze({
  BOOLEEN: 0x01,
  ENTIER: 0x02,
  CHAINE: 0x04,
  NUL: 0x05,
  ENUMERE: 0x0a,
  SEQUENCE: 0x30,
  ENSEMBLE: 0x31,

  // [APPLICATION n] — classe 0x40, constructed 0x20.
  DEMANDE_LIAISON: 0x60, //  [0] bindRequest
  REPONSE_LIAISON: 0x61, //  [1] bindResponse
  DEMANDE_DELIAISON: 0x42, // [2] unbindRequest (primitif : NULL)
  DEMANDE_RECHERCHE: 0x63, // [3] searchRequest
  ENTREE_RECHERCHE: 0x64, //  [4] searchResultEntry
  FIN_RECHERCHE: 0x65, //     [5] searchResultDone
  DEMANDE_COMPARAISON: 0x6e, // [14] compareRequest
  REPONSE_COMPARAISON: 0x6f, // [15] compareResponse
  DEMANDE_ABANDON: 0x50, //   [16] abandonRequest (primitif)
  DEMANDE_ETENDUE: 0x77, //   [23] extendedRequest
  REPONSE_ETENDUE: 0x78, //   [24] extendedResponse
});

/** Codes de résultat LDAP employés ici (RFC 4511 §4.1.9). */
export const RESULTAT = Object.freeze({
  SUCCES: 0,
  ERREUR_PROTOCOLE: 2,
  COMPARAISON_FAUSSE: 5, // compareFalse — un résultat, pas une erreur
  COMPARAISON_VRAIE: 6, //  compareTrue
  OBJET_INEXISTANT: 32,
  IDENTIFIANTS_INVALIDES: 49, // InvalidCredentials — l'échec de D2
  DROITS_INSUFFISANTS: 50,
  REFUS: 53, // unwillingToPerform : le compte désactivé de D4
  AUTRE: 80,
});

/* =====================================================================
 *  Encodage
 * ===================================================================== */

/** Longueur BER, forme minimale. */
function encoderLongueur(n) {
  if (n < 0x80) return Buffer.from([n]);
  const octets = [];
  let reste = n;
  while (reste > 0) {
    octets.unshift(reste & 0xff);
    reste = Math.floor(reste / 256);
  }
  return Buffer.from([0x80 | octets.length, ...octets]);
}

/** Un élément BER : étiquette, longueur, contenu. */
export function encoder(etiquette, contenu) {
  const corps = Buffer.isBuffer(contenu) ? contenu : Buffer.from(contenu);
  return Buffer.concat([Buffer.from([etiquette]), encoderLongueur(corps.length), corps]);
}

/**
 * Entier en complément à deux, **minimal**.
 *
 * L'octet de tête nul n'est pas une précaution : sans lui, 128 se lit −128.
 */
export function entier(valeur, etiquette = ETIQUETTE.ENTIER) {
  let n = Math.trunc(valeur);
  const octets = [];
  if (n === 0) octets.push(0);
  const negatif = n < 0;
  while (n !== 0 && n !== -1) {
    octets.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  if (!negatif && octets.length > 0 && (octets[0] & 0x80) !== 0) octets.unshift(0x00);
  if (negatif && (octets.length === 0 || (octets[0] & 0x80) === 0)) octets.unshift(0xff);
  return encoder(etiquette, Buffer.from(octets));
}

export function enumere(valeur) {
  return entier(valeur, ETIQUETTE.ENUMERE);
}

export function chaine(texte, etiquette = ETIQUETTE.CHAINE) {
  return encoder(etiquette, Buffer.from(String(texte), 'utf8'));
}

export function booleen(valeur) {
  return encoder(ETIQUETTE.BOOLEEN, Buffer.from([valeur ? 0xff : 0x00]));
}

export function sequence(...elements) {
  return encoder(ETIQUETTE.SEQUENCE, Buffer.concat(elements.flat()));
}

export function ensemble(...elements) {
  return encoder(ETIQUETTE.ENSEMBLE, Buffer.concat(elements.flat()));
}

/* =====================================================================
 *  Décodage
 * ===================================================================== */

/**
 * Lit un élément BER à `decalage`.
 *
 * Rend `null` — jamais une exception — quand le tampon est **incomplet** : c'est
 * l'état ordinaire d'une lecture TCP, et le distinguer d'une trame fautive est
 * toute la différence entre un serveur qui attend la suite et un serveur qui
 * ferme la connexion au milieu d'un message.
 */
export function lire(tampon, decalage = 0) {
  if (decalage + 2 > tampon.length) return null;
  const etiquette = tampon[decalage];
  const premier = tampon[decalage + 1];
  let longueur;
  let debut;
  if ((premier & 0x80) === 0) {
    longueur = premier;
    debut = decalage + 2;
  } else {
    const nombre = premier & 0x7f;
    if (nombre === 0 || nombre > 4) throw new Error(`Longueur BER non gérée (${String(nombre)} octets)`);
    if (decalage + 2 + nombre > tampon.length) return null;
    longueur = 0;
    for (let i = 0; i < nombre; i += 1) longueur = longueur * 256 + tampon[decalage + 2 + i];
    debut = decalage + 2 + nombre;
  }
  if (debut + longueur > tampon.length) return null;
  return { etiquette, contenu: tampon.subarray(debut, debut + longueur), fin: debut + longueur };
}

/** Tous les éléments d'un contenu constructed, dans l'ordre. */
export function lireTous(tampon) {
  const elements = [];
  let decalage = 0;
  while (decalage < tampon.length) {
    const element = lire(tampon, decalage);
    if (element === null) throw new Error('Contenu BER tronqué');
    elements.push(element);
    decalage = element.fin;
  }
  return elements;
}

/** Entier non signé (les identifiants de message et les codes de résultat le sont). */
export function lireEntier(contenu) {
  let valeur = 0;
  for (const octet of contenu) valeur = valeur * 256 + octet;
  return valeur;
}

export function lireChaine(contenu) {
  return contenu.toString('utf8');
}
