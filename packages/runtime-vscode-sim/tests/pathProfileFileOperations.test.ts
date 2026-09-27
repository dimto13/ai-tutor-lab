import assert from "node:assert/strict";
import test from "node:test";
import type { TrainingEvent } from "@ai-train-lab/training-engine";
import { vscodeRuntime } from "../src/index.ts";

function createContainer(): HTMLElement {
  return {
    querySelector: () => null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    focus: () => undefined,
  } as unknown as HTMLElement;
}

const seed = {
  workspaceMode: "folder",
  folders: ["demo"],
  files: ["notiz.txt", "README.md"],
  contents: { "notiz.txt": "erste Fassung", "README.md": "# demo" },
  trackedFiles: ["notiz.txt", "README.md"],
  committedContents: { "notiz.txt": "erste Fassung", "README.md": "# demo" },
} as const;

async function mountWith(comparison: "case-sensitive" | "case-insensitive") {
  await vscodeRuntime.unmount();
  vscodeRuntime.applyEnvironment({ pathComparison: comparison });
  await vscodeRuntime.mount(createContainer(), { ...seed });
}

test("case-insensitive profile treats an equivalent spelling as the same file", async () => {
  await mountWith("case-insensitive");

  vscodeRuntime.addFile("NOTIZ.TXT");
  assert.deepEqual(
    await vscodeRuntime.query<string[]>("filesystem.files"),
    ["notiz.txt", "README.md"],
    "an equivalent spelling must not create a second file",
  );

  vscodeRuntime.setActiveFile("NOTIZ.TXT");
  assert.equal(
    await vscodeRuntime.query<string | null>("editor.activeFile"),
    "notiz.txt",
    "the canonical name becomes active, not the typed spelling",
  );

  await vscodeRuntime.unmount();
});

test("case-sensitive profile keeps an equivalent spelling a different file", async () => {
  await mountWith("case-sensitive");

  vscodeRuntime.addFile("NOTIZ.TXT");
  assert.deepEqual(await vscodeRuntime.query<string[]>("filesystem.files"), [
    "notiz.txt",
    "README.md",
    "NOTIZ.TXT",
  ]);

  await vscodeRuntime.unmount();
});

test("saving through an equivalent spelling clears the dirty entry", async () => {
  await mountWith("case-insensitive");
  const events: TrainingEvent[] = [];
  const unsubscribe = vscodeRuntime.subscribe((event) => events.push(event));

  vscodeRuntime.setFileContent("notiz.txt", "zweite Fassung");
  assert.deepEqual(await vscodeRuntime.query<string[]>("editor.dirtyFiles"), ["notiz.txt"]);

  // Saving under a different spelling must remove the very same dirty entry.
  vscodeRuntime.saveFile("NOTIZ.TXT");
  assert.deepEqual(
    await vscodeRuntime.query<string[]>("editor.dirtyFiles"),
    [],
    "the dirty entry must be removed under path semantics, not by exact string",
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === "file.saved" &&
        (event.payload as Record<string, unknown>)["filename"] === "notiz.txt",
    ),
    "file.saved reports the canonical name",
  );

  unsubscribe();
  await vscodeRuntime.unmount();
});

test("restoring committed content through an equivalent spelling clears the SCM change", async () => {
  await mountWith("case-insensitive");

  vscodeRuntime.setFileContent("NOTIZ.TXT", "abweichend");
  assert.deepEqual(await vscodeRuntime.query<string[]>("scm.changedFiles"), ["notiz.txt"]);

  // Back to the committed content: the file is unchanged again, and the staged
  // lookup must use the canonical name instead of reading undefined.
  vscodeRuntime.setFileContent("NOTIZ.TXT", "erste Fassung");
  assert.deepEqual(
    await vscodeRuntime.query<string[]>("scm.changedFiles"),
    [],
    "committed content must be recognized through an equivalent spelling",
  );

  await vscodeRuntime.unmount();
});

test("unmount restores the strict default so the next scenario cannot inherit a profile", async () => {
  await mountWith("case-insensitive");
  assert.equal(vscodeRuntime.resolveEnvironment().pathComparison, "case-insensitive");

  await vscodeRuntime.unmount();
  assert.equal(vscodeRuntime.resolveEnvironment().pathComparison, "case-sensitive");

  // A scenario that declares nothing now gets the strict default.
  await vscodeRuntime.mount(createContainer(), { ...seed });
  vscodeRuntime.addFile("NOTIZ.TXT");
  assert.ok(
    (await vscodeRuntime.query<string[]>("filesystem.files")).includes("NOTIZ.TXT"),
    "no profile leaked from the previous scenario",
  );

  await vscodeRuntime.unmount();
});
