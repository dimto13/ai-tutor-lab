#!/bin/sh
#
# Richtet den lesenden GitHub-Actions-Zugang zu AWS ein: OIDC-Provider, Read-only-Policy und
# die Rolle, die der Workflow "Cloud Acceptance" per kurzlebigem Token annimmt. Es entstehen
# dabei keine statischen AWS-Zugangsdaten.
#
# Das Skript ist idempotent: ein zweiter Lauf aktualisiert Trust-Policy und Berechtigungen,
# statt Ressourcen zu duplizieren.
#
# Es braucht ein AWS-Profil mit IAM-Rechten. Das Entwicklerprofil des Projekts reicht dafuer
# nicht aus; die Einrichtung ist eine bewusste Handlung des Repository-Eigentuemers.
#
# Aufruf: AWS_PROFILE=<admin-profil> sh scripts/setup-aws-github-oidc.sh
#
# Hintergrund und Erstnachweis: docs/23-cloud-abnahme-kanal.md

set -eu

ROLE_NAME="${ROLE_NAME:-AiTutorGitHubReadOnly}"
POLICY_NAME="${POLICY_NAME:-AiTutorCloudAcceptanceReadOnly}"
PROVIDER_HOST="token.actions.githubusercontent.com"
AUDIENCE="sts.amazonaws.com"

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
POLICY_DIR="$SCRIPT_DIR/../infra/aws/github-oidc"
TRUST_TEMPLATE="$POLICY_DIR/trust-policy.json"
PERMISSION_POLICY="$POLICY_DIR/read-only-policy.json"

die() {
  printf '\n%s\n\n' "$1" >&2
  exit 1
}

command -v aws >/dev/null 2>&1 || die "Die AWS CLI ist nicht installiert oder nicht im PATH."
[ -f "$TRUST_TEMPLATE" ] || die "Trust-Policy-Vorlage nicht gefunden: $TRUST_TEMPLATE"
[ -f "$PERMISSION_POLICY" ] || die "Berechtigungs-Policy nicht gefunden: $PERMISSION_POLICY"

ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text) ||
  die "Keine gueltige AWS-Anmeldung. AWS_PROFILE beziehungsweise AWS_REGION pruefen."
CALLER=$(aws sts get-caller-identity --query 'Arn' --output text)

printf 'Konto:    %s\n' "$ACCOUNT_ID"
printf 'Aufrufer: %s\n\n' "$CALLER"

TRUST_POLICY=$(mktemp)
trap 'rm -f "$TRUST_POLICY"' EXIT INT TERM
sed "s|<AWS_ACCOUNT_ID>|$ACCOUNT_ID|g" "$TRUST_TEMPLATE" >"$TRUST_POLICY"

PROVIDER_ARN="arn:aws:iam::$ACCOUNT_ID:oidc-provider/$PROVIDER_HOST"
POLICY_ARN="arn:aws:iam::$ACCOUNT_ID:policy/$POLICY_NAME"

# Fehlende IAM-Rechte sind der wahrscheinlichste Grund, aus dem dieses Skript scheitert -- ein
# Amplify-Entwicklerprofil hat sie typischerweise nicht. Ohne Vorabpruefung faellt das erst mitten
# im Ablauf als rohes AccessDenied auf, und zwar bei einem Aufruf, dessen Name nichts darueber
# sagt, was zu tun ist. Deshalb einmal lesend anklopfen, bevor irgendetwas angelegt wird.
PROBE=$(aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" 2>&1 >/dev/null) || true
case "$PROBE" in
  *AccessDenied* | *"not authorized"*)
    die "Dieses AWS-Profil darf IAM nicht administrieren:

$PROBE

Das Skript legt OIDC-Provider, Policy und Rolle an; ein Amplify-Entwicklerprofil reicht dafuer
nicht. Zwei Wege:

  1. Ein Profil mit IAM-Rechten verwenden:
       AWS_PROFILE=<admin-profil> npm run cloud:setup-oidc

  2. Dem aktuellen Benutzer voruebergehend genau die noetigen Rechte geben -- als Inline-Policy
     aus infra/aws/github-oidc/setup-permissions-policy.json -- und sie nach der Einrichtung
     wieder entfernen.

Beides ist in docs/23-cloud-abnahme-kanal.md, Abschnitt Einrichtung, beschrieben."
    ;;
esac

# 1. OIDC-Provider. Ein manuell gepflegter Zertifikats-Thumbprint ist beim aktuellen
#    AWS/GitHub-OIDC-Verfahren nicht mehr noetig; AWS prueft die Kette selbst.
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" >/dev/null 2>&1; then
  # Ein bereits vorhandener Provider kann aus einem anderen Vorhaben stammen und unsere Audience
  # nicht enthalten. AWS lehnt das Token dann mit InvalidIdentityToken ab -- eine Meldung, die
  # nicht auf die Ursache zeigt. Blosse Existenz ist deshalb kein ausreichender Nachweis.
  CLIENT_IDS=$(aws iam get-open-id-connect-provider \
    --open-id-connect-provider-arn "$PROVIDER_ARN" --query 'ClientIDList' --output text)
  case " $(printf '%s' "$CLIENT_IDS" | tr '\t\n' '  ') " in
    *" $AUDIENCE "*)
      printf 'OIDC-Provider vorhanden: %s\n' "$PROVIDER_ARN"
      ;;
    *)
      aws iam add-client-id-to-open-id-connect-provider \
        --open-id-connect-provider-arn "$PROVIDER_ARN" \
        --client-id "$AUDIENCE"
      printf 'OIDC-Provider vorhanden, Audience %s ergaenzt.\n' "$AUDIENCE"
      ;;
  esac
else
  aws iam create-open-id-connect-provider \
    --url "https://$PROVIDER_HOST" \
    --client-id-list "$AUDIENCE" >/dev/null
  printf 'OIDC-Provider angelegt:  %s\n' "$PROVIDER_ARN"
fi

# 2. Berechtigungs-Policy. Bewusst kein AWS-managed ReadOnlyAccess: nur die List/Get/Describe-
#    Operationen, die die Cloud-Abnahme wirklich braucht. Kein Datenzugriff auf DynamoDB.
if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  # IAM erlaubt hoechstens fuenf Versionen je Policy; die aelteste nicht-aktive weicht.
  VERSION_COUNT=$(aws iam list-policy-versions --policy-arn "$POLICY_ARN" \
    --query 'length(Versions)' --output text)
  if [ "$VERSION_COUNT" -ge 5 ]; then
    OLDEST=$(aws iam list-policy-versions --policy-arn "$POLICY_ARN" \
      --query 'Versions[?IsDefaultVersion==`false`] | sort_by(@, &CreateDate) | [0].VersionId' \
      --output text)
    aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$OLDEST"
  fi
  aws iam create-policy-version \
    --policy-arn "$POLICY_ARN" \
    --policy-document "file://$PERMISSION_POLICY" \
    --set-as-default >/dev/null
  printf 'Policy aktualisiert:     %s\n' "$POLICY_ARN"
else
  aws iam create-policy \
    --policy-name "$POLICY_NAME" \
    --description "Lesende Diagnose fuer die Cloud-Abnahme aus GitHub Actions" \
    --policy-document "file://$PERMISSION_POLICY" >/dev/null
  printf 'Policy angelegt:         %s\n' "$POLICY_ARN"
fi

# 3. Rolle mit der Vertrauensbeziehung auf genau dieses Repository und Environment.
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam update-assume-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-document "file://$TRUST_POLICY"
  printf 'Rolle aktualisiert:      %s\n' "$ROLE_NAME"
else
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --description "GitHub Actions Cloud-Abnahme, ausschliesslich lesend" \
    --assume-role-policy-document "file://$TRUST_POLICY" >/dev/null
  printf 'Rolle angelegt:          %s\n' "$ROLE_NAME"
fi

aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn "$POLICY_ARN"

ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)

# Abschliessender Selbstnachweis: was der Workflow spaeter braucht, steht damit im Protokoll des
# Laufs -- die registrierten Audiences des Providers und der Subject-Claim der Trust-Policy.
REGISTERED_AUDIENCES=$(aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn "$PROVIDER_ARN" --query 'ClientIDList' --output text)
# Bewusst nicht ueber einen festen Pfad wie Statement[0].Condition.StringEquals: Die Ausgabe soll
# den real hinterlegten Wert zeigen, auch wenn die Policy spaeter mehrere Statements enthaelt oder
# StringLike verwendet. Sonst meldete der Selbstnachweis genau dann nichts, wenn es interessant wird.
TRUSTED_SUBJECT=$(aws iam get-role --role-name "$ROLE_NAME" \
  --query 'Role.AssumeRolePolicyDocument' --output json |
  tr ',' '\n' |
  sed -n 's/.*"token\.actions\.githubusercontent\.com:sub"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
  tr '\n' ' ')
[ -n "$TRUSTED_SUBJECT" ] || TRUSTED_SUBJECT="(keine sub-Bedingung in der Trust-Policy)"

printf '\nProvider-Audiences: %s\n' "$REGISTERED_AUDIENCES"
printf 'Vertrauter Subject: %s\n' "$TRUSTED_SUBJECT"

printf '\nFertig. Rollen-ARN:\n  %s\n' "$ROLE_ARN"
printf '\nFalls das Environment-Secret noch fehlt oder abweicht:\n'
printf '  gh secret set AWS_ROLE_ARN --env cloud-acceptance --body "%s"\n' "$ROLE_ARN"
printf '\nNachweis anschliessend ueber den Workflow "Cloud Acceptance" (workflow_dispatch auf main).\n'
printf 'Die erste Anmeldung kann wegen der IAM-Konsistenz einige Sekunden brauchen.\n\n'
