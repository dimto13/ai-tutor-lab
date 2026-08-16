import assert from "node:assert/strict";
import { test } from "node:test";
import {
  placeOverlayTooltip,
  type OverlayRect,
} from "../../apps/web/src/components/overlay/overlayPlacement.ts";

const viewport = { width: 600, height: 500 };
const tooltip = { width: 100, height: 60 };

function rect(top: number, left: number, width: number, height: number): OverlayRect {
  return { top, left, width, height };
}

test("overlay placement: uses bottom when it is free", () => {
  const placement = placeOverlayTooltip({
    anchor: rect(100, 100, 40, 20),
    tooltip,
    viewport,
  });

  assert.deepEqual(placement, {
    side: "bottom",
    top: 130,
    left: 100,
    overlapArea: 0,
  });
});

test("overlay placement: moves above when bottom is blocked", () => {
  const placement = placeOverlayTooltip({
    anchor: rect(100, 100, 40, 20),
    tooltip,
    viewport,
    avoid: [rect(125, 90, 60, 70)],
  });

  assert.equal(placement.side, "top");
  assert.equal(placement.overlapArea, 0);
});

test("overlay placement: moves sideways when bottom and top are blocked", () => {
  const placement = placeOverlayTooltip({
    anchor: rect(100, 100, 40, 20),
    tooltip,
    viewport,
    avoid: [rect(125, 90, 60, 70), rect(30, 90, 60, 65)],
  });

  assert.equal(placement.side, "right");
  assert.equal(placement.overlapArea, 0);
});

test("overlay placement: chooses the smallest overlap when every direction is blocked", () => {
  const anchor = rect(200, 200, 40, 40);
  const placement = placeOverlayTooltip({
    anchor,
    tooltip,
    viewport,
    avoid: [
      rect(250, 200, 100, 60),
      rect(130, 200, 100, 60),
      rect(200, 250, 100, 60),
      rect(200, 90, 20, 20),
    ],
  });

  assert.equal(placement.side, "left");
  assert.equal(placement.overlapArea, 400);
});

test("overlay placement: clamps candidates inside viewport boundaries", () => {
  const placement = placeOverlayTooltip({
    anchor: rect(460, 480, 20, 20),
    tooltip,
    viewport: { width: 500, height: 500 },
  });

  assert.equal(placement.side, "top");
  assert.ok(placement.left >= 12);
  assert.ok(placement.top >= 12);
  assert.ok(placement.left + tooltip.width <= 488);
  assert.ok(placement.top + tooltip.height <= 488);
});
