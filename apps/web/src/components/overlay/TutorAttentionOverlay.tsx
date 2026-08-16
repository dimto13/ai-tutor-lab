import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getRuntimeAdapterForTarget } from "@/runtime";
import { useTraining } from "@/state/trainingStore";
import {
  clearTutorAttention,
  getTutorAttention,
  getTutorAttentionServerSnapshot,
  subscribeTutorAttention,
} from "./tutorAttention";

const ATTENTION_DURATION_MS = 2400;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function unionRects(rects: DOMRect[]): Rect | null {
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

function sameRect(left: Rect | null, right: Rect | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.top === right.top &&
    left.left === right.left &&
    left.width === right.width &&
    left.height === right.height
  );
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
  const [rect, setRect] = useState<Rect | null>(null);

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
    };

    measure();
    const loop = () => {
      measure();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [attention, targetResolvers, runtimeAdapterId]);

  if (!attention || !rect) return null;

  const tooltipTop = Math.min(rect.top + rect.height + 10, window.innerHeight - 84);
  const tooltipLeft =
    rect.left > window.innerWidth * 0.62
      ? Math.max(12, rect.left - 292)
      : Math.max(12, Math.min(rect.left, window.innerWidth - 304));

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
          className="absolute max-w-[18rem] rounded-md border border-border bg-card px-3 py-2 text-xs leading-relaxed text-foreground shadow-xl"
          style={{
            top: tooltipTop,
            left: tooltipLeft,
            maxWidth: "calc(100vw - 24px)",
          }}
        >
          <span className="font-semibold text-accent">Tutor-Hinweis:</span> {attention.label}
        </div>
      </div>
    </>
  );
}
