import assert from "node:assert/strict";
import test from "node:test";
import { validateHelpEscalation } from "../../apps/web/src/scenarios/helpEscalation.ts";
import type { TrainingStep } from "../../apps/web/src/types/training.ts";

function step(
  helpLevels: [string, string, string],
  stepType: TrainingStep["stepType"] = "action",
): Pick<TrainingStep, "stepType" | "helpLevels"> {
  return { stepType, helpLevels };
}

test("action steps reject empty help levels", () => {
  const violations = validateHelpEscalation(step(["Orientierung", "", "Klicke auf Speichern."]));
  assert.ok(violations.some((violation) => violation.code === "empty-action-help"));
});

test("explanation steps may keep empty help levels", () => {
  assert.deepEqual(validateHelpEscalation(step(["", "", ""], "explanation")), []);
});

test("level three must not be shorter than level two", () => {
  const violations = validateHelpEscalation(
    step([
      "Suche den Bereich oben.",
      "Öffne das File-Menü und wähle Open Folder.",
      "Klicke auf File.",
    ]),
  );
  assert.ok(violations.some((violation) => violation.code === "level-three-shorter"));
});

test("level three must add information instead of duplicating level two", () => {
  const violations = validateHelpEscalation(
    step(["Suche den Bereich oben.", "Klicke auf File.", "Klicke auf File."]),
  );
  assert.ok(violations.some((violation) => violation.code === "level-three-duplicate"));
});

test("level three requires an executable action", () => {
  const violations = validateHelpEscalation(
    step([
      "Suche den Prüfschritt unten rechts.",
      "Klicke auf Ergebnis geprüft.",
      "Die Prüfaktion befindet sich unten rechts neben der Vorschau und ist gut sichtbar.",
    ]),
  );
  assert.ok(violations.some((violation) => violation.code === "level-three-no-action"));
});

test("action detection does not mistake nouns for imperative instructions", () => {
  const violations = validateHelpEscalation(
    step([
      "Suche den Prüfschritt unten rechts.",
      "Klicke auf Ergebnis geprüft.",
      "Die Prüfaktion wird deutlich hervorgehoben und mit einem Rahmen markiert.",
    ]),
  );
  assert.ok(violations.some((violation) => violation.code === "level-three-no-action"));
  assert.ok(violations.some((violation) => violation.code === "level-three-highlight-only"));
});

test("level three rejects highlight-only wording", () => {
  const violations = validateHelpEscalation(
    step([
      "Suche den Explorer links.",
      "Klicke auf das oberste Datei-Symbol.",
      "Das Explorer-Symbol wird jetzt deutlich hervorgehoben.",
    ]),
  );
  assert.ok(violations.some((violation) => violation.code === "level-three-highlight-only"));
});

test("Unicode action words such as Öffne are recognized", () => {
  assert.deepEqual(
    validateHelpEscalation(
      step([
        "Beginne mit dem Überblick.",
        "Wechsle anschließend zwischen den Hauptbereichen.",
        "Öffne nacheinander Überblick, Code, Commits, Pull Requests und Issues und prüfe jeden Bereich.",
      ]),
    ),
    [],
  );
});

test("level three accepts highlight plus exact action", () => {
  assert.deepEqual(
    validateHelpEscalation(
      step([
        "Suche den Explorer links.",
        "Klicke auf das oberste Datei-Symbol.",
        "Das Explorer-Symbol wird hervorgehoben. Klicke genau auf dieses Symbol.",
      ]),
    ),
    [],
  );
});
