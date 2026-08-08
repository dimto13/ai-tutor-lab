import { useEffect, useLayoutEffect, useState } from "react";
import { getRuntimeAdapter } from "@/runtime";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Spotlight overlay: dims everything except the target element (four dim panes),
 * so the highlighted element stays fully clickable. The semantic target is
 * resolved by the active RuntimeAdapter; scenarios never know DOM selectors.
 */
export function HighlightOverlay({
  targetId,
  runtimeAdapterId,
  tooltip,
  strong,
}: {
  targetId?: string | undefined;
  runtimeAdapterId?: string | undefined;
  tooltip?: string | undefined;
  strong?: boolean | undefined;
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!targetId || !runtimeAdapterId) {
      setRect(null);
      return;
    }
    const runtime = getRuntimeAdapter(runtimeAdapterId);
    if (!runtime?.resolveTarget) {
      setRect(null);
      return;
    }

    let frame = 0;
    const measure = () => {
      const el = runtime.resolveTarget?.(targetId);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
    };
    measure();
    const loop = () => {
      measure();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [targetId, runtimeAdapterId]);

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(Boolean(rect));
  }, [rect]);

  if (!rect) return null;
  const dim = strong ? "bg-black/60" : "bg-black/35";

  return (
    <div className="pointer-events-none fixed inset-0 z-40" aria-hidden="true">
      <div className={`absolute left-0 right-0 top-0 ${dim} transition-opacity`} style={{ height: rect.top }} />
      <div className={`absolute bottom-0 left-0 right-0 ${dim}`} style={{ top: rect.top + rect.height }} />
      <div className={`absolute left-0 ${dim}`} style={{ top: rect.top, height: rect.height, width: rect.left }} />
      <div
        className={`absolute right-0 ${dim}`}
        style={{ top: rect.top, height: rect.height, left: rect.left + rect.width }}
      />
      <div
        className={`absolute rounded-md ring-2 ring-ring ${strong ? "animate-pulse" : ""}`}
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          boxShadow: "0 0 0 1px var(--ring), 0 0 24px 4px color-mix(in oklab, var(--ring) 45%, transparent)",
        }}
      />
      {tooltip && visible ? (
        <div
          className="absolute max-w-64 rounded-md border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-xl"
          style={{
            top: Math.min(rect.top + rect.height + 10, window.innerHeight - 90),
            left:
              rect.left > window.innerWidth * 0.62
                ? Math.max(12, rect.left - 268)
                : Math.min(rect.left, window.innerWidth - 280),
          }}
        >
          {tooltip}
        </div>
      ) : null}
    </div>
  );
}
