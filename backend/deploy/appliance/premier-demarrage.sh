#!/usr/bin/env bash
# =============================================================================
#  cyber-grc-premier-demarrage — le PREMIER démarrage d'un clone de l'appliance
#
#  Lancé par cyber-grc-premier-demarrage.service, une seule fois : il rend ce
#  clone UNIQUE (machine-id, clés d'hôte SSH, secrets, compte de secours), pose
#  le nom et l'URL, relance install.sh, et se désarme.
#
#  Il est NON INTERACTIF par construction — un oneshot au boot n'a pas de
#  terminal fiable. Ce qu'il ne peut pas deviner, il le LIT dans
#  /etc/cyber-grc/premier-demarrage.conf s'il existe (NOM_HOTE=, URL_PUBLIQUE=),
#  sinon il prend le nom de la machine. Le mot de passe du compte de secours est
#  ENGENDRÉ et déposé dans /root/cyber-grc-premier-demarrage.txt (0600) — le
#  destinataire le lit à sa première connexion et le change.
#
#  🛑 Il REFUSE de se rejouer : régénérer les secrets à chaque boot invaliderait
#  toutes les sessions et tous les mots de passe de base — la marque
#  /var/lib/cyber-grc/premier-demarrage.fait le tient, et l'unité aussi
#  (ConditionPathExists=!…).
#
#  Options (essais) : --racine <dir> --install <install.sh> --secours-js <secours.js> --sans-systemd
# =============================================================================
set -euo pipefail

R=""; INSTALL=""; SECOURS_JS=""; SANS_SYSTEMD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --racine) R="${2%/}"; shift 2 ;;
    --install) INSTALL="$2"; shift 2 ;;
    --secours-js) SECOURS_JS="$2"; shift 2 ;;
    --sans-systemd) SANS_SYSTEMD=1; shift ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
done
ESSAI=0; [[ -n "$R" ]] && ESSAI=1
[[ -n "$INSTALL" ]]    || INSTALL="$R/usr/local/src/cyber-grc/backend/deploy/install.sh"
[[ -n "$SECOURS_JS" ]] || SECOURS_JS="$R/opt/cyber-grc/backend/dist/auth/secours.js"

info()   { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
succes() { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
echec()  { printf '\033[1;31m ERR\033[0m %s\n' "$*" >&2; exit 1; }

MARQUE="$R/var/lib/cyber-grc/premier-demarrage.fait"
ENV="$R/etc/cyber-grc/env"
if [[ -f "$MARQUE" ]]; then
  echo "premier démarrage déjà joué le $(cat "$MARQUE") — rien à faire." >&2
  exit 3
fi
[[ -f "$ENV" ]] || echec "$ENV absent."
[[ -x "$INSTALL" || -f "$INSTALL" ]] || echec "install.sh introuvable : $INSTALL"

poser_variable() {   # <clé> <valeur> — remplace ou ajoute, jamais deux lignes
  local cle="$1" val="$2" tmp; tmp="$(mktemp)"
  awk -v k="$cle" -v v="$val" 'BEGIN{ok=0} $0 ~ "^[[:space:]]*"k"=" && !ok {print k"="v; ok=1; next} {print} END{if(!ok) print k"="v}' "$ENV" > "$tmp"
  cat "$tmp" > "$ENV"; rm -f "$tmp"
}
lire_variable() { sed -n "s/^[[:space:]]*$1=//p" "$ENV" | head -n1; }
CONF="$R/etc/cyber-grc/premier-demarrage.conf"
lire_conf() { [[ -f "$CONF" ]] && sed -n "s/^[[:space:]]*$1=//p" "$CONF" | head -n1 || true; }
APPL="$R/etc/cyber-grc/appliance.conf"
lire_appl() { [[ -f "$APPL" ]] && sed -n "s/^[[:space:]]*$1=//p" "$APPL" | head -n1 || true; }

# ── 1. Identité de la machine ─────────────────────────────────────────────────
info "Identité"
head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$R/etc/machine-id"; echo >> "$R/etc/machine-id"
install -d -m 0755 "$R/etc/ssh"
ssh-keygen -A ${R:+-f "$R"} >/dev/null 2>&1 || echec "régénération des clés d'hôte SSH impossible."
NOM_HOTE="$(lire_conf NOM_HOTE)"; [[ -n "$NOM_HOTE" ]] || NOM_HOTE="$(hostname 2>/dev/null || echo cyber-grc)"
if [[ $ESSAI -eq 0 ]]; then hostnamectl set-hostname "$NOM_HOTE" 2>/dev/null || hostname "$NOM_HOTE"; fi
URL="$(lire_conf URL_PUBLIQUE)"; [[ -n "$URL" ]] || URL="https://$( { [[ $ESSAI -eq 0 ]] && hostname -f 2>/dev/null; } || echo "$NOM_HOTE")"
URL="${URL%/}"
[[ "$URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || echec "URL_PUBLIQUE invalide : « $URL » (attendu https://nom[:port])."
poser_variable SERVEUR_URL_PUBLIQUE "$URL"
succes "machine-id et clés d'hôte neufs ; nom « $NOM_HOTE », URL $URL"

# ── 2. Le compte de secours : mot de passe ENGENDRÉ, empreinte par LE code du produit
info "Compte de secours"
ID_SECOURS="$(lire_variable AUTH_COMPTE_SECOURS_IDENTIFIANT)"; [[ -n "$ID_SECOURS" ]] || ID_SECOURS="secours.grc"
MDP_SECOURS="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
[[ -f "$SECOURS_JS" ]] || echec "module du compte de secours absent : $SECOURS_JS"
EMPREINTE="$(printf '%s' "$MDP_SECOURS" | node --input-type=module -e "
const m = await import('file://$SECOURS_JS');
const morceaux = []; for await (const c of process.stdin) morceaux.push(c);
process.stdout.write(await m.engendrerEmpreinte(Buffer.concat(morceaux).toString('utf8')));
" 2>/dev/null)" || echec "calcul de l'empreinte impossible."
[[ "$EMPREINTE" == scrypt\$* ]] || echec "empreinte de forme inattendue."
poser_variable AUTH_COMPTE_SECOURS_IDENTIFIANT "$ID_SECOURS"
poser_variable AUTH_COMPTE_SECOURS_EMPREINTE "$EMPREINTE"
install -d -m 0700 "$R/root"
umask 077
cat > "$R/root/cyber-grc-premier-demarrage.txt" <<TXT
Cyber GRC — premier démarrage de cette appliance, le $(date -u +%Y-%m-%dT%H:%M:%SZ)
Étiquette : $(lire_appl ETIQUETTE)

URL                : $URL
Compte de secours  : $ID_SECOURS
Mot de passe       : $MDP_SECOURS

Ce compte donne l'administration Groupe et chacun de ses usages est journalisé.
CHANGEZ ce mot de passe (install.sh --assistant) et raccordez l'annuaire
(docs/INSTALLATION_ENTREPRISE.md). Puis supprimez ce fichier.
TXT
umask 022
unset MDP_SECOURS EMPREINTE
succes "empreinte posée ; le mot de passe est dans /root/cyber-grc-premier-demarrage.txt (0600)"

# ── 3. Régénérer les secrets internes et republier ───────────────────────────
# SESSION_SECRET et les trois mots de passe de rôles ont été VIDÉS au scellement :
# install.sh engendre le premier s'il est vide, et --reinitialiser-mots-de-passe
# engendre et pose les trois autres. Rien n'est écrit ici en shell.
info "install.sh --maj --reinitialiser-mots-de-passe"
bash "$INSTALL" --maj --reinitialiser-mots-de-passe || echec "install.sh a échoué (voir ci-dessus)."
succes "secrets régénérés, service republié"

# ── 4. Le compte local du destinataire change de mot de passe à sa 1re connexion
COMPTE="$(lire_appl COMPTE_LOCAL)"
if [[ -n "$COMPTE" && $ESSAI -eq 0 ]] && id "$COMPTE" >/dev/null 2>&1; then
  chage -d 0 "$COMPTE" && succes "mot de passe de « $COMPTE » à changer à la première connexion"
fi

# ── 5. Se désarmer ───────────────────────────────────────────────────────────
install -d -m 0750 "$R/var/lib/cyber-grc"
date -u +%Y-%m-%dT%H:%M:%SZ > "$MARQUE"
if [[ $SANS_SYSTEMD -eq 0 && $ESSAI -eq 0 ]]; then systemctl disable cyber-grc-premier-demarrage.service >/dev/null 2>&1 || true; fi
succes "premier démarrage terminé — il ne se rejouera pas"
