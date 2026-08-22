# Optionale LLM-Bewertungsstufe in der Tenant-Boundary

Die LLM-Bewertung aus AITP-126 ist eine optionale zweite Stufe hinter dem deterministischen Dokumenten-Check aus AITP-125. Der deterministische Check bleibt vollständig funktionsfähig und autoritativ als Mindestklassifikation.

## Aktivierung

Die LLM-Stufe wird nur aufgerufen, wenn alle drei Bedingungen erfüllt sind:

1. die Funktion ist für die konkrete Tenant-Instanz aktiviert,
2. der Mandant hat der Verarbeitung ausdrücklich zugestimmt (`tenantOptIn`),
3. ein `BoundaryLlmClassifier` ist innerhalb der Tenant-Boundary konfiguriert.

Fehlt eine Bedingung, läuft ausschließlich die deterministische Klassifikation. Providerfehler führen ebenfalls zum deterministischen Ergebnis zurück; der Trainings- und Dokumenten-Check bleibt dadurch verfügbar.

## Datenfluss

`DocumentSource` wird nur an den konfigurierten `BoundaryLlmClassifier` übergeben, nachdem Tenant-Kontext und Opt-in geprüft wurden. Der Port ist providerneutral. Eine konkrete Bedrock-, lokale Modell- oder andere Provider-Implementierung muss innerhalb derselben Firmen-/Tenant-Boundary betrieben werden. Providerdetails, Endpunkte und Secrets gehören ausschließlich in den Adapter bzw. dessen Laufzeitkonfiguration und nicht in Domain, UI oder Client-Bundle.

Der bestehende Audit-Pfad aus AITP-125 bleibt unverändert metadata-only: persistiert werden Zeitstempel, Dateityp, finale Stufe, erkannte Merkmals-IDs und Nutzer-ID. Dokumentbytes, extrahierter Text, Modellprompt und Modellantwort werden über diesen Pfad nicht persistiert.

## Monotone Klassifikation

Ein Modell darf die deterministische Einstufung bestätigen oder auf eine höhere vorhandene Klassifikationsstufe anheben. Eine vorgeschlagene niedrigere Stufe wird verworfen. Bei einer Anhebung werden die AI-Tool-Freigaben aus dem bestehenden `ClassificationScheme` für die finale Stufe neu berechnet.

## Externe Provider

Ein externer API-Endpunkt ist nicht Bestandteil dieser Implementierung. Falls ein Mandant später einen externen Provider zulässt, ist dafür zusätzlich ein dokumentiertes Tenant-Opt-in sowie die konkrete Datenschutz-, IAM-, Logging- und Retention-Konfiguration des Deployments erforderlich. CI- und Mock-Tests ersetzen diese reale Deployment-Evidence nicht.
