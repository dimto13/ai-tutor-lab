import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessPromptQuality } from "../src/runtime/m365PromptAssessment.ts";
import { createM365CopilotRuntime } from "../src/runtime/m365CopilotRuntime.ts";

async function workState() {
  const runtime = createM365CopilotRuntime();
  runtime.setContextSource("meeting-notes", true);
  return runtime.snapshot();
}

describe("M365 prompt assessment", () => {
  it("counts the audience preposition only as a whole word (#601)", async () => {
    const state = await workState();
    for (const prompt of [
      // "fur" sits inside these after the umlaut is folded: dafur, hierfur, fursorge.
      "Fasse die Unterlagen zusammen, ich brauche dafür eine kurze Liste.",
      "Erstelle hierfür eine sachliche Liste.",
      "Beschreibe die Fürsorgepflicht kurz in Stichpunkten.",
    ]) {
      assert.equal(assessPromptQuality(prompt, state).audience, false, prompt);
    }
    for (const prompt of [
      "Fasse die Unterlagen für das Team kurz als Liste zusammen.",
      "Fasse die Unterlagen fürs Management sachlich als Liste zusammen.",
      "Zielgruppe für: Vorstand. Fasse die Unterlagen kurz als Liste zusammen.",
      "Fasse die Unterlagen fuer die Leitung kurz als Liste zusammen.",
    ]) {
      assert.equal(assessPromptQuality(prompt, state).audience, true, prompt);
    }
  });

  it("accepts a complete everyday prompt", async () => {
    const quality = assessPromptQuality(
      "Fasse die angehängten Projektunterlagen für das Team sachlich als kurze Liste zusammen.",
      await workState(),
    );
    assert.deepEqual(quality, {
      goal: true,
      context: true,
      audience: true,
      tone: true,
      outputFormat: true,
    });
  });
});
