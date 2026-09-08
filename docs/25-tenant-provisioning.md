# Tenant-Provisionierung

Die Cloud-Autorität erwartet für Eigendaten- und Transparenzpfade genau eine Cognito-Gruppe im Namespace `tenant:<tenantId>`. Der Client setzt oder übermittelt keine Tenant-ID als Autoritätsargument.

## Geschlossene Beta-Zulassung

Während der geschlossenen Beta ist `BETA_ALLOWED_EMAILS` die owner-verwaltete Zulassungsliste für **neue** Cognito-Identitäten. Die Variable enthält eine kommagetrennte Liste von E-Mail-Adressen; Vergleiche erfolgen serverseitig nach Trim + Kleinschreibung. Eine fehlende oder leere Konfiguration lässt absichtlich keine neue Registrierung zu.

`betaPreSignUp` ist als nativer Cognito-`preSignUp`-Trigger verdrahtet. Nicht allowlistete oder nicht eindeutig per E-Mail zuordenbare neue Identitäten werden mit dem stabilen internen Marker `BETA_ACCESS_DENIED` abgewiesen, bevor Cognito den Account anlegt oder verknüpft. Die Web-Auth-Grenze übersetzt ausschließlich diesen Marker in die verständliche Meldung, dass die geschlossene Beta nur eingeladenen Testern offensteht; der Provider-/Lambda-Rohfehler wird nicht angezeigt.

Die Post-Confirmation-Prüfung verwendet dieselbe serverseitige Allowlist zusätzlich als Defense-in-Depth. Ändert sich die Allowlist zwischen Registrierung und E-Mail-Bestätigung, wird keine Tenant-Gruppe provisioniert.

### Minimaler Owner-Prozess

1. **Tester hinzufügen:** normalisierte E-Mail in `BETA_ALLOWED_EMAILS` ergänzen und die Auth-Konfiguration über den normalen Owner-Deploymentprozess ausrollen. Danach registriert sich der Tester über den normalen E-Mail-Flow.
2. **Noch nicht registrierten Tester entfernen:** E-Mail aus `BETA_ALLOWED_EMAILS` entfernen und die Konfiguration ausrollen. Ein neuer Signup wird danach serverseitig abgewiesen.
3. **Bereits aktivierten Tester sperren:** zusätzlich zur Entfernung aus `BETA_ALLOWED_EMAILS` den bestehenden Cognito-Benutzer über den administrativen Cognito-Pfad deaktivieren oder löschen. Das reine Entfernen aus der Allowlist ist absichtlich keine nachträgliche Session-/Account-Revocation.

Bestehende bestätigte Accounts werden durch die Einführung des Gates nicht nachträglich neu bewertet: `preSignUp` läuft nur bei neuer Identitätserzeugung/-verknüpfung, und `tenantPostConfirmation` bewertet nur `PostConfirmation_ConfirmSignUp`. Damit bleibt die Bestandsmigration kontrolliert. Für die erste Beta ist der freigegebene Testerflow die E-Mail-Registrierung; föderierte OIDC-Tenant-Provisionierung bleibt ein separater Enterprise-Pfad.

Die Allowlist als Lambda-Umgebungsvariable ist bewusst ein Beta-MVP für ungefähr fünf Tester. Für deutlich größere Kohorten muss die Zulassung in einen dafür geeigneten serverseitigen Store migriert werden; das ändert nichts an der Autoritätsgrenze.

## Self-Service-Registrierung

Für zugelassene, per E-Mail registrierte und bestätigte Nutzer existiert der Bootstrap-Tenant `tenant:default`. `amplify/auth/resource.ts` deklariert diese Gruppe als Backend-Ressource und verdrahtet `tenantPostConfirmation` über den nativen Amplify-Gen2-Vertrag `defineAuth.triggers.postConfirmation`. Die Trigger-Funktion ist mit `defineFunction` in `amplify/auth/post-confirmation/resource.ts` definiert. Ihre Resource-Berechtigung ist auf `addUserToGroup` begrenzt; der Handler fügt den bestätigten Nutzer serverseitig zu `tenant:default` hinzu.

Der Handler provisioniert ausschließlich bei `PostConfirmation_ConfirmSignUp`. Cognito ruft denselben Trigger auch nach einem bestätigten Passwort-Reset (`PostConfirmation_ConfirmForgotPassword`) auf; dort ist die Mitgliedschaft bereits entschieden, deshalb erfolgt dort kein Gruppenaufruf.

Schlägt die Gruppenzuweisung fehl, bricht der Trigger die Bestätigung nicht ab: der Nutzer ist in Cognito zu diesem Zeitpunkt bereits bestätigt, ein geworfener Trigger erzeugt lediglich einen undurchsichtigen Client-Fehler. Der Fehlerfall bleibt fail-closed, weil ohne `tenant:*`-Gruppe jeder dafür geschützte Eigendatenpfad serverseitig gesperrt bleibt. Für die Nachverfolgung protokolliert der Handler nur User-Pool, pseudonymes Subject, Zielgruppe und Fehlergrund — keine Mailadresse.

Damit ist die Provisionierung Bestandteil des reproduzierbaren Amplify-Deployments; ein manueller Einzelgriff in der AWS-Konsole ist für normale Zulassung/Provisionierung nicht erforderlich. Die native Trigger-Verdrahtung vermeidet außerdem eine manuell erzeugte CloudFormation-Abhängigkeit vom User Pool zurück auf die Trigger-Lambda.

## Autoritätsgrenzen

- Die Beta-Zulassung wird ausschließlich in Cognito-Triggern aus serverseitiger Konfiguration entschieden; Browserparameter, LocalStorage oder frei gesetzte Requests können sie nicht aktivieren.
- Das authentifizierte `sub` bleibt die einzige Subject-Quelle für Eigendatenzugriffe.
- Der Browser kann weder Tenant-Mitgliedschaft setzen noch eine Tenant-ID als Exportargument vorgeben.
- Keine, mehrere oder widersprüchliche `tenant:*`-Mitgliedschaften bleiben in den dafür definierten serverseitigen Pfaden fail-closed.
- `tenant:default` ist ein Bootstrap für zugelassene Self-Service-E-Mail-Registrierungen, keine Mandantenverwaltungs-UI.
- Föderierte OIDC-Anmeldungen lösen Cognitos Post-Confirmation-Trigger nicht aus. Deren Tenant-Zuordnung muss deshalb durch den jeweiligen serverseitigen Enterprise-Provisionierungspfad erfolgen; sie darf nicht clientseitig nachgebildet werden.

## Fehlerdarstellung

Eine durch das Closed-Beta-Gate abgewiesene Registrierung wird an der Cognito-Adaptergrenze in eine verständliche Beta-Zugangs-Meldung übersetzt. Der interne Marker und Provider-/Lambda-Präfixe werden nicht in der UI angezeigt.

Erwartbare Tenant-Membership-Fehler aus AppSync/Lambda werden im Amplify-Adapter ebenfalls in einen fachlichen deutschen Zustand übersetzt. Andere unerwartete Providerfehler bleiben Fehler und werden nicht als gültige Policy-Werte interpretiert.
