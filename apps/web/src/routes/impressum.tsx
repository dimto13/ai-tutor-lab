import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/impressum")({
  head: () => ({
    meta: [
      { title: "Impressum – AI Training Lab" },
      {
        name: "description",
        content: "Anbieterkennzeichnung für AI Training Lab.",
      },
    ],
  }),
  component: ImprintPage,
});

function ImprintPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <GraduationCap className="h-5 w-5 text-accent" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            AI Training Lab
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Zur Plattform
        </Link>
        <article className="mt-6 rounded-xl border border-border bg-panel p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            Anbieterkennzeichnung
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Impressum
          </h1>
          <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground">
            <section aria-labelledby="provider-title">
              <h2 id="provider-title" className="font-semibold">
                Anbieter
              </h2>
              <address className="mt-2 not-italic text-muted-foreground">
                Tobias Freudling
                <br />
                Einzelunternehmen
                <br />
                Leopoldstraße 143
                <br />
                80804 München
                <br />
                Deutschland
              </address>
            </section>
            <section aria-labelledby="contact-title">
              <h2 id="contact-title" className="font-semibold">
                Kontakt
              </h2>
              <p className="mt-2 text-muted-foreground">
                E-Mail:{" "}
                <a
                  className="underline underline-offset-4"
                  href="mailto:dimto@online.de"
                >
                  dimto@online.de
                </a>
              </p>
            </section>
          </div>
        </article>
        <nav
          aria-label="Rechtliche Informationen"
          className="mt-5 flex flex-wrap gap-4 text-sm"
        >
          <Link to="/datenschutz" className="underline underline-offset-4">
            Datenschutz
          </Link>
          <Link to="/datentransparenz" className="underline underline-offset-4">
            Meine Daten
          </Link>
        </nav>
      </main>
    </div>
  );
}
