/**
 * deploiement.test.mjs — **l'unité et le minuteur sont ENVOYÉS à systemd, pas
 * relus par nous.**
 *
 * Trois propriétés, et chacune vient d'un défaut réel de ce dépôt :
 *
 *  1. **`systemd-analyze verify` accepte les deux unités** (constat Q-63 : huit
 *     passages de porte avaient écrit « systemd non éprouvé » alors que l'outil
 *     était installé). Un contrôle qui compare deux fichiers ne contrôle rien ;
 *     celui-ci demande son avis à systemd.
 *  2. **`ExecStart` désigne un fichier qui existe après compilation** (constat
 *     Q-65 : une unité codait un chemin de Node que rien ne confrontait à la
 *     machine). Le chemin de déploiement est `/opt/cyber-grc/backend`, absent
 *     ici : on en vérifie donc la moitié qui nous appartient — le chemin
 *     RELATIF sous `dist/`, celui que `npm run build` produit.
 *  3. **La sortie réseau est ouverte, et étroitement** : `IPAddressDeny=any`
 *     présent, `IPAddressAllow=any` absent. C'est la seule unité des trois qui
 *     doive sortir de la machine, et c'est là que l'erreur se paie (§ « réseau »
 *     de l'unité).
 */

import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { promisify } from 'node:util';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { compilerSiNecessaire, RACINE_BACKEND } from '../aide/serveur.mjs';
import { exigerOutil } from '../aide/outils.mjs';
import { ADRESSE_MARIE, MARQUE, lireMessage, semerEcheances, smtpVers } from './aide.mjs';
import { monterRelaisEssai } from './serveur-smtp.mjs';

const executer = promisify(execFile);

const SERVICE = join(RACINE_BACKEND, 'deploy', 'systemd', 'cyber-grc-notifications.service');
const TIMER = join(RACINE_BACKEND, 'deploy', 'systemd', 'cyber-grc-notifications.timer');

const lire = (chemin) => readFileSync(chemin, 'utf8');
/** Les directives actives, commentaires retirés. */
const directives = (texte) =>
  texte
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));

before(async () => {
  await compilerSiNecessaire();
});

describe('L12 — l’unité systemd et son minuteur', () => {
  test('systemd accepte les deux unités (Q-63 : on le lui DEMANDE)', () => {
    // `exigerOutil` échoue en disant quoi installer ; il ne se saute pas — un
    // essai vert parce qu'un binaire est absent est un décor (constat Q-37).
    exigerOutil('systemd-analyze', ['--version'], 'Il est fourni par le paquet « systemd », et cet essai éprouve les unités livrées.');
    for (const unite of [SERVICE, TIMER]) {
      const sortie = execFileSync('systemd-analyze', ['verify', unite], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      assert.equal(sortie.trim(), '', `systemd critique ${unite} :\n${sortie}`);
    }
  });

  test('le durcissement est mesuré, pas déclaré (systemd-analyze security)', () => {
    exigerOutil('systemd-analyze', ['--version'], 'Il est fourni par le paquet « systemd », et cet essai éprouve les unités livrées.');
    const sortie = execFileSync('systemd-analyze', ['security', '--offline=true', SERVICE], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const note = /Overall exposure level for [^:]+: ([\d.]+)/u.exec(sortie);
    assert.ok(note, `note d'exposition introuvable :\n${sortie.slice(-400)}`);
    // `cyber-grc.service` et `cyber-grc-reanalyse.service` obtiennent 1.3 ;
    // cette unité sort du réseau, elle ne doit pas être pire pour autant.
    assert.ok(
      Number(note[1]) <= 2.0,
      `exposition ${note[1]} : au-delà du niveau des deux autres unités (1.3)`,
    );
  });

  test('ExecStart désigne un fichier que « npm run build » produit vraiment (Q-65)', () => {
    const ligne = directives(lire(SERVICE)).find((l) => l.startsWith('ExecStart='));
    assert.ok(ligne, 'ExecStart absent');
    const chemin = ligne.split('=')[1].trim().split(/\s+/)[1];
    assert.match(chemin, /\/dist\/notifications\/relances\.js$/u);

    const relatif = chemin.slice(chemin.indexOf('/dist/') + 1);
    const surDisque = join(RACINE_BACKEND, relatif);
    assert.ok(
      existsSync(surDisque),
      `ExecStart pointe sur ${relatif}, que la compilation ne produit pas`,
    );
    // …et ce fichier est bien un point d'entrée : il se lance seul.
    assert.match(readFileSync(surDisque, 'utf8'), /executeDirectement/u);
  });

  test('la sortie réseau est ouverte, et refuse de l’être en grand', () => {
    const lignes = directives(lire(SERVICE));
    assert.ok(lignes.includes('IPAddressDeny=any'), 'IPAddressDeny=any manquant');
    assert.ok(lignes.includes('IPAddressAllow=localhost'));
    assert.ok(
      !lignes.some((l) => /^IPAddressAllow=any$/u.test(l)),
      'IPAddressAllow=any rendrait toute la section décorative',
    );
    // La résolution de noms passe par netlink : sans AF_NETLINK, le relais
    // devient injoignable par intermittence.
    assert.ok(lignes.some((l) => l.startsWith('RestrictAddressFamilies=') && l.includes('AF_NETLINK')));
    // Un secret vit en mémoire de ce processus (SMTP_MOT_DE_PASSE) : pas d'image
    // mémoire sur le disque (contrôle S8).
    assert.ok(lignes.includes('LimitCORE=0'));
  });

  /* ═══════════════════════════════════════════════════════════════════════
     LA MOITIÉ QUI MANQUAIT — constat **Q-199** de la porte S6

     L'essai ci-dessus n'était pas faux : `IPAddressDeny=any` +
     `IPAddressAllow=localhost` est bien le durcissement voulu. Il ne posait
     simplement jamais la seconde question — **et le lot peut-il envoyer ?**
     Réponse mesurée par l'auditeur : non. Avec `SMTP_ACTIF=oui` et un relais
     Office 365 — c'est-à-dire la configuration du cadrage —, chaque envoi est
     refusé par le NOYAU, et le journal dit « Relais injoignable ».

     `install.sh` posait l'unité telle quelle puis armait le minuteur. Le seul
     contrôle de couverture du dépôt interrogeait `systemctl show … cyber-grc`,
     **l'unité applicative**, jamais celle-ci — et il vivait dans le bloc
     « AUTH_LDAP_ACTIF », donc disparaissait chez un client sans annuaire.

     ⚠️ Le banc était VERT sur la configuration qui empêche le lot de marcher.
     C'est la forme la plus coûteuse de « un essai vert qui n'a rien eu à
     mesurer » : celui-ci mesurait, mais il mesurait l'autre moitié.
     ═══════════════════════════════════════════════════════════════════════ */
  describe('Q-199 — l’installateur refuse d’armer un minuteur qui ne peut pas envoyer', () => {
    const installateur = readFileSync(join(RACINE_BACKEND, 'deploy', 'install.sh'), 'utf8');

    test('il INTERROGE l’unité de notification, pas seulement l’unité applicative', () => {
      assert.match(
        installateur,
        /systemctl show -p IPAddressAllow --value cyber-grc-notifications/u,
        'Le contrôle de couverture doit lire l’unité DES NOTIFICATIONS. Lire ' +
          '« cyber-grc » à sa place est le défaut exact de Q-199 : deux unités, ' +
          'deux listes blanches, et celle qui doit sortir n’était jamais regardée.',
      );
    });

    test('le refus est DUR, et il tombe AVANT l’armement du minuteur', () => {
      const posEchec = installateur.indexOf('SMTP_ACTIF=oui, mais cyber-grc-notifications.service INTERDIT');
      const posArmement = installateur.indexOf('systemctl enable --now cyber-grc-notifications.timer');
      assert.ok(posEchec > 0, 'Aucun refus dur ne nomme le cas « le relais n’est pas couvert ».');
      assert.ok(posArmement > 0, 'L’armement du minuteur a disparu.');
      assert.ok(
        posEchec < posArmement,
        'Le contrôle doit tomber AVANT l’armement : un minuteur armé qui échoue tous les ' +
          'jours coûte plus cher qu’une installation qui refuse de s’achever en disant pourquoi.',
      );
      assert.match(
        installateur.slice(posEchec, posEchec + 900),
        /SMTP_ACTIF=non/u,
        'Le message doit dire comment installer SANS les relances, sinon le contrôle ' +
          'devient un mur qu’on contourne en écrivant « IPAddressAllow=any ».',
      );
    });

    test('les fonctions de couverture ne dépendent PLUS du bloc de l’annuaire', () => {
      // Un client qui pose AUTH_LDAP_ACTIF=non aurait perdu le contrôle SMTP
      // avec le bloc qui le portait — sans que rien ne le dise.
      const posFonction = installateur.indexOf('\ncouverte_par()');
      const posBlocLdap = installateur.indexOf('if [[ "$(lire_variable AUTH_LDAP_ACTIF)" == "non" ]]');
      assert.ok(posFonction > 0, '`couverte_par` a disparu.');
      assert.ok(posBlocLdap > 0, 'Le bloc de l’annuaire a disparu.');
      assert.ok(
        posFonction < posBlocLdap,
        '`couverte_par` doit être définie AVANT — et donc hors — du bloc de l’annuaire : ' +
          'le relais SMTP ne dépend pas de l’activation de l’annuaire.',
      );
    });

    test('L’UNITÉ DIT ENCORE, EN TOUTES LETTRES, CE QUE L’OUBLI PRODUIT', () => {
      // Le commentaire de l'unité était juste et complet. Il ne suffisait pas —
      // « une réserve écrite n'est pas une réserve traitée » — mais le retirer
      // maintenant que le contrôle existe priverait l'exploitant du mode d'emploi.
      const service = lire(SERVICE);
      assert.match(service, /IPAddressAllow=<sous-réseau du relais SMTP/u);
      assert.match(service, /Relais injoignable/u);
    });
  });

  test('le service est un « oneshot » sans [Install] : seul le minuteur l’arme', () => {
    const texte = lire(SERVICE);
    assert.match(texte, /^Type=oneshot$/mu);
    assert.ok(
      !directives(texte).includes('[Install]'),
      'une section [Install] permettrait d’activer le service seul',
    );
    const minuteur = lire(TIMER);
    assert.match(minuteur, /^Unit=cyber-grc-notifications\.service$/mu);
    assert.match(minuteur, /^Persistent=true$/mu);
    assert.match(minuteur, /^WantedBy=timers\.target$/mu);
  });

  test('le calendrier du minuteur est compris par systemd, et il élit un jour ouvré', () => {
    exigerOutil('systemd-analyze', ['--version'], 'Il est fourni par le paquet « systemd », et cet essai éprouve les unités livrées.');
    const calendrier = /^OnCalendar=(.+)$/mu.exec(lire(TIMER))?.[1];
    assert.ok(calendrier, 'OnCalendar absent');
    const sortie = execFileSync('systemd-analyze', ['calendar', calendrier], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.match(sortie, /Normalized form:/u);
    const prochain = /Next elapse: (\w{3})/u.exec(sortie)?.[1];
    assert.ok(
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(prochain),
      `la prochaine échéance tombe un ${prochain} : le week-end est censé être exclu`,
    );
  });
});


/* =====================================================================
 *  Le CHEMIN QUE SYSTEMD EMPRUNTE — un vrai processus, pas un import
 * ---------------------------------------------------------------------
 *  « Un contrôle doit interroger le chemin que l'utilisateur emprunte, pas
 *  celui qui est commode à tester » (corollaire de la porte S2). Les autres
 *  familles importent `envoyerRelances` ; systemd, lui, lance un PROCESSUS qui
 *  charge sa configuration depuis l'environnement, ouvre son propre pool, écrit
 *  sur la sortie standard et rend un code de retour. Rien de tout cela n'est
 *  éprouvé par un import.
 * ===================================================================== */

describe('L12 — la tâche planifiée, lancée comme systemd la lance', () => {
  const REFERENCE = new Date();
  let base;
  let applicatif;
  let relais;

  before(async () => {
    await compilerSiNecessaire();
    base = await ouvrirBaseEssai(import.meta.url);
    applicatif = await base.connexion('app');
    await semerJeuEssai(base, applicatif);
    await semerEcheances(base, applicatif, FILIALE_A, REFERENCE);
    relais = await monterRelaisEssai({ sansStarttls: true });
  });

  after(async () => {
    await relais?.fermer();
    await base?.fermer();
  });

  /** L'environnement que `/etc/cyber-grc/env` fournit en production. */
  const environnement = (smtp) => ({
    NODE_ENV: 'developpement',
    SERVEUR_PORT: '3999',
    SERVEUR_URL_PUBLIQUE: 'https://grc.exemple.interne',
    BASE_HOTE: process.env.BASE_HOTE ?? '127.0.0.1',
    BASE_PORT: process.env.BASE_PORT ?? '5432',
    BASE_NOM: base.nom,
    BASE_UTILISATEUR: process.env.BASE_UTILISATEUR ?? 'grc_app',
    BASE_MOT_DE_PASSE: process.env.BASE_MOT_DE_PASSE ?? 'dev',
    BASE_SSL: 'desactive',
    SESSION_SECRET: 'secret-de-banc-d-essai-sans-valeur-aucune-0123456789',
    LDAP_URL: 'ldaps://annuaire.invalide.test:636',
    LDAP_DN_SERVICE: 'CN=inutilise,DC=invalide,DC=test',
    LDAP_MOT_DE_PASSE_SERVICE: 'inutilise-lot-L3',
    LDAP_BASE_RECHERCHE: 'DC=invalide,DC=test',
    ...smtp,
  });

  const lancer = async (smtp) => {
    try {
      const { stdout, stderr } = await executer(
        process.execPath,
        [join(RACINE_BACKEND, 'dist', 'notifications', 'relances.js')],
        { cwd: RACINE_BACKEND, env: { ...process.env, ...environnement(smtp) }, timeout: 60_000 },
      );
      return { code: 0, stdout, stderr };
    } catch (erreur) {
      return { code: erreur.code ?? 1, stdout: erreur.stdout ?? '', stderr: erreur.stderr ?? '' };
    }
  };

  test('sans relais configuré : le processus s’arrête proprement, code 0', async () => {
    const { code, stdout, stderr } = await lancer({ SMTP_ACTIF: 'non' });
    assert.equal(code, 0, `stderr : ${stderr}`);
    assert.match(stdout, /SMTP_ACTIF=non/u);
    // ⚠️ L'avertissement part sur la sortie d'ERREUR, et c'est mesuré, pas
    // supposé : `console.warn` écrit sur le descripteur 2. Sous systemd,
    // `StandardError=journal` l'y range — comme le fait déjà
    // `src/pieces/exploitation.ts`, qui journalise ses avertissements de la
    // même façon. Ce qui compte est que le CODE DE RETOUR soit 0 : un
    // avertissement n'est pas un échec de passage.
    assert.match(stderr, /aucun relais configuré/u);
    assert.ok(!/Error|échec/u.test(stderr), `stderr ne doit porter aucune erreur : ${stderr}`);
  });

  test('avec relais : le processus expédie, résume son passage, et rend 0', async () => {
    const { code, stdout, stderr } = await lancer({
      SMTP_ACTIF: 'oui',
      SMTP_HOTE: relais.hote,
      SMTP_PORT: String(relais.port),
      // Le relais d'essai n'annonce pas STARTTLS dans cette famille : le
      // processus doit donc parler en clair, et le dire dans sa configuration —
      // pas se replier tout seul (propriété éprouvée par `smtp.test.mjs`).
      SMTP_CHIFFREMENT: 'aucun',
      SMTP_MODE_AUTH: 'aucun',
      SMTP_EXPEDITEUR: 'cyber-grc@exemple.interne',
      SMTP_NOM_EXPEDITEUR: 'Cyber GRC Groupe',
    });
    assert.equal(code, 0, `stderr : ${stderr}`);
    assert.match(stdout, /1 message\(s\) expédié\(s\)/u);
    assert.equal(relais.messages.length, 1);
    assert.deepEqual(relais.messages[0].a, [ADRESSE_MARIE]);

    // ⚠️ Le contrôle central, rejoué sur le chemin de production : ce qui sort
    // d'un PROCESSUS lancé comme systemd le lance ne porte aucune donnée.
    assert.ok(!lireMessage(relais.messages[0]).tout.includes(MARQUE));

    // Le résumé du passage ne porte pas d'adresse non plus : `systemctl status`
    // et le journal systemd sont lus par des exploitants, pas par le RSSI.
    assert.ok(!stdout.includes(ADRESSE_MARIE));
    assert.ok(!stdout.includes(MARQUE));
  });

  test('relais injoignable : code de retour 1, motif sur la sortie standard', async () => {
    const mort = await monterRelaisEssai();
    const port = mort.port;
    await mort.fermer();

    // ⚠️ La fenêtre anti-doublon a été réclamée par l'essai précédent : sans
    // cette remise à zéro, ce passage ne tenterait RIEN et rendrait 0 — un essai
    // vert qui n'aurait rien mesuré. On la recule d'un jour, comme le temps le
    // ferait.
    await base.avecPerimetre(
      applicatif,
      perimetre('exploitant', FILIALE_A, [FILIALE_A]),
      async (c) => {
        const { rowCount } = await c.query(
          `update "parametres" set "valeur" = $2
            where "cle" = 'notifications.derniere_relance' and "filiale_id" = $1`,
          [FILIALE_A, new Date(Date.now() - 48 * 3600_000).toISOString()],
        );
        assert.equal(rowCount, 1, 'la marque doit exister : sinon l’essai précédent n’a rien fait');
      },
      { annuler: false },
    );

    const { code, stdout } = await lancer({
      SMTP_ACTIF: 'oui',
      SMTP_HOTE: '127.0.0.1',
      SMTP_PORT: String(port),
      SMTP_CHIFFREMENT: 'aucun',
      SMTP_MODE_AUTH: 'aucun',
      SMTP_EXPEDITEUR: 'cyber-grc@exemple.interne',
    });
    // ⚠️ Le code 1 est destiné à `systemctl status`, pas à l'utilisateur : un
    // exploitant doit voir l'échec du passage, et personne d'autre ne le voit.
    assert.equal(code, 1);
    assert.match(stdout, /1 échec/u);
    assert.match(stdout, /injoignable|ECONNREFUSED/u);
  });

  test('configuration invalide : arrêt explicite, sur la sortie d’ERREUR', async () => {
    const { code, stderr } = await lancer({ SMTP_ACTIF: 'oui' }); // SMTP_HOTE manquant
    assert.equal(code, 1);
    assert.match(stderr, /configuration invalide/iu);
    assert.match(stderr, /SMTP_HOTE/u);
  });
});
