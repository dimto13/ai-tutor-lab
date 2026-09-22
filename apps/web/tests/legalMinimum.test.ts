import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const privacy = fs.readFileSync(
  new URL("../src/routes/datenschutz.tsx", import.meta.url),
  "utf8",
);
const imprint = fs.readFileSync(
  new URL("../src/routes/impressum.tsx", import.meta.url),
  "utf8",
);

test("imprint exposes the owner-approved provider and contact", () => {
  assert.match(imprint, /Tobias Freudling/);
  assert.match(imprint, /Einzelunternehmen/);
  assert.match(imprint, /Leopoldstraße 143/);
  assert.match(imprint, /80804 München/);
  assert.match(imprint, /dimto@online\.de/);
});

test("privacy notice locks the closed-beta processing contract", () => {
  assert.match(privacy, /Art\. 6 Abs\. 1 lit\. b DSGVO/);
  assert.match(privacy, /Art\. 6 Abs\. 1 lit\. f DSGVO/);
  assert.match(privacy, /us-east-1/);
  assert.match(privacy, /EU-Standardvertragsklauseln/);
  assert.match(privacy, /ausschließlich über lokale Modelle/);
  assert.match(privacy, /keinen externen Cloud-KI-Empfänger/);
  assert.match(privacy, /CloudWatch-\/Tutor-Logs: 30 Tage/);
  assert.match(privacy, /Login-IP-Adresse und User-Agent/);
  assert.match(privacy, /BayLDA/);
});

test("privacy notice preserves beta caution and re-review path", () => {
  assert.match(
    privacy,
    /keine vertraulichen Daten oder personenbezogenen Daten Dritter/,
  );
  assert.match(
    privacy,
    /Materielle Änderungen an Empfängern, AWS-Region, Tutor-\/Modellroute/,
  );
  assert.match(privacy, /vor einem öffentlichen oder kommerziellen Rollout/);
});
