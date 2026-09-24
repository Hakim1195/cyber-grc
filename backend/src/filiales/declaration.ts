/**
 * `filiales.conf` — **le seul analyseur de la déclaration d'exploitation.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe, et ce qu'il corrige
 * ════════════════════════════════════════════════════════════════════════
 *
 * `CONVENTIONS.md` §27 range `/etc/cyber-grc/filiales.conf` comme la déclaration
 * d'exploitation du périmètre : le client l'écrit, elle vit hors de la base, et
 * `deploy/groupes-ad.sh` en tire la liste des groupes d'annuaire à créer.
 *
 * 🛑 **Ce que personne ne faisait : la porter EN BASE.** Mesuré le 24/09/2026 —
 * `insert into filiales` n'existe nulle part dans `deploy/` ni dans `db/`, et le
 * commentaire de `install.sh` l'annonçait encore au futur (« que le lot L4
 * consommera pour semer la table `filiales` »). Les deux moitiés du dispositif
 * lisaient donc **deux sources différentes** :
 *
 *   · `deploy/groupes-ad.sh`        → le FICHIER  → les groupes à créer dans l'AD ;
 *   · `db/synchroniser-groupes-ad.mjs` → la TABLE → `groupes_ad`, l'autorité
 *     applicative qui décide de ce qu'un groupe accorde.
 *
 * Conséquence mesurée sur le code compilé, avec deux filiales déclarées au
 * fichier et une table vide : l'annuaire reçoit **26** groupes et `groupes_ad`
 * n'en déclare que **10** — les huit `GRC-GROUPE-<PROFIL>` et les deux
 * transversaux. `GRC-ADMIN` étant du lot, l'administrateur entre ; mais
 * `GRC-TLS-RSSI` et ses quinze voisins **n'accordent rien**, et le RSSI de site
 * se connecte sans obtenir le moindre accès. C'est le mode de panne exact que
 * tout ce dispositif existe pour empêcher (constat Q-78, un cran plus loin).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Trois décisions
 * ════════════════════════════════════════════════════════════════════════
 *
 * **1. La table est désormais la SOURCE, le fichier est un AMORÇAGE.** Le
 * raisonnement n'est pas esthétique, il est mesurable : le service tourne sous
 * `ProtectSystem=strict` avec `ReadWritePaths=/var/lib/cyber-grc
 * /var/log/cyber-grc` — `/etc/cyber-grc` lui est **en lecture seule**. Un écran
 * ne pourra donc jamais écrire `filiales.conf`, et l'y autoriser serait une
 * régression du bac à sable. Le seul sens ouvert est fichier → table, une fois,
 * à l'amorçage ; ensuite, une acquisition se déclare **à l'écran**, par un
 * administrateur, avec sa trace au journal.
 *
 * **2. UN SEUL analyseur, et il est ici.** `deploy/groupes-ad.sh` en portait un,
 * écrit en bash, qui réimplémentait à la main `ck_filiales_code`,
 * `ck_filiales_pays` et l'unicité du code. Deux analyseurs du même format, c'est
 * deux vérités — et la divergence se verrait le jour où l'un accepte une ligne
 * que l'autre refuse, c'est-à-dire au moment où quelqu'un ne peut pas se
 * connecter. Le shell appelle donc celui-ci, comme il appelle déjà
 * `groupesAttendus()` (`CLAUDE.md` §3 : on ne recopie pas une règle, on l'appelle).
 *
 * **3. Une ligne `active = non` n'est PAS importée, et le motif est écrit.** Le
 * fichier dit « hors périmètre » ; la base, elle, connaît trois statuts, et
 * `ck_filiales_sortie` exige une **date de sortie** pour `sortie`. Le fichier ne
 * la porte pas, et l'inventer serait écrire au registre une date que personne n'a
 * décidée. Ces lignes sont donc **rendues à part**, avec leur motif, plutôt
 * qu'omises en silence — le premier cas du tableau du `CLAUDE.md` §3.
 */

/** Une filiale telle que la déclaration l'écrit. */
export interface DeclarationFiliale {
  readonly code: string;
  readonly raisonSociale: string;
  readonly pays: string;
  /** `active = oui`. Une ligne à `non` est déclarée hors périmètre. */
  readonly active: boolean;
  /** Numéro de ligne dans le fichier, pour que tout message le nomme. */
  readonly ligne: number;
}

/** Un refus, rattaché à sa ligne. */
export interface AnomalieDeclaration {
  readonly ligne: number;
  readonly message: string;
}

export interface Declaration {
  /** Les lignes saines, dans l'ordre du fichier — actives ET hors périmètre. */
  readonly filiales: readonly DeclarationFiliale[];
  /** Ce qui a été refusé. Non vide ⇒ **rien ne doit être engendré**. */
  readonly anomalies: readonly AnomalieDeclaration[];
  /** Lignes non vides et non commentées rencontrées, anomalies comprises. */
  readonly lignesLues: number;
}

/**
 * Le code réservé.
 *
 * `GRC-GROUPE-<PROFIL>` est la forme du périmètre Groupe entier : une filiale
 * dont le code vaudrait `GROUPE` produirait des noms de groupes qui entrent en
 * collision avec elle, et l'un des deux sens serait perdu — sans message.
 */
const CODE_RESERVE = 'GROUPE';

const FORME_CODE = /^[A-Z0-9]{2,10}$/u;
const FORME_PAYS = /^[A-Z]{2}$/u;

/** Retire les blancs de tête et de queue, sans rien d'autre. */
const nettoyer = (valeur: string): string => valeur.replace(/^\s+|\s+$/gu, '');

/**
 * Analyse le contenu de `filiales.conf`.
 *
 * ⚠️ **Une anomalie n'interrompt pas l'analyse** : le fichier est relu jusqu'au
 * bout et **toutes** les lignes fautives sont rendues. Un exploitant qui corrige
 * une ligne pour découvrir la suivante fait vingt allers-retours ; celui qui les
 * voit toutes corrige une fois.
 *
 * @param texte contenu brut du fichier.
 */
export function analyserDeclaration(texte: string): Declaration {
  const filiales: DeclarationFiliale[] = [];
  const anomalies: AnomalieDeclaration[] = [];
  const codesVus = new Set<string>();
  let lignesLues = 0;

  const brutes = texte.split('\n');
  for (let index = 0; index < brutes.length; index += 1) {
    const numero = index + 1;
    // Un fichier écrit sous Windows porte des retours chariot : les laisser
    // ferait échouer le contrôle de `active` sur « oui\r », et le message
    // parlerait d'une valeur que l'exploitant ne voit pas dans son éditeur.
    const ligne = (brutes[index] ?? '').replace(/\r$/u, '');
    if (/^\s*(#.*)?$/u.test(ligne)) continue;
    lignesLues += 1;

    const champs = ligne.split(';');
    if (champs.length !== 4) {
      anomalies.push({
        ligne: numero,
        message:
          `${String(champs.length)} champ(s) au lieu de 4 — ` +
          '« code ; raison sociale ; pays ; active »',
      });
      continue;
    }

    const code = nettoyer(champs[0] ?? '');
    const raisonSociale = nettoyer(champs[1] ?? '');
    const pays = nettoyer(champs[2] ?? '');
    const active = nettoyer(champs[3] ?? '');

    if (!FORME_CODE.test(code)) {
      anomalies.push({
        ligne: numero,
        message: `code « ${code} » — attendu 2 à 10 caractères A-Z ou 0-9 (ck_filiales_code)`,
      });
      continue;
    }
    if (code === CODE_RESERVE) {
      anomalies.push({
        ligne: numero,
        message:
          'le code « GROUPE » entre en collision avec la forme réservée <PRÉFIXE>GROUPE-<PROFIL>',
      });
      continue;
    }
    if (raisonSociale === '') {
      anomalies.push({ ligne: numero, message: 'raison sociale vide (ck_filiales_raison)' });
      continue;
    }
    if (!FORME_PAYS.test(pays)) {
      anomalies.push({
        ligne: numero,
        message: `pays « ${pays} » — attendu deux lettres majuscules, ex. FR, DE (ck_filiales_pays)`,
      });
      continue;
    }
    if (active !== 'oui' && active !== 'non') {
      anomalies.push({
        ligne: numero,
        message: `« active » vaut « ${active} » — attendu « oui » ou « non »`,
      });
      continue;
    }
    if (codesVus.has(code)) {
      anomalies.push({
        ligne: numero,
        message: `le code « ${code} » est déclaré deux fois (uq_filiales_code)`,
      });
      continue;
    }

    codesVus.add(code);
    filiales.push({ code, raisonSociale, pays, active: active === 'oui', ligne: numero });
  }

  return Object.freeze({
    filiales: Object.freeze(filiales),
    anomalies: Object.freeze(anomalies),
    lignesLues,
  });
}

/** Les seules lignes qu'on porte en base : celles qui sont dans le périmètre. */
export function filialesActives(
  declaration: Declaration,
): readonly DeclarationFiliale[] {
  return declaration.filiales.filter((f) => f.active);
}

/**
 * Les lignes hors périmètre, **nommées avec leur motif**.
 *
 * Voir la décision 3 de l'en-tête : elles ne s'importent pas, et cela se dit.
 */
export function filialesHorsPerimetre(
  declaration: Declaration,
): readonly DeclarationFiliale[] {
  return declaration.filiales.filter((f) => !f.active);
}

export const MOTIF_HORS_PERIMETRE =
  'déclarée « active = non » : une filiale hors périmètre n’entre pas en base à l’amorçage. ' +
  'Le statut « sortie » exige une DATE de sortie (ck_filiales_sortie) que le fichier ne porte ' +
  'pas, et l’inventer écrirait au registre une date que personne n’a décidée. Créez-la à ' +
  'l’écran si elle doit exister, puis faites-la sortir — la sortie exporte ses données.';
