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
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

die() {
  printf '\nFEHLER: %s\n\n' "$1" >&2
  exit 1
}

# 1. Voraussetzungen pruefen
if ! command -v node >/dev/null 2>&1; then
  die "Node.js ist nicht installiert oder nicht im PATH verfuegbar."
fi

if ! command -v aws >/dev/null 2>&1; then
  die "AWS CLI ist nicht installiert oder nicht im PATH verfuegbar."
fi

# 2. Argument-Vorverarbeitung fuer bequeme Shell-Flags
NODE_ARGS=""
for arg in "$@"; do
  case "$arg" in
    --customers)
      NODE_ARGS="$NODE_ARGS --view customers"
      ;;
    --tests)
      NODE_ARGS="$NODE_ARGS --view tests"
      ;;
    --emails)
      NODE_ARGS="$NODE_ARGS --list-emails"
      ;;
    --mask)
      NODE_ARGS="$NODE_ARGS --mask-emails"
      ;;
    --json-only)
      NODE_ARGS="$NODE_ARGS --quiet"
      ;;
    --logins|-l)
      NODE_ARGS="$NODE_ARGS --logins"
      ;;
    --timeline|-t)
      NODE_ARGS="$NODE_ARGS --timeline"
      ;;
    *)
      NODE_ARGS="$NODE_ARGS $arg"
      ;;
  esac
done

# 3. Node-Skript ausfuehren
# shellcheck disable=SC2086
exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs" $NODE_ARGS
