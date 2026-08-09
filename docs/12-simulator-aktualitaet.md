# 12 — Simulator-Aktualität

Simulatoren müssen die Informationsarchitektur und das Interaktionsmodell des vermittelten
Produkts korrekt wiedergeben. Die verbindliche, maschinenlesbare Pflegeplanung liegt in
`.github/simulator-currency.json`. Sie ersetzt keine Produktprüfung, sondern sorgt dafür, dass
sie nicht stillschweigend ausfällt.

## Verantwortlichkeit und Turnus

- Für jedes Produkt ist genau ein GitHub-Login als `owner` eingetragen.
- Der reguläre Turnus beträgt sechs Monate (`cadenceMonths: 6`) und erfüllt NFR-14.
- `nextReviewAt` ist das Fälligkeitsdatum. Nach abgeschlossener Prüfung werden
  `lastReviewedAt` und das um sechs Monate fortgeschriebene `nextReviewAt` per Pull Request
  aktualisiert.
- Der wöchentlich laufende Workflow prüft nur die Fälligkeit. Der kürzere technische Takt stellt
  sicher, dass ein ausgefallener Lauf nachgeholt wird; er ändert nicht den halbjährlichen
  fachlichen Turnus.

## Ablauf einer Produktprüfung

1. Der Workflow erzeugt bei Fälligkeit ein dedupliziertes Review-Issue mit Epic-, Prio- und
   Typ-Label, Milestone und Zuordnung als Sub-Issue unter EP-12.
2. Der verantwortliche Owner arbeitet die produktspezifische Checkliste im Issue ab und hält
   die verwendete Produktversion sowie belastbare Nachweise fest.
3. Festgestellte Abweichungen werden in `deviations` des betroffenen Produkts eingetragen. Jede
   Abweichung besitzt eine stabile ID, Beschreibung, beobachtete Version und mindestens eine
   betroffene Szenario-ID. Damit sind betroffene Szenarien bereits im versionierten Prüfplan
   sichtbar markiert.
4. Nach Merge dieser Datenänderung erzeugt derselbe Workflow für jede offene Abweichung ein
   dedupliziertes Bug-Issue. Der Body listet die betroffenen Szenario-IDs und Dateipfade auf.
5. Nach Korrektur wird die Abweichung auf `resolved` gesetzt. Das zugehörige Issue wird bewusst
   nicht automatisch geschlossen; Abschluss und Nachweis bleiben eine Review-Entscheidung.

## Beispiel einer dokumentierten Abweichung

```json
{
  "id": "chat-mode-label-2026-10",
  "summary": "Bezeichnung eines Chat-Modus ist veraltet",
  "details": "Die reale Oberfläche verwendet eine neue Bezeichnung; Simulator und Lerntext weichen ab.",
  "observedVersion": "2026-10",
  "scenarioIds": ["copilot-basics.guided"],
  "status": "open"
}
```

Der lokale Befehl `npm run validate:simulator-currency` prüft Schema, Termine, eindeutige IDs,
Szenario-Referenzen und die Zuordnung zum primären oder integrierten Runtime-Adapter. Ohne
`--sync` führt der Befehl keine GitHub-Schreiboperation aus, sondern gibt nur den aktuellen
Issue-Plan aus.

## Sicherheits- und Betriebsgrenzen

- Schreibrechte bestehen nur im dedizierten Workflow und nur für Issues.
- Pull-Request-Checks führen ausschließlich die read-only Validierung aus.
- Verdeckte stabile Marker verhindern doppelte offene Issues bei wiederholten Läufen.
- Automatisch erzeugte Issues erhalten die in der Policy festgelegten Labels, den Milestone und
  die Epic-Sub-Issue-Zuordnung. Inhaltliche Ticketarbeit findet danach ausschließlich im Issue
  statt.
