#!/usr/bin/env bash
# =============================================================================
#  Installation de Cyber GRC Groupe sur Debian 13 — SANS conteneur.
# =============================================================================
#
# Idempotent : ré-exécutable sans dommage. À lancer en root.
#
#   bash install.sh                    installation ou mise à jour complète
#   bash install.sh --maj              mise à jour applicative seule (pas de paquets)
#   bash install.sh --seulement-base   rôles, base et migrations seulement
#   bash install.sh --aide             la liste complète des options
#
# ── Séparation des rôles PostgreSQL (le point le plus important de ce script) ──
#
# Trois rôles sont créés, conformément à `db/CONVENTIONS.md` §14 :
#
#   grc_proprietaire   applique les migrations, PROPRIÉTAIRE de la base et des objets
#   grc_app            compte du service systemd : CRUD, sans DDL, sans BYPASSRLS
#   grc_lecture        supervision et exports d'exploitation : select
#
# Cette séparation n'est pas une commodité d'exploitation, c'est une exigence de
# sécurité. L'ajout seul du journal d'audit repose sur quatre couches cumulatives
# (`db/CONVENTIONS.md` §12) dont la quatrième est : « le rôle applicatif n'est pas
# propriétaire de la table — seul le propriétaire peut alter table … disable
# trigger ». Si la base appartient au compte du service, une API compromise peut
# désarmer les déclencheurs et réécrire le journal : la réponse à la question que
# pose l'auditeur ISO 27001 (« le RSSI peut-il modifier le journal ? », PLAN_SERVEUR
# §1.7) devient « oui », et le journal ne prouve plus rien.
#
# Le script le vérifie explicitement en fin de parcours (§ « Contrôles de sécurité »)
# et ÉCHOUE si la propriété n'est pas celle attendue.
#
# ── Secrets ───────────────────────────────────────────────────────────────────
#
# Le script ENGENDRE les secrets purement internes, qui n'existent nulle part
# ailleurs et que personne n'a de raison de choisir à la main :
#
#   BASE_MOT_DE_PASSE, BASE_MOT_DE_PASSE_PROPRIETAIRE, BASE_MOT_DE_PASSE_LECTURE
#   SESSION_SECRET
#
# Il n'engendre AUCUN secret venu d'un autre système — mot de passe du compte de
# service LDAP, relais SMTP, empreinte du compte de secours : ceux-là sont
# renseignés à la main par l'exploitant, et le script s'arrête pour le lui demander.
#
# Aucun secret n'est affiché, journalisé, ni passé en argument de commande : un
# mot de passe sur la ligne de commande de `psql` est lisible par `ps` de tout
# compte de la machine. Le SQL arrive donc par l'entrée standard, et les secrets
# destinés à `node` passent par l'environnement du seul processus fils.
#
# ── Ce que le script ne fait pas ──────────────────────────────────────────────
#
# Il ne réinitialise JAMAIS le mot de passe d'un rôle existant sans qu'on le lui
# demande (`--reinitialiser-mots-de-passe`), et il ne reprend JAMAIS la propriété
# d'une base existante sans qu'on le lui demande (`--reprendre-propriete`). Sur un
# outil qui héberge le PCA d'un groupe industriel, on ne bricole pas la base de
# production en silence.
# =============================================================================

set -Eeuo pipefail

# ------------------------------------------------------------------ réglages ----

UTILISATEUR="cyber-grc"
RACINE="/opt/cyber-grc"
DONNEES="/var/lib/cyber-grc"
JOURNAUX="/var/log/cyber-grc"
SAUVEGARDES="/var/backups/cyber-grc"

# CYBER_GRC_CONFIG : point d'entrée réservé à la RECETTE et aux essais du script
# lui-même (le banc d'essai n'a pas à écrire dans /etc). En production, laisser vide.
CONFIG="${CYBER_GRC_CONFIG:-/etc/cyber-grc}"
FICHIER_CONFIG="$CONFIG/env"
# Nom historique, antérieur à l'alignement sur `src/config/index.ts` et
# `.env.example`, qui annoncent tous deux /etc/cyber-grc/env. Repris automatiquement
# ci-dessous : un fichier de configuration lu par personne est un piège silencieux.
ANCIEN_FICHIER_CONFIG="$CONFIG/serveur.env"

SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPOT="$(cd "$SOURCE/.." && pwd)"

SUPERUTILISATEUR="${PGSUPERUTILISATEUR:-postgres}"

MAJ_SEULE=0
SEULEMENT_BASE=0
REPRENDRE_PROPRIETE=0
REINITIALISER_MDP=0

info()   { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
succes() { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
alerte() { printf '\033[1;33m  !!\033[0m %s\n' "$*" >&2; }
echec()  { printf '\033[1;31m ERR\033[0m %s\n' "$*" >&2; exit 1; }

# `set -E` propage ce piège dans les fonctions : un échec non prévu doit dire OÙ.
trap 'printf "\033[1;31m ERR\033[0m interruption ligne %s : %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR

aide() {
  cat <<'FIN'
Installe ou met à jour Cyber GRC Groupe sur Debian 13 (sans conteneur).

  --maj                          mise à jour applicative seule : ni dépôts, ni paquets
  --seulement-base               s'arrête après les rôles, la base et les migrations
                                 (ni code, ni service, ni frontal — utile en recette)
  --reprendre-propriete          DESTRUCTIF, à n'employer que si le script le demande :
                                 rend la base et ses objets à grc_proprietaire quand une
                                 installation antérieure les a laissés au compte du service
  --reinitialiser-mots-de-passe  réécrit le mot de passe des rôles PostgreSQL existants
                                 (à employer quand le fichier de configuration a été perdu)
  --aide                         ce message

Variables d'environnement reconnues :
  CYBER_GRC_HORS_LIGNE=1         n'appelle pas le registre npm : reprend node_modules
                                 et dist depuis l'arborescence source, préparés en amont
                                 sur une machine raccordée (VM sans accès sortant)
  CYBER_GRC_CONFIG=<répertoire>  déplace /etc/cyber-grc (recette et essais du script)
  PGSUPERUTILISATEUR=<rôle>      compte superutilisateur PostgreSQL (défaut : postgres)

Rôles PostgreSQL (db/CONVENTIONS.md §14) :
  grc_proprietaire  migrations et propriété des objets (DDL)
  grc_app           service applicatif : CRUD, sans DDL, sans BYPASSRLS
  grc_lecture       supervision et exports d'exploitation : select

Configuration : /etc/cyber-grc/env  (modèle : backend/.env.example)
FIN
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --maj)                          MAJ_SEULE=1; shift ;;
    --seulement-base)               SEULEMENT_BASE=1; shift ;;
    --reprendre-propriete)          REPRENDRE_PROPRIETE=1; shift ;;
    --reinitialiser-mots-de-passe)  REINITIALISER_MDP=1; shift ;;
    --aide|-h|--help)               aide; exit 0 ;;
    *) echec "Option inconnue : $1 (voir --aide)." ;;
  esac
done

[[ $EUID -eq 0 ]] || echec "À lancer en root."

# =============================================================================
#  Outils : lecture et écriture du fichier de configuration
# =============================================================================
#
# Le fichier n'est PAS interprété par le shell. `source` exécuterait tout ce qu'il
# contient : une valeur du genre `SMTP_MOT_DE_PASSE=$(commande)` s'exécuterait en
# root. systemd, lui, ne l'interprète pas — le script ne doit pas faire pire que le
# consommateur réel du fichier.

lire_variable() {
  local cle="$1" valeur="" ligne
  [[ -f "$FICHIER_CONFIG" ]] || { printf ''; return 0; }
  while IFS= read -r ligne || [[ -n "$ligne" ]]; do
    if [[ "$ligne" =~ ^[[:space:]]*${cle}=(.*)$ ]]; then
      valeur="${BASH_REMATCH[1]}"
    fi
  done < "$FICHIER_CONFIG"
  valeur="${valeur%$'\r'}"                       # fichier édité sous Windows
  [[ "$valeur" == \"*\" ]] && valeur="${valeur:1:${#valeur}-2}"
  printf '%s' "$valeur"
}

# Écriture en place, sans jamais faire transiter la valeur par une ligne de commande
# (donc invisible de `ps`) : tout se fait en bash pur, puis un renommage atomique.
definir_variable() {
  local cle="$1" valeur="$2" temporaire remplace=0 ligne
  temporaire="$(mktemp "${FICHIER_CONFIG}.XXXXXX")"
  chmod 0600 "$temporaire"
  while IFS= read -r ligne || [[ -n "$ligne" ]]; do
    if [[ $remplace -eq 0 && "$ligne" =~ ^[[:space:]]*${cle}= ]]; then
      printf '%s=%s\n' "$cle" "$valeur" >> "$temporaire"
      remplace=1
    else
      printf '%s\n' "$ligne" >> "$temporaire"
    fi
  done < "$FICHIER_CONFIG"
  [[ $remplace -eq 1 ]] || printf '%s=%s\n' "$cle" "$valeur" >> "$temporaire"
  appliquer_droits_config "$temporaire"
  mv -f "$temporaire" "$FICHIER_CONFIG"
}

appliquer_droits_config() {
  local cible="$1"
  # root:cyber-grc 0640 — le compte de service lit, personne d'autre.
  if id -u "$UTILISATEUR" >/dev/null 2>&1; then
    chown root:"$UTILISATEUR" "$cible"
    chmod 0640 "$cible"
  else
    chown root:root "$cible"
    chmod 0600 "$cible"
  fi
}

# 32 octets d'aléa cryptographique, en hexadécimal (64 caractères) — la longueur
# annoncée par `.env.example` pour SESSION_SECRET.
engendrer_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    # Repli sans dépendance : /dev/urandom est la même source d'entropie.
    od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
  fi
}

# =============================================================================
#  Outils : accès PostgreSQL
# =============================================================================
#
# Le SQL arrive par l'entrée standard (« -f - ») : rien ne transite par la ligne de
# commande, donc aucun mot de passe n'apparaît dans `ps`. Le `cd /tmp` évite le
# « could not change directory to /root » que produit `su postgres` depuis /root.

sql_admin() {          # SQL sur stdin, exécuté sur la base « postgres »
  ( cd /tmp && su "$SUPERUTILISATEUR" -s /bin/sh \
      -c 'psql -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -f -' )
}

sql_admin_base() {     # SQL sur stdin, exécuté sur la base applicative
  # $BASE_NOM est passé par `valider_identifiant` avant tout usage : l'interpolation
  # dans la ligne de commande est close, elle ne vient jamais d'une saisie libre.
  ( cd /tmp && su "$SUPERUTILISATEUR" -s /bin/sh \
      -c "psql -X -q -A -t -v ON_ERROR_STOP=1 -d $BASE_NOM -f -" )
}

# Doublement des apostrophes : le mot de passe finit dans un littéral SQL.
litteral() { printf "%s" "${1//\'/\'\'}"; }

# Un identifiant PostgreSQL, et rien d'autre : ces valeurs sont interpolées dans du
# DDL (« create database … owner … »), elles ne peuvent pas être quelconques.
valider_identifiant() {
  [[ "$2" =~ ^[a-z_][a-z0-9_]*$ ]] \
    || echec "$1 : « $2 » n'est pas un identifiant PostgreSQL valide."
}

# =============================================================================
#  1. Paquets système
# =============================================================================

if [[ $MAJ_SEULE -eq 0 && $SEULEMENT_BASE -eq 0 ]]; then
  info "Paquets système"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  # openssl : engendre les secrets. rsync : déploiement du code.
  apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg openssl apache2 clamav clamav-daemon rsync
  succes "paquets de base"

  # PostgreSQL depuis le dépôt officiel PGDG : on maîtrise la version dans la
  # durée plutôt que de subir celle de la distribution (PLAN_SERVEUR §1.2).
  if [[ ! -f /etc/apt/sources.list.d/pgdg.list ]]; then
    install -d /usr/share/postgresql-common/pgdg
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list
    apt-get update -qq
  fi
  apt-get install -y --no-install-recommends postgresql-17 postgresql-client-17
  succes "PostgreSQL"

  # Node.js 22 LTS depuis NodeSource : Debian ne fournit pas la version requise.
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -c2- | cut -d. -f1)" -lt 22 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
  succes "Node.js $(node -v)"

  # reqtimeout : protection contre les connexions lentes (Slowloris), cf. le vhost.
  a2enmod -q ssl proxy proxy_http headers rewrite deflate expires reqtimeout
  # Aucune page d'index automatique n'est servie : le frontend a un index.html.
  a2dismod -q -f autoindex || true
  # Durcissement de portée serveur (ServerTokens, TraceEnable) : ces directives
  # n'existent pas dans un VirtualHost, elles vivent dans conf-available.
  install -m 0644 "$SOURCE/deploy/apache/durcissement-global.conf" \
                  /etc/apache2/conf-available/cyber-grc-durcissement.conf
  a2enconf -q cyber-grc-durcissement
  systemctl enable --now postgresql clamav-daemon clamav-freshclam apache2
fi

# =============================================================================
#  2. Compte de service
# =============================================================================

if [[ $SEULEMENT_BASE -eq 0 ]]; then
  info "Compte de service"
  if ! id -u "$UTILISATEUR" >/dev/null 2>&1; then
    # Sans shell et sans domicile : ce compte ne sert qu'à faire tourner le service.
    useradd --system --no-create-home --home-dir /nonexistent \
            --shell /usr/sbin/nologin "$UTILISATEUR"
  fi
  # La socket de ClamAV (/run/clamav/clamd.ctl) appartient au groupe « clamav ».
  # L'appartenance est posée ici plutôt que par SupplementaryGroups= dans l'unité :
  # sur une VM sans ClamAV, un groupe inexistant empêcherait le service de démarrer.
  if getent group clamav >/dev/null 2>&1; then
    if ! id -nG "$UTILISATEUR" | tr ' ' '\n' | grep -qx clamav; then
      usermod -aG clamav "$UTILISATEUR"
      succes "$UTILISATEUR ajouté au groupe clamav (accès à la socket d'analyse)"
    fi
  else
    alerte "Groupe « clamav » absent : l'analyse antivirale des pièces jointes"
    alerte "(PLAN_SERVEUR §1.6, contrôle n° 4) ne pourra pas fonctionner."
  fi
  succes "$UTILISATEUR"
fi

# =============================================================================
#  3. Arborescence
# =============================================================================

if [[ $SEULEMENT_BASE -eq 0 ]]; then
  info "Arborescence"
  install -d -o root           -g root           -m 0755 "$RACINE"
  install -d -o root           -g "$UTILISATEUR" -m 0750 "$CONFIG"
  # 0700 et hors de l'arborescence servie par Apache : le magasin de pièces jointes
  # n'est jamais atteignable par le frontal (PLAN_SERVEUR §1.6, contrôle n° 5).
  install -d -o "$UTILISATEUR" -g "$UTILISATEUR" -m 0700 \
          "$DONNEES" "$DONNEES"/{pieces-jointes,quarantaine,temporaire}
  install -d -o "$UTILISATEUR" -g "$UTILISATEUR" -m 0750 "$JOURNAUX"
  install -d -o root           -g root           -m 0700 "$SAUVEGARDES"
  succes "répertoires (pièces jointes en 0700, hors de portée d'Apache)"
else
  install -d -o root -g root -m 0750 "$CONFIG"
fi

# =============================================================================
#  4. Code source
# =============================================================================

if [[ $SEULEMENT_BASE -eq 0 ]]; then
  info "Déploiement du code"
  # `db/dev` et `test` ne servent qu'au développement : `db/dev/preparer_base_dev.sh`
  # pose un mot de passe connu (« dev ») et n'a rien à faire sur une machine de
  # production, même s'il refuse d'y tourner.
  rsync -a --delete \
        --exclude node_modules --exclude .env --exclude 'var/' \
        --exclude 'db/dev/' --exclude 'test/' \
        "$SOURCE/" "$RACINE/backend/"
  # Le frontend est servi directement par Apache.
  rsync -a --delete "$DEPOT/cyber-gouvernance_V4/" "$RACINE/frontend/"
  # Le code appartient à root et n'est modifiable par personne d'autre : le compte
  # de service ne doit pas pouvoir réécrire ce qu'il exécute (l'unité systemd pose
  # en plus ProtectSystem=strict et ReadOnlyPaths, en défense en profondeur).
  chown -R root:root "$RACINE"
  chmod -R go-w "$RACINE"
  succes "code déployé (root:root, non modifiable par $UTILISATEUR)"

  info "Dépendances et compilation"
  if [[ "${CYBER_GRC_HORS_LIGNE:-0}" == "1" ]]; then
    # La VM cible n'a pas d'accès sortant (VPN uniquement, PLAN_SERVEUR §0.2) : le
    # registre npm est injoignable. Les dépendances et le code compilé sont alors
    # préparés en amont, sur une machine raccordée, puis transportés dans
    # l'arborescence source. Ce mode n'installe rien : il recopie.
    [[ -d "$SOURCE/node_modules" ]] \
      || echec "CYBER_GRC_HORS_LIGNE=1 mais $SOURCE/node_modules est absent.
      Préparez l'arborescence sur une machine raccordée :
        cd backend && npm ci --omit=dev && npm run build"
    [[ -d "$SOURCE/dist" ]] \
      || echec "CYBER_GRC_HORS_LIGNE=1 mais $SOURCE/dist est absent (code non compilé)."
    rsync -a --delete "$SOURCE/node_modules/" "$RACINE/backend/node_modules/"
    succes "dépendances et build repris de l'arborescence source (mode hors ligne)"
  else
    # `npm ci` complet (TypeScript est en devDependencies), compilation, puis élagage :
    # la machine de production ne conserve que les dépendances d'exécution.
    # Suppose un accès sortant au registre npm — voir CYBER_GRC_HORS_LIGNE sinon.
    ( cd "$RACINE/backend" \
      && npm ci --include=dev --silent \
      && npm run build --silent \
      && npm prune --omit=dev --silent )
    succes "build"
  fi
  chown -R root:root "$RACINE/backend"
  chmod -R go-w "$RACINE/backend"
fi

# =============================================================================
#  5. Configuration
# =============================================================================

info "Configuration"

# Reprise du nom historique : /etc/cyber-grc/serveur.env n'est lu ni par
# `src/config/index.ts` ni par le message d'erreur du serveur, qui désignent tous
# deux /etc/cyber-grc/env. Un fichier édité mais jamais lu est un piège.
if [[ ! -f "$FICHIER_CONFIG" && -f "$ANCIEN_FICHIER_CONFIG" ]]; then
  mv -f "$ANCIEN_FICHIER_CONFIG" "$FICHIER_CONFIG"
  alerte "Configuration renommée : $ANCIEN_FICHIER_CONFIG → $FICHIER_CONFIG"
fi

PREMIERE_INSTALLATION=0
if [[ ! -f "$FICHIER_CONFIG" ]]; then
  install -m 0600 "$SOURCE/.env.example" "$FICHIER_CONFIG"
  PREMIERE_INSTALLATION=1
fi
appliquer_droits_config "$FICHIER_CONFIG"

# Version affichée par /api/sante et tracée au journal d'audit (§0.3).
if [[ -f "$SOURCE/package.json" ]]; then
  VERSION_PAQUET="$(node -p "require('$SOURCE/package.json').version" 2>/dev/null || echo '')"
  if [[ -n "$VERSION_PAQUET" ]]; then definir_variable APPLICATION_VERSION "$VERSION_PAQUET"; fi
fi

BASE_HOTE="$(lire_variable BASE_HOTE)";  BASE_HOTE="${BASE_HOTE:-127.0.0.1}"
BASE_PORT="$(lire_variable BASE_PORT)";  BASE_PORT="${BASE_PORT:-5432}"
BASE_NOM="$(lire_variable BASE_NOM)";    BASE_NOM="${BASE_NOM:-cyber_grc}"

ROLE_APP="$(lire_variable BASE_UTILISATEUR)";                    ROLE_APP="${ROLE_APP:-grc_app}"
ROLE_PROPRIETAIRE="$(lire_variable BASE_UTILISATEUR_PROPRIETAIRE)"
ROLE_PROPRIETAIRE="${ROLE_PROPRIETAIRE:-grc_proprietaire}"
# BASE_UTILISATEUR_LECTURE n'existe pas encore dans .env.example (fichier réservé à
# l'orchestrateur) : la valeur du §14 des CONVENTIONS sert de défaut.
ROLE_LECTURE="$(lire_variable BASE_UTILISATEUR_LECTURE)";        ROLE_LECTURE="${ROLE_LECTURE:-grc_lecture}"

valider_identifiant BASE_NOM "$BASE_NOM"
valider_identifiant BASE_UTILISATEUR "$ROLE_APP"
valider_identifiant BASE_UTILISATEUR_PROPRIETAIRE "$ROLE_PROPRIETAIRE"
valider_identifiant BASE_UTILISATEUR_LECTURE "$ROLE_LECTURE"

[[ "$ROLE_APP" != "$ROLE_PROPRIETAIRE" ]] \
  || echec "BASE_UTILISATEUR et BASE_UTILISATEUR_PROPRIETAIRE désignent le même rôle
      (« $ROLE_APP »). Toute la garantie d'ajout seul du journal d'audit repose sur
      leur séparation (db/CONVENTIONS.md §12, couche 4)."
[[ "$ROLE_APP" != "$ROLE_LECTURE" ]] \
  || echec "BASE_UTILISATEUR et BASE_UTILISATEUR_LECTURE désignent le même rôle."

# Les migrations posent leurs « grant » sur des noms de rôles ÉCRITS EN DUR
# (« grc_app », « grc_lecture » dans db/migrations/001_socle.sql §0). Renommer les
# rôles ici ne renomme rien là-bas : le service se retrouverait avec un compte
# valide et aucun privilège, panne difficile à relier à sa cause.
for attendu in "$ROLE_APP:grc_app:BASE_UTILISATEUR" "$ROLE_LECTURE:grc_lecture:BASE_UTILISATEUR_LECTURE"; do
  reel="${attendu%%:*}"; reste="${attendu#*:}"; canonique="${reste%%:*}"; variable="${reste#*:}"
  if [[ "$reel" != "$canonique" ]]; then
    alerte "$variable = « $reel » alors que les migrations accordent leurs privilèges"
    alerte "à « $canonique » (nom écrit en dur dans db/migrations/001_socle.sql)."
    alerte "Le rôle « $reel » n'aura AUCUN privilège sur les tables. Conservez le nom"
    alerte "canonique, ou faites corriger les migrations."
  fi
done

succes "configuration : $FICHIER_CONFIG (base « $BASE_NOM » sur $BASE_HOTE:$BASE_PORT)"

# ---- secrets internes : engendrés, jamais affichés -------------------------

info "Secrets internes"
if [[ -z "$(lire_variable SESSION_SECRET)" ]]; then
  definir_variable SESSION_SECRET "$(engendrer_secret)"
  succes "SESSION_SECRET engendré (32 octets d'aléa, hexadécimal)"
else
  succes "SESSION_SECRET déjà renseigné, laissé tel quel"
fi

# ---- valeurs que le script ne peut pas deviner -----------------------------

# Sous --seulement-base, seule la base est en jeu : exiger l'annuaire et le relais
# de messagerie n'aurait pas de sens.
MANQUANTS=()
if [[ $SEULEMENT_BASE -eq 0 ]]; then
  [[ "$(lire_variable SERVEUR_URL_PUBLIQUE)" == https://* ]] || MANQUANTS+=("SERVEUR_URL_PUBLIQUE")
  if [[ "$(lire_variable AUTH_LDAP_ACTIF)" != "non" ]]; then
    for cle in LDAP_URL LDAP_BASE_RECHERCHE LDAP_DN_SERVICE LDAP_MOT_DE_PASSE_SERVICE; do
      [[ -n "$(lire_variable "$cle")" ]] || MANQUANTS+=("$cle")
    done
  fi
  if [[ "$(lire_variable SMTP_ACTIF)" == "oui" ]]; then
    [[ -n "$(lire_variable SMTP_HOTE)" ]] || MANQUANTS+=("SMTP_HOTE")
  fi
fi

if [[ ${#MANQUANTS[@]} -gt 0 ]]; then
  alerte "Configuration incomplète : ${MANQUANTS[*]}"
  alerte "Ces valeurs viennent de VOTRE système d'information (annuaire, relais de"
  alerte "messagerie, URL publique) : le script ne peut pas les inventer."
  alerte "Renseignez $FICHIER_CONFIG puis relancez ce script."
  if [[ $PREMIERE_INSTALLATION -eq 1 ]]; then
    alerte "Les secrets internes, eux, ont déjà été engendrés."
  fi
  exit 2
fi
if [[ $SEULEMENT_BASE -eq 0 ]]; then succes "valeurs propres au déploiement renseignées"; fi

# ---- cohérence des chemins : le magasin reste hors du webroot --------------
# PLAN_SERVEUR §1.6, contrôle n° 5. Le serveur applicatif refuse également de
# démarrer dans ce cas, mais autant le dire à l'installation qu'au premier crash.

CHEMIN_FRONTEND="$(lire_variable CHEMIN_FRONTEND)"; CHEMIN_FRONTEND="${CHEMIN_FRONTEND:-$RACINE/frontend}"
for cle in CHEMIN_PIECES_JOINTES CHEMIN_QUARANTAINE CHEMIN_TEMPORAIRE; do
  chemin="$(lire_variable "$cle")"
  [[ -n "$chemin" ]] || continue
  [[ "$chemin" == /* ]] || echec "$cle : chemin relatif (« $chemin ») — un chemin absolu est exigé."
  case "$chemin/" in
    "$CHEMIN_FRONTEND"/*)
      echec "$cle (« $chemin ») est sous CHEMIN_FRONTEND (« $CHEMIN_FRONTEND ») :
      Apache servirait les pièces jointes en direct, sans contrôle des droits.
      PLAN_SERVEUR §1.6, contrôle n° 5 : le magasin reste hors de l'arborescence web." ;;
  esac
done
succes "magasin de pièces jointes hors de l'arborescence servie par Apache"

# =============================================================================
#  6. Rôles PostgreSQL
# =============================================================================

info "Rôles PostgreSQL (db/CONVENTIONS.md §14)"

command -v psql >/dev/null 2>&1 || echec "psql introuvable : le client PostgreSQL est requis."
printf 'select 1;\n' | sql_admin >/dev/null 2>&1 \
  || echec "Connexion superutilisateur impossible (compte « $SUPERUTILISATEUR »).
      Le cluster PostgreSQL est-il démarré ? (systemctl status postgresql)"

role_existe() {
  [[ "$(printf "select 1 from pg_roles where rolname = '%s';\n" "$(litteral "$1")" | sql_admin)" == "1" ]]
}

# Un rôle = un mot de passe. Trois cas, et un seul est ambigu :
#   - rôle absent            → création avec le mot de passe du fichier, engendré s'il est vide
#   - rôle présent, mdp connu → on ne touche à rien
#   - rôle présent, mdp vide  → ARRÊT : le script ne réinitialise pas un secret sans ordre
preparer_role() {
  local role="$1" cle_mdp="$2" attributs="$3" description="$4" mdp

  mdp="$(lire_variable "$cle_mdp")"

  if role_existe "$role"; then
    if [[ $REINITIALISER_MDP -eq 1 ]]; then
      [[ -n "$mdp" ]] || { mdp="$(engendrer_secret)"; definir_variable "$cle_mdp" "$mdp"; }
      printf "alter role %s password '%s';\n" "$role" "$(litteral "$mdp")" | sql_admin
      alerte "$role — mot de passe réinitialisé (--reinitialiser-mots-de-passe)"
    elif [[ -z "$mdp" ]]; then
      echec "Le rôle « $role » existe déjà mais $cle_mdp est vide dans $FICHIER_CONFIG.
      Le script ne devine pas un secret et n'en réécrit pas un sans ordre explicite.
      Deux issues :
        - renseigner $cle_mdp avec le mot de passe en vigueur ;
        - relancer avec --reinitialiser-mots-de-passe (réécrit le secret des trois rôles)."
    else
      succes "$role — déjà présent, laissé tel quel ($description)"
    fi
    return
  fi

  if [[ -z "$mdp" ]]; then
    mdp="$(engendrer_secret)"
    definir_variable "$cle_mdp" "$mdp"
  fi
  # nosuperuser / nobypassrls / nocreaterole / nocreatedb sont posés EXPLICITEMENT :
  # le cloisonnement par RLS en dépend, et un attribut hérité par défaut ne se voit pas.
  printf "create role %s login %s password '%s';\n" \
    "$role" "$attributs" "$(litteral "$mdp")" | sql_admin
  succes "$role — créé ($description)"
}

ATTRIBUTS_COMMUNS="nosuperuser nocreaterole nobypassrls nocreatedb noreplication"

# Le propriétaire n'a PAS besoin de CREATEDB : la base est créée une fois, ici, par
# le superutilisateur. (Le script de développement `db/dev/preparer_base_dev.sh` lui
# accorde CREATEDB pour les bases jetables du banc d'essai — c'est une facilité de
# développement, elle n'a pas cours ici.)
preparer_role "$ROLE_PROPRIETAIRE" BASE_MOT_DE_PASSE_PROPRIETAIRE "$ATTRIBUTS_COMMUNS" \
              "migrations et propriété des objets (DDL)"
preparer_role "$ROLE_APP"          BASE_MOT_DE_PASSE              "$ATTRIBUTS_COMMUNS" \
              "service applicatif : CRUD, sans DDL, sans BYPASSRLS"
preparer_role "$ROLE_LECTURE"      BASE_MOT_DE_PASSE_LECTURE      "$ATTRIBUTS_COMMUNS" \
              "supervision et exports d'exploitation : select"

# =============================================================================
#  7. Base de données
# =============================================================================

info "Base de données « $BASE_NOM »"

proprietaire_base() {
  printf "select pg_get_userbyid(datdba) from pg_database where datname = '%s';\n" \
    "$(litteral "$BASE_NOM")" | sql_admin
}

BASE_EXISTE="$(printf "select 1 from pg_database where datname = '%s';\n" "$(litteral "$BASE_NOM")" | sql_admin)"

if [[ "$BASE_EXISTE" != "1" ]]; then
  # template0 : la base ne dépend pas de ce qui traîne dans template1, et l'encodage
  # est imposé. Si le cluster n'est pas en UTF-8, l'échec est explicite ici.
  printf "create database %s owner %s template template0 encoding 'UTF8';\n" \
    "$BASE_NOM" "$ROLE_PROPRIETAIRE" | sql_admin
  succes "base créée, propriétaire $ROLE_PROPRIETAIRE"
else
  PROPRIETAIRE_ACTUEL="$(proprietaire_base)"
  if [[ "$PROPRIETAIRE_ACTUEL" == "$ROLE_PROPRIETAIRE" ]]; then
    succes "base déjà présente, propriétaire $ROLE_PROPRIETAIRE"
  elif [[ $REPRENDRE_PROPRIETE -eq 1 ]]; then
    alerte "--reprendre-propriete : la base et ses objets passent de « $PROPRIETAIRE_ACTUEL » à « $ROLE_PROPRIETAIRE »."

    # « reassign owned » ne se limite PAS à la base dans laquelle on l'exécute : il
    # déplace aussi les objets PARTAGÉS du cluster, au premier rang desquels les
    # AUTRES BASES appartenant au même rôle. Mesuré sur 16.13 : deux bases d'un même
    # propriétaire, « reassign owned » joué dans la première — les DEUX changent de
    # main. Le cas nominal est sans danger (le propriétaire fautif est le compte du
    # service, qui ne possède rien d'autre), mais l'option se déclenche dès que le
    # propriétaire n'est pas celui attendu : une base créée à la main sous le compte
    # d'un DBA emporterait avec elle tout ce que ce compte possède sur le cluster.
    # On refuse plutôt que de le découvrir après coup — le drapeau est annoncé
    # DESTRUCTIF, encore faut-il qu'il ne détruise que ce qu'on lui montre.
    AUTRES_BASES="$(sql_admin <<SQL
select string_agg(datname, ', ' order by datname)
  from pg_database
 where pg_get_userbyid(datdba) = '$(litteral "$PROPRIETAIRE_ACTUEL")'
   and datname <> '$(litteral "$BASE_NOM")';
SQL
)"
    [[ -z "$AUTRES_BASES" ]] || echec \
      "« $PROPRIETAIRE_ACTUEL » possède d'autres bases sur ce cluster : $AUTRES_BASES
      La reprise emploie « reassign owned », qui déplace aussi les objets partagés :
      ces bases changeraient de propriétaire elles aussi, sans que rien ne le demande.
      Reprenez la propriété à la main, base par base, en superutilisateur PostgreSQL :
        alter database $BASE_NOM owner to $ROLE_PROPRIETAIRE;
        \\c $BASE_NOM
        -- objet par objet, sans « reassign owned » :
        do \$\$ declare r record; begin
          for r in select c.oid::regclass::text n, c.relkind k from pg_class c
                     join pg_namespace s on s.oid = c.relnamespace
                    where s.nspname = 'public' and c.relkind in ('r','p','v','m','S')
                      and pg_get_userbyid(c.relowner) = '$PROPRIETAIRE_ACTUEL'
          loop execute format('alter %s %s owner to $ROLE_PROPRIETAIRE',
                 case r.k when 'S' then 'sequence' when 'v' then 'view'
                          when 'm' then 'materialized view' else 'table' end, r.n);
          end loop; end \$\$;
      puis relancez « bash install.sh --seulement-base »."

    printf "alter database %s owner to %s;\n" "$BASE_NOM" "$ROLE_PROPRIETAIRE" | sql_admin
    # `reassign owned` s'exécute DANS la base concernée, et ne déplace que la
    # propriété : les privilèges du rôle applicatif sont ensuite reposés à la main,
    # car il les tenait jusqu'ici de sa qualité de propriétaire.
    sql_admin_base <<SQL
reassign owned by $PROPRIETAIRE_ACTUEL to $ROLE_PROPRIETAIRE;
grant usage on schema public to $ROLE_APP, $ROLE_LECTURE;
grant select, insert, update, delete on all tables    in schema public to $ROLE_APP;
grant usage, select                  on all sequences in schema public to $ROLE_APP;
grant select                         on all tables    in schema public to $ROLE_LECTURE;
alter default privileges for role $ROLE_PROPRIETAIRE in schema public
      grant select, insert, update, delete on tables to $ROLE_APP;
alter default privileges for role $ROLE_PROPRIETAIRE in schema public
      grant select on tables to $ROLE_LECTURE;
-- Les verrous CIBLÉS posés par les migrations sont reposés APRÈS les grants
-- généraux, jamais avant : le « grant … on all tables » ci-dessus les rouvrirait
-- tous. Il y en a DEUX, et les oublier n'a pas le même prix ailleurs :
--
--   journal_audit      — couche 1 de l'ajout seul (CONVENTIONS §12) ;
--   migrations_schema  — le registre des migrations (004_rls.sql §1). Rendre
--                        « update » à $ROLE_APP lui permet de maquiller l'empreinte
--                        d'une migration déjà appliquée (db/migrate.mjs, code de
--                        sortie 4), donc de réécrire une migration passée sans que
--                        rien ne le signale, et de faire annoncer « déjà appliquée »
--                        une migration de durcissement jamais jouée.
--
-- Ce chemin est celui de la RÉPARATION : c'est le moment où les privilèges doivent
-- être exacts, pas approximativement exacts. Un « revoke » de plus ici ne coûte
-- rien ; un « revoke » de moins rend le garde-fou d'empreinte décoratif.
do \$\$
declare
    declencheur text;
begin
    if to_regclass('public.journal_audit') is not null then
        execute 'revoke all on journal_audit from public';
        execute format('revoke update, delete, truncate on journal_audit from %I', '$ROLE_APP');
        execute format('grant  select, insert on journal_audit to %I', '$ROLE_APP');
        execute format('grant  select on journal_audit to %I', '$ROLE_LECTURE');
        -- Une base dont le compte du service était propriétaire a pu voir ses
        -- déclencheurs désarmés (« alter table … disable trigger »). Une reprise de
        -- propriété qui les laisse au repos ne répare rien : on les réarme en mode
        -- « always », le seul qui résiste à session_replication_role = replica
        -- (CONVENTIONS §12, couche 3).
        for declencheur in
            select tgname from pg_trigger
             where tgrelid = 'public.journal_audit'::regclass and not tgisinternal
        loop
            execute format('alter table journal_audit enable always trigger %I', declencheur);
        end loop;
    end if;

    -- Le registre des migrations : « select » et rien d'autre pour le compte du
    -- service. Le registre s'écrit sous le compte propriétaire, qui seul applique
    -- les migrations (004_rls.sql §1). $ROLE_LECTURE n'est pas touché : il n'a que
    -- « select » (CONVENTIONS §14) et le registre lui sert au diagnostic.
    if to_regclass('public.migrations_schema') is not null then
        execute 'revoke insert, update, delete, truncate on migrations_schema from public';
        execute format(
            'revoke insert, update, delete, truncate on migrations_schema from %I', '$ROLE_APP');
        execute format('grant select on migrations_schema to %I', '$ROLE_APP');
    end if;
end
\$\$;
SQL
    succes "propriété reprise par $ROLE_PROPRIETAIRE, privilèges applicatifs reposés"
  else
    alerte "════════════════════════════════════════════════════════════════════"
    alerte "La base « $BASE_NOM » appartient à « $PROPRIETAIRE_ACTUEL »,"
    alerte "et non à « $ROLE_PROPRIETAIRE »."
    if [[ "$PROPRIETAIRE_ACTUEL" == "$ROLE_APP" ]]; then
      alerte ""
      alerte "C'est le compte du SERVICE. Installation antérieure fautive :"
      alerte "toutes les tables appartiennent au rôle applicatif, qui peut donc"
      alerte "exécuter « alter table journal_audit disable trigger » et réécrire"
      alerte "le journal d'audit. La quatrième couche de la garantie d'ajout seul"
      alerte "(db/CONVENTIONS.md §12) est inopérante : en audit ISO 27001, la"
      alerte "réponse à « le RSSI peut-il modifier le journal ? » devient OUI."
    fi
    alerte ""
    alerte "Marche à suivre, après un instantané Proxmox de la VM :"
    alerte "  1. arrêter le service       systemctl stop cyber-grc"
    alerte "  2. reprise automatique      bash install.sh --reprendre-propriete"
    alerte ""
    alerte "  ou, à la main, en superutilisateur PostgreSQL :"
    alerte "     alter database $BASE_NOM owner to $ROLE_PROPRIETAIRE;"
    alerte "     \\c $BASE_NOM"
    alerte "     reassign owned by $PROPRIETAIRE_ACTUEL to $ROLE_PROPRIETAIRE;"
    alerte "     grant select, insert, update, delete on all tables in schema public to $ROLE_APP;"
    alerte "     -- les deux « revoke » suivants viennent APRÈS le « grant » ci-dessus,"
    alerte "     -- jamais avant : dans l'autre ordre le « grant » les annule."
    alerte "     revoke update, delete, truncate on journal_audit from $ROLE_APP;"
    alerte "     revoke insert, update, delete, truncate on migrations_schema from $ROLE_APP;"
    alerte "     -- et les déclencheurs du journal, qu'une base possédée par le compte du"
    alerte "     -- service a pu voir désarmés (§12, couche 3) :"
    alerte "     do \$\$ declare d text; begin"
    alerte "       for d in select tgname from pg_trigger"
    alerte "                 where tgrelid = 'public.journal_audit'::regclass and not tgisinternal"
    alerte "       loop execute format('alter table journal_audit enable always trigger %I', d);"
    alerte "       end loop; end \$\$;"
    alerte ""
    alerte "  Ces deux tables sont les seules que les migrations ferment nommément au"
    alerte "  compte du service : journal_audit (ajout seul, db/CONVENTIONS.md §12) et"
    alerte "  migrations_schema (garde-fou d'empreinte, 004_rls.sql §1). En oublier une"
    alerte "  rend inopérant le contrôle qu'elle porte."
    alerte ""
    alerte "  Dans les deux cas, relancez ensuite « bash install.sh --seulement-base » :"
    alerte "  les contrôles de sécurité diront si la réparation est complète."
    alerte "════════════════════════════════════════════════════════════════════"
    echec "Propriété de la base non conforme — installation interrompue."
  fi
fi

# Seuls les rôles nommés se connectent : `public` n'a rien à faire ici.
#
# Le `revoke temporary` nommé n'est pas une redondance du `revoke all` qui le
# précède (db/CONVENTIONS.md §17.2). PostgreSQL consulte `pg_temp` AVANT le
# `search_path`, même quand celui-ci est fixé à `public` — ce que fait pourtant
# le pool. Un rôle disposant de `temporary` peut donc masquer une table du schéma
# et détourner une fonction : l'audit de la porte S1 l'a démontré en forgeant une
# entrée de journal au chaînage rompu, en désarmant un déclencheur de cohérence,
# et en rendant aveugle le garde-fou de couverture RLS.
#
# La production le refusait déjà, mais par effet de bord du `revoke all`. Une
# seule ligne posée un jour par commodité (`grant temporary … to $ROLE_APP`)
# rouvrirait la porte sans que rien ne le signale. Le refus est donc explicite,
# et vérifié plus bas.
sql_admin <<SQL
revoke all on database $BASE_NOM from public;
grant connect, temporary on database $BASE_NOM to $ROLE_PROPRIETAIRE;
grant connect on database $BASE_NOM to $ROLE_APP, $ROLE_LECTURE;
revoke temporary on database $BASE_NOM from $ROLE_APP, $ROLE_LECTURE;
SQL
succes "droits de connexion : $ROLE_PROPRIETAIRE, $ROLE_APP, $ROLE_LECTURE (public exclu)"

for role in "$ROLE_APP" "$ROLE_LECTURE"; do
  # Les deux noms de rôle ont déjà passé `valider_identifiant` : rien de libre ici.
  if [[ "$(printf "select has_database_privilege('%s', '%s', 'temporary')" \
             "$role" "$BASE_NOM" | sql_admin)" != "f" ]]; then
    echec "$role dispose de TEMPORARY sur $BASE_NOM : pg_temp peut masquer le schéma (§17.2)."
  fi
done
succes "$ROLE_APP et $ROLE_LECTURE sans TEMPORARY — pg_temp ne peut pas masquer le schéma"

# ---- les mots de passe du fichier fonctionnent-ils vraiment ? --------------
# Sinon l'échec surviendrait plus loin, dans migrate.mjs, sous une forme moins claire.

info "Connexion des rôles"
for couple in "$ROLE_PROPRIETAIRE:BASE_MOT_DE_PASSE_PROPRIETAIRE" \
              "$ROLE_APP:BASE_MOT_DE_PASSE" \
              "$ROLE_LECTURE:BASE_MOT_DE_PASSE_LECTURE"; do
  role="${couple%%:*}"; cle="${couple##*:}"
  # PGPASSWORD n'est visible que dans l'environnement du processus fils
  # (/proc/<pid>/environ, lisible du seul propriétaire) — jamais dans `ps`.
  if PGPASSWORD="$(lire_variable "$cle")" psql -X -q -A -t -w \
       -h "$BASE_HOTE" -p "$BASE_PORT" -U "$role" -d "$BASE_NOM" \
       -c 'select 1' >/dev/null 2>&1; then
    succes "$role"
  else
    echec "Le rôle « $role » ne se connecte pas à « $BASE_NOM » avec $cle.
      Vérifiez la valeur dans $FICHIER_CONFIG et l'authentification du cluster
      (pg_hba.conf : « scram-sha-256 » sur host 127.0.0.1), ou relancez avec
      --reinitialiser-mots-de-passe."
  fi
done

# =============================================================================
#  8. Migrations — appliquées par le PROPRIÉTAIRE, jamais par le compte du service
# =============================================================================

info "Migrations"
RACINE_MIGRATIONS="$RACINE/backend"
if [[ $SEULEMENT_BASE -eq 1 ]]; then RACINE_MIGRATIONS="$SOURCE"; fi

# Tout passe par l'environnement du seul processus fils : aucun secret en argument,
# aucun secret en sortie (migrate.mjs n'en affiche pas).
BASE_HOTE="$BASE_HOTE" \
BASE_PORT="$BASE_PORT" \
BASE_NOM="$BASE_NOM" \
BASE_UTILISATEUR="$ROLE_APP" \
BASE_UTILISATEUR_PROPRIETAIRE="$ROLE_PROPRIETAIRE" \
BASE_MOT_DE_PASSE_PROPRIETAIRE="$(lire_variable BASE_MOT_DE_PASSE_PROPRIETAIRE)" \
BASE_SSL="$(lire_variable BASE_SSL)" \
BASE_SSL_CA="$(lire_variable BASE_SSL_CA)" \
  node "$RACINE_MIGRATIONS/db/migrate.mjs"
succes "schéma à jour"

# =============================================================================
#  9. Contrôles de sécurité — on vérifie, on ne suppose pas
# =============================================================================
#
# Ces contrôles rejouent la partie « base de données » de la grille du
# docs/PLAN_EXECUTION.md §4 (S1 cloisonnement, S3 journal inaltérable). Ils échouent
# bruyamment : une installation qui n'est pas conforme ne doit pas se terminer par
# « Installation terminée ».

info "Contrôles de sécurité"

# S1 — aucun attribut dangereux sur les rôles non privilégiés.
ANOMALIES="$(sql_admin <<SQL
select rolname || ' → ' ||
       case when rolsuper     then 'SUPERUSER '  else '' end ||
       case when rolbypassrls then 'BYPASSRLS '  else '' end ||
       case when rolcreaterole then 'CREATEROLE ' else '' end ||
       case when rolcreatedb  then 'CREATEDB '   else '' end
  from pg_roles
 where rolname in ('$(litteral "$ROLE_APP")', '$(litteral "$ROLE_LECTURE")')
   and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb);
SQL
)"
[[ -z "$ANOMALIES" ]] || echec "Attributs interdits sur un rôle non privilégié :
      $ANOMALIES
      Le cloisonnement par RLS et la séparation des rôles seraient décoratifs.
      Corriger : alter role <rôle> nosuperuser nobypassrls nocreaterole nocreatedb;"
succes "ni $ROLE_APP ni $ROLE_LECTURE ne portent SUPERUSER, BYPASSRLS, CREATEROLE ou CREATEDB"

# Le propriétaire, lui, n'est pas censé être superutilisateur non plus : il n'a
# besoin que du DDL sur SA base. SUPERUSER est refusé — il annulerait tout, y
# compris la RLS. CREATEDB ne fait l'objet que d'un avertissement : c'est la marque
# d'un rôle réutilisé depuis un poste de développement, pas un trou de sécurité.
SUPER_PROPRIETAIRE="$(sql_admin <<SQL
select case when rolsuper then 'SUPERUSER ' else '' end ||
       case when rolbypassrls then 'BYPASSRLS ' else '' end
  from pg_roles where rolname = '$(litteral "$ROLE_PROPRIETAIRE")' and (rolsuper or rolbypassrls);
SQL
)"
[[ -z "${SUPER_PROPRIETAIRE// /}" ]] || echec \
  "Le rôle propriétaire « $ROLE_PROPRIETAIRE » porte $SUPER_PROPRIETAIRE :
      un propriétaire superutilisateur rend la RLS et le cloisonnement inopérants.
      Corriger : alter role $ROLE_PROPRIETAIRE nosuperuser nobypassrls;"
if [[ "$(sql_admin <<SQL
select rolcreatedb from pg_roles where rolname = '$(litteral "$ROLE_PROPRIETAIRE")';
SQL
)" == "t" ]]; then
  alerte "$ROLE_PROPRIETAIRE porte CREATEDB — inutile en production (la base est créée"
  alerte "une fois par ce script). Retirer : alter role $ROLE_PROPRIETAIRE nocreatedb;"
fi

# S1 — appartenance de rôle : être membre du propriétaire revient à l'être.
HERITAGE="$(sql_admin <<SQL
select 'membre de ' || r.rolname
  from pg_auth_members m
  join pg_roles r on r.oid = m.roleid
  join pg_roles a on a.oid = m.member
 where a.rolname in ('$(litteral "$ROLE_APP")', '$(litteral "$ROLE_LECTURE")')
   and r.rolname in ('$(litteral "$ROLE_PROPRIETAIRE")', 'pg_write_all_data', 'pg_execute_server_program');
SQL
)"
[[ -z "$HERITAGE" ]] || echec "Le rôle applicatif hérite de privilèges qu'il ne doit pas avoir :
      $HERITAGE
      Corriger : revoke <rôle> from $ROLE_APP;"
succes "aucun héritage de rôle privilégié"

# S1 / S3 — la base n'appartient pas au compte du service.
PROPRIETAIRE_FINAL="$(proprietaire_base)"
[[ "$PROPRIETAIRE_FINAL" == "$ROLE_PROPRIETAIRE" ]] || echec \
  "La base « $BASE_NOM » appartient à « $PROPRIETAIRE_FINAL » et non à « $ROLE_PROPRIETAIRE »."
[[ "$PROPRIETAIRE_FINAL" != "$ROLE_APP" ]] || echec \
  "La base appartient au compte du service : couche 4 de l'ajout seul inopérante."
succes "base « $BASE_NOM » : propriétaire $PROPRIETAIRE_FINAL (≠ compte du service)"

# S3 — le journal d'audit, une fois la table créée par les migrations.
JOURNAL="$(sql_admin_base <<SQL
select coalesce(
  (select case
     when pg_get_userbyid(c.relowner) = '$(litteral "$ROLE_APP")'
       then 'PROPRIETE: journal_audit appartient à $ROLE_APP'
     when has_table_privilege('$(litteral "$ROLE_APP")', 'journal_audit', 'UPDATE')
       then 'PRIVILEGE: $ROLE_APP porte UPDATE sur journal_audit'
     when has_table_privilege('$(litteral "$ROLE_APP")', 'journal_audit', 'DELETE')
       then 'PRIVILEGE: $ROLE_APP porte DELETE sur journal_audit'
     when has_table_privilege('$(litteral "$ROLE_APP")', 'journal_audit', 'TRUNCATE')
       then 'PRIVILEGE: $ROLE_APP porte TRUNCATE sur journal_audit'
     else ''
   end
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'journal_audit'),
  'ABSENTE');
SQL
)"
case "$JOURNAL" in
  ABSENTE) alerte "journal_audit absente : contrôle S3 sans objet (migrations partielles)." ;;
  "")      succes "journal_audit : propriété et privilèges conformes (§12, couches 1 et 4)" ;;
  *)       echec  "Journal d'audit non conforme — $JOURNAL
      L'ajout seul repose sur quatre couches cumulatives (db/CONVENTIONS.md §12) ;
      celle-ci manque. Le journal ne prouve plus rien en audit." ;;
esac

# S3 — couche 3 : les déclencheurs sont armés en mode « always » (tgenabled = 'A').
# Un déclencheur désactivé ne se voit pas : il faut aller le lire.
if [[ "$JOURNAL" != "ABSENTE" ]]; then
  DESARMES="$(sql_admin_base <<'SQL'
select string_agg(tgname || ' (' || tgenabled::text || ')', ', ')
  from pg_trigger
 where tgrelid = 'public.journal_audit'::regclass
   and not tgisinternal
   and tgenabled <> 'A';
SQL
)"
  [[ -z "$DESARMES" ]] || echec "Déclencheurs du journal d'audit désarmés : $DESARMES
      (état attendu : 'A', « enable always » — db/CONVENTIONS.md §12, couche 3.)
      Quelqu'un a exécuté « alter table journal_audit disable trigger ». Vérifiez le
      chaînage avant toute chose : select * from f_journal_audit_verifier();
      Réarmement : alter table journal_audit enable always trigger <nom>;"
  succes "déclencheurs du journal armés en mode « always » (§12, couche 3)"
fi

# S14 — le registre des migrations : « select » et RIEN D'AUTRE pour le compte du
# service (004_rls.sql §1, db/CONVENTIONS.md §13).
#
# Ce contrôle n'existait pas, et c'est précisément son absence qui a laissé passer un
# défaut : le chemin --reprendre-propriete reposait les privilèges applicatifs par un
# « grant … on all tables », rendait ainsi « update » sur migrations_schema, et le
# script se déclarait conforme. Rendre ce privilège à $ROLE_APP, c'est lui permettre
# de réécrire l'empreinte d'une migration déjà appliquée — donc de maquiller la
# réécriture d'une migration (db/migrate.mjs, code de sortie 4) — et d'inscrire une
# migration jamais jouée, que migrate.mjs annoncera « déjà appliquée » alors que le
# durcissement qu'elle porte n'existe nulle part.
#
# Un « grant » général qui écrase un « revoke » ciblé ne se voit pas : il faut aller
# le lire. Il y a exactement deux tables dans ce cas — journal_audit ci-dessus et
# migrations_schema ici. Toute migration future qui ferme une troisième table
# nommément doit ajouter son contrôle ici, faute de quoi elle se rouvrira en silence
# au premier --reprendre-propriete.
REGISTRE="$(sql_admin_base <<SQL
select coalesce(
  (select case
     when pg_get_userbyid(c.relowner) = '$(litteral "$ROLE_APP")'
       then 'PROPRIETE: migrations_schema appartient à $ROLE_APP'
     when has_table_privilege('$(litteral "$ROLE_APP")', 'migrations_schema', 'INSERT')
       then 'PRIVILEGE: $ROLE_APP porte INSERT sur migrations_schema'
     when has_table_privilege('$(litteral "$ROLE_APP")', 'migrations_schema', 'UPDATE')
       then 'PRIVILEGE: $ROLE_APP porte UPDATE sur migrations_schema'
     when has_table_privilege('$(litteral "$ROLE_APP")', 'migrations_schema', 'DELETE')
       then 'PRIVILEGE: $ROLE_APP porte DELETE sur migrations_schema'
     when has_table_privilege('$(litteral "$ROLE_APP")', 'migrations_schema', 'TRUNCATE')
       then 'PRIVILEGE: $ROLE_APP porte TRUNCATE sur migrations_schema'
     when not has_table_privilege('$(litteral "$ROLE_APP")', 'migrations_schema', 'SELECT')
       then 'LECTURE: $ROLE_APP ne peut pas lire migrations_schema'
     else ''
   end
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'migrations_schema'),
  'ABSENTE');
SQL
)"
case "$REGISTRE" in
  ABSENTE)  alerte "migrations_schema absente : contrôle du registre sans objet (migrations partielles)." ;;
  "")       succes "migrations_schema : $ROLE_APP n'y a que « select » (004_rls.sql §1)" ;;
  LECTURE:*) alerte "$REGISTRE
      Le serveur contrôle la version du schéma au démarrage : il lui faut « select ».
      Rétablir : grant select on migrations_schema to $ROLE_APP;" ;;
  *)        echec  "Registre des migrations non conforme — $REGISTRE
      Le compte du service peut réécrire l'empreinte d'une migration déjà appliquée :
      le garde-fou anti-réécriture de db/migrate.mjs (code de sortie 4) ne détecte
      plus rien, et une migration de durcissement peut être déclarée « déjà appliquée »
      sans avoir jamais été jouée.
      Rétablir : revoke insert, update, delete, truncate on migrations_schema from $ROLE_APP;
      Vérifier ensuite ce qui a été appliqué : node db/migrate.mjs --verifier" ;;
esac

if [[ $SEULEMENT_BASE -eq 1 ]]; then
  printf '\n\033[1;32mBase « %s » prête.\033[0m (--seulement-base : ni code, ni service, ni frontal)\n' "$BASE_NOM"
  exit 0
fi

# =============================================================================
#  10. Service et frontal
# =============================================================================

info "Service et frontal"
install -m 0644 "$SOURCE/deploy/systemd/cyber-grc.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable cyber-grc
systemctl restart cyber-grc

if [[ ! -f /etc/apache2/sites-available/cyber-grc.conf ]]; then
  install -m 0644 "$SOURCE/deploy/apache/cyber-grc.conf" /etc/apache2/sites-available/
  alerte "Vhost installé : ajustez ServerName et les chemins de certificat,"
  alerte "puis : a2ensite cyber-grc && systemctl reload apache2"
else
  alerte "Vhost déjà présent — non écrasé (personnalisations préservées)."
fi

# LimitRequestBody du vhost et SERVEUR_TAILLE_MAX_CORPS doivent rester cohérents,
# sinon un envoi légitime est refusé par Apache avant même d'atteindre l'application
# (ou l'inverse : Apache laisse passer un corps que l'application ne borne plus).
TAILLE_APP="$(lire_variable SERVEUR_TAILLE_MAX_CORPS)"; TAILLE_APP="${TAILLE_APP:-26214400}"
TAILLE_APACHE="$(sed -n 's/^[[:space:]]*LimitRequestBody[[:space:]]\{1,\}\([0-9]\{1,\}\).*/\1/p' \
                 /etc/apache2/sites-available/cyber-grc.conf 2>/dev/null | tail -n1 || true)"
if [[ -z "$TAILLE_APACHE" ]]; then
  alerte "Le vhost ne pose aucun LimitRequestBody : ajoutez-en un (S13, dénis de service)."
elif [[ "$TAILLE_APACHE" -lt "$TAILLE_APP" ]]; then
  alerte "LimitRequestBody ($TAILLE_APACHE) < SERVEUR_TAILLE_MAX_CORPS ($TAILLE_APP) :"
  alerte "Apache refusera des envois que l'application accepte. Alignez les deux valeurs."
else
  succes "LimitRequestBody ($TAILLE_APACHE) ≥ SERVEUR_TAILLE_MAX_CORPS ($TAILLE_APP)"
fi

# TimeoutStopSec doit laisser au serveur le temps de drainer ses connexions.
DELAI_ARRET="$(lire_variable SERVEUR_DELAI_ARRET)"; DELAI_ARRET="${DELAI_ARRET:-25000}"
DELAI_SYSTEMD="$(systemctl show -p TimeoutStopUSec --value cyber-grc 2>/dev/null || true)"
succes "arrêt propre : SERVEUR_DELAI_ARRET=${DELAI_ARRET} ms, TimeoutStopSec=${DELAI_SYSTEMD:-?}"

# =============================================================================
#  11. Vérification finale
# =============================================================================

info "Vérification"
PORT="$(lire_variable SERVEUR_PORT)"; PORT="${PORT:-3001}"
for tentative in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:${PORT}/api/sante" >/dev/null 2>&1; then
    succes "le service répond sur 127.0.0.1:${PORT}"
    break
  fi
  [[ $tentative -eq 5 ]] && echec "le service ne répond pas — voir : journalctl -u cyber-grc -n 50"
  sleep 2
done

printf '\n\033[1;32mInstallation terminée.\033[0m\n'
printf 'Configuration : %s  (root:%s 0640)\n' "$FICHIER_CONFIG" "$UTILISATEUR"
printf 'Journaux      : journalctl -u cyber-grc -f\n'
printf 'Exploitation  : %s/backend/README.md\n' "$RACINE"
