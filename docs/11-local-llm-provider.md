# Lokaler LLM-Provider (AITP-54)

## Ziel

Die Tutor-LLM-Schicht ist providerneutral. Lokal wird ausschließlich Ollama über dessen OpenAI-kompatible API verwendet. Cloud-Provider und AWS-Hosting sind nicht Bestandteil dieses Tickets.

## Konfiguration

Kopiere `.env.example` nach `.env.local` und passe bei Bedarf nur die Werte an:

```bash
cp .env.example .env.local
```

Standardwerte:

```text
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=gemma4:31b
LLM_API_KEY=ollama
```

`gemma4:31b` ist der lokale Standard. Wenn das Modell auf dem jeweiligen Entwicklungsrechner nicht sinnvoll betrieben werden kann, ist `gemma4:e4b` das vorgesehene kleinere Ausweichmodell. Der Wechsel erfolgt ausschließlich über `LLM_MODEL`; ein Wechsel der lokalen Adresse ausschließlich über `LLM_BASE_URL`. Es gibt bewusst keinen automatischen Modell-Fallback, damit Modellwechsel reproduzierbar und sichtbar bleiben.

## Ollama lokal starten

Ollama muss außerhalb der Web-App auf dem Entwicklungsrechner laufen. Beispiel:

```bash
ollama pull gemma4:31b
ollama serve
```

Danach lässt sich die OpenAI-kompatible API direkt prüfen:

```bash
curl http://localhost:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"gemma4:31b",
    "messages":[{"role":"user","content":"Antworte mit JSON: {\"uiTargetRef\":\"vscode.activityBar.explorer\"}"}],
    "response_format":{"type":"json_object"},
    "temperature":0
  }'
```

## Lokaler Modellbestand

Für die aktuelle Entwicklungsumgebung wurde am 9. August 2026 per `ollama list` bestätigt, dass sowohl `gemma4:31b` als auch `gemma4:e4b` lokal vorhanden sind. Dieser Nachweis bestätigt die Installation, nicht die tatsächliche GPU-Ausführung.

## GPU-Nutzung verifizieren

Die GPU-Verifikation ist eine lokale Abnahme und kann nicht in GitHub Actions durchgeführt werden. Während einer laufenden Modellanfrage prüfen:

```bash
ollama ps
```

Bei NVIDIA-Systemen zusätzlich:

```bash
nvidia-smi
```

`ollama ps` muss für das geladene Modell GPU-Nutzung ausweisen; parallel muss der Ollama-Prozess in `nvidia-smi` mit belegtem VRAM sichtbar sein. Das Ergebnis der lokalen Abnahme ist im PR zu dokumentieren.

## Reale Abnahme auf dem RMI-PC (B1)

Tatsächliche Topologie laut Owner-Präzisierung vom 2026-09-12 in #97: AWS Systems Manager → RMI-PC (`192.168.178.170`). Der RMI-PC ist SSM Managed Node **und** LLM-Knoten: Ollama läuft dort als systemd-Dienst auf Port `11434`, mit NVIDIA-GPU. Die B1-Abnahme prüft diesen lokalen Pfad. Der produktive Transport läuft weiterhin über den Rotator auf dem NAS (`192.168.178.81`); für die geschlossene Beta ist das lokale Modell auf dem RMI-PC nach #486 die einzige konfigurierte Modellroute hinter diesem Rotator. Die Abnahme braucht keinen öffentlichen Zugang.

Die Tutor-Anfrage läuft über `scripts/verify-llm-provider-live.ts`. Das Skript nutzt dieselbe Kette wie der Server — Kontextaufbau aus dem Szenario, `TutorLlmService` mit Guardrails, `OllamaProvider` — und prüft je Modell, dass keine Weiterleitung an einen externen Upstream stattfand, die Antwort ein JSON-Objekt ist, die Guardrails sie annehmen und jede UiTargetRef im Runtime-Katalog existiert. Es läuft nicht in der CI, weil es einen erreichbaren Ollama-Endpunkt braucht. Die Modelle laufen nacheinander, nie gleichzeitig.

```bash
# auf dem RMI-PC; LLM_BASE_URL steht per Default auf http://localhost:11434/v1
npm run verify:llm-live -- gemma4:31b gemma4:e4b
```

Den Weg aus AWS über SSM beschreibt der Abschnitt „Produktiver Tutor-Pfad“; die B1-Abnahme braucht ihn nicht.

Optionen: `--scenario`, `--step`, `--mode`, `--question`, `--timeout-seconds` (Standard 600, damit das Laden des 31B-Modells nicht abbricht). Die Ausgabe ist ein Markdown-Block für den Nachweis im Issue; der Exit-Code ist ungleich 0, sobald ein Modell eine Prüfung verfehlt.

Parallel auf dem RMI-PC, während die 31B-Anfrage läuft:

```bash
ollama list
ollama --version
ollama ps      # Spalte PROCESSOR: Anteil CPU/GPU
nvidia-smi
```

**B1 nimmt den lokalen Pfad ab, nicht die Cloud-Route des Rotators.** Auf dem NAS laufen Ollama und der `ollama-rotator` (`192.168.178.81:11435`). Der Rotator reicht Namen mit dem Suffix `@local` an den RMI-PC zurück und andere Namen grundsätzlich an seine Cloud-Route. Über den Rotator deshalb für die lokale Abnahme nur `gemma4:31b@local` und `gemma4:e4b@local` verwenden; auch `…:cloud@local` ist nicht als lokaler Nachweis zulässig, wenn das Ollama auf dem RMI-PC den Namen selbst als Cloud-Modell führt. Der Runner lässt die Abnahme fehlschlagen, wenn die Antwort-Header eine Cloud-Route zeigen: ein `via`-Header, ein anderes `x-ollama-account` als `local` oder eine nicht-lokale `x-ollama-route`.

Den SSM-Nachweis für den RMI-PC liefert ein AWS-Principal mit `ssm:DescribeInstanceInformation` im Konto der Hybrid-Aktivierung:

```bash
aws ssm describe-instance-information --region us-east-1 \
  --filters Key=InstanceIds,Values=mi-0c4f95e235b575da9 \
  --query 'InstanceInformationList[].[InstanceId,PingStatus,AgentVersion,ComputerName,LastPingDateTime]'
```

## Produktiver Tutor-Pfad (B2/B5)

Die Owner-Entscheidung vom 2026-09-13 in #99 legt den Transport über den `ollama-rotator` auf dem NAS fest. Die Owner-Entscheidung vom 2026-09-15 in #486 ändert für die **geschlossene Beta ausschließlich die Modellroute**: Tutor-Prompts dürfen nicht an Ollama Cloud gehen. Die produktive Relay-Lambda verwendet deshalb genau einen Versuch mit `gemma4:e4b@local`; ein zweiter Cloud- oder Fallback-Versuch ist deaktiviert.

```text
Browser
  → TrainLabs Server Function (Amplify)
  → Lambda im Amplify-Backend
  → AWS Systems Manager: SendCommand (AWS-RunShellScript) nur auf mi-0c4f95e235b575da9, us-east-1
  → RMI-PC 192.168.178.170 (SSM Managed Node)
  → SSH im LAN auf den NAS 192.168.178.81
  → Container ollama-rotator auf dem NAS
       einzige Beta-Modellroute: gemma4:e4b@local
       → RMI-PC :11434, lokales Ollama mit GPU
  → Antwort zurück: Rotator → SSH → RMI-PC → SSM → Lambda → TrainLabs
  → fällt die lokale Route aus: deterministischer Tutor (#28)
```

- **Transport:** Die Lambda `tutor-relay` (`amplify/functions/tutor-relay/`) nimmt über ihre Function URL eine OpenAI-kompatible Chat-Anfrage an. Die Server Function spricht sie mit dem vorhandenen `OllamaProvider` an: `LLM_BASE_URL` ist die Function URL plus `/v1`, `LLM_API_KEY` ein aus dem Secret `TUTOR_RELAY_KEY` abgeleitetes Bearer-Token. Die Lambda-Rolle erhält `ssm:SendCommand` nur für diese Managed Instance und das Dokument `AWS-RunShellScript`, dazu `ssm:GetCommandInvocation`, `ssm:CancelCommand` und für den Health-Aufruf `ssm:DescribeInstanceInformation`. Das Muster stammt aus dem Amplify-Projekt `amplify-vite-react-template`.
- **Befehl auf dem RMI-PC:** ein fester Befehl über `AWS-RunShellScript`. Die Anfrage steht darin nur verschlüsselt (AES-256-GCM, Schlüssel ebenfalls aus `TUTOR_RELAY_KEY` abgeleitet), in der SSM-Command-History also nur Chiffretext. Das Relay-Programm entschlüsselt sie, geht mit dem vorhandenen NAS-Zugang auf dem RMI-PC per SSH auf den NAS (`runuser -u <benutzer> -- ssh nas …`) und gibt die Anfrage per `stdin` an den Rotator-Container. Die Frage des Nutzers wird nie in einen Shell-Befehl eingesetzt. `<benutzer>` ist der Besitzer von `~/.config/trainlabs-tutor-relay/payload.key`.
- **Beta-Modellroute:** `amplify/functions/tutor-relay/resource.ts` setzt `TUTOR_RELAY_PRIMARY_MODEL=gemma4:e4b@local` und `TUTOR_RELAY_FALLBACK_MODEL` leer. Damit enthält jede produktive Tutor-Anfrage genau einen `@local`-Versuch. Der Rotator reicht diesen an Ollama auf `11434` des RMI-PC durch. Die Provider-Schicht in TrainLabs bleibt unverändert und kennt keinen Beta-Sonderfall.
- **Zeit:** Amplify beendet SSR-Anfragen nach 30 s. Der eine lokale Relay-Versuch hat standardmäßig 10 s; das Relay selbst gibt nach 22 s auf und die Server Function nach `LLM_TIMEOUT_MS` (Standard 25 s). Danach antwortet der deterministische Tutor.
- **Kein Cloud-Prompt in der Beta:** Ein nicht mit `@local` endender Modellname darf in der produktiven Beta-Konfiguration nicht vorkommen. Der Health-Aufruf darf weiterhin technische Rotator-/Cloud-Metadaten ohne Tutor-Prompt und ohne Modellinferenz prüfen; diese Cloud-Diagnose entscheidet bei ausschließlich lokaler Modellkonfiguration nicht über den Gesamtstatus.
- Welche Route geantwortet hat, zeigen die Antwort-Header `x-tutor-relay-attempt`, `x-tutor-relay-model`, `x-ollama-route`, `x-ollama-account` und `via`; die Lambda protokolliert sie ohne Prompt-Inhalt. Für die Beta-Evidence muss der Modellname `gemma4:e4b@local` und die Route lokal sein; `via` bzw. eine Cloud-Account-Angabe wären ein Fehler.
- Der Weg läuft über SSM, das der Agent auf dem RMI-PC ausgehend aufbaut, und über SSH im LAN. Weder der RMI-PC noch der NAS braucht einen Zugang aus dem Internet.
- **Rückweg zu Cloud-primär:** Sobald Owner/Legal die erforderliche Grundlage freigeben, kann die Modellroute wieder ausschließlich über Relay-Konfiguration geändert werden, z. B. primäres Cloud-Modell plus lokales Fallback. Fachlicher Provider-Vertrag, UI und Trainingslogik bleiben unverändert. Die Änderung braucht einen regulären Merge, Owner-Deploy und neue exact-artifact Evidence.

### Einrichtung

1. **Secret:** In der Amplify-Konsole das Secret `TUTOR_RELAY_KEY` setzen: 32 zufällige Bytes, base64 (`openssl rand -base64 32`). Die Lambda liest es zur Laufzeit. `scripts/write-runtime-env.mjs` liest es beim Frontend-Build und backt Relay-URL, Bearer und die Cognito-IDs in die Server-Laufzeit ein, weil Amplify Hosting der SSR-Laufzeit keine Umgebungsvariablen weiterreicht. Fehlt das Secret, entsteht der Build mit `LLM_ENABLED=false`, und der Tutor antwortet deterministisch. Die Amplify-Umgebungsvariable `LLM_ENABLED=false` schaltet den Pfad bewusst ab.
2. **RMI-PC:** Der abgeleitete Payload-Schlüssel liegt in `~/.config/trainlabs-tutor-relay/payload.key` des Accounts mit NAS-Zugang, Modus `0600`. SSH zum NAS muss für diesen Account ohne Agent und ohne Passwortabfrage gehen.

   ```bash
   install -d -m 700 ~/.config/trainlabs-tutor-relay
   TUTOR_RELAY_KEY=<Secret> node --input-type=module -e 'import { deriveRelayKeys } from "./amplify/functions/tutor-relay/keys.js"; process.stdout.write(deriveRelayKeys(process.env.TUTOR_RELAY_KEY).payloadKey.toString("base64") + "\n")' > ~/.config/trainlabs-tutor-relay/payload.key
   chmod 600 ~/.config/trainlabs-tutor-relay/payload.key
   ```

3. **Beta-Konfiguration:** `TUTOR_RELAY_PRIMARY_MODEL` und `TUTOR_RELAY_FALLBACK_MODEL` werden für die geschlossene Beta in der Amplify-Ressource fest auf `gemma4:e4b@local` bzw. leer gesetzt. Weitere unterstützte Relay-Parameter sind `TUTOR_RELAY_PRIMARY_TIMEOUT_SECONDS`, `TUTOR_RELAY_FALLBACK_TIMEOUT_SECONDS`, `TUTOR_RELAY_DEADLINE_MS`, `TUTOR_RELAY_REASONING_EFFORT`, `TUTOR_RELAY_SSH_HOST`, `TUTOR_RELAY_ROTATOR_URL` und `TUTOR_RELAY_OLLAMA_URL` (Ollama auf dem RMI-PC, nur für den Health-Aufruf; Standard `http://localhost:11434`).

### Prüfen auf dem RMI-PC

`scripts/verify-tutor-relay-node.mjs` führt den Relay-Befehl aus wie SSM, aber als aktueller Benutzer und ohne AWS. Für #486 ist ausschließlich das lokale Szenario die Beta-Abnahme:

```bash
node scripts/verify-tutor-relay-node.mjs --scenario local
node scripts/verify-tutor-relay-node.mjs --scenario local --health

# komplette Tutor-Kette gegen das lokal laufende, local-only Relay
node scripts/verify-tutor-relay-node.mjs --scenario local --serve 8787 &
LLM_BASE_URL=http://127.0.0.1:8787/v1 LLM_API_KEY=<ausgegebener Bearer> npm run verify:llm-live -- gemma4:e4b
```

Die früheren Szenarien `default`, `fallback`, `timeout` und `provider-error` sind Diagnose-/Regressionstests des allgemeinen Relay-Vertrags und können bewusst Cloud-Routen konfigurieren. Sie sind **kein** Abnahmepfad für die geschlossene Beta und dürfen nicht als Nachweis für #486 verwendet werden.

Historische Messung vom 2026-09-13 ohne SSM-Anteil: lokal `gemma4:e4b@local` ca. 4,0 s mit gültigem JSON, Guardrails `ok` und gültiger `UiTargetRef`. Die produktive #486-Abnahme erfolgt erst nach dem Owner-Deploy des exakten Artefakts.

### Health

`GET <Function URL>/health` mit demselben Bearer wie der Chat-Pfad prüft jede Station einzeln (#480). Jede Prüfung meldet `ok`, `degraded`, `down`, `missing` oder `unknown`; der Gesamtstatus ist `ok`, `degraded` (mindestens eine konfigurierte Modellroute nutzbar) oder `down` (keine konfigurierte Route nutzbar, HTTP 503; der Tutor antwortet dann deterministisch).

| Prüfung      | Quelle / Bedeutung in der geschlossenen Beta                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ssm`        | SSM-Status des Managed Nodes (`PingStatus`, Agent-Version). Ist er nicht `Online`, antwortet die Lambda sofort und ohne Run Command.   |
| `sshNas`     | SSH vom RMI-PC zum NAS; Teil des produktiven Transportpfads.                                                                           |
| `rotator`    | `/healthz` des Rotators; nur bekannte technische Felder werden übernommen.                                                             |
| `cloudRoute` | optionale Diagnose ohne Tutor-Prompt/Modellinferenz; bei local-only nicht Teil der Gesamtstatusentscheidung.                           |
| `ollama`     | Ollama auf dem RMI-PC (`/api/version`); für die Beta erforderlich.                                                                     |
| `models`     | primäres Modell `gemma4:e4b@local` lokal installiert/geladen; kein konfiguriertes Fallback-Modell.                                     |

Der Health-Teil läuft wie der Chat als fester Befehl über `AWS-RunShellScript` mit versiegelter Anfrage und Antwort; SSH zum NAS und die lokalen Prüfungen laufen parallel. Aus der Antwort des RMI-PC übernimmt die Lambda nur bekannte Felder. `overallHealth` zählt nur Stationen, die von den konfigurierten Modellen tatsächlich genutzt werden; eine nicht verfügbare Cloud-Route macht den local-only-Beta-Health daher nicht `degraded` oder `down`.

```bash
npm run verify:tutor-health -- --app https://trainlabs.net
```

Nach dem #486-Owner-Deploy zusätzlich eine reale Tutor-Frage in der App stellen und die Korrelation prüfen:

```bash
npm run trace:tutor-request
```

Erwartet sind genau ein Relay-Versuch mit `gemma4:e4b@local`, lokale Route, Health `ok` und dieselbe Request-ID über SSR/Audit, Relay und SSM.

### Störungen

Das Relay benennt jede Störung ohne Prompt-Inhalt nach der Station, an der sie auftrat (#481): je Versuch in `attempts[].failure`, für die Anfrage insgesamt in `failure`.

| Klasse                                   | Signal                                                                                                                                     | Station                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `node_offline`                           | SSM lehnt den Befehl ab (`InvalidInstanceId`), meldet `Undeliverable` oder `DeliveryTimedOut`, oder der Befehl startet bis zur Frist nicht | RMI-PC bzw. SSM-Agent                  |
| `ssm_error`                              | anderer Fehler beim Senden oder Abfragen des Befehls                                                                                       | SSM                                    |
| `relay_node_error`                       | das Relay-Programm meldet `TRELAYERR` oder scheitert                                                                                       | RMI-PC                                 |
| `nas_unreachable`                        | SSH-Exit 255                                                                                                                               | SSH zum NAS                            |
| `rotator_offline`                        | curl-Exit 7, 52 oder 56                                                                                                                    | Rotator                                |
| `timeout`                                | curl-Exit 28, Zeitlimit des Versuchs, `ExecutionTimedOut` oder Relay-Frist bei laufendem Befehl                                            | Modell bzw. Upstream                   |
| `busy`                                   | HTTP 429                                                                                                                                   | konfigurierte Modellroute              |
| `cloud_unavailable`, `local_unavailable` | HTTP 5xx auf dem Cloud- bzw. `@local`-Versuch                                                                                              | Cloud-Route bzw. Ollama auf dem RMI-PC |
| `provider_error`                         | andere 4xx, z. B. `model_not_allowed` (400) oder `not_found_error` (404)                                                                   | Rotator bzw. Ollama                    |

In jedem dieser Fälle antwortet der Tutor in der App deterministisch (#28): `preferServerTutor` behält die deterministische Antwort, sobald der Server-Tutor scheitert, und der Provider gibt nach `LLM_TIMEOUT_MS` (Standard 25 s) auf, also vor der 30-s-Grenze von Amplify.

Die allgemeinen Diagnose-Szenarien lösen Störungen allein über Konfiguration aus, ohne Dienste auf NAS oder RMI-PC anzuhalten. Einige davon konfigurieren absichtlich eine Cloud-Route und gehören deshalb nicht zur #486-Beta-Abnahme. Für die local-only-Beta bleiben insbesondere `rotator-offline`, `nas-unreachable` und `node-offline` ohne Cloud-Modellaufruf nutzbar:

```bash
node scripts/verify-tutor-relay-node.mjs --scenario rotator-offline
node scripts/verify-tutor-relay-node.mjs --scenario nas-unreachable
node scripts/verify-tutor-relay-node.mjs --scenario node-offline
```

`busy`, `cloud_unavailable` und `local_unavailable` decken weiterhin Unit-Tests ab; Live-Störungen werden nicht durch Abschalten produktiver Dienste provoziert.

### Korrelation

Jede Tutor-Anfrage bekommt in der Server Function eine Request-ID und eine pseudonyme Tenant-Referenz (#482): einen mit dem Relay-Bearer gebildeten HMAC über die Tenant-ID, 16 Hex-Zeichen, stabil je Tenant. Beide gehen als `x-trainlabs-request-id` und `x-trainlabs-tenant-ref` an das Relay, das sie nur in genau dieser Form übernimmt. Die Request-ID ist die `id` im Relay-Log und steht im SSM-Kommentar `tutor-relay <Request-ID>`; das Audit der Server Function (`[tutor-llm]`) enthält dieselben beiden Felder.

```bash
npm run trace:tutor-request                  # letzte Tutor-Anfrage der letzten 24 Stunden
npm run trace:tutor-request -- <Request-ID>
```

Wechselt der Relay-Schlüssel, ändern sich auch die Tenant-Referenzen; über einen Schlüsselwechsel hinweg lassen sie sich nicht vergleichen.

Der Befehl zeigt Audit, Relay-Log und SSM-Befehl zur selben Request-ID. Den SSM-Befehl liest er aus CloudTrail, das ihn nach einigen Minuten zeigt; das Nutzerkennzeichen des Audits (`sessionKey`) gibt er nicht aus.

## Architekturgrenze

Alle providerabhängigen Details liegen ausschließlich unter `src/tutor/llm/`:

- `provider.ts` — neutrales Interface
- `config.ts` — Umgebungsvariablen und lokale Defaults
- `ollamaProvider.ts` — OpenAI-kompatibler HTTP-Adapter
- `index.ts` — Factory für den konfigurierten Provider

Andere Tutor-, UI- oder Runtime-Dateien dürfen weder Ollama-Endpunkte noch `LLM_*`-Konfigurationsnamen kennen. Ein Test durchsucht `src/` und schlägt bei einem solchen Leak fehl.

## Strukturierte Antworten

Für `structuredOutput: true` sendet der Adapter `response_format: { "type": "json_object" }`. Der Contract-Test prüft eine JSON-Antwort mit `vscode.activityBar.explorer` gegen den realen VS-Code-Runtime-Katalog. Die fachlichen Guardrails für freie Tutorantworten folgen separat in AITP-52.

## Sicherheitsgrenze

AITP-54 stellt nur die Provider-Schicht bereit. Sie wird nicht direkt aus React-Komponenten aufgerufen. AITP-52 bindet sie über eine serverseitige TanStack-Start-Route/Server-Function an. Dadurch bleiben spätere API-Schlüssel und Providerzugriffe serverseitig.
