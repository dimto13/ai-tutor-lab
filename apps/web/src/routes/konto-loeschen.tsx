import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, GraduationCap, ShieldAlert } from "lucide-react";
import { AccountMenu } from "@/auth/AccountMenu";

export const Route = createFileRoute("/konto-loeschen")({
  head: () => ({
    meta: [
      { title: "Konto löschen – AI Training Lab" },
      {
        name: "description",
        content: "Informationen zum noch nicht aktivierten Kontolöschprozess.",
      },
    ],
  }),
  component: AccountDeletionInformationPage,
});

function AccountDeletionInformationPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <GraduationCap className="h-5 w-5 text-accent" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            AI Training Lab
          </span>
          <div className="ml-auto min-w-0">
            <AccountMenu compact />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Meine Trainings
        </Link>

        <section className="mt-6 rounded-xl border border-border bg-panel p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15">
              <ShieldAlert className="h-5 w-5 text-accent" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                Konto und gespeicherte Daten
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                Konto löschen
              </h1>
            </div>
          </div>

          <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              Eine Self-Service-Kontolöschung ist in der aktuellen Beta nicht aktiviert. Das Öffnen
              dieser Seite oder des Menüeintrags löscht weder dein Konto noch Trainingsdaten,
              Punkte, Telemetrie, Feedback oder Nachweise.
            </p>
            <p>
              Eine spätere Löschung muss die unterschiedlichen Datenbereiche und ihre jeweils
              geltenden Aufbewahrungs- und Löschregeln gemeinsam berücksichtigen. Deshalb gibt es
              hier bewusst keinen Ein-Klick-Löschvorgang.
            </p>
            <p>
              Welche Daten aktuell über dich gespeichert werden, wo sie liegen und welche
              Löschregeln bereits technisch umgesetzt sind, kannst du in der Transparenzansicht
              prüfen.
            </p>
          </div>

          <Link
            to="/datentransparenz"
            className="mt-6 inline-flex min-h-10 items-center rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-ring hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Meine gespeicherten Daten ansehen
          </Link>
        </section>
      </main>
    </div>
  );
}
