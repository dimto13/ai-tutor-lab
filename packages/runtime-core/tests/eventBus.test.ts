import assert from "node:assert/strict";
import test from "node:test";
import { EventBus } from "../src/eventBus.ts";

test("in-process event bus delivers one event to subscribers", () => {
  const bus = new EventBus();
  const seen: string[] = [];
  const unsubscribe = bus.subscribe((event) => seen.push(event.name));
  bus.emit("explorer.opened");
  unsubscribe();
  bus.emit("terminal.opened");
  assert.deepEqual(seen, ["explorer.opened"]);
});
