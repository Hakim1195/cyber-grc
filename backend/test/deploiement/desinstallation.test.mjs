/**
 * desinstallation.test.mjs — **le retrait, joué pour de bon.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * `install.sh` n'avait **aucun** mode de retrait, et aucun document n'en
 * décrivait la procédure. Un exploitant improvise alors : il efface un
 * répertoire, laisse trois unités systemd qui redémarrent en boucle, une base
 * que personne ne réclame, et des secrets en clair dans `/etc`.
 *
 * ── Ce que cet essai JOUE, et pourquoi il ne se contente pas de lire ──────
 *
 * Le danger d'une désinstallation n'est pas dans ce qu'elle retire, c'est dans
 * **l'ordre** où elle le fait et dans **ce qu'elle refuse de faire**. Or ni
 * l'un ni l'autre ne se lisent : un script qui retire l'unité systemd avant
 * d'arrêter le service laisse `Restart=on-failure` relancer un processus sur
 * une arborescence à moitié effacée, et le texte du script a l'air correct.
 *
 * On **exécute** donc la fonction, avec `systemctl`, `rm`, `a2dissite`, `su` et
 * `userdel` **doublés par des enregistreurs** : chaque appel écrit sa ligne
 * dans un journal, et l'essai lit l'ORDRE obtenu. Rien n'est retiré de la
 * machine — le bloc est extrait du vrai `install.sh` par ses ancres, jamais
 * recopié (`CONVENTIONS.md` §19.5).
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { extraireBloc } from '../aide/install.mjs';

let atelier;

before(() => {
  atelier = mkdtempSync(join(tmpdir(), 'grc-desinstall-'));
});
after(() => {
  if (atelier !== undefined) rmSync(atelier, { recursive: true, force: true });
});

/**
 * Joue `desinstaller()` avec toutes les commandes destructrices doublées.
 *
 * ⚠️ Les doublures ENREGISTRENT et ne font rien. C'est la seule façon d'éprouver
 * l'ordre des gestes sans être root et sans rien détruire — et l'ordre est
 * précisément ce que le texte du script ne montre pas.
 */
function jouerDesinstallation({ avecDonnees, exportVerifie, config = {} }) {
  const journal = join(atelier, `appels-${String(Math.random()).slice(2)}.txt`);
  const corps = extraireBloc('desinstaller');

  const script = `
set -uo pipefail
JOURNAL='${journal}'
: > "$JOURNAL"

# ── Les verdicts du script, capturés plutôt qu'affichés ────────────────────
info()   { printf 'INFO %s\\n'   "$*" >> "$JOURNAL"; }
succes() { printf 'OK %s\\n'     "$*" >> "$JOURNAL"; }
alerte() { printf 'ALERTE %s\\n' "$*" >> "$JOURNAL"; }
reserve(){ printf 'RESERVE %s\\n' "$*" >> "$JOURNAL"; }
echec()  { printf 'ECHEC %s\\n'  "$*" >> "$JOURNAL"; exit 1; }

# ── Les commandes destructrices, doublées ─────────────────────────────────
systemctl()  { printf 'systemctl %s\\n' "$*" >> "$JOURNAL"; return 0; }
a2dissite()  { printf 'a2dissite %s\\n' "$*" >> "$JOURNAL"; return 0; }
a2disconf()  { printf 'a2disconf %s\\n' "$*" >> "$JOURNAL"; return 0; }
apache2ctl() { printf 'apache2ctl %s\\n' "$*" >> "$JOURNAL"; return ${config.apacheOk === false ? 1 : 0}; }
rm()         { printf 'rm %s\\n' "$*" >> "$JOURNAL"; return 0; }
userdel()    { printf 'userdel %s\\n' "$*" >> "$JOURNAL"; return 0; }
id()         { return 0; }
du()         { printf '4,0K\\tfichier\\n'; }
su()         { printf 'su %s\\n' "$*" >> "$JOURNAL"; cat > /dev/null; return 0; }
lire_variable() { printf '${config.prefixe ?? ""}'; }

# ── Les constantes que la fonction lit ────────────────────────────────────
RACINE='/opt/cyber-grc'; DONNEES='/var/lib/cyber-grc'
JOURNAUX='/var/log/cyber-grc'; SAUVEGARDES='/var/backups/cyber-grc'
CONFIG='/etc/cyber-grc'; UTILISATEUR='cyber-grc'
BASE_NOM='cyber_grc'; ROLE_APP='grc_app'
ROLE_LECTURE='grc_lecture'; ROLE_PROPRIETAIRE='grc_proprietaire'
SUPERUTILISATEUR='postgres'

${corps}

desinstaller '${avecDonnees ? 1 : 0}' '${exportVerifie ?? ''}'
`;
  const chemin = join(atelier, `desinstall-${String(Math.random()).slice(2)}.sh`);
  writeFileSync(chemin, script);
  let code = 0;
  try {
    execFileSync('bash', [chemin], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (erreur) {
    code = erreur.status ?? 1;
  }
  return { code, lignes: readFileSync(journal, 'utf8').split('\n').filter(Boolean) };
}

const indexDe = (lignes, motif) => lignes.findIndex((l) => motif.test(l));

describe('La désinstallation retire le LOGICIEL et conserve les données', () => {
  test('sans --avec-les-donnees : ni base, ni rôles, ni pièces jointes, ni configuration', () => {
    const { code, lignes } = jouerDesinstallation({ avecDonnees: false });
    assert.equal(code, 0, lignes.join('\n'));

    // Ce qui DOIT partir.
    assert.ok(indexDe(lignes, /^rm .*\/etc\/systemd\/system\/cyber-grc\.service/u) >= 0);
    assert.ok(indexDe(lignes, /^rm .*\/opt\/cyber-grc/u) >= 0, 'le code doit être retiré');

    // ⚠️ Ce qui doit RESTER. C'est la moitié qui fait la valeur de ce mode :
    //    une réinstallation par-dessus doit retrouver le produit du client.
    for (const [quoi, motif] of [
      ['la base', /^su .*postgres/u],
      ['les pièces jointes', /^rm .*\/var\/lib\/cyber-grc/u],
      ['la configuration et les secrets', /^rm .*\/etc\/cyber-grc(\s|$)/u],
      ['le compte système', /^userdel/u],
    ]) {
      assert.equal(
        indexDe(lignes, motif),
        -1,
        `Le mode par défaut a touché ${quoi}. Retirer le logiciel et détruire les données ` +
          'sont deux gestes, et les confondre est ce qui rend une désinstallation dangereuse.',
      );
    }
  });

  test('L’ORDRE : on ARRÊTE avant de retirer — sinon Restart=on-failure relance', () => {
    const { lignes } = jouerDesinstallation({ avecDonnees: false });
    const arret = indexDe(lignes, /^systemctl disable --now cyber-grc$/u);
    const retrait = indexDe(lignes, /^rm .*cyber-grc\.service/u);
    assert.ok(arret >= 0, 'le service doit être arrêté');
    assert.ok(retrait >= 0, 'son unité doit être retirée');
    assert.ok(
      arret < retrait,
      'L’unité a été retirée AVANT l’arrêt du service. `Restart=on-failure` le relance ' +
        'alors sur une arborescence à moitié effacée, et le diagnostic est incompréhensible.',
    );
  });

  test('APACHE N’EST PAS RECHARGÉ s’il refuse sa configuration', () => {
    // Recharger un Apache en défaut couperait les AUTRES sites de la machine —
    // en croyant faire le ménage.
    const { lignes } = jouerDesinstallation({ avecDonnees: false, config: { apacheOk: false } });
    assert.equal(
      indexDe(lignes, /^systemctl reload apache2/u),
      -1,
      'Apache a été rechargé alors que « configtest » échouait.',
    );
    assert.ok(indexDe(lignes, /^RESERVE /u) >= 0, 'et le refus doit être DIT, pas tu');
  });

  test('LE DURCISSEMENT DE PORTÉE SERVEUR PART AUSSI (constat Q-231 a)', () => {
    /* L'installation pose et ACTIVE `conf-available/cyber-grc-durcissement.conf`,
       qui s'applique à TOUS les sites de la machine : ServerTokens, Timeout,
       RequestReadTimeout, LimitRequestFields…

       ⚠️ Un réglage de portée serveur laissé par un logiciel qui n'est plus là
       est pire qu'un fichier oublié : il change le comportement des AUTRES
       sites, et plus personne ne sait pourquoi. */
    const { lignes } = jouerDesinstallation({ avecDonnees: false });
    assert.ok(
      indexDe(lignes, /^a2disconf .*cyber-grc-durcissement/u) >= 0,
      'La configuration de portée serveur n’a pas été désactivée.',
    );
    assert.ok(
      indexDe(lignes, /^rm .*conf-available\/cyber-grc-durcissement\.conf/u) >= 0,
      'Le fichier de durcissement reste dans conf-available.',
    );
  });

  test('LE PRÉFIXE DES GROUPES AD EST CELUI DU CLIENT, pas un défaut (Q-231 b)', () => {
    /* ⚠️ En mode `--avec-les-donnees`, `/etc/cyber-grc` est effacé AVANT ce
       message : `lire_variable` ne rend plus rien, et le script annonçait
       « GRC-* » à un client dont les groupes s'appellent « ACME-* ». C'est le
       SEUL mode où l'information est irrécupérable — la configuration qui la
       portait n'existe plus — et c'est celui où le message se trompait. */
    const vrai = join(atelier, 'export-prefixe.json');
    writeFileSync(vrai, '{"format":"grc-backup","version":13,"payload":{}}');
    const { lignes } = jouerDesinstallation({
      avecDonnees: true,
      exportVerifie: vrai,
      config: { prefixe: 'ACME-' },
    });
    assert.ok(
      lignes.some((l) => /ACME-\*/u.test(l)),
      'Le message annonce le mauvais préfixe : l’administrateur de l’annuaire ira chercher ' +
        `des groupes qui n’existent pas. Journal : ${lignes.filter((l) => /Active Directory|\*/u.test(l)).join(' | ')}`,
    );
    assert.equal(
      lignes.some((l) => /« GRC-\*/u.test(l)),
      false,
      'et il ne doit pas retomber sur le défaut alors que la configuration le disait',
    );
  });

  test('LES GROUPES AD SONT NOMMÉS — ils ne sont pas sur cette machine', () => {
    const { lignes } = jouerDesinstallation({ avecDonnees: false });
    assert.ok(
      lignes.some((l) => /GRC-.*Active Directory|Active Directory.*ne sont PAS/u.test(l)),
      'Sans ce rappel, vingt-trois groupes restent orphelins dans l’annuaire du client et ' +
        'personne ne sait plus pourquoi.',
    );
  });
});

describe('La destruction des données exige un export, et le VÉRIFIE', () => {
  test('sans --export-verifie, elle REFUSE', () => {
    const { code, lignes } = jouerDesinstallation({ avecDonnees: true });
    assert.equal(code, 1, 'la destruction sans export doit échouer');
    assert.ok(
      lignes.some((l) => /TROIS ANS|rétention/iu.test(l)),
      'Le refus doit dire POURQUOI : le journal fait preuve en audit ISO 27001.',
    );
    assert.equal(indexDe(lignes, /^su .*postgres/u), -1, 'et rien ne doit avoir été détruit');
  });

  test('un fichier VIDE ne passe pas pour un export', () => {
    // ⚠️ Le cœur du contrôle. Un test d'existence accepterait un fichier créé
    //    pour passer le contrôle : ce serait une case à cocher, pas une garantie.
    const faux = join(atelier, 'pas-un-export.json');
    writeFileSync(faux, '{}');
    const { code, lignes } = jouerDesinstallation({ avecDonnees: true, exportVerifie: faux });
    assert.equal(code, 1, lignes.join('\n'));
    assert.ok(lignes.some((l) => /grc-backup/u.test(l)), 'le refus doit nommer l’enveloppe');
  });

  test('un VRAI export laisse la destruction se faire, et dans le bon ordre', () => {
    const vrai = join(atelier, 'export.json');
    writeFileSync(vrai, '{"format":"grc-backup","version":13,"payload":{}}');
    const { code, lignes } = jouerDesinstallation({ avecDonnees: true, exportVerifie: vrai });
    assert.equal(code, 0, lignes.join('\n'));

    const base = indexDe(lignes, /^su .*postgres/u);
    const donnees = indexDe(lignes, /^rm .*\/var\/lib\/cyber-grc/u);
    const compte = indexDe(lignes, /^userdel/u);
    assert.ok(base >= 0 && donnees >= 0 && compte >= 0, 'les trois gestes doivent avoir lieu');
    assert.ok(
      base < compte,
      'Le compte système est supprimé avant la base : les fichiers deviennent orphelins ' +
        'd’un propriétaire qui n’existe plus, et le diagnostic se complique pour rien.',
    );
  });

  test('LES CLICHÉS DE SAUVEGARDE SURVIVENT à la destruction', () => {
    /* Ce sont les seuls exemplaires de ce qu'on vient de détruire. Les emporter
       dans le même geste ferait de « désinstaller » une perte définitive et
       silencieuse — exactement ce que ce mode existe pour éviter. */
    const vrai = join(atelier, 'export2.json');
    writeFileSync(vrai, '{"format":"grc-backup","version":13,"payload":{}}');
    const { lignes } = jouerDesinstallation({ avecDonnees: true, exportVerifie: vrai });
    assert.equal(
      lignes.findIndex((l) => /^rm .*\/var\/backups\/cyber-grc/u.test(l)),
      -1,
      'Les clichés ont été effacés avec le reste.',
    );
    assert.ok(
      lignes.some((l) => /CONSERV/u.test(l)),
      'et leur conservation doit être DITE : sinon personne ne sait qu’ils sont là.',
    );
  });

  test('« AUCUN-JE-CONFIRME-LA-PERTE » est accepté, et la perte est ANNONCÉE', () => {
    // Une porte de sortie est nécessaire — un client peut vouloir tout détruire.
    // Elle doit être longue à écrire, et laisser une trace de ce qu'on a assumé.
    const { code, lignes } = jouerDesinstallation({
      avecDonnees: true,
      exportVerifie: 'AUCUN-JE-CONFIRME-LA-PERTE',
    });
    assert.equal(code, 0);
    assert.ok(lignes.some((l) => /AUCUN EXPORT/u.test(l)), 'la perte assumée doit être dite');
  });
});
