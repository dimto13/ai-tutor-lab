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

/** Edge of the anchor the overlay is aligned with along its side. */
export type OverlayPlacementAlign = "start" | "end";

export interface OverlayPlacement {
  top: number;
  left: number;
  side: OverlayPlacementSide;
  align: OverlayPlacementAlign;
  /** 0 means collision-free; anything else is a collision the caller has to handle. */
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

export function clampToViewport(
  top: number,
  left: number,
  size: OverlaySize,
  viewport: OverlayViewport,
  inset: number = DEFAULT_VIEWPORT_INSET,
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

function intersectionRect(leftRect: OverlayRect, rightRect: OverlayRect): OverlayRect | null {
  const left = Math.max(leftRect.left, rightRect.left);
  const top = Math.max(leftRect.top, rightRect.top);
  const intersectionRight = Math.min(right(leftRect), right(rightRect));
  const intersectionBottom = Math.min(bottom(leftRect), bottom(rightRect));
  if (intersectionRight <= left || intersectionBottom <= top) return null;
  return {
    top,
    left,
    width: intersectionRight - left,
    height: intersectionBottom - top,
  };
}

export function intersectionArea(leftRect: OverlayRect, rightRect: OverlayRect): number {
  const intersection = intersectionRect(leftRect, rightRect);
  return intersection ? intersection.width * intersection.height : 0;
}

function unionArea(rects: readonly OverlayRect[]): number {
  if (rects.length === 0) return 0;
  const xEdges = [...new Set(rects.flatMap((rect) => [rect.left, right(rect)]))].sort(
    (left, rightEdge) => left - rightEdge,
  );
  let area = 0;

  for (let index = 0; index < xEdges.length - 1; index += 1) {
    const left = xEdges[index];
    const rightEdge = xEdges[index + 1];
    if (left === undefined || rightEdge === undefined || rightEdge <= left) continue;

    const intervals = rects
      .filter((rect) => rect.left < rightEdge && right(rect) > left)
      .map((rect) => [rect.top, bottom(rect)] as const)
      .sort(([leftTop], [rightTop]) => leftTop - rightTop);
    if (intervals.length === 0) continue;

    let coveredHeight = 0;
    let currentTop = intervals[0]?.[0] ?? 0;
    let currentBottom = intervals[0]?.[1] ?? 0;
    for (const [top, bottomEdge] of intervals.slice(1)) {
      if (top > currentBottom) {
        coveredHeight += currentBottom - currentTop;
        currentTop = top;
        currentBottom = bottomEdge;
      } else {
        currentBottom = Math.max(currentBottom, bottomEdge);
      }
    }
    coveredHeight += currentBottom - currentTop;
    area += (rightEdge - left) * coveredHeight;
  }

  return area;
}

function totalIntersectionArea(rect: OverlayRect, blockers: readonly OverlayRect[]): number {
  return unionArea(
    blockers
      .map((blocker) => intersectionRect(rect, blocker))
      .filter((intersection): intersection is OverlayRect => intersection !== null),
  );
}

/**
 * Places platform chrome around a runtime anchor without knowing anything about
 * product DOM. Bottom is preferred, then top, right and left; on each side the
 * overlay is first aligned with the anchor's start edge, then with its end edge.
 * Every candidate is clamped to the viewport and then scored against the anchor
 * and every region in `avoid`: runtime transient action regions, the platform's
 * own instruction surface and the information surfaces the current step needs.
 * Overlapping regions are scored by their union so nested menus do not count the
 * same pixels multiple times.
 *
 * The first collision-free candidate wins. If no candidate is collision-free,
 * the candidate with the smallest overlap is returned with `overlapArea > 0`.
 * That result is a collision, not a position: callers must switch to their
 * controlled fallback instead of rendering the overlay on top of what it covers.
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
  const below = bottom(anchor) + gap;
  const above = anchor.top - gap - tooltip.height;
  const startLeft = anchor.left;
  const endLeft = right(anchor) - tooltip.width;
  const startTop = anchor.top;
  const endTop = bottom(anchor) - tooltip.height;
  const rawCandidates: Array<{
    side: OverlayPlacementSide;
    align: OverlayPlacementAlign;
    top: number;
    left: number;
  }> = [
    { side: "bottom", align: "start", top: below, left: startLeft },
    { side: "bottom", align: "end", top: below, left: endLeft },
    { side: "top", align: "start", top: above, left: startLeft },
    { side: "top", align: "end", top: above, left: endLeft },
    { side: "right", align: "start", top: startTop, left: right(anchor) + gap },
    { side: "right", align: "end", top: endTop, left: right(anchor) + gap },
    { side: "left", align: "start", top: startTop, left: anchor.left - gap - tooltip.width },
    { side: "left", align: "end", top: endTop, left: anchor.left - gap - tooltip.width },
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

  // Candidates are in preference order, so the first minimum is the first
  // collision-free candidate whenever one exists.
  return candidates.reduce((best, candidate) =>
    candidate.overlapArea < best.overlapArea ? candidate : best,
  );
}
