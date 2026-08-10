import { useMemo, useState } from "react";
import { Download, MessageSquarePlus, X } from "lucide-react";
import { useTraining } from "@/state/trainingStore";
import {
  acknowledgeFeedbackNotice,
  downloadFeedbackExport,
  hasAcknowledgedFeedbackNotice,
  loadFeedbackRecords,
  saveFeedbackRecord,
  type FeedbackSource,
} from "@/lib/feedbackStore";

interface FeedbackCaptureProps {
  source: FeedbackSource;
  triggerLabel?: string;
  compact?: boolean;
}

export function FeedbackCapture({
  source,
  triggerLabel = "Feedback geben",
  compact = false,
}: FeedbackCaptureProps) {
  const { scenario, mode, progress } = useTraining();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const [noticeAcknowledged, setNoticeAcknowledged] = useState(false);

  const context = useMemo(
    () => ({
      scenarioId: scenario.id,
      stepId:
        progress.activeStepId ??
        (source === "completion" ? (scenario.steps.at(-1)?.id ?? null) : null),
      mode,
      runtimeAdapterId: scenario.environment?.runtimeAdapterId ?? null,
      appVersion: import.meta.env.VITE_APP_VERSION || "0.0.0-local",
      commit: import.meta.env.VITE_APP_COMMIT_SHA || "local",
    }),
    [mode, progress.activeStepId, scenario, source],
  );

  const submit = () => {
    if (!text.trim()) return;
    saveFeedbackRecord(source, text, context);
    acknowledgeFeedbackNotice();
    setNoticeAcknowledged(true);
    setRecordCount(loadFeedbackRecords().length);
    setText("");
    setSaved(true);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setSaved(false);
          setRecordCount(loadFeedbackRecords().length);
          setNoticeAcknowledged(hasAcknowledgedFeedbackNotice());
          setOpen(true);
        }}
        className={
          compact
            ? "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-normal normal-case tracking-normal text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
            : "inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:border-ring hover:bg-white/5"
        }
      >
        <MessageSquarePlus className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {triggerLabel}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Feedback geben"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-panel p-4 text-left shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-foreground">Feedback geben</h2>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  Szenario, Schritt, Modus und technische Laufzeitinformationen werden automatisch
                  als Kontext angehängt.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Feedback schließen"
                className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!noticeAcknowledged ? (
              <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[12px] leading-relaxed text-foreground">
                Dein Feedback wird zur Verbesserung des Produkts ausgewertet und vorerst nur lokal
                in diesem Browser gespeichert. Gib bitte keine personenbezogenen, vertraulichen
                oder geheimen Inhalte ein. Es findet noch kein automatischer Versand statt.
              </div>
            ) : null}

            <label className="mt-4 block text-[12px] font-medium text-foreground">
              Dein Feedback
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={4}
                placeholder="Was war unklar, hilfreich oder sollte verbessert werden?"
                className="mt-1.5 w-full resize-y rounded-md border border-border bg-editor px-3 py-2 text-[13px] font-normal text-foreground outline-none focus:border-ring"
              />
            </label>

            <div className="mt-3 rounded-md border border-border bg-card p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              Kontext: {context.scenarioId} · {context.stepId ?? "kein aktiver Schritt"} · {context.mode}
              · {context.runtimeAdapterId ?? "kein Runtime-Adapter"} · {context.commit}
            </div>

            {saved ? (
              <p role="status" className="mt-3 text-[12px] text-success">
                Feedback lokal gespeichert. Dein Trainingsfortschritt bleibt unverändert.
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={!text.trim()}
                className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Feedback speichern
              </button>
              <button
                type="button"
                onClick={downloadFeedbackExport}
                disabled={recordCount === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-foreground transition-colors hover:border-ring disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" /> JSON exportieren ({recordCount})
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
