/**
 * Filtres LDAP : échappement des valeurs (RFC 4515) et encodage BER d'un filtre
 * écrit sous forme textuelle (RFC 4511 §4.5.1).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  L'échappement d'abord, parce que c'est la partie qui protège
 * ════════════════════════════════════════════════════════════════════════
 *
 * `LDAP_FILTRE_UTILISATEUR` porte le marqueur `{login}`, et le login vient du
 * navigateur. Substituer sans échapper, c'est l'injection LDAP : le login
 * `*)(objectClass=*` transforme
 *
 *     (&(objectClass=user)(sAMAccountName={login}))
 *
 * en un filtre qui ramène **tout l'annuaire**, et la première entrée venue
 * devient l'identité de la session. C'est le pendant exact du contrôle S5 pour
 * un autre protocole, et il n'a pas de raison d'être moins strict.
 *
 * `echapperValeur` applique la règle de la RFC 4515 §3 : les cinq caractères
 * `\`, `*`, `(`, `)` et l'octet nul deviennent `\5c`, `\2a`, `\28`, `\29`,
 * `\00`. Rien d'autre n'a besoin de l'être, et échapper davantage casserait des
 * logins légitimes.
 *
 * ⚠️ **L'échappement est fait par l'appelant, avant la substitution, et ne peut
 * pas l'être ici** : ce module reçoit un filtre déjà complet. C'est pourquoi
 * `substituerLogin` existe et fait les deux d'un seul geste — un point de
 * passage unique vaut mieux qu'une règle à retenir.
 */

import { chaine, element, ETIQUETTE } from './ber.js';

/** Étiquettes contextuelles des filtres (RFC 4511 §4.5.1). */
const FILTRE = Object.freeze({
  et: 0xa0,
  ou: 0xa1,
  non: 0xa2,
  egalite: 0xa3,
  sousChaines: 0xa4,
  superieurOuEgal: 0xa5,
  inferieurOuEgal: 0xa6,
  present: 0x87,
  approximatif: 0xa8,
  initial: 0x80,
  quelconque: 0x81,
  final: 0x82,
});

/** Le filtre reçu n'est pas analysable. Programmation ou configuration, pas utilisateur. */
export class ErreurFiltreLdap extends Error {
  public readonly nomErreur = 'ErreurFiltreLdap';
  constructor(message: string) {
    super(message);
    this.name = 'ErreurFiltreLdap';
  }
}

/**
 * Échappe une valeur d'assertion (RFC 4515 §3). À appliquer à TOUTE valeur qui
 * ne vient pas de la configuration : login, nom distinctif, identifiant.
 */
export function echapperValeur(valeur: string): string {
  let sortie = '';
  for (const caractere of valeur) {
    switch (caractere) {
      case '\\':
        sortie += '\\5c';
        break;
      case '*':
        sortie += '\\2a';
        break;
      case '(':
        sortie += '\\28';
        break;
      case ')':
        sortie += '\\29';
        break;
      case '\0':
        sortie += '\\00';
        break;
      default:
        sortie += caractere;
    }
  }
  return sortie;
}

/**
 * Remplace `{login}` par le login **échappé**. Point de passage unique : c'est
 * la seule façon de fabriquer le filtre d'un utilisateur.
 */
export function substituerLogin(gabarit: string, login: string): string {
  return gabarit.split('{login}').join(echapperValeur(login));
}

/* =====================================================================
 *  Analyse d'un filtre textuel
 * ===================================================================== */

interface Curseur {
  readonly texte: string;
  position: number;
}

/** Décode les échappements `\XX` d'une valeur d'assertion. */
function decoderEchappements(brut: string): Buffer {
  const octets: number[] = [];
  let i = 0;
  while (i < brut.length) {
    const c = brut[i];
    if (c === undefined) break;
    if (c === '\\') {
      const hexa = brut.slice(i + 1, i + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(hexa)) {
        throw new ErreurFiltreLdap(`Échappement « \\${hexa} » invalide dans un filtre LDAP.`);
      }
      octets.push(Number.parseInt(hexa, 16));
      i += 3;
      continue;
    }
    for (const octet of Buffer.from(c, 'utf8')) octets.push(octet);
    i += 1;
  }
  return Buffer.from(octets);
}

function assertion(attribut: string, valeur: Buffer, etiquette: number): Buffer {
  return element(etiquette, Buffer.concat([chaine(attribut), chaine(valeur)]));
}

/** Encode `attr=a*b*c` en filtre « sous-chaînes ». */
function sousChaines(attribut: string, morceaux: readonly string[]): Buffer {
  const parties: Buffer[] = [];
  morceaux.forEach((morceau, index) => {
    if (morceau === '') return;
    const contenu = decoderEchappements(morceau);
    const etiquette =
      index === 0
        ? FILTRE.initial
        : index === morceaux.length - 1
          ? FILTRE.final
          : FILTRE.quelconque;
    parties.push(element(etiquette, contenu));
  });

  if (parties.length === 0) {
    // « attr=* » n'est pas une sous-chaîne mais un test de présence.
    return element(FILTRE.present, Buffer.from(attribut, 'utf8'));
  }
  return element(
    FILTRE.sousChaines,
    Buffer.concat([chaine(attribut), element(ETIQUETTE.sequence, Buffer.concat(parties))]),
  );
}

function analyserItem(brut: string): Buffer {
  const separateur = brut.search(/[<>~]?=/);
  if (separateur < 0) {
    throw new ErreurFiltreLdap(`Élément de filtre sans comparateur : « ${brut} ».`);
  }

  const operateur = brut[separateur];
  const estCompose = operateur === '<' || operateur === '>' || operateur === '~';
  const attribut = brut.slice(0, separateur);
  const valeur = brut.slice(separateur + (estCompose ? 2 : 1));

  if (attribut === '') throw new ErreurFiltreLdap(`Élément de filtre sans attribut : « ${brut} ».`);
  if (attribut.includes(':')) {
    // Correspondance étendue (`attr:1.2.840.113556.1.4.1941:=…`, la règle « in chain »
    // d'Active Directory). Volontairement NON gérée : la résolution des groupes imbriqués
    // est faite côté applicatif (001_socle.sql §7), ce qui marche contre tout annuaire et
    // se laisse éprouver par une doublure. Refuser bruyamment vaut mieux qu'encoder à
    // moitié une règle dont dépendrait l'autorisation.
    throw new ErreurFiltreLdap(
      `Correspondance étendue non gérée : « ${brut} ». Les groupes imbriqués sont résolus ` +
        'côté applicatif, pas par la règle « in chain » de l’annuaire.',
    );
  }

  if (!estCompose && valeur === '*') {
    return element(FILTRE.present, Buffer.from(attribut, 'utf8'));
  }

  if (!estCompose && valeur.includes('*')) {
    // Découpe sur les `*` qui ne sont pas échappés.
    const morceaux = valeur.split(/(?<!\\)\*/);
    return sousChaines(attribut, morceaux);
  }

  const contenu = decoderEchappements(valeur);
  switch (operateur) {
    case '>':
      return assertion(attribut, contenu, FILTRE.superieurOuEgal);
    case '<':
      return assertion(attribut, contenu, FILTRE.inferieurOuEgal);
    case '~':
      return assertion(attribut, contenu, FILTRE.approximatif);
    default:
      return assertion(attribut, contenu, FILTRE.egalite);
  }
}

function analyserFiltre(curseur: Curseur): Buffer {
  const { texte } = curseur;
  if (texte[curseur.position] !== '(') {
    throw new ErreurFiltreLdap(
      `Filtre LDAP mal formé : « ( » attendu en position ${curseur.position}.`,
    );
  }
  curseur.position += 1;

  const tete = texte[curseur.position];
  if (tete === '&' || tete === '|' || tete === '!') {
    curseur.position += 1;
    const enfants: Buffer[] = [];
    while (texte[curseur.position] === '(') enfants.push(analyserFiltre(curseur));

    if (texte[curseur.position] !== ')') {
      throw new ErreurFiltreLdap('Filtre LDAP mal formé : « ) » manquante.');
    }
    curseur.position += 1;

    if (enfants.length === 0) {
      throw new ErreurFiltreLdap(`Filtre LDAP mal formé : « ${tete} » sans opérande.`);
    }
    if (tete === '!' && enfants.length !== 1) {
      throw new ErreurFiltreLdap('Filtre LDAP mal formé : « ! » prend exactement un opérande.');
    }
    const etiquette = tete === '&' ? FILTRE.et : tete === '|' ? FILTRE.ou : FILTRE.non;
    return element(etiquette, Buffer.concat(enfants));
  }

  const fin = texte.indexOf(')', curseur.position);
  if (fin < 0) throw new ErreurFiltreLdap('Filtre LDAP mal formé : « ) » manquante.');
  const item = texte.slice(curseur.position, fin);
  curseur.position = fin + 1;
  return analyserItem(item);
}

/**
 * Encode un filtre textuel en BER.
 *
 * ⚠️ Le filtre passé ici est **déjà substitué et déjà échappé** : ce module ne
 * peut plus distinguer ce qui vient de la configuration de ce qui vient du
 * réseau. C'est `substituerLogin` qui tient la propriété, en amont.
 */
export function encoderFiltre(texte: string): Buffer {
  const curseur: Curseur = { texte: texte.trim(), position: 0 };
  if (curseur.texte === '') throw new ErreurFiltreLdap('Filtre LDAP vide.');
  const encode = analyserFiltre(curseur);
  if (curseur.position !== curseur.texte.length) {
    throw new ErreurFiltreLdap(
      `Filtre LDAP mal formé : ${curseur.texte.length - curseur.position} caractère(s) après la ` +
        'parenthèse fermante.',
    );
  }
  return encode;
}

/** Filtre d'égalité simple, valeur échappée. Employé pour `(member=<dn>)`. */
export function filtreEgalite(attribut: string, valeur: string): string {
  return `(${attribut}=${echapperValeur(valeur)})`;
}
