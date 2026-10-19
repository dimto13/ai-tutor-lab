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
| `problem_report`, `feature_request`,`feedback` | „Der Speichern-Button reagiert nicht“   | Kein Modellaufruf; eigenen Text mit einem Klick an das Team senden   |
| `unclear`                                      | „Warum funktioniert mein Befehl nicht?“ | Rückfrage mit beiden Wegen: Antwort oder Meldung                     |
| `smalltalk`                                    | „Danke!“                                | Kurze Antwort ohne Glossar                                           |

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
