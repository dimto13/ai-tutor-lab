import assert from "node:assert/strict";
import test from "node:test";
import { tutorDataCategory } from "../src/data-transparency/tutorDataCategory.ts";
import { dataCategories } from "../src/data-transparency/userDataTransparency.ts";

test("tutor data transparency describes the local-only beta tutor data flow and merged log retention", () => {
  assert.equal(tutorDataCategory.id, "tutor");
  assert.equal(tutorDataCategory.title, "KI-Tutor");

  assert.match(tutorDataCategory.stored, /Frage/);
  assert.match(tutorDataCategory.stored, /Szenario- und Schrittkontext/);
  assert.match(tutorDataCategory.stored, /Programmcode wird nicht/);
  assert.match(tutorDataCategory.stored, /Request-ID/);
  assert.match(tutorDataCategory.stored, /Route/);
  assert.match(tutorDataCategory.stored, /Status/);
  assert.match(tutorDataCategory.stored, /Frage- und Antworttexte werden nicht/);

  assert.match(tutorDataCategory.storage, /AWS-Infrastruktur in den USA/);
  assert.match(tutorDataCategory.storage, /eigener Hardware/);
  assert.match(tutorDataCategory.storage, /ausschließlich lokale Modelle/);
  assert.match(tutorDataCategory.storage, /externe Cloud-KI-Route ist nicht aktiviert/);

  assert.match(tutorDataCategory.recipients, /AWS-Dienste/);
  assert.match(tutorDataCategory.recipients, /eigene Tutor-Infrastruktur/);
  assert.match(tutorDataCategory.recipients, /kein externer Cloud-KI-Anbieter/);

  assert.match(tutorDataCategory.retention, /30 Tagen/);
  assert.match(tutorDataCategory.retention, /technischen Tutor- und Relay-Logs/);
});

test("tutor data transparency is included exactly once in the rendered data category contract", () => {
  const categories = dataCategories({
    storageMode: "cloud",
    scoreVisibility: "private",
    leaderboardsEnabled: false,
    namedApprovalConfirmed: false,
    rawTelemetryRetentionDays: null,
    telemetryPseudonymizationMode: "SESSION",
  });

  assert.ok(categories.some((category) => category === tutorDataCategory));
  assert.equal(categories.filter((category) => category.id === "tutor").length, 1);
});
