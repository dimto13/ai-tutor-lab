export interface OverlayRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface OverlaySize {
  width: number;
  height: number;
}

export interface OverlayViewport {
  width: number;
  height: number;
}

export type OverlayPlacementSide = "bottom" | "top" | "right" | "left";

export interface OverlayPlacement {
  top: number;
  left: number;
  side: OverlayPlacementSide;
  overlapArea: number;
}

const DEFAULT_GAP = 10;
const DEFAULT_VIEWPORT_INSET = 12;

function right(rect: OverlayRect): number {
  return rect.left + rect.width;
}

function bottom(rect: OverlayRect): number {
  return rect.top + rect.height;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

function clampToViewport(
  top: number,
  left: number,
  size: OverlaySize,
  viewport: OverlayViewport,
  inset: number,
): OverlayRect {
  const maxLeft = viewport.width - inset - size.width;
  const maxTop = viewport.height - inset - size.height;
  return {
    top: clamp(top, inset, maxTop),
    left: clamp(left, inset, maxLeft),
    width: size.width,
    height: size.height,
  };
}

export function intersectionArea(leftRect: OverlayRect, rightRect: OverlayRect): number {
  const width = Math.max(
    0,
    Math.min(right(leftRect), right(rightRect)) - Math.max(leftRect.left, rightRect.left),
  );
  const height = Math.max(
    0,
    Math.min(bottom(leftRect), bottom(rightRect)) - Math.max(leftRect.top, rightRect.top),
  );
  return width * height;
}

function totalIntersectionArea(rect: OverlayRect, blockers: readonly OverlayRect[]): number {
  return blockers.reduce((total, blocker) => total + intersectionArea(rect, blocker), 0);
}

/**
 * Places platform chrome around a runtime anchor without knowing anything about
 * product DOM. Bottom is preferred, then top, right and left. If every candidate
 * intersects the anchor or a runtime-reported transient action region, the
 * candidate with the smallest total overlap is selected. Every candidate is
 * clamped to the viewport before collision scoring.
 */
export function placeOverlayTooltip({
  anchor,
  tooltip,
  viewport,
  avoid = [],
  gap = DEFAULT_GAP,
  viewportInset = DEFAULT_VIEWPORT_INSET,
}: {
  anchor: OverlayRect;
  tooltip: OverlaySize;
  viewport: OverlayViewport;
  avoid?: readonly OverlayRect[];
  gap?: number;
  viewportInset?: number;
}): OverlayPlacement {
  const blockers = [anchor, ...avoid];
  const rawCandidates: Array<{
    side: OverlayPlacementSide;
    top: number;
    left: number;
  }> = [
    {
      side: "bottom",
      top: bottom(anchor) + gap,
      left: anchor.left,
    },
    {
      side: "top",
      top: anchor.top - gap - tooltip.height,
      left: anchor.left,
    },
    {
      side: "right",
      top: anchor.top,
      left: right(anchor) + gap,
    },
    {
      side: "left",
      top: anchor.top,
      left: anchor.left - gap - tooltip.width,
    },
  ];

  const candidates = rawCandidates.map((candidate) => {
    const rect = clampToViewport(candidate.top, candidate.left, tooltip, viewport, viewportInset);
    return {
      ...candidate,
      top: rect.top,
      left: rect.left,
      overlapArea: totalIntersectionArea(rect, blockers),
    };
  });

  return candidates.reduce((best, candidate) =>
    candidate.overlapArea < best.overlapArea ? candidate : best,
  );
}
