#!/usr/bin/env bash
# =============================================================================
#  Rétention du journal d'audit — archivage d'un segment, sous le PROPRIÉTAIRE.
# =============================================================================
#
#   bash retention.sh --annee 2023
#   bash retention.sh --annee 2023 --simuler         ne change rien, dit ce qu'il ferait
#   bash retention.sh --annee 2023 --repertoire /mnt/coffre
#   bash retention.sh --aide
#
# ── Pourquoi ce script existe, et pourquoi il n'est pas dans le serveur ───────
#
# `db/CONVENTIONS.md` §12 : la rétention à trois ans est **incompatible avec un
# `delete`** ordinaire. Le journal d'audit est en ajout seul, garanti par quatre
# couches cumulatives, dont la quatrième est : *« le rôle applicatif n'est pas
# propriétaire de la table — seul le propriétaire peut `alter table … disable
# trigger` »*. Déplacer cette procédure dans le serveur reviendrait à donner à
# l'API le pouvoir d'effacer le registre qui la juge. Le lot L13 l'**outille**
# (§35.4) ; il ne la déplace pas.
#
# ── Les quatre étapes du §12, et ce que ce script y ajoute ───────────────────
#
#   1. exporter le segment à archiver (`\copy`), avec son empreinte de fin ;
#   2. enregistrer l'empreinte du DERNIER MAILLON ARCHIVÉ dans `parametres`
#      (clé `journal.ancrage_<annee>`, portée Groupe) — c'est ce qui permet de
#      vérifier la chaîne DE PART ET D'AUTRE de la coupure ;
#   3. désactiver explicitement les déclencheurs, supprimer le segment, les
#      réactiver ;
#   4. journaliser l'opération elle-même (action `purge`).
#
# Ce que ce script ajoute, et qui n'est pas dans le §12 :
#
#   · **les étapes 2 à 4 tiennent dans UNE transaction, et elle ne valide que si
#     la chaîne se vérifie des deux côtés de la coupure.** Un archivage qui
#     supprimerait le segment puis découvrirait la chaîne rompue aurait détruit la
#     seule preuve qu'elle était saine. On coupe, on vérifie, et l'on annule si la
#     vérification n'est pas celle qu'on attend ;
#   · **la chaîne est vérifiée AVANT de couper**, et la coupure précédente avec
#     elle : si un ancrage existe déjà, l'empreinte du premier maillon survivant
#     doit lui correspondre. On n'archive pas par-dessus une chaîne déjà rompue ;
#   · **le dernier maillon ne s'archive jamais.** Vider la table entière ferait
#     repartir `f_journal_audit_chainage()` de `max(numero) + 1` sur une table
#     vide, c'est-à-dire de **1**, avec une `empreinte_precedente` nulle : une
#     genèse parfaitement cohérente, et une chaîne coupée de son passé sans
#     qu'aucune anomalie ne le dise. Le script refuse ;
#   · **les déclencheurs se réarment par DÉCOUVERTE**, via `f_armer_declencheurs()`
#     — la fonction du socle, pilotée par le catalogue. `alter table … enable
#     trigger` les remettrait en « origin » et non en « always » : un
#     `set session_replication_role = replica` les désarmerait de nouveau, et la
#     garantie d'ajout seul aurait été perdue par le geste censé la préserver.
#     `f_verifier_armement()` le constate avant la validation.
#
# ── Ce que le script NE fait pas ─────────────────────────────────────────────
#
# Il ne décide pas de la durée de rétention : l'exploitant nomme l'année à
# archiver. Trois ans est la valeur du `PLAN_SERVEUR` §1.7 ; c'est une politique,
# pas une constante de programme.
#
# Il ne chiffre ni ne déplace l'archive : le fichier est écrit là où on le lui
# dit, avec son empreinte SHA-256 à côté. Le transport vers le coffre appartient
# à la sauvegarde de la VM.
#
# ── Configuration ────────────────────────────────────────────────────────────
#
# Les valeurs viennent de `/etc/cyber-grc/env` (le fichier de `deploy/install.sh`,
# non interprété par le shell), et **l'environnement les emporte** quand il les
# fournit — c'est ce qui rend le script jouable sur une base d'essai :
#
#   BASE_HOTE · BASE_PORT · BASE_NOM
#   BASE_UTILISATEUR_PROPRIETAIRE · BASE_MOT_DE_PASSE_PROPRIETAIRE
#
# `CYBER_GRC_CONFIG` déplace le répertoire de configuration, comme dans
# `install.sh`. Le mot de passe ne passe jamais en argument de commande : il est
# posé dans `PGPASSWORD` du seul processus fils, invisible de `ps`.
# =============================================================================

set -Eeuo pipefail

# ------------------------------------------------------------------ réglages ----

CONFIG="${CYBER_GRC_CONFIG:-/etc/cyber-grc}"
FICHIER_CONFIG="$CONFIG/env"
REPERTOIRE_DEFAUT="/var/backups/cyber-grc/journal"

ANNEE=""
REPERTOIRE="$REPERTOIRE_DEFAUT"
SIMULER=0

info()   { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
succes() { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
alerte() { printf '\033[1;33m  !!\033[0m %s\n' "$*" >&2; }
echec()  { printf '\033[1;31m ERR\033[0m %s\n' "$*" >&2; exit 1; }

aide() {
  sed -n '2,80p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --annee)       ANNEE="${2:-}"; shift 2 ;;
    --repertoire)  REPERTOIRE="${2:-}"; shift 2 ;;
    --simuler)     SIMULER=1; shift ;;
    --aide|-h)     aide ;;
    *)             echec "Option inconnue : $1 (voir --aide)." ;;
  esac
done

[[ "$ANNEE" =~ ^[0-9]{4}$ ]] \
  || echec "--annee est obligatoire et s'écrit sur quatre chiffres (ex. --annee 2023)."

# ⚠️ LE CHEMIN FINIT DANS UN LITTÉRAL SQL, et ce script s'exécute sous le
# propriétaire, déclencheurs désarmés. Un répertoire portant une apostrophe
# refermerait la chaîne du `\copy` et de la description de l'ancrage : c'est la
# surface d'injection la plus dangereuse du dépôt, parce qu'elle est ouverte au
# seul compte qui peut réécrire le journal d'audit. On refuse plutôt que d'échapper
# — un exploitant n'a aucune raison de nommer ainsi un répertoire d'archives, et
# refuser ne se trompe pas.
case "$REPERTOIRE" in
  *"'"*|*'"'*|*'$'*|*'`'*|*'\'*|*$'\n'*)
    echec "--repertoire ne peut contenir ni apostrophe, ni guillemet, ni « \$ », ni « \` »,
      ni contre-oblique, ni saut de ligne : ce chemin est interpolé dans du SQL joué
      sous le compte propriétaire." ;;
esac

command -v psql      >/dev/null 2>&1 || echec "psql est absent du PATH."
command -v sha256sum >/dev/null 2>&1 || echec "sha256sum est absent du PATH."

# ------------------------------------------------ lecture du fichier de config ----
#
# Même lecture que `install.sh` : le fichier n'est PAS interprété par le shell.
# `source` exécuterait ce qu'il contient, et il est lu ici sous un compte qui a le
# droit de supprimer des lignes du journal d'audit.

lire_variable() {
  local cle="$1" valeur="" ligne
  [[ -f "$FICHIER_CONFIG" ]] || { printf ''; return 0; }
  while IFS= read -r ligne || [[ -n "$ligne" ]]; do
    if [[ "$ligne" =~ ^[[:space:]]*${cle}=(.*)$ ]]; then
      valeur="${BASH_REMATCH[1]}"
    fi
  done < "$FICHIER_CONFIG"
  valeur="${valeur%$'\r'}"
  [[ "$valeur" == \"*\" ]] && valeur="${valeur:1:${#valeur}-2}"
  printf '%s' "$valeur"
}

# L'ENVIRONNEMENT L'EMPORTE, et c'est ce qui rend le script éprouvable : le banc
# lui donne une base d'essai sans écrire dans /etc.
reglage() {
  local cle="$1" defaut="${2:-}" depuis_env="${!1:-}"
  if [[ -n "$depuis_env" ]]; then printf '%s' "$depuis_env"; return 0; fi
  local depuis_fichier; depuis_fichier="$(lire_variable "$cle")"
  printf '%s' "${depuis_fichier:-$defaut}"
}

PGHOTE="$(reglage BASE_HOTE 127.0.0.1)"
PGPORT_="$(reglage BASE_PORT 5432)"
PGBASE="$(reglage BASE_NOM cyber_grc)"
PGROLE="$(reglage BASE_UTILISATEUR_PROPRIETAIRE grc_proprietaire)"
PGMDP="$(reglage BASE_MOT_DE_PASSE_PROPRIETAIRE)"

[[ -n "$PGBASE" && -n "$PGROLE" ]] || echec "BASE_NOM et BASE_UTILISATEUR_PROPRIETAIRE sont requis."

# Un seul point de passage vers la base. `-v ON_ERROR_STOP=1` : une erreur au
# milieu d'un script transactionnel doit interrompre, pas continuer sur une
# transaction avortée en annonçant un succès.
psql_proprietaire() {
  PGPASSWORD="$PGMDP" psql -X -w -v ON_ERROR_STOP=1 \
    -h "$PGHOTE" -p "$PGPORT_" -U "$PGROLE" -d "$PGBASE" "$@"
}

# Une valeur scalaire, sans décor.
valeur() {
  psql_proprietaire -q -A -t -c "$1"
}

# =============================================================================
#  1. Le compte est-il bien le PROPRIÉTAIRE ?
# =============================================================================
#
# C'est la couche 4 de la garantie d'ajout seul. Un script qui tournerait sous le
# compte applicatif échouerait plus loin, sur un `permission denied for table
# journal_audit` — un message qui ne dit pas ce qu'il faut faire. On le dit ici.

info "Compte et base"
EST_PROPRIETAIRE="$(valeur 'select f_est_proprietaire_base()')"
[[ "$EST_PROPRIETAIRE" == "t" ]] || echec \
  "Le rôle « $PGROLE » n'est pas le propriétaire de « $PGBASE ».
      La rétention du journal d'audit passe par le propriétaire, et par lui seul
      (CONVENTIONS.md §12, couche 4) : le rôle applicatif n'a ni « delete » sur
      journal_audit, ni le droit de désarmer un déclencheur."
succes "$PGROLE est propriétaire de $PGBASE"

# =============================================================================
#  2. La chaîne est-elle saine AVANT qu'on y touche ?
# =============================================================================
#
# ⚠️ Ce contrôle est la raison d'être de l'ordre choisi. Archiver un segment
# détruit la seule preuve directe qu'il était intact : si la chaîne était déjà
# rompue, on ne le saurait plus jamais. On refuse donc d'archiver par-dessus une
# anomalie.
#
# UNE anomalie est attendue et légitime : « chaine_tronquee » sur le premier
# maillon survivant, quand un archivage a déjà eu lieu. Le §12 la range
# explicitement en *informatif*. Toutes les autres accusent.

info "Vérification de la chaîne avant coupure"
ACCUSATRICES="$(valeur "select count(*) from f_journal_audit_verifier() where anomalie <> 'chaine_tronquee'")"
if [[ "$ACCUSATRICES" != "0" ]]; then
  psql_proprietaire -c "select numero_entree, anomalie, detail from f_journal_audit_verifier() where anomalie <> 'chaine_tronquee' limit 20" || true
  echec "La chaîne du journal porte $ACCUSATRICES anomalie(s) accusatrice(s).
      L'archivage est REFUSÉ : couper maintenant détruirait la seule preuve de
      l'état antérieur. Faites constater les anomalies ci-dessus avant toute
      opération de rétention."
fi
succes "aucune anomalie accusatrice"

# ── La coupure PRÉCÉDENTE tient-elle encore ? ───────────────────────────────
#
# C'est la seconde moitié de « vérifier la chaîne de part et d'autre de la
# coupure » : l'ancrage enregistré doit correspondre à l'`empreinte_precedente`
# du premier maillon survivant. Sans ce contrôle, l'ancrage serait un chiffre
# qu'on écrit et que personne ne relit.

PREMIER_NUMERO="$(valeur "select coalesce(min(numero)::text, '') from journal_audit")"
if [[ -z "$PREMIER_NUMERO" ]]; then
  echec "Le journal d'audit est vide : il n'y a rien à archiver, et rien à vérifier."
fi

if [[ "$PREMIER_NUMERO" != "1" ]]; then
  ANCRAGE_ATTENDU="$(valeur "select coalesce((select empreinte_precedente from journal_audit order by numero limit 1), '')")"
  ANCRAGE_ENREGISTRE="$(valeur "select coalesce((select valeur from parametres where filiale_id is null and cle like 'journal.ancrage_%' order by cle desc limit 1), '')")"
  if [[ -z "$ANCRAGE_ENREGISTRE" ]]; then
    alerte "La chaîne démarre au maillon $PREMIER_NUMERO — un segment a donc déjà été archivé —
      et AUCUN ancrage n'est enregistré dans « parametres ». La coupure précédente
      n'est plus vérifiable : c'est un constat, pas un blocage, mais il doit être écrit."
  elif [[ "$ANCRAGE_ENREGISTRE" != "$ANCRAGE_ATTENDU" ]]; then
    echec "L'ancrage enregistré ne correspond PAS au premier maillon survivant.
      ancrage en base    : $ANCRAGE_ENREGISTRE
      empreinte attendue : $ANCRAGE_ATTENDU
      La coupure précédente est rompue, ou l'archive n'est pas celle qu'on croit.
      L'archivage est refusé."
  else
    succes "la coupure précédente tient : le maillon $PREMIER_NUMERO se rattache à l'ancrage"
  fi
fi

# =============================================================================
#  3. Le segment à archiver
# =============================================================================
#
# Borne EXCLUSIVE au 1er janvier de l'année suivante : « --annee 2023 » archive
# tout ce qui est antérieur au 2024-01-01. La borne est calculée par PostgreSQL,
# pas par le shell — les fuseaux et les changements d'heure ne sont pas un sujet
# de script.

BORNE="$(printf '%d-01-01' $((10#$ANNEE + 1)))"

LIGNE_SEGMENT="$(psql_proprietaire -q -A -t -F '|' -c "
  select coalesce(max(numero)::text, ''), count(*)::text,
         coalesce(min(horodatage)::date::text, ''), coalesce(max(horodatage)::date::text, '')
    from journal_audit where horodatage < timestamptz '$BORNE'")"

NUMERO_FIN="${LIGNE_SEGMENT%%|*}"; RESTE="${LIGNE_SEGMENT#*|}"
NB_LIGNES="${RESTE%%|*}";          RESTE="${RESTE#*|}"
DATE_MIN="${RESTE%%|*}"
DATE_MAX="${RESTE#*|}"

info "Segment antérieur au $BORNE"
if [[ "$NB_LIGNES" == "0" || -z "$NUMERO_FIN" ]]; then
  succes "aucune entrée antérieure au $BORNE : rien à archiver"
  exit 0
fi
succes "$NB_LIGNES entrée(s), du $DATE_MIN au $DATE_MAX, jusqu'au maillon $NUMERO_FIN"

# ── ⚠️ LE DERNIER MAILLON NE S'ARCHIVE JAMAIS ──────────────────────────────
#
# Vider la table entière ferait repartir la numérotation à 1 avec une empreinte
# précédente nulle — une genèse cohérente, donc une chaîne coupée de son passé
# SANS qu'aucune anomalie ne le signale. C'est le pire des cas : la falsification
# la plus grossière deviendrait indétectable, et le produit l'aurait faite lui-même.
NUMERO_MAX="$(valeur 'select max(numero) from journal_audit')"
if [[ "$NUMERO_FIN" == "$NUMERO_MAX" ]]; then
  echec "Le segment demandé couvre TOUTE la table (jusqu'au maillon $NUMERO_MAX, qui est le dernier).
      Refusé : une table vidée fait repartir la numérotation à 1 avec une empreinte
      précédente nulle, c'est-à-dire une genèse cohérente. La chaîne serait coupée de
      son passé sans qu'aucune anomalie ne le dise. Choisissez une année plus ancienne."
fi

EMPREINTE_FIN="$(valeur "select empreinte from journal_audit where numero = $NUMERO_FIN")"
[[ "$EMPREINTE_FIN" =~ ^[0-9a-f]{64}$ ]] \
  || echec "Le maillon $NUMERO_FIN ne porte pas une empreinte SHA-256 : chaîne incohérente."
succes "empreinte du dernier maillon archivé : ${EMPREINTE_FIN:0:16}…"

# ── Ce que la base a rendu, RELU AVANT d'être interpolé ────────────────────
#
# Ces valeurs viennent de PostgreSQL et non de l'exploitant : elles sont sûres
# aujourd'hui. Le contrôle est là pour qu'elles le restent le jour où quelqu'un
# ajoutera un champ à `LIGNE_SEGMENT` — un `$DATE_MIN` libre s'interpolerait dans
# la description de l'ancrage sans que rien ne le dise.
[[ "$PREMIER_NUMERO" =~ ^[0-9]+$ && "$NUMERO_FIN" =~ ^[0-9]+$ && "$NB_LIGNES" =~ ^[0-9]+$ ]] \
  || echec "Numéros de segment illisibles : « $PREMIER_NUMERO », « $NUMERO_FIN », « $NB_LIGNES »."
[[ "$DATE_MIN" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && "$DATE_MAX" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] \
  || echec "Bornes de dates illisibles : « $DATE_MIN » … « $DATE_MAX »." 

if [[ $SIMULER -eq 1 ]]; then
  info "Simulation — rien n'a été écrit"
  printf '  segment      : maillons %s..%s (%s entrée(s))\n' "$PREMIER_NUMERO" "$NUMERO_FIN" "$NB_LIGNES"
  printf '  ancrage      : journal.ancrage_%s = %s\n' "$ANNEE" "$EMPREINTE_FIN"
  printf '  fichier      : %s/journal-audit-%s-%s-%s.csv\n' "$REPERTOIRE" "$ANNEE" "$PREMIER_NUMERO" "$NUMERO_FIN"
  printf '  survivants   : à partir du maillon %s\n' "$((NUMERO_FIN + 1))"
  exit 0
fi

# =============================================================================
#  4. Étape 1 du §12 — EXPORTER le segment
# =============================================================================
#
# `\copy` et non `copy … to '<fichier>'` : la seconde forme écrit avec les droits
# du SERVEUR et exige `pg_write_server_files` ou le superutilisateur, que le
# propriétaire n'a pas (`install.sh` le vérifie : « nosuperuser »). `\copy` écrit
# côté client, sous le compte qui joue ce script.
#
# `force_quote *` : toute valeur est citée. Le journal contient des `resume` et des
# charges `jsonb` qui portent des points-virgules, des guillemets et — la porte S3
# l'a mesuré sur un login forgé — des sauts de ligne. Une archive dont une entrée
# est coupée en deux n'est plus une preuve.

mkdir -p "$REPERTOIRE"
FICHIER="$REPERTOIRE/journal-audit-$ANNEE-$PREMIER_NUMERO-$NUMERO_FIN.csv"

info "Export du segment"
# ⚠️ **Pas de `-q` ici**, et c'est mesuré : le mode silencieux de psql supprime le
# compte « COPY n », c'est-à-dire la seule preuve que l'archive porte bien le nombre
# d'entrées annoncé. Un archivage dont on ne peut pas compter les lignes n'est pas
# un archivage, c'est une suppression avec un fichier à côté.
SORTIE_COPY="$(psql_proprietaire -c "\\copy (select * from journal_audit where numero <= $NUMERO_FIN order by numero) to '$FICHIER' with (format csv, header, force_quote *)")"
LIGNES_COPIEES="$(printf '%s' "$SORTIE_COPY" | sed -n 's/^COPY \([0-9]\+\)$/\1/p' | tail -1)"

[[ -n "$LIGNES_COPIEES" ]] || echec "\\copy n'a pas rendu de compte de lignes : archive non vérifiable."
[[ "$LIGNES_COPIEES" == "$NB_LIGNES" ]] || echec \
  "L'archive porte $LIGNES_COPIEES ligne(s) là où le segment en compte $NB_LIGNES.
      Rien n'a été supprimé. Vérifiez $FICHIER."
[[ -s "$FICHIER" ]] || echec "L'archive $FICHIER est vide."

chmod 0600 "$FICHIER"
EMPREINTE_FICHIER="$(sha256sum "$FICHIER" | cut -d' ' -f1)"
[[ "$EMPREINTE_FICHIER" =~ ^[0-9a-f]{64}$ ]] \
  || echec "sha256sum n'a pas rendu une empreinte exploitable pour $FICHIER."
printf '%s  %s\n' "$EMPREINTE_FICHIER" "$(basename "$FICHIER")" > "$FICHIER.sha256"
chmod 0600 "$FICHIER.sha256"
succes "$LIGNES_COPIEES ligne(s) écrites dans $FICHIER (sha256 ${EMPREINTE_FICHIER:0:16}…)"

# =============================================================================
#  5. Étapes 2 à 4 du §12 — ANCRER, SUPPRIMER, JOURNALISER : UNE transaction
# =============================================================================
#
# Le §12 les énumère dans cet ordre ; ce script les tient **ensemble**. Motif : si
# la vérification finale échoue, il ne doit rester ni segment supprimé, ni ancrage
# écrit pour une coupure qui n'a pas eu lieu. La validation n'a lieu que si la
# chaîne se vérifie DES DEUX CÔTÉS de la coupure — c'est-à-dire :
#
#   · l'ancrage enregistré = l'empreinte du dernier maillon ARCHIVÉ ;
#   · l'`empreinte_precedente` du premier maillon SURVIVANT = ce même ancrage ;
#   · aucune anomalie accusatrice parmi les survivants ;
#   · tous les déclencheurs réarmés en « always ».
#
# `\set ON_ERROR_STOP` est posé plus haut : un `raise exception` annule tout.

info "Ancrage, suppression, trace — une seule transaction"
psql_proprietaire -q <<SQL
begin;

select set_config('grc.utilisateur',           'retention_journal', true),
       set_config('grc.filiale_id',            '',                  true),
       set_config('grc.filiales',              '',                  true),
       set_config('grc.administration_groupe', 'oui',               true);

-- ── Étape 2 : l'ANCRAGE, clé journal.ancrage_<annee>, portée Groupe ────────
--
-- « on conflict … do update » plutôt qu'un refus : la rétention tourne
-- périodiquement, et deux passages d'une même année sont le cas NOMINAL — on
-- archive jusqu'à juin, puis jusqu'à juillet. L'ancrage est par définition le
-- dernier maillon archivé : il AVANCE. La valeur précédente est conservée dans la
-- description, pour qu'une chaîne d'archives reste reconstituable.
insert into parametres (id, filiale_id, categorie, cle, valeur, type_valeur, libelle, description, modifiable)
values (f_generer_id('PARAM'), null, 'journal', 'journal.ancrage_$ANNEE',
        '$EMPREINTE_FIN', 'texte',
        'Empreinte du dernier maillon du journal archivé pour $ANNEE',
        'Segment archivé jusqu''au maillon $NUMERO_FIN ($NB_LIGNES entrées, du $DATE_MIN au $DATE_MAX). '
        'Archive : $(basename "$FICHIER") — sha256 $EMPREINTE_FICHIER. '
        'Permet de vérifier la chaîne de part et d''autre de la coupure (CONVENTIONS.md §12).',
        false)
on conflict on constraint uq_parametres_cle do update
   set valeur      = excluded.valeur,
       categorie   = excluded.categorie,
       libelle     = excluded.libelle,
       description = excluded.description || ' Ancrage précédent : ' || coalesce(parametres.valeur, '(aucun)') || '.';

-- ── Étape 3 : DÉSARMER, SUPPRIMER, RÉARMER ────────────────────────────────
--
-- Les déclencheurs à désarmer sont DÉCOUVERTS dans pg_trigger : ceux qui portent
-- sur la SUPPRESSION (bit 8 de tgtype), non internes, sur cette table-là. Une
-- liste de noms écrite ici vieillirait au premier déclencheur ajouté — et ce qui
-- arriverait alors n'est pas un échec bruyant : c'est GRC01 en pleine
-- exploitation, ou pire, un déclencheur oublié désarmé.
do \$\$
declare r record;
begin
    for r in select t.tgname
               from pg_trigger t
              where t.tgrelid = 'journal_audit'::regclass
                and not t.tgisinternal
                and (t.tgtype & 8) <> 0
    loop
        execute format('alter table journal_audit disable trigger %I', r.tgname);
    end loop;
end;
\$\$;

delete from journal_audit where numero <= $NUMERO_FIN;

-- Réarmement PAR DÉCOUVERTE. « alter table … enable trigger » remettrait le
-- déclencheur en « origin » : « set session_replication_role = replica » le
-- désarmerait de nouveau, et la couche 3 de la garantie d'ajout seul aurait été
-- perdue par le geste censé la préserver. f_armer_declencheurs() pose « always »
-- sur TOUT déclencheur du schéma qui ne l'est pas — aucune liste à tenir.
select f_armer_declencheurs();

-- ── Étape 4 : JOURNALISER l'opération ─────────────────────────────────────
--
-- Dans la même transaction : pas de suppression sans sa trace, pas de trace sans
-- sa suppression. L'entrée est TRANSVERSALE (filiale_id nul) — l'archivage porte
-- sur le journal du groupe entier, et pol_journal_audit_lecture rend les entrées
-- sans filiale au seul périmètre Groupe.
--
-- Le déclencheur de chaînage lui attribue numero = max(numero) + 1 sur les
-- SURVIVANTS : elle se rattache donc au maillon qui suit la coupure.
insert into journal_audit (filiale_id, utilisateur_libelle, action, entite_type, resume, valeurs_apres)
values (null, 'retention_journal', 'purge', 'parametres',
        'Rétention du journal d''audit : segment archivé, ancré, puis supprimé sous le compte propriétaire.',
        jsonb_build_object(
            'annee',              '$ANNEE',
            'borne_exclusive',    '$BORNE',
            'numero_debut',       $PREMIER_NUMERO,
            'numero_fin',         $NUMERO_FIN,
            'entrees_archivees',  $NB_LIGNES,
            'ancrage',            '$EMPREINTE_FIN',
            'archive',            '$(basename "$FICHIER")',
            'archive_sha256',     '$EMPREINTE_FICHIER'));

-- ── LA VÉRIFICATION, DES DEUX CÔTÉS DE LA COUPURE ─────────────────────────
--
-- Elle a lieu AVANT la validation. Si l'une des quatre propriétés manque, le
-- « raise » annule la transaction : le segment revient, l'ancrage aussi, et
-- l'archive sur disque reste — on n'aura rien perdu, et on saura pourquoi.
do \$\$
declare
    v_premier      record;
    v_ancrage      text;
    v_accusatrices integer;
    v_desarmes     integer;
begin
    select numero, empreinte_precedente into v_premier
      from journal_audit order by numero limit 1;
    if v_premier.numero is null then
        raise exception 'Le journal est vide après la coupure : la chaîne a perdu son point '
                        'de rattachement. Transaction annulée.';
    end if;
    if v_premier.numero <> $NUMERO_FIN + 1 then
        raise exception 'Le premier maillon survivant est le n° %, attendu n° %. La coupure '
                        'n''est pas celle qui était calculée.', v_premier.numero, $NUMERO_FIN + 1;
    end if;

    select valeur into v_ancrage
      from parametres where filiale_id is null and cle = 'journal.ancrage_$ANNEE';
    if v_ancrage is distinct from '$EMPREINTE_FIN' then
        raise exception 'L''ancrage enregistré (%) n''est pas l''empreinte du dernier maillon '
                        'archivé (%).', coalesce(v_ancrage, '(aucun)'), '$EMPREINTE_FIN';
    end if;
    if v_premier.empreinte_precedente is distinct from v_ancrage then
        raise exception 'CÔTÉ SURVIVANT : le maillon n° % déclare l''empreinte précédente %, '
                        'l''ancrage vaut %. La chaîne ne se rattache pas de part et d''autre '
                        'de la coupure.', v_premier.numero,
                        coalesce(v_premier.empreinte_precedente, '(nulle)'), v_ancrage;
    end if;

    select count(*) into v_accusatrices
      from f_journal_audit_verifier() where anomalie <> 'chaine_tronquee';
    if v_accusatrices <> 0 then
        raise exception 'La chaîne survivante porte % anomalie(s) accusatrice(s) après la '
                        'coupure. Transaction annulée.', v_accusatrices;
    end if;

    select count(*) into v_desarmes from f_verifier_armement();
    if v_desarmes <> 0 then
        raise exception '% déclencheur(s) ne sont plus armés en « always » : la garantie '
                        'd''ajout seul serait perdue par le geste censé la préserver.', v_desarmes;
    end if;

    raise notice 'Coupure vérifiée des deux côtés : ancrage %, premier survivant n° %.',
                 left(v_ancrage, 16) || '…', v_premier.numero;
end;
\$\$;

commit;
SQL

succes "segment supprimé, ancrage écrit, opération journalisée"

# =============================================================================
#  6. Le contrôle d'après — hors de la transaction qui vient de valider
# =============================================================================
#
# Un contrôle joué dans la transaction qui l'a produite mesure une intention.
# Celui-ci mesure ce qui est VALIDÉ, sur une connexion neuve. Les deux comptent :
# le premier décide de valider, le second dit à l'exploitant ce qu'il a en base.

info "Contrôle après validation"
RESTE_ACCUSATRICES="$(valeur "select count(*) from f_journal_audit_verifier() where anomalie <> 'chaine_tronquee'")"
[[ "$RESTE_ACCUSATRICES" == "0" ]] || echec "La chaîne validée porte $RESTE_ACCUSATRICES anomalie(s) : à faire constater."

TRONQUEE="$(valeur "select count(*) from f_journal_audit_verifier() where anomalie = 'chaine_tronquee'")"
RATTACHE="$(valeur "select case when (select empreinte_precedente from journal_audit order by numero limit 1)
                               = (select valeur from parametres where filiale_id is null and cle = 'journal.ancrage_$ANNEE')
                          then 'oui' else 'non' end")"
[[ "$RATTACHE" == "oui" ]] || echec "Le premier maillon survivant ne se rattache pas à l'ancrage."

succes "chaîne saine ; $TRONQUEE mention(s) « chaine_tronquee » (informatif, §12) ; ancrage rattaché"

RESTANTES="$(valeur 'select count(*) from journal_audit')"
info "Bilan"
printf '  archive       : %s\n' "$FICHIER"
printf '  empreinte     : %s\n' "$EMPREINTE_FICHIER"
printf '  archivées     : %s entrée(s), maillons %s..%s\n' "$NB_LIGNES" "$PREMIER_NUMERO" "$NUMERO_FIN"
printf '  restantes     : %s entrée(s), à partir du maillon %s\n' "$RESTANTES" "$((NUMERO_FIN + 1))"
printf '  ancrage       : journal.ancrage_%s\n' "$ANNEE"
succes "rétention $ANNEE terminée"
