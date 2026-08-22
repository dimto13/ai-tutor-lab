import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Clipboard, Lightbulb } from "lucide-react";
import { AccountMenu } from "@/auth/AccountMenu";
import {
  evaluateUseCaseGuidance,
  formatTaskDraft,
  type UseCaseGuidanceResult,
} from "@/domain/useCaseGuidance";

export const Route = createFileRoute("/einsatzbereiche")({
  head: () => ({
    meta: [
      { title: "Eigenes Vorhaben einordnen – AI Training Lab" },
      {
        name: "description",
        content:
          "Eigenes KI-Vorhaben lokal einordnen, passenden Arbeitsauftrag strukturieren und Voraussetzungen prüfen.",
      },
    ],
  }),
  component: UseCaseGuidancePage,
});

const examples = [
  "Ich möchte Softwareänderungen mit KI vorbereiten und anschließend im Repository testen.",
  "Ich möchte neue regulatorische Anforderungen recherchieren und die Quellen belastbar prüfen.",
  "Ich möchte aus Besprechungsnotizen einen strukturierten Bericht für mein Team erstellen.",
];

function UseCaseGuidancePage() {
  const [goal, setGoal] = useState("");
  const [tools, setTools] = useState("");
  const [constraints, setConstraints] = useState("");
  const [result, setResult] = useState<UseCaseGuidanceResult | null>(null);
  const [copied, setCopied] = useState(false);

  function classify() {
    setCopied(false);
    setResult(evaluateUseCaseGuidance({ goal, tools, constraints }));
  }

  async function copyDraft() {
    if (result?.kind !== "recommendation") return;
    await navigator.clipboard.writeText(formatTaskDraft(result.recommendation.taskDraft));
    setCopied(true);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <div className="ml-auto">
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Weitere Einsatzbereiche</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Eigenes Vorhaben einordnen
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Beschreibe dein gewünschtes Arbeitsergebnis, die heute genutzten Werkzeuge und wichtige Vorgaben. Die Einordnung läuft ausschließlich lokal im Browser und wird nicht gespeichert oder an einen Dienst übertragen.
          </p>
        </div>

        <section className="mt-8 rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="describe-heading">
          <h2 id="describe-heading" className="text-base font-semibold text-foreground">
            1. Vorhaben beschreiben
          </h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-1.5 text-sm text-foreground">
              Gewünschtes Arbeitsergebnis
              <textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                rows={4}
                placeholder="Zum Beispiel: Kundenanfragen aus Outlook zusammenfassen und einen Antwortentwurf vorbereiten."
                className="min-h-28 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-foreground">
              Werkzeuge oder Systeme heute
              <input
                value={tools}
                onChange={(event) => setTools(event.target.value)}
                placeholder="Zum Beispiel: Outlook, Word, VS Code"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-foreground">
              Wichtige Vorgaben
              <input
                value={constraints}
                onChange={(event) => setConstraints(event.target.value)}
                placeholder="Zum Beispiel: nur freigegebene Systeme, keine Kundendaten extern"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          <div className="mt-5">
            <p className="text-xs text-muted-foreground">Beispiele als Startpunkt</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setGoal(example)}
                  className="rounded-md border border-border px-3 py-2 text-left text-xs text-foreground hover:border-ring hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={classify}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Lightbulb className="h-4 w-4" /> Vorhaben einordnen
          </button>
        </section>

        {result?.kind === "clarify" ? (
          <section className="mt-6 rounded-xl border border-accent/40 bg-accent/10 p-5" aria-live="polite">
            <h2 className="text-base font-semibold text-foreground">Noch eine Angabe fehlt</h2>
            <p className="mt-2 text-sm text-foreground">{result.question}</p>
          </section>
        ) : null}

        {result?.kind === "recommendation" ? (
          <section className="mt-8" aria-live="polite" aria-labelledby="result-heading">
            <h2 id="result-heading" className="text-xl font-semibold text-foreground">
              2. Empfehlung
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {result.recommendation.title}: {result.recommendation.rationale}
            </p>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <ResultCard title="Werkzeug-Empfehlung">
                <ul className="space-y-2">
                  {result.recommendation.modules.map((module) => (
                    <li key={module.scenarioId}>
                      <Link
                        to="/training/$scenarioId"
                        params={{ scenarioId: module.scenarioId }}
                        className="text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {module.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </ResultCard>

              <ResultCard title="Auftragsentwurf">
                <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground">
                  {formatTaskDraft(result.recommendation.taskDraft)}
                </pre>
                <button
                  type="button"
                  onClick={copyDraft}
                  className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                  {copied ? "Kopiert" : "Auftrag kopieren"}
                </button>
              </ResultCard>

              <ResultCard title="Vorher klären">
                <ul className="space-y-2 text-xs leading-relaxed text-foreground">
                  {result.recommendation.checklist.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden="true">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </ResultCard>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function ResultCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </article>
  );
}
