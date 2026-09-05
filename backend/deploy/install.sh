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
#          « configtest » (Apache comprend-il sa configuration),
#          « desinstaller » (le retrait, et l'ORDRE de ses gestes),
#          « sauvegarde » (le cliché qui précède toute migration).
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
DESINSTALLER=0
AVEC_LES_DONNEES=0
EXPORT_VERIFIE=""
REPRENDRE_PROPRIETE=0
REINITIALISER_MDP=0
VERIFIER_PUBLICATION=0

info()   { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
succes() { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
alerte() { printf '\033[1;33m  !!\033[0m %s\n' "$*" >&2; }
echec()  { printf '\033[1;31m ERR\033[0m %s\n' "$*" >&2; exit 1; }

# ── Constat Q-75 : un TROISIÈME verdict, entre `succes` et `echec` ──────────
#
# Un contrôle qui n'a PAS PU être joué — vhost pas encore activé, annuaire
# injoignable, outil absent — se signalait jusqu'ici par un simple `alerte`,
# EXACTEMENT comme un avertissement ordinaire. Mesuré les 03 et 04/09/2026 sur
# une Debian 13 neuve : le vhost s'installe sans s'activer, et tant qu'il ne
# l'est pas, l'URL d'entrée (Q-36) et la borne de corps du chemin mandaté
# (Q-44) ne sont éprouvées À AUCUN MOMENT — puis le script imprimait quand
# même « Installation terminée » et rendait 0. Un exploitant qui écrit
# `install.sh && echo OK` concluait au succès sur un contrôle qui n'avait
# jamais eu lieu.
#
# `reserve()` NE FAIT PAS ÉCHOUER — ce n'est pas un durcissement, c'est un
# compte. Elle empile une ligne, que le bloc « bilan » (§11) relit à la toute
# fin pour décider du MOT DE LA FIN et du CODE DE SORTIE : « installation
# terminée » et l'exit 0 sont désormais réservés au cas où chaque contrôle a
# soit réussi, soit échoué bruyamment — jamais au cas où l'un d'eux n'a
# simplement pas pu être posé.
RESERVES=()
reserve() { printf '\033[1;36m N/J\033[0m %s\n' "$*" >&2; RESERVES+=("$*"); }

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
  --verifier-publication         NE MODIFIE RIEN : compare ce que la racine web
                                 SERT à ce que le dépôt porte, et rend 5 si un
                                 fichier diverge (constat Q-103)
  --desinstaller                 retire le LOGICIEL — unités systemd, code, frontend
                                 publié, vhost — et CONSERVE les données : base,
                                 pièces jointes, configuration. Une réinstallation
                                 par-dessus les retrouve
  --avec-les-donnees             avec --desinstaller : détruit AUSSI la base, les rôles,
                                 les pièces jointes, la configuration et les secrets.
                                 IRRÉVERSIBLE, et exige --export-verifie
  --export-verifie=<fichier>     l'export « grc-backup » qui subsistera de ce que l'on
                                 détruit. Le fichier est OUVERT et son enveloppe
                                 vérifiée — le journal d'audit a une rétention de trois
                                 ans et fait preuve en audit. Pour assumer la perte :
                                 --export-verifie=AUCUN-JE-CONFIRME-LA-PERTE
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

Codes de sortie (constat Q-75 : un « 0 » n'a plus qu'un seul sens) :
  0  installation terminée ; tout ce qui a pu être contrôlé l'a été, et est conforme
  1  ÉCHEC — un contrôle a été joué et il est NON CONFORME (voir « ERR » ci-dessus)
  2  configuration incomplète — des valeurs restent à renseigner avant de continuer
  3  installation terminée AVEC RÉSERVES — un ou plusieurs contrôles n'ONT PAS PU être
     joués (voir « N/J » ci-dessus, récapitulés en fin de sortie) : ce n'est PAS un feu
     vert, à corriger puis à relancer
FIN
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --maj)                          MAJ_SEULE=1; shift ;;
    --seulement-base)               SEULEMENT_BASE=1; shift ;;
    --reprendre-propriete)          REPRENDRE_PROPRIETE=1; shift ;;
    --reinitialiser-mots-de-passe)  REINITIALISER_MDP=1; shift ;;
    --verifier-publication)         VERIFIER_PUBLICATION=1; shift ;;
    --desinstaller)                 DESINSTALLER=1; shift ;;
    --avec-les-donnees)             AVEC_LES_DONNEES=1; shift ;;
    --export-verifie=*)             EXPORT_VERIFIE="${1#*=}"; shift ;;
    --aide|-h|--help)               aide; exit 0 ;;
    *) echec "Option inconnue : $1 (voir --aide)." ;;
  esac
done

[[ $EUID -eq 0 ]] || echec "À lancer en root."

# =============================================================================
#  --verifier-publication — ce qui est SERVI, comparé à ce que le dépôt porte
# =============================================================================
#
# ⚠️ **Constat Q-103 : le dépôt était vert pendant que la machine fuyait.**
# Un correctif de sécurité — le droit d'export contourné, constat Q-89 — a été
# commité, éprouvé, mesuré vert au banc, et **jamais publié** : la racine web
# servait encore l'ancien fichier, 73 200 octets contre 74 250, zéro occurrence
# de la garde contre deux. Un Chromium réel téléchargeait toujours le document
# confidentiel. Cause : un redéploiement du **serveur** seul (`rsync dist/` puis
# `systemctl restart`), sans republier le **frontend**, qui ne se publie que par
# ce script.
#
# Ce mode existe pour que la question « ce qui tourne est-il ce que je crois ? »
# ait une réponse **en une commande, sans rien republier** — donc sans risque, et
# donc jouable à tout moment, y compris quand on n'ose pas relancer une
# installation. C'est la variante déployée du constat Q-52 : *un banc vert sur
# l'arbre ne dit rien du commit*, et *un commit vert ne dit rien de la machine*.
#
# Il compare le CONTENU, pas les dates ni les tailles : un fichier réécrit avec
# le même nombre d'octets est le cas qu'on veut attraper.
if [[ $VERIFIER_PUBLICATION -eq 1 ]]; then
  info "Publication — ce qui est servi, comparé au dépôt"
  [[ -d "$RACINE/frontend" ]] || echec "Aucune racine web en $RACINE/frontend : rien n'est publié ici."

  TYPES="html|js|css|svg|png|ico|jpg|jpeg|gif|webp|woff|woff2|webmanifest"
  DIVERGENTS=(); ABSENTS=(); INTRUS=(); COMPARES=0

  while IFS= read -r source; do
    relatif="${source#"$DEPOT/cyber-gouvernance_V4/"}"
    publie="$RACINE/frontend/$relatif"
    if [[ ! -f "$publie" ]]; then ABSENTS+=("$relatif"); continue; fi
    COMPARES=$((COMPARES+1))
    cmp -s "$source" "$publie" || DIVERGENTS+=("$relatif")
  done < <(find "$DEPOT/cyber-gouvernance_V4" -type f | grep -Ei "\\.($TYPES)$")

  while IFS= read -r publie; do
    relatif="${publie#"$RACINE/frontend/"}"
    [[ -f "$DEPOT/cyber-gouvernance_V4/$relatif" ]] || INTRUS+=("$relatif")
  done < <(find "$RACINE/frontend" -type f)

  # Un contrôle qui ne compare rien passerait au vert en n'éprouvant rien : c'est
  # ce que ce dépôt appelle un décor (constat Q-37).
  [[ $COMPARES -ge 20 ]] || echec "Seuls $COMPARES fichier(s) comparés : ce contrôle ne mord plus.
      Soit la racine web n'est pas celle qu'on croit, soit la découverte est cassée."

  # `index.html` porte un jeton de version injecté à la publication : il DIFFÈRE
  # du dépôt par construction, et le signaler serait un faux positif permanent —
  # dit ici plutôt que filtré en silence.
  RESTANTS=(); for f in "${DIVERGENTS[@]:-}"; do [[ -z "$f" || "$f" == "index.html" ]] || RESTANTS+=("$f"); done

  ECART=0
  if [[ ${#RESTANTS[@]} -gt 0 ]]; then
    ECART=1
    alerte "${#RESTANTS[@]} fichier(s) SERVIS diffèrent du dépôt :"
    for f in "${RESTANTS[@]}"; do alerte "    $f"; done
  fi
  if [[ ${#ABSENTS[@]} -gt 0 ]]; then
    ECART=1
    alerte "${#ABSENTS[@]} fichier(s) du dépôt ne sont PAS publiés :"
    for f in "${ABSENTS[@]}"; do alerte "    $f"; done
  fi
  if [[ ${#INTRUS[@]} -gt 0 ]]; then
    ECART=1
    alerte "${#INTRUS[@]} fichier(s) servis N'EXISTENT PAS au dépôt :"
    for f in "${INTRUS[@]}"; do alerte "    $f"; done
  fi

  if [[ $ECART -eq 1 ]]; then
    alerte "La machine ne sert pas ce que le dépôt porte. Republiez : bash deploy/install.sh --maj"
    exit 5
  fi
  succes "publication conforme : $COMPARES fichier(s) servis identiques au dépôt"
  exit 0
fi

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

# =============================================================================
#  --desinstaller — retirer le produit, et savoir ce qu'on détruit
# =============================================================================
#
# ⚠️ **CE MODE N'EXISTAIT PAS**, et son absence était un manque : un produit
# installé chez un client doit savoir s'en aller. Sans procédure, un exploitant
# improvise — il `rm -rf` un répertoire, laisse trois unités systemd qui
# redémarrent en boucle, une base de dix gigaoctets que personne ne réclame, et
# des secrets en clair dans `/etc`.
#
# ── LA DÉCISION QUI STRUCTURE TOUT : deux gestes, pas un ─────────────────────
#
# **Retirer le logiciel** et **détruire les données** ne sont pas la même
# opération, et les confondre est ce qui rend une désinstallation dangereuse.
# Par défaut, ce mode retire le LOGICIEL et **ne touche à rien de ce qui porte
# du contenu** : ni la base, ni les pièces jointes, ni la configuration. Le
# client peut réinstaller par-dessus et retrouver son produit.
#
# La destruction des données demande `--avec-les-donnees`, et elle demande
# davantage — voir ci-dessous.
#
# ── POURQUOI LE JOURNAL D'AUDIT INTERDIT LA DESTRUCTION DÉSINVOLTE ───────────
#
# Le journal a une **rétention de trois ans** (`PLAN_SERVEUR` §1.7) et il fait
# **preuve en audit ISO 27001**. Un `drop database` détruit une pièce que le
# client peut être légalement tenu de conserver, et qu'aucune sauvegarde
# n'accompagne si personne n'y a pensé. Ce script refuse donc de détruire sans
# qu'un export EXISTE — et il ne se contente pas d'une case cochée : il ouvre le
# fichier qu'on lui nomme et vérifie que c'est bien une enveloppe du produit.
#
# C'est le même raisonnement que `POST /api/cycle/sortie-filiale`, qui rend
# l'export AVANT de faire basculer le statut : une opération irréversible
# s'accompagne de ce qui subsiste d'elle.
#
# ── CE QUE CE SCRIPT NE PEUT PAS RETIRER, ET QU'IL FAUT DIRE ─────────────────
#
# Les **groupes `GRC-*` de l'Active Directory du client** ne sont pas sur cette
# machine. Le produit les a fait créer (`deploy/groupes-ad.sh`), il ne peut pas
# les défaire — un compte de service qui pourrait supprimer des groupes
# d'annuaire serait un compte bien trop puissant pour ce qu'il a à faire. Ils
# sont donc **listés** en fin de parcours, pour que l'administrateur de
# l'annuaire les retire lui-même. Les taire laisserait vingt-trois groupes
# orphelins dans un AD d'entreprise, et personne ne saurait plus pourquoi.
# =============================================================================

# >>> banc: desinstaller <<<
desinstaller() {
  local avec_donnees="$1" export_verifie="$2"

  # ── 1. Ce qui va être fait, DIT AVANT DE LE FAIRE ─────────────────────────
  #
  # Pas de question interactive : ce script s'exécute aussi sans terminal, et
  # une invite qu'on ne voit pas devient un `yes |` dans un script d'exploitant.
  # Le consentement se donne par les OPTIONS, qui sont explicites et tracées
  # dans l'historique du shell.
  info "Désinstallation de Cyber GRC"
  alerte "Le LOGICIEL va être retiré : unités systemd, code, frontend publié, vhost."
  if [[ "$avec_donnees" -eq 1 ]]; then
    alerte "ET LES DONNÉES : base « $BASE_NOM », rôles PostgreSQL, pièces jointes,"
    alerte "configuration et secrets. C'est IRRÉVERSIBLE."
  else
    succes "les DONNÉES sont conservées : base, pièces jointes, configuration, secrets"
    alerte "Pour les détruire aussi : --desinstaller --avec-les-donnees --export-verifie=<fichier>"
  fi

  # ── 2. L'export, vérifié plutôt que promis ────────────────────────────────
  if [[ "$avec_donnees" -eq 1 ]]; then
    [[ -n "$export_verifie" ]] || echec "Détruire les données exige --export-verifie=<fichier>.
      Le journal d'audit a une rétention de TROIS ANS et fait preuve en audit ISO 27001 :
      il ne se détruit pas sans que ce qu'il portait subsiste quelque part.
      Produisez l'export par l'application (« Exporter » — droit GRC-EXPORT), puis
      nommez-le ici. Si vous assumez la perte en connaissance de cause :
        --export-verifie=AUCUN-JE-CONFIRME-LA-PERTE"
    if [[ "$export_verifie" == "AUCUN-JE-CONFIRME-LA-PERTE" ]]; then
      alerte "AUCUN EXPORT n'a été fourni, et la perte est assumée explicitement."
    else
      [[ -r "$export_verifie" ]] || echec "Export illisible : $export_verifie"
      # ⚠️ On OUVRE le fichier. Un contrôle d'existence accepterait un fichier
      #    vide créé pour passer le contrôle — ce serait une case à cocher, pas
      #    une garantie. On cherche la signature de l'enveloppe du produit.
      grep -q '"format"[[:space:]]*:[[:space:]]*"grc-backup"' "$export_verifie" \
        || echec "« $export_verifie » n'est pas un export du produit : l'enveloppe
      « grc-backup » (PLAN_SERVEUR §2.6) ne s'y trouve pas. Un fichier qui existe n'est pas
      un export ; c'est ce que ce contrôle vérifie."
      succes "export vérifié : $export_verifie ($(du -h "$export_verifie" | cut -f1))"
    fi
  fi

  # ── 3. Arrêter AVANT de retirer ───────────────────────────────────────────
  #
  # L'ordre n'est pas indifférent : un service encore vivant pendant qu'on retire
  # sa configuration écrit dans le vide, et `Restart=on-failure` le relance en
  # boucle sur une arborescence à moitié effacée.
  info "Arrêt des services"
  for unite in cyber-grc-notifications.timer cyber-grc-reanalyse.timer \
               cyber-grc-notifications.service cyber-grc-reanalyse.service cyber-grc; do
    systemctl disable --now "$unite" >/dev/null 2>&1 || true
  done
  succes "unités arrêtées et désactivées"

  info "Retrait des unités systemd"
  rm -f /etc/systemd/system/cyber-grc.service \
        /etc/systemd/system/cyber-grc-reanalyse.service \
        /etc/systemd/system/cyber-grc-reanalyse.timer \
        /etc/systemd/system/cyber-grc-notifications.service \
        /etc/systemd/system/cyber-grc-notifications.timer
  systemctl daemon-reload
  succes "unités retirées"

  # ── 4. Le frontal ─────────────────────────────────────────────────────────
  info "Frontal Apache"
  if [[ -e /etc/apache2/sites-enabled/cyber-grc.conf ]]; then
    a2dissite cyber-grc >/dev/null 2>&1 || true
  fi
  rm -f /etc/apache2/sites-available/cyber-grc.conf
  if apache2ctl configtest >/dev/null 2>&1; then
    systemctl reload apache2 >/dev/null 2>&1 || true
    succes "vhost retiré, Apache rechargé"
  else
    # ⚠️ On ne recharge PAS un Apache qui refuse sa configuration : on couperait
    #    les autres sites de la machine en croyant faire le ménage.
    reserve "Apache refuse sa configuration APRÈS le retrait du vhost : il n'a PAS été"
    alerte "rechargé, et l'ancienne configuration reste active en mémoire. La cause est"
    alerte "ailleurs que dans ce produit — vérifiez : apache2ctl configtest"
  fi

  # ── 5. Le code et le frontend publié ──────────────────────────────────────
  info "Code et frontend"
  rm -rf "$RACINE"
  succes "$RACINE retiré (code, node_modules, frontend publié)"

  # ── 6. Les données, seulement si on l'a demandé ───────────────────────────
  if [[ "$avec_donnees" -eq 1 ]]; then
    info "Données"
    # La base d'abord : tant qu'elle existe, les rôles ne se suppriment pas.
    su - "$SUPERUTILISATEUR" -c "psql -v ON_ERROR_STOP=1 -q" <<SQL >/dev/null 2>&1 || \
      alerte "La base ou les rôles n'ont pas pu être supprimés — à faire à la main."
drop database if exists $BASE_NOM;
drop role if exists $ROLE_APP;
drop role if exists $ROLE_LECTURE;
drop role if exists $ROLE_PROPRIETAIRE;
SQL
    succes "base « $BASE_NOM » et rôles supprimés"

    rm -rf "$DONNEES" "$JOURNAUX" "$CONFIG"
    succes "pièces jointes, journaux, configuration et secrets supprimés"
    # ⚠️ Les CLICHÉS de $SAUVEGARDES ne sont pas touchés, et c'est délibéré :
    #    ce sont les seuls exemplaires de ce qu'on vient de détruire. Les
    #    effacer dans le même geste ferait de « désinstaller » une perte
    #    définitive et silencieuse. L'exploitant les retire quand il a décidé.
    alerte "Les clichés de $SAUVEGARDES sont CONSERVÉS — ce sont les seuls exemplaires"
    alerte "de ce qui vient d'être détruit. À vous de décider quand les retirer."

    if id -u "$UTILISATEUR" >/dev/null 2>&1; then
      userdel "$UTILISATEUR" >/dev/null 2>&1 || true
      succes "compte système « $UTILISATEUR » supprimé"
    fi
  else
    succes "base « $BASE_NOM », pièces jointes et configuration CONSERVÉES"
    alerte "Une réinstallation par-dessus retrouvera les données et la configuration."
  fi

  # ── 7. Ce que ce script NE PEUT PAS retirer ───────────────────────────────
  info "Ce qui reste, hors de cette machine"
  local prefixe; prefixe="$(lire_variable LDAP_PREFIXE_GROUPES 2>/dev/null || true)"
  alerte "Les groupes « ${prefixe:-GRC-}* » de l'Active Directory du client ne sont PAS"
  alerte "retirés : ils ne sont pas sur cette machine, et le compte de service du produit"
  alerte "n'a pas — délibérément — le droit de supprimer des groupes d'annuaire."
  alerte "Faites-les retirer par l'administrateur de l'annuaire. La liste s'engendre :"
  alerte "  bash deploy/groupes-ad.sh --csv     (depuis une copie du dépôt)"
  if [[ "$avec_donnees" -eq 0 ]]; then
    alerte "⚠️ Ne les retirez PAS si vous comptez réinstaller : les droits en dépendent."
  fi

  succes "Désinstallation terminée."
}
# <<< banc: desinstaller >>>

info "Configuration"

# Reprise du nom historique : /etc/cyber-grc/serveur.env n'est lu ni par
# `src/config/index.ts` ni par le message d'erreur du serveur, qui désignent tous
# deux /etc/cyber-grc/env. Un fichier édité mais jamais lu est un piège.
if [[ ! -f "$FICHIER_CONFIG" && -f "$ANCIEN_FICHIER_CONFIG" ]]; then
  mv -f "$ANCIEN_FICHIER_CONFIG" "$FICHIER_CONFIG"
  alerte "Configuration renommée : $ANCIEN_FICHIER_CONFIG → $FICHIER_CONFIG"
fi

PREMIERE_INSTALLATION=0
# ⚠️ On ne FABRIQUE pas une configuration pour la détruire aussitôt : en mode
#    désinstallation, son absence signifie simplement qu'il n'y a rien à lire, et
#    les valeurs par défaut suffisent à nommer la base et les rôles.
if [[ ! -f "$FICHIER_CONFIG" && $DESINSTALLER -eq 0 ]]; then
  install -m 0600 "$SOURCE/.env.example" "$FICHIER_CONFIG"
  PREMIERE_INSTALLATION=1
fi
appliquer_droits_config "$FICHIER_CONFIG"

# La DÉCLARATION DES FILIALES (db/CONVENTIONS.md §27). Fichier d'exploitation,
# écrit par le client, hors de la base : c'est LUI la source dont la liste des
# groupes Active Directory est engendrée (deploy/groupes-ad.sh), et lui que le
# lot L4 consommera pour semer la table `filiales`.
#
# Le modèle est posé une fois et JAMAIS écrasé : le réécrire à chaque mise à jour
# effacerait la déclaration réelle du client, c'est-à-dire son périmètre.
FICHIER_FILIALES="$CONFIG/filiales.conf"
if [[ ! -f "$FICHIER_FILIALES" ]]; then
  install -m 0640 "$SOURCE/deploy/filiales.conf.exemple" "$FICHIER_FILIALES"
  appliquer_droits_config "$FICHIER_FILIALES"
  alerte "Déclaration des filiales créée depuis le modèle : $FICHIER_FILIALES"
  alerte "Elle ne contient AUCUNE filiale : déclarez-les, puis engendrez les groupes AD."
else
  appliquer_droits_config "$FICHIER_FILIALES"
fi

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

# ── LA DÉSINSTALLATION S'ARRÊTE ICI ──────────────────────────────────────────
# Elle a besoin du nom de la base et des rôles — résolus juste au-dessus — et de
# rien d'autre. Tout ce qui suit installe ; il n'y a pas à le traverser.
if [[ $DESINSTALLER -eq 1 ]]; then
  desinstaller "$AVEC_LES_DONNEES" "$EXPORT_VERIFIE"
  exit 0
fi
[[ $AVEC_LES_DONNEES -eq 0 && -z "$EXPORT_VERIFIE" ]] || \
  echec "--avec-les-donnees et --export-verifie ne valent qu'avec --desinstaller.
      Les accepter en silence pendant une INSTALLATION donnerait à croire qu'ils ont
      agi — c'est la forme la plus discrète du défaut (voir --aide)." 

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
# >>> banc: sauvegarde <<<
# ══ UNE SAUVEGARDE AVANT TOUTE MIGRATION ════════════════════════════════════
#
# ⚠️ **Les migrations vont dans un seul sens.** Chaque fichier porte un bloc
# « ANNULATION (documentaire) » — un COMMENTAIRE, que rien n'exécute et que
# personne ne garantit. Le seul retour arrière réel est la restauration d'un
# cliché, et jusqu'ici le script n'en prenait aucun : il créait
# `/var/backups/cyber-grc` et n'y écrivait jamais rien. Un répertoire de
# sauvegarde vide est pire qu'absent — il donne à croire qu'il y en a une.
#
# ── Trois décisions, et chacune se paierait dans l'autre sens ────────────────
#
# **1. Seulement s'il y a quelque chose à appliquer.** `migrate.mjs --verifier`
# n'applique rien et sort en **10** quand des migrations sont en attente. Sans
# ce test, chaque `--maj` — y compris les dizaines qui ne changent que du code —
# déposerait un cliché de plus, et le répertoire deviendrait un bruit qu'on purge
# sans regarder. Ce qu'on veut conserver, c'est l'état d'AVANT un changement de
# schéma, pas une collection.
#
# **2. Un échec du cliché ARRÊTE l'installation.** C'est le point qui compte :
# migrer sans retour possible est exactement ce que ce bloc existe pour empêcher.
# Continuer « puisque la migration, elle, marchera » serait reconduire le défaut
# sous une autre forme.
#
# **3. Le cliché est complet et lisible par root seul.** Il porte le journal
# d'audit, les pièces jointes référencées, les identités — `0600`, propriétaire
# `root`, dans un répertoire déjà en `0700`. ⚠️ Il ne contient PAS les fichiers
# de pièces jointes eux-mêmes, qui vivent sous `/var/lib/cyber-grc` : une
# restauration de base seule rend des documents introuvables (`README.md` §6).
if [[ $SEULEMENT_BASE -eq 0 || $SEULEMENT_BASE -eq 1 ]]; then
  MIGRATIONS_EN_ATTENTE=0
  BASE_HOTE="$BASE_HOTE" BASE_PORT="$BASE_PORT" BASE_NOM="$BASE_NOM" \
  BASE_UTILISATEUR="$ROLE_APP" \
  BASE_UTILISATEUR_PROPRIETAIRE="$ROLE_PROPRIETAIRE" \
  BASE_MOT_DE_PASSE_PROPRIETAIRE="$(lire_variable BASE_MOT_DE_PASSE_PROPRIETAIRE)" \
  BASE_SSL="$(lire_variable BASE_SSL)" BASE_SSL_CA="$(lire_variable BASE_SSL_CA)" \
    node "$RACINE_MIGRATIONS/db/migrate.mjs" --verifier >/dev/null 2>&1 \
    || MIGRATIONS_EN_ATTENTE=$?

  if [[ "$MIGRATIONS_EN_ATTENTE" -eq 10 ]]; then
    CLICHE="$SAUVEGARDES/avant-migration-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
    info "Migrations en attente : cliché de la base avant application"
    if ! PGPASSWORD="$(lire_variable BASE_MOT_DE_PASSE_PROPRIETAIRE)" \
         pg_dump --host="$BASE_HOTE" --port="$BASE_PORT" \
                 --username="$ROLE_PROPRIETAIRE" --dbname="$BASE_NOM" \
                 --no-password --format=plain --encoding=UTF8 2>/dev/null \
         | gzip -9 > "$CLICHE"; then
      rm -f "$CLICHE"
      echec "Le cliché de sauvegarde a ÉCHOUÉ, et l'installation s'arrête ici.
      Des migrations sont en attente : les appliquer sans cliché reviendrait à changer le
      schéma SANS retour arrière — les blocs « ANNULATION » des migrations sont des
      commentaires, que rien n'exécute.
      Vérifiez que « pg_dump » est installé (paquet postgresql-client-17) et que
      $SAUVEGARDES est accessible en écriture, puis relancez."
    fi
    chmod 0600 "$CLICHE"
    succes "cliché pris : $CLICHE ($(du -h "$CLICHE" | cut -f1))"

    # Rétention : les cinq derniers. Assez pour remonter plusieurs mises à jour,
    # assez peu pour qu'un disque plein ne devienne pas le prochain incident.
    # `ls -t` puis `tail -n +6` : on garde les cinq plus récents, on retire le reste.
    while IFS= read -r ancien; do
      [[ -n "$ancien" ]] && rm -f "$SAUVEGARDES/$ancien"
    done < <(ls -t "$SAUVEGARDES" 2>/dev/null | grep '^avant-migration-' | tail -n +6)
  fi
fi

# <<< banc: sauvegarde >>>

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

# =============================================================================
#  8 bis. Groupes AD — la table qui décide de qui a accès (constat Q-78)
# =============================================================================
#
# ⚠️ **Sans ce geste, une installation « réussie » ne sert à personne.** La table
# `groupes_ad` dit quel groupe de l'annuaire accorde quel profil sur quel
# périmètre. Vide, elle n'accorde rien : mesuré le 03/09/2026 sur une
# installation réelle, une connexion au compte de secours AVEC LE BON MOT DE
# PASSE rendait `403 droit_insuffisant`. La fonction qui la remplit était écrite,
# éprouvée, et **appelée par les essais et par personne d'autre**.
#
# Pourquoi ici plutôt qu'au démarrage du service : la synchronisation ne doit
# jamais être un effet de bord invisible — elle écraserait ce qu'un exploitant a
# ajusté. Elle est donc une commande explicite, idempotente, rejouable après
# chaque acquisition de filiale (`filiales.conf`, §27).
#
# Et l'échec est un ÉCHEC : une installation dont personne ne peut se servir
# n'est pas une installation réussie. C'est la moitié du constat Q-75 que ce
# script peut fermer seul.
info "Groupes AD"
CODE_SYNC=0
BASE_HOTE="$BASE_HOTE" \
BASE_PORT="$BASE_PORT" \
BASE_NOM="$BASE_NOM" \
BASE_UTILISATEUR_PROPRIETAIRE="$ROLE_PROPRIETAIRE" \
BASE_MOT_DE_PASSE_PROPRIETAIRE="$(lire_variable BASE_MOT_DE_PASSE_PROPRIETAIRE)" \
BASE_SSL="$(lire_variable BASE_SSL)" \
BASE_SSL_CA="$(lire_variable BASE_SSL_CA)" \
LDAP_PREFIXE_GROUPES="$(lire_variable LDAP_PREFIXE_GROUPES)" \
  node "$RACINE/backend/db/synchroniser-groupes-ad.mjs" || CODE_SYNC=$?
if [[ $CODE_SYNC -ne 0 ]]; then
  echec "La table « groupes_ad » n'a pas pu être alignée (code $CODE_SYNC, constat Q-78).
      Tant qu'elle est vide, AUCUN compte n'obtient d'accès — pas même le compte de
      secours : la connexion réussit et l'application répond « aucun accès à cette
      application ne vous est ouvert ». Les lignes ci-dessus disent la cause."
fi
SORTIE_SYNC="$(sql_admin_base <<SQL
select count(*) from "groupes_ad";
SQL
)"
SORTIE_SYNC="$(printf '%s' "$SORTIE_SYNC" | tr -d '[:space:]')"
[[ "${SORTIE_SYNC:-0}" -gt 0 ]] || echec "« groupes_ad » est VIDE après synchronisation.
      Le contrôle envoie et constate, il ne se fie pas au code de sortie du script
      précédent : c'est la leçon du 8ᵉ passage de la porte S2 — un contrôle qui
      compare deux déclarations ne contrôle rien."
succes "groupes_ad : $SORTIE_SYNC groupe(s) — l'annuaire peut accorder des accès"

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
  reserve "$GARDE_FOU_SCHEMA() absente : les contrôles automatiques du schéma n'ont pas pu"
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

# >>> banc: ldaps <<<
# ══ L'ANNUAIRE : CE QUE L'EXPLOITANT DOIT POSER, ET CE QUI ÉCHOUE SANS ══════
#
# Le §5 de ce script exige déjà LDAP_URL, LDAP_BASE_RECHERCHE, LDAP_DN_SERVICE et
# LDAP_MOT_DE_PASSE_SERVICE — c'est-à-dire qu'il vérifie que quatre variables ne
# sont pas VIDES. C'est le contrôle le plus faible qui existe : il ne dit rien de
# la seule chose qui décide, savoir si le service peut réellement PARLER à
# l'annuaire. Trois choses le lui interdisent, et aucune des trois ne se voyait :
#
#   1. **LDAP_CA n'était contrôlée nulle part.** Elle désigne l'autorité de la PKI
#      interne du client, qui n'est PAS dans le magasin d'autorités du système
#      (`PLAN_SERVEUR` §0.3). Sans elle, la vérification du certificat du
#      contrôleur de domaine échoue — et `src/config/index.ts` se contente d'un
#      AVERTISSEMENT, parce qu'il ne peut pas savoir si le magasin la contient.
#      Ici, on peut : on demande à OpenSSL.
#   2. **Le fichier doit être lisible par LE COMPTE DE SERVICE**, pas par root.
#      Un `install -m 0600 ca.pem /etc/cyber-grc/` fait par un exploitant
#      consciencieux donne un fichier que root lit parfaitement et que
#      `cyber-grc` ne lit pas. `src/config/index.ts` teste la lisibilité par le
#      processus courant — au démarrage c'est le bon compte, mais l'erreur
#      n'apparaît alors qu'au redémarrage, sans que l'installation ait bronché.
#   3. **L'unité systemd refuse tout le trafic sortant** (`IPAddressDeny=any`)
#      et n'autorise que la boucle locale. Le sous-réseau des contrôleurs de
#      domaine est une ligne COMMENTÉE, à décommenter à l'installation. Tant
#      qu'elle l'est, l'installation se termine par « Installation terminée » et
#      **aucune authentification n'est possible** — c'est exactement la figure du
#      constat Q-65, où l'unité codait un chemin de Node que rien ne confrontait
#      à la machine.
#
# Ce bloc confronte donc la configuration au RÉEL : il résout, il se connecte, il
# vérifie une chaîne de certification, et il compare une liste d'adresses à ce que
# l'unité autorise. Ce qu'il ne peut pas faire est dit à l'endroit où il s'arrête.
# ══ COUVERTURE D'UNE LISTE BLANCHE « IPAddressAllow » ═══════════════════════
#
# ⚠️ DEUX APPELANTS, ET C'EST POURQUOI CES FONCTIONS VIVENT ICI plutôt que dans
# le bloc de l'annuaire : l'unité applicative doit joindre le contrôleur de
# domaine, l'unité des NOTIFICATIONS doit joindre le relais SMTP — et la seconde
# ne dépend pas de la première. Tant que ces fonctions étaient définies dans le
# bloc « AUTH_LDAP_ACTIF », le contrôle du relais aurait disparu chez un client
# qui n'active pas l'annuaire (constat Q-199).
# Couverture IPv4 exacte ; IPv6 déclarée indécidable plutôt que devinée. Un
# contrôle qui répondrait « couvert » sans savoir serait pire que pas de
# contrôle : c'est celui-là qu'on croirait.
entier_ipv4() {
  local a b c d; IFS=. read -r a b c d <<< "$1"
  printf '%s' "$(( (a << 24) | (b << 16) | (c << 8) | d ))"
}
couverte_par() {   # <adresse> <entrée IPAddressAllow> -> 0 si couverte
  local adresse="$1" regle="$2" prefixe longueur masque
  case "$regle" in
    any) return 0 ;;
    localhost) [[ "$adresse" == 127.* || "$adresse" == "::1" ]] && return 0 || return 1 ;;
    link-local|multicast) return 1 ;;
  esac
  [[ "$adresse" == *:* || "$regle" == *:* ]] && return 2      # IPv6 : indécidable ici
  prefixe="${regle%%/*}"
  if [[ "$regle" == */* ]]; then longueur="${regle##*/}"; else longueur=32; fi
  [[ "$prefixe" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 2
  [[ "$longueur" =~ ^[0-9]+$ ]] && [[ "$longueur" -le 32 ]] || return 2
  if [[ "$longueur" -eq 0 ]]; then return 0; fi
  masque=$(( 0xFFFFFFFF << (32 - longueur) & 0xFFFFFFFF ))
  [[ $(( $(entier_ipv4 "$adresse") & masque )) -eq $(( $(entier_ipv4 "$prefixe") & masque )) ]]
}

if [[ "$(lire_variable AUTH_LDAP_ACTIF)" == "non" ]]; then
  alerte "AUTH_LDAP_ACTIF = non : l'authentification par l'annuaire est DÉSACTIVÉE."
  alerte "Seul le compte de secours (AUTH_COMPTE_SECOURS_*) pourra ouvrir une session."
else
  LDAP_URL="$(lire_variable LDAP_URL)"
  LDAP_CA="$(lire_variable LDAP_CA)"
  ENVIRONNEMENT="$(lire_variable NODE_ENV)"; ENVIRONNEMENT="${ENVIRONNEMENT:-production}"

  # ---- Le transport ---------------------------------------------------------
  # `src/config/index.ts` REFUSE ldap:// en production. Le dire ici, c'est le dire
  # avant le redémarrage du service plutôt qu'après, dans un journal.
  case "$LDAP_URL" in
    ldaps://*) succes "LDAP_URL : liaison chiffrée ($LDAP_URL)" ;;
    ldap://*)
      if [[ "$ENVIRONNEMENT" == "production" ]]; then
        echec "LDAP_URL = « $LDAP_URL » : liaison en CLAIR refusée en production. Les
      identifiants du compte de service et ceux de chaque utilisateur traverseraient le
      réseau en clair. Le serveur refusera de démarrer (src/config/index.ts) : corrigez
      $FICHIER_CONFIG en ldaps://<contrôleur>:636."
      fi
      alerte "LDAP_URL : liaison LDAP en clair, tolérée hors production uniquement." ;;
    *) echec "LDAP_URL = « $LDAP_URL » : ni ldaps:// ni ldap://. Voir backend/.env.example §5." ;;
  esac

  # Hôte et port, extraits de l'URL. Le port par défaut de LDAPS est 636, celui
  # de LDAP 389 : les deux sont écrits ici parce qu'une URL sans port est valide.
  LDAP_RESTE="${LDAP_URL#*://}"; LDAP_RESTE="${LDAP_RESTE%%/*}"
  LDAP_HOTE="${LDAP_RESTE%%:*}"
  if [[ "$LDAP_RESTE" == *:* ]]; then LDAP_PORT="${LDAP_RESTE##*:}"; else
    if [[ "$LDAP_URL" == ldaps://* ]]; then LDAP_PORT=636; else LDAP_PORT=389; fi
  fi

  # ---- L'autorité de certification interne ---------------------------------
  if [[ -z "$LDAP_CA" ]]; then
    alerte "LDAP_CA n'est pas renseignée. La validation du certificat du contrôleur de"
    alerte "domaine reposera sur le magasin d'autorités du SYSTÈME, qui ne contient pas la"
    alerte "PKI interne du groupe (PLAN_SERVEUR §0.3) : toute connexion LDAPS échouera."
    alerte "Déposez la chaîne de l'AC interne au format PEM, puis renseignez LDAP_CA :"
    alerte "  install -o root -g $UTILISATEUR -m 0640 ca-interne.pem $CONFIG/ca-active-directory.pem"
  else
    [[ -f "$LDAP_CA" ]] || echec "LDAP_CA : « $LDAP_CA » n'existe pas. C'est l'autorité de la PKI
      interne, au format PEM ; sans elle aucune liaison LDAPS ne s'établira."
    # ⚠️ LISIBLE PAR LE COMPTE DE SERVICE, pas par root : c'est TOUTE la
    # différence, et c'est celle qu'on ne voit qu'au redémarrage suivant.
    if ! su "$UTILISATEUR" -s /bin/sh -c "test -r '$LDAP_CA'" 2>/dev/null; then
      alerte "droits actuels : $(stat -c '%U:%G %a' "$LDAP_CA" 2>/dev/null || echo '?')"
      echec "LDAP_CA (« $LDAP_CA ») n'est PAS lisible par le compte de service « $UTILISATEUR ».
      root la lit, le service non : l'installation se terminerait normalement et
      l'authentification échouerait au premier utilisateur. Corriger :
        chown root:$UTILISATEUR '$LDAP_CA' && chmod 0640 '$LDAP_CA'"
    fi
    openssl x509 -in "$LDAP_CA" -noout >/dev/null 2>&1 \
      || echec "LDAP_CA (« $LDAP_CA ») n'est pas un certificat PEM lisible par OpenSSL.
      Attendu : la chaîne de l'autorité interne, au format PEM (« -----BEGIN CERTIFICATE----- »).
      Un fichier DER se convertit : openssl x509 -inform der -in ca.cer -out ca.pem"
    if ! openssl x509 -in "$LDAP_CA" -noout -checkend 0 >/dev/null 2>&1; then
      echec "LDAP_CA (« $LDAP_CA ») a EXPIRÉ le $(openssl x509 -in "$LDAP_CA" -noout -enddate 2>/dev/null | cut -d= -f2).
      Toute connexion LDAPS échouera. Demandez la chaîne à jour à l'équipe PKI du client."
    fi
    # Trente jours : le délai qu'il faut pour obtenir une chaîne renouvelée d'une
    # équipe PKI interne. Averti, pas refusé — la journée d'installation n'est pas
    # le moment de bloquer sur un certificat encore valide.
    if ! openssl x509 -in "$LDAP_CA" -noout -checkend 2592000 >/dev/null 2>&1; then
      alerte "LDAP_CA expire le $(openssl x509 -in "$LDAP_CA" -noout -enddate | cut -d= -f2) — moins de 30 jours."
      alerte "À son expiration, PLUS AUCUN utilisateur ne pourra se connecter."
    fi
    succes "LDAP_CA : PEM valide, lisible par $UTILISATEUR ($(openssl x509 -in "$LDAP_CA" -noout -subject | sed 's/^subject=//' | cut -c1-60))"
  fi

  # ---- Le contrôleur de domaine répond-il, et sa chaîne se vérifie-t-elle ? --
  #
  # C'est le seul contrôle qui prouve quelque chose : le reste ne fait que lire
  # des fichiers. `openssl s_client` est employé plutôt qu'un client LDAP parce
  # qu'aucun n'est installé — et parce que ce qui est en jeu ici est la CHAÎNE DE
  # CERTIFICATION, pas une liaison authentifiée. Le compte de service, lui, sera
  # éprouvé au premier utilisateur.
  #
  # `timeout` est indispensable : `openssl s_client` attend indéfiniment sur un
  # port filtré, et une installation qui se fige est pire qu'une qui refuse.
  if ! ADRESSES_LDAP="$(getent ahosts "$LDAP_HOTE" 2>/dev/null | awk '{print $1}' | sort -u)" \
     || [[ -z "$ADRESSES_LDAP" ]]; then
    ADRESSES_LDAP=""
    alerte "« $LDAP_HOTE » ne se résout pas depuis cette machine. Le service ne saura pas"
    alerte "joindre le contrôleur de domaine : vérifiez /etc/resolv.conf et le DNS de la VM."
  else
    succes "$LDAP_HOTE se résout en : $(printf '%s' "$ADRESSES_LDAP" | tr '\n' ' ')"
    SORTIE_TLS=""
    if [[ -n "$LDAP_CA" ]]; then
      SORTIE_TLS="$(timeout 15 openssl s_client -connect "$LDAP_HOTE:$LDAP_PORT" \
                      -servername "$LDAP_HOTE" -CAfile "$LDAP_CA" -verify_return_error \
                      -brief </dev/null 2>&1 || true)"
    else
      SORTIE_TLS="$(timeout 15 openssl s_client -connect "$LDAP_HOTE:$LDAP_PORT" \
                      -servername "$LDAP_HOTE" -verify_return_error \
                      -brief </dev/null 2>&1 || true)"
    fi
    if printf '%s' "$SORTIE_TLS" | grep -q 'Verification: OK'; then
      succes "LDAPS : $LDAP_HOTE:$LDAP_PORT répond, et sa chaîne se vérifie contre ${LDAP_CA:-le magasin du système}"
    elif printf '%s' "$SORTIE_TLS" | grep -qi 'verify error\|Verification error'; then
      while IFS= read -r l; do [[ -n "$l" ]] && alerte "openssl : $l"; done \
        <<< "$(printf '%s' "$SORTIE_TLS" | grep -i 'verif' | head -n3)"
      echec "Le certificat de $LDAP_HOTE:$LDAP_PORT NE SE VÉRIFIE PAS contre ${LDAP_CA:-le magasin
      du système}. Toute connexion d'utilisateur échouera, et le message côté service ne dira
      pas pourquoi. « unable to get local issuer certificate » signifie que LDAP_CA n'est pas
      l'autorité qui a émis ce certificat : demandez la CHAÎNE COMPLÈTE de la PKI interne
      (AC racine + AC intermédiaires) à l'équipe qui exploite l'ADCS du client."
    else
      reserve "$LDAP_HOTE:$LDAP_PORT n'a pas répondu en 15 s : la chaîne de certification LDAPS"
      alerte "n'a donc PAS été éprouvée (constat Q-75, même figure). Le port est-il filtré, ou"
      alerte "le contrôleur injoignable depuis cette VM ? Vérifier à la main :"
      alerte "  openssl s_client -connect $LDAP_HOTE:$LDAP_PORT -CAfile ${LDAP_CA:-<AC interne>} -brief"
    fi
  fi

  # ---- Ce que l'unité systemd autorise à sortir -----------------------------
  #
  # ⚠️ CE CONTRÔLE EST LA RAISON D'ÊTRE DE CE BLOC. `IPAddressDeny=any` +
  # `IPAddressAllow=localhost` est la configuration LIVRÉE, et elle interdit au
  # service de joindre le moindre contrôleur de domaine. C'est délibéré — « une
  # liste blanche vide se remarque, une liste blanche trop large ne se voit pas »,
  # dit l'unité — mais rien ne REMARQUAIT quoi que ce soit : l'installation
  # s'achevait sur « Installation terminée ».
  #
  # Le DNS compte autant que l'annuaire : un résolveur d'entreprise en 10.x est
  # refusé par la même règle, et la résolution du contrôleur échouerait DANS le
  # service alors qu'elle réussit ici, où l'installateur tourne hors du cgroup.
  #
  # La liste est lue de l'unité INSTALLÉE quand systemd sait la rendre, du fichier
  # livré sinon : c'est la même valeur, et l'on dit laquelle on a lue.
  UNITE_SOURCE="fichier $SOURCE/deploy/systemd/cyber-grc.service"
  AUTORISES="$(sed -n 's/^[[:space:]]*IPAddressAllow=[[:space:]]*//p' \
               "$SOURCE/deploy/systemd/cyber-grc.service" 2>/dev/null | tr ' ' '\n' | sed '/^$/d')"
  if VU="$(systemctl show -p IPAddressAllow --value cyber-grc 2>/dev/null)" && [[ -n "$VU" ]]; then
    AUTORISES="$(printf '%s' "$VU" | tr ' ' '\n' | sed '/^$/d')"
    UNITE_SOURCE="systemctl show (unité en vigueur)"
  fi


  # Les résolveurs comptent — mais PAS TOUJOURS, et la nuance décide de la
  # sévérité. Si LDAP_URL nomme un hôte, le service doit le résoudre : un
  # résolveur hors de la liste blanche rend l'annuaire injoignable, au même titre
  # que le contrôleur lui-même. Si LDAP_URL porte une adresse littérale, le DNS
  # n'entre pas dans le chemin d'authentification, et refuser l'installation pour
  # cela serait un faux positif — le genre de contrôle qu'on finit par contourner.
  # (Cas courant sous Debian : le résolveur est systemd-resolved sur 127.0.0.53,
  # couvert par « localhost ». La question ne se pose alors pas.)
  RESOLVEURS="$(sed -n 's/^[[:space:]]*nameserver[[:space:]]\{1,\}//p' /etc/resolv.conf 2>/dev/null | awk '{print $1}' || true)"
  LDAP_HOTE_EST_UNE_ADRESSE=0
  [[ "$LDAP_HOTE" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ || "$LDAP_HOTE" == *:* ]] && LDAP_HOTE_EST_UNE_ADRESSE=1
  A_VERIFIER=""
  while IFS= read -r a; do [[ -n "$a" ]] && A_VERIFIER+="$a dur contrôleur de domaine ($LDAP_HOTE)"$'\n'; done <<< "$ADRESSES_LDAP"
  while IFS= read -r a; do
    [[ -n "$a" ]] || continue
    if [[ $LDAP_HOTE_EST_UNE_ADRESSE -eq 1 ]]; then
      A_VERIFIER+="$a souple résolveur DNS (LDAP_URL porte une adresse : le DNS n'est pas sur le chemin d'authentification)"$'\n'
    else
      A_VERIFIER+="$a dur résolveur DNS (sans lui, « $LDAP_HOTE » ne se résout pas DANS le service)"$'\n'
    fi
  done <<< "$RESOLVEURS"

  BLOQUEES=""; BLOQUEES_SOUPLES=""; INDECIDABLES=""
  while IFS= read -r ligne; do
    [[ -n "$ligne" ]] || continue
    adresse="${ligne%% *}"; reste="${ligne#* }"
    severite="${reste%% *}"; quoi="${reste#* }"
    verdict=1
    while IFS= read -r regle; do
      [[ -n "$regle" ]] || continue
      # ⚠️ L'APPEL EST UNE CONDITION, et ce n'est pas cosmétique : sous
      # « set -e », un `couverte_par …; issue=$?` avorte le script dès que la
      # fonction rend autre chose que 0 — c'est-à-dire dès la PREMIÈRE règle qui
      # ne couvre pas l'adresse, donc presque toujours. Mesuré : le contrôle
      # s'arrêtait avant d'avoir rien conclu, et l'installation échouait sans
      # message. Un appel en condition désarme « set -e » dans la fonction.
      if couverte_par "$adresse" "$regle"; then issue=0; else issue=$?; fi
      if [[ $issue -eq 0 ]]; then verdict=0; break; fi
      if [[ $issue -eq 2 ]]; then verdict=2; fi
    done <<< "$AUTORISES"
    case $verdict in
      0) : ;;
      2) INDECIDABLES+="$adresse — $quoi"$'\n' ;;
      *) if [[ "$severite" == dur ]]; then BLOQUEES+="$adresse — $quoi"$'\n'
         else BLOQUEES_SOUPLES+="$adresse — $quoi"$'\n'; fi ;;
    esac
  done <<< "$A_VERIFIER"

  if [[ -n "${BLOQUEES_SOUPLES//[[:space:]]/}" ]]; then
    while IFS= read -r l; do [[ -n "$l" ]] && alerte "refusée par l'unité, sans effet sur l'annuaire : $l"; done <<< "$BLOQUEES_SOUPLES"
    alerte "Sans conséquence pour LDAPS, mais le lot L12 (notifications) en aura besoin."
  fi
  if [[ -n "${BLOQUEES//[[:space:]]/}" ]]; then
    while IFS= read -r l; do [[ -n "$l" ]] && alerte "refusée par l'unité : $l"; done <<< "$BLOQUEES"
    alerte "IPAddressAllow en vigueur ($UNITE_SOURCE) : $(printf '%s' "$AUTORISES" | tr '\n' ' ')"
    echec "L'unité systemd INTERDIT au service de joindre ces adresses (IPAddressDeny=any).
      L'installation s'achèverait sur « Installation terminée » et AUCUN utilisateur ne
      pourrait se connecter : la liaison LDAPS serait refusée par le noyau, pas par
      l'annuaire, et le message ne dirait pas pourquoi. Ajoutez le ou les sous-réseaux à
      deploy/systemd/cyber-grc.service, à côté de « IPAddressAllow=localhost » :
        IPAddressAllow=<sous-réseau des contrôleurs de domaine, ex. 10.0.0.0/8>
      puis : systemctl daemon-reload && systemctl restart cyber-grc
      N'écrivez PAS « IPAddressAllow=any » : cela rendrait toute la section inutile."
  fi
  if [[ -n "${INDECIDABLES//[[:space:]]/}" ]]; then
    while IFS= read -r l; do [[ -n "$l" ]] && alerte "couverture NON vérifiée (IPv6) : $l"; done <<< "$INDECIDABLES"
    alerte "Ce contrôle ne décide que de l'IPv4 : il refuse de conclure plutôt que de dire"
    alerte "« couvert » sans le savoir. Vérifiez à la main que l'unité autorise ces adresses."
  fi
  if [[ -z "${BLOQUEES//[[:space:]]/}" && -z "${INDECIDABLES//[[:space:]]/}" && -n "${A_VERIFIER//[[:space:]]/}" ]]; then
    succes "unité : contrôleur de domaine et résolveurs DNS couverts par IPAddressAllow ($UNITE_SOURCE)"
  fi

  # ---- Ce qui reste à la main, et qui n'est éprouvé par personne ------------
  # Le compte de service et son mot de passe ne sont pas éprouvés ici : un
  # essai de liaison ratée verrouille le compte selon la politique du domaine,
  # et verrouiller le compte de service à l'installation coupe l'application
  # entière. Ce choix est écrit plutôt que tu.
  [[ -n "$(lire_variable AUTH_COMPTE_SECOURS_EMPREINTE)" ]] || {
    alerte "AUTH_COMPTE_SECOURS_EMPREINTE est vide : le compte de secours est DÉSACTIVÉ."
    alerte "Si le compte de service AD venait à être verrouillé ou son mot de passe à expirer,"
    alerte "PLUS PERSONNE ne pourrait ouvrir de session (PLAN_SERVEUR §0.3)."
  }
fi
# <<< banc: ldaps >>>

info "Service et frontal"
install -m 0644 "$SOURCE/deploy/systemd/cyber-grc.service" /etc/systemd/system/
# Contrôle n° 7 du PLAN_SERVEUR §1.6 (CONVENTIONS.md §31.4) : la ré-analyse
# périodique du stock de pièces jointes. Le service est un `oneshot` sans
# section [Install] — seul le minuteur est armé.
install -m 0644 "$SOURCE/deploy/systemd/cyber-grc-reanalyse.service" /etc/systemd/system/
install -m 0644 "$SOURCE/deploy/systemd/cyber-grc-reanalyse.timer" /etc/systemd/system/
  # ── Lot L12 : les relances par courriel ────────────────────────────────────
  #
  # ⚠️ CETTE UNITÉ EST LA SEULE DES TROIS QUI SORTE DE LA MACHINE. Elle porte
  # « IPAddressDeny=any » comme les autres, et il faut y AJOUTER le sous-réseau
  # du relais SMTP — et celui du résolveur DNS s'il n'est pas en 127.x.
  #
  # L'oubli est la figure exacte du constat Q-65 : le NOYAU refuse la connexion,
  # pas le relais, et le journal dira « Relais injoignable ». On cherchera alors
  # le pare-feu du client pendant une heure, alors que la cause est dans l'unité.
  install -m 0644 "$SOURCE/deploy/systemd/cyber-grc-notifications.service" /etc/systemd/system/
  install -m 0644 "$SOURCE/deploy/systemd/cyber-grc-notifications.timer"   /etc/systemd/system/

  # ══ ET ON VÉRIFIE QUE LE RELAIS EST JOIGNABLE DEPUIS LE CGROUP (constat Q-199)
  #
  # ⚠️ Ce qui précède ce contrôle n'était qu'un COMMENTAIRE. L'unité disait, en
  # toutes lettres, ce que l'oubli produirait — et l'installateur armait le
  # minuteur sans rien vérifier. C'est « une réserve écrite n'est pas une réserve
  # traitée », la leçon la plus chère de ce chantier, appliquée à la lettre à L12 :
  # le lot était livré dans une configuration où il NE PEUT PAS envoyer, et le
  # banc était vert sur cette configuration-là.
  #
  # Le contrôle est DUR, pas une alerte. Un minuteur qui échoue tous les jours à
  # 7 h en disant « Relais injoignable » coûte plus cher qu'une installation qui
  # refuse de s'achever en disant pourquoi : dans le premier cas on cherche le
  # pare-feu du client, l'enregistrement SPF et la configuration Office 365 avant
  # de penser au cgroup.
  if [[ "$(lire_variable SMTP_ACTIF)" == "oui" ]]; then
    SMTP_HOTE_V="$(lire_variable SMTP_HOTE)"
    UNITE_NOTIF="fichier $SOURCE/deploy/systemd/cyber-grc-notifications.service"
    AUTORISES_NOTIF="$(sed -n 's/^[[:space:]]*IPAddressAllow=[[:space:]]*//p' \
                 "$SOURCE/deploy/systemd/cyber-grc-notifications.service" 2>/dev/null \
                 | tr ' ' '\n' | sed '/^$/d')"
    if VU_N="$(systemctl show -p IPAddressAllow --value cyber-grc-notifications 2>/dev/null)" \
       && [[ -n "$VU_N" ]]; then
      AUTORISES_NOTIF="$(printf '%s' "$VU_N" | tr ' ' '\n' | sed '/^$/d')"
      UNITE_NOTIF="systemctl show (unité en vigueur)"
    fi

    # Le relais, et le résolveur qui le résout — même nuance que pour l'annuaire :
    # si SMTP_HOTE porte une adresse littérale, le DNS n'est pas sur le chemin.
    ADRESSES_SMTP=""
    if [[ "$SMTP_HOTE_V" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ || "$SMTP_HOTE_V" == *:* ]]; then
      ADRESSES_SMTP="$SMTP_HOTE_V"
      SMTP_DNS_SUR_LE_CHEMIN=0
    else
      ADRESSES_SMTP="$(getent ahosts "$SMTP_HOTE_V" 2>/dev/null | awk '{print $1}' | sort -u || true)"
      SMTP_DNS_SUR_LE_CHEMIN=1
    fi

    if [[ -z "${ADRESSES_SMTP//[[:space:]]/}" ]]; then
      # ⚠️ On ne conclut PAS. Un nom qui ne se résout pas ici peut se résoudre
      # chez le client ; refuser l'installation pour cela serait un faux positif,
      # et dire « couvert » serait un mensonge. On le dit, et on le laisse ouvert.
      reserve "« $SMTP_HOTE_V » ne se résout pas depuis cette machine : la couverture de"
      alerte "IPAddressAllow pour le relais SMTP N'A PAS été vérifiée. Vérifiez à la main que"
      alerte "cyber-grc-notifications.service autorise le sous-réseau du relais, sinon le"
      alerte "NOYAU refusera chaque envoi et le journal dira « Relais injoignable »."
    else
      A_VERIFIER_N=""
      while IFS= read -r a; do
        [[ -n "$a" ]] && A_VERIFIER_N+="$a relais SMTP ($SMTP_HOTE_V)"$'\n'
      done <<< "$ADRESSES_SMTP"
      if [[ $SMTP_DNS_SUR_LE_CHEMIN -eq 1 ]]; then
        while IFS= read -r a; do
          [[ -n "$a" ]] && A_VERIFIER_N+="$a résolveur DNS (sans lui, « $SMTP_HOTE_V » ne se résout pas DANS l'unité)"$'\n'
        done <<< "$(sed -n 's/^[[:space:]]*nameserver[[:space:]]\{1,\}//p' /etc/resolv.conf 2>/dev/null | awk '{print $1}' || true)"
      fi

      BLOQUEES_N=""; INDECIDABLES_N=""
      while IFS= read -r ligne; do
        [[ -n "$ligne" ]] || continue
        adresse="${ligne%% *}"; quoi="${ligne#* }"
        verdict=1
        while IFS= read -r regle; do
          [[ -n "$regle" ]] || continue
          # Appel en condition : sous « set -e », un `couverte_par …; issue=$?`
          # avorte le script dès la première règle qui ne couvre pas.
          if couverte_par "$adresse" "$regle"; then issue=0; else issue=$?; fi
          if [[ $issue -eq 0 ]]; then verdict=0; break; fi
          if [[ $issue -eq 2 ]]; then verdict=2; fi
        done <<< "$AUTORISES_NOTIF"
        case $verdict in
          0) : ;;
          2) INDECIDABLES_N+="$adresse — $quoi"$'\n' ;;
          *) BLOQUEES_N+="$adresse — $quoi"$'\n' ;;
        esac
      done <<< "$A_VERIFIER_N"

      if [[ -n "${BLOQUEES_N//[[:space:]]/}" ]]; then
        while IFS= read -r l; do [[ -n "$l" ]] && alerte "refusée par l'unité de notification : $l"; done <<< "$BLOQUEES_N"
        alerte "IPAddressAllow en vigueur ($UNITE_NOTIF) : $(printf '%s' "$AUTORISES_NOTIF" | tr '\n' ' ')"
        echec "SMTP_ACTIF=oui, mais cyber-grc-notifications.service INTERDIT au minuteur de
      joindre le relais (IPAddressDeny=any). Le minuteur s'armerait, échouerait tous les
      jours, et le journal dirait « Relais injoignable » — en désignant le réseau du client
      alors que la cause est cette liste blanche. Ajoutez à
      deploy/systemd/cyber-grc-notifications.service, à côté de « IPAddressAllow=localhost » :
        IPAddressAllow=<sous-réseau du relais SMTP, ex. 10.0.0.0/8>
        IPAddressAllow=<sous-réseau du résolveur DNS, s'il n'est pas en 127.x>
      puis : systemctl daemon-reload && systemctl restart cyber-grc-notifications.timer
      N'écrivez PAS « IPAddressAllow=any » : cela rendrait toute la section inutile.
      Pour installer sans les relances, posez SMTP_ACTIF=non."
      fi
      if [[ -n "${INDECIDABLES_N//[[:space:]]/}" ]]; then
        while IFS= read -r l; do [[ -n "$l" ]] && alerte "couverture NON vérifiée (IPv6) : $l"; done <<< "$INDECIDABLES_N"
        alerte "Ce contrôle ne décide que de l'IPv4 : il refuse de conclure plutôt que de dire"
        alerte "« couvert » sans le savoir. Vérifiez à la main que l'unité autorise ces adresses."
      fi
      if [[ -z "${BLOQUEES_N//[[:space:]]/}" && -z "${INDECIDABLES_N//[[:space:]]/}" ]]; then
        succes "unité de notification : relais SMTP et résolveurs couverts par IPAddressAllow ($UNITE_NOTIF)"
      fi
    fi
  fi
systemctl daemon-reload
systemctl enable cyber-grc
systemctl restart cyber-grc
systemctl enable --now cyber-grc-reanalyse.timer
  systemctl enable --now cyber-grc-notifications.timer

if [[ ! -f /etc/apache2/sites-available/cyber-grc.conf ]]; then
  install -m 0644 "$SOURCE/deploy/apache/cyber-grc.conf" /etc/apache2/sites-available/
  alerte "Vhost installé : ajustez ServerName et les chemins de certificat,"
  alerte "puis : a2ensite cyber-grc && systemctl reload apache2"
else
  alerte "Vhost déjà présent — non écrasé (personnalisations préservées)."
fi

# >>> banc: corps <<<
# ══ LA BORNE DE CORPS S'ÉPROUVE, ELLE NE SE COMPARE PAS (constat Q-44) ═══════
#
# Ce qui était ici : `LimitRequestBody` du vhost comparé à
# `SERVEUR_TAILLE_MAX_CORPS`, et un « ok » imprimé quand les deux coïncidaient.
# Le contrôle ne pouvait pas échouer utilement, parce que **l'une des deux
# valeurs n'agit pas sur le chemin concerné** : `LimitRequestBody` est sans
# effet sur `/api/`, le seul chemin qui porte un corps (mesuré — 28 311 552
# octets traversent ; le même envoi sur `/index.html` rend 413). Comparer deux
# nombres dont l'un ne s'applique à rien, c'est un garde-fou qui se mesure
# lui-même — la figure exacte du `CONVENTIONS.md` §17.5.
#
# Le contrôle envoie donc un corps et regarde ce qui se passe :
#
#   · hors borne, PAR LE MANDATAIRE  -> doit être refusé (413) ;
#   · sous la borne                  -> ne doit PAS être refusé, sans quoi un
#     frontal qui refuse tout satisferait l'essai.
#
# Le seuil est lu dans la RÈGLE QUI REFUSE, pas dans un commentaire ni dans une
# constante recopiée ici.
#
# ── LE CORPS SANS LONGUEUR ANNONCÉE, ÉPROUVÉ AUSSI (constats Q-51, Q-58) ────
#
# Ce commentaire disait : « un client qui envoie en `Transfer-Encoding: chunked`
# n'annonce pas de longueur et n'est pas borné là ». C'était vrai, et ce ne
# l'est plus : le vhost refuse désormais tout `Transfer-Encoding` sur `/api/`.
# Remesuré derrière un Apache réel, avec une doublure qui compte les octets :
# chunked 1 Gio -> **411 en 19 ms**, 327 680 octets poussés, **0 au service** —
# là où, sans la règle, 1 073 741 824 octets étaient relayés en entier.
#
# Le contrôle éprouve donc les DEUX règles, et chacune dans les deux sens : ce
# qui doit être refusé l'est, et ce qui doit passer passe. La seconde moitié est
# la plus importante — un frontal qui refuse TOUT satisferait la première.
#
# ⚠️ ET LE MODULE QUI ANNULERAIT TOUT. Les deux règles lisent des en-têtes
# HTTP/1.1. En HTTP/2 il n'existe ni `Transfer-Encoding` ni `Content-Length`
# obligatoire : un corps en trames DATA échapperait aux deux. `mod_http2` n'est
# pas activé par ce script — mais « n'est pas activé » est un fait d'aujourd'hui,
# pas une barrière, et c'est exactement la forme du constat Q-65. On le
# CONSTATE donc, au lieu de le supposer.
if apache2ctl -M 2>/dev/null | grep -q 'http2_module'; then
  alerte "mod_http2 est ACTIVÉ sur ce frontal. Les deux bornes de corps du vhost lisent des"
  alerte "en-têtes HTTP/1.1 (Transfer-Encoding, Content-Length) : en HTTP/2, un corps en"
  alerte "trames DATA leur échappe entièrement, et seule la borne applicative de Fastify"
  alerte "subsiste (constats Q-44, Q-51). Soit désactivez-le (a2dismod http2), soit portez"
  alerte "la limitation ailleurs — et remesurez avant de conclure."
fi
if [[ -e /etc/apache2/sites-enabled/cyber-grc.conf ]]; then
  NOM_VHOST="$(sed -n 's/^[[:space:]]*ServerName[[:space:]]\{1,\}//p' \
               /etc/apache2/sites-available/cyber-grc.conf 2>/dev/null | head -n1 || true)"
  # ── Ancrée sur la règle GÉNÉRALE, depuis le constat Q-58 ──────────────────
  # Le vhost porte désormais DEUX règles « RewriteCond %1 "-gt … » : celle-ci,
  # et une seconde, plus stricte, propre à `RewriteRule ^/api/connexion` (la
  # fenêtre d'un Mio refermée sur la seule route joignable sans session). Une
  # extraction non ancrée prendrait la PREMIÈRE rencontrée dans le fichier —
  # 4 096, celle de la connexion — et dimensionnerait la sonde ci-dessous sur
  # le mauvais seuil : elle enverrait ~1 Mio à `/api/reprise` en croyant
  # tester le seuil général (27 262 976), et le « hors borne » attendu ne le
  # serait pas. `grep -B1` isole donc le bloc dont la `RewriteRule` qui SUIT
  # porte exactement `^/api/ -` (l'espace après `/api/` l'exclut de
  # `^/api/connexion -`, dont le caractère suivant est un « c ») ; parmi les
  # blocs ainsi isolés (chunked ET longueur), seul celui qui commence par
  # « RewriteCond %1 … -gt » passe l'extraction — le chunked, lui, commence
  # par « RewriteCond %{HTTP:Transfer-Encoding} . » et ne produit rien.
  SEUIL_CORPS="$(grep -B1 -E '^[[:space:]]*RewriteRule[[:space:]]+\^/api/[[:space:]]+-' \
                   /etc/apache2/sites-available/cyber-grc.conf 2>/dev/null \
                 | sed -n 's/^[[:space:]]*RewriteCond[[:space:]]\{1,\}%1[[:space:]]\{1,\}"\{0,1\}-gt[[:space:]]*\([0-9]\{1,\}\).*/\1/p' \
                 | head -n1 || true)"
  # ⚠️ Le seuil lu dans le vhost sert à DIMENSIONNER la sonde, jamais à décider.
  # Une première rédaction en faisait la condition du contrôle : la règle de
  # refus supprimée, le seuil devenait illisible, et le contrôle se contentait
  # d'un avertissement en rendant 0 — c'est-à-dire qu'il laissait passer
  # exactement le défaut qu'il est là pour voir. « Pas de règle » n'est pas
  # « je ne peux pas mesurer », c'est « la barrière est absente ». Faute de
  # seuil lisible, on se rabat sur la borne applicative et on exige quand même
  # le refus.
  if [[ -z "$SEUIL_CORPS" ]]; then
    SEUIL_CORPS="$(lire_variable SERVEUR_TAILLE_MAX_CORPS)"; SEUIL_CORPS="${SEUIL_CORPS:-26214400}"
  fi
  if [[ -z "$NOM_VHOST" ]]; then
    reserve "vhost sans ServerName : la borne de corps (Q-44) n'a pas pu être éprouvée."
    alerte "Voir deploy/apache/cyber-grc.conf."
  else
    CORPS_TMP="$(mktemp)"
    # ⚠️ UNE SEULE SONDE, paramétrée par ses en-têtes — et ce n'est pas un goût
    # de style. Une seconde fonction recopiée aurait dupliqué l'URL et le
    # `--resolve`, c'est-à-dire les deux endroits où l'essai de A4 déclare ses
    # substitutions : le banc aurait cessé de jouer ce bloc en annonçant « le
    # bloc a changé de forme ». Un contrôle qu'on éteint en l'étendant est pire
    # que celui qu'on n'a pas étendu.
    sonder_corps() {  # <octets> [en-tête…] → code HTTP rendu par le frontal
      local octets="$1"; shift
      local entetes=() h
      for h in "$@"; do entetes+=(-H "$h"); done
      head -c "$octets" /dev/zero | tr '\0' 'a' > "$CORPS_TMP"
      curl -sk --max-time 60 --noproxy '*' --resolve "$NOM_VHOST:443:127.0.0.1" \
           -X POST -H 'Content-Type: application/json' -H 'Connection: close' \
           ${entetes[@]+"${entetes[@]}"} \
           --data-binary "@$CORPS_TMP" -o /dev/null -w '%{http_code}' \
           "https://$NOM_VHOST/api/reprise" 2>/dev/null || true
    }
    CODE_HORS="$(sonder_corps "$((SEUIL_CORPS + 1048576))")"
    CODE_SOUS="$(sonder_corps 4096)"
    # Le corps SANS longueur annoncée : cet en-tête fait basculer curl en
    # chunked et lui fait retirer le `Content-Length`. C'est le contournement du
    # constat Q-51, et il doit désormais recevoir 411.
    CODE_CHUNKED="$(sonder_corps "$((SEUIL_CORPS + 1048576))" 'Transfer-Encoding: chunked')"
    rm -f "$CORPS_TMP"

    # Le contournement d'abord : c'est celui qui laissait passer un gigaoctet.
    if [[ "$CODE_CHUNKED" != 411 ]]; then
      alerte "corps chunked de $((SEUIL_CORPS + 1048576)) octets par /api/ -> $CODE_CHUNKED (411 attendu)"
      echec "le frontal RELAIE un corps sans longueur annoncée sur le chemin mandaté
        (constats Q-51 et Q-58). Mesuré sans la règle : 1 073 741 824 octets relayés au
        service en 2,4 s, et le client reçoit 502 là où le service a répondu 413. Vérifiez
        la règle « RewriteCond %{HTTP:Transfer-Encoding} . » du bloc « Dénis de service »
        de deploy/apache/cyber-grc.conf, et que mod_rewrite est chargé (a2enmod rewrite).
        Si un lot a introduit un envoi EN FLUX légitime, la règle doit être restreinte à
        ce qui n'est pas cette route-là — et remesurée, pas supprimée."
    elif [[ "$CODE_HORS" != 413 ]]; then
      alerte "corps de $((SEUIL_CORPS + 1048576)) octets par /api/ -> $CODE_HORS (413 attendu)"
      echec "le frontal laisse passer un corps hors borne sur le chemin mandaté (constat
        Q-44). C'est la première barrière du contrôle S13 qui manque : un envoi
        surdimensionné atteint le processus Node, qui n'a pas encore d'authentification
        devant lui (lot L3). Vérifiez la règle « RewriteCond %1 \"-gt …\" » du bloc
        « Dénis de service » de deploy/apache/cyber-grc.conf, et que mod_rewrite est
        chargé (a2enmod rewrite). N'ajustez PAS LimitRequestBody : elle est sans effet
        sur un chemin mandaté, c'est tout l'objet de ce constat."
    elif [[ "$CODE_SOUS" == 000 || -z "$CODE_SOUS" ]]; then
      # Un contrôle qui n'observe rien ne doit pas dire « ok ». « 000 » veut
      # dire que curl n'a obtenu aucune réponse : le service est peut-être
      # arrêté. Le contrôle symétrique n'a alors pas été joué, et un frontal
      # qui refuserait TOUT satisferait le reste sans qu'on le voie.
      reserve "corps de 4 096 octets par /api/ : aucune réponse (le service répond-il ?) — le"
      alerte "contrôle symétrique de la borne de corps n'a PAS été joué : on sait que le"
      alerte "frontal refuse hors borne, on ne sait pas qu'il laisse passer le reste (Q-44)."
    elif [[ "$CODE_SOUS" == 413 ]]; then
      alerte "corps de 4 096 octets par /api/ -> $CODE_SOUS"
      echec "le frontal refuse AUSSI un corps minuscule (constat Q-44, contrôle symétrique) :
        la règle de refus ne borne pas, elle bloque tout, et l'application serait
        injoignable en écriture. Le seuil lu dans le vhost est $SEUIL_CORPS octets ;
        vérifiez que la comparaison est bien « -gt » entre guillemets — sans eux, Apache
        lit l'opérande comme un champ de drapeaux."
    else
      succes "borne de corps éprouvée : $((SEUIL_CORPS + 1048576)) o -> 413, chunked -> 411, 4 096 o -> $CODE_SOUS"
    fi
  fi
else
  reserve "vhost non activé : la borne de corps du chemin mandaté (Q-44) n'a pas été éprouvée."
fi
# <<< banc: corps >>>

# >>> banc: unite <<<
# ══ L'UNITÉ SYSTEMD EST VÉRIFIÉE, PLUS DÉCLARÉE « NON ÉPROUVÉE » (Q-63) ══════
#
# Huit passages de porte ont écrit « systemd non éprouvé » **alors que
# `systemd-analyze verify` était installé**. Quatrième fois que ce motif coûte
# un constat : une réserve écrite n'est pas une réserve traitée, et l'outil
# manquant était là.
#
# ⚠️ Le verdict se lit dans la SORTIE, pas dans le code de retour, et la
# raison est mesurée — trois unités, sur cette machine :
#
#   unité propre (ExecStart existant)      code 0, aucune sortie
#   ExecStart introuvable                  code 1, une ligne
#   « Type=nimportequoi »                  code 0, une ligne   ← le piège
#
# Un défaut de directive est donc signalé **avec un code de retour nul**. Se
# fier au code aurait laissé passer exactement ce cas — la même figure que le
# `configtest` qui dit « Syntax OK » sur un motif qui n'efface rien, et que
# `LimitRequestBody` qui s'annonce posée sans agir. La sortie est le seul
# verdict fiable des trois.
#
# (Première rédaction de ce commentaire : « rend 0 même quand il signale un
# problème, mesuré avec un code 0 » — sur le mauvais exemple, parce que la
# mesure passait par un tube qui rendait le code de `sed`. Refaite proprement,
# elle dit l'inverse pour ce cas-là et confirme la règle pour l'autre.)
if command -v systemd-analyze >/dev/null 2>&1; then
  SORTIE_UNITE="$(systemd-analyze verify "$SOURCE/deploy/systemd/cyber-grc.service" 2>&1 || true)"
  if [[ -n "${SORTIE_UNITE//[[:space:]]/}" ]]; then
    while IFS= read -r l; do [[ -n "$l" ]] && alerte "unité : $l"; done <<< "$SORTIE_UNITE"
    echec "systemd refuse ou critique l'unité livrée (constat Q-63). Le service ne
      démarrerait pas, ou pas comme prévu. Corrigez deploy/systemd/cyber-grc.service, puis
      relancez. Si la ligne mise en cause est « Command … is not executable », voir juste
      en dessous : le chemin de Node écrit dans l'unité et celui que ce script a validé
      ne sont pas le même."
  else
    succes "unité systemd validée par systemd-analyze verify"
  fi
else
  reserve "systemd-analyze absent : l'unité n'a PAS été vérifiée."
fi

# Le chemin de Node de l'unité contre celui que ce script a validé au §3.
# Ils divergeaient sans que rien ne le dise : le contrôle de version appelle
# « command -v node » (qui trouve /opt/node22/bin/node sur une machine de
# développement) pendant que l'unité écrit « /usr/bin/node » en dur. Sur une
# machine où Node n'est pas dans /usr/bin, l'installation passait et le service
# ne démarrait pas.
NODE_UNITE="$(sed -n 's/^ExecStart=\([^[:space:]]*\).*/\1/p' \
              "$SOURCE/deploy/systemd/cyber-grc.service" 2>/dev/null | head -n1 || true)"
NODE_REEL="$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_UNITE" ]]; then
  alerte "l'unité ne déclare aucun ExecStart lisible : chemin de Node non vérifié."
elif [[ ! -x "$NODE_UNITE" ]]; then
  alerte "unité : ExecStart=$NODE_UNITE"
  alerte "trouvé sur le PATH : ${NODE_REEL:-aucun}"
  echec "l'unité lance « $NODE_UNITE », qui n'est pas exécutable sur cette machine. Le
    service échouerait au démarrage, après une installation qui se serait annoncée
    réussie. Alignez ExecStart de deploy/systemd/cyber-grc.service sur le Node de cette
    machine (${NODE_REEL:-installez Node 22}), ou posez un lien vers lui."
else
  succes "unité : ExecStart=$NODE_UNITE (exécutable)"
fi
# <<< banc: unite >>>

# >>> banc: reanalyse <<<
# ══ LE MINUTEUR EST ARMÉ, CONSTATÉ PAR SYSTEMCTL — PAS PAR LA LECTURE D'UN FICHIER ═
#
# Même piège que « banc: unite » deux crans plus haut : un fichier .timer
# présent sur le disque ne dit rien de ce que systemd EN FAIT. Un `enable
# --now` peut avoir échoué en silence, ou le minuteur peut être chargé sans
# jamais avoir démarré — les deux sont invisibles à `cat`. `is-enabled` et
# `is-active` interrogent le gestionnaire systemd EN COURS D'EXÉCUTION, jamais
# le fichier source : la même préférence, déjà faite plus haut pour
# IPAddressAllow (« systemctl show », pas une lecture de l'unité livrée).
#
# Contrôle n° 7 du PLAN_SERVEUR §1.6 (CONVENTIONS.md §31.4) : la ré-analyse
# périodique du stock de pièces jointes. Deux vérifications, dans cet ordre —
# la forme des unités d'abord (fichier, ne demande aucun privilège), puis leur
# état RÉEL une fois installées (systemd, en vigueur).
UNITE_REANALYSE="cyber-grc-reanalyse.timer"
if command -v systemd-analyze >/dev/null 2>&1; then
  SORTIE_REANALYSE="$(systemd-analyze verify \
    "$SOURCE/deploy/systemd/cyber-grc-reanalyse.service" \
    "$SOURCE/deploy/systemd/cyber-grc-reanalyse.timer" 2>&1 || true)"
  if [[ -n "${SORTIE_REANALYSE//[[:space:]]/}" ]]; then
    while IFS= read -r l; do [[ -n "$l" ]] && alerte "minuteur : $l"; done <<< "$SORTIE_REANALYSE"
    echec "systemd refuse ou critique cyber-grc-reanalyse.service ou .timer. Le contrôle n° 7
      (ré-analyse périodique, CONVENTIONS.md §31.4) ne se déclencherait pas, ou pas comme prévu.
      Corrigez deploy/systemd/cyber-grc-reanalyse.{service,timer}, puis relancez."
  else
    succes "unités cyber-grc-reanalyse.{service,timer} validées par systemd-analyze verify"
  fi
else
  reserve "systemd-analyze absent : cyber-grc-reanalyse.{service,timer} n'ont PAS été vérifiées."
fi

if command -v systemctl >/dev/null 2>&1; then
  ARMEMENT="$(systemctl is-enabled "$UNITE_REANALYSE" 2>&1 || true)"
  MARCHE="$(systemctl is-active "$UNITE_REANALYSE" 2>&1 || true)"
  if [[ "$ARMEMENT" == "enabled" && "$MARCHE" == "active" ]]; then
    succes "minuteur $UNITE_REANALYSE armé (enabled, active)"
  elif [[ "$ARMEMENT" == "not-found" || "$MARCHE" == "not-found" ]]; then
    reserve "minuteur $UNITE_REANALYSE inconnu de systemd : l'armement n'a PAS pu être constaté."
  else
    echec "minuteur $UNITE_REANALYSE désarmé (is-enabled=$ARMEMENT, is-active=$MARCHE). Le
      contrôle n° 7 (ré-analyse périodique, CONVENTIONS.md §31.4) ne se déclenchera pas : une
      pièce saine aujourd'hui resterait délivrable même si une signature publiée plus tard la
      détecte. Réarmez avec :
        systemctl daemon-reload && systemctl enable --now $UNITE_REANALYSE"
  fi
else
  reserve "systemctl absent : l'armement de $UNITE_REANALYSE n'a PAS pu être constaté."
fi
# <<< banc: reanalyse >>>

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

# 1. Ce que le code LIT — et le motif d'hier ne savait lire qu'UNE orthographe.
#
# ── Constat Q-56 : le cinquième annuaire ────────────────────────────────
#
# Ce bloc cherchait `requete.headers['x-…']` avec des apostrophes simples, et
# rien d'autre. Trois écritures ordinaires de JavaScript lui étaient invisibles,
# mesurées : guillemets doubles, accent grave, et destructuration
# (`const { 'x-a': j } = requete.headers`). **Trois sur quatre passaient.**
# Ajouter trois motifs à côté du premier aurait donné un annuaire de quatre au
# lieu d'un, et le cinquième aurait manqué.
#
# ── Ce qui a été cherché, et pourquoi la découverte n'est pas possible ──
#
# La bonne réponse serait de lire l'ARBRE SYNTAXIQUE plutôt que le texte —
# l'équivalent, pour du TypeScript, de ce que `f_verifier_schema()` fait en
# découvrant ses contrôles dans `pg_catalog`. Le compilateur est là pour cela.
# **Il n'est pas disponible quand ce contrôle tourne**, et c'est mesuré, pas
# supposé : `typescript` est en `devDependencies`, le chemin en ligne fait
# `npm ci --include=dev` puis **`npm prune --omit=dev`** (§4 de ce script), et
# le chemin hors ligne demande une arborescence préparée avec `--omit=dev`.
# Dans les deux cas, le compilateur a disparu avant qu'on arrive ici. Un
# contrôle qui dépendrait de sa présence serait vert par absence — la figure
# que ce chantier passe son temps à payer.
#
# ── Ce qui remplace l'annuaire : classer, et REFUSER DE DEVINER ─────────
#
# L'orthographe de la CLÉ est libre ; celle du SITE D'ACCÈS ne l'est pas. Les
# quatre formes, l'aliasing et `requete.raw.headers` ont toutes en commun
# l'identifiant `headers`, qui est le nom de la propriété Fastify et ne se
# décline pas. On énumère donc les LIGNES qui le portent — il y en a quatre
# dans tout `src/` — et chacune reçoit un verdict :
#
#   MASQUAGE     une chaîne « req.headers.x » de la liste de pino : elle DÉCRIT
#                un en-tête pour le masquer au journal, elle n'en lit aucun.
#                Reconnue seulement si la ligne ne touche pas `requete.headers`,
#                sans quoi une lecture pourrait se déguiser en masquage.
#   LECTURE      les littéraux de la ligne — apostrophe, guillemet ou accent
#                grave, y compris plusieurs par ligne — sont les en-têtes lus.
#   ILLISIBLE    clé calculée (`requete.headers[NOM]`) : rien à extraire.
#   INCLASSABLE  tout le reste, l'aliasing compris.
#
# **Les deux derniers ARRÊTENT l'installation.** C'est là toute la différence
# avec l'annuaire : une écriture inconnue n'est plus invisible, elle est
# bruyante. Le cinquième cas n'a pas besoin d'être prévu pour être vu.
ENTETES_ATTENDUS=""
ENTETES_OPAQUES=""
while IFS= read -r brut; do
  [[ -n "$brut" ]] || continue
  LIGNE_FIC="${brut%%:*}"; RESTE="${brut#*:}"; LIGNE_NUM="${RESTE%%:*}"; LIGNE_TXT="${brut#*:*:}"
  if printf '%s' "$LIGNE_TXT" | grep -qE "['\"\`](req|res)\.headers" \
     && ! printf '%s' "$LIGNE_TXT" | grep -qE "requete\.headers|request\.headers|\.raw\.headers"; then
    continue                                   # masquage du journal : ne lit rien
  fi
  if printf '%s' "$LIGNE_TXT" | grep -qE "headers[[:space:]]*\[|\}[[:space:]]*=[^=]*headers"; then
    CLES="$(printf '%s' "$LIGNE_TXT" | grep -oE "['\"\`][A-Za-z][A-Za-z0-9-]*['\"\`]" \
            | tr -d "'\"\`" | tr 'A-Z' 'a-z' | sort -u || true)"
    if [[ -z "$CLES" ]]; then
      ENTETES_OPAQUES+="${LIGNE_FIC#"$SOURCE/"}:$LIGNE_NUM — clé calculée, aucun littéral à lire"$'\n'
    else
      ENTETES_ATTENDUS+="$CLES"$'\n'
    fi
    continue
  fi
  # ── LA FORME À POINT : `requete.headers.cookie` ─────────────────────────
  #
  # CINQUIÈME écriture, arrivée avec l'authentification (lot L3). Le
  # commentaire ci-dessus promettait « les quatre sont comprises » ; il en
  # manquait une, et c'est la plus naturelle en TypeScript — un nom d'en-tête
  # sans tiret est un identifiant valide, donc accessible par point. Le contrôle
  # a fait ce qu'il devait : il a REFUSÉ de conclure, et arrêté l'installation.
  # C'est ainsi qu'on l'a vu, plutôt qu'en le découvrant en production.
  if printf '%s' "$LIGNE_TXT" | grep -qE "headers\.[A-Za-z]"; then
    CLES="$(printf '%s' "$LIGNE_TXT" | grep -oE "headers\.[A-Za-z][A-Za-z0-9_]*" \
            | sed 's/^headers\.//' | tr 'A-Z' 'a-z' | sort -u || true)"
    if [[ -z "$CLES" ]]; then
      ENTETES_OPAQUES+="${LIGNE_FIC#"$SOURCE/"}:$LIGNE_NUM — accès par point sans nom lisible"$'\n'
    else
      ENTETES_ATTENDUS+="$CLES"$'\n'
    fi
    continue
  fi
  ENTETES_OPAQUES+="${LIGNE_FIC#"$SOURCE/"}:$LIGNE_NUM — accès à « headers » que ce contrôle ne sait pas classer"$'\n'
done < <(grep -rnE "\bheaders\b" "$SOURCE/src" 2>/dev/null || true)

if [[ -n "${ENTETES_OPAQUES//[[:space:]]/}" ]]; then
  while IFS= read -r l; do [[ -n "$l" ]] && alerte "$l"; done <<< "$ENTETES_OPAQUES"
  echec "le code touche « headers » d'une façon que ce contrôle ne sait pas lire (constat
    Q-56). Il REFUSE de conclure plutôt que de laisser passer : un en-tête lu et non
    effacé au frontal est forgeable par le client, et c'est ainsi que la « référence »
    d'un incident se choisissait (Q-39). Deux issues : écrire l'accès sous une forme à
    clé littérale — apostrophe, guillemet, accent grave ou destructuration, les quatre
    sont comprises —, ou étendre la classification ci-dessus en l'éprouvant sur les
    formes existantes ET sur celle que vous ajoutez."
fi
ENTETES_ATTENDUS="$(printf '%s' "$ENTETES_ATTENDUS" | sort -u)"

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

# 3. LES EN-TÊTES QUI VIENNENT DU CLIENT PAR NATURE, et qu'effacer casserait.
#
# ⚠️ C'est une DÉROGATION, et elle est écrite ici pour être discutée, pas pour
# passer inaperçue. Le contrôle formulait sa règle ainsi : « tout en-tête que
# `src/` lit doit être effacé ou reposé par le vhost ». Appliquée au cookie de
# session, elle exige d'effacer le jeton d'authentification au frontal —
# c'est-à-dire de rendre toute connexion impossible.
#
# Le discriminant n'est donc pas « lu / pas lu », c'est :
#
#   un en-tête que le service traite comme une DÉCLARATION DU CLIENT n'a pas à
#   être effacé ; un en-tête qu'il traite comme un FAIT ÉTABLI AILLEURS doit
#   l'être.
#
# `x-forwarded-for` est un fait supposé établi par le mandataire : forgé, il
# fait journaliser une fausse adresse (Q-39). `cookie` et `user-agent` sont des
# déclarations : le cookie n'est pas cru, il est VÉRIFIÉ contre
# `sessions.jeton_empreinte` ; l'agent utilisateur est journalisé pour ce qu'il
# est, la prétention du client.
#
# La liste est courte et le RESTE : toute addition doit être justifiée par ce
# discriminant, et elle est IMPRIMÉE à chaque installation pour qu'elle ne
# grossisse pas en silence. C'est le cas d'exception du `db/CONVENTIONS.md` §24 :
# obliger quelqu'un à trancher, plutôt qu'énumérer.
# `content-type` et `content-length` rejoignent la liste au lot L6 : ce sont des
# DÉCLARATIONS DU CLIENT, pas des faits établis ailleurs — le discriminant de ce
# bloc. `content-type` porte la frontière multipart, validée contre le RFC 2046
# puis DÉMENTIE par le contrôle n° 4 (signature binaire) ; `content-length` ne
# sert qu'à refuser tôt, le compteur de flux restant seul autoritaire. Les
# effacer casserait tout envoi de corps.
ENTETES_DU_CLIENT=(cookie user-agent content-type content-length)

ENTETES_NUS=""
while IFS= read -r entete; do
  [[ -n "$entete" ]] || continue
  DEROGE=0
  for e in "${ENTETES_DU_CLIENT[@]}"; do [[ "$entete" == "$e" ]] && DEROGE=1; done
  if [[ $DEROGE -eq 1 ]]; then
    succes "en-tête « $entete » : déclaration du client, non effacé (dérogation motivée)"
    continue
  fi
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

# >>> banc: groupesad <<<
# ══ LES GROUPES AD SUIVENT-ILS LES FILIALES ? (PLAN_SERVEUR §3.4) ═══════════
#
# Le client acquiert des filiales régulièrement. À chaque acquisition, sept
# groupes Active Directory doivent naître — et rien, dans le produit, ne le
# rappelle : l'application ne voit pas l'annuaire, et l'annuaire ne voit pas la
# déclaration des filiales. Entre les deux, il n'y a qu'une personne qui doit y
# penser, et un RSSI de site sans aucun accès quand elle n'y a pas pensé.
#
# Ce contrôle est ce rappel. Il ne CRÉE rien — créer un groupe dans l'AD du client
# n'appartient pas à un installateur —, il constate et il nomme la commande.
#
# ⚠️ AVERTISSEMENT, PAS ÉCHEC, et le motif est écrit pour qu'on ne le « durcisse »
# pas par réflexe : une filiale déclarée sans ses groupes est une lacune
# d'exploitation, pas une installation défectueuse. Refuser ici empêcherait de
# METTRE À JOUR un système en production à cause d'une donnée manquante — et la
# mise à jour, elle, corrige peut-être ce qui bloque le client. Le seul cas
# refusé est la déclaration INVALIDE (code 4), parce qu'elle engendrerait des
# noms de groupes faux, donc des accès qui n'existent pas.
# ⚠️ LA COPIE DÉPLOYÉE, PAS CELLE DU DÉPÔT — et le motif mérite d'être écrit, parce
# que la version précédente échouait à TOUS les coups sur une installation propre.
#
# `groupes-ad.sh` ne réécrit pas la convention de nommage : il met en forme ce que
# rend `groupesAttendus()`, et va donc chercher l'engendreur COMPILÉ en
# `<son propre répertoire>/../dist/droits/groupes-ad.js`. Or ce script-ci ne compile
# jamais dans l'arbre source : il compile dans `$RACINE/backend` (§4). Appeler la
# copie du dépôt revenait donc à chercher `dist/` là où rien ne le construit —
# « L'engendreur compilé est absent », suivi de « Installation terminée ».
#
# Mesuré sur une Debian 13 neuve le 03/09/2026 : deux passages successifs, deux
# échecs identiques ; le même script lancé depuis `$RACINE/backend/deploy/` rend
# les 23 groupes attendus. Le script était juste, c'est l'appel qui visait le
# mauvais arbre. On préfère donc la copie déployée, qui est la seule dont ce
# script ait construit le `dist/`, et l'on retombe sur celle du dépôt si elle
# manque — un exploitant qui joue `groupes-ad.sh` à la main depuis ses sources
# reste servi par le message d'erreur du script, qui lui dit de compiler.
GROUPES_AD_SCRIPT="$RACINE/backend/deploy/groupes-ad.sh"
[[ -f "$GROUPES_AD_SCRIPT" ]] || GROUPES_AD_SCRIPT="$SOURCE/deploy/groupes-ad.sh"
if [[ ! -x "$GROUPES_AD_SCRIPT" && ! -f "$GROUPES_AD_SCRIPT" ]]; then
  reserve "deploy/groupes-ad.sh est absent : la liste des groupes AD n'a PAS été vérifiée."
else
  SORTIE_GROUPES="$(CYBER_GRC_CONFIG="$CONFIG" bash "$GROUPES_AD_SCRIPT" --verifier 2>&1)" \
    && CODE_GROUPES=0 || CODE_GROUPES=$?
  while IFS= read -r l; do [[ -n "$l" ]] && printf '%s\n' "$l" >&2; done <<< "$SORTIE_GROUPES"
  case "$CODE_GROUPES" in
    0) succes "groupes AD : la déclaration des filiales et la liste engendrée concordent" ;;
    4) echec "La déclaration des filiales est INVALIDE (voir les lignes ci-dessus).
      Les noms de groupes engendrés en seraient faux, et un nom de groupe faux ne se voit
      qu'au moment où quelqu'un ne peut pas se connecter — sans message d'erreur, ni côté
      annuaire, ni côté application. Corrigez $CONFIG/filiales.conf
      (format : db/CONVENTIONS.md §27, modèle : deploy/filiales.conf.exemple), puis relancez." ;;
    5) alerte "Aucune filiale n'est déclarée : seuls les groupes de périmètre Groupe et les"
       alerte "deux transversaux existent. Aucun RSSI de site n'aura d'accès tant que"
       alerte "$CONFIG/filiales.conf n'aura pas été renseigné." ;;
    3) alerte "Écart entre la liste engendrée et la table « groupes_ad » (détail ci-dessus)."
       alerte "Régénérer le script de création AD :"
       alerte "  bash $GROUPES_AD_SCRIPT --powershell --ou '<DN de l'unité d'organisation>'" ;;
    *) reserve "deploy/groupes-ad.sh a rendu $CODE_GROUPES : la liste des groupes AD n'a pas pu"
       alerte "être engendrée. Voir les lignes ci-dessus." ;;
  esac
fi
# <<< banc: groupesad >>>

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
  reserve "ni apache2ctl ni apachectl sur le PATH : la configuration du frontal n'a PAS été"
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
    reserve "vhost cyber-grc pas activé : « configtest » ne l'a donc PAS lu, et TOUT le contrôle"
    alerte "de bout en bout ci-dessous (URL d'entrée Q-36, borne de corps Q-44, invariant de"
    alerte "cache Q-43, SERVEUR_URL_PUBLIQUE Q-76) n'a pas pu être joué. Activez-le :"
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
      reserve "vhost sans ServerName : l'URL d'entrée (Q-36) n'a pas pu être éprouvée."
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

      # ══ SERVEUR_URL_PUBLIQUE DIT-ELLE VRAI ? (constat Q-76) ════════════════
      #
      # `SERVEUR_URL_PUBLIQUE` nomme ce serveur dans les liens qu'il engendre —
      # courriels et exports (lot L12), et le journal de démarrage dès
      # aujourd'hui. Le seul contrôle qui existait (§5) ne regardait que sa
      # FORME : « commence par https:// ». Une valeur syntaxiquement valide et
      # fonctionnellement fausse passait : `.env.example` a porté
      # « https://grc.interne.exemple » pendant que CE vhost sert
      # « grc.exemple.interne » — les mots inversés — et rien ne l'a vu avant
      # qu'une installation réelle ne parte avec le mauvais nom, sans un mot.
      #
      # ⚠️ NE PAS COMPARER DEUX CHAÎNES. C'est la leçon même du 8ᵉ passage
      # (constat Q-44, juste au-dessus dans ce fichier) : un contrôle qui
      # compare deux déclarations ne contrôle rien. Le texte « ServerName » ne
      # suffirait d'ailleurs pas à décider seul : avec un SEUL vhost sur le
      # port 443, Apache répond quel que soit le nom demandé dans l'en-tête —
      # deux textes égaux ne prouveraient donc pas plus que deux nombres égaux
      # n'en prouvaient au 8ᵉ passage. Ce qui décide RÉELLEMENT si un lien vers
      # SERVEUR_URL_PUBLIQUE s'ouvre sans avertissement de sécurité, c'est le
      # CERTIFICAT présenté : on l'INTERROGE — même idiome que la vérification
      # de LDAP_CA plus haut (openssl x509) —, on ne relit pas un fichier.
      URL_PUBLIQUE="$(lire_variable SERVEUR_URL_PUBLIQUE)"
      if [[ -z "$URL_PUBLIQUE" ]]; then
        alerte "SERVEUR_URL_PUBLIQUE est vide : rien à confronter au certificat (voir §5)."
      else
        HOTE_PUBLIC="${URL_PUBLIQUE#*://}"; HOTE_PUBLIC="${HOTE_PUBLIC%%/*}"; HOTE_PUBLIC="${HOTE_PUBLIC%%:*}"
        CERT_SERVI="$(mktemp)"
        timeout 15 openssl s_client -connect "127.0.0.1:443" -servername "$NOM_SERVEUR" \
            </dev/null 2>/dev/null | openssl x509 > "$CERT_SERVI" 2>/dev/null || true
        if [[ ! -s "$CERT_SERVI" ]]; then
          reserve "aucun certificat obtenu en interrogeant 127.0.0.1:443 (servername=$NOM_SERVEUR) :"
          alerte "SERVEUR_URL_PUBLIQUE (« $URL_PUBLIQUE ») n'a PAS pu être confrontée au"
          alerte "certificat réellement servi."
        elif ! openssl x509 -in "$CERT_SERVI" -noout -checkhost "$HOTE_PUBLIC" >/dev/null 2>&1; then
          rm -f "$CERT_SERVI"
          echec "SERVEUR_URL_PUBLIQUE (« $URL_PUBLIQUE ») nomme « $HOTE_PUBLIC », qui n'est PAS
      couvert par le certificat que ce serveur présente réellement pour « $NOM_SERVEUR »
      (constat Q-76). Un lien envoyé par courriel ou inscrit dans un export pointerait vers un
      nom que le navigateur refusera — avertissement de sécurité TLS au mieux ; au pire,
      quiconque obtiendrait un certificat pour ce nom-là serait indiscernable du bon serveur.
      Alignez SERVEUR_URL_PUBLIQUE de ${FICHIER_CONFIG:-/etc/cyber-grc/env} sur le nom
      réellement couvert, ou étendez le certificat (SSLCertificateFile de
      deploy/apache/cyber-grc.conf) pour qu'il couvre aussi « $HOTE_PUBLIC »."
        else
          rm -f "$CERT_SERVI"
          succes "SERVEUR_URL_PUBLIQUE : « $HOTE_PUBLIC » est couvert par le certificat réellement servi"
        fi
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
        reserve "vhost sans ExpiresDefault lisible : l'invariant « cache long ⇒ URL versionnée »"
        alerte "(constat Q-43) n'a PAS pu être vérifié."
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

# La ligne qui relie le RESERVES accumulé tout au long du VRAI script à
# l'entrée que le bloc testable ci-dessous sait recevoir du dehors — deux
# variables plates, comme tout bloc qui a besoin de quelque chose que
# lui-même ne calcule pas (« entetes » reçoit SOURCE de la même façon). Elle
# vit HORS des ancres : un banc qui joue le bloc « bilan » seul lui fournit
# ces deux valeurs directement, sans avoir à rejouer tout le script pour les
# obtenir.
RESERVES_COMPTE=${#RESERVES[@]}
RESERVES_TEXTE=""
if [[ $RESERVES_COMPTE -gt 0 ]]; then RESERVES_TEXTE="$(printf '%s\n' "${RESERVES[@]}")"; fi

# >>> banc: bilan <<<
# ══ LE MOT DE LA FIN DIT CE QUI N'A PAS PU ÊTRE JOUÉ (constat Q-75) ══════════
#
# Mesuré les 03 et 04/09/2026 sur une Debian 13 neuve : le vhost s'installe
# sans s'activer, et tant qu'il ne l'est pas, l'URL d'entrée (Q-36) et la
# borne de corps du chemin mandaté (Q-44) ne sont éprouvées À AUCUN MOMENT —
# chaque contrôle concerné le disait honnêtement, en alerte, puis le script
# imprimait quand même « Installation terminée » et rendait 0. Un exploitant
# qui écrit `install.sh && echo OK` concluait au succès sur des contrôles qui
# n'avaient jamais eu lieu — indiscernables, dans le mot de la fin et le code
# de sortie, de ceux qui avaient tourné et étaient conformes.
#
# ⚠️ CE N'EST PAS UN DURCISSEMENT PAR RÉFLEXE. `reserve()` (posée en tête de
# ce fichier) N'ARRÊTE RIEN par elle-même : une lacune de DONNÉES — une
# filiale déclarée sans ses groupes AD, bloc « groupesad » plus haut — reste
# un avertissement ordinaire (`alerte`), parce qu'y répondre par un échec
# bloquerait la mise à jour d'un système en production, dont la mise à jour
# corrige peut-être ce qui bloque le client ; cet arbitrage n'est pas rouvert
# ici. Ce qui change est seulement AVAL, et une seule fois : le mot de la fin
# et le code de sortie cessent de dire « installation terminée » sans
# distinguer *contrôle joué et conforme* de *contrôle jamais posé*.
if [[ $RESERVES_COMPTE -eq 0 ]]; then
  printf '\n\033[1;32mInstallation terminée.\033[0m\n'
else
  printf '\n\033[1;33mInstallation terminée AVEC RÉSERVES (%d contrôle(s) non joué(s)) :\033[0m\n' \
    "$RESERVES_COMPTE"
  while IFS= read -r ligne; do [[ -n "$ligne" ]] && printf '  - %s\n' "$ligne"; done <<< "$RESERVES_TEXTE"
  printf "\033[1;33mCE N'EST PAS UN FEU VERT\033[0m : les points ci-dessus n'ont pas été vérifiés,\n"
  printf "pas déclarés conformes. Levez-les (souvent : activer le vhost — voir plus haut),\n"
  printf "puis relancez ce script.\n"
fi
printf 'Configuration : %s  (root:%s 0640)\n' "${FICHIER_CONFIG:-/etc/cyber-grc/env}" "${UTILISATEUR:-cyber-grc}"
printf 'Journaux      : journalctl -u cyber-grc -f\n'
printf 'Exploitation  : %s/backend/README.md\n' "${RACINE:-.}"
[[ $RESERVES_COMPTE -eq 0 ]] || exit 3
# <<< banc: bilan >>>
