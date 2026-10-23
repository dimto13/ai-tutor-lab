# 33 — Authentifizierte Cloud-Journeys und Nightly-Schnittstelle (#587)

## Ziel und Grenzen

Dieser Slice erweitert die **bestehende** `Cloud User Acceptance` um echte Cognito- und
Tutor-UI-Journeys. Er startet keine Cloud-Abnahme, provisioniert keine Identitäten und
ersetzt weder die releasegebundene Cloud Acceptance noch #575 (Tutor-Semantik).
`#584` belegt nur lokale User Journeys; ein lokaler Auto-Login ist **kein**
Cognito-Logout-Nachweis. Ein grüner Code-CI-Lauf ist **kein** Cloud-PASS.

Die Testidentitäten sind dediziert und isoliert; es werden ausschließlich synthetische
Meldungen mit eindeutiger Run-ID versendet. Keine Kundendaten oder Secrets in
Repository, GitHub-Kommentaren, Screenshots oder Berichten.

## Journey-Matrix (Implementierungsstand, nicht Cloud-Ausführung)

| ID       | Nachweis                                                                      | Implementierung                                                                                                                 | Cloud-Evidence |
| -------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| CLOUD-1  | Reales Cognito-Formular → Dashboard                                           | neuer UI-Test                                                                                                                   | NOT_TESTED     |
| CLOUD-2  | Guided-Abschluss und serverbestätigter Punktestand                            | bestehender UI-Test mit stabiler ID                                                                                             | NOT_TESTED     |
| CLOUD-3  | Punktestand und Abschluss im frischen Browserkontext                          | neuer UI-Test                                                                                                                   | NOT_TESTED     |
| CLOUD-4  | Wiederholung ohne zweite Punktevergabe                                        | neuer UI-Test                                                                                                                   | NOT_TESTED     |
| CLOUD-5  | Tutorfrage, Modellantwort nur mit Kostenfreigabe                              | nicht implementiert                                                                                                             | BLOCKED        |
| CLOUD-6  | Tutor → Problem → explizites Senden → Bestätigung                             | neuer UI-Test                                                                                                                   | NOT_TESTED     |
| CLOUD-7  | Server bestätigt die UI-ausgelöste Feedback-Mutation                          | neuer UI-/Netzwerktest                                                                                                          | NOT_TESTED     |
| CLOUD-8  | Autorisierte Beta-Inbox-Zustellung                                            | Prüfschnittstelle fehlt                                                                                                         | BLOCKED        |
| CLOUD-9  | Cognito-Logout, SPA-Denial und frischer Dokument-Deep-Link ohne Content-Flash | neuer UI-Test                                                                                                                   | NOT_TESTED     |
| CLOUD-10 | Cross-User-/Cross-Tenant-Isolation über zweite Testidentität                  | neuer UI-Test mit Wiederherstellung der ursprünglichen Kontoeinstellung; bestehende Backend-Contract-Prüfungen bleiben erhalten | NOT_TESTED     |

Die Matrix ist bewusst nicht vollständig. Weder `CLOUD-5` noch `CLOUD-8` dürfen
durch einen Modell-Fallback, eine direkte GraphQL-Submission oder eine erfundene
Inbox-Quittung grün werden. `CLOUD-10` verwendet zwei weitere echte Cognito-Testidentitäten und prüft
über das UI serverpersistierte Profilisolation mit anschließender Wiederherstellung.
Die vorhandenen Backend-Isolationstests bleiben aktiv.

## Voraussetzungen

- Node-Version gemäß `.nvmrc`; installierte Playwright-Abhängigkeiten unter `apps/web/e2e`.
- Ein **tatsächlich freigegebener** deploy-SHA, Amplify-Erfolg und eine autorisierte
  Cloud-Ausführung. Ein Merge auf `main` genügt nicht.
- `CLOUD_BASE_URL` der deployten Anwendung; `CLOUD_TEST_EMAIL` und
  `CLOUD_TEST_PASSWORD` für die dedizierte Cognito-Testidentität. Die übrigen
  `CLOUD_TEST_PEER_*`, `CLOUD_TEST_OTHER_TENANT_*` und `CLOUD_TEST_PERSONAL_*`
  werden von den bestehenden Cloud-Tests benötigt.
- `CLOUD_RELEASE_SHA`: 40-stelliger **live ermittelter** SHA des Branches `deploy`.
  `CLOUD_ENVIRONMENT` ist eine rein beschreibende Umgebung; `NIGHTLY_REPORT_DIR`
  ist ein privates lokales Artefaktverzeichnis. Keine GitHub-Write-Tokens im Browser.

## Modellfreier Nightly-Aufruf mit fail-closed SHA-Bindung

Nach expliziter Owner-Freigabe auf einem autorisierten Runner (nicht im GitHub-Code-Worker)
mit bereits gesetzten geheimen `CLOUD_TEST_*`-Variablen:

```bash
set -euo pipefail
cd /pfad/zum/ai-tutor-lab
umask 077
export NIGHTLY_REPORT_DIR="${NIGHTLY_REPORT_DIR:-${RUNNER_TEMP:-/tmp}/ai-train-lab-nightly-${GITHUB_RUN_ID:-manual}}"
export CLOUD_ENVIRONMENT="${CLOUD_ENVIRONMENT:-amplify}"
export CLOUD_RELEASE_SHA="$(git ls-remote origin refs/heads/deploy | awk '{print $1}')"
if ! [[ "$CLOUD_RELEASE_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || [[ -z "${CLOUD_BASE_URL:-}" ]]; then
  echo "CLOUD_RELEASE_SHA or CLOUD_BASE_URL missing" >&2
  exit 2
fi
if [[ "$(git ls-remote origin refs/heads/deploy | awk '{print $1}')" != "$CLOUD_RELEASE_SHA" ]]; then
  echo "deploy moved before acceptance" >&2
  exit 3
fi
set +e
./apps/web/e2e/node_modules/.bin/playwright test \
  --config apps/web/e2e/nightly.playwright.config.ts
test_exit=$?
set -e
if [[ "$(git ls-remote origin refs/heads/deploy | awk '{print $1}')" != "$CLOUD_RELEASE_SHA" ]]; then
  echo "deploy moved during acceptance; invalidate all evidence" >&2
  exit 3
fi
if (( test_exit != 0 )); then
  echo "Nightly tests failed or required CLOUD journeys are not yet verified" >&2
  exit 1
fi
exit 0
```

Exitcode **0** nur bei vollständiger grüner Suite mit **allen zehn** CLOUD-IDs;
**1** bei fehlgeschlagenen oder nicht implementierten Journeys, **2** bei fehlender
Basis-Konfiguration, **3** bei verändertem `deploy`-SHA. Der Shell-Wrapper
überprüft den Ref ausdrücklich vor und nach der Ausführung; die Konfiguration
validiert zusätzlich das SHA-Format. Ein abgebrochener Test ist niemals PASS.

## Berichte und Schutz

`nightly.playwright.config.ts` aktiviert JUnit (`junit.xml`), HTML (`html/`)
und den minimalen maschinenlesbaren Datensatz (`journeys.json`). Letzterer
enthält ausschließlich `suite`, `environment`, `releaseSha`, `browser`,
`results[].journeyId/status/durationMs/failedStep?` und
`summary.passed/failed`. Nicht ausgeführte IDs werden **NOT_TESTED**, explizit
blockierte Tests **BLOCKED**; beide zählen beim Nightly-Exit als nicht bestanden.
Fehlerschritte stammen nur aus statischen Testtiteln, nie aus Browser-Logs,
Netzwerkantworten, Zugangsdaten oder persönlichen Inhalten.

HTML/JUnit und Playwright-Screenshots können sensitive Cloud-Inhalte enthalten.
Die Artefakte bleiben standardmäßig **privat**, mit kurzer Aufbewahrung und
eingeschränktem Zugriff; sie werden nicht automatisch als öffentliche GitHub-
Artefakte hochgeladen. Der JSON-Reporter legt seine Datei mit Modus `0600` an.
Keine Trace- oder Screenshot-Publikation ohne gesonderte Sicherheitsfreigabe.

## Freigabe und Nachweise

Code-Review, vollständige Exact-Head-Code-CI und Scope-/Preservation-Audit sind
nur der **PREPARED**-Nachweis. Erst nach Integration von #584 und #587 in der
seriellen Merge-Lane sowie einem Owner-Deployment dürfen CLOUD-1 bis CLOUD-10
für den exakten `deploy`-SHA ausgeführt und bewertet werden. Jenkins-/Nightly-
Betrieb gehört weiterhin zu #588. Die bestehenden `Cloud Acceptance` und
`Cloud User Acceptance` bleiben die einzige Release-Kette.
