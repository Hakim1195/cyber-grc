/**
 * trois-axes.test.mjs — le banc qui exerce périmètre × profil × niveau.
 *
 * ── Ce qu'il éprouve, et pourquoi dans les DEUX sens ────────────────────────
 *
 * Le `PLAN_EXECUTION` §3 en fait le second livrable du rôle OUTILLAGE, avec son
 * critère : *« Chaque profil du `PLAN_SERVEUR` §3.2 est exercé sur ses domaines **et
 * sur ceux qu'il ne doit pas voir**. »* C'est le `CONVENTIONS.md` §20.2 : un banc
 * qui n'éprouve que des accès autorisés ne démontre pas une autorisation, il
 * démontre qu'un chemin existe.
 *
 * Chaque compte est donc jugé sur **les trente domaines**, pas sur les siens : ceux
 * qu'il doit voir, avec le niveau attendu, et ceux qu'il ne doit pas voir, un par un.
 *
 * ── Par où passe la mesure ──────────────────────────────────────────────────
 *
 * Les groupes ne sont **pas lus dans le jeu de données** : ils sont obtenus par le
 * vrai chemin LDAP — liaison du compte de service, recherche par
 * `LDAP_FILTRE_UTILISATEUR`, **résolution récursive** de l'imbrication — puis passés
 * à la dérivation. Un banc qui confronterait le jeu de données à lui-même resterait
 * vert quelle que soit la doublure.
 *
 * ── Ce qui reste à brancher, et qui n'est pas caché ─────────────────────────
 *
 * La dérivation appliquée ici est celle de `comptes.mjs`, qui est la **référence
 * exécutable** du contrat — pas l'implémentation du produit, qui est écrite par
 * l'agent A1 dans `backend/src/droits/**` et n'existe pas à cette révision. Le
 * dernier essai du fichier tient ce fil : il **cherche** l'implémentation d'A1, la
 * confronte à la même matrice si elle est là, et dit ce qu'il attend si elle n'y est
 * pas encore. Il ne passe pas en silence.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { RACINE_BACKEND } from '../aide/serveur.mjs';
import {
  ATTENDU, BASE_RECHERCHE, COMPTES, COMPTE_SERVICE, DOMAINES, FILIALES, GROUPE_PAR_NOM,
  PROFILS, deriverDepuisGroupes, dnGroupe, dnUtilisateur, resoudreGroupes,
} from './comptes.mjs';
import { connecter, resoudreGroupesRecursivement } from './client-ldap.mjs';
import { demarrerAnnuaire } from './serveur-ldap.mjs';

let annuaire;
let service;

before(async () => {
  annuaire = await demarrerAnnuaire();
  service = await connecter({ url: annuaire.url, delaiMs: 4000 });
  await service.lier(COMPTE_SERVICE.dn, COMPTE_SERVICE.motDePasse);
});

after(async () => {
  await service?.fermer();
  await annuaire?.fermer();
});

/**
 * Le chemin complet : filtre → DN → groupes imbriqués → trois axes.
 * C'est ce que le serveur fera à chaque connexion (`PLAN_SERVEUR` §1.5).
 */
async function droitsParLAnnuaire(login) {
  const trouves = await service.rechercher({
    base: BASE_RECHERCHE, portee: 2,
    filtre: `(&(objectClass=user)(sAMAccountName=${login}))`,
    attributs: ['distinguishedName', 'memberOf'],
  });
  assert.equal(trouves.length, 1, `Le filtre doit rendre exactement un compte pour « ${login} ».`);
  const dn = trouves[0].dn;
  const dnsGroupes = await resoudreGroupesRecursivement(service, dn, { base: BASE_RECHERCHE });
  // Du DN au nom : c'est le `cn`, et il est lu dans l'annuaire, pas déduit du DN.
  const noms = [];
  for (const dnGroupeLu of dnsGroupes) {
    const [entree] = await service.rechercher({ base: dnGroupeLu, portee: 0, filtre: '(objectClass=*)', attributs: ['cn'] });
    noms.push(entree.attributs.cn[0]);
  }
  return { dn, groupes: noms.sort(), droits: deriverDepuisGroupes(noms, login) };
}

/* =====================================================================
 *  La liste des domaines n'est pas une liste écrite à la main impunie
 * ===================================================================== */

describe('Le vocabulaire des domaines vient du schéma, pas d’une recopie (§19.5)', () => {
  test('LES TRENTE DOMAINES du banc sont EXACTEMENT ceux du domaine `domaine_fonctionnel`', async () => {
    // `CONVENTIONS.md` §19.5 : une liste écrite à la main n'est admise que si un
    // garde-fou vérifie qu'elle est complète. Le sien, le voici — et il lit la
    // migration, pas un résumé.
    const sql = readFileSync(join(RACINE_BACKEND, 'db', 'migrations', '001_socle.sql'), 'utf8');
    const debut = sql.indexOf('create domain domaine_fonctionnel');
    assert.notEqual(debut, -1, 'Le domaine `domaine_fonctionnel` a disparu de 001_socle.sql : ce banc n’a plus de référence.');
    const bloc = sql.slice(debut, sql.indexOf('));', debut));
    const duSchema = [...bloc.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    assert.ok(duSchema.length >= 25, `Seulement ${String(duSchema.length)} domaine(s) lus : le motif ne reconnaît plus la migration.`);
    assert.deepEqual(
      [...DOMAINES].sort(),
      duSchema,
      'La liste de `comptes.mjs` a divergé du schéma. Un domaine ajouté en base et oublié ici ' +
      'échapperait à la moitié « ce que ce profil ne doit pas voir » — et personne ne le verrait.',
    );
  });

  test('LES HUIT PROFILS du §3.2 sont couverts, et leurs codes sont ceux du schéma', async () => {
    assert.equal(Object.keys(PROFILS).length, 8, 'Le PLAN_SERVEUR §3.2 en nomme huit.');
    for (const code of Object.keys(PROFILS)) {
      // `ck_profils_code` : ^[A-Z0-9_]{2,20}$ — c'est aussi le suffixe du groupe AD.
      assert.match(code, /^[A-Z0-9_]{2,20}$/, `Le code « ${code} » ne passerait pas ck_profils_code.`);
      const domaines = Object.keys(PROFILS[code].domaines);
      assert.ok(domaines.length > 0, `Le profil ${code} n’ouvre aucun domaine.`);
      for (const domaine of domaines) {
        assert.ok(DOMAINES.includes(domaine), `Le profil ${code} nomme un domaine inconnu : ${domaine}`);
      }
    }
  });

  test('LA CONVENTION DE NOMMAGE AD du §3.4 est tenue par tous les groupes', async () => {
    for (const groupe of Object.values(GROUPE_PAR_NOM)) {
      if (groupe.perimetre === 'filiale') {
        assert.equal(groupe.nom, `GRC-${groupe.filiale}-${groupe.profil}`, 'GRC-<FILIALE>-<PROFIL> (§3.4).');
        assert.ok(FILIALES.includes(groupe.filiale), `Filiale inconnue : ${groupe.filiale}`);
      } else if (groupe.perimetre === 'groupe') {
        assert.equal(groupe.nom, `GRC-GROUPE-${groupe.profil}`, 'GRC-GROUPE-<PROFIL> (§3.4).');
      } else if (groupe.perimetre === 'transversal') {
        assert.ok(['GRC-EXPORT', 'GRC-ADMIN'].includes(groupe.nom), `Groupe transversal inattendu : ${groupe.nom}`);
        // `ck_groupes_ad_coherence` : un transversal ne porte ni filiale ni profil.
        assert.equal(groupe.filiale, null);
        assert.equal(groupe.profil, null);
        assert.ok(groupe.export === true || groupe.admin === true);
      }
    }
  });
});

/* =====================================================================
 *  Les trois axes, compte par compte, dans les deux sens
 * ===================================================================== */

describe('Les trois axes, exercés sur les domaines de chaque profil ET sur les autres (§20.2)', () => {
  for (const compte of COMPTES) {
    const attendu = ATTENDU[compte.login];

    test(`${compte.login} — ${compte.eprouve}`, async () => {
      const { groupes, droits } = await droitsParLAnnuaire(compte.login);

      // ── Le chemin LDAP a bien rendu ce que le jeu de données annonce ───────
      assert.deepEqual(
        groupes, resoudreGroupes(compte.login),
        'Les groupes lus dans l’annuaire diffèrent de ceux du contrat : c’est la doublure ' +
        'ou la résolution récursive qui a bougé, et tout ce qui suit mesurerait autre chose.',
      );

      // ── AXE 1 : le périmètre ───────────────────────────────────────────────
      assert.equal(droits.perimetre, attendu.perimetre, `Périmètre de ${compte.login}.`);
      assert.deepEqual(droits.filiales, attendu.filiales, `Filiales de ${compte.login}.`);

      // ── AXE 2 : le profil ──────────────────────────────────────────────────
      assert.deepEqual(droits.profils, attendu.profils, `Profils de ${compte.login}.`);

      // ── AXE 3 : le niveau, domaine par domaine — LES TRENTE ───────────────
      // On ne juge pas « les domaines qu'il a » : on juge les trente. C'est la
      // seule forme qui voie un domaine ouvert par erreur.
      const vus = [];
      const fuites = [];
      for (const domaine of DOMAINES) {
        const obtenu = droits.domaines[domaine] ?? 'aucun';
        const espere = attendu.domaines[domaine] ?? 'aucun';
        if (espere === 'aucun' && obtenu !== 'aucun') fuites.push(`${domaine} : ouvert en « ${obtenu} » alors qu’il doit être fermé`);
        else if (espere !== 'aucun' && obtenu !== espere) vus.push(`${domaine} : « ${obtenu} » au lieu de « ${espere} »`);
      }
      assert.deepEqual(fuites, [], `${compte.login} VOIT ce qu’il ne doit pas voir :\n  · ${fuites.join('\n  · ')}`);
      assert.deepEqual(vus, [], `${compte.login} n’a pas le niveau attendu :\n  · ${vus.join('\n  · ')}`);

      // Et la moitié qui compte : la liste des interdits n'est pas vide, sauf pour
      // un compte qui aurait tout — auquel cas l'essai le dirait.
      assert.deepEqual(droits.domainesInterdits, attendu.domainesInterdits, `Domaines fermés de ${compte.login}.`);

      // ── Les deux droits transversaux ──────────────────────────────────────
      assert.equal(droits.export, attendu.export, 'Le droit d’export est distinct de la lecture (§3.3).');
      assert.equal(droits.administrationGroupe, attendu.administrationGroupe, 'Le drapeau d’administration Groupe.');
    });
  }
});

/* =====================================================================
 *  Ce que le §25.3 dit de chaque compte, vérifié nommément
 * ===================================================================== */

describe('Ce que chaque compte du §25.3 est censé éprouver, il l’éprouve', () => {
  test('`qualite.tls` NE VOIT PAS la cartographie — ni les risques, ni les actifs', async () => {
    const { droits } = await droitsParLAnnuaire('qualite.tls');
    for (const ferme of ['cartographie', 'risques', 'actifs', 'personnel', 'crise']) {
      assert.equal(droits.domaines[ferme] ?? 'aucun', 'aucun', `Le profil Qualité ne doit pas voir « ${ferme} » (§25.3).`);
    }
    // …et il voit bien ce qui est le sien : sans cette moitié, « ne voit pas » serait
    // vrai d'un profil vide.
    for (const ouvert of ['audits', 'documents', 'revues', 'exigences']) {
      assert.notEqual(droits.domaines[ouvert] ?? 'aucun', 'aucun', `Le profil Qualité doit voir « ${ouvert} ».`);
    }
  });

  test('`direction` : Groupe EN LECTURE, et aucune écriture NULLE PART', async () => {
    const { droits } = await droitsParLAnnuaire('direction');
    assert.equal(droits.perimetre, 'groupe');
    assert.deepEqual(droits.filiales, [...FILIALES]);
    assert.equal(droits.lectureSeule, true);
    const ecritures = Object.entries(droits.domaines).filter(([, n]) => n !== 'lecture');
    assert.deepEqual(ecritures, [], `La Direction ne doit écrire nulle part. Vu : ${JSON.stringify(ecritures)}`);
    assert.ok(Object.keys(droits.domaines).length >= 4, 'Et elle doit voir quelque chose : sinon « lecture seule » ne vaut rien.');
  });

  test('`rssi.groupe` : plusieurs filiales ET le droit d’export — les deux, pas l’un', async () => {
    const { droits } = await droitsParLAnnuaire('rssi.groupe');
    assert.equal(droits.export, true, 'GRC-EXPORT doit accorder l’export.');
    assert.ok(droits.filiales.length > 1, 'Le périmètre doit dépasser une filiale.');
    // Le contre-exemple, sur le même axe : un RSSI de site a le même profil et
    // PAS l'export. Sans lui, « export = vrai » serait vrai de tout le monde.
    const site = await droitsParLAnnuaire('rssi.tls');
    assert.equal(site.droits.export, false, 'Le droit d’export est distinct de la lecture (§3.3, contrôle S7).');
    assert.deepEqual(site.droits.profils, droits.profils, 'Même profil, et pourtant pas le même droit d’export : c’est le point.');
  });

  test('`admin` est LE SEUL à poser le drapeau d’administration Groupe', async () => {
    for (const compte of COMPTES) {
      const { droits } = await droitsParLAnnuaire(compte.login);
      assert.equal(
        droits.administrationGroupe, compte.login === 'admin',
        `Le drapeau d’administration Groupe doit être posé par « admin » et par lui seul (§25.3). ` +
        `Vu chez ${compte.login} : ${String(droits.administrationGroupe)}`,
      );
    }
  });

  test('`sans.groupe` : identifiants VALIDES, et AUCUN accès — le cas négatif', async () => {
    // La liaison réussit : c'est ce qui rend le cas intéressant. Un refus
    // d'authentification ne prouverait rien du modèle de droits.
    const client = await connecter({ url: annuaire.url, delaiMs: 4000 });
    await client.lier(dnUtilisateur('sans.groupe'), 'sans.groupe!2026');
    await client.fermer();

    const { groupes, droits } = await droitsParLAnnuaire('sans.groupe');
    assert.deepEqual(groupes, [], 'Aucun groupe, direct ou imbriqué.');
    assert.equal(droits.perimetre, 'aucun');
    assert.deepEqual(droits.filiales, []);
    assert.deepEqual(droits.profils, []);
    assert.deepEqual(Object.keys(droits.domaines), []);
    assert.deepEqual(droits.domainesInterdits, [...DOMAINES], 'Les trente domaines doivent être fermés, pas « la plupart ».');
    assert.equal(droits.export, false);
    assert.equal(droits.administrationGroupe, false);
  });

  test('`contrib.tls` : quatre domaines, et le retrait de son groupe les referme TOUS', async () => {
    const avant = await droitsParLAnnuaire('contrib.tls');
    assert.deepEqual(Object.keys(avant.droits.domaines).sort(), ['actifs', 'actions', 'incidents', 'mco']);

    // Le déprovisionnement, vu du modèle de droits : c'est le §1.5, et c'est ce
    // qu'aucun essai de dérivation ne montre s'il ne fait que lire un jeu figé.
    annuaire.retirerDuGroupe('contrib.tls', 'GRC-TLS-CONTRIB');
    try {
      const apres = await droitsParLAnnuaire('contrib.tls');
      assert.deepEqual(apres.groupes, []);
      assert.deepEqual(apres.droits.domainesInterdits, [...DOMAINES], 'Le retrait du groupe doit tout refermer.');
    } finally {
      annuaire.remettreDansGroupe('contrib.tls', 'GRC-TLS-CONTRIB');
    }
    const retabli = await droitsParLAnnuaire('contrib.tls');
    assert.deepEqual(Object.keys(retabli.droits.domaines).sort(), ['actifs', 'actions', 'incidents', 'mco']);
  });

  test('UN GROUPE `GRC-*` INCONNU du modèle n’accorde RIEN', async () => {
    // `dpo` traverse `GRC-CERCLE-A` et `GRC-CERCLE-B`, qui portent le préfixe et
    // ne sont dans aucune table de correspondance. Un résolveur qui accorderait
    // « quelque chose » à tout groupe préfixé ouvrirait la porte à la création
    // d'un groupe AD par n'importe quel administrateur d'annuaire.
    const { groupes, droits } = await droitsParLAnnuaire('dpo');
    assert.ok(groupes.includes('GRC-CERCLE-A') && groupes.includes('GRC-CERCLE-B'));
    assert.deepEqual(droits.profils, ['DPO'], 'Seul GRC-TLS-DPO accorde quelque chose.');
    assert.deepEqual(Object.keys(droits.domaines).sort(), ['documents', 'incidents', 'rgpd']);
  });
});

/* =====================================================================
 *  Le recoupement avec A1 — deux transcriptions du même schéma
 * ===================================================================== */

describe('Le vocabulaire d’A1 et celui de ce banc décrivent le MÊME schéma', () => {
  test('LES TRENTE DOMAINES et LES CINQ NIVEAUX de `src/droits/modele.ts` coïncident', async () => {
    // ── Pourquoi ce recoupement, et pourquoi il n'est pas un doublon ─────────
    //
    // Deux agents ont transcrit indépendamment les mêmes domaines depuis
    // `001_socle.sql` : A1 dans `src/droits/modele.ts`, A4 dans `comptes.mjs`.
    // Chacun a son garde-fou contre le schéma. Aucun n'a de garde-fou contre
    // L'AUTRE — et un modèle de droits dont les deux moitiés ne nomment pas les
    // mêmes domaines refuse en silence ce qu'il devrait accorder.
    //
    // Le fichier est lu comme du TEXTE, sans import : `src/**` est en TypeScript,
    // et sa compilation est l'affaire d'A1, pas une condition de ce banc.
    const { existsSync } = await import('node:fs');
    const chemin = join(RACINE_BACKEND, 'src', 'droits', 'modele.ts');
    if (!existsSync(chemin)) {
      // Cet essai AFFIRME l'état de l'arbre, il ne se saute pas : le jour où le
      // fichier existe, la branche change seule et le recoupement s'applique.
      // Un `skip` aurait laissé croire à la porte S3 qu'un contrôle a été joué.
      assert.equal(existsSync(join(RACINE_BACKEND, 'src', 'droits')), false,
        'backend/src/droits existe mais pas `modele.ts` : ce recoupement ne sait plus où lire.');
      return;
    }
    const source = readFileSync(chemin, 'utf8');
    const bloc = (nom) => {
      const declaration = source.indexOf(`export const ${nom}`);
      assert.notEqual(declaration, -1, `${nom} a disparu de src/droits/modele.ts : le recoupement n’a plus de sujet.`);
      // On part de la PARENTHÈSE OUVRANTE de la liste, pas de la déclaration :
      // « readonly DomaineFonctionnelBase[] » porte un « ] » qui tronquerait tout,
      // et le recoupement lirait alors zéro domaine — vrai de rien.
      const ouvrante = source.indexOf('([', declaration);
      const fermante = source.indexOf('])', ouvrante);
      assert.ok(ouvrante !== -1 && fermante > ouvrante, `La liste ${nom} n’a plus la forme attendue.`);
      return source.slice(ouvrante, fermante);
    };
    const domainesA1 = [...bloc('DOMAINES').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    const niveauxA1 = [...bloc('NIVEAUX').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    // Le balayage doit avoir LU quelque chose : « les deux listes coïncident » est
    // aussi ce que rend une lecture qui n'a rien vu des deux côtés.
    assert.ok(domainesA1.length >= 25, `Seulement ${String(domainesA1.length)} domaine(s) lus chez A1 : le motif ne reconnaît plus sa liste.`);
    assert.equal(niveauxA1.length, 5, `Cinq niveaux attendus, ${String(niveauxA1.length)} lus.`);
    assert.deepEqual([...domainesA1].sort(), [...DOMAINES].sort(),
      'Les domaines d’A1 et ceux de ce banc ont divergé : l’un des deux a raté une migration.');
    assert.deepEqual(niveauxA1, ['aucun', 'lecture', 'contribution', 'validation', 'administration'],
      'Les cinq niveaux du troisième axe, dans l’ordre croissant : c’est cet ordre qui décide du cumul.');
    // Et la moitié négative : le recoupement doit savoir dire NON.
    assert.ok(!domainesA1.includes('matrice'),
      '« matrice » n’est pas un domaine : c’est une vue du domaine « risques » (001_socle.sql ≈ 126).');
  });
});
