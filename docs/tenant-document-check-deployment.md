# Dokumenten-Check: dedizierte Mandanteninstanz

Der Dokumenten-Check wird pro Unternehmen als eigene Boundary betrieben. Die geteilte Lernplattform ist weder Dokumentenspeicher noch Analyseziel.

## Referenzarchitektur

1. Eine mandanteneigene Upload-/API-Schicht nimmt das Dokument authentifiziert entgegen und leitet Bytes nur in-memory an den Dokumenten-Check weiter.
2. Die Boundary wird mit genau einer `tenantId`, dem dazugehörigen `ClassificationScheme` und mandanteneigenen Parser-Adaptern für PDF/DOCX/XLSX/TXT gestartet.
3. `createTenantDocumentCheckService` verweigert widersprüchliche Tenant-Kontexte vor der Extraktion. Die Klassifizierung verwendet ausschließlich die Engine aus #67.
4. Dokumentbytes und extrahierter Text bleiben lokale Variablen des Requests. Es gibt keinen Persistenz-Port für Inhalte und keinen Content-Logger.
5. Der einzige Persistenz-Port ist `DocumentCheckAuditSink`. Er akzeptiert ausschließlich Zeitstempel, Dateityp, Klassifizierungsstufe, Merkmals-IDs und Nutzer-ID.
6. Ergebnisdaten enthalten Stufe, Begründungen, Freigabematrix, Human-Review-Signal, Disclaimer und einen konfigurierten Link zur passenden Lerneinheit.

## Deployment-Grenzen

- Eigenes Cloud-Konto bzw. eigene isolierte Umgebung je Unternehmen; keine gemeinsame Dokumenten-Check-Datenbank über Mandanten hinweg.
- Authentifizierte Nutzer- und Tenant-Identität serverseitig auflösen. `tenantId` niemals aus einem ungeprüften Client-Feld als Authority übernehmen.
- Audit-Speicher und Schlüssel mandanteneigen betreiben. Zugriffsrechte auf den minimalen Audit-Datensatz beschränken.
- Request-/Proxy-/APM-Logging so konfigurieren, dass Bodies, Uploadbytes, extrahierter Text und Dateinamen nicht aufgezeichnet werden.
- Temporäre Dateien vermeiden. Falls ein konkreter Parser technisch eine Datei benötigt, muss der Adapter einen mandanteneigenen ephemeren Speicher mit sicherer Löschung verwenden; dies liegt außerhalb des Domänenkerns.
- Parser, Malware-Prüfung, Größenlimits und Timeouts an der Upload-Grenze konfigurieren. Parserfehler fail-closed behandeln.
- Der Link zur Lerneinheit wird deployment-spezifisch konfiguriert; der Domänenservice erfindet keine Route.

## Nachweis vor produktiver Freigabe

CI deckt die fachliche Boundary ab: Cross-Tenant-Anfragen werden vor Extraktion abgewiesen und der Audit-Sink erhält niemals Dokumentinhalt, Bytes oder Dateinamen. Eine reale Cloud-Freigabe muss zusätzlich die konkrete Infrastruktur prüfen: deaktiviertes Body-Logging, isolierte Datenhaltung, IAM/Secrets, Verschlüsselung, Retention und Parser-Laufzeit. Diese Infrastruktur-Evidence ist deployment-spezifisch und wird nicht durch Unit-Tests ersetzt.
