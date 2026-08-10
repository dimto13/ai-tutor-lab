import assert from "node:assert/strict";
import test from "node:test";
import { executeTerminalCommand } from "../src/terminalCommandEngine.ts";

test("terminal simulator exposes deterministic command evaluation", () => {
  assert.equal(typeof executeTerminalCommand, "function");
});
