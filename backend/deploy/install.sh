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

# =============================================================================
#  MARQUEURS D'EXTRACTION POUR LE BANC D'ESSAI
#
#  Ce script n'est joué par aucun essai du dépôt : il exige root, systemd,
#  rsync, Apache et PostgreSQL. Ses CONTRÔLES, eux, sont de la logique pure sur
#  une arborescence et deux fichiers texte — donc jouables hors installation.
#  Les blocs concernés sont délimités pour que le banc les extraie EXACTEMENT :
#
#      awk '/^# >>> banc: <nom> <<<$/,/^# <<< banc: <nom> >>>$/' deploy/install.sh
#
#  Une extraction par motif deviné irait chercher le mauvais bloc dès la
#  première reformulation du fichier, et l'essai passerait au vert en
#  n'éprouvant rien. Le banc doit donc REFUSER un bloc vide ou privé de son
#  ancre — c'est la condition sans laquelle ces marqueurs sont une décoration.
#
#  Blocs : « frontend » (liste blanche de publication, constat Q-31),
#          « proxytimeout » (dérive du délai, constat Q-19),
#          « configtest » (Apache comprend-il sa configuration).
# =============================================================================

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
#  Outils : jeton de version du frontend (invalidation du cache navigateur)
# =============================================================================
#
# LE PROBLÈME QUE CECI RÉSOUT, ET QUI A FAILLI COÛTER TRÈS CHER.
#
# `frontend/index.html` charge 59 scripts et 2 feuilles de style par des URL SANS
# jeton de version, et le vhost pose « ExpiresByType application/javascript "access
# plus 7 days" ». Conséquence : un correctif poussé sur la VM n'atteint PAS les
# navigateurs avant sept jours. Sur vingt filiales derrière un VPN, cela veut dire une
# semaine de données fausses pendant que l'exploitant constate que « le correctif ne
# marche pas ». Relevé à trois passages de la porte S2.
#
# POURQUOI UN JETON PLUTÔT QUE SUPPRIMER LE CACHE. Sans cache, ce sont 61 requêtes
# conditionnelles à chaque chargement, sur un VPN international — et le PLAN_SERVEUR
# §1.3 fait précisément du chargement initial un point de conception. Le jeton garde le
# cache long ET rend le correctif immédiat : l'URL change, le navigateur retélécharge.
#
# POURQUOI PAS SEULEMENT « APPLICATION_VERSION ». Parce qu'un correctif livré sans
# incrément de version — le cas exact du correctif d'urgence — laisserait le jeton
# inchangé, donc le cache actif, donc le défaut entier reconstitué. Le jeton est donc
# « <version>.<empreinte du contenu réellement déployé> » :
#
#   il CHANGE  dès qu'un octet d'un .js ou d'un .css change, version bumpée ou non ;
#   il NE CHANGE PAS quand rien n'a changé — sinon on remplacerait un cache inefficace
#              par un cache inutile, et les 61 requêtes reviendraient à chaque
#              réinstallation.
#
# La partie « version » ne sert donc pas à l'invalidation : elle sert à l'exploitant et
# à l'auditeur, qui lisent le numéro livré directement dans le source de la page.
#
# AUCUN EMPAQUETEUR, AUCUNE RÉÉCRITURE DE CODE. Les fichiers .js et .css sont déployés
# à l'octet près, lisibles et diffables contre le dépôt ; seul `index.html` est réécrit,
# et seulement dans ses attributs d'URL. Un « diff -r » entre le dépôt et l'arborescence
# servie ne montre que ce fichier. C'est ce que le cadrage demande pour l'audit.
#
# Fonctionne en mode hors ligne (CYBER_GRC_HORS_LIGNE=1) : ni réseau, ni npm, ni node —
# seulement find, sha256sum et sed.

# Empreinte du frontend RÉELLEMENT déployé. LC_ALL=C et « sort » figent l'ordre : deux
# installations du même contenu doivent rendre le même jeton, sur n'importe quelle
# machine. Les noms de fichiers entrent dans l'empreinte (sha256sum les imprime) : un
# simple renommage change donc le jeton, ce qui est le comportement voulu.
jeton_frontend() {
  local racine="$1" version="$2" empreinte
  empreinte="$(cd "$racine" && LC_ALL=C find js css -type f \( -name '*.js' -o -name '*.css' \) -print0 \
                 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -c1-12)"
  [[ -n "$empreinte" ]] || echec "Empreinte du frontend vide : $racine ne contient ni js/ ni css/ ?"
  printf '%s.%s' "${version:-0}" "$empreinte"
}

# Injection dans l'index.html DÉPLOYÉ (jamais dans celui du dépôt : servi en local par
# « python3 -m http.server », il doit rester sans jeton).
#
# Seules les URL se terminant par .js ou .css sont touchées, et seulement si elles ne
# portent pas déjà de « ? ». Les liens de navigation (« href="#/dashboard" ») et les
# images ne correspondent pas au motif.
#
# Le contrôle qui suit l'injection n'est pas décoratif : une injection partielle — un
# script ajouté avec des apostrophes au lieu de guillemets, par exemple — rendrait
# quelques fichiers non versionnés et donc figés sept jours, sans que rien ne le dise.
# C'est exactement la forme de défaut que ce correctif ferme ; on ne la réintroduit pas
# par la porte de derrière.
injecter_jeton_frontend() {
  local page="$1" jeton="$2" avant apres restants

  [[ -f "$page" ]] || echec "Frontend déployé sans index.html : $page est absent."

  # Le motif de DÉTECTION ignore volontairement la façon dont l'URL est entourée —
  # guillemets doubles, apostrophes, ou rien : une URL « .js » suivie d'un guillemet,
  # d'une apostrophe, d'une espace ou de « > » est une URL SANS jeton, quelle que soit
  # l'écriture. Le motif d'INJECTION, lui, ne traite que les guillemets doubles, qui sont
  # la convention de la page. L'écart entre les deux est délibéré : une balise écrite
  # autrement n'est pas silencieusement tolérée, elle fait échouer l'installation avec un
  # message qui dit quoi corriger. Une première rédaction comptait les deux fois en
  # guillemets doubles : un script ajouté avec des apostrophes n'était PAS versionné et le
  # contrôle ne voyait rien — le défaut même que ce correctif ferme, reconstitué dans son
  # garde-fou.
  #
  # « || true » : sous « set -e » et « pipefail », un grep sans correspondance rend 1 et
  # tuerait le script — y compris sur le chemin de SUCCÈS, où « restants » doit justement
  # ne rien trouver. Un contrôle qui échoue quand tout va bien est aussi faux qu'un
  # contrôle qui n'échoue jamais.
  local sans_jeton='(src|href)=["'"'"']?[^"'"'"'>[:space:]]*\.(js|css)["'"'"'[:space:]>]'
  local avec_jeton='(src|href)=["'"'"']?[^"'"'"'>[:space:]]*\.(js|css)\?v='

  avant="$( { grep -oE "$sans_jeton" "$page" || true; } | wc -l)"
  [[ "$avant" -gt 0 ]] || echec "Aucune URL .js/.css dans $page : le motif d'injection ne
      correspond plus à la façon dont la page déclare ses scripts. Ne PAS ignorer :
      sans jeton, un correctif reste invisible sept jours (cache du vhost)."

  # Délimiteur « @ » et non « | » : le motif contient lui-même des alternatives (src|href,
  # js|css), et un « | » délimiteur les couperait en silence.
  sed -i -E "s@(src|href)=\"([^\"?]+\\.(js|css))\"@\\1=\"\\2?v=${jeton}\"@g" "$page"

  apres="$( { grep -oE "$avec_jeton" "$page" || true; } | wc -l)"
  restants="$( { grep -oE "$sans_jeton" "$page" || true; } | wc -l)"

  [[ "$restants" -eq 0 && "$apres" -eq "$avant" ]] || echec \
    "Injection du jeton de version incomplète dans $page :
      $avant URL .js/.css attendues, $apres versionnées, $restants laissées sans jeton.
      Les fichiers non versionnés resteraient sept jours dans le cache des navigateurs
      (deploy/apache/cyber-grc.conf, ExpiresByType). Corrigez le motif d'injection ou la
      façon dont index.html déclare ses scripts (guillemets doubles, pas de « ? »)."

  printf '%s' "$avant"
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

# Version du paquet, lue UNE fois. Elle sert à deux endroits : le jeton de cache du
# frontend (§4, calculé avant que le fichier de configuration n'existe forcément) et
# APPLICATION_VERSION (§5, affichée par /api/sante et tracée au journal). Sans « node »
# — cas qui ne devrait pas se produire ici — la version reste vide : le jeton retombe
# sur « 0.<empreinte> », qui invalide toujours correctement le cache.
VERSION_PAQUET=""
if [[ -f "$SOURCE/package.json" ]]; then
  VERSION_PAQUET="$(node -p "require('$SOURCE/package.json').version" 2>/dev/null || echo '')"
fi

if [[ $SEULEMENT_BASE -eq 0 ]]; then
  info "Déploiement du code"
  # `db/dev` et `test` ne servent qu'au développement : `db/dev/preparer_base_dev.sh`
  # pose un mot de passe connu (« dev ») et n'a rien à faire sur une machine de
  # production, même s'il refuse d'y tourner.
  rsync -a --delete \
        --exclude node_modules --exclude .env --exclude 'var/' \
        --exclude 'db/dev/' --exclude 'test/' \
        "$SOURCE/" "$RACINE/backend/"
  # >>> banc: frontend <<<
  # ══ LE FRONTEND — LISTE BLANCHE, ET UN REFUS AVANT LA COPIE (Q-31) ═══
  #
  # Cette ligne était `rsync -a --delete "$DEPOT/cyber-gouvernance_V4/" …`, sans
  # aucune exclusion, alors que le rsync du serveur juste au-dessus en portait
  # cinq. Le répertoire versionné contenait quatre classeurs de données RÉELLES
  # — registre de risques, plan de continuité, exigences client, et un fichier
  # de verrou Excel nommant une personne. `DocumentRoot` + `Require all granted`
  # les rendaient téléchargeables **sans aucune authentification**, par une URL
  # devinable, dans un produit dont la promesse centrale est le cloisonnement
  # par filiale. Sixième passage de la porte S2, constat Q-31.
  #
  # ── Pourquoi une liste blanche, et pas `--exclude 'data/'` ────────────
  #
  # Parce que le répertoire n'est pas ce qui distingue un fichier servable d'un
  # fichier qui ne l'est pas : sa NATURE l'est. Un classeur déposé à la racine,
  # ou dans `assets/`, ou dans `js/`, serait passé sous une exclusion par
  # répertoire — et la prochaine personne qui dépose un fichier pour essayer
  # quelque chose ne relira pas cette ligne.
  #
  # ── D'où vient la liste, pour qu'elle ne soit pas arbitraire ──────────
  #
  # C'est **exactement ce que la politique de sécurité de contenu de la page
  # autorise à charger depuis 'self'** (voir `deploy/apache/cyber-grc.conf`) :
  # script-src (js), style-src (css), img-src (svg png ico jpg jpeg gif webp),
  # font-src (woff woff2), manifest-src (webmanifest), plus le document
  # lui-même (html). Un fichier d'un autre type ne peut être chargé par aucune
  # directive : il n'a donc rien à faire dans une racine web, quel que soit le
  # motif qui l'y a amené. `media-src` et `object-src` valent 'none' — pas
  # d'audio, pas de vidéo, pas de PDF embarqué : la liste ne les porte pas.
  #
  # Les deux listes — celle-ci et le <FilesMatch> du vhost — disent la même
  # chose et doivent le rester ; le contrôle du §10 compare les deux fichiers.
  FRONTEND_PUBLIABLE=(html js css svg png ico jpg jpeg gif webp woff woff2 webmanifest)

  # Toléré dans le dépôt, JAMAIS copié : la documentation d'un répertoire vit à
  # côté de lui — `cyber-gouvernance_V4/data/LISEZ-MOI.md` dit pourquoi ce
  # répertoire doit rester vide, et cette phrase perdrait tout son sens si elle
  # devait être rangée ailleurs. Les fichiers cachés (`.gitignore`…) relèvent de
  # la même tolérance : plomberie de dépôt, jamais du produit livré.
  # TOUT LE RESTE ARRÊTE L'INSTALLATION — voir juste en dessous.
  FRONTEND_TOLERE=(md)

  # ── Les deux barrières vont par paire, et cela se VÉRIFIE ─────────────
  # La ligne ci-dessus et le <FilesMatch> inversé du vhost disent la même chose
  # à deux endroits. Deux listes qui doivent rester égales finissent par
  # diverger — le chantier l'a payé assez souvent —, et la divergence serait
  # silencieuse : un type ajouté ici seulement serait copié puis refusé par
  # Apache (page cassée), ajouté là seulement il serait servable mais jamais
  # copié (personne ne le remarque).
  #
  # ⚠️ La liste est extraite du MOTIF <FilesMatch> lui-même — de ce qui refuse
  # réellement —, jamais d'un commentaire qui l'accompagnerait. Un commentaire
  # est une déclaration : il peut cesser d'être vrai sans que rien ne bouge, et
  # ce chantier vient d'en payer un (le ProxyTimeout de Q-19 affirmait le
  # contraire de ce qui se passait). Ici les deux valeurs comparées sortent des
  # deux fichiers versionnés, et aucune n'est recopiée dans un troisième.
  VHOST_REF="$SOURCE/deploy/apache/cyber-grc.conf"
  LISTE_VHOST="$(awk -F'\\\\.\\(' '/<FilesMatch "\(\?i\)/ { split($2, a, ")"); gsub(/\|/, " ", a[1]); print a[1] }' \
                 "$VHOST_REF" 2>/dev/null | tail -n1 || true)"
  LISTE_ICI="${FRONTEND_PUBLIABLE[*]}"
  if [[ -z "$LISTE_VHOST" ]]; then
    alerte "le vhost de référence ne porte plus de <FilesMatch> en liste blanche : la paire"
    alerte "de barrières n'est plus vérifiable, et le frontal ne refuse plus par défaut."
    alerte "Voir deploy/apache/cyber-grc.conf, et le constat Q-31."
  elif [[ "$LISTE_VHOST" != "$LISTE_ICI" ]]; then
    alerte "install.sh : $LISTE_ICI"
    alerte "vhost      : $LISTE_VHOST"
    echec "les deux listes blanches du frontend ont divergé (constat Q-31). Ce qui est copié
      et ce qui est servi ne coïncident plus : un type présent d'un seul côté est soit copié
      puis refusé par Apache — page cassée —, soit servable mais jamais livré. Alignez
      FRONTEND_PUBLIABLE et le <FilesMatch> de deploy/apache/cyber-grc.conf."
  else
    succes "listes blanches du frontend alignées ($LISTE_ICI)"
  fi

  # ── UNE seule règle, DEUX lectures ────────────────────────────────────
  # `frontend_intrus <racine> <tolerer>` liste les fichiers qui n'ont pas leur
  # place là où elle regarde. Elle sert avant la copie (sur le dépôt) et après
  # (sur ce qui a réellement atterri) : deux exemplaires de cette règle auraient
  # fini par ne plus dire la même chose, en silence.
  #
  # ⚠️ `tolerer` vaut « oui » pour le DÉPÔT et « non » pour la RACINE WEB, et la
  # nuance n'est pas cosmétique : un `.md` a sa place à côté du répertoire qu'il
  # explique, il n'en a aucune dans ce qu'Apache sert. Confondre les deux — ce
  # que faisait la première rédaction — laissait la seconde lecture accepter
  # dans la racine web ce que la première ne faisait que tolérer dans le dépôt.
  frontend_intrus() {
    local racine="$1" tolerer="$2" base ext e connu admis
    while IFS= read -r -d '' fichier; do
      base="${fichier##*/}"
      # Fichiers cachés : plomberie de dépôt (.gitignore…), jamais du produit
      # livré, et le vhost les refuse déjà par son motif « ^\. ».
      if [[ "$base" == .* ]]; then continue; fi
      ext="${base##*.}"
      if [[ "$ext" == "$base" ]]; then ext=''; fi     # aucun point : sans extension
      admis=("${FRONTEND_PUBLIABLE[@]}")
      if [[ "$tolerer" == oui ]]; then admis+=("${FRONTEND_TOLERE[@]}"); fi
      connu=0
      for e in "${admis[@]}"; do
        if [[ "${ext,,}" == "$e" ]]; then connu=1; break; fi
      done
      if [[ $connu -eq 0 ]]; then printf '%s\n' "${fichier#"$racine"/}"; fi
    done < <(find "$racine" -type f -print0)
  }

  # ── 1. Le refus PRÉCÈDE la copie ──────────────────────────────────────
  # Une exclusion silencieuse ne se relit pas ; une installation qui s'arrête en
  # nommant le fichier se lit forcément. Même forme que le contrôle de dérive de
  # ProxyTimeout au §10 : c'est le CONTENU qui décide, pas le code de sortie
  # d'une commande.
  FRONTEND_INTRUS="$(frontend_intrus "$DEPOT/cyber-gouvernance_V4" oui || true)"
  if [[ -n "$FRONTEND_INTRUS" ]]; then
    while IFS= read -r intrus; do alerte "fichier non publiable : $intrus"; done <<< "$FRONTEND_INTRUS"
    echec "les fichiers ci-dessus n'ont rien à faire dans une racine web servie sans
      authentification (constat Q-31 : quatre classeurs de données réelles y ont séjourné —
      registre de risques, plan de continuité, exigences client, verrou Excel nommant une
      personne). L'installation s'arrête AVANT de copier quoi que ce soit.
      Retirez-les de cyber-gouvernance_V4/ : les jeux d'essai vivent hors du dépôt.
      Si le type est légitimement servable, ajoutez-le à FRONTEND_PUBLIABLE ICI *et* au
      <FilesMatch> de deploy/apache/cyber-grc.conf — les deux barrières vont par paire."
  fi

  # ── 2. La copie, restreinte à la liste blanche ────────────────────────
  # `--include '*/'` fait descendre rsync dans les répertoires ; `-m` élague
  # ensuite ceux qui se retrouvent vides, si bien qu'un répertoire dont rien
  # n'est publiable (`data/`) n'apparaît même pas dans la racine web.
  # `--delete` efface ce qu'une installation précédente y aurait laissé.
  FRONTEND_REGLES=(--include '*/')
  for e in "${FRONTEND_PUBLIABLE[@]}"; do FRONTEND_REGLES+=(--include "*.$e"); done
  FRONTEND_REGLES+=(--exclude '*')
  rsync -a -m --delete "${FRONTEND_REGLES[@]}" \
        "$DEPOT/cyber-gouvernance_V4/" "$RACINE/frontend/"

  # ── 3. Ce qui a RÉELLEMENT atterri ────────────────────────────────────
  # Les règles de filtre de rsync sont subtiles et n'ont pas pu être éprouvées
  # sur la machine de développement (rsync n'y est pas installé). On ne fait
  # donc pas confiance à la commande : on relit la racine web. Le contrôle
  # regarde dans les DEUX sens — un intrus publié arrête l'installation, et un
  # fichier légitime manquant aussi, parce qu'une liste blanche trop serrée
  # livrerait une application muette dont personne ne comprendrait la panne.
  PUBLIES_INTRUS="$(frontend_intrus "$RACINE/frontend" non || true)"
  if [[ -n "$PUBLIES_INTRUS" ]]; then
    while IFS= read -r intrus; do alerte "PUBLIÉ à tort : $intrus"; done <<< "$PUBLIES_INTRUS"
    echec "la racine web contient les fichiers ci-dessus, que la liste blanche aurait dû
      écarter (constat Q-31). Ils sont servis SANS authentification : retirez-les de
      $RACINE/frontend/ avant d'ouvrir le service, et corrigez FRONTEND_REGLES."
  fi
  ATTENDUS="$(find "$DEPOT/cyber-gouvernance_V4" -type f | grep -cEi "\.($(IFS='|'; echo "${FRONTEND_PUBLIABLE[*]}"))$" || true)"
  OBTENUS="$(find "$RACINE/frontend" -type f | wc -l)"
  if [[ "$ATTENDUS" -ne "$OBTENUS" ]]; then
    if [[ "$OBTENUS" -lt "$ATTENDUS" ]]; then
      echec "frontend : $ATTENDUS fichier(s) publiables dans le dépôt, $OBTENUS seulement dans
        la racine web. FRONTEND_REGLES écarte quelque chose qu'elle devrait publier :
        l'application serait livrée incomplète, et le défaut ne se verrait qu'à l'usage."
    fi
    echec "frontend : $ATTENDUS fichier(s) publiables dans le dépôt, $OBTENUS dans la racine
      web. Il y a donc là des fichiers que la copie n'a pas apportés — reliquat d'une
      installation précédente que « --delete » n'a pas emporté, ou dépôt manuel. Ils sont
      servis SANS authentification (constat Q-31) : videz $RACINE/frontend/ et recommencez."
  fi
  succes "frontend : $OBTENUS fichier(s) publiés, aucun fichier non publiable"
  # <<< banc: frontend >>>

  # Jeton de cache : sans lui, les 61 fichiers .js/.css de la page restent SEPT JOURS
  # dans le cache des navigateurs (vhost, ExpiresByType) et aucun correctif n'atteint
  # un poste avant une semaine. Voir le commentaire de « jeton_frontend » plus haut.
  # L'index.html du DÉPÔT n'est pas touché : il reste servable tel quel en local.
  JETON_FRONTEND="$(jeton_frontend "$RACINE/frontend" "$VERSION_PAQUET")"
  NB_VERSIONNES="$(injecter_jeton_frontend "$RACINE/frontend/index.html" "$JETON_FRONTEND")"
  succes "frontend versionné : $NB_VERSIONNES URL portent « ?v=$JETON_FRONTEND »"

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

# Version affichée par /api/sante et tracée au journal d'audit (§0.3). Lue plus haut,
# avant le déploiement du frontend, parce que le jeton de cache s'en sert aussi.
if [[ -n "$VERSION_PAQUET" ]]; then definir_variable APPLICATION_VERSION "$VERSION_PAQUET"; fi

BASE_HOTE="$(lire_variable BASE_HOTE)";  BASE_HOTE="${BASE_HOTE:-127.0.0.1}"
BASE_PORT="$(lire_variable BASE_PORT)";  BASE_PORT="${BASE_PORT:-5432}"
BASE_NOM="$(lire_variable BASE_NOM)";    BASE_NOM="${BASE_NOM:-cyber_grc}"

ROLE_APP="$(lire_variable BASE_UTILISATEUR)";                    ROLE_APP="${ROLE_APP:-grc_app}"
ROLE_PROPRIETAIRE="$(lire_variable BASE_UTILISATEUR_PROPRIETAIRE)"
ROLE_PROPRIETAIRE="${ROLE_PROPRIETAIRE:-grc_proprietaire}"
# Le défaut du §14 des CONVENTIONS sert de filet si la clé manque au fichier de
# configuration (installations antérieures à son ajout à .env.example).
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

# Marche à suivre manuelle, imprimée partout où la reprise automatique ne s'applique
# pas. Elle vit à UN SEUL endroit, et c'est délibéré : la version imprimée était une
# recopie de la version automatique, les deux ont divergé, et le « revoke » sur
# migrations_schema a disparu de la copie sans que personne ne le voie. Deux recettes
# finissent toujours par ne plus dire la même chose ; il n'y en a plus qu'une.
#
#   $1  propriétaire actuel de la base
#   $2  « reassign » (version courte) ou « objet » (sans « reassign owned », quand ce
#       propriétaire possède d'autres bases du cluster — voir le garde-fou plus bas)
imprimer_reparation_manuelle() {
  local actuel="$1" mode="${2:-reassign}"
  alerte "     alter database $BASE_NOM owner to $ROLE_PROPRIETAIRE;"
  alerte "     \\c $BASE_NOM"
  if [[ "$mode" == "objet" ]]; then
    alerte "     -- objet par objet, SANS « reassign owned » :"
    alerte "     do \$\$ declare r record; begin"
    alerte "       for r in select c.oid::regclass::text n, c.relkind k from pg_class c"
    alerte "                  join pg_namespace s on s.oid = c.relnamespace"
    alerte "                 where s.nspname = 'public' and c.relkind in ('r','p','v','m','S')"
    alerte "                   and pg_get_userbyid(c.relowner) = '$actuel'"
    alerte "       loop execute format('alter %s %s owner to $ROLE_PROPRIETAIRE',"
    alerte "              case r.k when 'S' then 'sequence' when 'v' then 'view'"
    alerte "                       when 'm' then 'materialized view' else 'table' end, r.n);"
    alerte "       end loop; end \$\$;"
  else
    alerte "     reassign owned by $actuel to $ROLE_PROPRIETAIRE;"
  fi
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
  alerte "  Relancez ensuite « bash install.sh --seulement-base » : les contrôles de"
  alerte "  sécurité diront si la réparation est complète."
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
    if [[ -n "$AUTRES_BASES" ]]; then
      alerte "« $PROPRIETAIRE_ACTUEL » possède d'autres bases sur ce cluster : $AUTRES_BASES"
      alerte "La reprise emploie « reassign owned », qui déplace aussi les objets partagés :"
      alerte "ces bases changeraient de propriétaire elles aussi, sans que rien ne le demande."
      alerte ""
      alerte "  Reprenez la propriété à la main, en superutilisateur PostgreSQL :"
      imprimer_reparation_manuelle "$PROPRIETAIRE_ACTUEL" objet
      echec "Reprise automatique refusée : elle emporterait d'autres bases du cluster."
    fi

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
    declencheur   text;
    role_lecteur  text;
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

    -- Le secret du compte d'administration de secours. Le « grant … on all tables »
    -- ci-dessus rouvre en lecture TOUTES les colonnes, celle-ci comprise, alors que
    -- 004_rls.sql l'avait fermée : quatre passages de la porte S1 ont raisonné en
    -- lignes, et le secret était lisible de toute session de filiale (Q5-3).
    --
    -- La liste des colonnes rendues est CONSTRUITE PAR LE CATALOGUE, jamais recopiée :
    -- une colonne ajoutée demain est lisible sans que personne ait à y penser, et le
    -- secret reste fermé. C'est la troisième fois sur ce chantier qu'une liste écrite
    -- à la main produit un défaut ; on ne la réintroduit pas ici (CONVENTIONS §19.5).
    if to_regclass('public.utilisateurs') is not null then
        for role_lecteur in select unnest(array['$ROLE_APP', '$ROLE_LECTURE']) loop
            execute format('revoke select on utilisateurs from %I', role_lecteur);
            execute format(
                'grant select (%s) on utilisateurs to %I',
                (select string_agg(quote_ident(attname), ', ' order by attnum)
                   from pg_attribute
                  where attrelid = 'public.utilisateurs'::regclass
                    and attnum > 0 and not attisdropped
                    and attname <> 'mot_de_passe_hash'),
                role_lecteur);
        end loop;
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
    imprimer_reparation_manuelle "$PROPRIETAIRE_ACTUEL"
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
#
# Le code de sortie est RECUEILLI plutôt que laissé à « set -e » : celui-ci abandonnerait
# sur la ligne de commande brute, et l'exploitant lirait un piège à la place d'un
# diagnostic. Les codes sont ceux de db/migrate.mjs (--aide en donne la liste).
CODE_MIGRATIONS=0
BASE_HOTE="$BASE_HOTE" \
BASE_PORT="$BASE_PORT" \
BASE_NOM="$BASE_NOM" \
BASE_UTILISATEUR="$ROLE_APP" \
BASE_UTILISATEUR_PROPRIETAIRE="$ROLE_PROPRIETAIRE" \
BASE_MOT_DE_PASSE_PROPRIETAIRE="$(lire_variable BASE_MOT_DE_PASSE_PROPRIETAIRE)" \
BASE_SSL="$(lire_variable BASE_SSL)" \
BASE_SSL_CA="$(lire_variable BASE_SSL_CA)" \
  node "$RACINE_MIGRATIONS/db/migrate.mjs" || CODE_MIGRATIONS=$?

case "$CODE_MIGRATIONS" in
  0) succes "schéma à jour" ;;
  4) echec "Une migration déjà appliquée a été modifiée depuis (db/migrate.mjs, code 4).
      La base n'a pas été touchée. Restaurez le fichier d'origine, ou écrivez une
      migration qui corrige : une migration appliquée ne se réécrit jamais
      (db/CONVENTIONS.md §13)." ;;
  7) echec "Les migrations sont passées, et le SCHÉMA OBTENU N'EST PAS CONFORME
      (db/migrate.mjs, code 7). Les anomalies sont nommées juste au-dessus, chacune
      préfixée du contrôle qui l'a remontée : elles viennent des garde-fous que la base
      porte elle-même, agrégés par f_verifier_schema() (db/CONVENTIONS.md §18.4 et §19.4).
      Tant qu'elles subsistent, ni le cloisonnement par filiale ni la traçabilité des
      écritures ne sont garantis.
      L'installation s'arrête ici : ni service, ni frontal ne sont mis en place sur un
      schéma dont les garanties opposables ne tiennent pas." ;;
  6) echec "Une migration a échoué (db/migrate.mjs, code 6). Le message ci-dessus dit si
      la base a été modifiée ou si elle est restée dans son état antérieur." ;;
  *) echec "Les migrations se sont arrêtées avec le code $CODE_MIGRATIONS
      (voir « node db/migrate.mjs --aide » pour la signification des codes)." ;;
esac

# =============================================================================
#  9. Contrôles de sécurité — on vérifie, on ne suppose pas
# =============================================================================
#
# Ces contrôles rejouent la partie « base de données » de la grille du
# docs/PLAN_EXECUTION.md §4 : S1 cloisonnement, S3 journal inaltérable, S14 registre des
# migrations, S16 garde-fous du schéma. Ils échouent bruyamment : une installation qui
# n'est pas conforme ne doit pas se terminer par « Installation terminée ».
#
# La phrase ci-dessus était fausse pour S1 : la section ne regardait ni la RLS ni les
# politiques, alors qu'elles sont le seul objet de ce contrôle. Elle est vraie depuis que
# le point d'appel unique des garde-fous de la base est joué plus bas (S16). Une section
# de contrôles qui annonce plus qu'elle ne fait est pire que pas de section du tout :
# elle rassure.

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

# S16 — LE SCHÉMA LUI-MÊME. UN SEUL appel, et c'est tout l'objet de ce qui suit.
#
# Cette section s'intitule « on vérifie, on ne suppose pas » et annonce rejouer « S1
# cloisonnement ». Elle ne regardait pourtant ni la RLS, ni les politiques, ni la
# traçabilité : rôles, propriété, journal, registre. Une base dont on avait retiré
# « force row level security » et remplacé une politique de lecture par « true » passait
# les contrôles au vert, et une session de la filiale de Hambourg lisait les risques de
# Toulouse.
#
# Les migrations ne rattrapent pas : sur une base à jour elles ne sont pas rejouées, et
# leur garde-fou de fin ne s'exécute jamais. C'est le cas de CHAQUE ré-exécution de ce
# script, et notamment du chemin --reprendre-propriete — qui existe justement parce que
# le compte du service a été propriétaire, donc parce qu'il a pu faire
# « alter table … disable row level security » ou « drop trigger … » aussi bien que
# désarmer un déclencheur du journal.
#
# POURQUOI UN SEUL NOM DE FONCTION ICI. La première version de ce contrôle énumérait les
# deux fonctions de vérification connues. Le commit suivant en a écrit une troisième
# (traçabilité) sans toucher à ce fichier : le défaut que S16 venait d'être créé pour
# empêcher s'est reproduit sous lui, en deux commits. « f_verifier_schema() » est le point
# d'appel unique et agrégeant ; en l'appelant ELLE, un garde-fou ajouté plus tard arrive
# ici sans que personne ait à s'en souvenir (db/CONVENTIONS.md §19.4). On supprime
# l'occasion de l'oubli plutôt que de compter sur la vigilance.
#
# ⚠️ Ne JAMAIS réintroduire ici une liste de contrôles connus : la colonne « controle »
# du résultat les nomme d'elle-même, y compris ceux qui n'existaient pas quand ces lignes
# ont été écrites.
#
# Appeler une fonction de la base n'est pas une dépendance vers un fichier de db/ : c'est
# une requête. Un garde-fou que rien n'appelle est un commentaire (CONVENTIONS §18.4).
GARDE_FOU_SCHEMA="f_verifier_schema"

if [[ "$(sql_admin_base <<SQL
select case when to_regprocedure('public.$GARDE_FOU_SCHEMA()') is null
            then 'ABSENTE' else 'PRESENTE' end;
SQL
)" == "ABSENTE" ]]; then
  # Une base antérieure au point d'appel n'a rien à répondre : on avertit, on n'échoue
  # pas. Refuser ici empêcherait de migrer les bases que ce contrôle est censé protéger.
  alerte "$GARDE_FOU_SCHEMA() absente : les contrôles automatiques du schéma n'ont pas pu"
  alerte "être joués. Cette fonction est posée par db/migrations/001_socle.sql — la base est"
  alerte "antérieure à ce point d'appel (db/CONVENTIONS.md §18.4 et §19.4)."
else
  # Un schéma sain ne renvoie AUCUNE ligne (même idiome que f_journal_audit_verifier).
  # « set -e » ne protège pas d'une substitution de commande : si la fonction échoue,
  # ANOMALIES_SCHEMA serait vide et le contrôle passerait pour vert. On teste donc le
  # code de sortie à part — c'est exactement le piège d'un contrôle qui n'échoue pas.
  # Transaction EN LECTURE SEULE, et ce n'est pas une précaution de style. Le point
  # d'appel exécute des fonctions qu'il DÉCOUVRE : c'est un contrat d'exécution de
  # code, et ce chemin-ci est le seul joué sous « su postgres ». Une fonction greffée
  # respectant la convention de nommage écrirait donc avec les droits du
  # superutilisateur. La fonction est « security definer » et rabaisse déjà l'appelant
  # au propriétaire — l'escalade HORS de la base est fermée ; le « read only » ferme
  # l'écriture DANS la base. Les garde-fous ne lisent que des catalogues : la
  # contrainte ne les gêne pas, elle ne gêne que ce qui n'a rien à faire là.
  # Le délai de garde borne une fonction greffée qui traînerait (porte S1, Q5-1/Q5-6).
  if ! ANOMALIES_SCHEMA="$(sql_admin_base <<SQL
begin;
set transaction read only;
set local statement_timeout = '60s';
select controle || ' · ' || objet || ' → ' || anomalie
  from $GARDE_FOU_SCHEMA() order by controle, objet, anomalie;
rollback;
SQL
)"; then
    echec "Le garde-fou $GARDE_FOU_SCHEMA() n'a pas pu être joué sur « $BASE_NOM ».
      Le schéma n'est donc pas déclaré conforme : une question restée sans réponse n'est
      pas une réponse rassurante. Jouez-le à la main : select * from $GARDE_FOU_SCHEMA();"
  fi

  if [[ -n "$ANOMALIES_SCHEMA" ]]; then
    alerte "Anomalies remontées par $GARDE_FOU_SCHEMA() :"
    while IFS= read -r ligne; do
      [[ -z "$ligne" ]] || alerte "     $ligne"
    done <<< "$ANOMALIES_SCHEMA"
    echec "Schéma NON CONFORME (db/CONVENTIONS.md §18.4 et §19.4).
      Chaque ligne ci-dessus est préfixée du contrôle qui l'a remontée. Selon le contrôle :
        couverture_rls   — une table sans « force row level security », ou dont une politique
                           ne consulte pas le périmètre, se lit d'une filiale à l'autre ;
        tracabilite      — sans déclencheur « before insert », l'appelant fixe lui-même
                           version, cree_le et cree_par, et le gel rend la valeur définitive ;
        chemin_recherche — une fonction qui ne relègue pas pg_temp est détournable par
                           masquage d'une table du schéma ;
        (autre)          — contrôle ajouté au schéma depuis l'écriture de ce script : le
                           détail est dans la fonction, et il fait échouer au même titre.
      Les migrations sont passées ; le schéma obtenu ne l'est pas — et elles ne le
      rattraperont pas, puisqu'une base à jour ne les rejoue pas.
      Détail complet : psql -d $BASE_NOM -c 'select * from $GARDE_FOU_SCHEMA();'
      Démonstration de bout en bout : psql -U $ROLE_APP -d $BASE_NOM -f db/verifier_cloisonnement.sql"
  fi
  succes "garde-fous du schéma : aucune anomalie ($GARDE_FOU_SCHEMA(), point d'appel unique)"
fi

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

# >>> banc: entetes <<<
# ══ CE QUE LE SERVICE LIT, LE FRONTAL DOIT L'AVOIR NEUTRALISÉ (Q-39) ═════════
#
# Le vhost efface six en-têtes de provenance ou d'identité, pour qu'un client ne
# puisse pas les forger. La liste est ÉCRITE À LA MAIN, et elle est fragile par
# nature : `X-Request-Id` y a manqué pendant tout un lot, alors que
# `src/serveur.ts` en faisait la « référence » rendue au client et la clé de ses
# lignes de journal.
#
# On ne peut pas la remplacer par un motif : mesuré, `RequestHeader unset
# X-Forwarded-*` passe `configtest` et n'efface RIEN (le détail est dans le
# vhost, à côté de la liste). Ce qui reste possible, et que le CONVENTIONS.md
# §24 exige d'une liste écrite à la main, c'est de la CONFRONTER AU RÉEL :
#
#   > tout en-tête de requête que `src/` lit, ou auquel il fait confiance,
#   > doit être effacé ou reposé par le vhost.
#
# Les deux termes sortent de deux fichiers versionnés — le code du serveur et le
# vhost —, aucun n'est recopié ici. Ce contrôle aurait fait échouer
# l'installation le jour où `requestIdHeader: 'x-request-id'` a été écrit sans
# la ligne correspondante au frontal.
VHOST_APPLIQUE=/etc/apache2/sites-available/cyber-grc.conf
[[ -f "$VHOST_APPLIQUE" ]] || VHOST_APPLIQUE="$SOURCE/deploy/apache/cyber-grc.conf"

# 1. Ce que le code LIT : « requete.headers['x-…'] ». Le motif vise la requête,
#    jamais la réponse — `res.headers["set-cookie"]` de la liste de masquage de
#    pino est un en-tête de RÉPONSE et n'a rien à faire ici.
ENTETES_ATTENDUS="$(grep -rhoE "requete\.headers\['[a-z0-9-]+'\]" "$SOURCE/src" 2>/dev/null \
                    | sed "s/.*\['//; s/'\]//" | sort -u || true)"

# 2. Ce à quoi il fait CONFIANCE sans le nommer : `trustProxy` fait lire à
#    Fastify les trois en-têtes ci-dessous. C'est une propriété du cadre, pas
#    une découverte — elle est donc écrite, et conditionnée à la présence réelle
#    du réglage dans le code plutôt que supposée.
if grep -rq "trustProxy" "$SOURCE/src" 2>/dev/null; then
  ENTETES_ATTENDUS="$ENTETES_ATTENDUS
x-forwarded-for
x-forwarded-host
x-forwarded-proto"
fi

ENTETES_NUS=""
while IFS= read -r entete; do
  [[ -n "$entete" ]] || continue
  # « unset » ou « set » : reposer une valeur soi-même neutralise aussi bien
  # qu'effacer — c'est ce que fait X-Forwarded-Proto.
  if ! grep -qiE "^[[:space:]]*RequestHeader[[:space:]]+(unset|set)[[:space:]]+${entete}([[:space:]]|$)" \
       "$VHOST_APPLIQUE" 2>/dev/null; then
    ENTETES_NUS+="$entete"$'\n'
  fi
done <<< "$ENTETES_ATTENDUS"

if [[ -n "${ENTETES_NUS//[[:space:]]/}" ]]; then
  while IFS= read -r e; do
    [[ -n "$e" ]] || continue
    alerte "en-tête lu par le service et NON neutralisé par le vhost : $e"
    OU="$(grep -rn "headers\['$e'\]" "$SOURCE/src" 2>/dev/null | head -n1 || true)"
    [[ -n "$OU" ]] && alerte "  lu ici : ${OU#"$SOURCE/"}"
  done <<< "$ENTETES_NUS"
  echec "le service lit des en-têtes de requête que le frontal laisse passer tels quels
    (constat Q-39). Un client peut donc les forger : c'est ainsi que la « référence »
    d'un incident, rendue au client et servant de clé dans le journal, était choisie par
    la personne même qu'elle trace. Ajoutez « RequestHeader unset <en-tête> » au bloc des
    en-têtes de provenance de deploy/apache/cyber-grc.conf — à côté des six autres, et
    non ailleurs — ou reposez-en la valeur avec « RequestHeader set »."
else
  succes "en-têtes : tout ce que le service lit est effacé ou reposé par le vhost"
fi
# <<< banc: entetes >>>

# >>> banc: proxytimeout <<<
# ProxyTimeout du vhost INSTALLÉ contre celui du vhost de RÉFÉRENCE.
#
# Ce contrôle existe parce qu'un vhost déjà présent n'est jamais écrasé (voir
# juste au-dessus) : une valeur ajustée à la main survit à toutes les mises à
# jour, sans que personne ne le sache. Or ce délai est le deuxième maillon
# d'une chaîne de trois — navigateur (DELAI_CHARGEMENT_MS), Apache
# (ProxyTimeout), serveur (BORNES.lignesParReprise) — et le baisser coupe des
# reprises que le serveur sait tenir. Le constat Q-19 de la porte S2 est né
# d'un commentaire faux resté vrai aux yeux de tous pendant un lot entier :
# on ne remplace pas un commentaire par un autre commentaire.
#
# La référence n'est PAS un nombre recopié ici : c'est le vhost livré. Les deux
# valeurs viennent donc du même fichier versionné, et ce contrôle ne peut pas
# devenir faux tout seul.
# « || true » : sous « set -e » et « pipefail », un sed sur un fichier absent rend 2
# et ferait AVORTER l'installation. Un vhost qu'on ne sait pas lire est un
# avertissement, pas un motif d'arrêt — le service, lui, est déjà en marche.
lire_proxy_timeout() {
  sed -n 's/^[[:space:]]*ProxyTimeout[[:space:]]\{1,\}\([0-9]\{1,\}\).*/\1/p' "$1" 2>/dev/null | tail -n1 || true
}
PROXY_REF="$(lire_proxy_timeout "$SOURCE/deploy/apache/cyber-grc.conf" || true)"
PROXY_INSTALLE="$(lire_proxy_timeout /etc/apache2/sites-available/cyber-grc.conf || true)"
if [[ -z "$PROXY_REF" ]]; then
  alerte "Le vhost de référence ne pose plus de ProxyTimeout : ce contrôle ne vérifie plus rien."
elif [[ -z "$PROXY_INSTALLE" ]]; then
  alerte "Le vhost installé ne pose aucun ProxyTimeout (défaut Apache : 300 s)."
  alerte "Une reprise coupée à 300 s laisserait la transaction courir sans lecteur : posez ProxyTimeout ${PROXY_REF}."
elif [[ "$PROXY_INSTALLE" -lt "$PROXY_REF" ]]; then
  alerte "ProxyTimeout installé ($PROXY_INSTALLE s) < référence ($PROXY_REF s) :"
  alerte "Apache coupera des reprises que le serveur sait tenir (BORNES.lignesParReprise)."
elif [[ "$PROXY_INSTALLE" -gt "$PROXY_REF" ]]; then
  alerte "ProxyTimeout installé ($PROXY_INSTALLE s) > référence ($PROXY_REF s) :"
  POOL_MAX="$(lire_variable BASE_POOL_MAX)"; POOL_MAX="${POOL_MAX:-10}"
  alerte "chaque reprise immobilise d'autant plus longtemps une connexion sur ${POOL_MAX}."
  alerte "Pour reprendre davantage, scindez le fichier — n'allongez pas ce délai."
else
  succes "ProxyTimeout ($PROXY_INSTALLE s) conforme au vhost de référence"
fi
# <<< banc: proxytimeout >>>

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

# >>> banc: configtest <<<
# ══ APACHE COMPREND-IL SA CONFIGURATION ? ════════════════════════════════════
#
# Ce contrôle est arrivé avec la liste blanche du constat Q-31, et il vient
# d'elle : le vhost porte désormais un <FilesMatch> à **motif inversé**
# (« refuse tout ce qui ne finit pas par un type publiable »). C'est la
# construction dont l'échec est le plus difficile à lire pour quelqu'un qui n'a
# pas écrit la ligne — un exploitant, à 22 h, devant une page blanche.
#
# Ce que `configtest` prouve, et ce qu'il ne prouve pas, parce que la nuance
# décide de ce qu'on peut en conclure :
#
#  · il prouve qu'Apache **comprend** le motif — une parenthèse de trop, un
#    `(?!` qu'une version de PCRE refuse, et le service ne redémarrerait pas ;
#  · il ne prouve **pas** que le motif fait ce qu'il faut. Cela s'éprouve en
#    chargeant la page, et en demandant un fichier qui doit être refusé.
#
# Apache nomme lui-même le fichier et la ligne (« AH00526: Syntax error on line
# N of … ») : sa sortie est donc relayée telle quelle, jamais résumée.
info "Configuration du frontal"
APACHECTL="$(command -v apache2ctl || command -v apachectl || true)"
if [[ -z "$APACHECTL" ]]; then
  alerte "ni apache2ctl ni apachectl sur le PATH : la configuration du frontal n'a PAS été"
  alerte "vérifiée. Après installation d'Apache : apache2ctl configtest"
else
  SORTIE_APACHE="$("$APACHECTL" configtest 2>&1)" && RC_APACHE=0 || RC_APACHE=$?
  if [[ ${RC_APACHE:-0} -ne 0 ]]; then
    while IFS= read -r ligne; do
      [[ -n "$ligne" ]] && alerte "apache : $ligne"
    done <<< "$SORTIE_APACHE"
    echec "Apache refuse sa configuration (voir la ou les lignes ci-dessus, qui nomment le
      fichier et le numéro de ligne). Le frontal ne redémarrera pas, et l'application ne
      sera pas servie. Si la ligne mise en cause est le <FilesMatch> en liste blanche de
      deploy/apache/cyber-grc.conf, c'est le motif inversé du constat Q-31 : il refuse tout
      ce qui ne finit pas par un type publiable, et il s'écrit
      « (?i)^(?!.*\.(<types séparés par |>)$) ». Corrigez, puis relancez ce script."
  fi
  # `configtest` ne lit que « sites-enabled ». Sur une PREMIÈRE installation, le
  # vhost n'est encore que dans « sites-available » : la vérification passe donc
  # sans avoir seulement ouvert notre fichier. Le taire ferait prendre un contrôle
  # vide pour un contrôle réussi — c'est exactement ce que le §17.5 interdit.
  if [[ -e /etc/apache2/sites-enabled/cyber-grc.conf ]]; then
    succes "configuration Apache valide, vhost cyber-grc compris ($("$APACHECTL" -v 2>/dev/null | head -n1 || echo 'version inconnue'))"
  else
    succes "configuration Apache valide"
    alerte "…mais le vhost cyber-grc n'est PAS activé : « configtest » ne l'a donc PAS lu,"
    alerte "et le contrôle de bout en bout ci-dessous n'a pas pu être joué. Activez-le :"
    alerte "  a2ensite cyber-grc && $APACHECTL configtest && systemctl reload apache2"
    alerte "puis RELANCEZ ce script : il éprouvera alors l'URL d'entrée lui-même."
  fi

  # ══ L'URL D'ENTRÉE RÉPOND-ELLE ? (constat Q-36) ════════════════════════
  #
  # ── Pourquoi ce contrôle existe, et pourquoi il interroge « / » ────────
  #
  # Ce bloc prescrivait « curl https://<hôte>/index.html → 200 attendu ». La
  # prescription était juste, et elle a MENTI : la liste blanche du constat
  # Q-31 refusait « / » — l'URL par laquelle tout le monde entre — pendant que
  # « /index.html » rendait 200. Une requête de répertoire est résolue vers un
  # chemin terminé par « / », dont le dernier composant est vide, et le motif à
  # négation du <FilesMatch> était vrai sur cette chaîne vide. Mesuré :
  # http://hôte → 308 → https://hôte/ → **403**, application injoignable, et le
  # contrôle prescrit au vert. Un contrôle vide pris pour un contrôle réussi,
  # pour la seconde fois dans ce fichier.
  #
  # D'où deux changements, et le second compte plus que le premier :
  #  1. on interroge « / », l'URL d'entrée, et non « /index.html » ;
  #  2. on ne le PRESCRIT plus, on le FAIT. Une consigne écrite dans une alerte
  #     est une réserve ; ce chantier vient d'apprendre qu'une réserve écrite
  #     n'est pas une réserve traitée.
  #
  # `-k` : on éprouve le ROUTAGE et l'AUTORISATION, pas la confiance TLS — le
  # certificat vient de la PKI interne et n'a aucune raison d'être approuvé sur
  # la machine elle-même. `--resolve` force le test sur CE serveur, quel que
  # soit ce que le DNS raconte.
  if [[ -e /etc/apache2/sites-enabled/cyber-grc.conf ]]; then
    NOM_SERVEUR="$(sed -n 's/^[[:space:]]*ServerName[[:space:]]\{1,\}//p' \
                   /etc/apache2/sites-available/cyber-grc.conf 2>/dev/null | head -n1 || true)"
    if [[ -z "$NOM_SERVEUR" ]]; then
      alerte "le vhost ne déclare aucun ServerName : l'URL d'entrée n'a pas pu être éprouvée."
    else
      # `--noproxy '*'` : la cible est cette machine, imposée par `--resolve`. Un
      # mandataire déclaré dans l'environnement (http_proxy, courant sur un
      # réseau d'entreprise) détournerait la sonde et la ferait échouer sur un
      # service parfaitement sain — c'est ce qui est arrivé au banc.
      # `|| true` sans `echo` de repli : curl rend DÉJÀ « 000 » sur son %{http_code}
      # quand la connexion échoue, et un repli en ajoutait un second (« 000000 »),
      # que les comparaisons n'auraient reconnu ni comme un succès ni comme le
      # 000 documenté dans le message d'échec.
      sonder() {  # <chemin> [--chaine] → code HTTP, ou 000 si rien ne répond
        local code
        if [[ "${2:-}" == --chaine ]]; then
          code="$(curl -sk -L --max-time 15 --noproxy '*' \
                       --resolve "$NOM_SERVEUR:80:127.0.0.1" \
                       --resolve "$NOM_SERVEUR:443:127.0.0.1" \
                       -o /dev/null -w '%{http_code}' "http://$NOM_SERVEUR$1" 2>/dev/null || true)"
        else
          code="$(curl -sk --max-time 15 --noproxy '*' \
                       --resolve "$NOM_SERVEUR:443:127.0.0.1" \
                       -o /dev/null -w '%{http_code}' "https://$NOM_SERVEUR$1" 2>/dev/null || true)"
        fi
        printf '%s' "${code:-000}"
      }
      CODE_ENTREE="$(sonder / --chaine)"
      CODE_RACINE="$(sonder /)"
      CODE_INTERDIT="$(sonder /verification-liste-blanche-q31.xlsx)"

      if [[ "$CODE_ENTREE" != 200 || "$CODE_RACINE" != 200 ]]; then
        alerte "URL d'entrée   http://$NOM_SERVEUR/  (redirection suivie) -> $CODE_ENTREE"
        alerte "racine HTTPS   https://$NOM_SERVEUR/                      -> $CODE_RACINE"
        echec "l'application ne répond pas à son URL d'entrée (constat Q-36). Un 403 ici avec
          un /index.html qui répond 200 désigne le <FilesMatch> en liste blanche de
          deploy/apache/cyber-grc.conf : son motif doit exempter le nom VIDE — « (?!\$) » —
          faute de quoi il refuse le répertoire avant que DirectoryIndex n'ait résolu
          index.html. Un 000 signifie qu'Apache ne répond pas du tout : $APACHECTL configtest,
          puis journalctl -u apache2. Le journal du vhost nomme le chemin refusé."
      elif [[ "$CODE_INTERDIT" != 403 ]]; then
        echec "un fichier non publiable obtient $CODE_INTERDIT au lieu de 403 (constat Q-31) :
          la liste blanche du vhost ne protège plus rien, et des données déposées dans la
          racine web seraient servies sans authentification. Voir le <FilesMatch> de
          deploy/apache/cyber-grc.conf."
      else
        succes "URL d'entrée servie (200 après redirection), fichier non publiable refusé (403)"
      fi

      # ══ INVARIANT DU CACHE : LONG ⇒ VERSIONNÉ (constat Q-43) ═══════════
      #
      #   > **Un actif ne reçoit un cache long que si son URL est versionnée.**
      #
      # Sans ce contrôle, la règle est un commentaire — et l'on sait ce que
      # cela donne : le bloc `mod_expires` du vhost ÉNONÇAIT sa condition
      # (« CE BLOC N'EST SÛR QUE COUPLÉ AU JETON DE VERSION »), un type non
      # couvert est arrivé (`image/png`, trente jours, jamais versionné), et
      # personne ne l'a vu pendant sept passages de porte.
      #
      # Aucun nombre n'est recopié ici. Les deux termes de la comparaison
      # sortent des deux artefacts versionnés :
      #  · la durée — demandée à APACHE lui-même, fichier par fichier ;
      #  · le seuil — lu dans l'`ExpiresDefault` du vhost installé ;
      #  · le versionnement — lu dans le frontend RÉELLEMENT PUBLIÉ.
      #
      # Ce que le contrôle cherche : un chemin en position de CHARGEMENT
      # (`src="…"`, `href="…"`, `url(…)`) sans `?v=`. Il regarde tout le
      # frontend publié, pas seulement `index.html` — parce que c'est
      # exactement là qu'était le piège : `js/core/vault.js` construit l'URL
      # du logo à l'exécution, si bien qu'un contrôle borné à la page aurait
      # été satisfait par un jeton qui ne versionnait qu'une des deux URL.
      # Les lignes de COMMENTAIRE sont écartées : plusieurs modules citent leur
      # propre balise `<script src="…">` en en-tête, et les compter aurait fait
      # échouer l'installation sur une phrase de documentation.
      secondes_expires() {  # « access plus 1 hour » → 3600
        local n unite
        n="$(printf '%s' "$1" | sed -n 's/.*plus[[:space:]]\{1,\}\([0-9]\{1,\}\).*/\1/p')"
        unite="$(printf '%s' "$1" | sed -n 's/.*plus[[:space:]]\{1,\}[0-9]\{1,\}[[:space:]]\{1,\}\([a-z]*\).*/\1/p')"
        [[ -n "$n" ]] || { printf '0'; return; }
        case "$unite" in
          second*) printf '%s' "$n" ;;   minute*) printf '%s' "$((n*60))" ;;
          hour*)   printf '%s' "$((n*3600))" ;;  day*)  printf '%s' "$((n*86400))" ;;
          week*)   printf '%s' "$((n*604800))" ;; month*) printf '%s' "$((n*2592000))" ;;
          year*)   printf '%s' "$((n*31536000))" ;; *) printf '0' ;;
        esac
      }
      DEFAUT_BRUT="$(sed -n 's/^[[:space:]]*ExpiresDefault[[:space:]]\{1,\}"\([^"]*\)".*/\1/p' \
                     /etc/apache2/sites-available/cyber-grc.conf 2>/dev/null | tail -n1 || true)"
      SEUIL_COURT="$(secondes_expires "$DEFAUT_BRUT")"

      if [[ "${SEUIL_COURT:-0}" -le 0 ]]; then
        alerte "le vhost ne pose pas d'ExpiresDefault lisible : l'invariant « cache long ⇒"
        alerte "URL versionnée » (constat Q-43) n'a PAS pu être vérifié."
      else
        NON_VERSIONNES=""
        while IFS= read -r fichier; do
          REL="${fichier#"$RACINE/frontend/"}"
          AGE="$(curl -sk --max-time 10 --noproxy '*' --resolve "$NOM_SERVEUR:443:127.0.0.1" \
                 -o /dev/null -D - "https://$NOM_SERVEUR/$REL" 2>/dev/null \
                 | tr -d '\r' | sed -n 's/^[Cc]ache-[Cc]ontrol:.*max-age=\([0-9]*\).*/\1/p' | tail -n1 || true)"
          [[ -n "$AGE" && "$AGE" -gt "$SEUIL_COURT" ]] || continue
          MOTIF="$(printf '%s' "$REL" | sed 's/[.[\*^$/]/\\&/g')"
          REFS="$(grep -rnE "(src|href)=[\"']$MOTIF[\"']|url\([\"']?$MOTIF[\"')]" \
                  "$RACINE/frontend" 2>/dev/null \
                  | grep -vE '^[^:]*:[0-9]+: *(//|\*|/\*|<!--|#)' || true)"
          [[ -n "$REFS" ]] && NON_VERSIONNES+="$REL (max-age=$AGE)"$'\n'"$REFS"$'\n'
        done < <(find "$RACINE/frontend" -type f ! -name index.html)

        if [[ -n "$NON_VERSIONNES" ]]; then
          while IFS= read -r ligne; do [[ -n "$ligne" ]] && alerte "$ligne"; done <<< "$NON_VERSIONNES"
          echec "un ou plusieurs actifs reçoivent un cache LONG alors que leur URL n'est pas
            versionnée (constat Q-43, seuil : ExpiresDefault = ${SEUIL_COURT} s). Les lignes
            ci-dessus donnent le fichier, la ligne et la référence fautive. Un correctif sur
            ces fichiers resterait invisible jusqu'à l'expiration du cache. Deux issues, et
            une seule est bonne selon le cas : faire porter « ?v= » à TOUTES les références
            (jeton d'install.sh, ou l'URL écrite dans le code), OU retirer le type du bloc
            ExpiresByType de deploy/apache/cyber-grc.conf pour qu'il retombe sur
            ExpiresDefault. Versionner une SEULE des références ne suffit pas : c'est
            exactement ce qui a produit ce constat."
        else
          succes "cache : tout actif à durée longue porte une URL versionnée (seuil ${SEUIL_COURT} s)"
        fi
      fi
    fi
  fi
fi
# <<< banc: configtest >>>

printf '\n\033[1;32mInstallation terminée.\033[0m\n'
printf 'Configuration : %s  (root:%s 0640)\n' "$FICHIER_CONFIG" "$UTILISATEUR"
printf 'Journaux      : journalctl -u cyber-grc -f\n'
printf 'Exploitation  : %s/backend/README.md\n' "$RACINE"
