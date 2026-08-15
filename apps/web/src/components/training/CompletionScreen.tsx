import { Link } from "@tanstack/react-router";
import { Award, RotateCcw, ArrowRight, LayoutGrid, CheckCircle2, ExternalLink } from "lucide-react";
import { SCORE_MODE_MULTIPLIER } from "@ai-train-lab/training-engine";
import { useTraining } from "@/state/trainingStore";
import { FeedbackCapture } from "@/components/feedback/FeedbackCapture";
import { useScenarioScoreAward } from "@/scoring/useScenarioScoreAward";

export function CompletionScreen() {
  const { scenario, mode, progress, restart } = useTraining();
  const score = useScenarioScoreAward(scenario.id, mode, progress.finishedAt);
  const minutes = Math.max(
    1,
    Math.round((((progress.finishedAt ?? Date.now()) - progress.startedAt) / 60000) * 10) / 10,
  );
  const unitLabel =
    mode === "explore" ? "Erkundung" : mode === "challenge" ? "Challenge" : "Schritte";
  const unitValue =
    mode === "explore"
      ? `${progress.exploredTargets.length} Bereiche`
      : mode === "challenge"
        ? "erfüllt"
        : `${scenario.steps.length} von ${scenario.steps.length}`;
  const pointsValue =
    score.status === "ready" && score.result
      ? score.result.created
        ? String(score.result.event.points)
        : "0 neu"
      : score.status === "pending"
        ? "wird geprüft"
        : score.status === "error"
          ? "ausstehend"
          : "—";

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-background p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
          <Award className="h-7 w-7 text-success" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
          Training abgeschlossen
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{scenario.title}</p>

        <dl className="mt-6 grid grid-cols-4 gap-3 text-left">
          {[
            { label: unitLabel, value: unitValue },
            { label: "Dauer", value: `${minutes} Min.` },
            { label: "Modus", value: `${mode} ×${SCORE_MODE_MULTIPLIER[mode]}` },
            { label: "Punkte", value: pointsValue },
          ].map((metric) => (
            <div key={metric.label} className="rounded-lg border border-border bg-panel p-3">
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {metric.label}
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{metric.value}</dd>
            </div>
          ))}
          <div className="col-span-2 rounded-lg border border-border bg-panel p-3">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Hinweise</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{progress.hintsUsed}</dd>
          </div>
          <div className="col-span-2 rounded-lg border border-border bg-panel p-3">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Fehlversuche
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{progress.mistakes}</dd>
          </div>
        </dl>

        {score.status === "ready" && score.result ? (
          <div className="mt-4 rounded-xl border border-border bg-panel p-4 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Serverwertung · Szenario-Version {score.result.event.scenarioVersion}
            </p>
            {score.result.created ? (
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                Basis {score.result.event.breakdown.basePoints} + Bonus{" "}
                {score.result.event.breakdown.bonusPoints} − Hinweisabzug{" "}
                {score.result.event.breakdown.bonusDeductionPoints}, anschließend ×
                {score.result.event.breakdown.modeMultiplier}. Vergeben:{" "}
                <span className="font-medium text-foreground">
                  {score.result.event.points} Punkte
                </span>
                .
              </p>
            ) : (
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                Diese Szenario-Version wurde bereits gewertet. Der aktuelle Durchlauf bleibt als
                Übung möglich, erzeugt aber keine weiteren Punkte. Das bestehende Ledger-Ereignis
                bleibt unverändert bei {score.result.event.points} Punkten.
              </p>
            )}
          </div>
        ) : null}

        {score.status === "pending" ? (
          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
            Der Abschluss wird serverseitig geprüft und dem Punkte-Ledger zugeordnet.
          </p>
        ) : null}

        {score.status === "error" ? (
          <div className="mt-4 rounded-xl border border-border bg-panel p-4 text-left">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Der Trainingabschluss ist gespeichert, die Serverwertung konnte aber noch nicht
              bestätigt werden. Es werden keine lokalen Ersatzpunkte berechnet.
            </p>
            <button
              type="button"
              onClick={score.retry}
              className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-ring"
            >
              Serverwertung erneut prüfen
            </button>
          </div>
        ) : null}

        {score.status === "unavailable" ? (
          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
            Im lokalen Trainingsmodus werden bewusst keine autoritativen Punkte vergeben.
          </p>
        ) : null}

        {mode === "challenge" && scenario.solutionComparison?.length ? (
          <div className="mt-6 rounded-xl border border-border bg-panel p-4 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Lösungsvergleich
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Dein Klickweg durfte frei sein. Ein möglicher sauberer Lösungsweg sieht so aus:
            </p>
            <ol className="mt-3 space-y-2">
              {scenario.solutionComparison.map((item) => (
                <li key={item} className="flex gap-2 text-[13px] leading-relaxed text-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {scenario.resources?.length ? (
          <div className="mt-6 rounded-xl border border-border bg-panel p-4 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Weiterführende Quellen
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Diese Links werden als Content-Metadaten gepflegt und können unabhängig von der
              Oberfläche aktualisiert werden.
            </p>
            <ul className="mt-3 space-y-2">
              {scenario.resources.map((resource) => (
                <li key={resource.url}>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-ring"
                  >
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>
                      <span className="block text-[13px] font-medium text-foreground">
                        {resource.title}
                      </span>
                      {resource.description ? (
                        <span className="mt-1 block text-[12px] leading-relaxed text-muted-foreground">
                          {resource.description}
                        </span>
                      ) : null}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-4">
          <p className="text-sm font-medium text-foreground">War dieses Training verständlich?</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Dein Feedback wird mit dem Trainingskontext gespeichert, ohne deinen Abschluss zu
            verändern.
          </p>
          <div className="mt-3 flex justify-center">
            <FeedbackCapture source="completion" triggerLabel="Feedback zum Training geben" />
          </div>
        </div>

        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <button
            onClick={restart}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            <RotateCcw className="h-4 w-4" /> Training erneut starten
          </button>
          <button
            disabled
            title="Im POC noch nicht verfügbar"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-foreground opacity-50"
          >
            Nächstes Modul <ArrowRight className="h-4 w-4" />
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:border-ring hover:bg-white/5"
          >
            <LayoutGrid className="h-4 w-4" /> Zur Übersicht
          </Link>
        </div>
      </div>
    </div>
  );
}
