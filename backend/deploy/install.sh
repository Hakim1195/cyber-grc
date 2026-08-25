#!/usr/bin/env bash
# Installation de Cyber GRC Groupe sur Debian 13 — SANS conteneur.
#
# Idempotent : ré-exécutable sans dommage. À lancer en root.
#   bash install.sh            installation ou mise à jour complète
#   bash install.sh --maj      mise à jour applicative seule (pas de paquets)
#
# Ce script ne crée AUCUN secret. Il génère /etc/cyber-grc/serveur.env à partir
# de .env.example si le fichier n'existe pas, et s'arrête pour que l'exploitant
# le renseigne : mots de passe, DN de service LDAP et relais SMTP ne doivent
# jamais transiter par un script.

set -Eeuo pipefail

UTILISATEUR="cyber-grc"
RACINE="/opt/cyber-grc"
DONNEES="/var/lib/cyber-grc"
CONFIG="/etc/cyber-grc"
JOURNAUX="/var/log/cyber-grc"
SAUVEGARDES="/var/backups/cyber-grc"
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPOT="$(cd "$SOURCE/.." && pwd)"

MAJ_SEULE=0
[[ "${1:-}" == "--maj" ]] && MAJ_SEULE=1

info()   { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
succes() { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
alerte() { printf '\033[1;33m  !!\033[0m %s\n' "$*" >&2; }
echec()  { printf '\033[1;31m ERR\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || echec "À lancer en root."

# ---------------------------------------------------------------- paquets ----
if [[ $MAJ_SEULE -eq 0 ]]; then
  info "Paquets système"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg apache2 clamav clamav-daemon rsync
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

  a2enmod -q ssl proxy proxy_http headers rewrite deflate expires
  systemctl enable --now postgresql clamav-daemon clamav-freshclam apache2
fi

# ------------------------------------------------------- compte de service ----
info "Compte de service"
if ! id -u "$UTILISATEUR" >/dev/null 2>&1; then
  # Sans shell et sans domicile : ce compte ne sert qu'à faire tourner le service.
  useradd --system --no-create-home --home-dir /nonexistent \
          --shell /usr/sbin/nologin "$UTILISATEUR"
fi
succes "$UTILISATEUR"

# ------------------------------------------------------------ répertoires ----
info "Arborescence"
install -d -o root          -g root          -m 0755 "$RACINE"
install -d -o root          -g "$UTILISATEUR" -m 0750 "$CONFIG"
install -d -o "$UTILISATEUR" -g "$UTILISATEUR" -m 0700 "$DONNEES"/{pieces-jointes,quarantaine,temporaire}
install -d -o "$UTILISATEUR" -g "$UTILISATEUR" -m 0750 "$JOURNAUX"
install -d -o root          -g root          -m 0700 "$SAUVEGARDES"
succes "répertoires (pièces jointes en 0700 : hors de portée d'Apache)"

# -------------------------------------------------------------- code source ----
info "Déploiement du code"
rsync -a --delete \
      --exclude node_modules --exclude .env --exclude 'var/' \
      "$SOURCE/" "$RACINE/backend/"
# Le frontend est servi directement par Apache.
rsync -a --delete "$DEPOT/cyber-gouvernance_V4/" "$RACINE/frontend/"
chown -R root:root "$RACINE"
succes "code déployé"

info "Dépendances et compilation"
( cd "$RACINE/backend" && npm ci --omit=dev --silent && npm install --silent --no-save typescript && npx tsc -p tsconfig.json )
succes "build"

# ------------------------------------------------------------ configuration ----
if [[ ! -f "$CONFIG/serveur.env" ]]; then
  install -o root -g "$UTILISATEUR" -m 0640 "$SOURCE/.env.example" "$CONFIG/serveur.env"
  alerte "Configuration créée : $CONFIG/serveur.env"
  alerte "RENSEIGNEZ-LA (base, LDAP, SMTP, secret de session) puis relancez ce script."
  exit 2
fi
chown root:"$UTILISATEUR" "$CONFIG/serveur.env"
chmod 0640 "$CONFIG/serveur.env"
succes "configuration présente"

# ------------------------------------------------------------------- base ----
info "Base de données"
# shellcheck disable=SC1090
set -a; source "$CONFIG/serveur.env"; set +a

if ! su - postgres -c "psql -Atc \"select 1 from pg_roles where rolname='${BASE_UTILISATEUR}'\"" | grep -q 1; then
  [[ -n "${BASE_MOT_DE_PASSE:-}" ]] || echec "BASE_MOT_DE_PASSE non renseigné dans $CONFIG/serveur.env"
  su - postgres -c "psql -c \"create role ${BASE_UTILISATEUR} login password '${BASE_MOT_DE_PASSE}'\""
fi
if ! su - postgres -c "psql -Atlqc '\\l'" | cut -d'|' -f1 | grep -qx "${BASE_NOM}"; then
  su - postgres -c "createdb -O ${BASE_UTILISATEUR} ${BASE_NOM}"
fi
succes "base ${BASE_NOM}"

info "Migrations"
( cd "$RACINE/backend" && node db/migrate.mjs )
succes "schéma à jour"

# ----------------------------------------------------------------- service ----
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

# ------------------------------------------------------------ vérification ----
info "Vérification"
sleep 2
if curl -fsS "http://127.0.0.1:${SERVEUR_PORT:-3001}/api/sante" >/dev/null; then
  succes "le service répond"
else
  echec "le service ne répond pas — voir : journalctl -u cyber-grc -n 50"
fi

printf '\n\033[1;32mInstallation terminée.\033[0m\n'
printf 'Journaux    : journalctl -u cyber-grc -f\n'
printf 'Exploitation: %s/backend/README.md\n' "$RACINE"
