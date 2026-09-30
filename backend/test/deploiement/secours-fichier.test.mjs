/**
 * secours-fichier.test.mjs — installer SANS terminal, et que rien ne réussisse en silence.
 *
 * Trouvé le 30/09/2026 par l'agent qui installait en labo, puis relu par lui : sans
 * terminal, le profil découverte installait un service qui REFUSE DE DÉMARRER — aucune
 * porte (AUTH_LDAP_ACTIF=non, aucune empreinte), aucun certificat (engendré par le seul
 * assistant), aucun vhost actif (jamais a2ensite), et une URL par défaut qui était la
 * recette de l'AUTEUR. Chaque essai ici joue le code réel d'install.sh sur une doublure.
 */
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, test } from 'node:test';
import { extraireBloc, extraireFonction, jouerScript } from '../aide/install.mjs';

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dossiers = [];
after(() => { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'sans-terminal-')); dossiers.push(d); return d; };

describe('--secours-fichier : un mot de passe sans terminal, jamais en clair ailleurs', () => {
  const corps = extraireFonction('lire_secours_fichier');
  function jouer(motDePasse, mode) {
    const d = tmp(); const f = join(d, 'secours.txt'); writeFileSync(f, `${motDePasse}\n`); chmodSync(f, mode);
    const r = jouerScript(`${corps}\nlire_secours_fichier "${f}"\nprintf 'MDP=[%s]\\n' "$SECOURS_MDP"\n`, {}, d, 'secours');
    return { ...r, reste: existsSync(f) };
  }
  test('fichier 0600, douze caractères ou plus : lu SANS son retour à la ligne — et GARDÉ jusqu’à l’écriture de l’empreinte', () => {
    const r = jouer('Labo-Decouverte-2026', 0o600);
    assert.equal(r.code, 0, r.sortie);
    assert.match(r.sortie, /MDP=\[Labo-Decouverte-2026\]/);
    // Relecture de l'agent : effacé à la lecture, tout échec avant l'empreinte perdait le
    // mot de passe. Il n'est consommé qu'après « scrypt$ » écrit dans la configuration.
    assert.equal(r.reste, true, 'le fichier survit à la lecture ; il est effacé après l’empreinte');
  });
  test('🛑 fichier lisible par d’autres (0644) : REFUSÉ, fichier intact', () => {
    const r = jouer('Labo-Decouverte-2026', 0o644);
    assert.notEqual(r.code, 0); assert.match(r.sortie, /0600/); assert.equal(r.reste, true);
  });
  test('moins de douze caractères : REFUSÉ', () => {
    const r = jouer('court', 0o600);
    assert.notEqual(r.code, 0); assert.match(r.sortie, /douze/);
  });
});

describe('Le bloc « valeurs manquantes » refuse en code 2, en NOMMANT, avant la base', () => {
  const bloc = extraireBloc('valeurs-manquantes');
  /** Joue le bloc réel avec une configuration donnée (doublure de lire_variable). */
  function jouer(config, variables = {}) {
    const d = tmp();
    const doublure = 'lire_variable() { case "$1" in ' +
      // Guillemets SIMPLES : une empreinte scrypt$16384$8$… entre guillemets doubles ferait
      // expandre $8 par bash — mesuré : « unbound variable », et la doublure rendait vide.
      Object.entries(config).map(([k, v]) => `${k}) printf '%s' '${String(v).replaceAll("'", `'\\''`)}' ;;`).join(' ') +
      ' *) printf "" ;; esac; }\n';
    const filiales = `filiales_declarees_fichier() { echo ${variables.FICHIER_N ?? 2}; }\nfiliales_actives_en_base() { echo ${variables.BASE_N ?? 0}; }\n`;
    const { FICHIER_N, BASE_N, ...vars } = variables;
    return jouerScript(doublure + filiales + bloc, { SEULEMENT_BASE: '0', PREMIERE_INSTALLATION: '1', FICHIER_CONFIG: '/x/env', FICHIER_FILIALES: '/x/filiales.conf', SECOURS_MDP: '', ...vars }, d, 'manquantes');
  }
  const decouverte = { SERVEUR_URL_PUBLIQUE: 'https://grc.labo.interne', AUTH_LDAP_ACTIF: 'non', SMTP_ACTIF: 'non' };

  test('🛑 sans annuaire, sans empreinte, sans fichier : code 2, AUTH_COMPTE_SECOURS_EMPREINTE nommée, les deux issues nommées', () => {
    const r = jouer(decouverte);
    assert.equal(r.code, 2, r.sortie);
    assert.match(r.sortie, /AUTH_COMPTE_SECOURS_EMPREINTE/);
    assert.match(r.sortie, /--assistant/); assert.match(r.sortie, /--secours-fichier=/);
  });
  test('le même, avec le mot de passe fourni (--secours-fichier lu) : passe', () => {
    const r = jouer(decouverte, { SECOURS_MDP: 'Labo-Decouverte-2026' });
    assert.equal(r.code, 0, r.sortie); assert.match(r.sortie, /valeurs propres au déploiement renseignées/);
  });
  test('le même, avec une empreinte déjà posée : passe', () => {
    const r = jouer({ ...decouverte, AUTH_COMPTE_SECOURS_EMPREINTE: 'scrypt$16384$8$1$sel$x' });
    assert.equal(r.code, 0, r.sortie);
  });
  test('🛑 AUCUNE filiale, ni dans le fichier ni en base : code 2, filiales.conf nommée, l’exemple donné — mesuré en labo : 403 pour le compte de secours', () => {
    const r = jouer({ ...decouverte, AUTH_COMPTE_SECOURS_EMPREINTE: 'scrypt$x' }, { FICHIER_N: '0', BASE_N: '0' });
    assert.equal(r.code, 2, r.sortie);
    assert.match(r.sortie, /filiales\.conf/); assert.match(r.sortie, /PERSONNE/); assert.match(r.sortie, /TLS ; Site de Toulouse ; FR ; oui/);
  });
  test('fichier vide mais une filiale déjà en base (mise à jour) : passe', () => {
    const r = jouer({ ...decouverte, AUTH_COMPTE_SECOURS_EMPREINTE: 'scrypt$x' }, { FICHIER_N: '0', BASE_N: '1' });
    assert.equal(r.code, 0, r.sortie);
  });
  test('🛑 l’URL de la recette de l’AUTEUR (grc-test.site) est REFUSÉE nommément — plus jamais une installation silencieuse sous ce nom', () => {
    const r = jouer({ ...decouverte, SERVEUR_URL_PUBLIQUE: 'https://grc-test.site', AUTH_COMPTE_SECOURS_EMPREINTE: 'scrypt$x' });
    assert.equal(r.code, 2, r.sortie);
    assert.match(r.sortie, /SERVEUR_URL_PUBLIQUE/); assert.match(r.sortie, /recette de l'AUTEUR/);
  });
});

describe('🛑 Aucune affectation « $( … grep … ) » d’install.sh ne s’arrête sur zéro correspondance', () => {
  // Cinquième arrêt du labo, 30/09/2026 : sur une PKI SAINE, grep 'verify error' ne trouve
  // rien, rend 1, pipefail le propage, set -e coupe l'affectation — l'installateur
  // s'arrêtait précisément quand tout était bon. La classe se BALAIE, elle ne se liste pas.
  const source = readFileSync(join(BACKEND, 'deploy', 'install.sh'), 'utf8');
  test('chaque affectation, lignes de continuation jointes, porte « || true » (ou un repli)', () => {
    const lignes = source.split('\n'); const nues = [];
    for (let i = 0; i < lignes.length; i += 1) {
      if (!/^\s*[A-Za-z_][A-Za-z0-9_]*="\$\(/.test(lignes[i])) continue;
      let corps = lignes[i]; let j = i;
      while (corps.trimEnd().endsWith('\\') && j + 1 < lignes.length) { j += 1; corps += '\n' + lignes[j]; }
      if (!/\bgrep\b/.test(corps)) continue;
      if (!/\|\|\s*(true|:|printf|echo)\b/.test(corps)) nues.push(`${i + 1}: ${lignes[i].trim().slice(0, 90)}`);
    }
    assert.deepEqual(nues, [], `Affectation(s) qui tomberai(en)t sous pipefail sur zéro correspondance :\n  ${nues.join('\n  ')}`);
    assert.ok(source.split('\n').filter((l) => /^\s*[A-Za-z_]+="\$\(.*\bgrep\b/.test(l)).length >= 8, 'le balayage doit voir les affectations ; il en voit trop peu');
  });
  test('la ligne MOTIF_OPENSSL, jouée sous set -Eeuo pipefail avec « Verification: OK » (aucune ligne d’erreur), SURVIT', () => {
    const ligne = source.split('\n').find((l) => l.includes('MOTIF_OPENSSL="$(printf'));
    assert.ok(ligne, 'la ligne MOTIF_OPENSSL a disparu ou changé de forme');
    const d = tmp();
    const r = jouerScript(`SORTIE_TLS=$'Protocol version: TLSv1.2\\nPeer certificate: CN=AD-01.dedaero.lan\\nVerification: OK\\nDONE'\n${ligne.trim()}\nprintf 'MOTIF=[%s]\\n' "$MOTIF_OPENSSL"\n`, {}, d, 'motif');
    assert.equal(r.code, 0, r.sortie);
    assert.match(r.sortie, /MOTIF=\[\]/, 'aucun motif : la PKI est saine, et l’installateur continue');
  });
});

describe('Le compteur de filiales lit le format du §27, et rien d’autre', () => {
  test('commentaires, lignes vides et « non » ne comptent pas ; « oui » compte, espaces compris', () => {
    const corps = extraireFonction('filiales_declarees_fichier');
    const d = tmp(); const f = join(d, 'filiales.conf');
    writeFileSync(f, '# modèle\n\nTLS ; Site de Toulouse ; FR ; oui\nDEU ; Filiale allemande ; DE ;  OUI \nOLD ; Ancienne ; FR ; non\n');
    const r = jouerScript(`${corps}\nfiliales_declarees_fichier "${f}"\nfiliales_declarees_fichier "${d}/absent.conf"\n`, {}, d, 'compte');
    assert.equal(r.code, 0, r.sortie);
    assert.deepEqual(r.sortie.trim().split('\n'), ['2', '0']);
  });
});

describe('Découverte sans terminal : certificat et vhost, par le même code que l’assistant', () => {
  test('engendrer_certificat_decouverte : trois fichiers, SAN au nom demandé, idempotent', () => {
    const corps = extraireFonction('engendrer_certificat_decouverte');
    const d = tmp(); const rep = join(d, 'ssl');
    const r = jouerScript(`${corps}\nengendrer_certificat_decouverte grc.labo.interne "${rep}"\nengendrer_certificat_decouverte autre.nom "${rep}"\n`, {}, d, 'cert');
    assert.equal(r.code, 0, r.sortie);
    for (const f of ['serveur.crt', 'serveur.key', 'chaine-pki-interne.crt']) assert.ok(existsSync(join(rep, f)), f);
    const san = execFileSync('openssl', ['x509', '-in', join(rep, 'serveur.crt'), '-noout', '-ext', 'subjectAltName'], { encoding: 'utf8' });
    assert.match(san, /DNS:grc\.labo\.interne/, 'le SAN porte le nom demandé');
    assert.doesNotMatch(san, /autre\.nom/, 'le second appel ne réécrit pas un certificat existant');
    assert.match(r.sortie, /AUTO-SIGNÉ/);
  });
  test('poser_nom_vhost : les DEUX ServerName du vhost livré passent au nom de l’installation', () => {
    const corps = extraireFonction('poser_nom_vhost');
    const d = tmp(); const vhost = join(d, 'cyber-grc.conf');
    copyFileSync(join(BACKEND, 'deploy', 'apache', 'cyber-grc.conf'), vhost);
    assert.equal((readFileSync(vhost, 'utf8').match(/ServerName grc-test\.site/g) ?? []).length, 2, 'le vhost livré porte deux fois le nom de la recette');
    const r = jouerScript(`${corps}\nposer_nom_vhost "${vhost}" grc.labo.interne\n`, {}, d, 'vhost');
    assert.equal(r.code, 0, r.sortie);
    const apres = readFileSync(vhost, 'utf8');
    assert.equal((apres.match(/ServerName grc\.labo\.interne/g) ?? []).length, 2);
    assert.doesNotMatch(apres, /^\s*ServerName\s+grc-test\.site/m, 'aucun ServerName ne porte plus la recette de l’auteur (un commentaire d’histoire peut la citer)');
  });
});
