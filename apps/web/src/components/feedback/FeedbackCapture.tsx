import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Camera, Download, MessageSquareWarning, Trash2, X } from "lucide-react";
import { captureTrainingSurfaceScreenshot } from "@/lib/feedbackScreenshot";
import {
  acknowledgeFeedbackNotice,
  downloadFeedbackExport,
  hasAcknowledgedFeedbackNotice,
  loadFeedbackRecords,
  saveFeedbackRecord,
  type FeedbackKind,
  type FeedbackScreenshotAttachment,
  type FeedbackSource,
  type FeedbackViewportClass,
} from "@/lib/feedbackStore";
import { getRuntimeAdapter } from "@/runtime";
import { useTraining } from "@/state/trainingStore";

interface FeedbackCaptureProps {
  source: FeedbackSource;
  triggerLabel?: string;
  compact?: boolean;
  flow?: "general" | "problem";
}

const problemKinds: Array<{ value: FeedbackKind; label: string }> = [
  { value: "problem", label: "Problem / Bug" },
  { value: "ux", label: "Unklar / schwer bedienbar" },
  { value: "improvement", label: "Verbesserungsvorschlag" },
];

function viewportClass(): FeedbackViewportClass {
  if (typeof window === "undefined") return "unknown";
  if (window.innerWidth <= 359) return "compact";
  if (window.innerWidth <= 767) return "small";
  if (window.innerWidth <= 1279) return "medium";
  return "large";
}

export function FeedbackCapture({
  source,
  triggerLabel = "Feedback geben",
  compact = false,
  flow = "general",
}: FeedbackCaptureProps) {
  const { scenario, mode, progress } = useTraining();
  const runtimeAdapterId = scenario.environment?.runtimeAdapterId;
  const runtimeAdapter = useMemo(() => getRuntimeAdapter(runtimeAdapterId), [runtimeAdapterId]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<FeedbackKind>(flow === "problem" ? "problem" : "general");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recordCount, setRecordCount] = useState(0);
  const [noticeAcknowledged, setNoticeAcknowledged] = useState(false);
  const [screenshotConsentVisible, setScreenshotConsentVisible] = useState(false);
  const [screenshot, setScreenshot] = useState<FeedbackScreenshotAttachment | null>(null);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);

  const stepId =
    progress.activeStepId ?? (source === "completion" ? (scenario.steps.at(-1)?.id ?? null) : null);

  const context = useMemo(
    () => ({
      scenarioId: scenario.id,
      stepId,
      mode,
      runtimeAdapterId: runtimeAdapterId ?? null,
      runtime: {
        productId: runtimeAdapter?.productId ?? null,
        capabilities: [...(runtimeAdapter?.capabilities ?? [])],
        viewportClass: viewportClass(),
        stepStatus: stepId ? (progress.statuses[stepId] ?? null) : null,
        hintsUsed: progress.hintsUsed,
        mistakes: progress.mistakes,
      },
      appVersion: import.meta.env["VITE_APP_VERSION"] || "0.0.0-local",
      commit: import.meta.env["VITE_APP_COMMIT_SHA"] || "local",
    }),
    [
      mode,
      progress.hintsUsed,
      progress.mistakes,
      progress.statuses,
      runtimeAdapter,
      runtimeAdapterId,
      scenario.id,
      stepId,
    ],
  );

  const resetTransientState = () => {
    setText("");
    setKind(flow === "problem" ? "problem" : "general");
    setSaved(false);
    setSaveError(null);
    setScreenshotConsentVisible(false);
    setScreenshot(null);
    setScreenshotBusy(false);
    setScreenshotError(null);
  };

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setSaved(false);
      setSaveError(null);
      setRecordCount(loadFeedbackRecords().length);
      setNoticeAcknowledged(hasAcknowledgedFeedbackNotice());
      return;
    }
    resetTransientState();
  };

  const submit = () => {
    if (!text.trim()) return;
    setSaveError(null);
    try {
      saveFeedbackRecord(
        source,
        text,
        {
          ...context,
          runtime: { ...context.runtime, viewportClass: viewportClass() },
        },
        { kind, screenshot },
      );
      acknowledgeFeedbackNotice();
      setNoticeAcknowledged(true);
      setRecordCount(loadFeedbackRecords().length);
      setText("");
      setSaved(true);
    } catch {
      setSaveError("Feedback konnte nicht lokal gespeichert werden. Es wurde nichts versendet.");
    }
  };

  const captureScreenshot = async () => {
    setScreenshotBusy(true);
    setScreenshotError(null);
    try {
      setScreenshot(await captureTrainingSurfaceScreenshot());
      setScreenshotConsentVisible(false);
    } catch {
      setScreenshotError("Die Trainingsfläche konnte nicht als Screenshot aufgenommen werden.");
    } finally {
      setScreenshotBusy(false);
    }
  };

  const problemFlow = flow === "problem";

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={
            compact
              ? "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-normal normal-case tracking-normal text-muted-foreground transition-colors hover:border-ring hover:text-foreground motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : "inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:border-ring hover:bg-muted motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          }
        >
          <MessageSquareWarning
            className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
            aria-hidden="true"
          />
          {triggerLabel}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80" />
        <Dialog.Content
          data-feedback-capture-ui="true"
          className="platform-ui fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-panel p-4 text-left shadow-2xl focus:outline-none sm:p-5"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold text-foreground">
                {problemFlow ? "Problem melden" : "Feedback geben"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Scenario, Schritt, Modus und datensparsame technische Laufzeitinformationen werden
                automatisch als Kontext angehängt.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={problemFlow ? "Problemmeldung abbrechen" : "Feedback schließen"}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          {problemFlow ? (
            <p className="mt-3 rounded-lg border border-border bg-card p-3 text-[12px] leading-relaxed text-foreground">
              Lernfragen bleiben normale Tutorfragen und werden nicht als Feedback gespeichert. Hier
              meldest du bewusst einen Fehler, ein Bedienproblem oder einen Verbesserungsvorschlag.
            </p>
          ) : null}

          {!noticeAcknowledged ? (
            <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[12px] leading-relaxed text-foreground">
              Dein Feedback wird zur Verbesserung des Produkts ausgewertet und vorerst nur lokal in
              diesem Browser gespeichert. Gib bitte keine personenbezogenen, vertraulichen oder
              geheimen Inhalte ein. Es findet noch kein automatischer Versand statt.
            </div>
          ) : null}

          {problemFlow ? (
            <fieldset className="mt-4">
              <legend className="text-[12px] font-medium text-foreground">Worum geht es?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {problemKinds.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-card p-2.5 text-[11px] leading-snug text-foreground focus-within:border-ring"
                  >
                    <input
                      type="radio"
                      name="feedback-kind"
                      value={option.value}
                      checked={kind === option.value}
                      onChange={() => setKind(option.value)}
                      className="mt-0.5 accent-[var(--platform-accent)]"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <label className="mt-4 block text-[12px] font-medium text-foreground">
            {problemFlow ? "Was ist passiert oder was sollte besser funktionieren?" : "Dein Feedback"}
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setSaved(false);
              }}
              rows={4}
              placeholder={
                problemFlow
                  ? "Beschreibe kurz das Problem oder deinen Verbesserungsvorschlag."
                  : "Was war unklar, hilfreich oder sollte verbessert werden?"
              }
              className="mt-1.5 w-full resize-y rounded-md border border-border bg-input px-3 py-2 text-[13px] font-normal text-foreground outline-none focus:border-ring focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <div className="mt-3 rounded-md border border-border bg-card p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            Kontext: {context.scenarioId}
            {" · "}
            {context.stepId ?? "kein aktiver Schritt"}
            {" · "}
            {context.mode}
            {" · "}
            {context.runtimeAdapterId ?? "kein Runtime-Adapter"}
            {context.runtime.productId ? ` · ${context.runtime.productId}` : ""}
          </div>

          <div className="mt-4 rounded-lg border border-border bg-card/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[12px] font-medium text-foreground">Optionaler Screenshot</p>
                <p className="mt-0.5 max-w-md text-[11px] leading-relaxed text-muted-foreground">
                  Ohne deine ausdrückliche Aktion wird nichts aufgenommen. Erfasst wird nur die
                  sichtbare Trainingsfläche der Plattform mit Simulator und Guide — nie dein Desktop
                  oder andere Fenster. Texteingaben werden in der Aufnahme ausgeblendet.
                </p>
              </div>
              {!screenshot && !screenshotConsentVisible ? (
                <button
                  type="button"
                  onClick={() => setScreenshotConsentVisible(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Screenshot hinzufügen
                </button>
              ) : null}
            </div>

            {screenshotConsentVisible && !screenshot ? (
              <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3">
                <p className="text-[11px] leading-relaxed text-foreground">
                  Mit „Screenshot jetzt aufnehmen“ bestätigst du diese einmalige Aufnahme der oben
                  beschriebenen Trainingsfläche. Erst dieser Klick startet die Aufnahme.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={screenshotBusy}
                    onClick={() => void captureScreenshot()}
                    className="rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-accent-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {screenshotBusy ? "Aufnahme läuft …" : "Screenshot jetzt aufnehmen"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreenshotConsentVisible(false)}
                    className="rounded-md border border-border px-2.5 py-1.5 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Ohne Screenshot fortfahren
                  </button>
                </div>
              </div>
            ) : null}

            {screenshot ? (
              <figure className="mt-3">
                <img
                  src={screenshot.dataUrl}
                  alt="Vorschau des aufgenommenen Trainings-Screenshots"
                  className="max-h-56 w-full rounded-md border border-border bg-background object-contain"
                />
                <figcaption className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span>
                    Vorschau · {screenshot.width} × {screenshot.height}px · wird zusammen mit diesem
                    Feedback lokal gespeichert
                  </span>
                  <button
                    type="button"
                    onClick={() => setScreenshot(null)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-foreground hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" /> Screenshot verwerfen
                  </button>
                </figcaption>
              </figure>
            ) : null}

            {screenshotError ? (
              <p role="status" className="mt-2 text-[11px] text-warning">
                {screenshotError}
              </p>
            ) : null}
          </div>

          {saved ? (
            <p role="status" className="mt-3 text-[12px] text-success">
              Feedback lokal gespeichert. Dein Trainingsfortschritt bleibt unverändert.
            </p>
          ) : null}
          {saveError ? (
            <p role="alert" className="mt-3 text-[12px] text-warning">
              {saveError}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim()}
              className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {problemFlow ? "Problemmeldung speichern" : "Feedback speichern"}
            </button>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-2 text-xs text-foreground hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Abbrechen
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={downloadFeedbackExport}
              disabled={recordCount === 0}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-foreground transition-colors hover:border-ring disabled:opacity-40 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> JSON exportieren ({recordCount})
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
