# Tenant-Provisionierung

Die Cloud-Autorität erwartet für Eigendaten- und Transparenzpfade genau eine Cognito-Gruppe im Namespace `tenant:<tenantId>`. Der Client setzt oder übermittelt keine Tenant-ID als Autoritätsargument.

## Self-Service-Registrierung

Für per E-Mail registrierte und bestätigte Nutzer existiert der Bootstrap-Tenant `tenant:default`. `amplify/auth/resource.ts` deklariert diese Gruppe als Backend-Ressource. `amplify/backend.ts` hängt einen serverseitigen Cognito-Post-Confirmation-Trigger an den User Pool. Der Trigger besitzt ausschließlich `cognito-idp:AdminAddUserToGroup` auf genau diesen User Pool und fügt den bestätigten Nutzer zu `tenant:default` hinzu.

Damit ist die Provisionierung Bestandteil des reproduzierbaren Amplify-Deployments; ein manueller Einzelgriff in der AWS-Konsole ist nicht erforderlich.

## Autoritätsgrenzen

- Das authentifizierte `sub` bleibt die einzige Subject-Quelle für Eigendatenzugriffe.
- Der Browser kann weder Tenant-Mitgliedschaft setzen noch eine Tenant-ID als Exportargument vorgeben.
- Keine, mehrere oder widersprüchliche `tenant:*`-Mitgliedschaften bleiben im serverseitigen Exportpfad fail-closed.
- `tenant:default` ist ein Bootstrap für Self-Service-E-Mail-Registrierungen, keine Mandantenverwaltungs-UI.
- Föderierte OIDC-Anmeldungen lösen Cognitos Post-Confirmation-Trigger nicht aus. Deren Tenant-Zuordnung muss deshalb durch den jeweiligen serverseitigen Enterprise-Provisionierungspfad erfolgen; sie darf nicht clientseitig nachgebildet werden.

## Fehlerdarstellung

Erwartbare Tenant-Membership-Fehler aus AppSync/Lambda werden im Amplify-Adapter in einen fachlichen deutschen Zustand übersetzt. Provider-Präfixe und interne Lambda-Texte werden nicht an die Route weitergereicht. Andere unerwartete Providerfehler bleiben Fehler und werden nicht als gültige Policy-Werte interpretiert.
