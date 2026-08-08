# AI Tutor Lab

Git repo

lab-tutor-training



POC: Interaktive KI-Schulungsplattform für Unternehmen

Ziel

Erstelle einen funktionsfähigen browserbasierten Proof of Concept für eine interaktive KI-Schulungsplattform.

Der POC soll zeigen, wie Mitarbeiter ohne technische Vorkenntnisse Schritt für Schritt durch typische KI- und Entwickler-Workflows geführt werden können.

Wichtig: Dieser POC soll noch keine vollständige Enterprise-Plattform sein. Es geht primär darum, die User Experience, den Trainingsablauf, die visuelle Führung und das Zusammenspiel zwischen Lernschritten, Arbeitsumgebung und KI-Tutor zu demonstrieren.

Die spätere Zielarchitektur wird Kubernetes-basierte isolierte Nutzerumgebungen, echtes VS Code/code-server, GitHub Copilot, CLI-Agenten und Enterprise-SSO enthalten. Diese Komponenten sollen im POC zunächst simuliert werden.



1. Grundidee der Anwendung

Die Anwendung besteht aus einer zentralen Trainingsoberfläche.

Auf der linken bzw. zentralen Seite befindet sich eine simulierte Arbeitsumgebung, die optisch an VS Code erinnert.

Auf der rechten Seite befindet sich ein Trainings- und Tutor-Panel.

Der Nutzer bekommt konkrete Aufgaben wie:

Repository öffnen

Datei erstellen

Inhalt in Datei schreiben

Terminal öffnen

Git Status prüfen

Commit erstellen

GitHub Copilot verwenden

Die Plattform erkennt die Aktionen des Nutzers und schaltet automatisch zum nächsten Trainingsschritt weiter.

Das System soll sich wie ein interaktiver Trainer anfühlen und nicht wie eine klassische E-Learning-Seite.



2. Hauptlayout

Erstelle eine Desktop-orientierte Web-App.

Header

Oben:

Logo / Produktname: AI Training Lab

aktuelles Trainingsmodul

Fortschrittsanzeige

Benutzername

Button „Training verlassen“

Beispiel:

AI Training Lab | Git & Copilot Grundlagen | Schritt 3 von 8 | 38 %



Hauptbereich

Zwei Spalten:

Linke Seite: Training Workspace

ca. 70 % der Breite.

Hier soll eine vereinfachte VS-Code-artige Oberfläche dargestellt werden.

Elemente:

Activity Bar links

Explorer

Search

Source Control

Extensions

Dateibaum

Editor Tabs

Code Editor

Terminal Panel

Status Bar

Es muss kein echter VS-Code-Editor implementiert werden.

Die Oberfläche soll lediglich ausreichend funktional sein, um Trainingsinteraktionen durchführen zu können.



Rechte Seite: Training Guide

ca. 30 % der Breite.

Enthält:

aktuellen Trainingsschritt

kurze Erklärung

konkrete Aufgabe

optionalen Hinweis

KI-Tutor Chat

Fortschritt der Schulung

Beispiel:

Titel:

Schritt 2 – Datei erstellen

Beschreibung:

Erstelle im Projektordner eine neue Datei mit dem Namen hello.py.

Darunter:

Button „Hinweis anzeigen“

Button „Warum mache ich das?“

Tutor-Chat



3. Trainingsszenario

Implementiere zunächst genau ein Szenario:

Szenario

Git, VS Code & GitHub Copilot – Grundlagen

Zielgruppe:

Mitarbeiter ohne Erfahrung mit VS Code oder Git.

Erstelle folgende Schritte.

Schritt 1 – Explorer kennenlernen

Aufgabe:

Öffne den Explorer auf der linken Seite.

Ziel:

Der Nutzer klickt auf das Explorer-Symbol.

Nach erfolgreichem Klick:

Schritt wird automatisch abgeschlossen

Erfolgsmeldung kurz anzeigen

nächsten Schritt aktivieren



Schritt 2 – Repository öffnen

Aufgabe:

Öffne das vorbereitete Repository "ai-training-demo".

Im Explorer soll ein Repository auswählbar sein.

Nach Klick:

Dateibaum anzeigen:

ai-training-demo

README.md

src

docs



Schritt 3 – Datei erstellen

Aufgabe:

Erstelle im Projektverzeichnis eine neue Datei hello.py.

Der Nutzer soll:

auf ein „New File“-Symbol klicken

Dateiname eingeben

Enter drücken

Danach erscheint:

hello.py

im Explorer.

Der Schritt wird automatisch validiert.



Schritt 4 – Code schreiben

Aufgabe:

Schreibe:

print(“Hello AI Training”)

in die Datei.

Der Editor soll editierbar sein.

Validiere den Schritt, sobald der Text ungefähr dem erwarteten Inhalt entspricht.



Schritt 5 – Terminal öffnen

Aufgabe:

Öffne das integrierte Terminal.

Der Nutzer kann dazu:

einen Menüpunkt auswählen
oder

einen Terminal-Button klicken.

Danach öffnet sich unten ein simuliertes Terminal.



Schritt 6 – Git Status

Aufgabe:

Führe git status aus.

Im Terminal muss der Nutzer eingeben:

git status

Danach soll eine simulierte Ausgabe erscheinen:

On branch main

Untracked files:
hello.py

Der Trainingsschritt wird abgeschlossen.



Schritt 7 – Git Commit

Aufgabe:

Simuliere:

git add hello.py

und anschließend:

git commit -m “add hello example”

Das Terminal soll beide Kommandos erkennen.

Danach Ausgabe:

[main abc123] add hello example
1 file changed



Schritt 8 – GitHub Copilot Simulation

Aufgabe:

Bitte GitHub Copilot darum, eine einfache Python-Funktion zum Addieren zweier Zahlen zu erstellen.

Füge im Editor einen Button oder eine kleine Copilot-Eingabe ein.

Der Nutzer kann beispielsweise schreiben:

Create a Python function that adds two numbers.

Danach soll eine simulierte Copilot-Antwort erscheinen:

def add(a, b):
return a + b

Anschließend:

Training abgeschlossen.



4. Interaktive Führung

Ein wichtiger Bestandteil des POC ist die visuelle Führung.

Implementiere ein Overlay-/Highlight-System.

Der aktuell relevante UI-Bereich soll visuell hervorgehoben werden.

Beispiel:

Wenn der Nutzer auf den Explorer klicken soll:

restliche Oberfläche leicht abdunkeln

Explorer-Symbol hervorheben

Tooltip daneben anzeigen

Tooltip:

Hier findest du die Dateien und Ordner deines Projekts.

Der Nutzer soll trotzdem auf das markierte Element klicken können.

Nach Abschluss des Schrittes verschwindet das Overlay.



5. State Machine

Verwende intern eine einfache State Machine.

Jeder Trainingsschritt soll mindestens folgende Zustände haben:

NOT_STARTED

ACTIVE

COMPLETED

Optional:

VALIDATION_FAILED

Nur ein Schritt darf gleichzeitig ACTIVE sein.

Beispiel:

step_1 → COMPLETED
step_2 → COMPLETED
step_3 → ACTIVE
step_4 → NOT_STARTED

Speichere den aktuellen Zustand zunächst im Frontend State und zusätzlich in LocalStorage.

Beim Neuladen der Seite soll der Nutzer an derselben Stelle weitermachen können.



6. Event-System

Die simulierte Arbeitsumgebung soll Events erzeugen.

Beispiele:

explorer.opened

repository.opened

file.created

file.updated

terminal.opened

terminal.command.executed

copilot.prompt.submitted

Die Trainingslogik soll auf diese Events reagieren.

Beispiel:

Event:

file.created

Payload:

{
“filename”: “hello.py”
}

Die State Machine überprüft:

expected filename == “hello.py”

Falls korrekt:

Schritt abschließen.

Die Trainingslogik darf nicht ausschließlich auf Buttons wie „Weiter“ beruhen.

Der nächste Schritt soll möglichst durch die tatsächliche Nutzeraktion ausgelöst werden.



7. KI-Tutor

Implementiere zunächst einen simulierten Tutor ohne zwingende externe LLM-Anbindung.

Der Tutor erscheint rechts unten im Guide Panel.

Beispielhafte Fragen:

Was ist ein Repository?

Warum muss ich git add verwenden?

Was ist der Unterschied zwischen Git und GitHub?

Was macht Copilot hier?

Für den POC können vorbereitete Antworten verwendet werden.

Zusätzlich soll der Tutor den aktuellen Trainingskontext kennen.

Beispiel:

Der Nutzer befindet sich bei:

git status

Wenn er fragt:

Was soll ich jetzt machen?

Antwort:

Öffne das Terminal und gib git status ein. Damit siehst du, welche Dateien Git aktuell erkannt hat.

Der Tutor soll also mindestens folgende Kontextinformationen erhalten:

aktuelles Szenario

aktueller Schritt

abgeschlossene Schritte

letzte Nutzeraktion



8. Fehlerverhalten

Die Anwendung soll auch falsche Aktionen demonstrieren.

Beispiel:

Der Nutzer soll:

hello.py

erstellen.

Er erstellt:

test.py

Dann:

Nicht automatisch weitergehen.

Im Trainingspanel anzeigen:

Fast richtig. Für diese Übung benötigen wir eine Datei mit dem Namen hello.py.

Optional soll das falsche Element im Explorer markiert werden.



9. Hilfe-System

Jeder Schritt soll drei Hilfestufen besitzen.

Hilfe 1

Kurzer Hinweis.

Beispiel:

Der Explorer befindet sich links in der Activity Bar.

Hilfe 2

Konkretere Anweisung.

Klicke auf das oberste Datei-Symbol links.

Hilfe 3

Visuelle Hilfe.

Das Ziel-Element wird deutlich hervorgehoben.

Damit soll später untersucht werden können, wie viel Unterstützung ein Nutzer benötigt.



10. Abschlussbildschirm

Nach Abschluss aller Schritte:

Große Erfolgsansicht:

Training abgeschlossen

Darunter:

8 von 8 Schritten abgeschlossen

benötigte Zeit

verwendete Hinweise

Anzahl Fehlversuche

Beispiel:

Training abgeschlossen

Dauer: 12 Minuten
Hinweise verwendet: 3
Fehlversuche: 2

Darunter Buttons:

Training erneut starten

Nächstes Modul

Zur Übersicht



11. Dashboard

Erstelle zusätzlich eine einfache Startseite.

Titel:

Meine Trainings

Zeige Karten.

Training 1

Git, VS Code & GitHub Copilot – Grundlagen

Status:

38 % abgeschlossen

Button:

Fortsetzen

Training 2

CLI-Agenten kennenlernen

Status:

Noch nicht gestartet

Button:

Starten

Training 2 muss noch nicht funktional sein.

Training 3

M365 Copilot Grundlagen

Status:

Noch nicht gestartet

Button:

Starten

Auch dieses Training dient nur als Vorschau.



12. UX-Anforderungen

Die Anwendung soll professionell und Enterprise-tauglich wirken.

Keine verspielte Gamification.

Kein Kinder-Lernplattform-Stil.

Orientierung eher an:

GitHub

VS Code

Microsoft Learn

modernen SaaS-Dashboards

Wichtig sind:

klare Informationshierarchie

ruhige Oberfläche

gut erkennbare nächste Aktion

möglichst wenig Überforderung

deutlich sichtbarer Trainingsfortschritt

Der Nutzer soll jederzeit verstehen:

Wo bin ich?

Was soll ich tun?

Warum soll ich es tun?

War meine Aktion erfolgreich?

Was kommt als Nächstes?



13. Technische Anforderungen für den POC

Frontend:

React

TypeScript

Tailwind CSS

Komponenten sauber modularisieren.

Empfohlene Struktur:

src/
components/
workspace/
training/
tutor/
overlay/
scenarios/
state/
types/

Erstelle Scenario-Daten nicht hart verteilt über verschiedene Komponenten.

Verwende eine zentrale Scenario Definition.

Beispielsweise:

src/scenarios/git-basics.ts

Ein Szenario besteht aus:

id

title

description

steps

Ein Step besitzt beispielsweise:

id

title

instruction

helpLevels

expectedEvent

validation

highlightTarget



14. Wichtiges Architekturprinzip

Trenne klar zwischen:

Training Logic

und

Workspace UI.

Die Trainingslogik soll nicht direkt von konkreten React-Komponenten abhängig sein.

Verwende ein einfaches Event-System.

Beispiel:

Workspace:

emit(“file.created”, {
filename: “hello.py”
})

Training Engine:

prüft anhand der Scenario Definition, ob das Event den aktuellen Schritt erfüllt.

Dadurch soll später die simulierte Umgebung durch echte Runtime Adapter ersetzt werden können.

Langfristig sollen daraus beispielsweise entstehen:

VSCodeRuntimeAdapter

TerminalRuntimeAdapter

M365RuntimeAdapter

Der POC muss diese Adapter noch nicht vollständig implementieren, aber die Architektur soll diese spätere Erweiterung ermöglichen.



15. Was ausdrücklich NICHT Bestandteil dieses POC ist

Noch nicht implementieren:

Kubernetes

Docker

echte Nutzer-Pods

echte Persistent Volumes

Enterprise SSO

echte GitHub API

echtes Git Repository

echte GitHub-Copilot-Anbindung

echte Microsoft-365-Anbindung

echtes RAG

echte Unternehmensrichtlinien

Multi-Tenant-Backend

Autoscaling

Diese Funktionen gehören zur späteren Produktionsarchitektur.

Im POC sollen sie dort, wo nötig, simuliert werden.



16. Wichtigstes Ziel des POC

Nach Fertigstellung möchte ich beurteilen können:

Ist der Trainingsablauf intuitiv?

Funktioniert die Kombination aus Workspace und Guide Panel?

Sind visuelle Highlights hilfreich oder störend?

Wie viel Platz benötigt der KI-Tutor?

Sollte der Tutor permanent sichtbar sein?

Wie fühlt sich eine automatische Schrittvalidierung an?

Versteht ein unerfahrener Nutzer jederzeit, was er tun soll?

Wie sollte das Verhältnis zwischen Anleitung und eigenständigem Ausprobieren aussehen?

Optimiere den POC deshalb primär auf eine überzeugende, interaktive User Experience und nicht auf Produktionsinfrastruktur.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2cc4e2cc-7470-465c-8fe0-494bb1e42051).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
