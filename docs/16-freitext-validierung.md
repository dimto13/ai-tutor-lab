# 16 — Freitext tolerant validieren

Für `personaId: "non-programmer"` darf ein fachlich richtiger Freitext nicht an einem einzelnen Pflichtwort scheitern.

## Grundregel

Freie Formulierungen werden bevorzugt über das ausgelöste Ereignis oder den erreichten fachlichen Zustand validiert. `contains` auf Feldern wie `prompt`, `reply` oder `description` ist nur zulässig, wenn genau diese Textinformation selbst das Lernziel ist.

Nicht geeignet:

```json
"validation": {
  "kind": "event",
  "type": "copilot.prompt.submitted",
  "contains": { "prompt": "Vergleichstabelle" }
}
```

Ein Nutzer kann denselben Auftrag korrekt als „Stelle die drei Optionen tabellarisch gegenüber“ formulieren. Das Wort `Vergleichstabelle` ist dann kein sinnvoller Erfolgsindikator.

Geeignet, wenn bereits das Ereignis den fachlichen Erfolg eindeutig beschreibt:

```json
"validation": {
  "kind": "event",
  "type": "copilot.prompt.submitted"
}
```

Wenn dagegen nicht jeder beliebige Text genügen darf, prüft `minWords` eine **Mindestanzahl Wörter**. Ein Wort ist jedes durch Leerraum getrennte Stück mit mindestens einem Buchstaben oder einer Ziffer. Die Regel ist sprachneutral, weist ein leeres oder einsilbiges „ok“ zurück und hängt an keiner Formulierung, die der Lernende erraten müsste:

```json
"validation": {
  "kind": "event",
  "type": "platform.pull_request.created",
  "match": { "headBranch": "feature/readme-guide" },
  "minWords": { "description": 3 }
}
```

Für Endzustände gibt es dasselbe am State-Selektor: `{ "kind": "state", "selector": "platform.pullRequest.description", "minWords": 3 }`.

Ein Fehlversuch nennt über `onFailure.fieldMessages`, was fehlt und wie der Lernende es korrigiert, zum Beispiel „Beschreibe in einem ganzen Satz, was die Änderung bewirkt und wie du sie geprüft hast“.

### Keine Schlüsselwortlisten

Eine Synonymliste über `containsAny` beziehungsweise `includesAny` ist ebenfalls eine Pflichtformulierung, nur eine längere. Im Beta-Test (#591) traf die Pull-Request-Beschreibung „Prüfung der Änderung.“ keines der Wörter `geprüft`, `kontrolliert`, `getestet`, `verifiziert`, `keine Zugangsdaten`; „überprüft“ oder „gecheckt“ wären ebenso gescheitert. Der Lernende sah nur „der erwartete Inhalt fehlt noch“ und kam nicht weiter. Solche Listen sind deshalb für Freitext nicht mehr zulässig. Ob eine Antwort inhaltlich gut ist, beurteilt nicht die Wortwahl-Prüfung, sondern die Didaktik des Szenarios, etwa ein anschließender Review-Schritt.

## Wann exakter Freitext sinnvoll ist

Wenn die konkrete Information selbst gefunden werden muss, darf die Textprüfung exakt bleiben. Beispiel: Der Nutzer soll in einem Vergleich feststellen, welche Person aus einer Revision verschwunden ist. Dann ist `Nora Berger` die fachliche Antwort und nicht nur ein zufälliges Schlüsselwort.

Solche Schritte werden explizit markiert:

```json
"exactTextValidation": true,
"validation": {
  "kind": "event",
  "type": "copilot.prompt.submitted",
  "contains": { "prompt": "Nora Berger" }
}
```

`exactTextValidation` ist keine allgemeine Ausnahme für bequemere Tests. Es muss fachlich begründbar sein, warum eine alternative Formulierung oder Antwort falsch wäre.

## Simulatorantworten

Auch deterministische Simulatorantworten dürfen bei einer Freitextaufgabe nicht von einem einzelnen Magic Word abhängen. Wenn unterschiedliche Antwortarten im selben Dateikontext nötig sind, kann ein Seed `promptContainsAny` mit mehreren fachlich gleichwertigen Formulierungsfragmenten verwenden. Ohne solche Inhaltsbedingung reagiert die Runtime auf den aktiven Dateikontext und ihre generischen Kontextregeln.

## CI-Regel

`npm run validate:content` führt `scripts/validate-freetext-policy.ts` aus. Bei Non-Programmer-Szenarien werden unter anderem blockiert:

- `validation.contains.prompt`
- `validation.contains.reply`
- `validation.contains.description`
- `validation.containsAny` auf denselben Feldern
- `includes` und `includesAny` auf Freitext-Zuständen wie einer Pull-Request-Beschreibung oder dem letzten Prompt

Geprüft werden auch Bedingungen in `all`, `any`, `sequence` und `not`. Ausnahme sind Schritte mit `exactTextValidation: true`.

Schlüsselwortlisten, die vor dieser Regel entstanden sind, stehen als `KNOWN_KEYWORD_GATES` im Skript und werden in #599 abgebaut. Die Liste darf nur schrumpfen: Ein Eintrag, der nicht mehr verletzt, lässt die Prüfung ebenfalls fehlschlagen, bis er entfernt ist. Die E2E-Tests prüfen weiterhin sinnvolle Varianten und bewusst zu knappe Eingaben, damit `minWords` keine beliebige Freigabe wird.

Exakte Prüfungen auf nicht-freie Werte bleiben unverändert zulässig, zum Beispiel Dateinamen, Code-/Dateiinhalte, Branch-Namen oder strukturierte Runtime-Zustände.
