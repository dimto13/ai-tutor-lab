import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { tutorDataCategory } from "../src/data-transparency/tutorDataCategory.ts";

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

test("tutor data transparency is wired into the rendered data category contract", () => {
  const transparencySource = readFileSync(
    new URL("../src/data-transparency/userDataTransparency.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    transparencySource,
    /import \{ tutorDataCategory \} from "\.\/tutorDataCategory";/,
  );
  assert.equal(transparencySource.match(/^\s*tutorDataCategory,\s*$/gm)?.length, 1);
});
