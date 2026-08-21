import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, GraduationCap, Play, SearchCheck } from "lucide-react";
import type { EngineValidationResult, TrainingStep } from "@ai-train-lab/training-engine";
import {
  resolveAuthorHighlightTarget,
  simulateAuthorStepValidation,
  suggestAuthorEventType,
} from "@/authoring/authorPreview";
import { getScenario, getScenarioIds } from "@/scenarios";

export const Route = createFileRoute("/autorenvorschau")({
  head: () => ({
    meta: [
      { title: "Autorenvorschau – AI Training Lab" },
      {
        name: "description",
        content:
          "Szenarien ohne Deployment prüfen: Schritte, semantische Highlight-Ziele und Validatoren mit simulierten Events.",
      },
    ],
  }),
  component: AuthorPreviewRoute,
});

function AuthorPreviewRoute() {
  const scenarioIds = useMemo(() => getScenarioIds().sort(), []);
  const [scenarioId, setScenarioId] = useState(scenarioIds[0] ?? "");
  const scenario = getScenario(scenarioId);
  const [stepId, setStepId] = useState(scenario?.steps[0]?.id ?? "");
  const step = scenario?.steps.find((candidate) => candidate.id === stepId) ?? scenario?.steps[0];
  const [eventType, setEventType] = useState(step ? suggestAuthorEventType(step) : "");
  const [payloadText, setPayloadText] = useState("{}");
  const [result, setResult] = useState<EngineValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const firstStep = scenario?.steps[0];
    setStepId(firstStep?.id ?? "");
    setEventType(firstStep ? suggestAuthorEventType(firstStep) : "");
    setPayloadText("{}");
    setResult(null);
    setError(null);
  }, [scenarioId, scenario]);

  useEffect(() => {
    if (!step) return;
    setEventType(suggestAuthorEventType(step));
    setPayloadText("{}");
    setResult(null);
    setError(null);
  }, [stepId, step]);

  if (!scenario || !step) {
    return (
      <main className="platform-ui min-h-screen bg-background p-6 text-foreground">
        <p>Keine Szenarien verfügbar.</p>
      </main>
    );
  }

  const targetResolution = resolveAuthorHighlightTarget(scenario, step);

  async function runValidation(currentStep: TrainingStep) {
    setError(null);
    setResult(null);
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(payloadText) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("Payload muss ein JSON-Objekt sein.");
      }
      payload = parsed as Record<string, unknown>;
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Payload ist kein gültiges JSON-Objekt.",
      );
      return;
    }

    try {
      const nextResult = await simulateAuthorStepValidation(scenario, currentStep, {
        type: eventType.trim(),
        payload,
      });
      setResult(nextResult);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Der Validator konnte nicht ausgeführt werden.",
      );
    }
  }

  return (
    <main
      data-platform-ui="author-preview"
      className="platform-ui min-h-screen bg-background text-foreground"
    >
      <header className="border-b border-border bg-panel px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3">
          <Link
            to="/"
            aria-label="AI Training Lab – zurück zum Dashboard"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <GraduationCap className="h-4.5 w-4.5 text-accent" aria-hidden="true" />
            <span>AI Training Lab</span>
          </Link>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">Autorenvorschau</span>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:px-6">
        <aside className="space-y-5 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold">Szenario prüfen</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Lade ein bestehendes Szenario und prüfe Schritt für Schritt Zielauflösung und
              Validatoren. Es wird kein Deployment ausgelöst und kein Lernfortschritt verändert.
            </p>
          </div>

          <label className="block text-sm font-medium" htmlFor="author-scenario">
            Szenario
          </label>
          <select
            id="author-scenario"
            value={scenarioId}
            onChange={(event) => setScenarioId(event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {scenarioIds.map((id) => {
              const candidate = getScenario(id);
              return (
                <option key={id} value={id}>
                  {candidate?.title ?? id} · {candidate?.mode ?? "ohne Modus"}
                </option>
              );
            })}
          </select>

          <div>
            <p className="text-sm font-medium">Schritte</p>
            <div className="mt-2 space-y-2" role="list" aria-label="Szenarioschritte">
              {scenario.steps.map((candidate, index) => (
                <button
                  key={candidate.id}
                  type="button"
                  aria-current={candidate.id === step.id ? "step" : undefined}
                  onClick={() => setStepId(candidate.id)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=step]:border-accent aria-[current=step]:bg-accent/10"
                >
                  <span className="font-medium">
                    {index + 1}. {candidate.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {candidate.stepType === "explanation" ? "Erklärung" : "Aktion"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="min-w-0 space-y-6" aria-labelledby="author-step-title">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {scenario.id} · {scenario.mode ?? "ohne Modus"}
            </p>
            <h2 id="author-step-title" className="mt-1 text-2xl font-semibold">
              {step.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {step.instruction}
            </p>
          </div>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm" aria-labelledby="target-title">
            <div className="flex items-start gap-3">
              <SearchCheck className="mt-0.5 h-5 w-5 text-accent" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h3 id="target-title" className="font-semibold">Highlight-Ziel</h3>
                {targetResolution.status === "resolved" ? (
                  <div className="mt-3 rounded-lg border border-border bg-background p-3">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                      Ziel ist im RuntimeAdapter auflösbar
                    </p>
                    <dl className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-[8rem_1fr]">
                      <dt>Referenz</dt>
                      <dd className="break-all font-mono text-xs">{targetResolution.target}</dd>
                      <dt>Oberfläche</dt>
                      <dd>{targetResolution.label}</dd>
                      <dt>Runtime</dt>
                      <dd className="break-all font-mono text-xs">{targetResolution.runtimeId}</dd>
                    </dl>
                  </div>
                ) : targetResolution.status === "missing" ? (
                  <p className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      Ziel <code className="font-mono text-xs">{targetResolution.target}</code> ist
                      in keinem für dieses Szenario registrierten RuntimeAdapter auflösbar.
                    </span>
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Dieser Schritt hat kein Highlight-Ziel.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm" aria-labelledby="validator-title">
            <div className="flex items-start gap-3">
              <Play className="mt-0.5 h-5 w-5 text-accent" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h3 id="validator-title" className="font-semibold">Validator simulieren</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Gib ein Runtime-Event und optional einen JSON-Payload ein. Der produktive
                  Validator wird mit diesem simulierten Event ausgeführt.
                </p>

                <div className="mt-4 grid gap-4">
                  <label className="grid gap-1 text-sm font-medium" htmlFor="author-event-type">
                    Event-Typ
                    <input
                      id="author-event-type"
                      value={eventType}
                      onChange={(event) => setEventType(event.target.value)}
                      className="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>

                  <label className="grid gap-1 text-sm font-medium" htmlFor="author-event-payload">
                    Payload als JSON
                    <textarea
                      id="author-event-payload"
                      rows={7}
                      spellCheck={false}
                      value={payloadText}
                      onChange={(event) => setPayloadText(event.target.value)}
                      className="min-h-36 resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void runValidation(step)}
                    className="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Validator ausführen
                  </button>
                </div>

                <div className="mt-4" aria-live="polite">
                  {error ? (
                    <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                      {error}
                    </p>
                  ) : result ? (
                    <ValidationResult result={result} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Noch nicht ausgeführt.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function ValidationResult({ result }: { result: EngineValidationResult }) {
  const label =
    result.outcome === "pass"
      ? "PASS – simuliertes Event erfüllt den Validator."
      : result.outcome === "near-miss"
        ? "NEAR MISS – Event ist relevant, erfüllt den Validator aber noch nicht."
        : "IGNORE – Event ist für diesen Validator nicht relevant.";

  return (
    <div className="rounded-lg border border-border bg-background p-3 text-sm">
      <p className="font-medium">{label}</p>
      {result.message ? <p className="mt-1 text-muted-foreground">{result.message}</p> : null}
      {result.details ? (
        <pre className="mt-2 max-w-full overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(result.details, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
