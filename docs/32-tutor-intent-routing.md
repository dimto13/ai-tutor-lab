# 32 — Tutor: Absichtserkennung und Antwortwege

Der Tutor entscheidet vor jeder Antwort, **was** die lernende Person möchte (#147). Auslöser war
#548: Eine Kritik an der Bewertung eines Enter-/Speichern-Ablaufs bekam die Glossarantwort
„Ein Issue beschreibt …“, weil „Aufgabe“ ein Glossar-Alias von „Issue“ ist und die alte Logik jede
Eingabe mit einem Glossarwort als Begriffsfrage behandelte.

## Absichten und Verhalten

| Absicht (`TutorIntent`)                        | Beispiel                                | Verhalten                                                            |
| ---------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| `next_step`, `rationale`, `progress`           | „Was soll ich jetzt machen?“            | Antwort aus dem aktuellen Schritt; mit Modell wie bisher             |
| `definition`                                   | „Was ist ein Workspace?“                | Glossar; nur hier und nur zum erfragten Begriff                      |
| `platform`                                     | „Wie bekomme ich Punkte?“               | Antwort aus `content/tutor/platform-knowledge.de.json`               |
| `question`                                     | „Wo finde ich das Terminal?“            | Modell; ohne Modell ehrliche Nichtantwort statt geratener Definition |
| `problem_report`, `feature_request`,`feedback` | „Der Speichern-Button reagiert nicht“   | Kein Modellaufruf; Angebot, den eigenen Text als Meldung zu prüfen   |
| `unclear`                                      | „Warum funktioniert mein Befehl nicht?“ | Rückfrage mit beiden Wegen: Antwort oder Meldung                     |
| `smalltalk`                                    | „Danke!“                                | Kurze Antwort ohne Glossar                                           |

Eine Meldung wird **nie automatisch gesendet**. Der Tutor öffnet auf Wunsch den bestehenden
Feedback-Dialog mit dem Text als Entwurf; die Person prüft, ändert und sendet selbst. Mit
„Nein, das war eine Frage“ beziehungsweise „Nein, ich brauche Hilfe zur Aufgabe“ wird dieselbe
Eingabe als Frage beantwortet.

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

## Server-Tutor

- Der Chat sendet bis zu sechs vorherige Nachrichten mit (`TUTOR_HISTORY_MAX_TURNS`, höchstens
  `TUTOR_HISTORY_MAX_CHARS` Zeichen), damit Bezugsfragen wie „und wo finde ich das?“ funktionieren.
  Begrüßung und Meldungsangebote gehören nicht dazu.
- Das Modell kann `kind: "feedback"` liefern, wenn es eine Plattformkritik erkennt; die Oberfläche
  bietet dann ebenfalls die Meldung an.

## Tests

- `tests/runtime/fixtures/tutor-intent-golden.de.json`: Golden-Datensatz mit Paraphrasen und
  Negativkontrollen; `cases` müssen zu mindestens 90 % exakt geroutet werden, `heldOut` ist eine
  unveränderte Gegenprobe, deren Trefferquote nur berichtet wird.
- `tests/runtime/tutorIntentGolden.test.ts`: Routing, #548-Regression, Sicherheitsregel,
  Rückfrage, Plattformwissen.
- `apps/web/tests/tutorLlmGuardrails.test.ts`: Verlauf, Grenzen, `feedback`-Antworten.
- `apps/web/e2e/tests/feedback-capture.spec.ts`: freier Problemtext bis zum gesendeten Datensatz,
  Ablehnen des Angebots, Rückfrage.

Die Golden-Tests prüfen die deterministische Erkennung ohne Modellkosten. Sie belegen **nicht** die
Antwortqualität eines echten Modells; dafür ist die kontrollierte Real-Model-Evaluation aus #575
nötig. Neue Fehlerfälle aus dem Pilot zuerst als Golden-Fall aufnehmen, dann die Muster
verallgemeinern — nicht einzelne Sätze hart codieren.
