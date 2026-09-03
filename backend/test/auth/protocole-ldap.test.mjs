/**
 * protocole-ldap.test.mjs — l'encodage BER et les filtres, éprouvés au niveau des octets.
 *
 * ── Pourquoi cette couche est écrite à la main, et donc éprouvée ici ─────────
 *
 * Aucun client LDAP n'est déclaré dans `package.json`, qui est réservé à
 * l'orchestrateur (`CONVENTIONS.md` §28). `src/auth/ber.ts` et
 * `src/auth/filtre-ldap.ts` parlent donc le protocole directement. Une couche écrite
 * à la main sans banc au niveau des octets est une couche dont on découvre les
 * défauts contre un annuaire réel, un vendredi.
 *
 * ── Ce qui compte le plus ici : l'injection LDAP ─────────────────────────────
 *
 * `LDAP_FILTRE_UTILISATEUR` porte `{login}`, et le login vient du navigateur.
 * Substituer sans échapper transforme
 *
 *     (&(objectClass=user)(sAMAccountName={login}))
 *
 * en un filtre qui ramène tout l'annuaire, et la première entrée venue devient
 * l'identité de la session. C'est le contrôle **S5** pour un autre protocole, et il
 * est éprouvé **dans les deux sens** : le login normal produit une assertion
 * d'égalité sur sa valeur ; le login hostile en produit une aussi, sur une valeur qui
 * contient les parenthèses au lieu de les ouvrir.
 *
 * L'assertion ne porte pas sur le texte du filtre — un filtre échappé « a l'air »
 * correct — mais sur **l'arbre BER produit** : combien de nœuds, de quel type, et
 * quelle valeur exacte. C'est la seule façon de distinguer « échappé » de
 * « ressemble à échappé ».
 */

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import { moduleCompile } from '../aide/serveur.mjs';

let ber;
let filtre;

before(async () => {
  ber = await moduleCompile('auth/ber.js');
  filtre = await moduleCompile('auth/filtre-ldap.js');
});

/** Décompose un élément BER en arbre lisible, pour assertions structurelles. */
function arbre(tampon, position = 0) {
  const element = ber.lireElement(tampon, position);
  if (element === null) return null;
  const construit = (element.etiquette & 0x20) !== 0;
  return {
    etiquette: element.etiquette,
    ...(construit
      ? { enfants: ber.lireEnfants(element.contenu).map((e) => arbre(tampon.subarray(0, 0).length === 0 ? e.contenu : e.contenu)) }
      : { valeur: element.contenu.toString('utf8') }),
  };
}

/** Enfants directs d'un élément construit, avec leur étiquette et leur texte. */
function enfantsDe(tampon) {
  const element = ber.lireElement(tampon, 0);
  return ber.lireEnfants(element.contenu).map((e) => ({
    etiquette: e.etiquette,
    texte: e.contenu.toString('utf8'),
    contenu: e.contenu,
  }));
}

describe('BER — l’encodage rend ce qu’il a reçu', () => {
  test('un entier fait l’aller-retour, y compris aux bornes de signe', () => {
    for (const valeur of [0, 1, 127, 128, 255, 256, 65_535, 1_000_000, -1, -128, -129]) {
      const encode = ber.entier(valeur);
      const relu = ber.lireElement(encode, 0);
      assert.equal(relu.etiquette, ber.ETIQUETTE.entier);
      assert.equal(ber.valeurEntiere(relu), valeur, `entier ${String(valeur)}`);
    }
  });

  test('une chaîne UTF-8 fait l’aller-retour, accents compris', () => {
    const texte = 'CN=Délégué à la protection,OU=Comptes,DC=exemple,DC=interne';
    const relu = ber.lireElement(ber.chaine(texte), 0);
    assert.equal(ber.valeurTexte(relu), texte);
  });

  test('la LONGUEUR LONGUE est encodée et relue — au-delà de 127 octets', () => {
    // La frontière où l'encodage change de forme. C'est le défaut classique d'un
    // encodeur écrit à la main : il marche sur les petits messages.
    for (const taille of [126, 127, 128, 129, 255, 256, 4096, 70_000]) {
      const contenu = 'x'.repeat(taille);
      const relu = ber.lireElement(ber.chaine(contenu), 0);
      assert.equal(relu.contenu.length, taille, `taille ${String(taille)}`);
      assert.equal(ber.valeurTexte(relu), contenu);
    }
  });

  test('une séquence rend ses enfants dans l’ordre', () => {
    const message = ber.sequence(ber.entier(42), ber.chaine('bonjour'), ber.booleen(true));
    const enfants = enfantsDe(message);
    assert.equal(enfants.length, 3);
    assert.equal(ber.valeurEntiere(ber.lireElement(ber.entier(42), 0)), 42);
    assert.equal(enfants[1].texte, 'bonjour');
  });
});

describe('BER — un message incomplet n’est pas une erreur, un message faux en est une', () => {
  test('un tampon TRONQUÉ rend « null » : c’est un paquet TCP, pas une panne', () => {
    // La distinction qui décide de tout : confondre les deux ferait d'un message
    // coupé en deux paquets une panne d'annuaire.
    const complet = ber.sequence(ber.entier(1), ber.chaine('x'.repeat(300)));
    for (const coupure of [1, 2, 3, 10, complet.length - 1]) {
      assert.equal(
        ber.lireElement(complet.subarray(0, coupure), 0),
        null,
        `coupure à ${String(coupure)} octets`,
      );
    }
    assert.notEqual(ber.lireElement(complet, 0), null, 'Le message complet, lui, se lit.');
  });

  test('la longueur INDÉFINIE est refusée — LDAP v3 l’interdit', () => {
    const hostile = Buffer.from([0x30, 0x80, 0x02, 0x01, 0x01, 0x00, 0x00]);
    assert.throws(() => ber.lireElement(hostile, 0), /indéfinie/);
  });

  test('une étiquette sur plusieurs octets est refusée, pas devinée', () => {
    const hostile = Buffer.from([0x1f, 0x81, 0x00, 0x01, 0x00]);
    assert.throws(() => ber.lireElement(hostile, 0), /plusieurs octets/);
  });

  test('une longueur démesurée est refusée avant d’allouer quoi que ce soit', () => {
    const hostile = Buffer.from([0x04, 0x88, 1, 1, 1, 1, 1, 1, 1, 1]);
    assert.throws(() => ber.lireElement(hostile, 0), /octets : refusée/);
  });

  test('un élément construit dont un enfant est tronqué lève, il ne rend pas la moitié', () => {
    const mutile = Buffer.from([0x30, 0x06, 0x02, 0x01, 0x01, 0x04, 0x05, 0x41]);
    const element = ber.lireElement(mutile, 0);
    assert.notEqual(element, null, 'L’enveloppe, elle, est complète.');
    assert.throws(() => ber.lireEnfants(element.contenu), /tronqué/);
  });
});

describe('Filtres — l’échappement RFC 4515, éprouvé dans les deux sens', () => {
  test('un login ordinaire traverse sans être modifié', () => {
    assert.equal(filtre.echapperValeur('rssi.tls'), 'rssi.tls');
    assert.equal(
      filtre.substituerLogin('(&(objectClass=user)(sAMAccountName={login}))', 'rssi.tls'),
      '(&(objectClass=user)(sAMAccountName=rssi.tls))',
    );
  });

  test('les cinq caractères de la RFC 4515 sont échappés, et eux seuls', () => {
    assert.equal(filtre.echapperValeur('a*b'), 'a\\2ab');
    assert.equal(filtre.echapperValeur('a(b'), 'a\\28b');
    assert.equal(filtre.echapperValeur('a)b'), 'a\\29b');
    assert.equal(filtre.echapperValeur('a\\b'), 'a\\5cb');
    assert.equal(filtre.echapperValeur('a\0b'), 'a\\00b');
    // Ce qui n'a PAS à l'être : échapper davantage casserait des logins légitimes.
    assert.equal(filtre.echapperValeur('marie-josé.o’brien@exemple'), 'marie-josé.o’brien@exemple');
  });

  test('INJECTION : le login hostile ne fabrique pas un second terme de filtre', () => {
    const gabarit = '(&(objectClass=user)(sAMAccountName={login}))';
    const hostile = '*)(objectClass=*';
    const produit = filtre.substituerLogin(gabarit, hostile);

    // L'assertion ne porte pas sur le texte mais sur l'ARBRE : un « et » à DEUX
    // opérandes, dont le second est une égalité dont la valeur contient les
    // parenthèses. Trois opérandes, ou un « présent », signeraient l'injection.
    const encode = filtre.encoderFiltre(produit);
    const enfants = enfantsDe(encode);
    assert.equal(enfants.length, 2, 'Le « et » doit garder exactement deux opérandes.');

    const second = ber.lireEnfants(ber.lireElement(encode, 0).contenu)[1];
    assert.equal(second.etiquette, 0xa3, 'Une égalité, pas un test de présence.');
    const [attribut, valeur] = ber.lireEnfants(second.contenu);
    assert.equal(ber.valeurTexte(attribut), 'sAMAccountName');
    assert.equal(
      ber.valeurTexte(valeur),
      hostile,
      'La valeur cherchée est le login hostile PRIS AU PIED DE LA LETTRE : aucun compte ' +
        'ne s’appelle ainsi, la recherche ne rend rien, et c’est le comportement voulu.',
    );
  });

  test('MUTATION : sans échappement, le même login produit bien un filtre élargi', () => {
    // La contre-épreuve. Un essai qui ne montre que le bon comportement ne démontre
    // pas que l'échappement sert à quelque chose : voici ce qui se passerait sans lui.
    const sansEchappement = '(&(objectClass=user)(sAMAccountName=*)(objectClass=*))';
    const enfants = enfantsDe(filtre.encoderFiltre(sansEchappement));
    assert.equal(enfants.length, 3, 'Trois opérandes : c’est exactement l’injection évitée.');
    assert.equal(enfants[1].etiquette, 0x87, 'Un test de PRÉSENCE : « tout compte ».');
  });

  test('les formes du filtre sont encodées avec les bonnes étiquettes', () => {
    const etiquetteDe = (texte) => ber.lireElement(filtre.encoderFiltre(texte), 0).etiquette;
    assert.equal(etiquetteDe('(cn=x)'), 0xa3, 'égalité');
    assert.equal(etiquetteDe('(cn=*)'), 0x87, 'présence');
    assert.equal(etiquetteDe('(cn=a*b)'), 0xa4, 'sous-chaînes');
    assert.equal(etiquetteDe('(&(a=1)(b=2))'), 0xa0, 'et');
    assert.equal(etiquetteDe('(|(a=1)(b=2))'), 0xa1, 'ou');
    assert.equal(etiquetteDe('(!(a=1))'), 0xa2, 'non');
    assert.equal(etiquetteDe('(n>=3)'), 0xa5, 'supérieur ou égal');
    assert.equal(etiquetteDe('(n<=3)'), 0xa6, 'inférieur ou égal');
  });

  test('les échappements hexadécimaux sont DÉCODÉS vers les octets d’origine', () => {
    const encode = filtre.encoderFiltre('(cn=a\\2ab)');
    const [, valeur] = ber.lireEnfants(ber.lireElement(encode, 0).contenu);
    assert.equal(ber.valeurTexte(valeur), 'a*b', 'L’astérisque redevient une donnée, pas un joker.');
  });

  test('un filtre mal formé est REFUSÉ, jamais interprété au mieux', () => {
    for (const mauvais of ['', 'cn=x', '(cn=x', '(&)', '(!(a=1)(b=2))', '(cn=x))', '(=x)']) {
      assert.throws(
        () => filtre.encoderFiltre(mauvais),
        /Filtre LDAP|Élément de filtre/,
        `« ${mauvais} » devrait être refusé`,
      );
    }
  });

  test('la correspondance étendue d’Active Directory est refusée EXPRESSÉMENT', () => {
    // La règle « in chain » résoudrait les groupes imbriqués côté annuaire. Elle
    // n'est pas gérée, et le refus le dit : encoder à moitié une règle dont dépend
    // l'autorisation serait pire que ne pas la gérer.
    assert.throws(
      () => filtre.encoderFiltre('(memberOf:1.2.840.113556.1.4.1941:=CN=g,DC=x)'),
      /Correspondance étendue non gérée/,
    );
  });

  test('un nom distinctif employé dans un filtre est échappé', () => {
    const produit = filtre.filtreEgalite('member', 'CN=Groupe (test),OU=x');
    assert.equal(produit, '(member=CN=Groupe \\28test\\29,OU=x)');
    const [, valeur] = ber.lireEnfants(ber.lireElement(filtre.encoderFiltre(produit), 0).contenu);
    assert.equal(ber.valeurTexte(valeur), 'CN=Groupe (test),OU=x');
  });
});

// `arbre` n'est pas employé par les assertions ci-dessus ; il reste à disposition
// pour un diagnostic manuel. Node ne s'en plaint pas, mais le dire évite la question.
void arbre;
