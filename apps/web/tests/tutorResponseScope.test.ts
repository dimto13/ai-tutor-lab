import assert from "node:assert/strict";
import test from "node:test";
import { shouldApplyTutorResponse } from "../src/tutor/tutorResponseScope.ts";

const current = {
  version: 7,
  scope: "vscode-basics.guided:guided",
  displayedStepId: "create-file",
};

test("only the answer for the displayed learning step is applied", () => {
  assert.equal(shouldApplyTutorResponse(current, current), true);
  assert.equal(
    shouldApplyTutorResponse({ ...current, displayedStepId: "open-explorer" }, current),
    false,
    "Advancing within the SAME scenario must invalidate the old-step answer and its highlight",
  );
  assert.equal(
    shouldApplyTutorResponse({ ...current, displayedStepId: null }, current),
    false,
    "No-active-step Explore responses must not enter a newly active step",
  );
  assert.equal(
    shouldApplyTutorResponse(current, { ...current, displayedStepId: "save-file" }),
    false,
    "Replay/step navigation changes the request context even if conversation stays",
  );
});

test("new requests and module/mode switches invalidate delayed responses", () => {
  assert.equal(shouldApplyTutorResponse({ ...current, version: 6 }, current), false);
  assert.equal(
    shouldApplyTutorResponse({ ...current, scope: "vscode-basics.explore:explore" }, current),
    false,
  );
  assert.equal(
    shouldApplyTutorResponse({ ...current, scope: "github-pull-request.guided:guided" }, current),
    false,
  );
});
