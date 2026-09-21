import type { DataCategoryDescription } from "./userDataTransparency";

/**
 * Privacy description for the beta tutor path.
 *
 * Keep this independent from policy claims such as legal basis or transfer mechanism.
 * Those belong to #451 after their acceptance evidence exists.
 */
export const tutorDataCategory: DataCategoryDescription = {
  id: "tutor",
  title: "KI-Tutor",
  stored:
    "Bei einer Tutor-Frage werden deine Frage sowie der Szenario- und Schrittkontext verarbeitet. Programmcode wird nicht an den Tutor übermittelt. Frage- und Antworttexte werden nicht in den operativen Logs gespeichert; dort werden nur technische Angaben wie Request-ID, Route und Status protokolliert.",
  storage:
    "Für Relay und Befehlsübermittlung wird AWS-Infrastruktur in den USA verwendet. Die KI-Modelle laufen auf eigener Hardware des Anbieters. In der geschlossenen Beta werden ausschließlich lokale Modelle verwendet; eine externe Cloud-KI-Route ist nicht aktiviert.",
  recipients:
    "Empfänger sind die für Relay und Befehlsübermittlung eingesetzten AWS-Dienste sowie die eigene Tutor-Infrastruktur des Anbieters. In der geschlossenen Beta erhält kein externer Cloud-KI-Anbieter deine Tutor-Frage.",
  retention:
    "Frage- und Antworttexte werden nicht als operative Log-Inhalte gespeichert. Die technischen Tutor- und Relay-Logs sind auf eine Aufbewahrung von 30 Tagen konfiguriert.",
};
