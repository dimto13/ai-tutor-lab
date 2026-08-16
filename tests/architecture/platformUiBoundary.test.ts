import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL("../../apps/web/src/styles.css", import.meta.url);
const trainingRouteUrl = new URL(
  "../../apps/web/src/routes/training.$scenarioId.tsx",
  import.meta.url,
);
const guidePanelUrl = new URL(
  "../../apps/web/src/components/training/GuidePanel.tsx",
  import.meta.url,
);
const tutorChatUrl = new URL(
  "../../apps/web/src/components/tutor/TutorChat.tsx",
  import.meta.url,
);
const completionScreenUrl = new URL(
  "../../apps/web/src/components/training/CompletionScreen.tsx",
  import.meta.url,
);
const feedbackCaptureUrl = new URL(
  "../../apps/web/src/components/feedback/FeedbackCapture.tsx",
  import.meta.url,
);
const accountMenuUrl = new URL("../../apps/web/src/auth/AccountMenu.tsx", import.meta.url);
const vscodeWorkspaceUrl = new URL(
  "../../apps/web/src/components/workspace/Workspace.tsx",
  import.meta.url,
);
const claudeWorkspaceUrl = new URL(
  "../../apps/web/src/components/workspace/ClaudeCodeWorkspace.tsx",
  import.meta.url,
);
const highlightOverlayUrl = new URL(
  "../../apps/web/src/components/overlay/HighlightOverlay.tsx",
  import.meta.url,
);

const platformTokens = [
  "background",
  "surface",
  "surface-raised",
  "foreground",
  "muted-foreground",
  "border",
  "input",
  "accent",
  "accent-foreground",
  "ring",
] as const;

const hardcodedNeutralColor = /(?:bg|text|border)-(?:white|black)(?:\/\d+)?/;

test("platform UI reuses the central CSS token system without leaking into runtimes", async () => {
  const [
    styles,
    trainingRoute,
    guidePanel,
    tutorChat,
    completionScreen,
    feedbackCapture,
    accountMenu,
    vscodeWorkspace,
    claudeWorkspace,
    highlightOverlay,
  ] = await Promise.all([
    readFile(stylesUrl, "utf8"),
    readFile(trainingRouteUrl, "utf8"),
    readFile(guidePanelUrl, "utf8"),
    readFile(tutorChatUrl, "utf8"),
    readFile(completionScreenUrl, "utf8"),
    readFile(feedbackCaptureUrl, "utf8"),
    readFile(accountMenuUrl, "utf8"),
    readFile(vscodeWorkspaceUrl, "utf8"),
    readFile(claudeWorkspaceUrl, "utf8"),
    readFile(highlightOverlayUrl, "utf8"),
  ]);

  for (const token of platformTokens) {
    assert.match(styles, new RegExp(`--platform-${token}:\\s*oklch\\(`));
    assert.match(styles, new RegExp(`--color-platform-${token}:\\s*var\\(--platform-${token}\\)`));
  }

  assert.match(styles, /\.platform-ui\s*\{[\s\S]*--accent:\s*var\(--platform-accent\)/);
  assert.match(styles, /\.platform-ui\s*\{[\s\S]*--panel:\s*var\(--platform-surface\)/);
  assert.match(styles, /\.platform-ui\s*\{[\s\S]*--card:\s*var\(--platform-surface-raised\)/);
  assert.match(styles, /\.platform-ui\s*\{[\s\S]*--border:\s*var\(--platform-border\)/);
  assert.match(styles, /\.platform-ui\s*\{[\s\S]*--ring:\s*var\(--platform-ring\)/);

  for (const surface of [
    "challenge-briefing",
    "meta-navigation",
    "mobile-challenge-status",
    "completion",
    "guide",
  ]) {
    assert.match(trainingRoute, new RegExp(`data-platform-ui=["']${surface}["']`));
  }

  for (const [name, source] of [
    ["training route", trainingRoute],
    ["guide panel", guidePanel],
    ["tutor chat", tutorChat],
    ["completion screen", completionScreen],
    ["feedback capture", feedbackCapture],
    ["account menu", accountMenu],
  ] as const) {
    assert.doesNotMatch(source, hardcodedNeutralColor, `${name} must use semantic color tokens`);
  }

  assert.doesNotMatch(vscodeWorkspace, /platform-(?:ui|accent|surface|border|ring)/);
  assert.doesNotMatch(claudeWorkspace, /platform-(?:ui|accent|surface|border|ring)/);
  assert.doesNotMatch(highlightOverlay, /platform-(?:ui|accent|surface|border|ring)/);
});
