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

## Reale Abnahme im lokalen Netz (B1)

Die verbindliche Topologie steht in #97: AWS Systems Manager → RMI-PC (SSM Managed Node) → internes LAN → NAS mit dem Docker-Container `ollama-local`. Ollama ist nur intern erreichbar; die Abnahme braucht keinen öffentlichen Zugang.

Die Tutor-Anfrage läuft über `scripts/verify-llm-provider-live.ts`. Das Skript nutzt dieselbe Kette wie der Server — Kontextaufbau aus dem Szenario, `TutorLlmService` mit Guardrails, `OllamaProvider` — und prüft je Modell, dass die Antwort ein JSON-Objekt ist, die Guardrails sie annehmen und jede UiTargetRef im Runtime-Katalog existiert. Es läuft nicht in der CI, weil es einen erreichbaren Ollama-Endpunkt braucht. Die Modelle laufen nacheinander, nie gleichzeitig.

```bash
# vom Entwicklungsrechner über den RMI-PC ins interne Netz tunneln
ssh -N -L 11435:<nas-intern>:11435 rmi &
LLM_BASE_URL=http://localhost:11435/v1 npm run verify:llm-live -- gemma4:31b gemma4:e4b
```

Optionen: `--scenario`, `--step`, `--mode`, `--question`, `--timeout-seconds` (Standard 600, damit das Laden des 31B-Modells nicht abbricht). Die Ausgabe ist ein Markdown-Block für den Nachweis im Issue; der Exit-Code ist ungleich 0, sobald ein Modell eine Prüfung verfehlt.

Parallel auf dem NAS, während die 31B-Anfrage läuft:

```bash
docker exec ollama-local ollama list
docker exec ollama-local ollama --version
docker exec ollama-local ollama ps
docker port ollama-local   # leer = kein Hostport veröffentlicht
nvidia-smi                 # nur bei NVIDIA-GPU
```

Den SSM-Nachweis für den RMI-PC liefert ein AWS-Principal mit `ssm:DescribeInstanceInformation` in der Region der Hybrid-Aktivierung:

```bash
aws ssm describe-instance-information \
  --query 'InstanceInformationList[].[InstanceId,PingStatus,AgentVersion,ComputerName,LastPingDateTime]'
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
