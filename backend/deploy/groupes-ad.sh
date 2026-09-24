#!/usr/bin/env bash
# =============================================================================
#  groupes-ad.sh — la liste des groupes Active Directory à créer, ENGENDRÉE.
# =============================================================================
#
# `PLAN_SERVEUR` §3.4 : « Leur équipe créera les groupes nécessaires : ils doivent
# donc être listés explicitement, avec une convention stricte. La liste exacte des
# groupes à créer sera fournie comme livrable d'exploitation, prête à exécuter. »
#
#   <PRÉFIXE><FILIALE>-<PROFIL>   ex. GRC-TLS-RSSI, GRC-DEU-CONTRIB
#   <PRÉFIXE>GROUPE-<PROFIL>      ex. GRC-GROUPE-DIRECTION, GRC-GROUPE-RSSI
#   <PRÉFIXE>EXPORT               droit d'export, transversal
#   <PRÉFIXE>ADMIN                administration de l'application
#
# ── POURQUOI LA LISTE N'EST PAS ÉCRITE ICI ──────────────────────────────────
#
# `CONVENTIONS.md` §19.5 : « un garde-fou DÉCOUVRE son périmètre dans le
# catalogue ; il ne le récite pas. » L'enjeu n'est pas théorique : le client
# compte **plus de vingt filiales et en acquiert régulièrement**. Vingt filiales
# et sept profils de site font cent quarante noms, et une acquisition en ajoute
# sept. Une liste figée est fausse à la première acquisition — et fausse **en
# silence** : un groupe manquant, c'est un RSSI de site qui n'a aucun accès, un
# ticket trois semaines plus tard, et personne pour relier la panne à un fichier
# que plus personne ne relit.
#
# ── D'OÙ VIENT CHAQUE MOITIÉ, ET POURQUOI IL N'Y A QU'UN SEUL ENGENDREUR ────
#
# | Terme | Source | Arbitré en |
# |---|---|---|
# | les **filiales** | la **table `filiales`** ; `filiales.conf` seulement en secours, et c'est DIT | `CONVENTIONS.md` §27, amendé le 24/09/2026 |
# | les **profils**  | table `profils`, semée par `007_authentification.sql` (socle) | `PLAN_SERVEUR` §3.2 |
# | le **préfixe**   | `LDAP_PREFIXE_GROUPES` du fichier de configuration | `.env.example` §5 |
#
# ⚠️ **Ce script n'engendre AUCUN nom lui-même.** Les noms sortent de
# `groupesAttendus()` (`src/droits/groupes-ad.ts`, compilé dans `dist/`), qui est
# **l'autorité applicative** : c'est cette fonction qui décide aussi de ce que la
# table `groupes_ad` reconnaîtra. Réécrire la convention ici en aurait fait une
# seconde autorité, et deux autorités finissent toujours par diverger — sauf que
# la divergence serait ici invisible : l'équipe IT créerait des groupes que
# l'application ne reconnaît pas, et les comptes concernés se connecteraient sans
# obtenir le moindre droit. Il y a donc **un engendreur, et une mise en forme**.
#
# La règle a une conséquence à connaître : `groupesAttendus()` **n'engendre pas**
# `<PRÉFIXE><FILIALE>-ADMIN` ni `<PRÉFIXE>GROUPE-ADMIN` — administrer
# l'application est de niveau Groupe, et cela s'accorde par `<PRÉFIXE>ADMIN` seul.
# Ce n'est pas un oubli de ce script : c'est la décision du modèle de droits, et
# elle se lit là-bas.
#
# ── L'ORDRE DES OPÉRATIONS, À DIRE À L'EXPLOITANT ───────────────────────────
#
#   1. `install.sh` pose la base, le service et le modèle de droits ;
#   2. le client écrit `filiales.conf` (modèle : `deploy/filiales.conf.exemple`) ;
#   3. **ce script** engendre la liste et le script PowerShell ;
#   4. l'équipe IT du client crée les groupes dans l'AD ;
#   5. les comptes se connectent, et sont provisionnés à la volée (§1.5).
#
# À chaque acquisition, on reprend à l'étape 2. `install.sh` rejoue `--verifier` à
# chaque exécution, et le dit quand l'étape 2 n'a pas eu lieu.
#
#   bash deploy/groupes-ad.sh                    la liste, un nom par ligne
#   bash deploy/groupes-ad.sh --powershell       le script AD, prêt à exécuter
#   bash deploy/groupes-ad.sh --csv              pour un import en masse
#   bash deploy/groupes-ad.sh --verifier         la déclaration est-elle saine ?
#   bash deploy/groupes-ad.sh --aide
# =============================================================================

set -Eeuo pipefail

RACINE_BACKEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${CYBER_GRC_CONFIG:-/etc/cyber-grc}"
FICHIER_CONFIG="$CONFIG/env"
FICHIER_FILIALES="${CYBER_GRC_FILIALES:-$CONFIG/filiales.conf}"
SUPERUTILISATEUR="${PGSUPERUTILISATEUR:-postgres}"
SORTIE="liste"
OU_AD=""
PREFIXE_FORCE=""
PROFILS_FORCE=""

info()   { printf '\033[1;34m==>\033[0m %s\n' "$*" >&2; }
succes() { printf '\033[1;32m  ok\033[0m %s\n' "$*" >&2; }
alerte() { printf '\033[1;33m  !!\033[0m %s\n' "$*" >&2; }
echec()  { printf '\033[1;31m ERR\033[0m %s\n' "$*" >&2; exit 2; }

aide() {
  cat <<'FIN'
Engendre la liste des groupes Active Directory de Cyber GRC (PLAN_SERVEUR §3.4)
depuis la déclaration des filiales. La liste n'est PAS écrite à la main : les
noms sortent de groupesAttendus(), l'engendreur unique de src/droits/.

  (sans option)          la liste, un nom de groupe par ligne
  --powershell           script PowerShell idempotent (New-ADGroup), à exécuter
                         sur un contrôleur de domaine par l'équipe IT du client
  --csv                  nom;perimetre;filiale;profil;description
  --verifier             éprouve la déclaration des filiales et rend compte ;
                         confronte la liste à « groupes_ad » quand la table est
                         peuplée
  --ou <DN>              unité d'organisation de destination (--powershell)
  --prefixe <valeur>     force le préfixe au lieu de lire LDAP_PREFIXE_GROUPES
  --profils <a,b,c>      force la liste des profils au lieu de lire la base
                         (pour engendrer la liste hors de la VM)
  --aide                 ce message

Fichiers lus :
  /etc/cyber-grc/env             LDAP_PREFIXE_GROUPES, accès à la base
  /etc/cyber-grc/filiales.conf   la déclaration des filiales (CONVENTIONS §27)

Variables d'environnement :
  CYBER_GRC_CONFIG=<répertoire>   déplace /etc/cyber-grc (recette et essais)
  CYBER_GRC_FILIALES=<fichier>    déplace la seule déclaration des filiales
  PGSUPERUTILISATEUR=<rôle>       compte superutilisateur PostgreSQL

Codes de sortie : 0 rien à signaler · 2 configuration inutilisable ·
3 écart entre la liste engendrée et « groupes_ad » · 4 déclaration des filiales
invalide · 5 déclaration valide mais AUCUNE filiale active.
FIN
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --powershell) SORTIE="powershell"; shift ;;
    --csv)        SORTIE="csv";        shift ;;
    --verifier)   SORTIE="verifier";   shift ;;
    --ou)         OU_AD="${2:?--ou attend un DN}"; shift 2 ;;
    --prefixe)    PREFIXE_FORCE="${2:?--prefixe attend une valeur}"; shift 2 ;;
    --profils)    PROFILS_FORCE="${2:?--profils attend une liste}"; shift 2 ;;
    --aide|-h|--help) aide; exit 0 ;;
    *) echec "Option inconnue : $1 (voir --aide)." ;;
  esac
done

# =============================================================================
#  Lecture du fichier de configuration
# =============================================================================
#
# Même règle que `install.sh` : le fichier n'est PAS interprété par le shell —
# `source` exécuterait une valeur du genre `X=$(commande)`. systemd, lui, ne
# l'interprète pas ; ce script ne doit pas faire pire que le consommateur réel.
#
# ⚠️ Cette fonction ressemble à celle d'`install.sh`, et c'est assumé : les deux
# scripts lisent des variables DIFFÉRENTES. `install.sh` ne lit jamais
# LDAP_PREFIXE_GROUPES — il appelle ce script-ci. Aucune valeur n'est donc lue
# deux fois, donc rien ne peut diverger en silence.
lire_variable() {
  local cle="$1" valeur="" ligne
  [[ -f "$FICHIER_CONFIG" ]] || { printf ''; return 0; }
  while IFS= read -r ligne || [[ -n "$ligne" ]]; do
    if [[ "$ligne" =~ ^[[:space:]]*${cle}=(.*)$ ]]; then valeur="${BASH_REMATCH[1]}"; fi
  done < "$FICHIER_CONFIG"
  valeur="${valeur%$'\r'}"
  [[ "$valeur" == \"*\" ]] && valeur="${valeur:1:${#valeur}-2}"
  printf '%s' "$valeur"
}

PREFIXE="$PREFIXE_FORCE"
[[ -n "$PREFIXE" ]] || PREFIXE="$(lire_variable LDAP_PREFIXE_GROUPES)"
# Le défaut de `.env.example` §5 et de `src/config/index.ts`. Sans lui, une
# installation dont le fichier ne porte pas la clé engendrerait des noms nus.
PREFIXE="${PREFIXE:-GRC-}"
[[ "$PREFIXE" =~ ^[A-Za-z0-9_-]{1,16}$ ]] \
  || echec "LDAP_PREFIXE_GROUPES = « $PREFIXE » : un préfixe de groupe AD ne peut porter que
      des lettres, des chiffres, « _ » et « - ». Corrigez $FICHIER_CONFIG."

BASE_NOM="$(lire_variable BASE_NOM)";   BASE_NOM="${BASE_NOM:-cyber_grc}"
BASE_HOTE="$(lire_variable BASE_HOTE)"; BASE_HOTE="${BASE_HOTE:-127.0.0.1}"
BASE_PORT="$(lire_variable BASE_PORT)"; BASE_PORT="${BASE_PORT:-5432}"
ROLE_LECTURE="$(lire_variable BASE_UTILISATEUR_LECTURE)"; ROLE_LECTURE="${ROLE_LECTURE:-grc_lecture}"
MDP_LECTURE="$(lire_variable BASE_MOT_DE_PASSE_LECTURE)"
[[ "$BASE_NOM" =~ ^[a-z_][a-z0-9_]*$ ]] \
  || echec "BASE_NOM : « $BASE_NOM » n'est pas un identifiant PostgreSQL valide."

# =============================================================================
#  1. Le périmètre — la TABLE d'abord, la déclaration en secours
# =============================================================================
#
# ⚠️ **CE BLOC LISAIT LE FICHIER, ET C'ÉTAIT LA MOITIÉ D'UN DÉFAUT** — mesuré le
# 24/09/2026. `db/synchroniser-groupes-ad.mjs`, qui remplit `groupes_ad` (l'autorité
# applicative : un groupe absent de cette table n'accorde rien), lit la **table**
# `filiales`. Ce script-ci lisait le **fichier**. Et rien, nulle part, ne portait
# le fichier dans la table : le commentaire d'`install.sh` l'annonçait encore au
# futur, vingt jours après.
#
# Résultat, avec deux filiales déclarées et une table vide : **26 groupes créés
# dans l'annuaire par l'équipe IT, 10 seulement déclarés en base**. `GRC-ADMIN` ne
# dépendant d'aucune filiale, l'administrateur entrait et le produit avait l'air
# de marcher ; les seize groupes de filiale, eux, n'accordaient RIEN — un RSSI de
# site se connectait sans obtenir le moindre accès, sans message d'erreur ni côté
# annuaire ni côté application.
#
# ── L'ARBITRAGE, ET IL N'A QU'UN SENS POSSIBLE ──────────────────────────────
#
# La **table est la source**, le fichier est un **amorçage**. Ce n'est pas un choix
# de goût : le service tourne sous `ProtectSystem=strict` avec
# `ReadWritePaths=/var/lib/cyber-grc /var/log/cyber-grc`, donc `/etc/cyber-grc` lui
# est en LECTURE SEULE. Un écran ne pourra jamais écrire `filiales.conf`, et l'y
# autoriser serait une régression du bac à sable. Le seul sens ouvert est donc
# fichier → table, une fois, à l'installation (`db/importer-filiales.mjs`,
# §8 pre d'`install.sh`) ; ensuite une acquisition se déclare **à l'écran**.
#
# ── CE QUE CE SCRIPT LIT, DANS CET ORDRE, ET IL LE DIT TOUJOURS ─────────────
#
#  1. la table `filiales` (par `f_filiales_actives()`, `security definer` : elle
#     répond hors de tout périmètre de session) — **dès qu'elle connaît une
#     filiale active, c'est elle qui fait foi** ;
#  2. sinon la déclaration `filiales.conf` — pour qu'on puisse engendrer le script
#     PowerShell **avant** la première installation, ou depuis un poste hors VM.
#
# ⚠️ **L'origine est imprimée dans l'en-tête de chaque sortie.** Une bascule
# silencieuse entre deux sources serait exactement le défaut qu'on ferme ici. Et
# `--verifier` confronte les deux, pour qu'un fichier devenu obsolète se voie.
#
# ── L'ANALYSEUR DU FICHIER N'EST PLUS ICI ───────────────────────────────────
#
# Il y en avait un, écrit en bash, qui réimplémentait à la main `ck_filiales_code`,
# `ck_filiales_pays` et l'unicité du code. Deux analyseurs du même format, c'est
# deux vérités, et la divergence se verrait le jour où l'un accepte une ligne que
# l'autre refuse — c'est-à-dire au moment où quelqu'un ne peut pas se connecter.
# Le seul analyseur vit dans `src/filiales/declaration.ts`, et ce script l'APPELLE,
# comme il appelle déjà `groupesAttendus()`. *On ne recopie pas une règle.*
LIGNES_FILIALES=""     # code \x1f raison sociale
SEPARATEUR=$'\x1f'
ORIGINE_FILIALES=""
NB_LIGNES=0
NB_INACTIVES=0
FILIALES_DU_FICHIER=""   # renseigné dès que le fichier a pu être analysé

# ── L'analyseur compilé, découvert et non supposé ──────────────────────────
ANALYSEUR="$RACINE_BACKEND/dist/filiales/declaration.js"
command -v node >/dev/null 2>&1 || echec "« node » est introuvable : l'analyseur est du JavaScript compilé."
[[ -f "$ANALYSEUR" ]] \
  || echec "L'analyseur compilé est absent : $ANALYSEUR
      Ce script ne réécrit PAS le format de filiales.conf — il appelle
      analyserDeclaration(), pour qu'il n'y ait jamais deux vérités. Compilez d'abord :
        cd $RACINE_BACKEND && npm run build"

# `interroger()` est défini ici parce que les DEUX sources en ont besoin : les
# filiales comme les profils. Il était plus bas, du temps où seuls les profils
# venaient de la base.
interroger() {   # SQL sur stdin -> une ligne par enregistrement
  local sql
  sql="begin; set transaction read only; set local statement_timeout = '30s';
$(cat)
rollback;"
  if [[ -n "$MDP_LECTURE" ]]; then
    PGPASSWORD="$MDP_LECTURE" psql -X -q -A -t -F "$SEPARATEUR" -v ON_ERROR_STOP=1 \
      -h "$BASE_HOTE" -p "$BASE_PORT" -U "$ROLE_LECTURE" -d "$BASE_NOM" -f - <<<"$sql"
  elif [[ $EUID -eq 0 ]]; then
    ( cd /tmp && su "$SUPERUTILISATEUR" -s /bin/sh \
        -c "psql -X -q -A -t -F '$SEPARATEUR' -v ON_ERROR_STOP=1 -d $BASE_NOM -f -" ) <<<"$sql"
  else
    return 1
  fi
}

# ── Analyser le fichier, quand il existe ───────────────────────────────────
#
# On l'analyse TOUJOURS s'il est lisible, même quand la table fait foi : c'est ce
# qui permet à `--verifier` de dire « votre fichier ne décrit plus le produit ».
# Le rendu porte une ligne par filiale : code, raison sociale, actif (« oui »/« non »).
ANOMALIES_FICHIER=""
if [[ -f "$FICHIER_FILIALES" ]]; then
  if ! FILIALES_DU_FICHIER="$(
    GRC_FICHIER="$FICHIER_FILIALES" GRC_SEP="$SEPARATEUR" node --input-type=module -e "
      const { readFileSync } = await import('node:fs');
      const { analyserDeclaration } = await import('file://${ANALYSEUR}');
      const SEP = process.env.GRC_SEP;
      const lu = analyserDeclaration(readFileSync(process.env.GRC_FICHIER, 'utf8'));
      if (lu.anomalies.length > 0) {
        for (const a of lu.anomalies) process.stderr.write(\`ligne \${a.ligne} : \${a.message}\n\`);
        process.exit(9);
      }
      for (const f of lu.filiales) {
        process.stdout.write([f.code, f.raisonSociale, f.active ? 'oui' : 'non'].join(SEP) + '\n');
      }
    " 2>/tmp/grc-anomalies-filiales.$$
  )"; then
    ANOMALIES_FICHIER="$(cat "/tmp/grc-anomalies-filiales.$$" 2>/dev/null || true)"
    rm -f "/tmp/grc-anomalies-filiales.$$"
    while IFS= read -r l; do [[ -n "$l" ]] && alerte "$l"; done <<< "$ANOMALIES_FICHIER"
    alerte "Fichier : $FICHIER_FILIALES"
    printf '\033[1;31m ERR\033[0m %s\n' \
      "La déclaration des filiales est invalide (CONVENTIONS.md §27). RIEN n'est engendré :
      une ligne mal formée produirait un nom de groupe faux, et un nom de groupe faux ne se
      voit qu'au moment où quelqu'un ne peut pas se connecter — sans message d'erreur, ni
      côté annuaire, ni côté application." >&2
    exit 4
  fi
  rm -f "/tmp/grc-anomalies-filiales.$$"
  FILIALES_DU_FICHIER="$(printf '%s' "$FILIALES_DU_FICHIER" | sed '/^$/d')"
fi

# ── La table, source de vérité dès qu'elle connaît une filiale ─────────────
#
# `f_filiales_actives()` et non `select from filiales` : la table est cloisonnée
# (migration `010`, constat Q-132) et ce script tourne hors de tout périmètre de
# session. Un `select` direct rendrait ZÉRO sur une base peuplée.
FILIALES_DE_LA_BASE=""
if FILIALES_DE_LA_BASE="$(interroger <<SQL
select code, raison_sociale from f_filiales_actives() order by code;
SQL
)"; then
  FILIALES_DE_LA_BASE="$(printf '%s' "$FILIALES_DE_LA_BASE" | sed '/^$/d')"
else
  # ⚠️ **UN REPLI SILENCIEUX EST LE DÉFAUT QU'ON FERME ICI, PAS UNE COMMODITÉ.**
  #    La première rédaction de ce bloc retombait sur le fichier sans un mot : la
  #    sortie était alors juste **par accident**, jusqu'au jour où le fichier et la
  #    table divergent — c'est-à-dire après la première acquisition déclarée à
  #    l'écran. Mesuré le 24/09/2026 : `grc_lecture` n'avait pas le privilège
  #    d'exécuter `f_filiales_actives()`, la requête échouait, et la liste sortait
  #    du fichier comme avant. La migration `064` pose le privilège ; ce repli
  #    reste, pour le poste hors VM, et il se DIT.
  FILIALES_DE_LA_BASE=""
  BASE_INJOIGNABLE=1
  alerte "La table « filiales » n'a pas pu être lue (base injoignable, ou privilège absent)."
  alerte "La liste va être engendrée depuis $FICHIER_FILIALES, qui peut être en retard sur"
  alerte "le produit : une filiale créée à l'écran n'y figure pas. Voir la migration 064."
fi

if [[ -n "${FILIALES_DE_LA_BASE//[[:space:]]/}" ]]; then
  LIGNES_FILIALES="$FILIALES_DE_LA_BASE"$'\n'
  ORIGINE_FILIALES="table « filiales » de $BASE_NOM"
  NB_LIGNES="$(printf '%s' "$FILIALES_DE_LA_BASE" | grep -c . || true)"
  NB_INACTIVES=0
elif [[ -n "${FILIALES_DU_FICHIER//[[:space:]]/}" ]]; then
  # Amorçage : la base ne connaît encore aucune filiale. On engendre depuis la
  # déclaration pour que le script PowerShell existe AVANT la première
  # installation — et on le DIT, parce que ce n'est pas l'état nominal.
  while IFS="$SEPARATEUR" read -r code raison actif; do
    [[ -n "$code" ]] || continue
    NB_LIGNES=$((NB_LIGNES + 1))
    # Une filiale sortie du périmètre ne doit PLUS avoir de groupe : ses comptes
    # perdent l'accès par le retrait du groupe AD, ce qui est le déprovisionnement
    # voulu (§1.5). Elle est comptée, pour que « rien n'a été engendré » ne puisse
    # jamais être confondu avec « le fichier n'a pas été lu ».
    if [[ "$actif" == "non" ]]; then NB_INACTIVES=$((NB_INACTIVES + 1)); continue; fi
    LIGNES_FILIALES+="$code$SEPARATEUR$raison"$'\n'
  done <<< "$FILIALES_DU_FICHIER"
  ORIGINE_FILIALES="$FICHIER_FILIALES (la base n'en connaît encore aucune)"
elif [[ -n "${BASE_INJOIGNABLE:-}" && ! -f "$FICHIER_FILIALES" ]]; then
  echec "Aucune source de filiales : la base est injoignable et $FICHIER_FILIALES est absent.
      La table « filiales » fait foi dès qu'elle connaît une filiale ; avant la première
      installation, c'est la déclaration d'exploitation qui sert d'amorçage (§27) :
        install -m 0640 $RACINE_BACKEND/deploy/filiales.conf.exemple $FICHIER_FILIALES"
else
  ORIGINE_FILIALES="aucune (ni la base ni $FICHIER_FILIALES ne déclarent de filiale active)"
fi

NB_ACTIVES="$(printf '%s' "$LIGNES_FILIALES" | grep -c . || true)"

# =============================================================================
#  2. Les profils métier — découverts, jamais récités
# =============================================================================
#
# La table `profils` est semée par `007_authentification.sql` (§6, socle produit)
# et lisible sans périmètre de session (`004_rls.sql` §6). La transaction est
# déclarée EN LECTURE SEULE : ce script ne modifie rien, et c'est la base qui le
# garantit plutôt qu'un commentaire (`CONVENTIONS.md` §20.1).

PROFILS_BRUT=""
if [[ -n "$PROFILS_FORCE" ]]; then
  # Sortie explicite, pour engendrer la liste hors de la VM. Jamais un défaut
  # silencieux : le code employé est imprimé dans l'en-tête de chaque sortie.
  while IFS= read -r c; do
    c="$(printf '%s' "$c" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ -n "$c" ]] || continue
    [[ "$c" =~ ^[A-Z0-9_]{2,20}$ ]] || echec "--profils : « $c » n'est pas un code de profil (ck_profils_code)."
    PROFILS_BRUT+="$c$SEPARATEUR$c"$'\n'
  done < <(printf '%s' "$PROFILS_FORCE" | tr ',' '\n')
  ORIGINE_PROFILS="--profils (liste forcée)"
else
  if ! PROFILS_BRUT="$(interroger <<SQL
select code, nom from profils where actif order by code;
SQL
)"; then
    echec "Les profils métier n'ont pas pu être lus dans « $BASE_NOM ».
      Ils sont le DEUXIÈME AXE du modèle de droits (PLAN_SERVEUR §3.1) : sans eux, la liste
      se réduirait aux groupes transversaux, ce qui n'ouvrirait aucun accès à personne — et
      rendre cette liste-là sans rien dire serait exactement le défaut que ce script existe
      pour empêcher. Deux issues :
        · appliquer les migrations (007_authentification.sql sème les huit profils de socle),
          puis relancer en root ou renseigner BASE_MOT_DE_PASSE_LECTURE dans $FICHIER_CONFIG ;
        · engendrer la liste hors de la VM : --profils RSSI,CONTRIB,QUALITE,RH,DPO,DIRECTION,AUDITEUR,ADMIN"
  fi
  ORIGINE_PROFILS="table « profils » de $BASE_NOM"
fi
PROFILS_BRUT="$(printf '%s' "$PROFILS_BRUT" | sed '/^$/d')"
[[ -n "$PROFILS_BRUT" ]] || echec "Aucun profil métier actif : voir 007_authentification.sql §6."
NB_PROFILS="$(printf '%s\n' "$PROFILS_BRUT" | grep -c . || true)"

# =============================================================================
#  3. L'engendrement — délégué à l'AUTORITÉ APPLICATIVE, jamais refait ici
# =============================================================================
#
# Voir l'en-tête : deux engendreurs, c'est deux vérités, et la divergence serait
# invisible jusqu'au jour où un compte se connecte sans obtenir aucun droit.
ENGENDREUR="$RACINE_BACKEND/dist/droits/groupes-ad.js"
[[ -f "$ENGENDREUR" ]] \
  || echec "L'engendreur compilé est absent : $ENGENDREUR
      Ce script ne réécrit PAS la convention de nommage — il met en forme ce que
      groupesAttendus() rend, pour qu'il n'y ait jamais deux vérités. Compilez d'abord :
        cd $RACINE_BACKEND && npm run build"
command -v node >/dev/null 2>&1 || echec "« node » est introuvable : l'engendreur est du JavaScript compilé."

# Les deux entrées passent par des VARIABLES D'ENVIRONNEMENT, pas par la ligne de
# commande : une raison sociale peut porter n'importe quel caractère, et `ps` la
# montrerait à tout compte de la machine.
GROUPES="$(
  GRC_PREFIXE="$PREFIXE" \
  GRC_FILIALES="$LIGNES_FILIALES" \
  GRC_PROFILS="$PROFILS_BRUT" \
  GRC_SEP="$SEPARATEUR" \
  node --input-type=module -e "
    const { groupesAttendus } = await import('file://${ENGENDREUR}');
    const SEP = process.env.GRC_SEP;
    const lignes = (t) => t.split('\n').filter((l) => l.trim() !== '');
    const filiales = lignes(process.env.GRC_FILIALES ?? '').map((l) => {
      const [code, raisonSociale] = l.split(SEP);
      // ⚠️ On passe le CODE là où groupesAttendus() attend un identifiant, et c'est
      // DÉLIBÉRÉ depuis le 24/09/2026 — le commentaire d'avant disait que « la
      // table filiales est semée au lot L4 », ce qui n'était pas encore vrai. Elle
      // l'est maintenant (db/importer-filiales.mjs), mais rien ici n'écrit en base :
      // cet identifiant ne sert qu'à la colonne « filiale » du CSV, que des humains
      // lisent — un identifiant technique y serait illisible. Le jour où ce script
      // écrirait en base, il faudrait aller chercher les vrais identifiants, et ce
      // jour-là il cesserait d'être un metteur en forme.
      //
      // ⚠️ AUCUN ACCENT GRAVE DANS CE COMMENTAIRE, et ce n'est pas une coquetterie :
      // il vit dans une chaîne à guillemets doubles du shell, où un accent grave
      // ouvre une substitution de commande. Payé une fois.
      return { id: code, code, raisonSociale };
    });
    const profils = lignes(process.env.GRC_PROFILS ?? '').map((l) => {
      const [code, nom] = l.split(SEP);
      return { id: '', code, nom };
    });
    for (const g of groupesAttendus(process.env.GRC_PREFIXE, filiales, profils)) {
      process.stdout.write([g.nom, g.perimetre, g.filialeId ?? '', g.profilCode ?? '', g.description].join(SEP) + '\n');
    }
  "
)"
[[ -n "${GROUPES//[[:space:]]/}" ]] \
  || echec "groupesAttendus() n'a rendu aucun groupe alors que $NB_ACTIVES filiale(s) et
      $NB_PROFILS profil(s) lui ont été passés. Une liste vide n'est pas un résultat."

# ── La convention, vérifiée sur ce qui a réellement été engendré ────────────
#
# L'engendreur est l'autorité, mais une autorité se vérifie : ces deux contrôles
# portent sur des propriétés que `groupesAttendus()` ne peut pas connaître, parce
# qu'elles appartiennent à l'ANNUAIRE et pas au modèle de droits.
#
#  · **caractères** — un nom de groupe AD qui porterait un espace ou un accent
#    serait créé, puis introuvable au moment de la résolution.
#  · **longueur** — l'attribut `cn` d'un objet Active Directory est borné à 64
#    caractères. ⚠️ Ce nombre vient de la DOCUMENTATION de l'annuaire, pas d'une
#    mesure : il n'y a aucun Active Directory sur la machine de développement, et
#    c'est écrit plutôt que tu. Le contrôle, lui, est réel — avec le préfixe par
#    défaut, le plus long nom possible fait 4 + 10 + 1 + 20 = 35 caractères, et
#    seule une configuration hors norme peut l'atteindre.
LIMITE_CN=64
ANOMALIES=""
while IFS="$SEPARATEUR" read -r nom _per _fil _pro _desc; do
  [[ -n "$nom" ]] || continue
  if [[ ! "$nom" =~ ^[A-Za-z0-9_-]+$ ]]; then
    ANOMALIES+="« $nom » n'est pas un nom de groupe AD acceptable (lettres, chiffres, _ et - seulement)"$'\n'
  elif [[ ${#nom} -gt $LIMITE_CN ]]; then
    ANOMALIES+="« $nom » fait ${#nom} caractères — la limite du « cn » Active Directory est $LIMITE_CN"$'\n'
  fi
done <<< "$GROUPES"
if [[ -n "${ANOMALIES//[[:space:]]/}" ]]; then
  while IFS= read -r l; do [[ -n "$l" ]] && alerte "$l"; done <<< "$ANOMALIES"
  printf '\033[1;31m ERR\033[0m %s\n' \
    "Des noms engendrés ne sont pas créables dans l'annuaire. Raccourcissez les codes de
      filiale ($FICHIER_FILIALES) ou le préfixe (LDAP_PREFIXE_GROUPES)." >&2
  exit 4
fi

NB_GROUPES="$(printf '%s\n' "$GROUPES" | grep -c . || true)"

# =============================================================================
#  4. Sorties
# =============================================================================

entete() {   # <marqueur de commentaire>
  printf '%s Engendré par deploy/groupes-ad.sh — NE PAS MODIFIER À LA MAIN.\n' "$1"
  printf '%s Convention : PLAN_SERVEUR §3.4 · engendreur : src/droits/groupes-ad.ts\n' "$1"
  # ⚠️ L'ORIGINE, pas le fichier. Cette ligne nommait `filiales.conf` quoi qu'il
  #    arrive — y compris quand la liste venait de la table. Une sortie qui ne dit
  #    pas d'où elle vient est une sortie qu'on ne peut pas contredire.
  printf '%s Filiales   : %s (%s active(s), %s hors périmètre)\n' "$1" "$ORIGINE_FILIALES" "$NB_ACTIVES" "$NB_INACTIVES"
  printf '%s Profils    : %s (%s actif(s))\n' "$1" "$ORIGINE_PROFILS" "$NB_PROFILS"
  printf '%s Préfixe    : %s · total : %s groupe(s)\n' "$1" "$PREFIXE" "$NB_GROUPES"
  printf '%s Régénérer après CHAQUE acquisition : la liste change, ce fichier non.\n' "$1"
}

# Doublement des apostrophes : la valeur finit dans un littéral PowerShell.
ps_litteral() { printf "%s" "${1//\'/\'\'}"; }

case "$SORTIE" in
  liste)
    entete '#'
    while IFS="$SEPARATEUR" read -r nom _r; do [[ -n "$nom" ]] && printf '%s\n' "$nom"; done <<< "$GROUPES"
    ;;

  csv)
    entete '#'
    printf 'nom;perimetre;filiale;profil;description\n'
    while IFS="$SEPARATEUR" read -r nom per fil pro desc; do
      [[ -n "$nom" ]] || continue
      printf '%s;%s;%s;%s;%s\n' "$nom" "$per" "$fil" "$pro" "${desc//;/,}"
    done <<< "$GROUPES"
    ;;

  powershell)
    # ── Idempotent, ET IL REND DES COMPTES ────────────────────────────────
    # Un script qui crée sans dire ce qu'il a trouvé oblige à relire l'AD pour
    # savoir s'il a servi. Celui-ci compte, nomme, et sort en erreur si un seul
    # groupe n'a pas pu être créé — parce que c'est le seul contrôle possible du
    # côté annuaire : rien, dans le dépôt, ne peut interroger l'AD du client
    # (CONVENTIONS.md §27, dernier alinéa).
    if [[ -z "$OU_AD" ]]; then
      alerte "Aucune unité d'organisation donnée (--ou) : les groupes iront dans le conteneur"
      alerte "par défaut du domaine. Demandez le DN à l'équipe AD du client."
    fi
    entete '#'
    cat <<'FIN'
#
# À exécuter sur un contrôleur de domaine, ou sur un poste d'administration
# disposant du module ActiveDirectory, par un compte habilité à créer des groupes.
# IDEMPOTENT : relancé après une acquisition, il ne crée que ce qui manque.
# Il ne supprime JAMAIS rien — retirer un groupe retirerait des accès sans que
# personne l'ait décidé.

#Requires -Modules ActiveDirectory
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
FIN
    if [[ -n "$OU_AD" ]]; then
      printf "\$UniteOrganisation = '%s'\n" "$(ps_litteral "$OU_AD")"
    else
      printf '$UniteOrganisation = $null   # conteneur par défaut du domaine\n'
    fi
    printf '\n$Groupes = @(\n'
    while IFS="$SEPARATEUR" read -r nom _per _fil _pro desc; do
      [[ -n "$nom" ]] || continue
      printf "  @{ Nom = '%s'; Description = '%s' }\n" "$(ps_litteral "$nom")" "$(ps_litteral "$desc")"
    done <<< "$GROUPES"
    printf ')\n'
    cat <<'FIN'

$Crees = 0; $Existants = 0; $Echecs = @()
foreach ($G in $Groupes) {
    $Present = Get-ADGroup -LDAPFilter "(sAMAccountName=$($G.Nom))" -ErrorAction SilentlyContinue
    if ($Present) {
        $Existants++
        Write-Host ("  = {0}" -f $G.Nom)
        continue
    }
    try {
        $Parametres = @{
            Name           = $G.Nom
            SamAccountName = $G.Nom
            GroupCategory  = 'Security'
            GroupScope     = 'Global'
            Description    = $G.Description
        }
        if ($UniteOrganisation) { $Parametres['Path'] = $UniteOrganisation }
        New-ADGroup @Parametres
        $Crees++
        Write-Host ("  + {0}" -f $G.Nom) -ForegroundColor Green
    } catch {
        $Echecs += ("{0} : {1}" -f $G.Nom, $_.Exception.Message)
        Write-Host ("  ! {0} : {1}" -f $G.Nom, $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host ""
Write-Host ("{0} attendu(s) - {1} cree(s) - {2} deja present(s) - {3} en echec" -f `
            $Groupes.Count, $Crees, $Existants, $Echecs.Count)
if ($Echecs.Count -gt 0) {
    Write-Host "Des groupes n'ont pas pu etre crees : les comptes du profil concerne n'auront" -ForegroundColor Red
    Write-Host "AUCUN acces a l'application, et rien ne le signalera cote applicatif." -ForegroundColor Red
    exit 1
}
FIN
    ;;

  verifier)
    info "Groupes AD : $NB_GROUPES attendu(s) — $NB_ACTIVES filiale(s) active(s), $NB_PROFILS profil(s), préfixe « $PREFIXE »"
    if [[ "$NB_ACTIVES" -eq 0 ]]; then
      alerte "AUCUNE filiale active — ni en base, ni dans $FICHIER_FILIALES."
      alerte "La liste se réduit aux groupes de périmètre Groupe et aux deux transversaux :"
      alerte "aucun RSSI de site, aucun contributeur, aucun qualité n'obtiendra d'accès."
      alerte "Déclarez-les (CONVENTIONS.md §27), amorcez la base, puis relancez :"
      alerte "  node backend/db/importer-filiales.mjs"
      exit 5
    fi
    succes "périmètre sain ($ORIGINE_FILIALES, $NB_LIGNES ligne(s) dont $NB_INACTIVES hors périmètre)"

    # ── CONFRONTATION FICHIER ↔ TABLE — la TROISIÈME de ce script ────────────
    #
    # ⚠️ **Un fichier devenu obsolète est un piège, pas un détail.** Depuis le
    # 24/09/2026, la table est la source et `filiales.conf` n'est qu'un amorçage :
    # une acquisition se déclare à l'écran, et le fichier ne bouge pas. Quelqu'un
    # l'éditera pourtant, dans six mois, en croyant agir sur le produit — et rien
    # ne se passera. On le DIT donc, sans en faire un échec : ce n'est pas une
    # panne, c'est un document qui a vieilli.
    if [[ "$ORIGINE_FILIALES" == table* && -n "${FILIALES_DU_FICHIER//[[:space:]]/}" ]]; then
      # ⚠️ `if … fi` et non `[[ … ]] && …` : le statut d'une boucle `while` est
      #    celui de la DERNIÈRE commande de son corps, et `LIGNES_FILIALES` finit
      #    par un retour à la ligne — la dernière itération voit un code vide, le
      #    test échoue, la boucle rend 1, et `set -e` tue le script. Payé une fois,
      #    sur un `--verifier` qui sortait en code 1 sans un mot.
      CODES_BASE="$(while IFS="$SEPARATEUR" read -r c _r; do
        if [[ -n "$c" ]]; then printf '%s\n' "$c"; fi
      done <<< "$LIGNES_FILIALES" | sort -u)"
      CODES_FICHIER="$(while IFS="$SEPARATEUR" read -r c _r a; do
        if [[ -n "$c" && "$a" == "oui" ]]; then printf '%s\n' "$c"; fi
      done <<< "$FILIALES_DU_FICHIER" | sort -u)"
      ABSENTS_DU_FICHIER="$(comm -23 <(printf '%s\n' "$CODES_BASE") <(printf '%s\n' "$CODES_FICHIER") | sed '/^$/d')"
      ABSENTS_DE_LA_BASE="$(comm -13 <(printf '%s\n' "$CODES_BASE") <(printf '%s\n' "$CODES_FICHIER") | sed '/^$/d')"
      if [[ -n "$ABSENTS_DU_FICHIER" || -n "$ABSENTS_DE_LA_BASE" ]]; then
        while IFS= read -r c; do [[ -n "$c" ]] && alerte "en base, absente de $FICHIER_FILIALES : $c"; done <<< "$ABSENTS_DU_FICHIER"
        while IFS= read -r c; do [[ -n "$c" ]] && alerte "déclarée dans le fichier, inconnue de la base : $c"; done <<< "$ABSENTS_DE_LA_BASE"
        alerte "La TABLE fait foi : c'est elle qui a servi à engendrer la liste ci-dessus."
        alerte "Le fichier n'est qu'un amorçage — éditer ce fichier n'agit PLUS sur le produit."
        alerte "Une acquisition se déclare à l'écran : Administration → Filiales."
      else
        succes "fichier et table concordent ($FICHIER_FILIALES n'a pas vieilli)"
      fi
    fi

    # ── Confrontation à la table `groupes_ad`, QUAND elle est peuplée ──────
    #
    # `groupes_ad` est l'autorité applicative : un groupe absent de la table
    # n'accorde rien, même s'il existe dans l'annuaire (`src/droits/resolution.ts`).
    # Elle est alimentée par `synchroniserGroupesAd()`, et elle est donc VIDE
    # tant que cette synchronisation n'a pas eu lieu. Ce cas-là est dit, pas
    # compté comme un écart : confondre « pas encore synchronisé » avec « 162
    # groupes manquants » ferait crier ce contrôle à chaque installation neuve,
    # et un contrôle qui crie toujours ne se lit plus.
    if ! DECLARES="$(interroger <<SQL
select nom, case when actif then 'actif' else 'inactif' end from groupes_ad order by lower(nom);
SQL
)"; then
      alerte "La table « groupes_ad » n'a pas pu être lue : la confrontation n'a PAS eu lieu."
      alerte "Ce n'est pas un feu vert — seule la déclaration des filiales a été éprouvée."
      exit 0
    fi
    DECLARES="$(printf '%s' "$DECLARES" | sed '/^$/d')"
    if [[ -z "$DECLARES" ]]; then
      alerte "« groupes_ad » est vide : la synchronisation applicative n'a pas encore eu lieu."
      alerte "Tant qu'elle n'a pas eu lieu, AUCUN groupe de l'annuaire n'accorde quoi que ce soit."
      exit 0
    fi

    # Dans les DEUX SENS (CONVENTIONS.md §20.2) : ce qui manque, et ce qui est là
    # sans être attendu. Le second cas coûte plus cher — un groupe hors convention
    # mais actif continue d'accorder des droits à qui est dans le groupe AD.
    ATTENDUS_NOMS="$(while IFS="$SEPARATEUR" read -r nom _r; do [[ -n "$nom" ]] && printf '%s\n' "${nom,,}"; done <<< "$GROUPES" | sort -u)"
    DECLARES_NOMS="$(while IFS="$SEPARATEUR" read -r nom _a; do [[ -n "$nom" ]] && printf '%s\n' "${nom,,}"; done <<< "$DECLARES" | sort -u)"
    MANQUANTS="$(comm -23 <(printf '%s\n' "$ATTENDUS_NOMS") <(printf '%s\n' "$DECLARES_NOMS") | sed '/^$/d')"
    SURNUMERAIRES="$(comm -13 <(printf '%s\n' "$ATTENDUS_NOMS") <(printf '%s\n' "$DECLARES_NOMS") | sed '/^$/d')"

    ECART=0
    if [[ -n "$MANQUANTS" ]]; then
      ECART=1
      while IFS= read -r n; do [[ -n "$n" ]] && alerte "attendu, absent de groupes_ad : ${n^^}"; done <<< "$MANQUANTS"
      alerte "Une filiale a été déclarée sans que la synchronisation ait suivi : les comptes de"
      alerte "ces groupes se connecteront et n'obtiendront AUCUN droit, sans message d'erreur."
    fi
    if [[ -n "$SURNUMERAIRES" ]]; then
      ECART=1
      while IFS= read -r n; do
        [[ -n "$n" ]] || continue
        ETAT="$(while IFS="$SEPARATEUR" read -r nom actif; do [[ "${nom,,}" == "$n" ]] && printf '%s' "$actif"; done <<< "$DECLARES")"
        alerte "déclaré dans groupes_ad, hors convention (${ETAT:-?}) : ${n^^}"
      done <<< "$SURNUMERAIRES"
      alerte "Une filiale retirée de $FICHIER_FILIALES, ou un nom saisi à la main. Tant que la"
      alerte "ligne est ACTIVE, elle continue d'accorder des droits à qui est dans le groupe AD."
    fi
    [[ $ECART -eq 0 ]] || exit 3
    succes "groupes_ad : les $NB_GROUPES groupes de la convention sont déclarés, et rien d'autre"
    ;;
esac
