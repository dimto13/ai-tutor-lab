import assert from "node:assert/strict";
import { test } from "node:test";
import { vscodeRuntime } from "../../apps/web/src/runtime/vscodeRuntime.ts";

function domRect(top: number, left: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function createContainer(regions: DOMRect[]): HTMLElement {
  return {
    tabIndex: -1,
    querySelector: () => null,
    querySelectorAll: (selector: string) => {
      assert.equal(selector, '[role="menu"], [role="dialog"]');
      return regions.map((region) => ({ getBoundingClientRect: () => region }));
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLElement;
}

test("vscodeRuntime exposes visible product-owned menu and dialog regions while mounted", async () => {
  const menu = domRect(80, 120, 288, 320);
  const submenu = domRect(160, 180, 240, 120);
  const dialog = domRect(90, 220, 420, 240);
  const hidden = domRect(0, 0, 0, 0);

  await vscodeRuntime.mount(createContainer([menu, submenu, dialog, hidden]));
  try {
    assert.deepEqual(vscodeRuntime.resolveTransientActionRegions(), [menu, submenu, dialog]);
  } finally {
    await vscodeRuntime.unmount();
  }

  assert.deepEqual(vscodeRuntime.resolveTransientActionRegions(), []);
});
