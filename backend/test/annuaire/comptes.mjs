/**
 * comptes.mjs — le jeu d'annuaire FIGÉ du `CONVENTIONS.md` §25.3, et ce qu'il doit produire.
 *
 * ── Ce fichier est un contrat, pas un jeu de données ─────────────────────────
 *
 * L'agent A1 écrit le client LDAP et la dérivation des droits ; A4 écrit l'annuaire
 * qu'il interroge. La séparation n'a de valeur que si les deux visent la **même**
 * cible écrite : sans elle, chacun ajusterait son côté jusqu'au vert, ce qui est
 * exactement le défaut mesuré en **Q-61** — un essai qui éprouve sa propre
 * réécriture.
 *
 * D'où deux moitiés dans ce fichier :
 *
 *  · `ANNUAIRE` — les entrées telles que la doublure les sert : huit comptes, leurs
 *    groupes, l'imbrication et **son cycle** ;
 *  · `ATTENDU` — ce que la résolution des trois axes doit rendre pour chacun, et
 *    surtout **ce qu'elle ne doit pas rendre**. Le §20.2 est formel : un garde-fou
 *    qui n'éprouve que des accès autorisés ne démontre pas une autorisation, il
 *    démontre qu'un chemin existe.
 *
 * ── Ce que j'ai dû décider, et qu'il faut relire ────────────────────────────
 *
 * Le `PLAN_SERVEUR` §3.2 nomme les domaines d'un profil en français courant
 * (« Actions, incidents, actifs, MCO », « conformité »). Le schéma, lui, ferme la
 * liste à **trente valeurs** (`domaine_fonctionnel`, `001_socle.sql` ≈ 127). La
 * traduction de l'un vers l'autre est un **arbitrage**, pas une lecture : il est
 * écrit ici, en toutes lettres, domaine par domaine, pour que A1 le contredise s'il
 * le faut plutôt que de le deviner. Les deux endroits où j'ai tranché :
 *
 *  · « conformité » → `exigences`, `referentiels`, `mesures`, `correspondances`.
 *    C'est le chaînage que l'application appelle ainsi (couverture, SoA) ;
 *  · les domaines d'administration — `filiales`, `droits`, `journal` — sont retirés
 *    du profil RSSI. Ils sont de niveau Groupe, et le §22/E6 réserve la lecture du
 *    journal. Sans ce retrait, « le RSSI ne voit pas tout » n'aurait aucun sens et
 *    la moitié négative du banc serait vide.
 *
 * ── Ce que ce fichier N'A PAS pu exercer, et qui est dit plutôt que tu ──────
 *
 * L'axe « périmètre » a trois valeurs (une filiale · plusieurs filiales · Groupe
 * entier). Les huit comptes figés en couvrent **deux** : `rssi.tls` pour une
 * filiale, `direction` et `rssi.groupe` pour le Groupe entier. **Aucun compte ne
 * porte deux filiales sans les porter toutes** — et je ne l'ajoute pas de mon
 * chef : le §25.3 fige la liste, et A1 code contre elle. C'est une demande portée
 * au rapport, pas une décision d'agent.
 */

/* =====================================================================
 *  Le domaine, les filiales, les profils
 * ===================================================================== */

export const BASE_RECHERCHE = 'DC=exemple,DC=interne';
export const OU_UTILISATEURS = `OU=Utilisateurs,${BASE_RECHERCHE}`;
export const OU_GROUPES = `OU=Groupes,${BASE_RECHERCHE}`;
export const OU_SERVICE = `OU=Comptes de service,${BASE_RECHERCHE}`;

/** Le compte de service en lecture du `PLAN_SERVEUR` §1.5 — comportement D1. */
export const COMPTE_SERVICE = Object.freeze({
  dn: `CN=svc-grc,${OU_SERVICE}`,
  motDePasse: 'service-lecture-seule',
});

/** Les deux filiales du jeu. La seconde existe pour que « ne doit pas voir » ait un objet. */
export const FILIALES = Object.freeze(['TLS', 'DEU']);

/**
 * Les trente domaines fonctionnels, dans l'ordre de `domaine_fonctionnel`
 * (`001_socle.sql`). Recopiés ici **et confrontés au schéma** par
 * `trois-axes.test.mjs` : une liste écrite à la main n'est admise que si un
 * contrôle vérifie qu'elle est complète (`CONVENTIONS.md` §19.5).
 */
export const DOMAINES = Object.freeze([
  'tableau_de_bord', 'synthese', 'echeances',
  'donneurs_ordre', 'personnel',
  'actifs', 'cartographie', 'risques',
  'exigences', 'referentiels', 'mesures', 'correspondances',
  'actions', 'incidents', 'documents', 'rgpd',
  'bia', 'crise', 'pra', 'mco', 'tests_pra', 'prestataires',
  'audits', 'revues',
  'pieces_jointes', 'imports',
  'parametres', 'filiales', 'droits', 'journal',
]);

/** Les quatre domaines réservés à l'administration (troisième axe, valeur haute). */
const ADMINISTRATION = Object.freeze(['parametres', 'filiales', 'droits', 'journal']);

/** « Conformité » du `PLAN_SERVEUR` §3.2, traduit dans le vocabulaire du schéma. */
const CONFORMITE = Object.freeze(['exigences', 'referentiels', 'mesures', 'correspondances']);

const sauf = (retires) => DOMAINES.filter((d) => !retires.includes(d));

/**
 * Les huit profils du `PLAN_SERVEUR` §3.2, rendus en `{ domaine: niveau }`.
 *
 * Le code est **le suffixe du groupe AD** (`GRC-<FILIALE>-<CODE>`), contraint par
 * `ck_profils_code` — c'est ce qui rend la convention de nommage vérifiable.
 */
export const PROFILS = Object.freeze({
  RSSI: {
    libelle: 'RSSI',
    // « Tous les domaines de sa filiale » — moins ceux qui sont de niveau Groupe.
    domaines: Object.fromEntries(sauf(['filiales', 'droits', 'journal']).map((d) => [d, 'validation'])),
  },
  CONTRIB: {
    libelle: 'Contributeur',
    // §25.3 : « contribution bornée à quatre domaines ». Quatre, et pas cinq.
    domaines: { actions: 'contribution', incidents: 'contribution', actifs: 'contribution', mco: 'contribution' },
  },
  QUALITE: {
    libelle: 'Qualité',
    // §25.3 : « un profil qui NE DOIT PAS voir la cartographie ».
    domaines: Object.fromEntries(
      ['audits', 'documents', 'revues', ...CONFORMITE].map((d) => [d, d === 'audits' || d === 'documents' || d === 'revues' ? 'contribution' : 'lecture']),
    ),
  },
  RH: {
    libelle: 'RH',
    domaines: { personnel: 'contribution', rgpd: 'lecture', incidents: 'lecture' },
  },
  DPO: {
    libelle: 'DPO',
    domaines: { rgpd: 'validation', incidents: 'contribution', documents: 'contribution' },
  },
  DIRECTION: {
    libelle: 'Direction',
    // « en lecture » : aucune écriture nulle part, c'est ce que le compte éprouve.
    domaines: Object.fromEntries(['tableau_de_bord', 'synthese', ...CONFORMITE].map((d) => [d, 'lecture'])),
  },
  AUDITEUR: {
    libelle: 'Auditeur',
    domaines: Object.fromEntries(sauf(ADMINISTRATION).map((d) => [d, 'lecture'])),
  },
  ADMIN: {
    libelle: 'Administrateur',
    domaines: Object.fromEntries(ADMINISTRATION.map((d) => [d, 'administration'])),
  },
});

/* =====================================================================
 *  Les groupes AD — convention du PLAN_SERVEUR §3.4
 * ===================================================================== */

/**
 * Les groupes de l'annuaire.
 *
 * `membreDe` porte l'**imbrication**, et c'est là que vit le comportement D3 :
 * `GRC-IMBRIQUE-DPO` mène à `GRC-TLS-DPO` (le §25.3 l'écrit ainsi) **et** à
 * `GRC-CERCLE-A`, qui appartient à `GRC-CERCLE-B`, qui appartient à
 * `GRC-CERCLE-A`. Trois niveaux depuis le compte, et le cycle est **sur le chemin
 * que la résolution parcourt** — un cycle placé sur une branche morte ne
 * figerait aucun résolveur, et ne prouverait donc rien.
 *
 * Les deux groupes du cercle portent le préfixe `GRC-` **à dessein** : un
 * résolveur qui filtrerait sur le préfixe AVANT de descendre n'entrerait jamais
 * dans le cycle, et l'essai serait sans dents. Ils ne donnent aucun droit — ce qui
 * est la seconde moitié : un groupe `GRC-*` inconnu n'accorde rien.
 */
export const GROUPES = Object.freeze([
  { nom: 'GRC-TLS-RSSI', perimetre: 'filiale', filiale: 'TLS', profil: 'RSSI', membreDe: [] },
  { nom: 'GRC-TLS-CONTRIB', perimetre: 'filiale', filiale: 'TLS', profil: 'CONTRIB', membreDe: [] },
  { nom: 'GRC-TLS-QUALITE', perimetre: 'filiale', filiale: 'TLS', profil: 'QUALITE', membreDe: [] },
  { nom: 'GRC-TLS-DPO', perimetre: 'filiale', filiale: 'TLS', profil: 'DPO', membreDe: [] },
  { nom: 'GRC-TLS-RH', perimetre: 'filiale', filiale: 'TLS', profil: 'RH', membreDe: [] },
  { nom: 'GRC-TLS-AUDITEUR', perimetre: 'filiale', filiale: 'TLS', profil: 'AUDITEUR', membreDe: [] },
  // La filiale voisine : personne dedans, et c'est son office. Elle donne un objet
  // à « ce que ce compte ne doit pas voir ».
  { nom: 'GRC-DEU-RSSI', perimetre: 'filiale', filiale: 'DEU', profil: 'RSSI', membreDe: [] },
  { nom: 'GRC-DEU-CONTRIB', perimetre: 'filiale', filiale: 'DEU', profil: 'CONTRIB', membreDe: [] },

  { nom: 'GRC-GROUPE-DIRECTION', perimetre: 'groupe', filiale: null, profil: 'DIRECTION', membreDe: [] },
  { nom: 'GRC-GROUPE-RSSI', perimetre: 'groupe', filiale: null, profil: 'RSSI', membreDe: [] },

  // Les deux groupes TRANSVERSAUX. `ck_groupes_ad_coherence` (001_socle.sql ≈ 1342)
  // interdit qu'un groupe transversal porte un profil ou une filiale : `GRC-ADMIN`
  // n'accorde donc pas un profil, il POSE UN DRAPEAU — et c'est le drapeau qui
  // ouvre les quatre domaines d'administration à l'échelle du Groupe. C'est ce que
  // le §25.3 veut dire par « le profil Administration, et lui seul, pose le drapeau
  // Groupe » ; l'écrire autrement contredirait la contrainte de base.
  { nom: 'GRC-EXPORT', perimetre: 'transversal', filiale: null, profil: null, membreDe: [], export: true },
  { nom: 'GRC-ADMIN', perimetre: 'transversal', filiale: null, profil: null, membreDe: [], admin: true },

  // ── L'imbrication, et son cycle (comportement D3) ────────────────────────
  { nom: 'GRC-IMBRIQUE-DPO', perimetre: null, filiale: null, profil: null, membreDe: ['GRC-TLS-DPO', 'GRC-CERCLE-A'] },
  { nom: 'GRC-CERCLE-A', perimetre: null, filiale: null, profil: null, membreDe: ['GRC-CERCLE-B'] },
  { nom: 'GRC-CERCLE-B', perimetre: null, filiale: null, profil: null, membreDe: ['GRC-CERCLE-A'] },
]);

/** Index par nom, pour les tests et pour la doublure. */
export const GROUPE_PAR_NOM = Object.freeze(
  Object.fromEntries(GROUPES.map((g) => [g.nom.toLowerCase(), g])),
);

export const dnGroupe = (nom) => `CN=${nom},${OU_GROUPES}`;
export const dnUtilisateur = (login) => `CN=${login},${OU_UTILISATEURS}`;

/* =====================================================================
 *  Les huit comptes — §25.3, figés
 * ===================================================================== */

/**
 * `userAccountControl` : 512 = compte ordinaire actif ; le **bit 2** le désactive
 * (514). C'est la valeur que le comportement D4 fait basculer en cours d'essai.
 */
export const UAC_ACTIF = 512;
export const UAC_DESACTIVE = 514;

export const COMPTES = Object.freeze([
  {
    login: 'rssi.tls',
    motDePasse: 'rssi.tls!2026',
    nom: 'Sarah Nadal',
    groupes: ['GRC-TLS-RSSI'],
    profil: { displayName: 'Sarah Nadal', givenName: 'Sarah', sn: 'Nadal', mail: 'sarah.nadal@exemple.interne', telephoneNumber: '+33 5 61 00 00 01', department: 'Sécurité des SI', title: 'RSSI de site' },
    eprouve: 'le cas nominal : une filiale, tous les domaines',
  },
  {
    login: 'contrib.tls',
    motDePasse: 'contrib.tls!2026',
    nom: 'Malik Ferrand',
    groupes: ['GRC-TLS-CONTRIB'],
    profil: { displayName: 'Malik Ferrand', givenName: 'Malik', sn: 'Ferrand', mail: 'malik.ferrand@exemple.interne', telephoneNumber: '+33 5 61 00 00 02', department: 'Production', title: 'Technicien' },
    eprouve: 'contribution bornée à quatre domaines',
  },
  {
    login: 'qualite.tls',
    motDePasse: 'qualite.tls!2026',
    nom: 'Inès Baroni',
    groupes: ['GRC-TLS-QUALITE'],
    profil: { displayName: 'Inès Baroni', givenName: 'Inès', sn: 'Baroni', mail: 'ines.baroni@exemple.interne', telephoneNumber: '+33 5 61 00 00 03', department: 'Qualité', title: 'Responsable qualité' },
    eprouve: 'un profil qui NE DOIT PAS voir la cartographie',
  },
  {
    login: 'direction',
    motDePasse: 'direction!2026',
    nom: 'Hélène Aubry',
    groupes: ['GRC-GROUPE-DIRECTION'],
    profil: { displayName: 'Hélène Aubry', givenName: 'Hélène', sn: 'Aubry', mail: 'helene.aubry@exemple.interne', telephoneNumber: '+33 1 44 00 00 01', department: 'Direction générale', title: 'Directrice générale' },
    eprouve: 'Groupe en lecture, aucune écriture nulle part',
  },
  {
    login: 'rssi.groupe',
    motDePasse: 'rssi.groupe!2026',
    nom: 'Yann Delcourt',
    groupes: ['GRC-GROUPE-RSSI', 'GRC-EXPORT'],
    profil: { displayName: 'Yann Delcourt', givenName: 'Yann', sn: 'Delcourt', mail: 'yann.delcourt@exemple.interne', telephoneNumber: '+33 1 44 00 00 02', department: 'Sécurité des SI', title: 'RSSI Groupe' },
    eprouve: 'périmètre multi-filiales ET droit d’export',
  },
  {
    login: 'dpo',
    motDePasse: 'dpo!2026',
    nom: 'Claire Mercier',
    // L'appartenance est INDIRECTE : c'est la seule preuve de D3.
    groupes: ['GRC-IMBRIQUE-DPO'],
    profil: { displayName: 'Claire Mercier', givenName: 'Claire', sn: 'Mercier', mail: 'claire.mercier@exemple.interne', telephoneNumber: '+33 1 44 00 00 03', department: 'Juridique', title: 'Déléguée à la protection des données' },
    eprouve: 'l’appartenance indirecte, seule preuve de D3',
  },
  {
    login: 'admin',
    motDePasse: 'admin!2026',
    nom: 'Bruno Vasseur',
    groupes: ['GRC-ADMIN'],
    profil: { displayName: 'Bruno Vasseur', givenName: 'Bruno', sn: 'Vasseur', mail: 'bruno.vasseur@exemple.interne', telephoneNumber: '+33 1 44 00 00 04', department: 'Informatique', title: 'Administrateur applicatif' },
    eprouve: 'le profil Administration, et lui seul, pose le drapeau Groupe',
  },
  {
    login: 'sans.groupe',
    motDePasse: 'sans.groupe!2026',
    nom: 'Théo Rivals',
    groupes: [],
    profil: { displayName: 'Théo Rivals', givenName: 'Théo', sn: 'Rivals', mail: 'theo.rivals@exemple.interne', telephoneNumber: '+33 5 61 00 00 09', department: 'Logistique', title: 'Magasinier' },
    eprouve: 'LE CAS NÉGATIF : identifiants valides, aucun accès',
  },
]);

export const COMPTE_PAR_LOGIN = Object.freeze(
  Object.fromEntries(COMPTES.map((c) => [c.login.toLowerCase(), c])),
);

/* =====================================================================
 *  L'ATTENDU — ce que la dérivation doit rendre, dans les DEUX sens
 * ===================================================================== */

/**
 * Résout les groupes d'un compte **récursivement**, cycle compris.
 *
 * C'est la référence exécutable de D3 : elle porte l'ensemble des visités, sans
 * quoi elle tournerait indéfiniment sur `GRC-CERCLE-A`/`GRC-CERCLE-B` — ce qui
 * est précisément ce que l'annuaire doit pouvoir faire arriver à un résolveur
 * naïf (`CONVENTIONS.md` §25.2).
 */
export function resoudreGroupes(login) {
  const compte = COMPTE_PAR_LOGIN[String(login).toLowerCase()];
  if (compte === undefined) return null;
  const vus = new Set();
  const aVoir = [...compte.groupes];
  while (aVoir.length > 0) {
    const nom = aVoir.pop();
    const cle = nom.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    const groupe = GROUPE_PAR_NOM[cle];
    if (groupe !== undefined) aVoir.push(...groupe.membreDe);
  }
  return [...vus].map((cle) => GROUPE_PAR_NOM[cle].nom).sort();
}

/**
 * Les trois axes attendus pour un compte : périmètre × profil × niveau, plus le
 * droit d'export et le drapeau d'administration Groupe.
 *
 * Le cumul se fait **au plus favorable** par domaine, ce qui est la seule règle
 * qui tienne quand un compte porte deux groupes (`rssi.groupe` en porte deux).
 */
const ORDRE_NIVEAUX = ['aucun', 'lecture', 'contribution', 'validation', 'administration'];

export function deriverDroits(login) {
  const groupes = resoudreGroupes(login);
  if (groupes === null) return null;
  return deriverDepuisGroupes(groupes, login);
}

/**
 * La même dérivation, mais à partir d'une **liste de groupes obtenue ailleurs**.
 *
 * C'est la forme dont le banc des trois axes a besoin : il lit les groupes dans
 * l'annuaire, par le vrai chemin LDAP, et les passe ici. Sans cette séparation,
 * le banc confronterait le jeu de données à lui-même — et resterait vert quelle
 * que soit la doublure.
 */
export function deriverDepuisGroupes(groupes, login = null) {
  const filiales = new Set();
  let groupeEntier = false;
  let export_ = false;
  let admin = false;
  const domaines = {};
  const profils = new Set();

  for (const nom of groupes) {
    const groupe = GROUPE_PAR_NOM[nom.toLowerCase()];
    if (groupe === undefined || groupe.perimetre === null) continue; // groupe sans effet (le cercle)
    if (groupe.export === true) export_ = true;
    if (groupe.admin === true) {
      // Le drapeau d'administration vaut périmètre Groupe et ouvre les quatre
      // domaines d'administration : c'est lui, et non un profil, qui les porte.
      admin = true;
      groupeEntier = true;
      profils.add('ADMIN');
      for (const [domaine, niveau] of Object.entries(PROFILS.ADMIN.domaines)) {
        const actuel = domaines[domaine] ?? 'aucun';
        if (ORDRE_NIVEAUX.indexOf(niveau) > ORDRE_NIVEAUX.indexOf(actuel)) domaines[domaine] = niveau;
      }
    }
    if (groupe.perimetre === 'filiale') filiales.add(groupe.filiale);
    if (groupe.perimetre === 'groupe') groupeEntier = true;
    if (groupe.profil === null) continue;
    profils.add(groupe.profil);
    for (const [domaine, niveau] of Object.entries(PROFILS[groupe.profil].domaines)) {
      const actuel = domaines[domaine] ?? 'aucun';
      if (ORDRE_NIVEAUX.indexOf(niveau) > ORDRE_NIVEAUX.indexOf(actuel)) domaines[domaine] = niveau;
    }
  }

  return {
    login,
    perimetre: groupeEntier ? 'groupe' : filiales.size === 0 ? 'aucun' : filiales.size === 1 ? 'filiale' : 'plusieurs',
    filiales: groupeEntier ? [...FILIALES] : [...filiales].sort(),
    profils: [...profils].sort(),
    domaines,
    /** Les domaines que ce compte NE DOIT PAS voir — la moitié qui manque toujours (§20.2). */
    domainesInterdits: DOMAINES.filter((d) => (domaines[d] ?? 'aucun') === 'aucun'),
    export: export_,
    administrationGroupe: admin,
    /**
     * Vrai si le compte a des domaines ET ne peut écrire dans AUCUN (le cas
     * `direction`). L'exigence « au moins un domaine » n'est pas une coquetterie :
     * sans elle, `sans.groupe` serait « en lecture seule » — et une dérivation
     * cassée qui ne rendrait plus rien passerait pour un profil Direction.
     */
    lectureSeule:
      Object.keys(domaines).length > 0 &&
      Object.values(domaines).every((n) => n === 'lecture' || n === 'aucun'),
  };
}

/** L'attendu des huit comptes, calculé une fois. */
export const ATTENDU = Object.freeze(
  Object.fromEntries(COMPTES.map((c) => [c.login, Object.freeze(deriverDroits(c.login))])),
);
