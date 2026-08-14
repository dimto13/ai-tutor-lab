import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const compositionUrl = new URL(
  "../../apps/web/src/persistence/applicationTrainingStateRepository.ts",
  import.meta.url,
);
const storeUrl = new URL("../../apps/web/src/state/trainingStore.tsx", import.meta.url);
const localAdapterUrl = new URL(
  "../../apps/web/src/persistence/adapters/localStorageTrainingStateRepository.ts",
  import.meta.url,
);
const offlineAdapterUrl = new URL(
  "../../apps/web/src/persistence/adapters/localStorageOfflineTrainingStateStore.ts",
  import.meta.url,
);

test("training state composition keeps Amplify lazy and local mode cloud-free", async () => {
  const [compositionSource, storeSource, localAdapterSource, offlineAdapterSource] =
    await Promise.all([
      readFile(compositionUrl, "utf8"),
      readFile(storeUrl, "utf8"),
      readFile(localAdapterUrl, "utf8"),
      readFile(offlineAdapterUrl, "utf8"),
    ]);

  assert.match(compositionSource, /import\(["']\.\/adapters\/amplifyTrainingStateRepository["']\)/);
  assert.doesNotMatch(compositionSource, /from\s+["']aws-amplify\/data["']/);
  assert.match(compositionSource, /createBrowserTrainingStateRepository\(\)/);
  assert.match(compositionSource, /createBrowserOfflineTrainingStateStore\(\)/);
  assert.match(compositionSource, /new OfflineBufferedTrainingStateRepository\(/);
  assert.match(
    compositionSource,
    /import\.meta\.env\.PROD\s*\?\s*["']remote["']\s*:\s*["']local["']/,
  );

  assert.match(storeSource, /createApplicationTrainingStateRepository\(\)/);
  assert.match(storeSource, /synchronizeAfterReconnect\(/);
  assert.match(storeSource, /addEventListener\(["']online["']/);
  assert.doesNotMatch(storeSource, /createBrowserTrainingStateRepository/);
  assert.doesNotMatch(storeSource, /aws-amplify\/data/);
  assert.doesNotMatch(localAdapterSource, /aws-amplify\/data/);
  assert.doesNotMatch(offlineAdapterSource, /aws-amplify\/data/);
});
