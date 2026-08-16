import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const guidedNavigationUrl = new URL(
  "../../apps/web/src/components/training/GuidedStepNavigation.tsx",
  import.meta.url,
);
const tutorAttentionUrl = new URL(
  "../../apps/web/src/components/overlay/tutorAttention.ts",
  import.meta.url,
);
const tutorAttentionOverlayUrl = new URL(
  "../../apps/web/src/components/overlay/TutorAttentionOverlay.tsx",
  import.meta.url,
);
const guidedHighlightUrl = new URL(
  "../../apps/web/src/components/overlay/HighlightOverlay.tsx",
  import.meta.url,
);
const tutorContextUrl = new URL("../../apps/web/src/tutor/tutorContext.ts", import.meta.url);
const tutorChatUrl = new URL("../../apps/web/src/components/tutor/TutorChat.tsx", import.meta.url);
const trainingStoreUrl = new URL("../../apps/web/src/state/trainingStore.tsx", import.meta.url);
const runtimeIndexUrl = new URL("../../apps/web/src/runtime/index.ts", import.meta.url);
const guidePanelUrl = new URL(
  "../../apps/web/src/components/training/GuidePanel.tsx",
  import.meta.url,
);

test("Tutor meta navigation delegates exclusively to #231 Guided navigation semantics", async () => {
  const [guidedNavigation, tutorContext, trainingStore] = await Promise.all([
    readFile(guidedNavigationUrl, "utf8"),
    readFile(tutorContextUrl, "utf8"),
    readFile(trainingStoreUrl, "utf8"),
  ]);

  assert.match(guidedNavigation, /navigateToGuidedStep/);
  assert.doesNotMatch(guidedNavigation, /\buseState\s*\(/);
  assert.match(trainingStore, /const visibleProgress = guidedReplayStepId/);
  assert.match(trainingStore, /progress:\s*visibleProgress/);
  assert.match(tutorContext, /displayed\/replayed step/);
  assert.match(tutorContext, /step\.id === progress\.activeStepId/);
  assert.match(tutorContext, /currentStep:\s*displayedStep/);
});

test("Tutor attention stays semantic and adapter-neutral", async () => {
  const [guidedNavigation, tutorAttention, attentionOverlay, runtimeIndex] = await Promise.all([
    readFile(guidedNavigationUrl, "utf8"),
    readFile(tutorAttentionUrl, "utf8"),
    readFile(tutorAttentionOverlayUrl, "utf8"),
    readFile(runtimeIndexUrl, "utf8"),
  ]);

  assert.match(tutorAttention, /UiTargetRef/);
  assert.match(guidedNavigation, /displayedStep\.highlightTarget/);
  assert.match(attentionOverlay, /getRuntimeAdapterForTarget/);
  assert.match(attentionOverlay, /resolveTarget\(resolver\.targetId\)/);
  assert.match(
    runtimeIndex,
    /definition\?\.surface\.some\(\(entry\) => entry\.ref === targetRef\)/,
  );

  for (const source of [tutorAttention, attentionOverlay]) {
    assert.doesNotMatch(source, /querySelector|closest\s*\(/);
    assert.doesNotMatch(source, /\b(?:vscode|claude)\./);
  }
});

test("Tutor attention and Guided highlight remain visually distinct and motion-safe", async () => {
  const [guidedNavigation, attentionOverlay, guidedHighlight, tutorChat, guidePanel] =
    await Promise.all([
      readFile(guidedNavigationUrl, "utf8"),
      readFile(tutorAttentionOverlayUrl, "utf8"),
      readFile(guidedHighlightUrl, "utf8"),
      readFile(tutorChatUrl, "utf8"),
      readFile(guidePanelUrl, "utf8"),
    ]);

  assert.match(guidedNavigation, /Tutor-Ebene · Lernplattform/);
  assert.match(attentionOverlay, /data-attention-kind="tutor"/);
  assert.match(attentionOverlay, /className="platform-ui/);
  assert.match(attentionOverlay, /border-dashed border-accent/);
  assert.match(attentionOverlay, /motion-reduce:animate-none/);

  assert.match(guidedHighlight, /data-highlight-kind="guided"/);
  assert.match(guidedHighlight, /bg-black\/35/);
  assert.match(guidedHighlight, /motion-reduce:animate-none/);
  assert.match(tutorChat, /prefers-reduced-motion:\s*reduce/);
  assert.match(tutorChat, /className="platform-ui/);
  assert.match(tutorChat, /bg-input/);
  assert.doesNotMatch(tutorChat, /bg-editor/);

  assert.match(guidePanel, /<TutorChat\s*\/>/);
  assert.doesNotMatch(tutorChat, /\b(?:collapsed|isOpen|openTutor)\b/);
});
