import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { Lightbulb } from "lucide-react";
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
  clampToViewport,
  placeOverlayTooltip,
  type OverlayPlacement,
  type OverlayRect,
  type OverlaySize,
} from "./overlayPlacement";

const HIGHLIGHT_TOOLTIP_FALLBACK_SIZE: OverlaySize = { width: 256, height: 72 };
const HIGHLIGHT_HINT_FALLBACK_SIZE: OverlaySize = { width: 112, height: 32 };
// max-w-64 alone is overridden by the inline viewport cap, so both limits live here.
const HIGHLIGHT_TOOLTIP_MAX_WIDTH = "min(16rem, calc(100vw - 24px))";

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

function resolveElementRegions(element: HTMLElement | null | undefined): OverlayRect[] {
  if (!element) return [];
  const region = element.getBoundingClientRect();
  if (region.width <= 0 || region.height <= 0) return [];
  return [toOverlayRect(region)];
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
  contextTargetIds,
  guideRegionRef,
  runtimeAdapterId,
  integrationRuntimeAdapterIds,
  tooltip,
  strong,
}: {
  targetId?: string | undefined;
  /** Semantic information surfaces of the active step that the tooltip must keep clear. */
  contextTargetIds?: readonly string[] | undefined;
  /**
   * Guide column of the training layout (instruction surface, help, tutor). Platform
   * chrome pointing into the runtime never sits on the platform's own guide.
   */
  guideRegionRef?: RefObject<HTMLElement | null> | undefined;
  runtimeAdapterId?: string | undefined;
  integrationRuntimeAdapterIds?: readonly string[] | undefined;
  tooltip?: string | undefined;
  strong?: boolean | undefined;
}) {
  const { scenario, progress } = useTraining();
  const [rect, setRect] = useState<OverlayRect | null>(null);
  const [transientRegions, setTransientRegions] = useState<OverlayRect[]>([]);
  const [guideRegions, setGuideRegions] = useState<OverlayRect[]>([]);
  const [contextRegions, setContextRegions] = useState<OverlayRect[]>([]);
  const [tooltipSize, setTooltipSize] = useState<OverlaySize>(HIGHLIGHT_TOOLTIP_FALLBACK_SIZE);
  const [hintSize, setHintSize] = useState<OverlaySize>(HIGHLIGHT_HINT_FALLBACK_SIZE);
  const [expandedHintSize, setExpandedHintSize] = useState<OverlaySize | null>(null);
  const [hintExpanded, setHintExpanded] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const hintTextId = useId();
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
  const contextResolvers = useMemo(
    () =>
      [...new Set(contextTargetIds ?? [])].map((contextTargetId) => ({
        targetId: contextTargetId,
        runtime: runtimeAdapterId
          ? getRuntimeAdapterForTarget(
              contextTargetId,
              runtimeAdapterId,
              integrationRuntimeAdapterIds,
            )
          : undefined,
      })),
    [contextTargetIds, runtimeAdapterId, integrationRuntimeAdapterIds],
  );
  const runtimes = useMemo(
    () => getRuntimeAdapters(runtimeAdapterId, integrationRuntimeAdapterIds),
    [runtimeAdapterId, integrationRuntimeAdapterIds],
  );

  useLayoutEffect(() => {
    if (targetResolvers.length === 0 || !runtimeAdapterId) {
      setRect(null);
      setTransientRegions([]);
      setGuideRegions([]);
      setContextRegions([]);
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

      const nextGuideRegions = resolveElementRegions(guideRegionRef?.current);
      setGuideRegions((currentRegions) =>
        sameRects(currentRegions, nextGuideRegions) ? currentRegions : nextGuideRegions,
      );

      const nextContextRegions: OverlayRect[] = [];
      for (const resolver of contextResolvers) {
        const resolved = resolver.runtime?.resolveTarget(resolver.targetId);
        if (resolved && resolved.width > 0 && resolved.height > 0) {
          nextContextRegions.push(toOverlayRect(resolved));
        }
      }
      setContextRegions((currentRegions) =>
        sameRects(currentRegions, nextContextRegions) ? currentRegions : nextContextRegions,
      );

      // The tooltip stays rendered (hidden) while the fallback is active, so its
      // real size keeps deciding whether a collision-free position exists.
      const measuredTooltip = tooltipRef.current?.getBoundingClientRect();
      if (measuredTooltip && measuredTooltip.width > 0 && measuredTooltip.height > 0) {
        const nextSize = { width: measuredTooltip.width, height: measuredTooltip.height };
        setTooltipSize((currentSize) => (sameSize(currentSize, nextSize) ? currentSize : nextSize));
      }

      const hint = hintRef.current;
      const measuredHint = hint?.getBoundingClientRect();
      if (hint && measuredHint && measuredHint.width > 0 && measuredHint.height > 0) {
        const nextSize = { width: measuredHint.width, height: measuredHint.height };
        if (hint.dataset["state"] === "expanded") {
          setExpandedHintSize((currentSize) =>
            currentSize && sameSize(currentSize, nextSize) ? currentSize : nextSize,
          );
        } else {
          setHintSize((currentSize) => (sameSize(currentSize, nextSize) ? currentSize : nextSize));
        }
      }
    };

    measure();
    const loop = () => {
      measure();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [targetResolvers, contextResolvers, guideRegionRef, runtimes, runtimeAdapterId]);

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(Boolean(rect));
  }, [rect]);

  const effectiveTooltip = conceptFocus
    ? `${conceptFocus.term}: zugehöriger Bereich in der Oberfläche.`
    : tooltip;

  useEffect(() => {
    setHintExpanded(false);
  }, [activeStep?.id, effectiveTooltip]);

  const avoid = useMemo(
    () => [...transientRegions, ...guideRegions, ...contextRegions],
    [transientRegions, guideRegions, contextRegions],
  );

  const placement = useMemo<OverlayPlacement | null>(() => {
    if (!rect || typeof window === "undefined") return null;
    return placeOverlayTooltip({
      anchor: rect,
      tooltip: tooltipSize,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      avoid,
    });
  }, [rect, tooltipSize, avoid]);

  // Controlled fallback (#454): when no position keeps the target and every
  // surface the step needs clear, the tooltip collapses into a small hint button.
  const collapsed = Boolean(placement && placement.overlapArea > 0);

  const hintPlacement = useMemo<OverlayPlacement | null>(() => {
    if (!collapsed || !rect || typeof window === "undefined") return null;
    return placeOverlayTooltip({
      anchor: rect,
      tooltip: hintSize,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      avoid,
    });
  }, [collapsed, rect, hintSize, avoid]);

  const hintPosition = useMemo(() => {
    if (!hintPlacement || typeof window === "undefined") return null;
    if (!hintExpanded || !expandedHintSize) return hintPlacement;
    // Expanded on request: grow from the button so it stays where it was activated.
    return clampToViewport(hintPlacement.top, hintPlacement.left, expandedHintSize, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, [hintPlacement, hintExpanded, expandedHintSize]);

  if (!rect) return null;
  const dim = strong ? "bg-black/60" : "bg-black/35";
  const announcement = effectiveTooltip ?? activeStep?.instruction;

  return (
    <>
      {announcement ? (
        <p
          data-testid="highlight-announcement"
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
            data-placement-align={placement.align}
            data-placement-fallback={collapsed ? "collapsed" : undefined}
            className="absolute rounded-md border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-xl"
            style={{
              top: placement.top,
              left: placement.left,
              maxWidth: HIGHLIGHT_TOOLTIP_MAX_WIDTH,
              visibility: collapsed ? "hidden" : undefined,
            }}
          >
            {effectiveTooltip}
          </div>
        ) : null}
      </div>
      {effectiveTooltip && visible && collapsed && hintPosition ? (
        <div
          ref={hintRef}
          data-testid="highlight-hint"
          data-state={hintExpanded ? "expanded" : "collapsed"}
          className="fixed z-40 rounded-md border border-border bg-popover text-xs text-popover-foreground shadow-xl"
          style={{
            top: hintPosition.top,
            left: hintPosition.left,
            maxWidth: HIGHLIGHT_TOOLTIP_MAX_WIDTH,
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !hintExpanded) return;
            event.stopPropagation();
            setHintExpanded(false);
          }}
        >
          <button
            type="button"
            aria-expanded={hintExpanded}
            aria-controls={hintExpanded ? hintTextId : undefined}
            aria-label="Hinweis zum hervorgehobenen Ziel"
            onClick={() => setHintExpanded((expanded) => !expanded)}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors hover:bg-muted motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Lightbulb className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            Hinweis
          </button>
          {hintExpanded ? (
            <p id={hintTextId} className="px-3 pb-2 leading-relaxed">
              {effectiveTooltip}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
