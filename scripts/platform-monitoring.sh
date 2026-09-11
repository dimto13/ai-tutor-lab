#!/bin/sh
#
# Komfortables Shell-Skript fuer das Plattform- & Interaktions-Monitoring.
# Ermittelt Statistiken ueber Nutzerwachstum und Interaktionen aus AWS (Cognito, DynamoDB, AppSync)
# und trennt automatisch zwischen echten Kunden und internen Test-Accounts.
#
# Aufruf:
#   sh scripts/platform-monitoring.sh [Node-Optionen]
#   npm run platform:monitoring [-- [Node-Optionen]]
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

# Argumente unveraendert und ohne Word-Splitting an die Node-CLI weiterreichen.
exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs" "$@"
