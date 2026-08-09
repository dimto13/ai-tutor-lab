# AITP-27: Echte Browser-Runtime

Stand: 9. August 2026

## Entscheidung

Eine eingebettete, echte Editor-Runtime ist technisch machbar, aber nicht als Ersatz für den
Simulator zu empfehlen. **Explore** und **Guided** bleiben im deterministischen Simulator. Eine
echte Runtime wird nur für ausgewählte **Challenge**-Szenarien eingesetzt, in denen ein echtes
Dateisystem, Terminal oder Erweiterungen einen didaktischen Mehrwert liefern.

Für einen Pilot gelten folgende Leitplanken:

- eine isolierte Runtime pro aktiver Lernsession;
- 1 vCPU, 2 GB RAM und 30 GB ephemerer Speicher als Startgröße;
- ARM64 bevorzugt, sofern alle benötigten nativen Erweiterungen kompatibel sind;
- automatisches Beenden nach 15 bis 30 Minuten Inaktivität;
- OIDC-Authentifizierung, TLS und WebSocket-fähiges Gateway vor der Runtime;
- nur semantische Ereignis-Metadaten verlassen die Runtime, keine Datei- oder Terminalinhalte.

## Prototyp und Messergebnis

Der Spike startet die offizielle macOS-ARM64-Version von
[code-server 4.131.0](https://github.com/coder/code-server/releases/tag/v4.131.0) mit Code 1.131.0,
installiert eine kleine Workspace-Extension und bettet die Runtime in eine Host-Seite ein. Der
Smoke-Test öffnet `README.md`, empfängt das Ereignis über einen authentifizierten lokalen Collector
und vergleicht die Browser-Koordinaten mit der Übersetzung aus iFrame- und Ziel-Rechteck.

Gemessen auf einem Apple-Silicon-Entwicklungsrechner:

```json
{
  "runtimeVersion": "4.131.0 a3fc2899bd0fcd388253c0e79ce33b8acd48c688 with Code 1.131.0",
  "runtimeProcessTreeRssMb": 703.3,
  "personalCustomizationDiscoveryDisabled": true,
  "crossOriginDomAccessible": false,
  "sameOriginDomAccessible": true,
  "translatedTargetMatches": true,
  "capturedEvent": {
    "source": "real-editor-runtime-spike",
    "type": "file.opened",
    "sessionId": "real-runtime-smoke-session",
    "payload": {
      "filename": "README.md",
      "uriScheme": "file"
    }
  }
}
```

Mehrere erfolgreiche Läufe lagen bei rund 703 bis 895 MB RSS für Server und Extension-Hosts ohne
Nutzer-Workload. Diese lokale Messspanne ist keine Kapazitätsgarantie, stützt aber 2 GB als
vernünftige Pilotgröße. Builds, Sprachserver und CLI-Agenten müssen in einem Lasttest separat
berücksichtigt werden.

Die Extension verwendet die offizielle
[VS-Code-Extension-API](https://code.visualstudio.com/api/references/vscode-api) und erfasst:

- `runtime.ready`;
- `file.opened` bei neuem oder aktiv gewordenem Dokument;
- `file.saved`;
- `terminal.opened`.

Der Collector akzeptiert nur den erwarteten Ursprung und die erwartete Session, prüft Zeitstempel
und Ereignistyp und weist Payloads mit typischen Inhaltsschlüsseln wie `content` oder `text` ab.
Das ist ein Protokoll-Prototyp, noch keine vollständige Produktionsauthentifizierung.

## `resolveTarget` im iFrame

Das Ergebnis hängt von der Origin-Grenze ab:

| Einbettung                                        | DOM-Zugriff vom Tutor             | `resolveTarget`                                           | Ergebnis                               |
| ------------------------------------------------- | --------------------------------- | --------------------------------------------------------- | -------------------------------------- |
| Amplify-App und Runtime auf verschiedenen Origins | durch Same-Origin-Policy gesperrt | nicht direkt möglich                                      | im Smoke-Test bestätigt                |
| Host und Runtime hinter demselben Origin/Gateway  | erlaubt                           | möglich; inneres Rechteck plus iFrame-Offset              | im Smoke-Test pixelgenau bestätigt     |
| verschiedene Origins mit kooperativer Bridge      | kein direkter DOM-Zugriff         | semantischer Zielschlüssel und Rechteck per `postMessage` | empfohlene Alternative, noch zu härten |

Der integrierte
[`/proxy/<port>/`-Pfad](https://github.com/coder/code-server/blob/main/docs/guide.md#accessing-web-services)
belegt die Same-Origin-Variante lokal. Für AWS ist ein eigener, authentifizierter Gateway-Pfad
erforderlich. DOM-Selektoren bleiben ausschließlich Implementierungsdetail des Runtime-Adapters;
Szenarien referenzieren weiterhin semantische Ziele. Wegen der volatilen Editor-DOM-Struktur ist
für die Produktion eine kooperative Bridge robuster als ein Zugriff des Tutors auf interne
Selektoren.

## Kosten pro aktiver Nutzerstunde

Die Schätzung verwendet die am 9. August 2026 abgerufene
[AWS-Preisliste für ECS/Fargate in Frankfurt](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/eu-central-1/index.json).
Fargate berechnet Linux-Aufgaben sekundengenau mit einer Mindestdauer von einer Minute; Details
stehen auf der [Fargate-Preisseite](https://aws.amazon.com/fargate/pricing/). 1 vCPU und 2 GB sind
eine gültige Fargate-Kombination gemäß der
[ECS-Dokumentation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html).

Formel pro Stunde:

```text
vCPU × vCPU-Preis + RAM in GB × RAM-Preis
+ max(0, Speicher in GB - 20) × Preis für Zusatzspeicher
```

| Architektur |      vCPU/h |    GB RAM/h | 10 GB Zusatzspeicher/h | 1 vCPU + 2 GB + 30 GB |
| ----------- | ----------: | ----------: | ---------------------: | --------------------: |
| ARM64       | 0,03725 USD | 0,00409 USD |            0,00132 USD |     **0,04675 USD/h** |
| x86_64      | 0,04656 USD | 0,00511 USD |            0,00132 USD |     **0,05810 USD/h** |

Damit kosten 1.000 aktive Nutzerstunden rechnerisch 46,75 USD auf ARM64 beziehungsweise 58,10 USD
auf x86_64. Ein 15-minütiges Inaktivitätsfenster kostet pro nicht rechtzeitig beendeter Session
zusätzlich rund 0,01169 USD (ARM64) oder 0,01453 USD (x86_64).

Nicht enthalten sind gemeinsames Gateway und Authentifizierung, persistenter Speicher, Logs,
Datenübertragung, Images sowie Reserven für Lastspitzen. Die Werte sind deshalb eine belastbare
Compute-Untergrenze für eine laufende Einzelsession, keine Gesamtkostenprognose. Ein Pilot muss
Startdauer, Spitzen-RSS/CPU, Gleichzeitigkeit und Idle-Anteil messen. Pooling kann Startzeit und
Kosten senken, schwächt aber die Session-Isolation und ist zunächst nicht empfohlen.

## Sicherheit und Betrieb

`--auth none` wird ausschließlich im lokalen Smoke-Test auf `127.0.0.1` verwendet. Die
[code-server-Anleitung](https://github.com/coder/code-server/blob/main/docs/guide.md#expose-code-server)
warnt ausdrücklich vor einem ungeschützten öffentlichen Betrieb und setzt WebSocket-Unterstützung
voraus. Eine produktive Runtime bietet Datei- und Terminalzugriff und ist damit eine
Codeausführungsumgebung. Erforderlich sind mindestens:

- kurzlebige, nicht erratbare Session-Routen und serverseitig geprüfte Identität;
- Netzwerk-, Prozess- und Dateisystemisolation pro Session;
- begrenzte CPU-, RAM-, Prozess-, Laufzeit- und Egress-Budgets;
- kurzlebige Credentials mit minimalen Rechten und keine Secrets im Szenario;
- serverseitige Allowlist für Ereignisse sowie Größen- und Ratenlimits;
- definierte Löschung von Workspace, Logs und Session-Artefakten.

AWS Amplify bleibt Host der Tutor-Anwendung. Die zustandsbehaftete Runtime gehört nicht in den
statischen Amplify-Build, sondern hinter einen separaten AWS-Runtime-Dienst und ein gemeinsames
Gateway.

## Reproduktion

Voraussetzungen sind die Projektabhängigkeiten, Playwright Chromium und ein entpacktes offizielles
code-server-Release. Das Release bleibt außerhalb des Repositorys; Binary und Runtime-Daten werden
nicht eingecheckt.

```bash
REAL_RUNTIME_BIN=/absoluter/pfad/zu/code-server \
REAL_RUNTIME_EVIDENCE_PATH=/tmp/aitp27-real-runtime.png \
node --experimental-strip-types spikes/real-runtime/run-smoke.mjs
```

Der Test bindet alle Server nur an localhost, erzeugt Workspace, Extension- und Nutzerdaten in
einem eigenen temporären Verzeichnis und entfernt dieses nach dem Lauf. `HOME` wird unverändert an
code-server weitergereicht, weil dessen Geräte-ID-Bibliothek den vorhandenen Standardpfad benötigt;
es wird nicht umgebogen. Das isolierte Nutzerprofil deaktiviert die Discovery persönlicher Agent-,
Skill-, Instruktions- und Hook-Verzeichnisse. Andere Umgebungsvariablen und mögliche Zugangstoken
werden nicht an den Runtime-Prozess vererbt.

Die npm-Distribution war im Test mit Version 4.117.0 älter als das offizielle Release und ihr
Installationspfad schlug unter Node 26/npm 10 fehl. Für Pilot und Produktion sollte deshalb ein
versioniertes offizielles Release-Asset oder ein geprüftes Container-Image verwendet werden, nicht
eine unversionierte globale npm-Installation.
