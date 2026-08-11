# Kontext-Briefing für LLM-Sitzungen

Dieses Dokument an den Anfang jeder Sitzung mit einem beliebigen Modell stellen.
Bei Codeaufgaben zusätzlich `docs/02-domaenenmodell.md` mitgeben. Bei Auth-, Persistenz-,
Cloud-SDK-, Amplify-Backend- oder Deployment-Arbeit zusätzlich `docs/19-aws-amplify-konventionen.md`
und `docs/20-cloud-provider-boundary.md` lesen.

---

## Projekt

**AI Training Lab** — browserbasierte Schulungsplattform, die Mitarbeitenden ohne technische
Vorkenntnisse beibringt, ein Werkzeug zu bedienen **und** KI produktiv darin einzusetzen.
Nutzer handeln in einer simulierten Umgebung; das System erkennt ihre Aktionen und führt sie
Schritt für Schritt. Aktueller Stand: Prototyp vorhanden, Umbau zur generischen Plattform läuft.

Stack: React, TypeScript, Tailwind, Monorepo, AWS Amplify Hosting. Sprache DE.

## Projektbetrieb und Entwicklungsumgebung (verbindlich)

- **Single Source of Truth ist ausschließlich das Git-Repository `dimto13/ai-tutor-lab`.**
- Entwicklung, Builds und Tests erfolgen auf dem lokalen Entwicklungsrechner und auf Basis eines
  explizit ausgecheckten Git-Branches.
- Zusammenarbeit und Integration erfolgen über Git/GitHub mit Branches, Commits und Pull Requests.
- Ziel für Hosting und Deployment ist **AWS Amplify**; weitere AWS-Dienste können später ergänzt werden.
- **AWS ist die erste Infrastrukturimplementierung, nicht die Architektur der Anwendung.**
  Fachliche Logik und UI bleiben cloud-neutral und sprechen ausschließlich mit eigenen Ports und
  kanonischen Modellen. Cloud-spezifische SDKs liegen hinter Adaptern.
- **Lovable war ausschließlich für den ersten POC/Bootstrap im Einsatz und ist ab jetzt kein Bestandteil
  des Entwicklungs-, Test-, Preview-, Publishing-, Deployment- oder Synchronisationsprozesses mehr.**
- Lovable-URLs, Lovable-Previews, Lovable-Publishing und eine etwaige GitHub↔Lovable-Synchronisierung
  dürfen nicht zur Beurteilung des aktuellen Projektstands verwendet werden.
- Verbliebene Lovable-Artefakte oder historische Hinweise im Repository sind Legacy und nicht autoritativ;
  sie dürfen entfernt werden, sobald sie nicht mehr für die Nachvollziehbarkeit des POC benötigt werden.

## Die acht Regeln, gegen die nicht verstoßen werden darf

1. **Trainingslogik kennt keine React-Komponente.** `packages/training-engine` hat keine
   UI-Abhängigkeit und läuft in Node.
2. **Szenarien kennen kein DOM.** Highlight-Ziele sind semantische Referenzen
   (`vscode.activityBar.explorer`), niemals CSS-Selektoren. Auflösung nur im RuntimeAdapter.
3. **Simulatoren kennen keine Trainingslogik.** Sie emittieren Events und beantworten Queries.
4. **Content ist Daten, kein Code.** Szenarien sind YAML/JSON, schema-validiert, außerhalb
   der Komponenten.
5. **Keine Hersteller in der fachlichen Codestruktur.** Nicht `MicrosoftTraining.ts`, sondern
   Technology → Provider → Product → Runtime → Capability.
6. **Fortschritt entsteht durch Nutzeraktionen**, nicht durch einen Weiter-Button.
7. **Echte Firmendokumente nur in der Mandanten-Boundary.** Das Klassifizierungs-Lernmodul
   arbeitet ausschließlich mit synthetischen Dokumenten; der Dokumenten-Check läuft in einer
   dedizierten, mandantenverwalteten Umgebung. Dokumentinhalte erscheinen nie in Events,
   Logs oder Telemetrie. Bei Unsicherheit stuft das System höher ein, nie niedriger.
8. **Cloud-SDKs sind Infrastruktur, keine Anwendungs-API.** UI, Routes, State, Trainingslogik und
   fachliche Modelle importieren keine Cognito-, Amplify-, Firebase- oder Google-Cloud-Typen als
   Vertrag. Sie hängen an eigenen Ports wie `AuthService` und eigenen Modellen wie `UserIdentity`.
   AWS/Cognito wird zuerst implementiert; weitere Clouds werden später durch zusätzliche Adapter
   ergänzt. Verbindliche Details: `docs/20-cloud-provider-boundary.md`.

## Cloud-Provider-Boundary (verbindlich)

```text
UI / Routes / State / Application Logic
                |
                v
        eigene Ports/Modelle
      z. B. AuthService, UserIdentity
                |
                v
        Cloud-spezifische Adapter
                |
                v
        AWS/Cognito heute
        weitere Provider später
```

- `AuthService`, `UserIdentity` und andere fachliche Ports sind cloud-neutral.
- AWS-/Amplify-SDK-Imports im Web gehören ausschließlich in die vorgesehenen Adapterverzeichnisse.
- `amplify/` darf AWS-spezifische Infrastruktur enthalten; diese Typen dürfen nicht nach oben leaken.
- Kein generischer Mega-Wrapper `CloudProvider` über Auth, Storage, Datenbank und Functions. Stattdessen
  getrennte fachliche Capabilities/Ports.
- Ein späterer GCP-Wechsel oder Parallelbetrieb wird durch neue Adapter realisiert, nicht durch
  einen Umbau von Komponenten oder Trainingslogik.
- Die CI-Architekturtests sichern diese Abhängigkeitsrichtung ab.

## Begriffe (verbindlich)

```
Technology   Werkzeugklasse als Lernziel (IDE, AI Coding Assistant …)
Provider     Hersteller
Product      konkretes Werkzeug (VS Code, GitHub Copilot)
Runtime      Adapter, in dem gearbeitet wird (Simulator oder echt)
Curriculum → Course → Module → Scenario → Step
LearningLayer  tool | concept | ai_workflow
TrainingMode   explore | guided | challenge
ClassificationScheme  Vertraulichkeitsstufen + Indikatoren + KI-Freigabematrix je Mandant
```

## Trainingsmodi

- **Explore** — freies Erkunden, System erklärt jedes Element, keine Fehler, Punkte ×0,5
- **Guided** — Schritt für Schritt mit Overlay und drei Hilfestufen, Punkte ×1,0
- **Challenge** — nur Zielbeschreibung, Prüfung des Endzustands, Punkte ×2,0

## Zielgruppe und Ton

Menschen ohne IT-Vorkenntnisse in einem Unternehmen. Enterprise-Optik (GitHub, VS Code,
Microsoft Learn, moderne SaaS-Dashboards). **Keine verspielte Gamification**, kein Konfetti,
keine Maskottchen. Ruhige Oberfläche, klare Informationshierarchie, die nächste Aktion ist
immer eindeutig erkennbar.

Der Nutzer muss jederzeit wissen: Wo bin ich? Was soll ich tun? Warum? War es erfolgreich?
Was kommt als Nächstes?

## Was ich normalerweise von dir brauche

- Konkreten, lauffähigen Code, der die Architekturregeln einhält
- Bei Architekturvorschlägen: die Abhängigkeitsrichtung explizit benennen
- Bei Content: gültiges YAML gegen das Szenario-Schema
- Widerspruch, wenn eine Anforderung die Architektur verletzt — lieber die Verletzung benennen als
  eine Abkürzung nehmen

## Was du nicht tun sollst

- Keine Kubernetes-, Docker- oder Backend-Infrastruktur vorschlagen, solange nicht ausdrücklich
  danach gefragt wird
- Keine Szenariodaten in Komponenten schreiben
- Keine `localStorage`-Zugriffe außerhalb der dafür vorgesehenen Persistenzschicht
- Keine Cloud-SDKs direkt aus UI, Routes, State oder fachlicher Logik importieren
- Keine provider-spezifischen Identitätsobjekte als Domänenmodell verwenden
- Keine neuen Begriffe erfinden, wenn es oben schon einen gibt
- Lovable nicht für Entwicklung, Preview, Publishing, Deployment oder Synchronisation verwenden
