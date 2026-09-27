# Runtime-Pfad-Semantik

Wie Dateinamen und Pfade verglichen werden, ist eine **Eigenschaft des Zielsystems**, keine
Eigenschaft des Trainingscodes. Windows und macOS behandeln `Notiz.txt` und `notiz.txt` als dieselbe
Datei, Linux nicht. Diese Datei beschreibt den Vertrag, mit dem die Plattform das abbildet, ohne
Hersteller- oder Betriebssystem-Sonderlogik in die Training Engine zu holen (Ticket #521, Teil B
von #455).

## Das Profil wird deklariert, nie geraten

Es gibt genau zwei Werte: `case-sensitive` und `case-insensitive`.

```jsonc
// content/scenarios/<szenario>.json
"environment": {
  "productId": "vscode",
  "version": "1.x",
  "runtimeAdapterId": "vscode-simulator",
  "pathComparison": "case-insensitive"
}
```

Auflösungsreihenfolge, umgesetzt in `resolveRuntimeEnvironmentSemantics`:

1. `environment.pathComparison` des Szenarios — der konkrete Lernvertrag gewinnt.
2. Sonst `DEFAULT_RUNTIME_PATH_COMPARISON`, und der ist **`case-sensitive`**.

Der Default ist bewusst der strenge Wert: ohne deklariertes Profil bleibt die echte Semantik
erhalten. Die Plattform leitet das Profil **nicht** aus `productId`, einem Betriebssystemnamen oder
dem Host ab — es gibt keine OS-Erkennung.

Wann `case-insensitive` richtig ist: wenn der Lernvertrag keine exakte Schreibweise verlangt, das
Training also Dateinamen-Sorgfalt nicht zum Lernziel hat. Wann nicht: sobald genau die Schreibweise
geprüft werden soll, oder das Zielsystem case-sensitive ist.

## Wo Pfad-Identität gilt — und wo nicht

Die Engine weiß von sich aus nicht, welcher Wert ein Pfad ist. Deshalb **deklariert die Runtime**
ihre Pfadpositionen in `RuntimeReferenceDefinition.pathIdentity`:

```ts
pathIdentity: {
  eventKeys: ["filename", "path"],          // Event-Payload-Schlüssel
  selectors: ["filesystem.files", "editor.activeFile", /* … */], // State-Selektoren
}
```

Nur diese Positionen vergleichen profilabhängig. **Alles andere vergleicht exakt.** Das ist der
Mechanismus, der Code- und Freitextinhalte schützt:

| Position                                     | Vergleich                                    |
| -------------------------------------------- | -------------------------------------------- |
| `editor.activeFile` gegen `notiz.txt`        | Pfad → profilabhängig                        |
| `filesystem.files` enthält `notiz.txt`       | Pfad-Liste → profilabhängig                  |
| `filesystem.contents` **Schlüssel**          | Pfad → profilabhängig                        |
| `filesystem.contents` **Wert** (Dateiinhalt) | **immer exakt**                              |
| `terminal.command.executed` `command`        | **immer exakt** — ein Kommando ist kein Pfad |
| nicht deklarierter Selektor                  | **immer exakt**                              |

Bei einer Map ist also der Schlüssel ein Pfad, der Wert nie. `{"notiz.txt": "Hallo Welt"}` matcht
eine Datei `NOTIZ.txt`, aber der Inhalt `hallo welt` bleibt ein Fehlschlag.

## Fallfaltung ist locale-fest

`matchesRuntimePath` faltet mit `toLocaleLowerCase("en-US")`, nicht mit der Locale des Betrachters.
Sonst würde `INDEX.md` in einer türkischen Locale über das punktlose `ı` anders falten als in einer
deutschen — dieselbe Datei wäre je nach Nutzer eine andere.

Gefaltet wird ausschließlich Groß-/Kleinschreibung. Kein Trimmen, keine Unicode-Normalisierung,
keine Trennzeichen-Angleichung: `docs/notiz.txt` bleibt von `src/notiz.txt` verschieden,
`notiz .txt` von `notiz.txt`.

## Wer das Profil anwendet

`TrainingProvider` löst das Profil einmal pro Szenario auf und ruft `applyEnvironment` auf jeder
Runtime des Szenarios auf, bevor eine Workspace-Komponente mountet. Runtimes ohne
Pfad-Identitätsverhalten lassen die Methode weg. Die Runtime **speichert** das Profil und leitet es
nie selbst ab.

Innerhalb des VS-Code-Simulators gilt es für alle Dateioperationen: Anlegen (eine abweichend
geschriebene Dublette ist dieselbe Datei und wird nicht zweimal angelegt), Speichern, Inhalt setzen,
Aktivieren, Schließen sowie die SCM-Listen. `file.saved` meldet den kanonischen Namen, damit
nachgelagerte Konsumenten eine Identität sehen und nicht die zufällig getippte Schreibweise.

## Abdeckung

- `packages/runtime-core/tests/runtimePathSemantics.test.ts` — Auflösung, Default, Locale-Festigkeit.
- `packages/training-engine/tests/runtimePathIdentity.test.ts` — beide Profile über `state`- und
  `event`-Validierung, plus die Negativfälle (Inhalt, Kommando, nicht deklarierter Selektor).
- `apps/web/e2e/tests/runtime-path-semantics.spec.ts` — Windows-Fall und case-sensitiver Gegenfall
  am laufenden Training: `vscode-basics.guided` deklariert `case-insensitive`,
  `vscode-basics.challenge` bleibt beim Default.

## Ein neues Profil ergänzen

Ein weiterer Vergleichsmodus (etwa Unicode-Normalisierung) kommt als zusätzlicher Wert in
`RuntimePathComparison` plus ein Zweig in `matchesRuntimePath` — nicht als Sonderfall in einer
Runtime oder in der Engine. Die Tabelle oben ist der Vertrag, gegen den ein neuer Modus geprüft wird.
