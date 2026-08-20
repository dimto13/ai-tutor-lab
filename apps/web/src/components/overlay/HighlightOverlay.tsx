import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getRuntimeAdapterForTarget, getRuntimeAdapters } from "@/runtime";
import { useTraining } from "@/state/trainingStore";
import { getGlossaryConceptForTarget } from "@/lib/glossary";
import {
  getGuidedConceptHighlight,
  getGuidedConceptHighlightServerSnapshot,
  requestGuidedConceptHighlight,
  subscribeGuidedConceptHighlight,
} from "./guidedConceptHighlight";
import {
  placeOverlayTooltip,
  type OverlayPlacement,
  type OverlayRect,
  type OverlaySize,
} from "./overlayPlacement";

const HIGHLIGHT_TOOLTIP_FALLBACK_SIZE: OverlaySize = { width: 256, height: 72 };

function unionRects(rects: DOMRect[]): OverlayRect | null {
  if (rects.length === 0) return null;

  const padding = 6;
  const viewportInset = 2;
  const left = Math.max(viewportInset, Math.min(...rects.map((rect) => rect.left)) - padding);
  const top = Math.max(viewportInset, Math.min(...rects.map((rect) => rect.top)) - padding);
  const right = Math.min(
    window.innerWidth - viewportInset,
    Math.max(...rects.map((rect) => rect.right)) + padding,
  );
  const bottom = Math.min(
    window.innerHeight - viewportInset,
    Math.max(...rects.map((rect) => rect.bottom)) + padding,
  );

  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function toOverlayRect(rect: DOMRect): OverlayRect {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function sameRect(left: OverlayRect | null, right: OverlayRect | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.top === right.top &&
    left.left === right.left &&
    left.width === right.width &&
    left.height === right.height
  );
}

function sameRects(left: readonly OverlayRect[], right: readonly OverlayRect[]): boolean {
  return (
    left.length === right.length &&
    left.every((rect, index) => sameRect(rect, right[index] ?? null))
  );
}

function sameSize(left: OverlaySize, right: OverlaySize): boolean {
  return left.width === right.width && left.height === right.height;
}

/**
 * Spotlight overlay: dims everything except the target element (four dim panes),
 * so the highlighted element stays fully clickable. The semantic target is
 * resolved by the runtime environment; scenarios never know DOM selectors.
 *
 * Guided explanation steps and glossary interactions may temporarily group all
 * currently visible semantic targets of one concept. This is presentation only:
 * no RuntimeEvent is emitted and training validation/progress is untouched.
 */
export function HighlightOverlay({
  targetId,
  runtimeAdapterId,
  integrationRuntimeAdapterIds,
  tooltip,
  strong,
}: {
  targetId?: string | undefined;
  runtimeAdapterId?: string | undefined;
  integrationRuntimeAdapterIds?: readonly string[] | undefined;
  tooltip?: string | undefined;
  strong?: boolean | undefined;
}) {
  const { scenario, progress } = useTraining();
  const [rect, setRect] = useState<OverlayRect | null>(null);
  const [transientRegions, setTransientRegions] = useState<OverlayRect[]>([]);
  const [tooltipSize, setTooltipSize] = useState<OverlaySize>(HIGHLIGHT_TOOLTIP_FALLBACK_SIZE);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const conceptFocus = useSyncExternalStore(
    subscribeGuidedConceptHighlight,
    getGuidedConceptHighlight,
    getGuidedConceptHighlightServerSnapshot,
  );
  const activeStep = scenario.steps.find((step) => step.id === progress.activeStepId);

  useEffect(() => {
    requestGuidedConceptHighlight(null);
    return () => requestGuidedConceptHighlight(null);
  }, [activeStep?.id]);

  const explanationConcept = useMemo(() => {
    if (activeStep?.stepType !== "explanation" || !targetId) return null;
    return getGlossaryConceptForTarget(targetId);
  }, [activeStep?.stepType, targetId]);

  const targetIds = useMemo(() => {
    const conceptTargets = conceptFocus?.targetIds ?? explanationConcept?.uiTargets ?? [];
    if (conceptTargets.length > 0) return [...new Set(conceptTargets)];
    return targetId ? [targetId] : [];
  }, [conceptFocus, explanationConcept, targetId]);

  const targetResolvers = useMemo(
    () =>
      targetIds.map((currentTargetId) => ({
        targetId: currentTargetId,
        runtime: runtimeAdapterId
          ? getRuntimeAdapterForTarget(
              currentTargetId,
              runtimeAdapterId,
              integrationRuntimeAdapterIds,
            )
          : undefined,
      })),
    [targetIds, runtimeAdapterId, integrationRuntimeAdapterIds],
  );
  const runtimes = useMemo(
    () => getRuntimeAdapters(runtimeAdapterId, integrationRuntimeAdapterIds),
    [runtimeAdapterId, integrationRuntimeAdapterIds],
  );

  useLayoutEffect(() => {
    if (targetResolvers.length === 0 || !runtimeAdapterId) {
      setRect(null);
      setTransientRegions([]);
      return;
    }

    let frame = 0;
    const measure = () => {
      const resolvedRects: DOMRect[] = [];
      for (const resolver of targetResolvers) {
        const resolved = resolver.runtime?.resolveTarget(resolver.targetId);
        if (resolved && resolved.width > 0 && resolved.height > 0) resolvedRects.push(resolved);
      }
      const nextRect = unionRects(resolvedRects);
      setRect((currentRect) => (sameRect(currentRect, nextRect) ? currentRect : nextRect));

      const nextTransientRegions = runtimes.flatMap((runtime) =>
        (runtime.resolveTransientActionRegions?.() ?? [])
          .filter((region) => region.width > 0 && region.height > 0)
          .map(toOverlayRect),
      );
      setTransientRegions((currentRegions) =>
        sameRects(currentRegions, nextTransientRegions) ? currentRegions : nextTransientRegions,
      );

      const measuredTooltip = tooltipRef.current?.getBoundingClientRect();
      if (measuredTooltip && measuredTooltip.width > 0 && measuredTooltip.height > 0) {
        const nextSize = { width: measuredTooltip.width, height: measuredTooltip.height };
        setTooltipSize((currentSize) => (sameSize(currentSize, nextSize) ? currentSize : nextSize));
      }
    };

    measure();
    const loop = () => {
      measure();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [targetResolvers, runtimes, runtimeAdapterId]);

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(Boolean(rect));
  }, [rect]);

  const placement = useMemo<OverlayPlacement | null>(() => {
    if (!rect || typeof window === "undefined") return null;
    return placeOverlayTooltip({
      anchor: rect,
      tooltip: tooltipSize,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      avoid: transientRegions,
    });
  }, [rect, tooltipSize, transientRegions]);

  if (!rect) return null;
  const dim = strong ? "bg-black/60" : "bg-black/35";
  const effectiveTooltip = conceptFocus
    ? `${conceptFocus.term}: zugehöriger Bereich in der Oberfläche.`
    : tooltip;
  const announcement = effectiveTooltip ?? activeStep?.instruction;

  return (
    <>
      {announcement ? (
        <p
          data-testid="highlight-announcement"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          Hervorgehobenes Ziel: {announcement}
        </p>
      ) : null}
      <div className="pointer-events-none fixed inset-0 z-40" aria-hidden="true">
        <div
          className={`absolute left-0 right-0 top-0 ${dim} transition-opacity motion-reduce:transition-none`}
          style={{ height: rect.top }}
        />
        <div
          className={`absolute bottom-0 left-0 right-0 ${dim}`}
          style={{ top: rect.top + rect.height }}
        />
        <div
          className={`absolute left-0 ${dim}`}
          style={{ top: rect.top, height: rect.height, width: rect.left }}
        />
        <div
          className={`absolute right-0 ${dim}`}
          style={{ top: rect.top, height: rect.height, left: rect.left + rect.width }}
        />
        <div
          data-testid="highlight-frame"
          data-highlight-kind="guided"
          data-highlight-concept={conceptFocus?.conceptKey ?? explanationConcept?.key}
          className={`absolute rounded-md ring-2 ring-ring ${
            strong ? "animate-pulse motion-reduce:animate-none" : ""
          }`}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow:
              "0 0 0 1px var(--ring), 0 0 24px 4px color-mix(in oklab, var(--ring) 45%, transparent)",
          }}
        />
        {effectiveTooltip && visible && placement ? (
          <div
            ref={tooltipRef}
            data-testid="highlight-tooltip"
            data-placement-side={placement.side}
            className="absolute max-w-64 rounded-md border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-xl"
            style={{
              top: placement.top,
              left: placement.left,
              maxWidth: "calc(100vw - 24px)",
            }}
          >
            {effectiveTooltip}
          </div>
        ) : null}
      </div>
    </>
  );
}
