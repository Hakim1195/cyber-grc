/**
 * assistant.test.mjs — la DÉCISION de `--assistant`, jouée pour de bon (lot L18.1).
 *
 * ── Ce qui se joue ici, et ce qui a été joué à la main ───────────────────────
 *
 * Le DIALOGUE exige un terminal : il a été éprouvé le 08/09/2026 par un
 * pseudo-terminal, dans les deux branches, avec des saisies invalides — URL sans
 * schéma, mot de passe trop court, code de filiale « GROUPE » —, et les trois
 * refus ont bien bouclé. Cela ne se rejoue pas dans un banc.
 *
 * **Ce qui se rejoue ici est la décision** : quelle variable prend quelle valeur,
 * dans quelle branche. C'est de la logique pure sur un fichier texte, et c'est
 * elle qui décide **si une installation de découverte peut passer pour une
 * installation de production**. Le bloc est extrait par ses ancres
 * `# >>> banc: assistant-ecriture <<<` — une extraction par motif deviné irait
 * chercher le mauvais bloc et passerait au vert en n'éprouvant rien (Q-35).
 *
 * ── Les cinq propriétés gardées ─────────────────────────────────────────────
 *
 *  1. **En production, l'annuaire est actif et le profil n'est pas « découverte ».**
 *  2. **En découverte, le profil est ÉCRIT dans la configuration.** Sans lui, ni
 *     le `--diagnostic` ni le produit ne peuvent l'annoncer, et une installation
 *     dégradée devient une production par oubli. C'est la raison d'être du profil.
 *  3. **Aucun mot de passe ne passe en argument de commande.** Un argument est
 *     lisible par `ps` de tout compte de la machine — c'est pourquoi `install.sh`
 *     fait déjà arriver son SQL par l'entrée standard.
 *  4. **L'empreinte du compte de secours n'est PAS recalculée ici.** Elle est
 *     produite par `dist/auth/secours.js`, c'est-à-dire par le code du produit :
 *     une seconde écriture du format `scrypt$N$r$p$sel$empreinte` finirait par ne
 *     plus dire la même chose, et le compte cesserait de fonctionner sans un mot.
 *  5. **Le certificat auto-signé n'apparaît QU'EN DÉCOUVERTE.** Un certificat que
 *     personne n'a décidé, dans une installation d'entreprise, apprend aux
 *     utilisateurs à passer outre les avertissements TLS.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

import { INSTALL, extraireBloc } from '../aide/install.mjs';

const jetables = [];
after(() => {
  for (const c of jetables) rmSync(c, { recursive: true, force: true });
});

/**
 * Joue le bloc d'écriture de l'assistant avec les réponses données.
 *
 * `definir_variable` est doublée : l'essai mesure **quelle clé reçoit quelle
 * valeur**, pas la réécriture ligne à ligne du fichier — celle-là est la
 * fonction réelle d'`install.sh`, employée par tout le reste du script depuis
 * le premier jour.
 */
function jouerEcriture(reponses) {
  const racine = mkdtempSync(join(tmpdir(), 'grc-assistant-'));
  jetables.push(racine);
  const config = join(racine, 'etc');
  const source = join(racine, 'source');
  const ssl = join(racine, 'ssl');
  mkdirSync(source, { recursive: true });
  mkdirSync(join(source, 'deploy'), { recursive: true });
  writeFileSync(join(source, '.env.example'), '# modèle\nSERVEUR_PORT=3001\n');
  writeFileSync(join(source, 'deploy', 'filiales.conf.exemple'), '# modèle de filiales\n');

  let corps = extraireBloc('assistant-ecriture');
  // Substitution DÉCLARÉE et comptée : le chemin système n'existe pas ici, et
  // s'il existait il appartiendrait à une autre instance.
  const vues = corps.split('/etc/ssl/cyber-grc').length - 1;
  assert.equal(vues, 9, `/etc/ssl/cyber-grc apparaît ${vues} fois dans le bloc, 9 attendues`);
  corps = corps.split('/etc/ssl/cyber-grc').join(ssl);

  const declarations = Object.entries(reponses)
    .map(([cle, valeur]) => `${cle}=${JSON.stringify(valeur)}`)
    .join('\n');

  const script = join(racine, 'bloc.sh');
  writeFileSync(
    script,
    [
      '#!/bin/bash',
      'set -Eeuo pipefail',
      "succes() { printf '  ok %s\\n' \"$*\"; }",
      "alerte() { printf '  !! %s\\n' \"$*\"; }",
      "echec()  { printf ' ERR %s\\n' \"$*\"; exit 1; }",
      "appliquer_droits_config() { :; }",
      // Doublure : on mesure la DÉCISION, pas la réécriture du fichier.
      'definir_variable() { printf "%s=%s\\n" "$1" "$2" >> "$JOURNAL_DECISIONS"; }',
      `CONFIG=${JSON.stringify(config)}`,
      `FICHIER_CONFIG=${JSON.stringify(join(config, 'env'))}`,
      `SOURCE=${JSON.stringify(source)}`,
      `JOURNAL_DECISIONS=${JSON.stringify(join(racine, 'decisions.txt'))}`,
      'A_FILIALES=()',
      declarations,
      '',
      corps,
    ].join('\n'),
    { mode: 0o755 },
  );

  execFileSync('bash', [script], { encoding: 'utf8' });
  const decisions = Object.fromEntries(
    readFileSync(join(racine, 'decisions.txt'), 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  return { decisions, ssl, config, racine };
}

describe('install.sh --assistant — la décision', () => {
  test('production : annuaire actif, relances posées, profil non dégradé', () => {
    const { decisions, ssl } = jouerEcriture({
      A_PROFIL: 'production',
      A_URL: 'https://grc.essai.interne',
      A_LDAP_URL: 'ldaps://dc01.essai.interne:636',
      A_LDAP_BASE: 'DC=essai,DC=interne',
      A_LDAP_DN: 'CN=svc-grc,DC=essai,DC=interne',
      A_LDAP_MDP: 'secret-du-compte-de-service',
      A_SMTP_HOTE: 'smtp.essai.interne',
      A_SMTP_PORT: '587',
      A_SMTP_EXP: 'grc@essai.interne',
    });

    assert.equal(decisions['CYBER_GRC_PROFIL'], 'production');
    assert.equal(decisions['AUTH_LDAP_ACTIF'], 'oui');
    assert.equal(decisions['LDAP_URL'], 'ldaps://dc01.essai.interne:636');
    assert.equal(decisions['SMTP_ACTIF'], 'oui');
    assert.equal(decisions['SMTP_HOTE'], 'smtp.essai.interne');
    assert.equal(decisions['SERVEUR_URL_PUBLIQUE'], 'https://grc.essai.interne');

    // Propriété 4 : l'empreinte n'est pas produite ici.
    assert.equal(
      decisions['AUTH_COMPTE_SECOURS_EMPREINTE'],
      undefined,
      "l'assistant pose une empreinte de secours lui-même : elle doit venir de " +
        'dist/auth/secours.js, sans quoi le format scrypt est écrit à deux endroits.',
    );

    // Propriété 5 : aucun certificat en production.
    assert.equal(
      existsSync(join(ssl, 'serveur.crt')),
      false,
      "un certificat auto-signé a été engendré en PRODUCTION : personne ne l'a décidé.",
    );
  });

  test('découverte : le profil est ÉCRIT, aucune relance, certificat auto-signé', () => {
    const { decisions, ssl } = jouerEcriture({
      A_PROFIL: 'decouverte',
      A_URL: 'https://decouverte.local',
      A_SECOURS_ID: 'secours.grc',
      A_SMTP_HOTE: '',
    });

    assert.equal(
      decisions['CYBER_GRC_PROFIL'],
      'decouverte',
      'le profil découverte n’est pas écrit dans la configuration : ni le diagnostic ' +
        'ni le produit ne pourront l’annoncer, et l’installation deviendra une ' +
        'production par oubli.',
    );
    assert.equal(decisions['AUTH_LDAP_ACTIF'], 'non');
    assert.equal(decisions['AUTH_COMPTE_SECOURS_IDENTIFIANT'], 'secours.grc');
    assert.equal(decisions['SMTP_ACTIF'], 'non');
    assert.equal(decisions['LDAP_URL'], undefined, 'une URL d’annuaire est posée sans annuaire');

    assert.ok(existsSync(join(ssl, 'serveur.crt')), 'aucun certificat de découverte engendré');
    assert.ok(existsSync(join(ssl, 'serveur.key')), 'aucune clé de découverte engendrée');
    assert.ok(
      existsSync(join(ssl, 'chaine-pki-interne.crt')),
      'le vhost livré exige une chaîne : sans elle Apache refuse de démarrer',
    );

    // Le certificat porte bien le nom demandé — un certificat pour un autre nom
    // ferait échouer la vérification sans que personne comprenne pourquoi.
    const sujet = execFileSync(
      'openssl',
      ['x509', '-in', join(ssl, 'serveur.crt'), '-noout', '-subject'],
      { encoding: 'utf8' },
    );
    assert.match(sujet, /decouverte\.local/);
  });

  test('aucun mot de passe ne passe en argument de commande', () => {
    const source = readFileSync(INSTALL, 'utf8');
    const debut = source.indexOf('if [[ $ASSISTANT -eq 1 ]]; then');
    assert.notEqual(debut, -1, "le mode --assistant est introuvable");
    const fin = source.indexOf('#  --diagnostic —', debut);
    assert.notEqual(fin, -1, 'la borne de fin du mode --assistant est introuvable');
    const bloc = source.slice(debut, fin);
    assert.ok(bloc.length > 2000, `bloc anormalement court (${bloc.length} o)`);

    const lignes = bloc
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    for (const secret of ['$A_LDAP_MDP', '$SECOURS_MDP', '$A_SEC1', '$A_SEC2']) {
      for (const ligne of lignes) {
        if (!ligne.includes(secret)) continue;
        const permise =
          /^definir_variable /.test(ligne) ||
          /^SECOURS_MDP=/.test(ligne) ||
          /^unset /.test(ligne) ||
          /^\[\[ /.test(ligne) ||
          /^A_SEC/.test(ligne);
        assert.ok(
          permise,
          `« ${secret} » apparaît dans une commande : un argument est lisible par ` +
            `\`ps\` de tout compte de la machine.\n      ${ligne}`,
        );
      }
    }
  });

  test('le calcul de l’empreinte emploie le code du produit, pas une recopie', () => {
    const source = readFileSync(INSTALL, 'utf8');
    assert.match(
      source,
      /dist\/auth\/secours\.js/,
      "l'empreinte du compte de secours ne passe plus par dist/auth/secours.js",
    );
    assert.ok(
      !/scrypt\$\{|scryptSync|pbkdf2/.test(source),
      'install.sh recalcule une empreinte lui-même : le format scrypt serait écrit ' +
        'à deux endroits, et la copie resterait en arrière au premier changement.',
    );
    // Le mot de passe arrive par l'entrée standard, jamais en argument.
    assert.match(source, /printf '%s' "\$SECOURS_MDP" \| node/);
  });
});
