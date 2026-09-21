import { describe, expect, it } from "vitest";
import { tutorDataCategory } from "../src/data-transparency/tutorDataCategory";
import { dataCategories } from "../src/data-transparency/userDataTransparency";

describe("tutor data transparency", () => {
  it("describes the beta tutor data flow without inventing retention evidence", () => {
    expect(tutorDataCategory.id).toBe("tutor");
    expect(tutorDataCategory.title).toBe("KI-Tutor");

    expect(tutorDataCategory.stored).toContain("Frage");
    expect(tutorDataCategory.stored).toContain("Szenario- und Schrittkontext");
    expect(tutorDataCategory.stored).toContain("Programmcode wird nicht");
    expect(tutorDataCategory.stored).toContain("Request-ID");
    expect(tutorDataCategory.stored).toContain("Route");
    expect(tutorDataCategory.stored).toContain("Status");
    expect(tutorDataCategory.stored).toContain("Frage- und Antworttexte werden nicht");

    expect(tutorDataCategory.storage).toContain("AWS-Infrastruktur in den USA");
    expect(tutorDataCategory.storage).toContain("eigener Hardware");
    expect(tutorDataCategory.storage).toContain("ausschließlich lokale Modelle");
    expect(tutorDataCategory.storage).toContain("externe Cloud-KI-Route ist nicht aktiviert");

    expect(tutorDataCategory.recipients).toContain("AWS-Dienste");
    expect(tutorDataCategory.recipients).toContain("eigene Tutor-Infrastruktur");
    expect(tutorDataCategory.recipients).toContain("kein externer Cloud-KI-Anbieter");

    expect(tutorDataCategory.retention).toContain("keine feste Aufbewahrungsfrist zugesagt");
    expect(tutorDataCategory.retention).not.toContain("30 Tage");
  });

  it("includes the tutor category in the rendered data category contract", () => {
    const categories = dataCategories({
      storageMode: "cloud",
      scoreVisibility: "private",
      leaderboardsEnabled: false,
      namedApprovalConfirmed: false,
      rawTelemetryRetentionDays: null,
      telemetryPseudonymizationMode: "SESSION",
    });

    expect(categories).toContainEqual(tutorDataCategory);
    expect(categories.filter((category) => category.id === "tutor")).toHaveLength(1);
  });
});
