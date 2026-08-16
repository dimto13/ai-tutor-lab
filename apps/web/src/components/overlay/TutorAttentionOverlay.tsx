import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getRuntimeAdapterForTarget, getRuntimeAdapters } from "@/runtime";
import { useTraining } from "@/state/trainingStore";
import {
  clearTutorAttention,
  getTutorAttention,
  getTutorAttentionServerSnapshot,
  subscribeTutorAttention,
} from "./tutorAttention";
import {
  placeOverlayTooltip,
  type OverlayPlacement,
  type OverlayRect,
  type OverlaySize,
} from "./overlayPlacement";

const ATTENTION_DURATION_MS = 2400;
const TUTOR_TOOLTIP_FALLBACK_SIZE: OverlaySize = { width: 288, height: 72 };

function unionRects(rects: DOMRect[]): OverlayRect | null {
  if (rects.length === 0) return null;

  const padding = 8;
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
 * Short-lived Tutor attention marker. It is deliberately presentation-only:
 * semantic UiTargetRefs are resolved by RuntimeAdapters and no TrainingEvent or
 * progress transition is emitted.
 */
export function TutorAttentionOverlay({
  runtimeAdapterId,
  integrationRuntimeAdapterIds,
}: {
  runtimeAdapterId?: string | undefined;
  integrationRuntimeAdapterIds?: readonly string[] | undefined;
}) {
  const { progress } = useTraining();
  const attention = useSyncExternalStore(
    subscribeTutorAttention,
    getTutorAttention,
    getTutorAttentionServerSnapshot,
  );
  const [rect, setRect] = useState<OverlayRect | null>(null);
  const [transientRegions, setTransientRegions] = useState<OverlayRect[]>([]);
  const [tooltipSize, setTooltipSize] = useState<OverlaySize>(TUTOR_TOOLTIP_FALLBACK_SIZE);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const targetResolvers = useMemo(
    () =>
      (attention?.targetIds ?? []).map((targetId) => ({
        targetId,
        runtime: runtimeAdapterId
          ? getRuntimeAdapterForTarget(targetId, runtimeAdapterId, integrationRuntimeAdapterIds)
          : null,
      })),
    [attention, runtimeAdapterId, integrationRuntimeAdapterIds],
  );
  const runtimes = useMemo(
    () => getRuntimeAdapters(runtimeAdapterId, integrationRuntimeAdapterIds),
    [runtimeAdapterId, integrationRuntimeAdapterIds],
  );

  useEffect(() => {
    clearTutorAttention();
    return () => clearTutorAttention();
  }, [progress.activeStepId]);

  useEffect(() => {
    if (!attention) return;
    const requestId = attention.requestId;
    const timer = window.setTimeout(() => clearTutorAttention(requestId), ATTENTION_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [attention]);

  useLayoutEffect(() => {
    if (!attention || targetResolvers.length === 0 || !runtimeAdapterId) {
      setRect(null);
      setTransientRegions([]);
      return;
    }

    let frame = 0;
    const measure = () => {
      const resolvedRects: DOMRect[] = [];
      for (const resolver of targetResolvers) {
        const resolved = resolver.runtime?.resolveTarget(resolver.targetId);
        if (resolved && resolved.width > 0 && resolved.height > 0) {
          resolvedRects.push(resolved);
        }
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
  }, [attention, targetResolvers, runtimes, runtimeAdapterId]);

  const placement = useMemo<OverlayPlacement | null>(() => {
    if (!rect || typeof window === "undefined") return null;
    return placeOverlayTooltip({
      anchor: rect,
      tooltip: tooltipSize,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      avoid: transientRegions,
    });
  }, [rect, tooltipSize, transientRegions]);

  if (!attention || !rect || !placement) return null;

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        Tutor-Hinweis: {attention.label}
      </p>
      <div className="platform-ui pointer-events-none fixed inset-0 z-50" aria-hidden="true">
        <div
          data-testid="tutor-attention-frame"
          data-attention-kind="tutor"
          data-attention-targets={attention.targetIds.join(" ")}
          className="absolute animate-pulse rounded-lg border-2 border-dashed border-accent motion-reduce:animate-none"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow:
              "0 0 0 2px var(--background), 0 0 22px 5px color-mix(in oklab, var(--accent) 45%, transparent)",
          }}
        />
        <div
          ref={tooltipRef}
          data-testid="tutor-attention-tooltip"
          data-placement-side={placement.side}
          className="absolute max-w-[18rem] rounded-md border border-border bg-card px-3 py-2 text-xs leading-relaxed text-foreground shadow-xl"
          style={{
            top: placement.top,
            left: placement.left,
            maxWidth: "calc(100vw - 24px)",
          }}
        >
          <span className="font-semibold text-accent">Tutor-Hinweis:</span> {attention.label}
        </div>
      </div>
    </>
  );
}
