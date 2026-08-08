import { Link } from "@tanstack/react-router";
import { Award, RotateCcw, ArrowRight, LayoutGrid } from "lucide-react";
import { useTraining } from "@/state/trainingStore";

export function CompletionScreen() {
  const { scenario, progress, restart } = useTraining();
  const minutes = Math.max(
    1,
    Math.round((((progress.finishedAt ?? Date.now()) - progress.startedAt) / 60000) * 10) / 10,
  );

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-8">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
          <Award className="h-7 w-7 text-success" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
          Training abgeschlossen
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{scenario.title}</p>

        <dl className="mt-6 grid grid-cols-3 gap-3 text-left">
          {[
            { label: "Schritte", value: `${scenario.steps.length} von ${scenario.steps.length}` },
            { label: "Dauer", value: `${minutes} Min.` },
            { label: "Hinweise", value: String(progress.hintsUsed) },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border border-border bg-panel p-3">
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {m.label}
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{m.value}</dd>
            </div>
          ))}
          <div className="col-span-3 rounded-lg border border-border bg-panel p-3">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Fehlversuche
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{progress.mistakes}</dd>
          </div>
        </dl>

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
