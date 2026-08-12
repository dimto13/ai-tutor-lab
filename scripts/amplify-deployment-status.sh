#!/bin/sh
#
# Zeigt in einem Aufruf den vollstaendigen Deployment-Zustand der Amplify-App:
# ob gerade ein Job laeuft, das letzte abgeschlossene Deployment mit seinen Phasen
# und die juengste Job-Historie.
#
# Die App-ID wird nicht fest verdrahtet, sondern ueber das angebundene Repository
# aufgeloest (docs/19, Abschnitt 5). AMPLIFY_APP_ID und AMPLIFY_BRANCH ueberschreiben
# die Ermittlung, etwa fuer eine zweite Umgebung.
#
# Aufruf: npm run amplify:status

set -eu

BRANCH="${AMPLIFY_BRANCH:-deploy}"
REPO_NAME="ai-tutor-lab"

# Amplify meldet waehrend eines Laufs nacheinander diese Zustaende.
ACTIVE_STATUSES="PENDING PROVISIONING RUNNING CANCELLING"

TAB=$(printf '\t')

die() {
  printf '\n%s\n\n' "$1" >&2
  exit 1
}

# Fehler aus der AWS CLI -- fehlendes Profil, falsche Region, abgelaufene Anmeldung -- sind
# der Normalfall dieses Skripts und keine Programmierfehler. Sie werden als Klartext
# ausgegeben, nicht als roher CLI-Trace.
run_aws() {
  err_file=$(mktemp)
  if out=$(aws "$@" 2>"$err_file"); then
    rm -f "$err_file"
    printf '%s' "$out"
  else
    message=$(cat "$err_file")
    rm -f "$err_file"
    die "aws $* ist fehlgeschlagen.
$message"
  fi
}

is_active() {
  for candidate in $ACTIVE_STATUSES; do
    if [ "$1" = "$candidate" ]; then
      return 0
    fi
  done
  return 1
}

# AWS liefert ISO-8601-Zeitstempel. Node.js ist im Repository ohnehin >=22 vorgeschrieben und
# verarbeitet sie plattformneutral; damit bleibt das Shell-Skript auch auf macOS/BSD ohne
# GNU-spezifisches `date -d` nutzbar.
format_timestamp() {
  if [ -z "$1" ] || [ "$1" = "None" ]; then
    printf '%s' "-"
    return
  fi
  node -e '
    const value = process.argv[1];
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) process.exit(1);
    const pad = (n) => String(n).padStart(2, "0");
    process.stdout.write(`${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`);
  ' "$1" 2>/dev/null || printf '%s' "$1"
}

parse_epoch_seconds() {
  node -e '
    const value = process.argv[1];
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) process.exit(1);
    process.stdout.write(String(Math.floor(timestamp / 1000)));
  ' "$1"
}

current_epoch_seconds() {
  node -e 'process.stdout.write(String(Math.floor(Date.now() / 1000)))'
}

# Ohne Endzeitpunkt wird gegen jetzt gerechnet, damit ein laufender Job seine bisherige
# Laufzeit zeigt.
format_duration() {
  if [ -z "$1" ] || [ "$1" = "None" ]; then
    printf '%s' "-"
    return
  fi
  start_seconds=$(parse_epoch_seconds "$1" 2>/dev/null) || {
    printf '%s' "-"
    return
  }
  if [ -n "${2:-}" ] && [ "$2" != "None" ]; then
    end_seconds=$(parse_epoch_seconds "$2" 2>/dev/null) || end_seconds=$(current_epoch_seconds)
  else
    end_seconds=$(current_epoch_seconds)
  fi
  total=$((end_seconds - start_seconds))
  if [ "$total" -lt 0 ]; then
    printf '%s' "-"
    return
  fi
  minutes=$((total / 60))
  seconds=$((total % 60))
  if [ "$minutes" -gt 0 ]; then
    printf '%sm %ss' "$minutes" "$seconds"
  else
    printf '%ss' "$seconds"
  fi
}

short_commit() {
  if [ -z "$1" ] || [ "$1" = "None" ] || [ "$1" = "HEAD" ]; then
    printf '%s' "${1:--}"
    return
  fi
  printf '%s' "$1" | cut -c1-7
}

print_job_detail() {
  detail_job_id="$1"
  detail_status="$2"
  detail_commit="$3"
  detail_start="$4"
  detail_end="$5"
  detail_running="$6"

  if [ "$detail_running" = "yes" ]; then
    elapsed="laeuft seit $(format_duration "$detail_start")"
  else
    elapsed="Dauer $(format_duration "$detail_start" "$detail_end")"
  fi

  printf '  Job %s | %s | Commit %s | %s\n' \
    "$detail_job_id" "$detail_status" "$(short_commit "$detail_commit")" "$elapsed"
  printf '  Start: %s\n' "$(format_timestamp "$detail_start")"
  if [ "$detail_running" != "yes" ]; then
    printf '  Ende:  %s\n' "$(format_timestamp "$detail_end")"
  fi

  # Bewusst ohne Pipeline: In "$(run_aws ... | head)" waere der Rueckgabewert der von head,
  # ein Fehler der AWS CLI wuerde also stillschweigend zu einem leeren Wert.
  commit_message_raw=$(run_aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" \
    --job-id "$detail_job_id" --query 'job.summary.commitMessage' --output text)
  commit_message=$(printf '%s' "$commit_message_raw" | head -n 1)
  if [ -n "$commit_message" ] && [ "$commit_message" != "None" ]; then
    printf '  Titel: %s\n' "$commit_message"
  fi

  steps=$(run_aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" \
    --job-id "$detail_job_id" --query 'job.steps[].[stepName,status]' --output text)

  if [ -n "$steps" ]; then
    rendered=""
    failed_step=""
    while IFS="$TAB" read -r step_name step_status; do
      [ -z "$step_name" ] && continue
      if [ -z "$rendered" ]; then
        rendered="$step_name: $step_status"
      else
        rendered="$rendered | $step_name: $step_status"
      fi
      if [ "$step_status" = "FAILED" ] && [ -z "$failed_step" ]; then
        failed_step="$step_name"
      fi
    done <<EOF
$steps
EOF
    printf '  Phasen: %s\n' "$rendered"

    # Die logUrl ist eine vorsignierte S3-Adresse: mehrere Zeilen lang und nach einer Stunde
    # ungueltig. Ausgegeben wird deshalb der Befehl, der sie frisch aufloest und abruft.
    if [ -n "$failed_step" ]; then
      printf '  Log der fehlgeschlagenen Phase (%s) abrufen:\n' "$failed_step"
      printf '    curl -s "$(aws amplify get-job --app-id %s --branch-name %s --job-id %s --query '"'"'job.steps[?stepName==`%s`].logUrl'"'"' --output text)" | tail -60\n' \
        "$APP_ID" "$BRANCH" "$detail_job_id" "$failed_step"
    fi
  fi
}

command -v aws >/dev/null 2>&1 || die "Die AWS CLI ist nicht installiert oder nicht im PATH."
command -v node >/dev/null 2>&1 || die "Node.js ist nicht installiert oder nicht im PATH."

if [ -n "${AMPLIFY_APP_ID:-}" ]; then
  APP_ID="$AMPLIFY_APP_ID"
else
  APP_ID=$(run_aws amplify list-apps \
    --query "apps[?ends_with(repository, '/$REPO_NAME') || name=='$REPO_NAME'].appId" \
    --output text)
  if [ -z "$APP_ID" ]; then
    die "Keine Amplify-App zum Repository \"$REPO_NAME\" gefunden.
Stimmt das AWS-Profil beziehungsweise die Region? Alternativ AMPLIFY_APP_ID setzen."
  fi
  if [ "$(printf '%s' "$APP_ID" | wc -w)" -gt 1 ]; then
    die "Mehrere Amplify-Apps passen: $APP_ID
Bitte AMPLIFY_APP_ID setzen."
  fi
fi

APP_INFO=$(run_aws amplify get-app --app-id "$APP_ID" \
  --query 'app.[name,platform,defaultDomain]' --output text)
APP_NAME=$(printf '%s' "$APP_INFO" | cut -f1)
APP_PLATFORM=$(printf '%s' "$APP_INFO" | cut -f2)
APP_DOMAIN=$(printf '%s' "$APP_INFO" | cut -f3)

JOBS=$(run_aws amplify list-jobs --app-id "$APP_ID" --branch-name "$BRANCH" --max-results 10 \
  --query 'jobSummaries[].[jobId,status,commitId,startTime,endTime]' --output text)

printf '\n'
printf 'AWS Amplify | %s (%s) | Branch %s\n' "$APP_NAME" "$APP_ID" "$BRANCH"
printf 'Plattform %s | https://%s.%s\n' "$APP_PLATFORM" "$BRANCH" "$APP_DOMAIN"
printf '\n'

RUNNING_COUNT=0
while IFS="$TAB" read -r job_id status commit_id start_time end_time; do
  [ -z "$job_id" ] && continue
  if is_active "$status"; then
    RUNNING_COUNT=$((RUNNING_COUNT + 1))
  fi
done <<EOF
$JOBS
EOF

if [ "$RUNNING_COUNT" -gt 0 ]; then
  printf 'LAEUFT GERADE: %s Job(s) aktiv\n' "$RUNNING_COUNT"
  while IFS="$TAB" read -r job_id status commit_id start_time end_time; do
    [ -z "$job_id" ] && continue
    if is_active "$status"; then
      print_job_detail "$job_id" "$status" "$commit_id" "$start_time" "$end_time" "yes"
    fi
  done <<EOF
$JOBS
EOF
else
  printf 'KEIN DEPLOYMENT AKTIV: derzeit laeuft kein Job.\n'
fi
printf '\n'

LATEST_FINISHED=$(
  while IFS="$TAB" read -r job_id status commit_id start_time end_time; do
    [ -z "$job_id" ] && continue
    if ! is_active "$status"; then
      printf '%s\t%s\t%s\t%s\t%s\n' "$job_id" "$status" "$commit_id" "$start_time" "$end_time"
      break
    fi
  done <<EOF
$JOBS
EOF
)

if [ -z "$LATEST_FINISHED" ]; then
  printf 'Letztes abgeschlossenes Deployment: keines vorhanden.\n'
else
  job_id=$(printf '%s' "$LATEST_FINISHED" | cut -f1)
  status=$(printf '%s' "$LATEST_FINISHED" | cut -f2)
  commit_id=$(printf '%s' "$LATEST_FINISHED" | cut -f3)
  start_time=$(printf '%s' "$LATEST_FINISHED" | cut -f4)
  end_time=$(printf '%s' "$LATEST_FINISHED" | cut -f5)
  printf 'Letztes abgeschlossenes Deployment (%s):\n' "$status"
  print_job_detail "$job_id" "$status" "$commit_id" "$start_time" "$end_time" "no"
fi
printf '\n'

printf 'Historie:\n'
while IFS="$TAB" read -r job_id status commit_id start_time end_time; do
  [ -z "$job_id" ] && continue
  if is_active "$status"; then
    marker=">"
    duration=$(format_duration "$start_time")
  else
    marker=" "
    duration=$(format_duration "$start_time" "$end_time")
  fi
  printf '%s %4s | %-12s | %-7s | %s | %s\n' \
    "$marker" "$job_id" "$status" "$(short_commit "$commit_id")" \
    "$(format_timestamp "$start_time")" "$duration"
done <<EOF
$JOBS
EOF
printf '\n'
