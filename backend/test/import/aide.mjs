/**
 * aide.mjs — monter l'import **sur le vrai greffon d'API**, et fabriquer de quoi
 * l'éprouver.
 *
 * ── Le montage ──────────────────────────────────────────────────────────────
 *
 * `greffonApi` est appelé **directement** plutôt que par `register()` : appelée
 * sans encapsulation, cette fonction pose ses crochets sur l'instance racine. Les
 * routes d'import — qu'elle enregistre elle-même — passent donc par :
 *
 *   · le crochet `onRequest` réel : rythme, authentification, `deciderAcces` sur
 *     la déclaration portée par chaque route ;
 *   · le traitement d'erreur réel, celui qui garantit qu'aucun message de
 *     PostgreSQL ne sort ;
 *   · l'analyseur de type de contenu du greffon d'import, donc sa borne de corps.
 *
 * Le second enregistrement est **conditionnel** et le banc **constate** ce que le
 * point d'entrée a monté, plutôt que de supposer l'un des deux états de la
 * couture — même arbitrage, et même raison, que `test/pieces/aide.mjs`.
 *
 * ── Les producteurs de fichiers ─────────────────────────────────────────────
 *
 * ⚠️ **Le classeur d'essai est écrit ICI, indépendamment de `src/import/`.** Il ne
 * partage aucune ligne avec `classeur.ts` : chaînes partagées plutôt que chaînes
 * en ligne, entrées ZIP **stockées** plutôt que dégonflées, ordre des parties
 * différent. Un producteur dérivé du lecteur qu'il éprouve ne prouverait que
 * leur accord ; celui-ci les met d'accord par le **format**.
 */

import { deflateRawSync } from 'node:zlib';

import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

/* =====================================================================
 *  Session d'essai
 * ===================================================================== */

/**
 * Session qui dit **qui parle** et **quels droits l'accompagnent**.
 *
 * Contrat respecté à la lettre : `resoudre()` ne prend aucun argument, et rien
 * ici ne lit la requête.
 */
export class SessionDEssai {
  constructor(perimetre, droits) {
    this.provisoire = false;
    this._perimetre = Object.freeze({ ...perimetre });
    this._droits = Object.freeze({ ...droits });
  }

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
    return 'session fixée par le banc d’essai (test/import/aide.mjs)';
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

export async function monterImport(base, session, ecarts = {}) {
  const { default: Fastify } = await import('fastify');
  const { creerPool } = await moduleCompile('db/pool.js');
  const { greffonApi } = await moduleCompile('api/index.js');
  const { greffonImport } = await moduleCompile('import/index.js');

  // Configuration du harnais partagé, puis un montage jetable qu'on referme :
  // deux copies d'un même réglage finissent par ne plus dire la même chose.
  const provisoire = await monterGreffon(base, perimetreDe('systeme', null, []));
  const configBase = provisoire.config;
  await provisoire.fermer();

  const config = {
    ...configBase,
    ...(ecarts.serveur === undefined
      ? {}
      : { serveur: { ...configBase.serveur, ...ecarts.serveur } }),
  };

  const pool = creerPool(config.base);
  const instance = Fastify({ logger: false, bodyLimit: config.serveur.tailleMaxCorpsOctets });

  /** Déclarations d'accès telles que Fastify les voit — lues, jamais recopiées. */
  const routes = [];
  instance.addHook('onRoute', (route) => {
    if (typeof route.url === 'string' && route.url.startsWith('/api/import')) {
      routes.push({ methode: route.method, url: route.url, acces: route.config?.acces });
    }
  });

  await greffonApi(instance, { pool, config, resolveur: session, authentificateur: session });
  const coutureBranchee = routes.length > 0;
  if (!coutureBranchee) await greffonImport(instance, { pool, config });
  await instance.ready();

  return {
    instance,
    config,
    pool,
    routes,
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

    /**
     * Dépose un fichier d'import.
     *
     * @param {string} entite
     * @param {{nom: string, contenu: Buffer|string, type?: string}} fichier
     * @param {{appliquer?: boolean, extras?: object[]}} [options]
     */
    async importer(entite, fichier, options = {}) {
      const enveloppe = corpsMultipart([
        {
          nom: 'fichier',
          nomFichier: fichier.nom,
          type: fichier.type ?? 'application/octet-stream',
          contenu: fichier.contenu,
        },
        ...(options.extras ?? []),
      ]);
      const suffixe = options.appliquer === true ? '?appliquer=oui' : '';
      return this.appeler('POST', `/api/import/${entite}${suffixe}`, {
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
    },
  };
}

/* =====================================================================
 *  Corps multipart — écrit d'après le RFC, pas d'après l'analyseur
 * ===================================================================== */

export function corpsMultipart(
  parties,
  frontiere = `----EssaiImport${Math.random().toString(36).slice(2)}`,
) {
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
    blocs.push(
      Buffer.isBuffer(partie.contenu)
        ? partie.contenu
        : Buffer.from(String(partie.contenu), 'utf8'),
    );
    blocs.push(Buffer.from('\r\n', 'latin1'));
  }
  blocs.push(Buffer.from(`--${frontiere}--\r\n`, 'latin1'));
  return { corps: Buffer.concat(blocs), contentType: `multipart/form-data; boundary=${frontiere}` };
}

/* =====================================================================
 *  Un écrivain XLSX indépendant — voir l'entête
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

/**
 * Assemble un ZIP. `compresser: false` écrit des entrées **stockées** —
 * délibérément l'autre méthode que celle de `src/import/classeur.ts`, pour que
 * les deux chemins de `zip.ts` soient empruntés par le banc.
 */
export function zipEssai(entrees, { compresser = false } = {}) {
  const locaux = [];
  const centraux = [];
  let decalage = 0;

  for (const entree of entrees) {
    const nom = Buffer.from(entree.nom, 'utf8');
    const donnees = Buffer.isBuffer(entree.contenu)
      ? entree.contenu
      : Buffer.from(entree.contenu, 'utf8');
    const compresse = compresser ? deflateRawSync(donnees) : donnees;
    const methode = compresser ? 8 : 0;
    const crc = crc32(donnees);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(methode, 8);
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
    central.writeUInt16LE(methode, 10);
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

const echapper = (valeur) =>
  String(valeur)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function lettresColonne(index) {
  let reste = index;
  let lettres = '';
  do {
    lettres = String.fromCharCode(65 + (reste % 26)) + lettres;
    reste = Math.floor(reste / 26) - 1;
  } while (reste >= 0);
  return lettres;
}

/**
 * Fabrique un `.xlsx` réel, **à chaînes partagées**.
 *
 * C'est la forme que produit Excel — et donc celle que `src/import/tableur.ts`
 * rencontrera en production, alors que le modèle qu'il engendre lui-même emploie
 * des chaînes en ligne. Les deux chemins sont ainsi éprouvés.
 *
 * @param {(string|number|boolean|null)[][]} lignes
 * @param {{nomFeuille?: string, secondeFeuille?: (string)[][], compresser?: boolean}} [options]
 */
export function xlsxEssai(lignes, options = {}) {
  const chaines = [];
  const index = new Map();
  const partager = (texte) => {
    if (!index.has(texte)) {
      index.set(texte, chaines.length);
      chaines.push(texte);
    }
    return index.get(texte);
  };

  const feuilleXml = (contenu) => {
    const corps = contenu
      .map((cellules, ligne) => {
        const cases = cellules
          .map((valeur, colonne) => {
            if (valeur === null || valeur === undefined || valeur === '') return '';
            const reference = `${lettresColonne(colonne)}${ligne + 1}`;
            if (typeof valeur === 'number') {
              return `<c r="${reference}"><v>${String(valeur)}</v></c>`;
            }
            if (typeof valeur === 'boolean') {
              return `<c r="${reference}" t="b"><v>${valeur ? '1' : '0'}</v></c>`;
            }
            return `<c r="${reference}" t="s"><v>${String(partager(String(valeur)))}</v></c>`;
          })
          .join('');
        return `<row r="${String(ligne + 1)}">${cases}</row>`;
      })
      .join('');
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${corps}</sheetData></worksheet>`
    );
  };

  const feuilles = [lignes, ...(options.secondeFeuille === undefined ? [] : [options.secondeFeuille])];
  const xmlFeuilles = feuilles.map((contenu) => feuilleXml(contenu));

  const chainesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${String(chaines.length)}" uniqueCount="${String(chaines.length)}">` +
    chaines.map((texte) => `<si><t xml:space="preserve">${echapper(texte)}</t></si>`).join('') +
    '</sst>';

  const classeur =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    feuilles
      .map(
        (_, position) =>
          `<sheet name="${echapper(position === 0 ? (options.nomFeuille ?? 'Donnees') : `Feuille${String(position + 1)}`)}" sheetId="${String(position + 1)}" r:id="rId${String(position + 1)}"/>`,
      )
      .join('') +
    '</sheets></workbook>';

  const relations =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    feuilles
      .map(
        (_, position) =>
          `<Relationship Id="rId${String(position + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/feuille${String(position + 1)}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="rId${String(feuilles.length + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
    '</Relationships>';

  const types =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '</Types>';

  // ⚠️ Le nom des feuilles est `feuilleN.xml`, PAS `sheetN.xml` : le lecteur doit
  // passer par `workbook.xml` et ses relations pour les trouver, et non par le
  // chemin conventionnel. Un lecteur qui devinerait `xl/worksheets/sheet1.xml`
  // échouerait ici — c'est exactement ce qu'on veut mesurer.
  return zipEssai(
    [
      { nom: '[Content_Types].xml', contenu: types },
      { nom: '_rels/.rels', contenu: '<?xml version="1.0"?><Relationships/>' },
      { nom: 'xl/workbook.xml', contenu: classeur },
      { nom: 'xl/_rels/workbook.xml.rels', contenu: relations },
      { nom: 'xl/sharedStrings.xml', contenu: chainesXml },
      ...xmlFeuilles.map((xml, position) => ({
        nom: `xl/worksheets/feuille${String(position + 1)}.xml`,
        contenu: xml,
      })),
    ],
    { compresser: options.compresser === true },
  );
}

/** Assemble un CSV à séparateur `;`, avec citation RFC 4180. */
export function csvEssai(lignes, separateur = ';') {
  return Buffer.from(
    lignes
      .map((cellules) =>
        cellules
          .map((valeur) => {
            const texte = valeur === null || valeur === undefined ? '' : String(valeur);
            return new RegExp(`["\r\n${separateur === '\t' ? '\\t' : separateur}]`).test(texte)
              ? `"${texte.replace(/"/g, '""')}"`
              : texte;
          })
          .join(separateur),
      )
      .join('\r\n') + '\r\n',
    'utf8',
  );
}
