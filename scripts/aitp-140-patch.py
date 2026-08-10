from pathlib import Path
import json


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected patch anchor missing in {path}: {old[:80]!r}")
    p.write_text(text.replace(old, new, 1))


runtime = "apps/web/src/runtime/copilotRuntime.ts"
replace(
    runtime,
    '  setContextActiveFile(filename: string | null): void;\n  setMode(mode: CopilotChatModeId): void;',
    '  setContextActiveFile(filename: string | null): void;\n  inspect(ref: UiTargetRef): void;\n  setMode(mode: CopilotChatModeId): void;',
)
replace(
    runtime,
    '  startConversation(): string;\n  submitPrompt(prompt: string, activeFileContent?: string | null): string;',
    '  startConversation(): string;\n  stopTask(): void;\n  submitPrompt(prompt: string, activeFileContent?: string | null): string;',
)
replace(
    runtime,
    '    describeSurface(): RuntimeSurfaceDescription[] {\n      return COPILOT_RUNTIME_DEFINITION.surface.map((entry) => ({ ...entry }));\n    },\n\n    resolveTarget(ref: UiTargetRef): DOMRect | null {',
    '    describeSurface(): RuntimeSurfaceDescription[] {\n      return COPILOT_RUNTIME_DEFINITION.surface.map((entry) => ({ ...entry }));\n    },\n\n    inspect(ref: UiTargetRef): void {\n      const item = getCopilotSurfaceTarget(ref);\n      if (!item) return;\n      emit("ui.element.inspected", {\n        ref,\n        label: item.label,\n        conceptKey: item.conceptKey,\n      });\n    },\n\n    resolveTarget(ref: UiTargetRef): DOMRect | null {',
)
replace(
    runtime,
    '    submitPrompt(rawPrompt: string, activeFileContent?: string | null): string {',
    '    stopTask(): void {\n      const assistantMessage: CopilotChatMessage = {\n        id: createIdentifier("copilot-message"),\n        role: "assistant",\n        content:\n          "Aufgabe gestoppt. Prüfe den aktuellen Arbeitsstand; bereits übernommene Änderungen werden nicht automatisch zurückgesetzt.",\n      };\n      replaceState(\n        { ...state, messages: [...state.messages, assistantMessage] },\n        "mutation",\n      );\n      emit("copilot.task.stopped", {\n        conversationId: state.conversationId,\n        activeFile: state.contextActiveFile,\n        mode: state.mode,\n      });\n    },\n\n    submitPrompt(rawPrompt: string, activeFileContent?: string | null): string {',
)
replace(
    runtime,
    '      const template = inlineSuggestionTemplates.find(\n        (entry) =>\n          entry.file === file &&\n          (entry.whenContentEquals === undefined || entry.whenContentEquals === currentContent),\n      );\n      if (!template) return null;\n      return adapter.offerInlineSuggestion(file, template.text);',
    '      const matchingTemplates = inlineSuggestionTemplates.filter(\n        (entry) =>\n          entry.file === file &&\n          (entry.whenContentEquals === undefined || entry.whenContentEquals === currentContent),\n      );\n      if (matchingTemplates.length === 0) return null;\n\n      const previousRejectedText =\n        state.inlineSuggestion?.status === "rejected" ? state.inlineSuggestion.text : null;\n      const template =\n        matchingTemplates.find((entry) => entry.text !== previousRejectedText) ?? matchingTemplates[0];\n      return template ? adapter.offerInlineSuggestion(file, template.text) : null;',
)
replace(
    runtime,
    '        case "copilot.conversation.messageCount":\n          value = state.messages.length;\n          break;\n        case "copilot.mode":',
    '        case "copilot.conversation.messageCount":\n          value = state.messages.length;\n          break;\n        case "copilot.prompt.last":\n          value =\n            [...state.messages].reverse().find((message) => message.role === "user")?.content ?? null;\n          break;\n        case "copilot.mode":',
)

replace(
    "packages/training-engine/src/types.ts",
    '  | "copilot.context.changed"\n  | "ai.suggestion.shown"',
    '  | "copilot.context.changed"\n  | "copilot.task.stopped"\n  | "ai.suggestion.shown"',
)
replace(
    "apps/web/src/scenarios/contentLoader.ts",
    '  "copilot.context.changed",\n  "ai.suggestion.shown",',
    '  "copilot.context.changed",\n  "copilot.task.stopped",\n  "ai.suggestion.shown",',
)

replace(
    "apps/web/src/state/trainingStore.tsx",
    '  if (validation.kind === "all") {\n    const results = await Promise.all(validation.of.map((item) => validateState(item, scenario)));\n    return results.every(Boolean);\n  }\n  if (validation.kind !== "state") return false;',
    '  if (validation.kind === "all") {\n    const results = await Promise.all(validation.of.map((item) => validateState(item, scenario)));\n    return results.every(Boolean);\n  }\n  if (validation.kind === "any") {\n    const results = await Promise.all(validation.of.map((item) => validateState(item, scenario)));\n    return results.some(Boolean);\n  }\n  if (validation.kind !== "state") return false;',
)

panel = "apps/web/src/components/workspace/CopilotPanel.tsx"
replace(panel, '  const { scenario } = useTraining();', '  const { mode, scenario } = useTraining();')
replace(
    panel,
    '  const profile = copilotRuntime.getProductProfile();\n\n  useEffect(() => {',
    '  const profile = copilotRuntime.getProductProfile();\n\n  const inspectTarget = (ref: string) => {\n    if (mode === "explore") copilotRuntime.inspect(ref);\n  };\n\n  useEffect(() => {',
)
replace(
    panel,
    '  const toggleChat = () => {\n    copilotRuntime.setChatOpen(!runtimeState.chatOpen);\n  };',
    '  const toggleChat = () => {\n    inspectTarget("copilot.chat.toggle");\n    copilotRuntime.setChatOpen(!runtimeState.chatOpen);\n  };',
)
replace(
    panel,
    '  const offerSuggestion = async () => {\n    if (!activeFile || !runtimeState.enabled) return;',
    '  const offerSuggestion = async () => {\n    inspectTarget("copilot.inline.generate");\n    if (!activeFile || !runtimeState.enabled) return;',
)
replace(
    panel,
    '  const acceptSuggestion = async () => {\n    const pendingSuggestion = runtimeState.inlineSuggestion;',
    '  const acceptSuggestion = async () => {\n    inspectTarget("copilot.inline.accept");\n    const pendingSuggestion = runtimeState.inlineSuggestion;',
)
replace(
    panel,
    '  const rejectSuggestion = () => {\n    suggestionSourceRef.current = null;',
    '  const rejectSuggestion = () => {\n    inspectTarget("copilot.inline.reject");\n    suggestionSourceRef.current = null;',
)
replace(
    panel,
    '        <div\n          data-highlight="copilot.chat"\n          className="absolute right-0 top-9 z-30 w-[calc(100vw-1.5rem)] max-w-[28rem] rounded-md border border-border bg-panel p-3 shadow-2xl"\n        >',
    '        <div\n          data-highlight="copilot.chat"\n          onPointerDown={() => inspectTarget("copilot.chat")}\n          className="absolute right-0 top-9 z-30 w-[calc(100vw-1.5rem)] max-w-[28rem] rounded-md border border-border bg-panel p-3 shadow-2xl"\n        >',
)
replace(
    panel,
    '              onClick={() => copilotRuntime.startConversation()}\n              className=',
    '              onClick={() => {\n                inspectTarget("copilot.chat.newConversation");\n                copilotRuntime.startConversation();\n              }}\n              className=',
)
replace(
    panel,
    '''            <button
              type="button"
              onClick={() => copilotRuntime.setChatOpen(false)}''',
    '''            <button
              type="button"
              data-highlight="copilot.chat.stopTask"
              onClick={() => {
                inspectTarget("copilot.chat.stopTask");
                copilotRuntime.stopTask();
              }}
              className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:border-ring hover:text-foreground"
              title="Eine Copilot-Aufgabe stoppen"
              aria-label="Copilot-Aufgabe stoppen"
            >
              Stoppen
            </button>
            <button
              type="button"
              onClick={() => copilotRuntime.setChatOpen(false)}''',
)
replace(
    panel,
    '                value={runtimeState.mode}\n                onChange={(event) =>\n                  copilotRuntime.setMode(event.target.value as CopilotRuntimeState["mode"])\n                }',
    '                value={runtimeState.mode}\n                onFocus={() => inspectTarget("copilot.chat.modeSelector")}\n                onChange={(event) => {\n                  inspectTarget("copilot.chat.modeSelector");\n                  copilotRuntime.setMode(event.target.value as CopilotRuntimeState["mode"]);\n                }}',
)
replace(
    panel,
    '                value={runtimeState.modelId}\n                onChange={(event) => copilotRuntime.setModel(event.target.value)}',
    '                value={runtimeState.modelId}\n                onFocus={() => inspectTarget("copilot.chat.modelSelector")}\n                onChange={(event) => {\n                  inspectTarget("copilot.chat.modelSelector");\n                  copilotRuntime.setModel(event.target.value);\n                }}',
)
replace(
    panel,
    '          <p className="mb-2 text-[10px] text-muted-foreground">\n            Kontext: {runtimeState.contextActiveFile ?? "keine aktive Datei"}\n          </p>',
    '''          <label className="mb-2 block text-[10px] text-muted-foreground">
            Kontext
            <select
              data-highlight="copilot.chat.contextSelector"
              value={runtimeState.contextActiveFile === activeFile && activeFile ? "active" : "none"}
              onFocus={() => inspectTarget("copilot.chat.contextSelector")}
              onChange={(event) => {
                inspectTarget("copilot.chat.contextSelector");
                copilotRuntime.setContextActiveFile(event.target.value === "active" ? activeFile : null);
              }}
              className="mt-1 w-full rounded border border-border bg-editor px-2 py-1.5 text-xs text-foreground outline-none focus:border-ring"
            >
              <option value="active" disabled={!activeFile}>
                {activeFile ? `Aktive Datei: ${activeFile}` : "Keine aktive Datei verfügbar"}
              </option>
              <option value="none">Keine Datei an Copilot übergeben</option>
            </select>
          </label>''',
)
replace(
    panel,
    '              value={prompt}\n              onChange={(event) => setPrompt(event.target.value)}',
    '              value={prompt}\n              onFocus={() => inspectTarget("copilot.chat.prompt")}\n              onChange={(event) => setPrompt(event.target.value)}',
)
replace(
    panel,
    '                data-highlight="copilot.inline.suggestion"\n                className="mt-2 rounded border border-border bg-editor p-2"',
    '                data-highlight="copilot.inline.suggestion"\n                onClick={() => inspectTarget("copilot.inline.suggestion")}\n                className="mt-2 rounded border border-border bg-editor p-2"',
)

index = "apps/web/src/scenarios/index.ts"
replace(
    index,
    'import copilotBasicsRaw from "../../../../content/scenarios/copilot-basics.guided.json";',
    'import copilotBasicsExploreRaw from "../../../../content/scenarios/copilot-basics.explore.json";\nimport copilotBasicsGuidedRaw from "../../../../content/scenarios/copilot-basics.guided.json";\nimport copilotBasicsChallengeRaw from "../../../../content/scenarios/copilot-basics.challenge.json";',
)
replace(
    index,
    'const copilotBasicsScenario = parseScenario(copilotBasicsRaw);',
    'const copilotBasicsExploreScenario = parseScenario(copilotBasicsExploreRaw);\nconst copilotBasicsGuidedScenario = parseScenario(copilotBasicsGuidedRaw);\nconst copilotBasicsChallengeScenario = parseScenario(copilotBasicsChallengeRaw);',
)
replace(
    index,
    '  [copilotBasicsScenario.id]: copilotBasicsScenario,',
    '  [copilotBasicsExploreScenario.id]: copilotBasicsExploreScenario,\n  [copilotBasicsGuidedScenario.id]: copilotBasicsGuidedScenario,\n  [copilotBasicsChallengeScenario.id]: copilotBasicsChallengeScenario,',
)

route = "apps/web/src/routes/index.tsx"
replace(
    route,
    '''  {
    id: "github-copilot-basics",
    scenarioId: "copilot-basics.guided",
    title: "GitHub Copilot – Grundlagen",
    description:
      "Chat, Inline-Vorschläge, Kontext und den sinnvollen Einsatz von Copilot unabhängig vom Gesamtworkflow kennenlernen.",
    steps: 14,
    icon: Bot,
    available: true,
    label: "AI Coding Assistant",
  },''',
    '''  {
    id: "github-copilot-basics",
    scenarioId: null,
    title: "GitHub Copilot – Grundlagen",
    description:
      "Chat, Inline-Vorschläge, Kontext, Arbeitsmodi, Modellauswahl und kontrollierte Übernahme von KI-Vorschlägen kennenlernen.",
    icon: Bot,
    available: true,
    label: "AI Coding Assistant · 3 Modi",
    modes: [
      {
        scenarioId: "copilot-basics.explore",
        label: "Explore",
        description: "Copilot-Funktionen frei untersuchen",
        icon: Search,
        multiplier: "×0,5",
      },
      {
        scenarioId: "copilot-basics.guided",
        label: "Guided",
        description: "Copilot kontrolliert Schritt für Schritt einsetzen",
        icon: RouteIcon,
        multiplier: "×1,0",
      },
      {
        scenarioId: "copilot-basics.challenge",
        label: "Challenge",
        description: "Sicheren Endzustand selbstständig herstellen",
        icon: Target,
        multiplier: "×2,0",
      },
    ],
  },''',
)

guided_path = Path("content/scenarios/copilot-basics.guided.json")
guided = json.loads(guided_path.read_text())
for objective in [
    "choose_copilot_interaction",
    "formulate_copilot_prompt",
    "control_copilot_context",
    "review_copilot_output",
    "recover_from_copilot_mistakes",
    "protect_copilot_context",
]:
    if objective not in guided["learningObjectives"]:
        guided["learningObjectives"].append(objective)
seed = guided["environment"]["seed"]
if "private-notes.txt" not in seed["files"]:
    seed["files"].append("private-notes.txt")
seed["contents"]["private-notes.txt"] = "SYNTHETIC_SECRET=DEMO-ONLY-DO-NOT-SEND\n"
seed["inlineSuggestions"] = [
    {
        "file": "calculator.py",
        "whenContentEquals": "def add(a, b):\n",
        "text": "    return a - b\n",
    },
    {
        "file": "calculator.py",
        "whenContentEquals": "def add(a, b):\n",
        "text": "    return a + b\n",
    },
]
seed["chatResponses"] = [
    {
        "file": "calculator.py",
        "promptContainsAny": ["korrig", "addition", "addier", "plus", "a + b"],
        "response": "Korrektur: Für die geforderte Addition muss die Funktion a + b zurückgeben. Prüfe den neuen Inline-Vorschlag vor der Übernahme.",
    }
]
steps = {step["id"]: step for step in guided["steps"]}
context = steps["use-file-context"]
context["description"] = (
    "calculator.py ist im Editor geöffnet. Nutze nur diese synthetische Datei als Kontext. "
    "private-notes.txt enthält bewusst einen synthetischen Geheimnis-Marker und bleibt außerhalb der Anfrage."
)
context["instruction"] = (
    "Frage Copilot in eigenen Worten, was die aktuell geöffnete Datei macht, und bitte um eine kurze, klar gegliederte Antwort."
)
context["why"] = (
    "Ein guter Prompt verbindet Ziel, relevanten Kontext, Randbedingungen und gewünschte Ausgabe. "
    "Gib nur Informationen frei, die für die Aufgabe erforderlich und zulässig sind."
)
modes = steps["understand-chat-modes"]
modes["instruction"] = (
    "Ordne die Modi so ein: Ask für Fragen und Erklärungen; Plan für einen strukturierten Lösungsweg vor Änderungen; "
    "Agent für mehrstufige Aufgaben mit Werkzeugnutzung. Eine laufende agentische Aufgabe kannst du stoppen; danach prüfst du, "
    "welche Änderungen bereits entstanden sind."
)
modes["why"] = (
    "Der passende Modus reduziert unnötige Autonomie. Stoppen beendet weitere Arbeit, setzt aber bereits übernommene Änderungen nicht automatisch zurück."
)
inline = steps["accept-inline-suggestion"]
inline["title"] = "Unpassenden Vorschlag erkennen und korrigieren"
inline["description"] = (
    "Der erste synthetische Inline-Vorschlag ist absichtlich fachlich falsch. Deine Aufgabe ist nicht, KI-Ausgaben blind zu übernehmen."
)
inline["instruction"] = (
    "Erzeuge einen Inline-Vorschlag für calculator.py. Prüfe die Rechenoperation und lehne den falschen ersten Vorschlag ab. "
    "Bitte Copilot im Chat um eine Korrektur auf Addition, erzeuge den Vorschlag erneut und nimm erst die fachlich richtige Variante an."
)
inline["why"] = (
    "Ablehnen verwirft einen ungeeigneten Vorschlag vor der Übernahme. Durch eine präzise Korrektur behältst du Ziel und Kontrolle, statt eine falsche Änderung weiterzuverwenden."
)
inline["helpLevels"] = [
    "Vergleiche den vorgeschlagenen Rechenoperator mit der Anforderung Addition.",
    "Erzeuge den Vorschlag, lehne die Subtraktion ab, formuliere im Chat eine Korrektur auf Addition und erzeuge erneut.",
    "Prüfe zuerst den Vorschlag bei Inline-Vorschlag. Klicke bei der falschen Subtraktion auf Ablehnen, bitte im Prompt-Feld um Addition, erzeuge erneut und nimm nur return a + b an.",
]
inline["highlightTooltip"] = "Prüfe den ersten Vorschlag fachlich; eine falsche Rechenoperation wird nicht übernommen."
inline["successMessage"] = "Falschen Vorschlag verworfen, Copilot korrigiert und nur die passende Addition übernommen."
guided_path.write_text(json.dumps(guided, ensure_ascii=False, indent=2) + "\n")

e2e = "apps/web/e2e/tests/copilot-basics.spec.ts"
replace(
    e2e,
    '''  await expect(page.getByText("Schritt 12 – Inline-Vorschlag prüfen und annehmen")).toBeVisible();

  const generateSuggestion = page.locator('[data-highlight="copilot.inline.generate"]');
  await expect(generateSuggestion).toBeVisible();
  await generateSuggestion.click();
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "return a + b",
  );
  await page.getByRole("button", { name: "Annehmen" }).click();
  await expect(page.locator("textarea")).toHaveValue("def add(a, b):\\n    return a + b\\n");''',
    '''  await expect(
    page.getByText("Schritt 12 – Unpassenden Vorschlag erkennen und korrigieren"),
  ).toBeVisible();

  const generateSuggestion = page.locator('[data-highlight="copilot.inline.generate"]');
  await expect(generateSuggestion).toBeVisible();
  await generateSuggestion.click();
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "return a - b",
  );
  await page.getByRole("button", { name: "Ablehnen" }).click();
  await prompt.fill("Korrigiere den Vorschlag bitte auf Addition mit a + b.");
  await prompt.press("Enter");
  await expect(page.getByText(/Für die geforderte Addition muss die Funktion a \\+ b zurückgeben/)).toBeVisible();
  await generateSuggestion.click();
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText(
    "return a + b",
  );
  await page.getByRole("button", { name: "Annehmen" }).click();
  await expect(page.locator("textarea")).toHaveValue("def add(a, b):\\n    return a + b\\n");''',
)

runtime_tests = Path("tests/runtime/copilotRuntime.contract.test.ts")
runtime_tests.write_text(runtime_tests.read_text() + '''

test("copilotRuntime: Explore inspection emits semantic inspection events", async () => {
  const runtime = createCopilotRuntime();
  const inspected: string[] = [];
  const unsubscribe = runtime.subscribe((event) => {
    if (event.type === "ui.element.inspected") {
      inspected.push((event.payload as Record<string, string>)["ref"] ?? "");
    }
  });
  await runtime.mount(createContainer());

  try {
    runtime.inspect("copilot.chat.modelSelector");
    assert.deepEqual(inspected, ["copilot.chat.modelSelector"]);
  } finally {
    unsubscribe();
    await runtime.unmount();
  }
});

test("copilotRuntime: rejected configured suggestion can advance to a corrected alternative", async () => {
  const runtime = createCopilotRuntime();
  await runtime.mount(createContainer(), {
    inlineSuggestions: [
      { file: "calculator.py", whenContentEquals: "def add(a, b):\\n", text: "    return a - b\\n" },
      { file: "calculator.py", whenContentEquals: "def add(a, b):\\n", text: "    return a + b\\n" },
    ],
  });

  try {
    const first = runtime.offerConfiguredInlineSuggestion("calculator.py", "def add(a, b):\\n");
    assert.equal(first?.text, "    return a - b\\n");
    runtime.rejectInlineSuggestion();
    const second = runtime.offerConfiguredInlineSuggestion("calculator.py", "def add(a, b):\\n");
    assert.equal(second?.text, "    return a + b\\n");
  } finally {
    await runtime.unmount();
  }
});

test("copilotRuntime: exposes the last prompt and a stoppable task control", async () => {
  const runtime = createCopilotRuntime();
  const events: string[] = [];
  const unsubscribe = runtime.subscribe((event) => events.push(event.type));
  await runtime.mount(createContainer());

  try {
    runtime.submitPrompt("Addiere a und b.");
    assert.equal(await runtime.query("copilot.prompt.last"), "Addiere a und b.");
    runtime.stopTask();
    assert.ok(events.includes("copilot.task.stopped"));
  } finally {
    unsubscribe();
    await runtime.unmount();
  }
});
''')

Path("apps/web/e2e/tests/copilot-modes.spec.ts").write_text(r'''import { expect, test } from "@playwright/test";

test("Copilot-Kachel bietet Explore, Guided und Challenge", async ({ page }) => {
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "GitHub Copilot – Grundlagen" });
  await expect(heading).toBeVisible();
  const card = heading.locator("xpath=ancestor::article");
  await expect(card.getByText("AI Coding Assistant · 3 Modi")).toBeVisible();
  await expect(card.getByText("Explore", { exact: true })).toBeVisible();
  await expect(card.getByText("Guided", { exact: true })).toBeVisible();
  await expect(card.getByText("Challenge", { exact: true })).toBeVisible();
});

test("Copilot Explore macht Funktionen und Kontrollpunkte frei untersuchbar", async ({ page }) => {
  await page.goto("/training/copilot-basics.explore");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const chat = page.locator('[data-highlight="copilot.chat"]');
  await chat.click({ position: { x: 10, y: 10 } });
  await page.getByRole("button", { name: "Neue Copilot-Unterhaltung" }).click();
  await page.locator('[data-highlight="copilot.chat.contextSelector"]').selectOption("none");
  await page.locator('[data-highlight="copilot.chat.contextSelector"]').selectOption("active");
  await page.getByPlaceholder("Ask Copilot...").focus();
  await page.getByLabel("Modus").selectOption("plan");
  await page.getByLabel("Modell").selectOption("gpt-5.3-codex");
  await page.getByRole("button", { name: "Copilot-Aufgabe stoppen" }).click();
  const generate = page.locator('[data-highlight="copilot.inline.generate"]');
  await generate.click();
  const suggestion = page.locator('[data-highlight="copilot.inline.suggestion"]');
  await suggestion.click();
  await page.getByRole("button", { name: "Ablehnen" }).click();
  await generate.click();
  await page.getByRole("button", { name: "Annehmen" }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Copilot Challenge ist über geprüften Inline-Vorschlag lösbar", async ({ page }) => {
  await page.goto("/training/copilot-basics.challenge");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  await page.locator('[data-highlight="copilot.inline.generate"]').click();
  await expect(page.locator('[data-highlight="copilot.inline.suggestion"]')).toContainText("return a + b");
  await page.getByRole("button", { name: "Annehmen" }).click();
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Copilot Challenge ist alternativ über Chat plus eigene geprüfte Änderung lösbar", async ({ page }) => {
  await page.goto("/training/copilot-basics.challenge");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const prompt = page.getByPlaceholder("Ask Copilot...");
  await prompt.fill("Bitte addiere a und b; nutze nur calculator.py als Kontext.");
  await prompt.press("Enter");
  await page.locator("textarea").fill("def add(a, b):\n    return a + b\n");
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Copilot Challenge akzeptiert keinen Chat-Pfad mit synthetischem Geheimnis im Prompt", async ({ page }) => {
  await page.goto("/training/copilot-basics.challenge");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await page.getByRole("button", { name: "Copilot", exact: true }).click();
  const prompt = page.getByPlaceholder("Ask Copilot...");
  await prompt.fill("SYNTHETIC_SECRET=DEMO-ONLY-DO-NOT-SEND; addiere bitte a und b.");
  await prompt.press("Enter");
  await page.locator("textarea").fill("def add(a, b):\n    return a + b\n");
  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);
  await expect(page.getByText("Endzustand offen")).toBeVisible();
});
''')
