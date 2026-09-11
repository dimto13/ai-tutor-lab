#!/bin/sh
#
# Komfortables Shell-Skript fuer das Plattform- & Interaktions-Monitoring.
# Ermittelt Statistiken ueber Nutzerwachstum und Interaktionen aus AWS (Cognito, DynamoDB, AppSync)
# und trennt automatisch zwischen echten Kunden und internen Test-Accounts.
#
# Aufruf:
#   sh scripts/platform-monitoring.sh [Optionen]
#   npm run platform:monitoring [-- [Optionen]]
#

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

die() {
  printf '\nFEHLER: %s\n\n' "$1" >&2
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  die "Node.js ist nicht installiert oder nicht im PATH verfuegbar."
fi

if ! command -v aws >/dev/null 2>&1; then
  die "AWS CLI ist nicht installiert oder nicht im PATH verfuegbar."
fi

# Komfort-Flags des Wrappers werden nur an der ersten Position uebersetzt.
# Alle verbleibenden Argumente werden als getrennte, gequotete argv-Eintraege
# weitergereicht; es gibt kein eval und keine ungequotete Word-Splitting-Expansion.
if [ "$#" -gt 0 ]; then
  first=$1
  shift
  case "$first" in
    --customers) exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs" --view customers "$@" ;;
    --tests) exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs" --view tests "$@" ;;
    --emails) exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs" --list-emails "$@" ;;
    --mask) exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs" --mask-emails "$@" ;;
    --json-only) exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs" --quiet "$@" ;;
    --logins|-l) exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs" --logins "$@" ;;
    --timeline|-t) exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs" --timeline "$@" ;;
    *) exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs" "$first" "$@" ;;
  esac
fi

exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs"
