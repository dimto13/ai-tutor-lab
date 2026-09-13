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

- Die Lambda-Rolle erhält `ssm:SendCommand` nur für diese Managed Instance und das Dokument `AWS-RunShellScript`, dazu `ssm:GetCommandInvocation` zum Abholen des Ergebnisses. Das Muster stammt aus dem Amplify-Projekt `amplify-vite-react-template`.
- Das SSM-Kommando ist ein fester Befehl über `AWS-RunShellScript`. Es geht mit dem vorhandenen NAS-Zugang auf dem RMI-PC per SSH auf den NAS (`runuser -u <benutzer> -- ssh nas …`) und spricht dort den Rotator-Container an. Die Frage des Nutzers wird nie in den Shell-Befehl eingesetzt.
- Der Rotator nutzt primär Cloud-Modelle und fällt nur bei Ausfall auf die lokalen Modelle des RMI-PC zurück; dafür muss er `11434` auf dem RMI-PC im LAN erreichen. Seine Konfiguration liegt auf dem NAS, nicht in diesem Repository. Die Provider-Schicht in TrainLabs bleibt ohne eigenen Modell-Fallback.
- Mit Cloud primär gehen Tutor-Prompts an Ollama Cloud als externen Empfänger. Die Datenschutzhinweise (#449, #451) müssen das abdecken.
- Welche Route geantwortet hat, zeigen die Antwort-Header `x-ollama-route`, `x-ollama-account` und `via`.
- Der Weg läuft über SSM, das der Agent auf dem RMI-PC ausgehend aufbaut, und über SSH im LAN. Weder der RMI-PC noch der NAS braucht einen Zugang aus dem Internet.
- SSM speichert Kommando-Parameter in der Command-History. Prompts gehören deshalb nicht im Klartext in die Parameter; den Transport klärt #99.

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
