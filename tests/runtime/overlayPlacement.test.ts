import assert from "node:assert/strict";
import { test } from "node:test";
import {
  intersectionArea,
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
    align: "start",
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

test("overlay placement: chooses the smallest geometric overlap without double-counting nested blockers", () => {
  const anchor = rect(200, 200, 40, 40);
  const duplicatedLeftBlocker = rect(200, 90, 20, 20);
  const placement = placeOverlayTooltip({
    anchor,
    tooltip,
    viewport,
    avoid: [
      rect(250, 200, 100, 60),
      rect(130, 200, 100, 60),
      rect(200, 250, 20, 30),
      duplicatedLeftBlocker,
      duplicatedLeftBlocker,
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

test("overlay placement: aligns with the anchor end before changing sides", () => {
  const anchor = rect(100, 200, 200, 20);
  const placement = placeOverlayTooltip({
    anchor,
    tooltip,
    viewport,
    avoid: [rect(125, 190, 60, 70)],
  });

  assert.equal(placement.side, "bottom");
  assert.equal(placement.align, "end");
  assert.equal(placement.left, 300);
  assert.equal(placement.overlapArea, 0);
});

test("overlay placement: reports a collision instead of a position when nothing is free", () => {
  const anchor = rect(50, 50, 500, 400);
  const placement = placeOverlayTooltip({
    anchor,
    tooltip,
    viewport,
  });

  assert.ok(placement.overlapArea > 0, "a covering candidate must be reported as a collision");
});

// #454: vscode-basics.guided step 10 at 1440×900, measured in Chromium on
// main@4ef1693. The spotlight anchor is the editor body, the tab bar with the
// dirty indicator sits directly above it, the Guided instruction surface on the right.
const editorAt1440 = rect(215, 282, 736, 683);
const tabBarAt1440 = rect(185, 288, 724, 36);
const guidedOrientationAt1440 = rect(153, 1061, 379, 329.5);
const viewport1440 = { width: 1440, height: 900 };

test("overlay placement #454: the step's information surface is never chosen as a position", () => {
  const placement = placeOverlayTooltip({
    anchor: editorAt1440,
    tooltip: { width: 256, height: 96 },
    viewport: viewport1440,
    avoid: [guidedOrientationAt1440, tabBarAt1440],
  });

  assert.equal(placement.overlapArea, 0);
  const placed = rect(placement.top, placement.left, 256, 96);
  assert.equal(intersectionArea(placed, tabBarAt1440), 0);
  assert.equal(intersectionArea(placed, guidedOrientationAt1440), 0);
  assert.equal(intersectionArea(placed, editorAt1440), 0);
});

test("overlay placement #454: the former 831 px tooltip has no free position and must fall back", () => {
  const placement = placeOverlayTooltip({
    anchor: editorAt1440,
    tooltip: { width: 830.83, height: 37.5 },
    viewport: viewport1440,
    avoid: [guidedOrientationAt1440, tabBarAt1440],
  });

  // Before #454 this candidate (top, 609 px² on the instruction surface plus the
  // tab bar) was rendered as if it were a position.
  assert.ok(placement.overlapArea > 0);
});
