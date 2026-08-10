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

Geeignet:

```json
"validation": {
  "kind": "event",
  "type": "copilot.prompt.submitted"
}
```

Der Schritt beschreibt weiterhin klar, welche fachlichen Bestandteile der Nutzer formulieren soll. Der Simulator blockiert aber keine sinngleiche Formulierung.

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

Auch deterministische Simulatorantworten dürfen bei einer Freitextaufgabe nicht von einem Magic Word abhängen. Wenn ein Szenario bewusst eigene Formulierungen zulässt, soll die passende Seed-Antwort ohne `promptContains` auf den relevanten Kontext reagieren.

## CI-Regel

`npm run validate:content` führt `scripts/validate-freetext-policy.ts` aus. Bei Non-Programmer-Szenarien werden unter anderem blockiert:

- `validation.contains.prompt`
- `validation.contains.reply`
- `validation.contains.description`
- `completionValidation` mit `includes` auf Freitext-Zuständen wie einer Pull-Request-Beschreibung

Ausnahme sind Schritte mit `exactTextValidation: true`.

Exakte Prüfungen auf nicht-freie Werte bleiben unverändert zulässig, zum Beispiel Dateinamen, Code-/Dateiinhalte, Branch-Namen oder strukturierte Runtime-Zustände.
