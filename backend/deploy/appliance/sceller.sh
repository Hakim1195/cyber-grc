#!/usr/bin/env bash
# =============================================================================
#  sceller.sh — SCELLER une VM avant d'en faire une appliance (image Proxmox)
#
#  Se joue UNE fois, en root, sur une VM où `install.sh` a déjà tout posé, juste
#  avant `shutdown -h now` puis `vzdump`. Il retire ce qui ne doit pas quitter la
#  machine et arme le premier démarrage, qui régénérera ce qui doit être unique.
#
#  🛑 UNE IMAGE CLONÉE DIX FOIS AVEC LE MÊME SESSION_SECRET, LES MÊMES MOTS DE
#  PASSE DE BASE ET LES MÊMES CLÉS D'HÔTE SSH EST UN DÉFAUT DE SÉCURITÉ, pas un
#  raccourci. Ce script EFFACE ces secrets ; il n'en régénère aucun — c'est
#  `cyber-grc-premier-demarrage` qui le fait, au premier boot de chaque clone.
#
#  Et il VÉRIFIE : chaque valeur secrète lue avant effacement est cherchée dans
#  tout ce qui restera sur le disque. Une valeur retrouvée fait échouer le
#  scellement en nommant le fichier — balayage, pas liste (CONVENTIONS §19.5).
#
#  Options :
#    --source <dépôt>   le clone à embarquer (défaut : celui de ce script)
#    --compte <nom>     compte local du destinataire : son mot de passe expirera
#                       au premier démarrage (défaut : aucun)
#    --racine <dir>     préfixe de système de fichiers — POUR LES ESSAIS : rien
#                       n'est arrêté, aucun droit root n'est exigé
# =============================================================================
set -euo pipefail

R=""; SOURCE=""; COMPTE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --racine) R="${2%/}"; shift 2 ;;
    --source) SOURCE="${2%/}"; shift 2 ;;
    --compte) COMPTE="$2"; shift 2 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
done
[[ -n "$SOURCE" ]] || SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ESSAI=0; [[ -n "$R" ]] && ESSAI=1
if [[ $ESSAI -eq 0 && $EUID -ne 0 ]]; then echo "sceller.sh : root requis (ou --racine pour un essai)." >&2; exit 2; fi

info()   { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
succes() { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
alerte() { printf '\033[1;33m  !!\033[0m %s\n' "$*" >&2; }
echec()  { printf '\033[1;31m ERR\033[0m %s\n' "$*" >&2; exit 1; }

ENV="$R/etc/cyber-grc/env"
[[ -f "$ENV" ]] || echec "$ENV absent : cette machine n'a pas été installée par install.sh."
[[ -f "$SOURCE/backend/deploy/install.sh" ]] || echec "« $SOURCE » n'est pas un clone du dépôt (backend/deploy/install.sh absent)."
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Réécrit « CLE=… » en « CLE= » (même sémantique que definir_variable d'install.sh).
vider_variable() {
  local cle="$1" tmp; tmp="$(mktemp)"
  awk -v k="$cle" 'BEGIN{ok=0} $0 ~ "^[[:space:]]*"k"=" && !ok {print k"="; ok=1; next} {print}' "$ENV" > "$tmp"
  cat "$tmp" > "$ENV"; rm -f "$tmp"
}
lire_variable() { sed -n "s/^[[:space:]]*$1=//p" "$ENV" | head -n1; }

# ── 0. Refuser AVANT de toucher quoi que ce soit ──────────────────────────────
# 🛑 Une règle sudo SANS MOT DE PASSE dans une image clonée est une porte ouverte
# sur chaque clone. Le labo du 30/09/2026 en portait une (/etc/sudoers.d/labo,
# posée pour l'agent) : le scellement la NOMME et s'arrête — il ne la retire pas
# lui-même, parce que c'est une décision d'exploitant. Les commentaires qui
# portent le mot ne comptent pas (le README de Debian en a un).
NOPASSWD_TROUVE="$(grep -rlsE '^[^#]*NOPASSWD' "$R/etc/sudoers.d" "$R/etc/sudoers" 2>/dev/null || true)"
if [[ -n "$NOPASSWD_TROUVE" ]]; then
  while IFS= read -r f; do [[ -n "$f" ]] && alerte "règle sudo sans mot de passe dans : $f"; done <<< "$NOPASSWD_TROUVE"
  echec "Scellement REFUSÉ : une règle sudo sans mot de passe partirait dans l'image (fichiers
      ci-dessus). Retirez-la (ou remplacez-la par une règle avec mot de passe), puis relancez."
fi

# ── 1. Arrêter ce qui écrit ───────────────────────────────────────────────────
if [[ $ESSAI -eq 0 ]]; then
  info "Arrêt du service"
  systemctl stop cyber-grc.service 2>/dev/null || true
  systemctl stop cyber-grc-notifications.timer cyber-grc-reanalyse.timer cyber-grc-evenements.timer 2>/dev/null || true
  succes "cyber-grc arrêté (PostgreSQL et Apache restent en place)"
fi

# ── 2. Embarquer la SOURCE à un chemin système ────────────────────────────────
# Le premier démarrage relance install.sh : il lui faut un dépôt qui ne dépende
# ni d'un répertoire personnel, ni de ce que /opt/cyber-grc contient.
info "Copie du dépôt vers /usr/local/src/cyber-grc"
install -d -m 0755 "$R/usr/local/src"
rsync -a --delete \
  --exclude 'node_modules' --exclude 'dist' --exclude '*.local.md' \
  --exclude '.grc-essais.env' --exclude '.claude' \
  "$SOURCE/" "$R/usr/local/src/cyber-grc/"
ETIQUETTE="$(git -C "$SOURCE" describe --tags --always 2>/dev/null || echo 'sans-etiquette')"
succes "dépôt embarqué ($ETIQUETTE)"

# ── 3. Armer le premier démarrage ────────────────────────────────────────────
info "Premier démarrage"
install -d -m 0755 "$R/usr/local/sbin" "$R/etc/systemd/system/multi-user.target.wants"
install -m 0755 "$ICI/premier-demarrage.sh" "$R/usr/local/sbin/cyber-grc-premier-demarrage"
install -m 0644 "$ICI/cyber-grc-premier-demarrage.service" "$R/etc/systemd/system/"
# Lien RELATIF : il reste juste sous un préfixe d'essai comme en vrai.
ln -sfn ../cyber-grc-premier-demarrage.service \
  "$R/etc/systemd/system/multi-user.target.wants/cyber-grc-premier-demarrage.service"
rm -f "$R/var/lib/cyber-grc/premier-demarrage.fait"
{
  printf 'COMPTE_LOCAL=%s\n' "$COMPTE"
  printf 'ETIQUETTE=%s\n' "$ETIQUETTE"
} > "$R/etc/cyber-grc/appliance.conf"
succes "unité armée, /etc/cyber-grc/appliance.conf écrit"

# ── 4. Lire PUIS effacer les secrets ─────────────────────────────────────────
# Les valeurs sont retenues pour le balayage du §6 — puis oubliées avec le
# processus. Elles ne sont jamais affichées.
CLES_SECRETES=(SESSION_SECRET BASE_MOT_DE_PASSE BASE_MOT_DE_PASSE_PROPRIETAIRE
  BASE_MOT_DE_PASSE_LECTURE AUTH_COMPTE_SECOURS_EMPREINTE LDAP_MOT_DE_PASSE_SERVICE
  SMTP_MOT_DE_PASSE SMTP_OAUTH_CLIENT_SECRET)
info "Effacement des secrets de $ENV"
VALEURS=()
for cle in "${CLES_SECRETES[@]}"; do
  v="$(lire_variable "$cle")"
  [[ ${#v} -ge 8 ]] && VALEURS+=("$v")
  vider_variable "$cle"
done
chmod 0600 "$ENV"
succes "${#CLES_SECRETES[@]} clés vidées (${#VALEURS[@]} valeurs retenues pour le balayage)"

# ── 5. Retirer ce qui identifie CETTE machine ou son auteur ──────────────────
info "Identité et traces"
rm -f "$R"/etc/ssh/ssh_host_*                       # régénérées au premier démarrage
: > "$R/etc/machine-id" 2>/dev/null || true
rm -f "$R/var/lib/dbus/machine-id"
rm -f "$R"/root/.bash_history "$R"/home/*/.bash_history
rm -rf "$R"/root/.claude "$R"/home/*/.claude "$R"/home/*/.local/share/claude "$R"/home/*/.local/bin/claude
# Tout ce que Claude Code pose hors de ~/.claude — relevé sur la VM du labo le 30/09/2026 :
# le fichier de compte, ses sauvegardes, les caches, l'état, le gestionnaire d'URL.
rm -f  "$R"/root/.claude.json "$R"/home/*/.claude.json "$R"/root/.sudo_as_admin_successful "$R"/home/*/.sudo_as_admin_successful
rm -rf "$R"/root/.cache/claude* "$R"/home/*/.cache/claude* "$R"/root/.local/state/claude "$R"/home/*/.local/state/claude
rm -f  "$R"/home/*/.local/share/applications/claude-code-url-handler.desktop
rm -f  "$R"/home/*/.grc-essais.env "$R"/root/.grc-essais.env
find "$R/home" "$R/root" "$R/usr/local/src" -name '*.local.md' -type f -delete 2>/dev/null || true
rm -f "$R"/root/.ssh/authorized_keys "$R"/home/*/.ssh/authorized_keys   # le destinataire posera les siennes
rm -rf "$R"/var/cache/apt/archives/*.deb "$R"/tmp/* "$R"/var/tmp/* 2>/dev/null || true
if [[ $ESSAI -eq 0 ]]; then journalctl --rotate --vacuum-time=1s >/dev/null 2>&1 || true; fi
succes "clés d'hôte, machine-id, historiques, session Claude, clés autorisées : retirés"

# ── 6. LE BALAYAGE — aucune valeur secrète ne survit sur le disque ───────────
info "Balayage : les valeurs effacées ne doivent survivre nulle part"
RESTES=""
for v in "${VALEURS[@]}"; do
  trouve="$(grep -rIlF --exclude-dir=proc --exclude-dir=sys --exclude-dir=dev --exclude-dir=run \
             -- "$v" "$R/etc" "$R/home" "$R/root" "$R/opt" "$R/usr/local" "$R/var/lib/cyber-grc" "$R/var/backups" 2>/dev/null || true)"
  [[ -n "$trouve" ]] && RESTES+="$trouve"$'\n'
done
if [[ -n "${RESTES//[[:space:]]/}" ]]; then
  while IFS= read -r f; do [[ -n "$f" ]] && alerte "secret encore présent dans : $f"; done <<< "$RESTES"
  echec "Scellement REFUSÉ : une valeur secrète survit sur le disque (fichiers ci-dessus).
      Un clone de cette image emporterait ce secret. Effacez-le, puis relancez."
fi
succes "aucune valeur secrète retrouvée"

# ── 7. Marque ─────────────────────────────────────────────────────────────────
printf 'scelle_le=%s\netiquette=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ETIQUETTE" > "$R/etc/cyber-grc/SCELLE"
succes "scellé — $ETIQUETTE"
[[ $ESSAI -eq 1 ]] || info "Éteignez maintenant :  shutdown -h now   — puis vzdump (docs/APPLIANCE_PROXMOX.md)"
