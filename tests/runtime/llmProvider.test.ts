import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadLlmProviderConfig } from "../../apps/web/src/tutor/llm/config.ts";
import { OllamaProvider } from "../../apps/web/src/tutor/llm/ollamaProvider.ts";
import { getVscodeSurfaceTarget } from "../../apps/web/src/runtime/vscodeDefinition.ts";

test("uses local Ollama defaults without cloud configuration", () => {
  const config = loadLlmProviderConfig({});
  assert.equal(config.provider, "ollama");
  assert.equal(config.baseUrl, "http://localhost:11434/v1");
  assert.equal(config.model, "gemma4:31b");
  assert.equal(config.apiKey, "ollama");
});

test("model and endpoint can be changed without code changes", () => {
  const config = loadLlmProviderConfig({
    LLM_PROVIDER: "ollama",
    LLM_BASE_URL: "http://127.0.0.1:11434/v1/",
    LLM_MODEL: "gemma4:e4b",
    LLM_API_KEY: "local-test",
  });

  assert.equal(config.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(config.model, "gemma4:e4b");
  assert.equal(config.apiKey, "local-test");
});

test("Ollama provider uses the OpenAI-compatible chat completions API", async () => {
  const captured: { url: string; body: Record<string, unknown> | null } = {
    url: "",
    body: null,
  };
  const mockFetch: typeof fetch = async (input, init) => {
    captured.url = String(input);
    captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        model: "gemma4:31b",
        choices: [{ message: { content: '{"uiTargetRef":"vscode.activityBar.explorer"}' } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const provider = new OllamaProvider(loadLlmProviderConfig({}), mockFetch);
  const response = await provider.complete({
    messages: [{ role: "user", content: "Nenne das Explorer-Ziel als JSON." }],
    structuredOutput: true,
  });

  assert.equal(captured.url, "http://localhost:11434/v1/chat/completions");
  assert.deepEqual(captured.body?.["response_format"], { type: "json_object" });

  const parsed = JSON.parse(response.text) as { uiTargetRef: string };
  assert.ok(getVscodeSurfaceTarget(parsed.uiTargetRef));
});

test("provider-specific configuration does not leak outside the provider layer", async () => {
  const sourceRoots = [path.resolve("apps/web/src"), path.resolve("packages")];
  const allowedRoot = path.resolve("apps/web/src/tutor/llm");
  const forbidden = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", "localhost:11434"];

  for (const sourceRoot of sourceRoots) {
    for (const file of await collectTypeScriptFiles(sourceRoot)) {
      if (file.startsWith(allowedRoot)) continue;
      const content = await readFile(file, "utf8");
      for (const token of forbidden) {
        assert.equal(
          content.includes(token),
          false,
          `${token} leaked into ${path.relative(process.cwd(), file)}`,
        );
      }
    }
  }
});

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectTypeScriptFiles(fullPath)));
    else if (/\.tsx?$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}
