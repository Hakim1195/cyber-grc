#!/usr/bin/env bash
#
# preparer_base_dev.sh — prépare une base de DÉVELOPPEMENT ou de RECETTE.
#
# Crée, si besoin, les trois rôles de `backend/db/CONVENTIONS.md` §14
# (grc_proprietaire, grc_app, grc_lecture) et la base, puis applique les migrations
# avec `db/migrate.mjs`. Idempotent : ré-exécutable sans dommage, et sans rien casser
# de ce qui existe déjà.
#
#   bash db/dev/preparer_base_dev.sh
#   bash db/dev/preparer_base_dev.sh --base grc_recette --mot-de-passe 'un-autre'
#   bash db/dev/preparer_base_dev.sh --recreer            # base repartie de zéro
#   bash db/dev/preparer_base_dev.sh --sans-migration     # rôles et base seulement
#   bash db/dev/preparer_base_dev.sh --purger-bases-essai # balaie les bases d'essai orphelines
#
# ── Ce que ce script n'est pas ────────────────────────────────────────────────
#
# Ce n'est PAS l'installateur de production : celui-là est `deploy/install.sh`, et il
# ne crée aucun secret. Ici, au contraire, un mot de passe par défaut connu (« dev »)
# est posé sur les trois rôles, parce qu'un poste de développement a besoin d'être
# reproductible et qu'un secret de développement partagé n'en est pas un.
#
#   ⚠️  LE MOT DE PASSE PAR DÉFAUT « dev » NE DOIT JAMAIS SORTIR D'UN POSTE DE
#       DÉVELOPPEMENT OU D'UNE RECETTE ISOLÉE. Le script refuse de tourner sous
#       NODE_ENV=production ; c'est un garde-fou, pas une autorisation à l'employer
#       ailleurs.
#
# ── Accès administrateur ──────────────────────────────────────────────────────
#
# La création des rôles et de la base demande un superutilisateur PostgreSQL. Le
# script utilise le compte `postgres` : par `su` s'il tourne en root, par connexion
# directe sinon (variable PGSUPERUTILISATEUR pour un autre nom).

set -Eeuo pipefail

# ------------------------------------------------------------------ réglages ----

RACINE_BACKEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

BASE="${BASE_NOM:-cyber_grc_dev}"
MOT_DE_PASSE="dev"
SUPERUTILISATEUR="${PGSUPERUTILISATEUR:-postgres}"
RECREER=0
SANS_MIGRATION=0
REINITIALISER=0
PURGER_ESSAIS=0

PROPRIETAIRE="grc_proprietaire"
APPLICATIF="grc_app"
LECTURE="grc_lecture"

info()   { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
succes() { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
alerte() { printf '\033[1;33m  !!\033[0m %s\n' "$*" >&2; }
echec()  { printf '\033[1;31m ERR\033[0m %s\n' "$*" >&2; exit 1; }

aide() {
  cat <<'FIN'
Prépare une base de développement ou de recette pour Cyber GRC Groupe.

  --base NOM             nom de la base (défaut : $BASE_NOM, sinon cyber_grc_dev)
  --mot-de-passe MDP     mot de passe des trois rôles (défaut : dev)
  --recreer              supprime la base avant de la recréer (DESTRUCTIF)
  --sans-migration       s'arrête après les rôles et la base
  --reinitialiser-mots-de-passe
                         réécrit le mot de passe des rôles déjà existants
  --purger-bases-essai   supprime les bases « grc_essai_% » sans connexion active,
                         laissées par un banc d'essai interrompu, puis s'arrête
  --aide                 ce message

Rôles créés (CONVENTIONS.md §14) : grc_proprietaire · grc_app · grc_lecture
Le script refuse de tourner sous NODE_ENV=production.
FIN
}

# ------------------------------------------------------------- ligne de commande ----

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)          BASE="${2:?--base attend un nom de base}"; shift 2 ;;
    --base=*)        BASE="${1#*=}"; shift ;;
    --mot-de-passe)  MOT_DE_PASSE="${2:?--mot-de-passe attend une valeur}"; shift 2 ;;
    --mot-de-passe=*) MOT_DE_PASSE="${1#*=}"; shift ;;
    --recreer)       RECREER=1; shift ;;
    --sans-migration) SANS_MIGRATION=1; shift ;;
    --reinitialiser-mots-de-passe) REINITIALISER=1; shift ;;
    --purger-bases-essai) PURGER_ESSAIS=1; shift ;;
    --aide|-h|--help) aide; exit 0 ;;
    *) echec "Option inconnue : $1 (voir --aide)." ;;
  esac
done

# ------------------------------------------------------------------ garde-fous ----

# Un mot de passe connu posé sur une base de production serait une porte ouverte.
# Le garde est volontairement grossier : il n'y a aucune raison légitime d'exécuter
# ce script sur une machine qui se déclare en production.
if [[ "${NODE_ENV:-}" == "production" ]]; then
  echec "NODE_ENV=production : ce script ne prépare que des bases de développement ou de recette.
      En production, c'est deploy/install.sh qui crée la base, et les secrets sont
      renseignés à la main dans /etc/cyber-grc/env — le seul chemin de configuration
      que connaisse le code (src/config/index.ts, .env.example, unité systemd)."
fi

# Même motif que src/config/index.ts : le nom de base finit interpolé dans un
# « create database », il ne peut donc pas être une chaîne quelconque.
[[ "$BASE" =~ ^[A-Za-z_][A-Za-z0-9_$]*$ ]] \
  || echec "Nom de base invalide : « $BASE » (attendu : identifiant PostgreSQL)."

[[ -n "$MOT_DE_PASSE" ]] || echec "Le mot de passe ne peut pas être vide."

command -v psql >/dev/null 2>&1 || echec "psql introuvable : installez le client PostgreSQL."
command -v node >/dev/null 2>&1 || echec "node introuvable : Node.js 22 est requis."

# ------------------------------------------------------- accès superutilisateur ----

# Le SQL arrive par l'entrée standard (« -f - ») : rien ne transite par la ligne de
# commande, donc rien n'apparaît dans « ps » — le mot de passe des rôles y passe.
# Il reste visible du journal du serveur si log_statement=all : acceptable pour un
# secret de développement, inacceptable ailleurs — d'où le garde-fou NODE_ENV.
sql_admin() {
  if [[ $EUID -eq 0 ]]; then
    su "$SUPERUTILISATEUR" -s /bin/sh -c "psql -X -q -A -t -v ON_ERROR_STOP=1 -d postgres -f -"
  else
    psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$SUPERUTILISATEUR" -d postgres -f -
  fi
}

info "Accès administrateur PostgreSQL"
if ! printf 'select 1;\n' | sql_admin >/dev/null 2>&1; then
  echec "Impossible de se connecter comme superutilisateur « $SUPERUTILISATEUR ».
      En root : le script utilise « su $SUPERUTILISATEUR ». Sinon, assurez-vous que
      votre compte peut se connecter (PGSUPERUTILISATEUR pour un autre nom)."
fi
succes "superutilisateur $SUPERUTILISATEUR"

# ------------------------------------------------------ purge des bases d'essai ----

# Le banc d'essai (`test/aide/base.mjs`) crée une base par fichier de test, nommée
# `grc_essai_<fichier>_<jeton unique>`, et la supprime dans son `after()`. Une
# exécution tuée par un signal n'y arrive pas : la base survit. Ce mode les balaie.
#
# Deux garde-fous, parce que plusieurs exécutions peuvent tourner en même temps sur la
# même grappe : seules les bases dont le nom commence par `grc_essai_` sont candidates,
# et **seules celles sans aucune connexion active** sont supprimées — une base qu'un
# banc d'essai est en train d'utiliser n'est pas orpheline.
if [[ $PURGER_ESSAIS -eq 1 ]]; then
  info "Purge des bases d'essai orphelines"
  candidates="$(printf "%s\n" "select d.datname
                                  from pg_database d
                                 where d.datname like 'grc\\_essai\\_%'
                                   and not exists (select 1 from pg_stat_activity a
                                                    where a.datname = d.datname)
                                 order by 1;" | sql_admin)"
  if [[ -z "${candidates//[[:space:]]/}" ]]; then
    succes "aucune base d'essai orpheline"
  else
    while read -r orpheline; do
      [[ -n "$orpheline" ]] || continue
      printf 'drop database if exists %s with (force);\n' "$orpheline" | sql_admin
      succes "$orpheline — supprimée"
    done <<< "$candidates"
  fi
  actives="$(printf "%s\n" "select count(distinct d.datname)
                               from pg_database d
                               join pg_stat_activity a on a.datname = d.datname
                              where d.datname like 'grc\\_essai\\_%';" | sql_admin)"
  [[ "$actives" == "0" ]] || alerte "$actives base(s) d'essai en cours d'utilisation : laissées en place."
  exit 0
fi

# ----------------------------------------------------------------------- rôles ----

# Les rôles sont de niveau CLUSTER : sur cette machine ils existent probablement déjà,
# créés par le lot L0 ou par une exécution précédente. On les constate sans les toucher.
creer_role() {
  local role="$1" attributs="$2" description="$3"

  if [[ "$(printf "select 1 from pg_roles where rolname = '%s';\n" "$role" | sql_admin)" == "1" ]]; then
    if [[ $REINITIALISER -eq 1 ]]; then
      printf "alter role %s password '%s';\n" "$role" "${MOT_DE_PASSE//\'/\'\'}" | sql_admin
      succes "$role — présent, mot de passe réinitialisé ($description)"
    else
      succes "$role — déjà présent, laissé tel quel ($description)"
    fi
    return
  fi

  printf "create role %s login %s password '%s';\n" \
    "$role" "$attributs" "${MOT_DE_PASSE//\'/\'\'}" | sql_admin
  succes "$role — créé ($description)"
}

info "Rôles (CONVENTIONS.md §14)"
# nosuperuser / nobypassrls / nocreaterole sont posés explicitement : c'est le
# cloisonnement par RLS qui en dépend, et un défaut d'attribut ne se voit pas.
creer_role "$PROPRIETAIRE" "nosuperuser nocreaterole nobypassrls" \
           "applique les migrations, propriétaire des objets"
creer_role "$APPLICATIF"   "nosuperuser nocreaterole nobypassrls nocreatedb" \
           "service applicatif : CRUD, sans DDL, sans BYPASSRLS"
creer_role "$LECTURE"      "nosuperuser nocreaterole nobypassrls nocreatedb" \
           "supervision et exports d'exploitation, lecture seule"

# CREATEDB sur le seul propriétaire, et seulement en développement : le banc d'essai
# (`test/aide/base.mjs`) crée une base neuve par fichier de test. En production, la
# base est créée une fois par deploy/install.sh sous le compte postgres, et le
# propriétaire n'a aucune raison de pouvoir en créer d'autres.
if [[ "$(printf "select rolcreatedb from pg_roles where rolname = '%s';\n" "$PROPRIETAIRE" | sql_admin)" == "t" ]]; then
  succes "$PROPRIETAIRE — attribut CREATEDB déjà posé"
else
  printf "alter role %s createdb;\n" "$PROPRIETAIRE" | sql_admin
  succes "$PROPRIETAIRE — attribut CREATEDB ajouté (développement : bases d'essai jetables)"
fi

# Vérification explicite : un rôle applicatif qui aurait hérité de BYPASSRLS ou de
# SUPERUSER rendrait tout le cloisonnement décoratif. Mieux vaut le refuser ici que
# de le découvrir à la porte de sécurité S1.
for role in "$APPLICATIF" "$LECTURE"; do
  anomalies="$(printf "select case when rolsuper then 'SUPERUSER ' else '' end
                            || case when rolbypassrls then 'BYPASSRLS ' else '' end
                       from pg_roles where rolname = '%s';\n" "$role" | sql_admin)"
  [[ -z "${anomalies// /}" ]] \
    || echec "Le rôle $role porte $anomalies : le cloisonnement par RLS serait sans effet.
      Corrigez avec : alter role $role nosuperuser nobypassrls;"
done
succes "aucun rôle applicatif porteur de SUPERUSER ou BYPASSRLS"

# ------------------------------------------------------------------------ base ----

info "Base « $BASE »"
existe="$(printf "select 1 from pg_database where datname = '%s';\n" "$BASE" | sql_admin)"

if [[ "$existe" == "1" && $RECREER -eq 1 ]]; then
  alerte "--recreer : suppression de la base « $BASE » et de tout son contenu."
  # Les connexions résiduelles empêchent le drop : on les coupe explicitement plutôt
  # que d'échouer sur un « database is being accessed by other users » obscur.
  printf "select pg_terminate_backend(pid) from pg_stat_activity where datname = '%s' and pid <> pg_backend_pid();\n" \
    "$BASE" | sql_admin >/dev/null
  printf 'drop database if exists %s;\n' "$BASE" | sql_admin
  existe=""
fi

if [[ "$existe" == "1" ]]; then
  proprietaire_actuel="$(printf "select pg_get_userbyid(datdba) from pg_database where datname = '%s';\n" "$BASE" | sql_admin)"
  if [[ "$proprietaire_actuel" != "$PROPRIETAIRE" ]]; then
    # Cas typique d'une base créée à la main, ou par install.sh qui la donne
    # aujourd'hui au rôle applicatif (voir le rapport de l'agent OUTILLAGE) : les
    # objets appartiendraient alors au compte du service, ce qui annule la couche 4
    # de la garantie d'ajout seul du journal (CONVENTIONS.md §12).
    alerte "La base « $BASE » appartient à « $proprietaire_actuel », pas à « $PROPRIETAIRE »."
    alerte "Les migrations créeraient des objets sous le mauvais propriétaire."
    alerte "Corrigez : alter database $BASE owner to $PROPRIETAIRE;  (ou relancez avec --recreer)"
  fi
  succes "base déjà présente, laissée en place (propriétaire : $proprietaire_actuel)"
else
  printf 'create database %s owner %s encoding UTF8;\n' "$BASE" "$PROPRIETAIRE" | sql_admin
  succes "base créée, propriétaire $PROPRIETAIRE"
fi

# ---------------------------------------------- privilèges de niveau base (§17.2) ----

# `create database` accorde par défaut à PUBLIC — donc à TOUT rôle — les privilèges
# `connect` ET `temporary`. Ce second est tout sauf anodin.
#
# CONVENTIONS.md §17.2, démontré à la porte de sécurité S1 : un rôle qui dispose de
# `temporary` crée une table dans le schéma `pg_temp`, que PostgreSQL consulte **avant**
# le `search_path` — y compris quand celui-ci est fixé à `public`, ce que fait pourtant
# le pool. Masquer une table du schéma revient donc à détourner les fonctions qui la
# lisent. Trois attaques ont été menées ainsi : forge d'une entrée du journal d'audit au
# chaînage rompu, désarmement du déclencheur de cohérence des mesures, et garde-fou de
# couverture RLS rendu aveugle sur un faux `pg_class`.
#
# La production fermait déjà la porte, mais **par effet de bord** : `deploy/install.sh`
# fait `revoke all on database … from public` pour d'autres raisons, et n'accorde ensuite
# que `connect` au rôle applicatif. Ici, c'est une décision, écrite comme telle — et le
# développement, la recette et le banc d'essai cessent de tourner dans une configuration
# plus permissive que la machine qu'ils sont censés représenter.
info "Privilèges de niveau base (CONVENTIONS.md §17.2)"
printf 'revoke all on database %s from public;\n' "$BASE" | sql_admin
printf 'grant connect, temporary on database %s to %s;\n' "$BASE" "$PROPRIETAIRE" | sql_admin
printf 'grant connect on database %s to %s, %s;\n' "$BASE" "$APPLICATIF" "$LECTURE" | sql_admin
succes "PUBLIC privé de tout sur « $BASE » ; connect accordé nommément"

# Constater, et pas seulement décréter : un « grant temporary » posé plus tard par
# commodité rouvrirait la porte en silence.
for role in "$APPLICATIF" "$LECTURE"; do
  accorde="$(printf "select has_database_privilege('%s', '%s', 'temporary');\n" "$role" "$BASE" | sql_admin)"
  [[ "$accorde" == "f" ]] || echec "Le rôle $role conserve TEMPORARY sur « $BASE ».
      Il pourrait masquer une table du schéma par pg_temp et détourner les fonctions du
      journal d'audit (CONVENTIONS.md §17.2). Corrigez :
        revoke temporary on database $BASE from $role, public;"
done
succes "$APPLICATIF et $LECTURE sans TEMPORARY — pg_temp ne peut pas masquer le schéma"

# Le propriétaire, lui, garde TEMPORARY : `db/verifier_cloisonnement.sql` s'appuie sur
# une table temporaire pour son tableau de résultats, et les migrations peuvent en avoir
# besoin. C'est le rôle qui applique la DDL, il n'y a rien à lui masquer qu'il ne puisse
# déjà modifier.
proprio_temp="$(printf "select has_database_privilege('%s', '%s', 'temporary');\n" "$PROPRIETAIRE" "$BASE" | sql_admin)"
[[ "$proprio_temp" == "t" ]] || alerte "$PROPRIETAIRE n'a pas TEMPORARY : verifier_cloisonnement.sql ne pourra pas être joué sous ce compte."

# --------------------------------------------------- vérification des connexions ----

# Le mot de passe demandé fonctionne-t-il réellement ? Sur une machine où les rôles
# préexistaient avec un autre secret, la réponse est non, et l'échec surviendrait
# plus loin — dans migrate.mjs — sous une forme moins explicite.
info "Connexion des rôles"
for role in "$PROPRIETAIRE" "$APPLICATIF" "$LECTURE"; do
  if PGPASSWORD="$MOT_DE_PASSE" psql -X -q -A -t -w \
       -h "${BASE_HOTE:-127.0.0.1}" -p "${BASE_PORT:-5432}" \
       -U "$role" -d "$BASE" -c 'select 1' >/dev/null 2>&1; then
    succes "$role"
  else
    echec "Le rôle $role ne se connecte pas à « $BASE » avec le mot de passe fourni.
      Le rôle préexistait sans doute avec un autre secret. Deux issues :
        - relancer avec --mot-de-passe '<le bon>' ;
        - relancer avec --reinitialiser-mots-de-passe (écrase le secret des trois rôles)."
  fi
done

# ------------------------------------------------------------------ migrations ----

if [[ $SANS_MIGRATION -eq 1 ]]; then
  info "Migrations non appliquées (--sans-migration)"
  printf '\nBase « %s » prête. Pour appliquer les migrations :\n' "$BASE"
  printf '  BASE_NOM=%s BASE_UTILISATEUR_PROPRIETAIRE=%s BASE_MOT_DE_PASSE_PROPRIETAIRE=… \\\n' \
    "$BASE" "$PROPRIETAIRE"
  printf '    node db/migrate.mjs\n'
  exit 0
fi

info "Migrations"
# Le mot de passe est passé par l'environnement du seul processus fils : il n'apparaît
# ni dans « ps », ni dans la sortie de migrate.mjs, qui n'affiche aucun secret.
BASE_NOM="$BASE" \
BASE_HOTE="${BASE_HOTE:-127.0.0.1}" \
BASE_PORT="${BASE_PORT:-5432}" \
BASE_UTILISATEUR_PROPRIETAIRE="$PROPRIETAIRE" \
BASE_MOT_DE_PASSE_PROPRIETAIRE="$MOT_DE_PASSE" \
BASE_UTILISATEUR="$APPLICATIF" \
  node "$RACINE_BACKEND/db/migrate.mjs"

# --------------------------------------------------------------------- rapport ----

cat <<FIN

Base de développement prête.

  Base ............ $BASE sur ${BASE_HOTE:-127.0.0.1}:${BASE_PORT:-5432}
  Propriétaire .... $PROPRIETAIRE   (migrations, DDL)
  Applicatif ...... $APPLICATIF          (CRUD, sans DDL, sans BYPASSRLS)
  Lecture ......... $LECTURE      (select)

  Mot de passe : celui fourni en argument, « dev » par défaut.
  ⚠️  Secret de DÉVELOPPEMENT. Il ne vaut que sur ce poste et en recette isolée.

Pour les tests :        cd $RACINE_BACKEND && npm test
Pour l'état du schéma : BASE_NOM=$BASE BASE_UTILISATEUR_PROPRIETAIRE=$PROPRIETAIRE \\
                        BASE_MOT_DE_PASSE_PROPRIETAIRE=… node db/migrate.mjs --verifier
FIN
