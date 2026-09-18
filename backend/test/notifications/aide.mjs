/**
 * aide.mjs — le harnais du lot L12.
 *
 * ── Deux services, et une seule règle ────────────────────────────────────────
 *
 *  · **Semer de la MATIÈRE.** `semerEcheances` pose des enregistrements dont les
 *    titres, noms et descriptions sont **reconnaissables entre mille** —
 *    `ZZFUITE-…`. Le contrôle central du lot cherche ces chaînes exactes dans les
 *    octets remis au relais : sans elles, l'essai serait vert sans avoir rien
 *    mesuré. C'est la leçon des constats Q-108 et Q-116 (*« un essai vert qui n'a
 *    rien eu à compter rend le même verdict qu'un essai vert qui a tout
 *    compté »*), et elle vaut ici plus qu'ailleurs.
 *
 *  · **Monter le greffon**, en sondant d'abord si `src/api/index.ts` le monte
 *    déjà — exactement comme `test/approbations/aide.mjs`. Le jour où
 *    l'orchestrateur écrit `register(greffonNotifications, { pool, config })`,
 *    cette famille bascule sur le chemin du produit **sans rien casser**, et sa
 *    ligne d'enregistrement devient elle-même éprouvée. Le précédent qui a coûté
 *    un banc rouge : *« Method 'GET' already declared for route '/api/journal' »*.
 */

import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

/** Chemins des deux routes, tels que Fastify les nomme. */
export const CHEMIN_ETAT = '/api/notifications/etat';
export const CHEMIN_TEST = '/api/notifications/test';

/**
 * Marqueur des valeurs semées.
 *
 * ⚠️ Choisi pour être **introuvable par accident** : aucun mot du produit, aucun
 * libellé de module, aucune adresse. Si cette chaîne apparaît dans un courriel,
 * c'est qu'une valeur de base y est passée — il n'existe pas d'autre explication.
 */
export const MARQUE = 'ZZFUITE';

/** Les chaînes exactes semées en base, dans l'ordre où elles y sont écrites. */
export const SECRETS_SEMES = Object.freeze([
  `${MARQUE}-Rançongiciel sur l'ERP de Hambourg`,
  `${MARQUE}-Chiffrer les portables du site`,
  `${MARQUE}-Sauvegardes hors ligne à tester`,
  `${MARQUE}-Politique de mots de passe v3`,
  `${MARQUE}-Audit ISO 27001 de surveillance`,
  `${MARQUE}-Revue de direction du premier semestre`,
  `${MARQUE}-Marie Dupont`,
  `${MARQUE}-Jean Martin`,
  `${MARQUE}-commentaire confidentiel de l'action`,
  `${MARQUE}-Hébergeur de l'ERP de Hambourg`,
  `${MARQUE}-Questionnaire annuel du fournisseur critique`,
  `${MARQUE}-Campagne Hygiène ANSSI du Groupe`,
  `${MARQUE}-Sophie Berger`,
]);

/** Adresses de l'annuaire semé. Elles PEUVENT figurer dans l'enveloppe, jamais dans le corps. */
export const ADRESSE_MARIE = 'marie.dupont@exemple.interne';
export const ADRESSE_JEAN = 'jean.martin@exemple.interne';

const ISO = (jours, reference) => {
  const d = new Date(reference.getTime() + jours * 86_400_000);
  return d.toISOString().slice(0, 10);
};

/**
 * Sème, dans **une** filiale, un jeu d'échéances couvrant les neuf sources.
 *
 * @param base            base ouverte par `ouvrirBaseEssai`
 * @param client          connexion du compte applicatif
 * @param filiale         filiale à peupler
 * @param reference       date à partir de laquelle les décalages sont comptés
 * @param options.suffixe rend les identifiants uniques quand deux filiales sont semées
 * @param options.responsable nom du responsable inscrit dans les entités (texte libre)
 * @param options.email   adresse posée dans l'annuaire, ou `null` pour n'en poser aucune
 */
export async function semerEcheances(base, client, filiale, reference, options = {}) {
  const { perimetre } = await import('../aide/base.mjs');
  const s = options.suffixe ?? 'A';
  const responsable = options.responsable ?? SECRETS_SEMES[6];
  const email = options.email === undefined ? ADRESSE_MARIE : options.email;

  // ⚠️ `utilisateurs` est de niveau GROUPE : son écriture exige
  // `administration_groupe`, et un semis de filiale reçoit « new row violates
  // row-level security policy ». La RLS fait son travail — le compte va donc
  // dans sa propre transaction, déclarée.
  //
  // Il existe parce qu'une relance ne s'adresse qu'à une fiche que l'ANNUAIRE
  // résout (porte S6) : une adresse tapée à la main ne reçoit rien.
  if (email !== null) {
    await base.avecPerimetre(
      client,
      perimetre('semeur-l12', filiale, [filiale], true),
      async (c) => {
        await c.query(
          `insert into utilisateurs (id, identifiant, nom_affichage) values ($1, $2, $3)
             on conflict (id) do nothing`,
          [`USER-L12-${s}`, `compte.l12.${String(s).toLowerCase()}`, responsable],
        );
      },
      { annuler: false },
    );
  }

  await base.avecPerimetre(
    client,
    perimetre('semeur-l12', filiale, [filiale]),
    async (c) => {
      // L'annuaire : la SEULE source de destinataires admise (§36.2 règle 3).
      // ⚠️ `utilisateur_id` EST OBLIGATOIRE POUR RECEVOIR, depuis la porte S6.
      // Une relance ne s'adresse qu'à une fiche que l'ANNUAIRE résout : une
      // adresse tapée à la main ferait du produit un relais de courriel
      // arbitraire, et c'est ce que le §36.2 promettait déjà sans que le code le
      // tienne. Ces essais semaient des fiches SANS rattachement — ils
      // s'appuyaient sur la fuite sans le savoir, et ils sont devenus rouges le
      // jour où elle a été fermée. C'est ce qu'un banc doit faire.
      if (email !== null) {
        await c.query(
          `insert into personnes (id, filiale_id, nom, email, utilisateur_id)
                values ($1, $2, $3, $4, $5)`,
          [`PERS-L12-${s}`, filiale, responsable, email, `USER-L12-${s}`],
        );
      }

      // 1. Plan d'actions — en retard de 3 jours.
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, responsable, echeance, commentaire)
         values ($1, $2, $3, 'en cours', $4, $5, $6)`,
        [`ACT-L12-${s}`, filiale, SECRETS_SEMES[1], responsable, ISO(-3, reference), SECRETS_SEMES[8]],
      );
      // Une action TERMINÉE, à la même date : elle ne doit PAS être relancée.
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, responsable, echeance)
         values ($1, $2, 'Action terminée, hors relance', 'terminée', $3, $4)`,
        [`ACT-CLOS-${s}`, filiale, responsable, ISO(-3, reference)],
      );

      // 2. MCO — pour aujourd'hui.
      await c.query(
        `insert into mco_actions (id, filiale_id, titre, statut, responsable, date_prevue, description)
         values ($1, $2, $3, 'En cours', $4, $5, $6)`,
        [`MCO-L12-${s}`, filiale, SECRETS_SEMES[2], responsable, ISO(0, reference), SECRETS_SEMES[2]],
      );

      // 3. Revue documentaire — dans 5 jours. Locale, jamais de portée Groupe.
      await c.query(
        `insert into documents (id, filiale_id, titre, statut, proprietaire, date_revue)
         values ($1, $2, $3, 'en vigueur', $4, $5)`,
        [`DOC-L12-${s}`, filiale, SECRETS_SEMES[3], responsable, ISO(5, reference)],
      );

      // 4. Déclaration d'incident — détectée hier, donc échéance à +2 jours.
      //    ⚠️ `incidents` ne porte AUCUN responsable : cette échéance est due et
      //    n'a PAS de destinataire. Le bilan doit la compter.
      await c.query(
        `insert into incidents (id, filiale_id, titre, date_detection, declaration_anssi, description)
         values ($1, $2, $3, $4, 'à déclarer', $5)`,
        [`INC-L12-${s}`, filiale, SECRETS_SEMES[0], ISO(-1, reference), SECRETS_SEMES[0]],
      );

      // 5. Audit — dans 2 jours.
      await c.query(
        `insert into audits (id, filiale_id, reference, statut, auditeur, date_audit, synthese)
         values ($1, $2, $3, 'Planifié', $4, $5, $6)`,
        [`AUD-L12-${s}`, filiale, SECRETS_SEMES[4], responsable, ISO(2, reference), SECRETS_SEMES[4]],
      );

      // 6. Revue de direction — dans 4 jours, deux participants (un par ligne).
      await c.query(
        `insert into revues (id, filiale_id, date_revue, participants, donnees_entree)
         values ($1, $2, $3, $4, $5)`,
        [
          `REV-L12-${s}`,
          filiale,
          ISO(4, reference),
          `${responsable}\n${SECRETS_SEMES[7]}`,
          SECRETS_SEMES[5],
        ],
      );

      // 7 et 8. Les tiers (lot L21) — un prestataire dont la SOCIÉTÉ est un secret
      //    semé, portant ses trois dates contractuelles, et un questionnaire envoyé
      //    non reçu dont l'INTITULÉ en est un autre.
      //
      //    ⚠️ Ni l'un ni l'autre ne porte de responsable interne : ces échéances
      //    sont dues et n'ont PAS de destinataire, comme les incidents. Le bilan
      //    doit les compter — et le contrôle de fuite doit vérifier que ces deux
      //    chaînes ne franchissent pas le courriel.
      await c.query(
        `insert into prestataires
             (id, filiale_id, societe, criticite, acces,
              contrat_fin, contrat_revue_le, plan_sortie_le, evalue_le)
         values ($1, $2, $3, 'vitale', 'etendu', $4, $5, $6, $7)`,
        [
          `PRES-L12-${s}`,
          filiale,
          SECRETS_SEMES[9],
          ISO(6, reference),
          ISO(1, reference),
          ISO(-4, reference),
          // ⚠️ `evalue_le` est un fait PASSÉ : il ne doit produire AUCUNE
          // échéance. Le semer ici est ce qui donne du sens au décompte.
          ISO(-90, reference),
        ],
      );
      await c.query(
        `insert into questionnaires_tiers
             (id, filiale_id, prestataire_id, ref_id, intitule, envoye_le, echeance)
         values ($1, $2, $3, 'aircyber', $4, $5, $6)`,
        [`QUES-L12-${s}`, filiale, `PRES-L12-${s}`, SECRETS_SEMES[10], ISO(-20, reference), ISO(3, reference)],
      );
      // Un questionnaire DÉJÀ REÇU, à la même échéance : il ne doit PAS être
      // relancé — relancer qui a répondu est le plus sûr moyen de faire ignorer
      // les relances.
      await c.query(
        `insert into questionnaires_tiers
             (id, filiale_id, prestataire_id, ref_id, intitule, envoye_le, echeance, recu_le)
         values ($1, $2, $3, 'aircyber', 'Questionnaire reçu, hors relance', $4, $5, $6)`,
        [`QUES-CLOS-${s}`, filiale, `PRES-L12-${s}`, ISO(-20, reference), ISO(3, reference), ISO(-1, reference)],
      );

      // 9. La campagne descendante (lot L24) — ouverte, non close, non terminée, à +2 j.
      //
      //    ⚠️ **Elle exige le drapeau d'administration Groupe en écriture**, que ce semis
      //    ne pose pas : la campagne et sa part sont donc écrites dans leur propre
      //    transaction déclarée, comme `utilisateurs` plus haut. C'est la RLS qui fait
      //    son travail, pas un obstacle à contourner.
      //
      //    ⚠️ Et c'est la SEULE des neuf sources dont le destinataire n'est pas dans une
      //    entité métier : `repondant` nomme la personne qui répond pour la filiale. Le
      //    contrôle de fuite doit donc vérifier que ce nom-là non plus ne franchit pas le
      //    courriel.
      // Hors horizon : dans 60 jours. Ne doit pas être relancé.
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, responsable, echeance)
         values ($1, $2, 'Action lointaine, hors horizon', 'à faire', $3, $4)`,
        [`ACT-LOIN-${s}`, filiale, responsable, ISO(60, reference)],
      );
    },
    { annuler: false },
  );

  // ── La campagne descendante, dans sa propre transaction d'administration ──────
  //
  // ⚠️ Écrire une campagne ou convoquer une filiale exige `f_administration_groupe()` :
  // c'est la politique de la migration `044`, et la transaction de filiale ci-dessus
  // efface ce drapeau à dessein. On ouvre donc une transaction DÉCLARÉE, exactement comme
  // pour `utilisateurs` en tête de cette fonction. La RLS fait son travail ; ce n'est pas
  // un obstacle à contourner.
  await base.avecPerimetre(
    client,
    perimetre('semeur-l12', filiale, [filiale], true),
    async (c) => {
      await c.query(
        `insert into campagnes (id, ref_id, intitule, ouverte_le, echeance)
         values ($1, 'anssi', $2, $3, $4)`,
        [`CAMP-L12-${s}`, SECRETS_SEMES[11], ISO(-30, reference), ISO(2, reference)],
      );
      await c.query(
        `insert into campagne_filiales (id, filiale_id, campagne_id, repondant, accuse_le)
         values ($1, $2, $3, $4, $5)`,
        [`CAMPF-L12-${s}`, filiale, `CAMP-L12-${s}`, SECRETS_SEMES[12], ISO(-25, reference)],
      );
      // Une campagne CLOSE, à la même échéance : elle ne doit PAS être relancée — ce qui
      // n'a pas été fait est un manque qu'on constate, pas un retard qu'on rattrape.
      await c.query(
        `insert into campagnes (id, ref_id, intitule, ouverte_le, echeance, close_le)
         values ($1, 'anssi', 'Campagne close, hors relance', $2, $3, $4)`,
        [`CAMP-CLOS-${s}`, ISO(-60, reference), ISO(2, reference), ISO(-1, reference)],
      );
      await c.query(
        `insert into campagne_filiales (id, filiale_id, campagne_id)
         values ($1, $2, $3)`,
        [`CAMPF-CLOS-${s}`, filiale, `CAMP-CLOS-${s}`],
      );
    },
    { annuler: false },
  );
}

/**
 * Ouvre un pool et une configuration d'essai, sans monter de serveur HTTP.
 *
 * `monterGreffon` sert de **source unique** de la configuration : recopier ici
 * la vingtaine de variables d'environnement en ferait une seconde, et deux
 * copies d'un même réglage finissent par ne plus dire la même chose.
 */
export async function ouvrirContexte(base, supplement = {}) {
  const sonde = await monterGreffon(base, {
    utilisateurId: 'systeme',
    filialeId: null,
    filiales: [],
    perimetreGroupe: false,
    administrationGroupe: false,
  });
  const config = sonde.config;
  await sonde.fermer();

  const { creerPool } = await moduleCompile('db/pool.js');
  const pool = creerPool(config.base);
  return {
    pool,
    /** Configuration du produit, enrichie du relais que l'essai vient de monter. */
    config: { ...config, smtp: { ...config.smtp, ...supplement } },
    async fermer() {
      await pool.end().catch(() => {});
    },
  };
}

/** Réglages SMTP pointant vers un relais d'essai, prêts à surcharger `config.smtp`. */
export function smtpVers(relais, supplement = {}) {
  return {
    actif: true,
    hote: relais.hote,
    port: relais.port,
    chiffrement: 'starttls',
    modeAuth: 'basique',
    utilisateur: relais.utilisateur,
    motDePasse: relais.motDePasse,
    expediteur: 'cyber-grc@exemple.interne',
    nomExpediteur: 'Cyber GRC Groupe',
    redirectionRecette: null,
    ...supplement,
  };
}

/** Décode les octets reçus par le relais : en-têtes bruts + corps base64 décodé. */
export function lireMessage(recu) {
  const separation = recu.donnees.indexOf('\r\n\r\n');
  const entetes = recu.donnees.slice(0, separation);
  const corps = Buffer.from(recu.donnees.slice(separation + 4), 'base64').toString('utf8');
  return { entetes, corps, tout: `${entetes}\n${corps}` };
}

/* =====================================================================
 *  Montage du greffon — sonde d'abord, comme test/approbations/aide.mjs
 * ===================================================================== */

/** Session d'essai : résout un périmètre ET dit quels droits l'accompagnent. */
export class SessionDEssai {
  constructor(perimetre, droits, identite = null) {
    this.provisoire = false;
    this._perimetre = Object.freeze({ ...perimetre });
    this._droits = Object.freeze({ ...droits });
    this._identite = identite;
  }

  poser(perimetre, droits, identite = null) {
    this._perimetre = Object.freeze({ ...perimetre });
    this._droits = Object.freeze({ ...droits });
    this._identite = identite;
  }

  async resoudre() {
    return this._perimetre;
  }

  async authentifier() {
    return {
      perimetre: this._perimetre,
      droits: this._droits,
      ...(this._identite === null ? {} : { identite: this._identite }),
    };
  }

  decrire() {
    return 'session fixée par le banc d’essai (test/notifications/aide.mjs)';
  }
}

export async function monterNotifications(base, session, supplementSmtp = {}) {
  const { default: Fastify } = await import('fastify');
  const { creerPool } = await moduleCompile('db/pool.js');
  const { greffonApi } = await moduleCompile('api/index.js');
  const { greffonNotifications } = await moduleCompile('notifications/index.js');

  const sonde = await monterGreffon(base, {
    utilisateurId: 'systeme',
    filialeId: null,
    filiales: [],
    perimetreGroupe: false,
    administrationGroupe: false,
  });
  const configBrute = sonde.config;
  const dejaMonte = sonde.instance.hasRoute({ method: 'GET', url: CHEMIN_ETAT });
  await sonde.fermer();

  const config = { ...configBrute, smtp: { ...configBrute.smtp, ...supplementSmtp } };
  const pool = creerPool(config.base);
  const instance = Fastify({ logger: false, bodyLimit: config.serveur.tailleMaxCorpsOctets });

  /** Déclarations lues chez Fastify, jamais recopiées. */
  const routes = [];
  instance.addHook('onRoute', (route) => {
    if (typeof route.url === 'string' && route.url.startsWith('/api/notifications')) {
      routes.push({ methode: route.method, url: route.url, acces: route.config?.acces });
    }
  });

  await greffonApi(instance, { pool, config, resolveur: session, authentificateur: session });
  if (!dejaMonte) await instance.register(greffonNotifications, { pool, config });
  await instance.ready();

  return {
    instance,
    config,
    pool,
    routes,
    coutureBranchee: dejaMonte,

    async appeler(methode, url, options = {}) {
      const reponse = await instance.inject({
        method: methode,
        url,
        ...(options.corps === undefined ? {} : { payload: options.corps }),
        ...(options.entetes === undefined ? {} : { headers: options.entetes }),
      });
      let corps = reponse.body;
      if ((reponse.headers['content-type'] ?? '').includes('application/json')) {
        try {
          corps = JSON.parse(reponse.body);
        } catch {
          /* réponse annoncée JSON mais illisible : c'est un constat en soi */
        }
      }
      return { statut: reponse.statusCode, entetes: reponse.headers, corps };
    },

    async fermer() {
      instance.server.closeAllConnections?.();
      await instance.close().catch(() => {});
      await pool.end().catch(() => {});
    },
  };
}
