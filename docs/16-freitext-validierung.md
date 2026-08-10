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

Wenn dagegen nicht jeder beliebige Text genügen darf, verwendet die Runtime eine **Synonymliste statt eines Magic Words**. `containsAny` prüft Groß-/Kleinschreibung und deutsche Sonderzeichen tolerant; mindestens eine der fachlich gleichwertigen Varianten muss vorkommen:

```json
"validation": {
  "kind": "event",
  "type": "copilot.prompt.submitted",
  "match": { "activeFile": "calculator.py" },
  "containsAny": {
    "prompt": ["Datei", "Aufgabe", "Zweck", "Inhalt", "Funktion", "Kontext"]
  }
}
```

Damit wird beispielsweise ein inhaltsloses `test` abgewiesen, während „Was macht diese Datei?“, „Welchen Zweck hat sie?“ oder „Erkläre den aktuellen Kontext“ akzeptiert werden können.

Für Challenge-Endzustände gibt es analog `includesAny`. So kann etwa eine Pull-Request-Beschreibung nach mehreren gleichwertigen Nachweisen wie `geprüft`, `kontrolliert`, `getestet` oder `verifiziert` bewertet werden, ohne ein einzelnes Pflichtwort festzuschreiben.

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
- `completionValidation` mit `includes` auf Freitext-Zuständen wie einer Pull-Request-Beschreibung

Ausnahme sind Schritte mit `exactTextValidation: true`.

Tolerante Synonymlisten über `containsAny` beziehungsweise `includesAny` sind ausdrücklich für Fälle vorgesehen, in denen eine fachliche Mindestabsicht geprüft werden muss, aber mehrere natürliche Formulierungen korrekt sind.

Exakte Prüfungen auf nicht-freie Werte bleiben unverändert zulässig, zum Beispiel Dateinamen, Code-/Dateiinhalte, Branch-Namen oder strukturierte Runtime-Zustände.
