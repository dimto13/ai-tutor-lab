# Tenant-Provisionierung

Die Cloud-Autorität erwartet für Eigendaten- und Transparenzpfade genau eine Cognito-Gruppe im Namespace `tenant:<tenantId>`. Der Client setzt oder übermittelt keine Tenant-ID als Autoritätsargument.

## Self-Service-Registrierung

Für per E-Mail registrierte und bestätigte Nutzer existiert der Bootstrap-Tenant `tenant:default`. `amplify/auth/resource.ts` deklariert diese Gruppe als Backend-Ressource und verdrahtet `tenantPostConfirmation` über den nativen Amplify-Gen2-Vertrag `defineAuth.triggers.postConfirmation`. Die Trigger-Funktion ist mit `defineFunction` in `amplify/auth/post-confirmation/resource.ts` definiert. Ihre Resource-Berechtigung ist auf `addUserToGroup` begrenzt; der Handler fügt den bestätigten Nutzer serverseitig zu `tenant:default` hinzu.

Der Handler provisioniert ausschließlich bei `PostConfirmation_ConfirmSignUp`. Cognito ruft denselben Trigger auch nach einem bestätigten Passwort-Reset (`PostConfirmation_ConfirmForgotPassword`) auf; dort ist die Mitgliedschaft bereits entschieden, deshalb erfolgt dort kein Gruppenaufruf.

Schlägt die Gruppenzuweisung fehl, bricht der Trigger die Bestätigung nicht ab: der Nutzer ist in Cognito zu diesem Zeitpunkt bereits bestätigt, ein geworfener Trigger erzeugt lediglich einen undurchsichtigen Client-Fehler. Der Fehlerfall bleibt fail-closed, weil ohne `tenant:*`-Gruppe jeder Eigendatenpfad serverseitig gesperrt bleibt und die Oberfläche den gemappten fachlichen Zustand zeigt. Für die Nachverfolgung protokolliert der Handler nur User-Pool, pseudonymes Subject, Zielgruppe und Fehlergrund — keine Mailadresse.

Damit ist die Provisionierung Bestandteil des reproduzierbaren Amplify-Deployments; ein manueller Einzelgriff in der AWS-Konsole ist nicht erforderlich. Die native Trigger-Verdrahtung vermeidet außerdem eine manuell erzeugte CloudFormation-Abhängigkeit vom User Pool zurück auf die Trigger-Lambda.

## Autoritätsgrenzen

- Das authentifizierte `sub` bleibt die einzige Subject-Quelle für Eigendatenzugriffe.
- Der Browser kann weder Tenant-Mitgliedschaft setzen noch eine Tenant-ID als Exportargument vorgeben.
- Keine, mehrere oder widersprüchliche `tenant:*`-Mitgliedschaften bleiben im serverseitigen Exportpfad fail-closed.
- `tenant:default` ist ein Bootstrap für Self-Service-E-Mail-Registrierungen, keine Mandantenverwaltungs-UI.
- Föderierte OIDC-Anmeldungen lösen Cognitos Post-Confirmation-Trigger nicht aus. Deren Tenant-Zuordnung muss deshalb durch den jeweiligen serverseitigen Enterprise-Provisionierungspfad erfolgen; sie darf nicht clientseitig nachgebildet werden.

## Fehlerdarstellung

Erwartbare Tenant-Membership-Fehler aus AppSync/Lambda werden im Amplify-Adapter in einen fachlichen deutschen Zustand übersetzt. Provider-Präfixe und interne Lambda-Texte werden nicht an die Route weitergereicht. Andere unerwartete Providerfehler bleiben Fehler und werden nicht als gültige Policy-Werte interpretiert.
