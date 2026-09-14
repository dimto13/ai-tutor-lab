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

Tatsächliche Topologie laut Owner-Präzisierung vom 2026-09-12 in #97: AWS Systems Manager → RMI-PC (`192.168.178.170`). Der RMI-PC ist SSM Managed Node **und** LLM-Knoten: Ollama läuft dort als systemd-Dienst auf Port `11434`, mit NVIDIA-GPU. Die B1-Abnahme prüft diesen lokalen Pfad. Im produktiven Tutor-Pfad ist er der Fallback hinter dem Rotator auf dem NAS (`192.168.178.81`), siehe „Produktiver Tutor-Pfad (B2)“. Die Abnahme braucht keinen öffentlichen Zugang.

Die Tutor-Anfrage läuft über `scripts/verify-llm-provider-live.ts`. Das Skript nutzt dieselbe Kette wie der Server — Kontextaufbau aus dem Szenario, `TutorLlmService` mit Guardrails, `OllamaProvider` — und prüft je Modell, dass keine Weiterleitung an einen externen Upstream stattfand, die Antwort ein JSON-Objekt ist, die Guardrails sie annehmen und jede UiTargetRef im Runtime-Katalog existiert. Es läuft nicht in der CI, weil es einen erreichbaren Ollama-Endpunkt braucht. Die Modelle laufen nacheinander, nie gleichzeitig.

```bash
# auf dem RMI-PC; LLM_BASE_URL steht per Default auf http://localhost:11434/v1
npm run verify:llm-live -- gemma4:31b gemma4:e4b
```

Den Weg aus AWS über SSM beschreibt der Abschnitt „Produktiver Tutor-Pfad (B2)“; die B1-Abnahme braucht ihn nicht.

Optionen: `--scenario`, `--step`, `--mode`, `--question`, `--timeout-seconds` (Standard 600, damit das Laden des 31B-Modells nicht abbricht). Die Ausgabe ist ein Markdown-Block für den Nachweis im Issue; der Exit-Code ist ungleich 0, sobald ein Modell eine Prüfung verfehlt.

Parallel auf dem RMI-PC, während die 31B-Anfrage läuft:

```bash
ollama list
ollama --version
ollama ps      # Spalte PROCESSOR: Anteil CPU/GPU
nvidia-smi
```

**B1 nimmt den lokalen Pfad ab, nicht die Cloud-Route des Rotators.** Auf dem NAS laufen Ollama und der `ollama-rotator` (`192.168.178.81:11435`) mit Cloud-Modellen. Der Rotator reicht Namen mit dem Suffix `@local` an den RMI-PC zurück und alle anderen Namen an Ollama Cloud — `gemma4:31b` ginge dort also an einen externen Provider. Über den Rotator deshalb nur mit `gemma4:31b@local` und `gemma4:e4b@local` abnehmen; auch `…:cloud@local` läuft in der Cloud, weil das Ollama auf dem RMI-PC selbst Cloud-Modelle wie `glm-5.2:cloud` führt. Der Runner lässt die Abnahme fehlschlagen, wenn die Antwort-Header eine Cloud-Route zeigen: ein `via`-Header, ein anderes `x-ollama-account` als `local` oder eine nicht-lokale `x-ollama-route`.

Den SSM-Nachweis für den RMI-PC liefert ein AWS-Principal mit `ssm:DescribeInstanceInformation` im Konto der Hybrid-Aktivierung:

```bash
aws ssm describe-instance-information --region us-east-1 \
  --filters Key=InstanceIds,Values=mi-0c4f95e235b575da9 \
  --query 'InstanceInformationList[].[InstanceId,PingStatus,AgentVersion,ComputerName,LastPingDateTime]'
```

## Produktiver Tutor-Pfad (B2)

Owner-Entscheidung vom 2026-09-13 in #99: Der produktive Tutor erreicht die Modelle über den `ollama-rotator` auf dem NAS.

```text
Browser
  → TrainLabs Server Function (Amplify)
  → Lambda im Amplify-Backend
  → AWS Systems Manager: SendCommand (AWS-RunShellScript) nur auf mi-0c4f95e235b575da9, us-east-1
  → RMI-PC 192.168.178.170 (SSM Managed Node)
  → SSH im LAN auf den NAS 192.168.178.81
  → Container ollama-rotator auf dem NAS
       primär:   Ollama Cloud
       Fallback: …@local → RMI-PC :11434, lokales Ollama mit GPU
  → Antwort zurück: Rotator → SSH → RMI-PC → SSM → Lambda → TrainLabs
  → fallen beide aus: deterministischer Tutor (#28)
```

- **Transport:** Die Lambda `tutor-relay` (`amplify/functions/tutor-relay/`) nimmt über ihre Function URL eine OpenAI-kompatible Chat-Anfrage an. Die Server Function spricht sie mit dem vorhandenen `OllamaProvider` an: `LLM_BASE_URL` ist die Function URL plus `/v1`, `LLM_API_KEY` ein aus dem Secret `TUTOR_RELAY_KEY` abgeleitetes Bearer-Token. Die Lambda-Rolle erhält `ssm:SendCommand` nur für diese Managed Instance und das Dokument `AWS-RunShellScript`, dazu `ssm:GetCommandInvocation`, `ssm:CancelCommand` und für den Health-Aufruf `ssm:DescribeInstanceInformation`. Das Muster stammt aus dem Amplify-Projekt `amplify-vite-react-template`.
- **Befehl auf dem RMI-PC:** ein fester Befehl über `AWS-RunShellScript`. Die Anfrage steht darin nur verschlüsselt (AES-256-GCM, Schlüssel ebenfalls aus `TUTOR_RELAY_KEY` abgeleitet), in der SSM-Command-History also nur Chiffretext. Das Relay-Programm entschlüsselt sie, geht mit dem vorhandenen NAS-Zugang auf dem RMI-PC per SSH auf den NAS (`runuser -u <benutzer> -- ssh nas …`) und gibt die Anfrage per `stdin` an den Rotator-Container. Die Frage des Nutzers wird nie in einen Shell-Befehl eingesetzt. `<benutzer>` ist der Besitzer von `~/.config/trainlabs-tutor-relay/payload.key`.
- **Modelle:** Das Relay fragt zuerst das Cloud-Modell (`gemma4:31b`) und bei jedem Fehler einmal `gemma4:e4b@local`; der Rotator reicht `@local` an `11434` auf dem RMI-PC durch. Die Provider-Schicht in TrainLabs bleibt ohne eigenen Modell-Fallback. Die Cloud verpackt JSON trotz `response_format` in einen Markdown-Codeblock; das Relay entfernt ihn, wenn JSON angefordert war. `reasoning_effort` bleibt ungesetzt, denn ohne Denkschritt fehlen bei `gemma4:e4b` `kind` und `uiTargetRefs`.
- **Zeit:** Amplify beendet SSR-Anfragen nach 30 s. Das Relay gibt nach 22 s auf (Cloud-Versuch 10 s, Fallback 9 s); dann antwortet der deterministische Tutor.
- Mit Cloud primär gehen Tutor-Prompts an Ollama Cloud als externen Empfänger. Die Datenschutzhinweise (#449, #451) müssen das abdecken.
- Welche Route geantwortet hat, zeigen die Antwort-Header `x-tutor-relay-attempt`, `x-ollama-route`, `x-ollama-account` und `via`; die Lambda protokolliert sie ohne Prompt-Inhalt.
- Der Weg läuft über SSM, das der Agent auf dem RMI-PC ausgehend aufbaut, und über SSH im LAN. Weder der RMI-PC noch der NAS braucht einen Zugang aus dem Internet.

### Einrichtung

1. **Secret:** In der Amplify-Konsole das Secret `TUTOR_RELAY_KEY` setzen: 32 zufällige Bytes, base64 (`openssl rand -base64 32`). Die Lambda liest es zur Laufzeit. `scripts/write-runtime-env.mjs` liest es beim Frontend-Build und backt Relay-URL, Bearer und die Cognito-IDs in die Server-Laufzeit ein, weil Amplify Hosting der SSR-Laufzeit keine Umgebungsvariablen weiterreicht. Fehlt das Secret, entsteht der Build mit `LLM_ENABLED=false`, und der Tutor antwortet deterministisch. Die Amplify-Umgebungsvariable `LLM_ENABLED=false` schaltet den Pfad bewusst ab.
2. **RMI-PC:** Der abgeleitete Payload-Schlüssel liegt in `~/.config/trainlabs-tutor-relay/payload.key` des Accounts mit NAS-Zugang, Modus `0600`. SSH zum NAS muss für diesen Account ohne Agent und ohne Passwortabfrage gehen.

   ```bash
   install -d -m 700 ~/.config/trainlabs-tutor-relay
   TUTOR_RELAY_KEY=<Secret> node --input-type=module -e 'import { deriveRelayKeys } from "./amplify/functions/tutor-relay/keys.js"; process.stdout.write(deriveRelayKeys(process.env.TUTOR_RELAY_KEY).payloadKey.toString("base64") + "\n")' > ~/.config/trainlabs-tutor-relay/payload.key
   chmod 600 ~/.config/trainlabs-tutor-relay/payload.key
   ```

3. **Optional**, als Umgebungsvariablen der Lambda: `TUTOR_RELAY_PRIMARY_MODEL`, `TUTOR_RELAY_FALLBACK_MODEL` (leer = kein Fallback), `TUTOR_RELAY_PRIMARY_TIMEOUT_SECONDS`, `TUTOR_RELAY_FALLBACK_TIMEOUT_SECONDS`, `TUTOR_RELAY_DEADLINE_MS`, `TUTOR_RELAY_REASONING_EFFORT`, `TUTOR_RELAY_SSH_HOST`, `TUTOR_RELAY_ROTATOR_URL`, `TUTOR_RELAY_OLLAMA_URL` (Ollama auf dem RMI-PC, nur für den Health-Aufruf; Standard `http://localhost:11434`).

### Prüfen auf dem RMI-PC

`scripts/verify-tutor-relay-node.mjs` führt den Relay-Befehl aus wie SSM, aber als aktueller Benutzer und ohne AWS:

```bash
node scripts/verify-tutor-relay-node.mjs --scenario default    # Cloud-Modell
node scripts/verify-tutor-relay-node.mjs --scenario fallback   # unbekanntes Cloud-Modell → lokal
node scripts/verify-tutor-relay-node.mjs --scenario local      # nur lokal
node scripts/verify-tutor-relay-node.mjs --health              # Health, ohne SSM-Status

# komplette Tutor-Kette gegen das lokal laufende Relay
node scripts/verify-tutor-relay-node.mjs --serve 8787 &
LLM_BASE_URL=http://127.0.0.1:8787/v1 LLM_API_KEY=<ausgegebener Bearer> npm run verify:llm-live -- gemma4:31b
```

Messung vom 2026-09-13 ohne SSM-Anteil: Cloud 1,5–2,0 s, lokal 4,0 s, Fallback 4,4 s; in allen Fällen JSON, Guardrails `ok` und gültige `UiTargetRef`. Beim Cloud-Modell meldet `verify:llm-live` die Weiterleitung an einen externen Upstream; das ist hier gewollt.

### Health

`GET <Function URL>/health` mit demselben Bearer wie der Chat-Pfad prüft jede Station einzeln (#480). Jede Prüfung meldet `ok`, `degraded`, `down`, `missing` oder `unknown`; der Gesamtstatus ist `ok`, `degraded` (mindestens eine Modellroute nutzbar) oder `down` (keine Route nutzbar, HTTP 503; der Tutor antwortet dann deterministisch).

| Prüfung      | Quelle                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `ssm`        | SSM-Status des Managed Nodes (`PingStatus`, Agent-Version). Ist er nicht `Online`, antwortet die Lambda sofort und ohne Run Command. |
| `sshNas`     | SSH vom RMI-PC zum NAS                                                                                                               |
| `rotator`    | `/healthz` des Rotators; übernommen wird nur die Zahl der (freien) Cloud-Konten, keine Kontonamen oder Key-Enden                     |
| `cloudRoute` | `/api/version` über den Rotator, also die Cloud ohne Modellaufruf; `degraded`, wenn kein Cloud-Konto frei ist                        |
| `ollama`     | Ollama auf dem RMI-PC (`/api/version`)                                                                                               |
| `models`     | primäres Modell unter den erlaubten Cloud-Modellen des Rotators; Fallback-Modell lokal installiert und ob es geladen ist             |

Der Health-Teil läuft wie der Chat als fester Befehl über `AWS-RunShellScript` mit versiegelter Anfrage und Antwort; SSH zum NAS und die lokalen Prüfungen laufen parallel. Aus der Antwort des RMI-PC übernimmt die Lambda nur bekannte Felder.

```bash
npm run verify:tutor-health -- --app https://<App-Domain>   # Relay-URL aus amplify_outputs.json
```

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
