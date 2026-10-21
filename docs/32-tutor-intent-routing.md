# 32 — Tutor: Absichtserkennung und Antwortwege

Der Tutor entscheidet vor jeder Antwort, **was** die lernende Person möchte (#147). Auslöser war
#548: Eine Kritik an der Bewertung eines Enter-/Speichern-Ablaufs bekam die Glossarantwort
„Ein Issue beschreibt …“, weil „Aufgabe“ ein Glossar-Alias von „Issue“ ist und die alte Logik jede
Eingabe mit einem Glossarwort als Begriffsfrage behandelte.

## Absichten und Verhalten (Legacy-Fallback ohne Modell)

| Absicht (`TutorIntent`)                        | Beispiel                                | Verhalten                                                                                    |
| ---------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `next_step`, `rationale`, `progress`           | „Was soll ich jetzt machen?“            | Antwort aus dem aktuellen Schritt; mit Modell wie bisher                                     |
| `definition`                                   | „Was ist ein Workspace?“                | Glossar; nur hier und nur zum erfragten Begriff                                              |
| `platform`                                     | „Wie bekomme ich Punkte?“               | Antwort aus `content/tutor/platform-knowledge.de.json`                                       |
| `question`                                     | „Wo finde ich das Terminal?“            | Modell; ohne Modell ehrliche Nichtantwort statt geratener Definition                         |
| `problem_report`, `feature_request`,`feedback` | „Der Speichern-Button reagiert nicht“   | Offline nur ein korrigierbares Meldeangebot; bei verfügbarer Modellroute entscheidet das LLM |
| `unclear`                                      | „Warum funktioniert mein Befehl nicht?“ | Rückfrage mit beiden Wegen: Antwort oder Meldung                                             |
| `smalltalk`                                    | „Danke!“                                | Kurze Antwort ohne Glossar                                                                   |

Eine Meldung wird **nie ohne Klick gesendet**, aber die Person muss sie auch **nie noch einmal
beschreiben** (Owner-Pilot 2026-10-19). Unter der Tutor-Antwort stehen direkt im Chat:

- „Ja, an das Team senden“ (bei einer Rückfrage „Als Problem melden“): sendet die eigene Nachricht
  unverändert mit dem strukturierten Kontext aus `useFeedbackContext` an die Beta-Inbox. Scheitert
  die Zustellung, bleibt der Datensatz lokal gesichert, und derselbe Knopf sendet ihn erneut.
- „Vorher bearbeiten“: öffnet den bestehenden Feedback-Dialog mit dem Text als Entwurf.
- „Nein, ich brauche Hilfe zur Aufgabe“ beziehungsweise „Nein, das war eine Frage“: beantwortet
  dieselbe Eingabe als Frage.

Bis zur ersten erfolgreichen Meldung steht darunter der Datenschutzhinweis. Ein noch offenes Angebot
wird auch zum Entwurf von „Ich habe ein Problem“. Bei einer Meldung ergänzt der Tutor passendes
Plattformwissen, etwa wo Punkte zu sehen sind, und im Guided-Modus die erste Hilfe des Schritts.

## Entscheidungsmatrix für Aussagen

Die Signallisten erkennen feste Wendungen, aber keine Alltagssprache wie „bei speichern meiner punkte
pass was nicht, das fenster ist sofort weg gewesen“. Für **Aussagen** liest der Tutor deshalb
zusätzlich zwei Merkmale (`statementMalfunction` in `tutorIntent.ts`):

| Störung                                               | Bezug                                    | Absicht               |
| ----------------------------------------------------- | ---------------------------------------- | --------------------- |
| Verneinung nahe einem Funktionsverb oder Verschwinden | Plattform (Fenster, Übersicht, Punkte …) | `problem_report`      |
| wie oben                                              | simuliertes Werkzeug oder nichts         | `unclear` (Rückfrage) |
| keine                                                 | –                                        | bisherige Regeln      |

„noch nicht“ beschreibt Fortschritt und zählt nicht als Störung. Fragen werden nicht über die Matrix
geroutet; sie gehen wie bisher an das Modell, das `kind: "feedback"` setzen kann. Antwortet kein
Modell, fragt der Tutor bei einer nicht erkannten Aussage mit beiden Wegen zurück
(`fallbackOffer`), statt auf einen Button zu verweisen.

## Sicherheitsregel

Eine Aussage ohne Frageform bekommt keinen Glossartext. Wird eine Meldung nicht sicher erkannt,
landet sie in der Rückfrage oder als Aussage beim Modell, nicht still in einer Begriffs-, Schritt-
oder Plattformantwort. Diese Regel ist ein Test-Gate, auch für die nicht nachjustierten
Gegenproben.

## Wissensquellen

- Aktueller Schritt und Szenario: `buildTutorContext()`.
- Elemente des simulierten Werkzeugs: Runtime-Referenzkatalog.
- Begriffe: `content/glossary/*.json`.
- Plattform selbst (Modi, Hilfen, Punkte, Speichern, Meldeweg, Simulation): versioniertes
  `content/tutor/platform-knowledge.de.json`. Der Server-Tutor bekommt dieselben Einträge im
  Systemprompt und soll Plattformfragen nur damit beantworten. Jede Aussage dort muss im Code oder
  in der UI belegbar sein; ein neuer Eintrag braucht einen Golden-Fall.

## Modusgerechtes Grounding und Coaching (Paket 1)

Der Server erstellt den LLM-Kontext aus dem **kanonisch geladenen Szenario** und nicht aus frei
vom Browser behaupteten Trainingsdaten. Neben Titel, Schrittanweisung, Begründung und erlaubten
UI-Referenzen enthält er die bereinigte, auf 1.200 Zeichen begrenzte Szenariobeschreibung. Im Guided-Modus erhält das Modell zusätzlich
die aktuell authored gestuften Hilfen und einen möglichen `onFailure.message`-Hinweis. Ein solcher
Hinweis ist **kein Beleg**, dass der konkrete Nutzer diesen Fehler gemacht hat; ohne bestätigte
Runtime-Evidence darf der Tutor keinen Fehlversuch oder Abschluss behaupten.

Die Antwortpolitik unterscheidet die Lernmodi:

- **Guided:** die konkrete Frage direkt beantworten; zunächst die geringste passende Hilfe, bei
  ausdrücklicher Nachfrage präziser; ausschließlich die Hilfen des aktuellen Schritts verwenden.
- **Explore:** Elemente, ihren Zweck und Zusammenhänge erklären, ohne eine starre Klickfolge
  oder einen bereits erzielten Fortschritt vorzugeben.
- **Challenge:** Denkansätze und Begriffe auf Nachfrage erklären, ohne ungefragt die komplette
  Lösung oder eine Klickfolge vorzugeben. Guided-Hilfestufen und Fehlervorlagen werden in diesem
  Modus **nicht an das Modell übermittelt**.

Bei unklarem Kontext wird eine gezielte Rückfrage erwartet, nicht die Behauptung, der Tutor habe
aktuelle Simulatoraktionen beobachtet. Die Änderung ist eine Kontext-/Prompt-Verbesserung und
**noch kein Beleg** für adaptives Coaching oder gute reale Modellantworten. Insbesondere werden
aktuelle Fehlversuche, Interaktionsereignisse und die langfristige Lernhistorie noch nicht an das
Modell übergeben. Diese Zustandsgrenze bleibt einem gesonderten, datenschutzgeprüften Paket
vorbehalten (Bezug #420/#575).

## Modellbasierte Absichtserkennung (Owner-Korrektur 2026-10-21)

**Bindende Zielarchitektur aus #147:** Für jede freie Chat-Nachricht nutzt der Tutor bei
verfügbarer authentifizierter local-only-LLM-Route **zuerst das Sprachmodell**. Die
derzeitige deterministische Keyword-/Regex-Klassifikation aus `tutorIntent.ts` ist
nur Bestandsimplementierung und darf **nicht** die primäre Weiterleitung oder
den Zugang zum LLM steuern. Eine explizit geklickte Problem-Meldeaktion gehört
nicht zur freien Texteingabe und darf direkt den Feedback-Dialog öffnen.

Die bevorzugte **eine** strukturierte LLM-Anfrage liefert `intent`, `confidence`,
`answer`, `kind` und `uiTargetRefs` gemeinsam. Der Prompt enthält autorisierten
Szenariokontext und begrenzten Gesprächsverlauf. Das Sprachmodell wählt zwischen
Lernhilfe, Plattformfrage, Werkzeugfrage, allgemeiner Frage, Problembericht,
Funktionswunsch, Feedback, Smalltalk und Unklarheit. Der Server validiert die
Antwort und die UI-Referenzen. Bei geringer Sicherheit oder unbrauchbarem
Resultat wird nachgefragt; eine Klassifikation verursacht nie von selbst einen
Meldungsversand. Nach erfolgreicher Klassifikation eines Problems zeigt die UI
einen korrigierbaren Vorschlag mit **expliziter Nutzerbestätigung**.

`tutorModelIntent.ts` ist in PR #602 mit `TutorLlmService` und dem Chat-Aufruf verbunden.
Der Server validiert **eine** gemeinsam vom Modell erzeugte Intent-/Antwortstruktur,
UI-Referenzen und den fehlenden Automatismus beim Feedback-Versand. Der Browser ruft
`resolveModelFirstTutor` auf, das den lexikalischen Offline-Fallback erst dann auswertet,
wenn keine authentifizierte Modellroute vorhanden oder deren Transport ausgefallen ist.
Die bisherige Heuristik-/Golden-Suite bleibt als Offline-Regression erhalten; sie belegt
keine Modellgenauigkeit. Die unabhängige Real-Model-Matrix aus #575 auf der tatsächlich
verbundenen Beta-Route `gemma4:e4b@local` bleibt bis zu ihrer Durchführung NOT_TESTED.

## Use-Case-spezifisches Modell- und Workflow-Gate (#147/#575)

Der zusätzliche `tutorModelOutputSchema`-Vertrag akzeptiert die Antwort eines Modells
**nur als ein einziges strukturiertes Objekt** mit `intent`, `confidence`,
`answer`, `kind` und `uiTargetRefs`. Die App muss Modellabsicht und
Handlungsvorschlag getrennt behandeln:

- Lern-/Plattform-/Werkzeug-/Allgemeinfrage und Smalltalk → validierte Antwort.
- Problem, Wunsch oder Feedback → nur das korrigierbare **Meldeangebot**; niemals
  implizites Senden oder ein behaupteter GitHub-Issue-/Score-Effekt.
- `unclear`, niedrige Sicherheit, JSON-/Schema-Fehler, widersprüchlicher
  `intent`/`kind` oder nicht zugelassene UI-Referenz → fail-closed Rückfrage,
  statt ein beliebiges Glossarwort aus dem Text auszulesen.

`apps/web/tests/tutorModelWorkflow.test.ts` enthält 28 getrennte, synthetische
deutsche Antwort- und Melde-Workflows (einschließlich #548, Guided/Explore/Challenge,
Folgefrage, Themenwechsel und „kein Fehler“-Negativkontrolle) plus
Unklarheits-/Injection-/UI-Referenz-Gegenproben. Diese **0-Token/Fake-Provider-Tests**
prüfen den Routing-/Ausführungsvertrag und exemplarische Antwortinhalte, nicht
die semantische Treffsicherheit des Modells. Ein grüner Fake-Provider darf den
REAL_MODEL_QUALITY-Status ausdrücklich **nicht** auf PASS setzen.

\`tests/runtime/tutorAllModules.test.ts\` lädt bei jeder CI-Ausführung **alle** vorhandenen
autorisierten Szenario-JSONs und die aus Guided abgeleiteten HTML-, Recherche- und
Tabellen-Varianten dynamisch. Es prüft unabhängig von Modul, Werkzeug und Lernmodus:
aktuelle Anweisung und modulspezifischen Kontext, sichere UI-Referenzen, keine
Guided-Hinweise in Explore/Challenge, den freien Explore-Modus **ohne aktiven Schritt**,
kanonisch begrenzte Fortschrittsangaben, eine normal geroutete Modell-Lernfrage und
einen bestätigungspflichtigen Problembericht. Neu hinzugefügte Szenario-Dateien
werden automatisch mitgeprüft; weitere Generatoren müssen in dieser Abdeckung
registriert werden. Kein hartcodiertes VS-Code-Routing und kein Test ersetzt die
eigenständige reale Modell- und Browserabnahme aller Module.

Das endgültige Release-Gate verlangt zusätzlich:

1. Einen tatsächlich verbundenen UI→Server→`gemma4:e4b@local`→UI-Weg auf dem
   exakten Release-Build, mit überprüftem lokalen Routing.
2. Mindestens 30 unterschiedliche reale Modell-Klassifikationen auf einem
   versionierten, anonymen deutschen Use-Case-Korpus: mind. 90 % richtige
   Intents, **keine** still als Glossar beantwortete Problemberichte.
3. Getrennte fachliche Review-Kriterien für passende Hilfestufe, korrektes
   Plattformwissen, explizite Unsicherheit, Challenge-Spoilerschutz,
   hilfreiche Folgefragen und Ausfall-/Timeout-Wege.
4. Dokumentierte Modell-/Build-/Deploy-SHAs, Laufzeit und Fehlkategorien ohne
   Nutzernachrichten oder Credentials in öffentlichen Logs. Erforderliche
   Modellabfragen bleiben explizit Opt-in und sind nie impliziter PR-/Main-CI-Teil.

## Lernzustand für den Tutor (Paket 2, stufenweiser Ausbau)

**Universell für sämtliche Module und Use Cases:** Die Server-Funktion lädt das jeweils
kanonische, versionierte `Scenario`, nicht ein fest programmiertes VS-Code-Skript.
Sie liefert die `learningObjectives`, Gesamtumfang, die nummerierte Aufgabenfolge,
den aktuellen Schritt mit Anweisung, Beschreibung, Begründung und erwartetem
Ergebnis. Der aktuelle Fortschritt wird Schritt für Schritt nur als
`reported_completed`/`current`/`not_reported` markiert. Fehlversuche dürfen
nur als exakte, für den **aktuellen** Schritt hinterlegte Diagnose vom Server
übernommen werden; unpassende oder manipulierte Browsertexte gelangen nie als
Diagnose ins Modell. Keine angezeigte Fehlermeldung = keine erfundene Ursache.

**Didaktische Trennung:** Guided bekommt den Ablauf und abgestufte Hilfen,
Explore bekommt Lernziele und die Orientierung ohne feste Klickpflicht.
Challenge bekommt die Lernziele, aber keine komplette Aufgaben-/Lösungsfolge,
keine Guided-Hilfen, keine Musterlösung oder Guided-Fehlerdetails.
Die aktuelle Position im Guided-Modus ist die angezeigte/replayte Position;
sie ist nicht automatisch mit dem zuletzt erreichten oder bestandenen
Schritt identisch.

Der Browser übermittelt bei jeder freien Tutor-Nachricht einen **kleinen, strikt begrenzten
Ausschnitt** aus seinem aktuellen Lernstand via `buildTutorLiveSnapshot(useTutorContext())`:

- maximal 50 Schritt-IDs (serverseitig mit den aktuellen, kanonischen Szenario-IDs abgeglichen),
- nur aggregierte Hinweis-/Fehlversuchs-/Erkundungszähler bis 10.000,
- maximal sechs **ausgewählte Ereignistypen**, niemals deren `payload`, Dateinamen, Pfade,
  Terminalkommandos, Inhalte, personenbezogene Daten oder User-Code.

Der Browser ist keine autoritative Quelle für bestandene Schritte. Der Kontext im Systemprompt
markiert solche Angaben ausdrücklich als **CLIENT_REPORTED / NOT_SERVER_VERIFIED**. Sie dienen
ausschließlich vorsichtiger Gesprächsführung und zur Auswahl der Hilfestufe. Scoring,
Schrittvalidierung, Autorisierung und Cloud-Persistenz dürfen daraus niemals folgen. Fehlt der
Snapshot, arbeitet der Tutor ohne behaupteten Live-Stand weiter.

**Integrationsstand:** Die Mobile-Tutor-Reparatur #574 / PR #593 ist in `main` gemergt.
Das aktuelle Chat-Wiring sowie die Zod- und Szenario-seitige Prüfung sind Bestandteil
von PR #602. Der angezeigte Schrittstatus und eine mögliche Fehlermeldung werden nur
als Browser-Beobachtung verwendet; exakte Fehlermeldungen werden gegen die aktuell
authorisierten Step-Fehlertexte geprüft. Die tatsächliche semantische Qualität muss
zusätzlich durch die getrennte Real-Model-Matrix #575 nachgewiesen werden.

## Server-Tutor

- Der Chat sendet bis zu sechs vorherige Nachrichten mit (`TUTOR_HISTORY_MAX_TURNS`, höchstens
  `TUTOR_HISTORY_MAX_CHARS` Zeichen), damit Bezugsfragen wie „und wo finde ich das?“ funktionieren.
  Übernommen werden nur beantwortete Frage-Antwort-Paare, damit die Rollen strikt abwechseln;
  Begrüßung, Meldungsangebote und Quittungen gehören nicht dazu.
- Das Modell kann `kind: "feedback"` liefern, wenn es eine Plattformkritik erkennt; die Oberfläche
  bietet dann ebenfalls die Meldung an.

## Tests

- `tests/runtime/fixtures/tutor-intent-golden.de.json`: Golden-Datensatz mit Paraphrasen und
  Negativkontrollen; `cases` müssen zu mindestens 90 % exakt geroutet werden, `heldOut` ist eine
  unveränderte Gegenprobe, deren Trefferquote nur berichtet wird.
- `tests/runtime/tutorIntentGolden.test.ts`: Routing, #548-Regression, Sicherheitsregel,
  Rückfrage, Plattformwissen.
- `apps/web/tests/tutorLlmGuardrails.test.ts`: Verlauf, Grenzen, `feedback`-Antworten.
- `apps/web/e2e/tests/feedback-capture.spec.ts`: Pilot-Satz bis zum gesendeten Datensatz mit einem
  Klick, Bearbeiten im Dialog, Ablehnen des Angebots, Rückfrage.
- Golden-Fälle mit Präfix `pilot-` sind wörtliche Owner-Eingaben, `matrix-` prüft die
  Entscheidungsmatrix einschließlich Gegenproben (Werkzeugbezug, „noch nicht gespeichert“).

Die Golden-Tests prüfen die deterministische Erkennung ohne Modellkosten. Sie belegen **nicht** die
Antwortqualität eines echten Modells; dafür ist die kontrollierte Real-Model-Evaluation aus #575
nötig. Neue Fehlerfälle aus dem Pilot zuerst als Golden-Fall aufnehmen, dann die Muster
verallgemeinern — nicht einzelne Sätze hart codieren.

## Aktueller Anfrageweg und Modellkonfiguration (PR #602)

1. `TutorChat.tsx` liest das aktuelle, angezeigte Szenario über `useTutorContext()` und
   erstellt **pro Frage** einen begrenzten `tutorLiveSnapshot` ohne Rohereignisse/Code.
   Eine freie Äußerung passiert vor dem LLM **keinen** Regex-/Glossar-Klassifikator.
2. `askTutorLlm` validiert den Request mit Zod. Serverseitig wird das Cognito-Access-Token
   geprüft; ohne Authentifizierung/LLM-Freigabe bleibt der lokale Offline-Tutor erhalten.
3. `tutorLlm.server.ts` lädt das kanonische Szenario anhand der ID neu und kombiniert
   Lernziele, Aufgabenablauf, aktuellen Schritt, Hilfestufen (nur Guided),
   vertrauenswürdige UI-Referenzen und serverseitig abgeglichene Browser-Beobachtungen.
4. `TutorLlmService` baut Systemkontext und bis zu sechs passende Gesprächsnachrichten.
   `LLM_PROVIDER=ollama`, `LLM_BASE_URL` und `LLM_MODEL` bestimmen den
   tatsächlich verwendeten lokalen oder weiterleitenden Adapter. Der allgemeine
   lokale Konfigurationsdefault ist `gemma4:31b`; die gewünschte Beta-Route ist
   gesondert als `gemma4:e4b@local` am Relay/Rotator nachzuweisen. Ohne tatsächliche
   Runtime-Evidence behauptet der Code keinen bestimmten aktiven Provider-Endpunkt.
5. Das Modell erzeugt **in derselben Anfrage** `intent`, `confidence`, `answer`,
   `kind` und `uiTargetRefs`. Der Server verwirft ungültige Kombinationen,
   unbekannte UI-Referenzen und zusätzliche schreibende Felder.
6. Die UI zeigt eine Antwort oder ein **bestätigungspflichtiges** Feedback-Angebot;
   erst ein gesonderter expliziter Nutzerklick darf einen Bericht an die Beta-Inbox
   senden. Eine ausdrücklich abgelehnte Meldung wird auf dem nächsten Modellaufruf
   als gewünschte _Fragebeantwortung_ übergeben.
7. Bei fehlendem Auth-Token oder ausgefallener Modellroute folgt erst jetzt der
   bestehende deterministische Offline-Tutor; eine fachlich ungültige Modellantwort
   führt dagegen zur sicheren Rückfrage, nicht zu einer stillen Glossar-Umdeutung.

Die PR-/Main-Tests benutzen ausschließlich 0-Token/Fake-Provider. Die unabhängige
modellbasierte Akzeptanz aus #575 (mindestens 30 tatsächliche lokale Klassifikationen,
mindestens 90 % Intent-Korrektheit und getrennt geprüfte Antwortqualität) ist
eine **eigene** Freigabestufe und wird nicht durch erfolgreiche Unit- oder UI-Tests ersetzt.


## Kontrollierte reale Qualitätsmatrix (#575, explizit opt-in)

Die 0-Token-Tests unter `tests/runtime/tutorQualityCorpus.test.ts` prüfen nur den **40-Fall-Katalog**
(`tests/runtime/fixtures/tutor-quality-live.de.json`): zehn separate Held-out-Fälle, unterschiedliche
Modulfamilien und Guided/Explore/Challenge. Sie rufen niemals das Modell auf.

Der separate Runner `scripts/verify-tutor-quality-live.ts` gehört **nicht** zu `npm run check`,
PR-/Main-CI oder einem automatischen Workflow. Nur nach einer echten Runtime-/Berechtigungs- und
gegebenenfalls External-Executor-Quota-Freigabe auf einem explizit ausgecheckten PR-Head starten:

```sh
TUTOR_QUALITY_REAL_OPT_IN=1 LLM_MODEL=gemma4:e4b LLM_BASE_URL=http://127.0.0.1:11434/v1 \
  node --experimental-strip-types scripts/verify-tutor-quality-live.ts --run-real-model
```

Der Runner akzeptiert nur einen direkten Loopback-Endpunkt, das genaue lokale Modell, eine
separate CLI- und Umgebungsfreigabe, maximal **eine** sequenzielle Anfrage je Fall ohne Retry
und erstellt lokale Evidenzdateien außerhalb des Repositories mit Dateimodus 0600. Öffentlich
dürfen nur redigierte Metadaten (Case-ID, Modul/Modus, erwarteter und tatsächlicher Intent,
Modell/Route/Head/Latenz, Ergebnis) erscheinen, niemals Prompt, Antwort, Token oder Zugangsdaten.

Ein Ergebnis von mindestens 90 % korrekt vom echten Modell gewählter Intents und null automatischen
kritischen/Route-Fehlern ist weiterhin **nur eine Teilprüfung**. Jede echte Antwort einschließlich
Held-out und Challenge-Spoiler/erfundener UI bzw. Punkte/#548 ist anhand der privaten lokalen
Antwortdatei fachlich unabhängig zu beurteilen. Der Runner gibt deshalb absichtlich Exitcode 2
(`MANUAL_SEMANTIC_AND_UI_ACCEPTANCE_REQUIRED`) selbst bei erfolgreichen automatischen Checks aus;
Exitcode 1 bedeutet automatischen Fehler. Zusätzlich bleibt die **authentifizierte**
UI→Server/Snapshot→Modell-Abnahme separat zu belegen. Weder Testkatalog noch Runner allein
markieren #575 als PASS oder autorisieren einen Merge.
