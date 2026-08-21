# 25 — Adaptionsmodell: Selbsteinschätzung und nachgewiesene Kompetenz

## 25.1 Zweck und harte Grenze

Dieses Dokument definiert den fachlichen Vertrag aus #247 für die Kombination von
`UserPreferences.selfAssessedAiLevel` mit beobachtbarer Trainingsleistung. Es ergänzt das
Punkte-/Kompetenzmodell aus `05-gamification.md` und die serverautoritative Scoring-Grenze aus
`22-server-scoring.md`; es ersetzt beide nicht.

Die zentrale Trennung ist unverhandelbar:

- **Selbsteinschätzung** beschreibt, wie viel Führung und Erklärung ein Nutzer für sich erwartet.
- **Recommendation/Adaption** darf daraus Vorschläge, Erklärungstiefe und Einstiegsmöglichkeiten ableiten.
- **Scoring** entsteht ausschließlich aus serverseitig verifizierter, beobachtbarer Leistung.
- **SkillProfile und Attestations** entstehen ausschließlich aus den dafür definierten Leistungsnachweisen.
- **Gamification/Fortschritt** darf echte Leistung oder Verbesserung sichtbar machen, aber niemals eine Selbstdeklaration belohnen.

`advanced` erzeugt daher weder Punkte noch Kompetenz noch eine Attestation. Umgekehrt darf eine
schwache Session die gespeicherte Selbsteinschätzung nicht heimlich auf `beginner` ändern.

## 25.2 Signalquellen und Vertrauensrang

Für Adaption werden drei voneinander getrennte Signalgruppen verwendet:

| Signalgruppe | Beispiele | Autorität | Darf Punkte/Kompetenz erzeugen? |
| --- | --- | --- | --- |
| Selbsteinschätzung | `beginner`, `intermediate`, `advanced` | Nutzerpräferenz | **Nein** |
| Beobachtbare Leistung | Challenge bestanden, Hilfegrad, Fehlversuche, validierte Lernziele, serverseitig akzeptierte Score-/Attestation-Evidence | serverautoritative Trainings-/Scoring-Pfade | **Ja, ausschließlich nach bestehenden Scoring-/Skill-Regeln** |
| Fortschritts-/Adaptionssignale | abgeschlossene Module, Wiederholungen, frühere Hilfeintensität, empfohlene nächste Aktion | abgeleitet | **Nein, nur Darstellung/Recommendation** |

Priorität bei einem Widerspruch: Für **Nachweise** gewinnt immer die beobachtbare Leistung. Für
**Darstellung der Selbsteinschätzung** gewinnt immer der vom Nutzer gespeicherte Wert. Für
**Empfehlungen** werden beide Größen kombiniert, ohne eine der beiden umzuschreiben.

## 25.3 Welche Performance-Signale verwendet werden

### Primäre Signale

1. **Challenge-Erfolg** und erfüllte Lernziele. Das stärkste Signal für selbstständige Praxis.
2. **Validierter Endzustand** eines Szenarios. Bewertet Ergebnis statt Klickfolge.
3. **Hint-/Support-Nutzung** pro erfolgreichem Durchlauf. Relevant für die benötigte Unterstützung,
   aber nicht als Bestrafung.
4. **Wiederholte Challenge-Fehlschläge**. Erst mehrere konsistente Beobachtungen dürfen eine
   Empfehlung verändern; ein einzelner Fehler reicht nicht.
5. **Attempts über mehrere Durchläufe/Module**. Nur als Trend, nicht als isolierte Klassifizierung.

### Sekundäre Signale

- `suspect_fast` und Anti-Gaming-Marker werden wie im Scoringvertrag behandelt und dürfen keine
  Kompetenz hochstufen.
- Wiederholungen können Fortschritt zeigen, erzeugen aber keine erneute Punkteberechtigung derselben
  Szenario-Version.
- Dauer kann als Diagnosehinweis dienen, aber **nicht** als positives Kompetenzsignal. Unterschiedliche
  Arbeitsgeschwindigkeiten, Barrierefreiheit, Sprache oder Unterbrechungen machen Dauer allein unzuverlässig.

### Nicht verwendet

- Sitzungsdauer als Engagement-Ziel,
- Anzahl von Logins oder Klicks,
- Kommunikationsstil/Persönlichkeitsvermutungen,
- Provider-, Cloud- oder konkrete Scenario-IDs als generische Adaptionssemantik.

## 25.4 Entscheidungsmatrix

Die gemessene Performance wird für Recommendation bewusst grob in `insufficient`, `developing`
und `strong` zusammengefasst. Diese Begriffe sind **keine neuen SkillProfile-Stufen** und werden
nicht persistiert; sie sind nur ein fachlicher Entscheidungseingang.

| Selbsteinschätzung | Insufficient / noch keine belastbare Evidence | Developing / gemischte Evidence | Strong / wiederholt selbstständig |
| --- | --- | --- | --- |
| `beginner` | Explore/Guided priorisieren, hohe Erklärungstiefe und aktive Hilfen anbieten | Guided fortsetzen, Challenge optional anbieten, Hilfen leicht reduzieren | Challenge bzw. anspruchsvolleren nächsten Schritt anbieten; Selbsteinschätzung unverändert lassen |
| `intermediate` | Guided empfehlen, Kontext erhöhen; bei wiederholten Fehlschlägen Grundlagen anbieten | kompakter Guided-Pfad mit frühem Challenge-Angebot | Challenge/Stretch Goal priorisieren und Erklärungen komprimieren |
| `advanced` | Direkteinstieg bleibt erlaubt; nach wiederholt schwacher Evidence Guided/Grundlagen **empfehlen**, niemals erzwingen oder Level umschreiben | Challenge weiter anbieten, aber gezielte Unterstützung dort einblenden, wo Evidence Lücken zeigt | Challenge/Stretch Goal priorisieren, Grundlagen ausblenden aber jederzeit erreichbar halten |

### Verbindliche Abweichungsfälle

**`advanced` + schwache Leistung:** Nach mindestens zwei konsistenten negativen Beobachtungen
(z. B. zwei gescheiterte Challenge-Versuche oder wiederholt notwendige starke Hilfe) wird Guided
als sinnvoller nächster Schritt vorgeschlagen. Der Nutzer kann weiter Challenge wählen. Weder
`selfAssessedAiLevel` noch Punkte/SkillProfile werden durch die Empfehlung verändert.

**`beginner` + starke Leistung:** Nach wiederholt erfolgreicher, weitgehend selbstständiger
Leistung wird ein direkter Challenge-/Stretch-Schritt angeboten. Die Plattform darf zusätzlich
fragen, ob der Nutzer seine Selbsteinschätzung ändern möchte; gespeichert wird eine Änderung nur
nach ausdrücklicher Bestätigung. Starke Evidence darf unabhängig davon den normalen
serverautoritativen SkillProfile-Pfad speisen.

**Keine belastbare Evidence:** Die Selbsteinschätzung darf den Einstieg steuern, aber niemals als
Ersatz für gemessene Kompetenz dargestellt werden. UI-seitig ist dann „noch kein Nachweis“ korrekt.

## 25.5 Trennung der vier Verantwortlichkeiten

### Recommendation

Recommendation ist eine **nicht autoritative** Anwendungsschicht. Sie kombiniert Präferenz,
verfügbaren Fortschritt und beobachtete Leistung und liefert eine begründete nächste Aktion. Sie
kann Modi oder Intensität empfehlen, aber keine Punkte, Skill-Stufen oder Attestations schreiben.

### Gamification/Fortschrittsdarstellung

Gamification zeigt echte Verbesserung: erstmals Challenge bestanden, geringere Hilfeintensität,
persönliches Wochenziel, neuer nachgewiesener Kompetenzstand. Sie belohnt keine Auswahl von
`beginner|intermediate|advanced` und optimiert nicht auf Verweildauer oder Rückkehrfrequenz.

### Scoring

Scoring bleibt vollständig serverautoritativ. Grundlage sind ausschließlich verifizierte
Trainingsevidence und die Regeln aus #31/#32 bzw. `22-server-scoring.md`. Die Recommendation-
Schicht darf keinen ScoreAward erzeugen, modifizieren oder simulieren.

### SkillProfile / Attestation

SkillProfile-Stufen und Attestations bleiben leistungsbasiert. Die Schwellen und Challenge-
Voraussetzungen aus #33/#34 gelten unverändert. `selfAssessedAiLevel` wird weder in Score-Summen
noch in Attestation-Evidence übernommen.

## 25.6 Neutraler Adaptionsvertrag

Die Anwendung darf aus den oben beschriebenen Signalen eine provider- und cloud-neutrale
Recommendation ableiten. Der Vertrag enthält keine Scenario-ID und keinen Produktnamen:

```ts
type AdaptationRecommendation = {
  explanationDepth: "detailed" | "balanced" | "concise";
  preferredTrainingMode: "explore" | "guided" | "challenge";
  challengeIntensity: "foundational" | "standard" | "stretch";
  supportIntensity: "proactive" | "available" | "minimal";
  recommendedNextAction:
    | "continue"
    | "practice-foundations"
    | "try-challenge"
    | "increase-difficulty"
    | "resume-training";
  stretchGoal: "none" | "reduce-support" | "try-harder-task";
  rationale: readonly string[];
};
```

Fachliche Eigenschaften des Vertrags:

- reine Empfehlung, keine Scoring-/Skill-Mutation;
- `rationale` enthält nachvollziehbare fachliche Gründe, keine internen IDs;
- konkrete Module/Scenario-IDs werden erst in Content-/Anwendungsschicht auf eine neutrale Aktion
  gemappt;
- keine AWS-, Cognito-, AppSync-, LLM-Provider- oder Modellfelder;
- die Training Engine muss keine Produkt- oder Cloudkenntnis erhalten.

## 25.7 UX-Transparenz

Selbsteinschätzung und Nachweis werden sichtbar getrennt beschriftet, beispielsweise:

- **Deine Einschätzung:** Erfahren
- **Nachgewiesene Praxis:** VS Code — Practitioner

Wenn noch keine belastbare Evidence existiert:

- **Deine Einschätzung:** Erfahren
- **Nachgewiesene Praxis:** Noch kein Kompetenznachweis

Empfehlungen erklären den Grund sachlich, etwa „Du hast zwei Challenges noch nicht abgeschlossen;
Guided kann die offenen Grundlagen gezielt auffrischen.“ Die UI darf nicht behaupten „Du bist doch
Anfänger“ und darf die Präferenz nicht automatisch ändern.

Bei `beginner` + starker Evidence kann eine freiwillige Änderung angeboten werden: „Deine
nachgewiesene Praxis liegt inzwischen über deinem gewählten Einstiegsniveau. Möchtest du deine
Einschätzung anpassen?“ Die Antwort `Nein` hat keinerlei negative Auswirkung.

## 25.8 Stabilität und Hysterese

Adaption soll nicht nach jeder Einzelaktion springen. Deshalb gelten folgende Regeln:

1. Eine einzelne gute oder schlechte Session ändert keine langfristige Empfehlungsklasse.
2. Für eine deutliche Abweichung werden mindestens zwei konsistente Beobachtungen verlangt.
3. Autoritative SkillProfile-/Attestation-Änderungen dürfen sofort berücksichtigt werden, weil sie
   bereits einen eigenen serverseitigen Evidenzvertrag erfüllt haben.
4. Die Recommendation darf temporär konservativer werden, ohne die gespeicherte Selbsteinschätzung
   zu ändern.
5. Ein Nutzer kann die Selbsteinschätzung jederzeit selbst ändern; das setzt die gemessene Evidence
   nicht zurück.

## 25.9 Zuordnung der Folgearbeit

Es ist für diesen Spike kein neues Sammel-Issue nötig; die vorhandenen Tickets decken die
Implementierungsschichten bereits ab:

| Folgearbeit | Issue | Vertrag aus diesem Dokument |
| --- | --- | --- |
| Guided überspringen / Rückführung nach Fehlschlägen | #22 | Recommendation, niemals Zwang; zwei Fehlschläge als Schwelle |
| Serverautoritatives Scoring | #31/#32 | Selbsteinschätzung bleibt vollständig außerhalb der Award-Logik |
| SkillProfile | #33 | ausschließlich leistungsbasierte Stufen, keine Selbstdeklaration |
| Attestations | #34 | ausschließlich validierte Challenge-/Lernziel-Evidence |
| Dashboard: genau eine nächste Aktion | #37 | Recommendation kombiniert Präferenz + Evidence, ohne Score-Mutation |
| Kompakter Direkteinstieg | #304 | deterministische Erstkalibrierung; Leveländerung nur nach Nutzerbestätigung |
| Lernkontinuität | #35 | Fortschritt ohne Streak-/Verlustmechanik; keine Belohnung für Selbstdeklaration |
| Adaptive Tutor-Kommunikation | #101 | darf Erklärungstiefe nutzen, aber kein psychologisches Profil aus #247 ableiten |
| Sichtbare Level-Präferenz | #307 | klar als Selbsteinschätzung kennzeichnen, nicht als SkillProfile |

#36 kann Abschluss-/Fortschrittsdarstellung mit den gleichen Trennungsregeln verwenden; #37 bleibt
SSOT für die eine priorisierte nächste Dashboard-Aktion. Konkrete Scenario-Auswahl gehört in diese
Anwendungs-/Content-Folgearbeiten und nicht in den generischen Vertrag.

## 25.10 Akzeptanzentscheidungen für #247

- Entscheidungsmatrix `selfAssessedAiLevel × Performance`: definiert in 25.4.
- `advanced + schwache Leistung` und `beginner + starke Leistung`: ausdrücklich entschieden.
- Scoring/Punkte: vollständig unabhängig von Selbsteinschätzung.
- Kompetenz/Attestation: ausschließlich beobachtbare, serverautoritativ akzeptierte Evidence.
- Gamification: belohnt nachgewiesenen Fortschritt, keine Selbstdeklaration.
- UX: Selbsteinschätzung und nachgewiesene Praxis werden getrennt dargestellt.
- Adaptionsvertrag: neutral, ohne Provider-/Cloud-/Scenario-ID-Kopplung.
- Scenario-Auswahl: verbleibt außerhalb der Training Engine.
- Folgearbeit: vorhandenen Issues eindeutig zugeordnet; kein paralleles Ersatzsystem vorgesehen.
