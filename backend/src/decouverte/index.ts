/**
 * `src/decouverte/` — LE JEU DE DÉCOUVERTE (lot L18 bis)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET`  | `/api/decouverte/etat`   | ce que l'écran doit proposer, et pourquoi |
 * | `POST` | `/api/decouverte/semer`  | charger le groupe fictif, sur geste volontaire |
 * | `POST` | `/api/decouverte/purger` | tout retirer, pièces jointes comprises |
 *
 * ── POURQUOI CE LOT EXISTE, ET CE QU'IL A COÛTÉ D'ARBITRER ────────────────
 *
 * Le brief d'origine **interdisait** les données de démonstration, et la règle
 * a bien servi : un outil qui affiche « aucun risque » sur une base vide ne
 * ment pas. Mais elle avait un coût mesuré sur la prise en main — à la première
 * ouverture, **tous les écrans sont vides, y compris ceux qui expliquent le
 * mieux le produit**.
 *
 * L'utilisateur a tranché le 08/09/2026 (`docs/PLAN_PRODUIT.md` §7, A2) : le
 * jeu est **autorisé**, et les **cinq conditions sont CONSTITUTIVES** — *« un
 * jeu qui n'en respecte que quatre n'est pas autorisé »*. Elles ne sont pas de
 * la prudence décorative : elles sont ce qui rend la décision compatible avec le
 * motif du brief.
 *
 * | | Condition | Où elle est tenue |
 * |---|---|---|
 * | 1 | **marque dans la donnée** | **dans la BASE** — migration `032` : colonne `provenance`, domaine clos, posée par un déclencheur depuis `grc.provenance`. Pas une ligne de code d'ici |
 * | 2 | **geste volontaire** | une route `POST`, appelée par un bouton des réglages. `install.sh` ne l'appelle pas, et un essai le vérifie sur le script |
 * | 3 | **refus si données réelles** | `etatDecouverte()` cherche **toute ligne non marquée**, dans toutes les tables porteuses **découvertes au catalogue** — jamais un compteur |
 * | 4 | **purge complète en un clic** | `purger()` supprime les lignes marquées ; les pièces jointes suivent par le déclencheur `017`, sur les six chemins |
 * | 5 | **interdit hors profil découverte** | refus **403**, et le refus est **journalisé** avec sa route, comme `GRC06` |
 *
 * ── LA DÉCISION DE CONCEPTION QUI PORTE TOUT LE RESTE ─────────────────────
 *
 * **Ce module ne marque rien.** Il pose `grc.provenance = 'decouverte'` une
 * fois, en tête de transaction, et c'est la base qui marque — par un
 * déclencheur `before insert` armé `always`, sur chaque table porteuse.
 *
 * C'est le dispositif de `cree_par`, et le motif est le même : *une route ne
 * voit que son chemin, il y en a toujours un de plus* (`CONVENTIONS.md` §8.1,
 * constats Q-232 / Q-233). Si ce fichier devait énumérer les tables à marquer,
 * l'oubli d'une seule produirait une ligne de démonstration **indiscernable
 * d'une ligne réelle** — c'est-à-dire exactement le défaut que la condition 1
 * existe pour empêcher.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';

import { journaliser } from '../auth/journal.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';
import type { SessionAppliquee } from '../api/session.js';

export const CHEMIN_ETAT = '/api/decouverte/etat';
export const CHEMIN_SEMER = '/api/decouverte/semer';
export const CHEMIN_PURGER = '/api/decouverte/purger';

/** Valeur de `grc.provenance` pendant le semis. Elle doit exister au domaine. */
const MARQUE = 'decouverte';

export interface OptionsDecouverte {
  readonly pool: Pool;
  /** Profil de l'installation, tel que `src/config` l'a validé au démarrage. */
  readonly profil: 'production' | 'decouverte';
}

/* =====================================================================
 *  L'ÉTAT — ce que l'écran a le droit de proposer, et pourquoi
 * ===================================================================== */

export interface EtatDecouverte {
  /** Le profil de cette installation. */
  readonly profil: string;
  /** Vrai si le semis est possible ICI ET MAINTENANT. */
  readonly semable: boolean;
  /** Vrai si un jeu de découverte est déjà chargé (donc purgeable). */
  readonly present: boolean;
  /**
   * Pourquoi le semis est refusé, quand il l'est. **Toujours rendu**, même
   * quand `semable` est vrai — un écran qui grise un bouton sans dire pourquoi
   * est de la classe Q-201 / Q-207 : *un vide sans explication apprend à ne
   * plus croire ce qu'on montre*.
   */
  readonly motif: string;
  /** Nombre de lignes marquées « decouverte », toutes tables confondues. */
  readonly lignesDecouverte: number;
  /** Nombre de lignes NON marquées — c'est-à-dire de données réelles. */
  readonly lignesReelles: number;
  /** Les tables porteuses, découvertes au catalogue. Pour le diagnostic. */
  readonly tablesExaminees: number;
}

/**
 * Compte, table porteuse par table porteuse, ce qui est marqué et ce qui ne
 * l'est pas.
 *
 * ⚠️ **Les tables sont DÉCOUVERTES**, jamais listées : toute table portant la
 * colonne `provenance` du bon domaine entre dans le balayage. Une table métier
 * ajoutée demain y entre le jour de sa création, et non le jour où quelqu'un
 * pense à l'inscrire ici. C'est la condition 3 prise au mot : *« le contrôle
 * porte sur la présence de TOUTE ligne non marquée, pas sur un compteur »*.
 *
 * ⚠️ **Le comptage se fait sous le périmètre de la session**, donc sous la RLS.
 * C'est voulu, et c'est plus strict que l'inverse : une filiale ne peut pas
 * semer parce qu'une AUTRE filiale porte des données réelles, mais elle ne peut
 * pas non plus semer par-dessus ses propres données.
 */
async function compter(client: PoolClient): Promise<{
  marquees: number;
  reelles: number;
  tables: number;
}> {
  const porteuses = await client.query<{ table_nom: string }>(
    `select a.attrelid::regclass::text as table_nom
       from pg_attribute a
      where a.attname = 'provenance'
        and a.attnum > 0 and not a.attisdropped
        and a.atttypid = 'provenance_ligne'::regtype
      order by 1`,
  );

  let marquees = 0;
  let reelles = 0;

  for (const { table_nom: nom } of porteuses.rows) {
    // Le nom vient de `pg_catalog` — c'est une liste blanche close par
    // construction, la seule interpolation d'identifiant que le
    // `CONVENTIONS.md` §17.4 admette. Aucune valeur d'utilisateur n'entre ici.
    const compte = await client.query<{ marquees: string; reelles: string }>(
      `select count(*) filter (where provenance = $1) as marquees,
              count(*) filter (where provenance <> $1) as reelles
         from ${nom}`,
      [MARQUE],
    );
    marquees += Number(compte.rows[0]?.marquees ?? 0);
    reelles += Number(compte.rows[0]?.reelles ?? 0);
  }

  return { marquees, reelles, tables: porteuses.rows.length };
}

export async function etatDecouverte(
  client: PoolClient,
  profil: string,
): Promise<EtatDecouverte> {
  const { marquees, reelles, tables } = await compter(client);

  const horsProfil = profil !== 'decouverte';
  const donneesReelles = reelles > 0;

  let motif: string;
  if (horsProfil) {
    motif =
      "Cette installation n'est pas une installation de découverte. Le jeu de " +
      'démonstration y est interdit : sur une installation de production, une ligne ' +
      'fictive à côté de lignes réelles est un risque pour la valeur de preuve de ' +
      "l'outil, et c'est le motif du brief d'origine.";
  } else if (donneesReelles) {
    motif =
      `La base porte déjà ${String(reelles)} ligne(s) qui ne viennent pas du jeu de ` +
      'découverte. Le jeu ne se charge que sur une base vierge : mêlé à des données ' +
      'réelles, il rendrait tous les écrans discutables — lesquels chiffres sont vrais ? ' +
      'Purgez ces lignes, ou employez une autre installation.';
  } else if (marquees > 0) {
    motif =
      `Le jeu de découverte est déjà chargé (${String(marquees)} lignes). Purgez-le ` +
      'avant de le recharger : le semer deux fois en ferait un doublon, pas une mise à jour.';
  } else {
    motif = 'Le jeu de découverte peut être chargé : cette base est vierge.';
  }

  return {
    profil,
    semable: !horsProfil && !donneesReelles && marquees === 0,
    present: marquees > 0,
    motif,
    lignesDecouverte: marquees,
    lignesReelles: reelles,
    tablesExaminees: tables,
  };
}

/* =====================================================================
 *  LE GREFFON
 * ===================================================================== */

export async function greffonDecouverte(
  instance: FastifyInstance,
  options: OptionsDecouverte,
): Promise<void> {
  const { pool, profil } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal:
          `route « ${requete.method} ${requete.routeOptions.url ?? requete.url} » atteinte ` +
          'sans session appliquée : le crochet onRequest du greffon parent ne s’est pas exécuté',
      });
    }
    return session;
  };

  /**
   * Condition 5 — **interdit hors du profil découverte, et le refus est
   * journalisé**.
   *
   * ⚠️ Le refus est inscrit AVANT d'être rendu, et dans sa propre transaction :
   * un refus qu'on ne trace pas est un refus dont personne ne saura qu'il a été
   * tenté, et « qui a essayé de semer des données fictives sur la production ? »
   * est exactement la question qu'un auditeur pose. Même dessein que `GRC06`.
   */
  const exigerProfilDecouverte = async (
    requete: FastifyRequest,
    session: SessionAppliquee,
  ): Promise<void> => {
    if (profil === 'decouverte') return;

    await avecTransaction(pool, session.perimetre, async (client) => {
      await journaliser(client, {
        filialeId: session.perimetre.filialeId,
        utilisateurLibelle: session.perimetre.utilisateurId,
        action: 'refus_autorisation',
        // ⚠️ `resume` est une phrase du DÉVELOPPEUR, et rien d'autre
        // (`CONVENTIONS.md` §29.5). La route demandée est une valeur qui vient
        // du client : interpolée ici, elle ferait du journal un endroit où un
        // appelant écrit. Elle part en `valeurs_apres`, en jsonb, intacte —
        // c'est le dispositif, et un contrôle statique du banc le vérifie.
        resume: 'Jeu de découverte refusé : cette installation n’est pas une installation de découverte.',
        valeursApres: {
          route: `${requete.method} ${requete.routeOptions.url ?? requete.url}`,
          profil,
        },
      });
    });

    throw new ErreurApplicative({
      code: 'droit_insuffisant',
      statut: 403,
      message:
        "Le jeu de découverte n'est autorisé que sur une installation de découverte. " +
        'Cette installation est déclarée « production ».',
      detailJournal: `jeu de découverte refusé hors profil (profil = ${profil})`,
    });
  };

  /* -------------------------------------------------------------------
   *  GET /api/decouverte/etat
   * -------------------------------------------------------------------
   *  Déclarée `lire` sur `parametres` : c'est un écran de réglages, et savoir
   *  si l'installation est une installation de découverte n'est pas un secret —
   *  le bandeau de 18.2 b le dit déjà à tout le monde, en permanence.
   *
   *  ⚠️ Elle rend le MOTIF même quand tout va bien. Un bouton grisé sans
   *  explication est la classe Q-201 / Q-207 : l'utilisateur apprend que
   *  l'écran lui cache des choses, y compris le jour où il n'en cache aucune.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_ETAT,
    { config: { acces: { action: 'lire', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const { perimetre } = sessionDe(requete);
      const etat = await avecTransaction(pool, perimetre, async (client) =>
        etatDecouverte(client, profil),
      );
      return await reponse.status(200).send(etat);
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/decouverte/semer — condition 2 : le geste volontaire
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN_SEMER,
    { config: { acces: { action: 'administrer', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      await exigerProfilDecouverte(requete, session);

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        // Condition 3, éprouvée DANS la transaction qui écrit : la vérifier
        // dehors laisserait une fenêtre entre le contrôle et le semis — c'est
        // le motif du constat Q-214 c, « quota lu puis consommé dans deux
        // transactions ».
        const avant = await etatDecouverte(client, profil);
        if (!avant.semable) {
          throw new ErreurApplicative({
            code: 'contrainte_base',
            statut: 409,
            message: avant.motif,
            detailJournal:
              `semis refusé : ${String(avant.lignesReelles)} ligne(s) réelle(s), ` +
              `${String(avant.lignesDecouverte)} déjà marquée(s)`,
          });
        }

        // ── LA MARQUE, POSÉE UNE FOIS POUR TOUTE LA TRANSACTION ─────────
        // Portée TRANSACTION (`true`) : un réglage de session survivrait au
        // commit et marquerait « decouverte » tout ce que cette connexion
        // écrirait ensuite — y compris après que le pool l'a rendue à
        // quelqu'un d'autre. Le défaut serait silencieux, et il produirait
        // l'inverse exact de ce que la condition 1 tient.
        await client.query('select set_config($1, $2, true)', ['grc.provenance', MARQUE]);

        // Le jeu s'écrit DANS la filiale active. Sans filiale active, il n'y a
        // pas de destination : on refuse plutôt que d'inventer une portée
        // Groupe, qui rendrait les lignes fictives visibles de toutes les
        // filiales et impossibles à rattacher.
        const filiale = session.perimetre.filialeId;
        if (filiale === null) {
          throw new ErreurApplicative({
            code: 'contrainte_base',
            statut: 409,
            message:
              'Aucune filiale active : choisissez la filiale dans laquelle charger le jeu ' +
              'de découverte.',
            detailJournal: 'semis refusé : perimetre.filialeId est nul',
          });
        }

        const semees = await semerJeu(client, filiale);

        await journaliser(client, {
          filialeId: session.perimetre.filialeId,
          utilisateurLibelle: session.perimetre.utilisateurId,
          action: 'administration',
          resume:
            'Jeu de découverte chargé : des enregistrements fictifs, tous marqués ' +
            '« decouverte » dans la base.',
          valeursApres: { enregistrements: semees },
        });

        const apres = await etatDecouverte(client, profil);
        return { semees, etat: apres };
      });

      return await reponse.status(201).send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/decouverte/purger — condition 4 : tout, d'un geste
   * -------------------------------------------------------------------
   *  ⚠️ **Les pièces jointes ne sont pas supprimées ici**, et c'est délibéré :
   *  le déclencheur `f_pieces_suivent_leur_porteur()` de la migration `017` les
   *  met en file dès que leur porteur disparaît, **sur les six chemins**, et
   *  l'application vide la file après le commit. Les supprimer d'ici serait un
   *  septième chemin — c'est-à-dire le défaut que la `017` a fermé.
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN_PURGER,
    { config: { acces: { action: 'administrer', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      await exigerProfilDecouverte(requete, session);

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        const supprimees = await purgerJeu(client);

        await journaliser(client, {
          filialeId: session.perimetre.filialeId,
          utilisateurLibelle: session.perimetre.utilisateurId,
          action: 'administration',
          resume: 'Jeu de découverte purgé : les enregistrements marqués ont été retirés.',
          valeursAvant: { enregistrements: supprimees },
        });

        const apres = await etatDecouverte(client, profil);
        return { supprimees, etat: apres };
      });

      return await reponse.status(200).send(resultat);
    },
  );
}

/* =====================================================================
 *  LA PURGE
 * ===================================================================== */

/**
 * Supprime toute ligne marquée, dans **l'ordre inverse des dépendances**.
 *
 * ── Pourquoi l'ordre est DÉRIVÉ, et non écrit ─────────────────────────
 *
 * Les clés étrangères du schéma sont en `restrict` pour la plupart : supprimer
 * un porteur avant ses porteuses échoue. L'ordre est donc **calculé depuis
 * `pg_constraint`** — un tri topologique sur les dépendances réelles. Une table
 * neuve s'y insère toute seule ; une liste écrite ici aurait vieilli au premier
 * lot suivant, et son échec aurait été un `23503` illisible en pleine purge.
 */
export async function purgerJeu(client: PoolClient): Promise<number> {
  const ordre = await client.query<{ table_nom: string }>(
    `with porteuses as (
         select a.attrelid as oid, a.attrelid::regclass::text as nom
           from pg_attribute a
          where a.attname = 'provenance' and a.attnum > 0 and not a.attisdropped
            and a.atttypid = 'provenance_ligne'::regtype
     ),
     liens as (
         select c.conrelid as enfant, c.confrelid as parent
           from pg_constraint c
           join porteuses pe on pe.oid = c.conrelid
           join porteuses pp on pp.oid = c.confrelid
          where c.contype = 'f' and c.conrelid <> c.confrelid
     ),
     rangs as (
         -- Profondeur = nombre de parents porteurs. On supprime les plus
         -- profonds d'abord : un enfant part avant son parent.
         select p.nom, (select count(*) from liens l where l.enfant = p.oid) as profondeur
           from porteuses p
     )
     select nom as table_nom from rangs order by profondeur desc, nom`,
  );

  let total = 0;
  for (const { table_nom: nom } of ordre.rows) {
    const r = await client.query(`delete from ${nom} where provenance = $1`, [MARQUE]);
    total += r.rowCount ?? 0;
  }
  return total;
}

/* =====================================================================
 *  LE JEU LUI-MÊME
 * ===================================================================== */

/**
 * Le groupe fictif. **Aucune de ces lignes ne porte `provenance`** : c'est le
 * déclencheur de la migration `032` qui la pose, depuis le réglage de
 * transaction. Ajouter la colonne ici serait la rendre oubliable.
 *
 * ── Ce que le jeu cherche à montrer ───────────────────────────────────
 *
 * Pas un catalogue de lignes : **un groupe industriel plausible**, dont les
 * écrans se répondent. Un actif critique porte un processus, qui porte un
 * risque, qui porte une action, qui a une échéance dépassée — de sorte que le
 * tableau de bord, l'échéancier et la matrice disent tous quelque chose dès la
 * première ouverture, et la MÊME chose.
 */
async function semerJeu(client: PoolClient, filiale: string): Promise<number> {
  let n = 0;
  const ins = async (sql: string, params: unknown[]): Promise<void> => {
    const r = await client.query(sql, params);
    n += r.rowCount ?? 0;
  };

  const j = (jours: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + jours);
    return d.toISOString().slice(0, 10);
  };

  /* ── Donneurs d'ordre ──────────────────────────────────────────────── */
  for (const [id, nom, secteur] of [
    ['CLI-DEC-001', 'Aérospatiale Meridian', 'Aéronautique civile'],
    ['CLI-DEC-002', 'Groupe Ferroviaire Atlantique', 'Transport ferroviaire'],
    ['CLI-DEC-003', 'Défense Systèmes Nord', 'Défense'],
  ] as const) {
    await ins('insert into clients (id, filiale_id, nom, secteur) values ($1,$2,$3,$4)', [
      id,
      filiale,
      nom,
      secteur,
    ]);
  }

  /* ── Personnel ─────────────────────────────────────────────────────── */
  for (const [id, nom, fonction, service] of [
    ['PER-DEC-001', 'Claire Vasseur', 'RSSI', 'Direction des systèmes d’information'],
    ['PER-DEC-002', 'Malik Benali', 'Responsable production', 'Production'],
    ['PER-DEC-003', 'Hélène Roux', 'DPO', 'Juridique'],
    ['PER-DEC-004', 'Thomas Lenoir', 'Administrateur systèmes', 'Infrastructure'],
    ['PER-DEC-005', 'Sofia Marchetti', 'Responsable qualité', 'Qualité'],
    ['PER-DEC-006', 'Yann Le Guen', 'Directeur industriel', 'Direction générale'],
  ] as const) {
    await ins(
      'insert into personnes (id, filiale_id, nom, fonction, service) values ($1,$2,$3,$4,$5)',
      [id, filiale, nom, fonction, service],
    );
  }

  /* ── Actifs ────────────────────────────────────────────────────────── */
  for (const [id, nom, type, criticite, resp, desc] of [
    ['ACT-DEC-001', 'ERP de production', 'Logiciel', 'critique', 'Malik Benali',
     'Ordonnancement, nomenclatures et suivi d’atelier. Arrêt = production à l’arrêt sous 4 h.'],
    ['ACT-DEC-002', 'Serveur de fichiers plans', 'Matériel', 'critique', 'Thomas Lenoir',
     'Plans et modèles 3D sous contrainte contractuelle de confidentialité.'],
    ['ACT-DEC-003', 'Automates de la ligne 2', 'Matériel', 'critique', 'Malik Benali',
     'Automates programmables, réseau OT séparé.'],
    ['ACT-DEC-004', 'Messagerie Microsoft 365', 'Service', 'élevée', 'Thomas Lenoir',
     'Messagerie et visioconférence du groupe.'],
    ['ACT-DEC-005', 'Sauvegarde hors site', 'Service', 'critique', 'Thomas Lenoir',
     'Réplication chiffrée quotidienne vers le site secondaire.'],
    ['ACT-DEC-006', 'Poste de conception CAO', 'Matériel', 'modérée', 'Sofia Marchetti',
     'Stations de conception du bureau d’études.'],
    ['ACT-DEC-007', 'Pare-feu périmétrique', 'Matériel', 'critique', 'Thomas Lenoir',
     'Filtrage du périmètre et terminaison du VPN.'],
    ['ACT-DEC-008', 'Annuaire Active Directory', 'Logiciel', 'critique', 'Thomas Lenoir',
     'Identités et authentification de l’ensemble du personnel.'],
  ] as const) {
    await ins(
      'insert into actifs (id, filiale_id, nom, type, criticite, responsable, description) ' +
        'values ($1,$2,$3,$4,$5,$6,$7)',
      [id, filiale, nom, type, criticite, resp, desc],
    );
  }

  /* ── Processus métier (BIA) ────────────────────────────────────────── */
  for (const [id, nom, criticite, rto, rpo, resp] of [
    ['PRO-DEC-001', 'Production série', 'Vitale', '4 h', '1 h', 'Malik Benali'],
    ['PRO-DEC-002', 'Bureau d’études', 'Importante', '24 h', '4 h', 'Sofia Marchetti'],
    ['PRO-DEC-003', 'Expédition et douane', 'Vitale', '8 h', '1 h', 'Malik Benali'],
    ['PRO-DEC-004', 'Paie et ressources humaines', 'Importante', '72 h', '24 h', 'Hélène Roux'],
  ] as const) {
    await ins(
      'insert into processus (id, filiale_id, nom, criticite, rto, rpo, responsable) ' +
        'values ($1,$2,$3,$4,$5,$6,$7)',
      [id, filiale, nom, criticite, rto, rpo, resp],
    );
  }

  /* ── Risques ───────────────────────────────────────────────────────────
     ⚠️ `m_maitrise` est un COEFFICIENT entre 0 et 1, pas une note de 1 à 4 :
     la contrainte du schéma le dit, et la première rédaction de ce jeu l'avait
     lu comme une cotation. Le résiduel en découle — un risque bien maîtrisé
     descend, il ne se divise pas. Et `niveau` est clos à TROIS valeurs
     (faible / élevé / critique), pas quatre. */
  for (const [id, nom, f, g, m, desc] of [
    ['RSK-DEC-001', 'Rançongiciel sur le réseau bureautique', 3, 4, 0.5,
     'Chiffrement des serveurs bureautiques et de l’ERP par un rançongiciel entré par la messagerie.'],
    ['RSK-DEC-002', 'Fuite de plans vers un concurrent', 2, 4, 0.4,
     'Exfiltration de plans sous contrainte contractuelle par un poste compromis ou un départ.'],
    ['RSK-DEC-003', 'Arrêt prolongé de la ligne 2', 3, 3, 0.3,
     'Indisponibilité des automates par panne, erreur de configuration ou attaque du réseau OT.'],
    ['RSK-DEC-004', 'Compromission d’un compte à privilèges', 2, 4, 0.5,
     'Prise de contrôle de l’annuaire par vol d’identifiants d’administration.'],
    ['RSK-DEC-005', 'Défaillance d’un prestataire d’infogérance', 2, 3, 0.3,
     'Le prestataire d’infogérance cesse son service ou subit lui-même un incident.'],
    ['RSK-DEC-006', 'Non-conformité RGPD sur les données RH', 2, 3, 0.6,
     'Conservation au-delà de la durée déclarée, et absence de base légale documentée.'],
  ] as const) {
    const brut = f * g;
    const residuel = Math.round(brut * (1 - m) * 10) / 10;
    const niveau = residuel >= 8 ? 'critique' : residuel >= 4 ? 'élevé' : 'faible';
    await ins(
      'insert into risques (id, filiale_id, nom, f_frequence, g_gravite, m_maitrise, ' +
        'score_brut, score_residuel, niveau, description) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id, filiale, nom, f, g, m, brut, residuel, niveau, desc],
    );
  }

  /* ── Plan d'actions — dont DEUX EN RETARD, à dessein ───────────────── */
  for (const [id, titre, statut, priorite, resp, echeance, risque] of [
    ['ACN-DEC-001', 'Déployer l’authentification à deux facteurs sur les comptes à privilèges',
     'en cours', 'Haute', 'Thomas Lenoir', j(21), 'RSK-DEC-004'],
    ['ACN-DEC-002', 'Séparer le réseau OT du réseau bureautique',
     'en cours', 'Haute', 'Malik Benali', j(-12), 'RSK-DEC-003'],
    ['ACN-DEC-003', 'Éprouver la restauration des sauvegardes hors site',
     'à faire', 'Haute', 'Thomas Lenoir', j(-3), 'RSK-DEC-001'],
    ['ACN-DEC-004', 'Sensibiliser les équipes à l’hameçonnage',
     'à faire', 'Moyenne', 'Claire Vasseur', j(45), 'RSK-DEC-001'],
    ['ACN-DEC-005', 'Contractualiser les exigences de sécurité avec l’infogérant',
     'à faire', 'Moyenne', 'Claire Vasseur', j(60), 'RSK-DEC-005'],
    ['ACN-DEC-006', 'Reprendre le registre des traitements RH',
     'terminée', 'Moyenne', 'Hélène Roux', j(-30), 'RSK-DEC-006'],
  ] as const) {
    await ins(
      'insert into actions (id, filiale_id, titre, statut, priorite, responsable, echeance, ' +
        'risque_id) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, filiale, titre, statut, priorite, resp, echeance, risque],
    );
  }

  /* ── Incidents ─────────────────────────────────────────────────────── */
  for (const [id, titre, type, gravite, statut, detection, desc] of [
    ['INC-DEC-001', 'Campagne d’hameçonnage ciblant la comptabilité', 'Hameçonnage',
     'moyenne', 'clôturé', j(-48),
     'Quatre messages frauduleux imitant un fournisseur. Deux signalés, aucun clic constaté.'],
    ['INC-DEC-002', 'Poste infecté au bureau d’études', 'Rançongiciel',
     'élevée', 'en cours', j(-9),
     'Poste isolé le jour même. Analyse en cours sur l’origine — clé USB suspectée.'],
    ['INC-DEC-003', 'Indisponibilité de la messagerie (3 h)', 'Autre',
     'faible', 'clôturé', j(-21),
     'Incident du fournisseur, sans perte de données. Communiqué interne diffusé.'],
  ] as const) {
    await ins(
      'insert into incidents (id, filiale_id, titre, type, gravite, statut, date_detection, ' +
        'description) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, filiale, titre, type, gravite, statut, detection, desc],
    );
  }

  /* ── Documents — dont deux à réviser ───────────────────────────────── */
  for (const [id, titre, type, proprio, statut, revue] of [
    ['DOC-DEC-001', 'Politique de sécurité des systèmes d’information', 'Politique de sécurité (PSSI)',
     'Claire Vasseur', 'en vigueur', j(120)],
    ['DOC-DEC-002', 'Charte informatique', 'Charte informatique', 'Hélène Roux', 'à réviser', j(-15)],
    ['DOC-DEC-003', 'Procédure de gestion des incidents', 'Procédure',
     'Claire Vasseur', 'en vigueur', j(30)],
    ['DOC-DEC-004', 'Plan de continuité d’activité', 'Plan de continuité (PCA/PRA)', 'Yann Le Guen', 'en validation', j(-5)],
  ] as const) {
    await ins(
      'insert into documents (id, filiale_id, titre, type, proprietaire, statut, date_revue) ' +
        'values ($1,$2,$3,$4,$5,$6,$7)',
      [id, filiale, titre, type, proprio, statut, revue],
    );
  }

  /* ── Prestataires ──────────────────────────────────────────────────── */
  for (const [id, societe, type, criticite, acces] of [
    ['PRE-DEC-001', 'Nordinfra Services', 'Prestataire IT / Cloud', 'vitale', 'etendu'],
    ['PRE-DEC-002', 'CloudFacture SAS', 'Prestataire IT / Cloud', 'moyenne', 'limite'],
    ['PRE-DEC-003', 'Maintenance Automates Est', 'Autre', 'forte', 'limite'],
  ] as const) {
    await ins(
      'insert into prestataires (id, filiale_id, societe, type, criticite, acces) ' +
        'values ($1,$2,$3,$4,$5,$6)',
      [id, filiale, societe, type, criticite, acces],
    );
  }

  /* ── Registre RGPD ─────────────────────────────────────────────────── */
  for (const [id, nom, finalite, base, resp, duree] of [
    ['TRT-DEC-001', 'Gestion de la paie', 'Établir et verser les rémunérations',
     'Obligation légale', 'Hélène Roux', '5 ans après le départ'],
    ['TRT-DEC-002', 'Contrôle d’accès aux bâtiments', 'Sécuriser les sites industriels',
     'Intérêt légitime', 'Thomas Lenoir', '3 mois'],
    ['TRT-DEC-003', 'Gestion des candidatures', 'Recruter',
     'Consentement', 'Hélène Roux', '2 ans après le dernier contact'],
  ] as const) {
    await ins(
      'insert into traitements (id, filiale_id, nom, finalite, base_legale, responsable, ' +
        'duree_conservation) values ($1,$2,$3,$4,$5,$6,$7)',
      [id, filiale, nom, finalite, base, resp, duree],
    );
  }

  return n;
}
