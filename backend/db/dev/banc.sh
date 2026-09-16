#!/usr/bin/env bash
#
# banc.sh — jouer le banc d'essai SANS l'enliser, et sans le figer.
#
# ── Pourquoi ce script existe ───────────────────────────────────────────────
#
# Deux défauts mesurés le 16/09/2026, et ils n'ont pas la même nature :
#
#  1. **La concurrence par défaut enlise la machine.** `node --test` lance les
#     seize familles navigateur presque en même temps, soit une trentaine de
#     Chromium : 134 Mio libres sur 7 892, et des familles bloquées 45 minutes
#     en ayant consommé 5 secondes de processeur. Elles n'attendaient pas un
#     calcul, elles attendaient un navigateur que la machine ne pouvait plus
#     démarrer.
#
#  2. **Mais tout jouer en série coûte 15 min pour rien.** Mesuré : les 115
#     familles SANS navigateur passent en **126 s à concurrence 4** ; les 19 qui
#     lancent Chromium prennent **520 s** et doivent rester en série. 80 % du
#     temps vient de 14 % des fichiers.
#
#  D'où les deux passes. Total ≈ 11 min au lieu de 15, et surtout : la machine
#  ne s'affame pas.
#
# ── ⚠️ ET LE DÉLAI DE GARDE, QUI EST LE PLUS IMPORTANT ─────────────────────
#
# Un banc a tourné **6 h 03** sur cette machine, figé sur un fichier qui passe
# en 6 secondes quand on le joue seul. La cause était la contention — deux bancs
# complets lancés en parallèle —, mais le SYMPTÔME est le vrai défaut :
# `node --test` n'a pas de délai de garde, donc un essai affamé attend pour
# toujours au lieu d'échouer.
#
# *Un essai doit ROUGIR, jamais se figer* — c'est la leçon des constats Q-251 et
# Q-327, et elle vaut pour le banc lui-même.
#
# Invocation :  bash db/dev/banc.sh            (tout)
#               bash db/dev/banc.sh rapide     (sans les familles navigateur)
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# shellcheck disable=SC1090
set -a; source ~/.grc-essais.env; set +a

# Un fichier d'essai qui dépasse cela est FIGÉ, pas lent : le plus long mesuré
# seul est de 35 s, on laisse donc une marge de dix.
DELAI_MS=${BANC_DELAI_MS:-360000}

NAVIGATEUR=$(ls test/navigateur/*.test.mjs test/modules/*.test.mjs 2>/dev/null)
AUTRES=$(ls test/**/*.test.mjs | grep -vE "test/(navigateur|modules)/")

code=0

printf '\n\033[1;34m==>\033[0m Passe 1 — %s familles sans navigateur, concurrence 4\n' \
       "$(echo "$AUTRES" | wc -l)"
d0=$(date +%s)
# shellcheck disable=SC2086
node --test --test-reporter=spec --test-concurrency=4 --test-timeout="$DELAI_MS" $AUTRES \
  || code=1
printf '\033[1;34m    %s s\033[0m\n' "$(( $(date +%s) - d0 ))"

if [ "${1:-}" = "rapide" ]; then
  printf '\n\033[1;33m  !!\033[0m Passe 2 SAUTÉE (mode « rapide ») : les familles navigateur\n'
  printf '     ne sont PAS jouées. Ne pas commiter sur cette seule base.\n'
  exit "$code"
fi

printf '\n\033[1;34m==>\033[0m Passe 2 — %s familles navigateur, EN SÉRIE (obligatoire)\n' \
       "$(echo "$NAVIGATEUR" | wc -l)"
d0=$(date +%s)
# shellcheck disable=SC2086
node --test --test-reporter=spec --test-concurrency=1 --test-timeout="$DELAI_MS" $NAVIGATEUR \
  || code=1
printf '\033[1;34m    %s s\033[0m\n' "$(( $(date +%s) - d0 ))"

exit "$code"
