import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("repository keeps active CONTROL discovery issue-number independent", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/validate-control-plane-contract.mjs")], {
    cwd: root,
    stdio: "pipe",
  });
});
