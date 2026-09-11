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

# 1. Voraussetzungen pruefen
if ! command -v node >/dev/null 2>&1; then
  die "Node.js ist nicht installiert oder nicht im PATH verfuegbar."
fi

if ! command -v aws >/dev/null 2>&1; then
  die "AWS CLI ist nicht installiert oder nicht im PATH verfuegbar."
fi

# 2. Bekannte Komfort-Flags argument-sicher in Node-Flags uebersetzen.
# POSIX sh hat keine Arrays; deshalb wird jedes Argument einzeln verarbeitet und
# unmittelbar mit sauberer Quoting-Grenze weitergereicht. Optionen mit Werten
# bleiben unveraendert in "$@" erhalten und werden nicht per Word-Splitting neu aufgebaut.
forward() {
  case "$1" in
    --customers) printf '%s\n' '--view' 'customers' ;;
    --tests) printf '%s\n' '--view' 'tests' ;;
    --emails) printf '%s\n' '--list-emails' ;;
    --mask) printf '%s\n' '--mask-emails' ;;
    --json-only) printf '%s\n' '--quiet' ;;
    --logins|-l) printf '%s\n' '--logins' ;;
    --timeline|-t) printf '%s\n' '--timeline' ;;
    *) printf '%s\n' "$1" ;;
  esac
}

# Da POSIX sh keine Arrays bietet, vermeiden wir bewusst eval/ungequotete Expansion.
# Die Node-CLI wird direkt ausgefuehrt; Komfort-Flags werden vorab nur dann ersetzt,
# wenn sie keine separaten Werte tragen. Alle anderen Argumente werden 1:1 gequotet
# weitergereicht.
set -- "$@"
if [ "$#" -eq 0 ]; then
  exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs"
fi

# Rekursives Forwarding bewahrt Argumentgrenzen auch bei Leerzeichen/Sonderzeichen.
run_node() {
  if [ "$#" -eq 0 ]; then
    exec node "$SCRIPT_DIR/extract-platform-monitoring.mjs"
  fi

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
}

run_node "$@"
