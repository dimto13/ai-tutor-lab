# Hinweise für Claude

Lies und befolge zuerst [`AGENTS.md`](AGENTS.md). Dadurch sind insbesondere
[`prompts/model-briefing.md`](prompts/model-briefing.md) und bei Codearbeit zusätzlich
[`docs/02-domaenenmodell.md`](docs/02-domaenenmodell.md) verbindlicher Kontext.

Bei Arbeit an Auth/Identity, Persistenz, Cloud-SDKs, Amplify-Backend oder Deployment zusätzlich
[`docs/19-aws-amplify-konventionen.md`](docs/19-aws-amplify-konventionen.md) und
[`docs/20-cloud-provider-boundary.md`](docs/20-cloud-provider-boundary.md) lesen.

## Cloud-Provider-Boundary

- AWS/Cognito ist die erste Infrastrukturimplementierung, nicht der Anwendungsvertrag.
- UI, Routes, State, Training Engine und fachliche Modelle verwenden eigene Ports und Modelle wie
  `AuthService`, `UserIdentity` und `TrainingSubjectRef`.
- Cloud-spezifische SDKs und Typen bleiben hinter den vorgesehenen Adaptern.
- Ein späterer weiterer Provider wird durch einen neuen Adapter ergänzt; die UI wird dafür nicht
  auf einen anderen Cloud-SDK-Vertrag umgebaut.
- Die Architekturtests sind verbindliche Guards und dürfen nicht zur Umgehung dieser Boundary
  abgeschwächt werden.

## GitHub-Aufgabenverwaltung

- Zentrales Board: [AI Tutor – Development](https://github.com/users/dimto13/projects/3)
- Aufgaben und Ticketinhalte ausschließlich in GitHub Issues pflegen; `backlog/` und
  `docs/06-backlog.md` sind eingefrorenes Archiv.
- Statusarbeit wie Zuweisung, Board-Spalte, Checkboxen und Schließen direkt am Issue pflegen.
- Vor der Bearbeitung eines Tickets dessen Abhängigkeiten, Akzeptanzkriterien und Milestone
  lesen; nach der Bearbeitung den tatsächlichen Stand im Issue beziehungsweise Board abbilden.
- Keine Git-History umschreiben und nicht force-pushen.
- `deploy` nicht verschieben; die reale AWS-Freigabe bleibt beim Repository-Eigentümer.
