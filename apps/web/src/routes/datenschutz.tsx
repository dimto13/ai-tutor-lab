import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, GraduationCap, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({
    meta: [
      { title: "Datenschutz – AI Training Lab" },
      {
        name: "description",
        content: "Datenschutzhinweise für die geschlossene AI Training Lab Beta.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
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
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Geschlossene Beta
            </p>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Datenschutzerklärung
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Stand: 21. September 2026
          </p>

          <div className="mt-7 space-y-7 text-sm leading-relaxed text-foreground">
            <section aria-labelledby="privacy-controller">
              <h2 id="privacy-controller" className="text-base font-semibold">
                1. Verantwortlicher und Datenschutzkontakt
              </h2>
              <p className="mt-2 text-muted-foreground">
                Tobias Freudling, Einzelunternehmen, Leopoldstraße 143, 80804 München,
                Deutschland. Datenschutzanfragen:{" "}
                <a
                  className="underline underline-offset-4"
                  href="mailto:dimto@online.de"
                >
                  dimto@online.de
                </a>
                . Ein Datenschutzbeauftragter ist derzeit nicht benannt.
              </p>
            </section>

            <section aria-labelledby="privacy-beta">
              <h2 id="privacy-beta" className="text-base font-semibold">
                2. Geschlossene Beta
              </h2>
              <p className="mt-2 text-muted-foreground">
                AI Training Lab ist eine kleine geschlossene Testphase. Die Teilnahme ist
                freiwillig und nur für freigeschaltete Tester möglich. Bitte gib in
                Tutor-Fragen und Feedback keine vertraulichen Daten oder personenbezogenen
                Daten Dritter ein. Feedback wird zur Fehleranalyse und Produktverbesserung
                ausgewertet.
              </p>
            </section>

            <section aria-labelledby="privacy-processing">
              <h2 id="privacy-processing" className="text-base font-semibold">
                3. Verarbeitungen und Rechtsgrundlagen
              </h2>
              <p className="mt-2 text-muted-foreground">
                Auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO verarbeiten wir die für Konto
                und Anmeldung, Beta-Zugang, Training, Fortschritt, Punkte und Nachweise, den
                KI-Tutor sowie die technisch notwendige Nutzung der Plattform erforderlichen
                Daten.
              </p>
              <p className="mt-2 text-muted-foreground">
                Auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO verarbeiten wir pseudonymisierte
                Nutzungs- und Lernstatistik, freiwilliges Beta-Feedback, Betriebs-,
                Sicherheits- und Fehlerprotokolle sowie Owner/Admin-Monitoring einschließlich
                Login-IP-Adresse und User-Agent. Die berechtigten Interessen sind auf
                Betriebssicherheit, Missbrauchsschutz, Fehlersuche und Verbesserung der
                geschlossenen Beta begrenzt. Werbeprofile oder
                Drittanbieter-Werbe-/Tracking-Nutzung finden nicht statt.
              </p>
            </section>

            <section aria-labelledby="privacy-infrastructure">
              <h2 id="privacy-infrastructure" className="text-base font-semibold">
                4. Hosting, Empfänger und USA
              </h2>
              <p className="mt-2 text-muted-foreground">
                Die Plattform nutzt Amazon Web Services (AWS) als Auftragsverarbeiter und
                Cloud-Infrastruktur in der Region us-east-1 (USA). Für notwendige
                Drittlandübermittlungen stützen wir uns auf das AWS Data Processing Addendum
                einschließlich der darin eingebundenen EU-Standardvertragsklauseln (SCCs).
              </p>
              <p className="mt-2 text-muted-foreground">
                Der KI-Tutor wird in der geschlossenen Beta ausschließlich über lokale Modelle
                auf eigener Anbieter-Hardware ausgeführt; es gibt dabei keinen externen
                Cloud-KI-Empfänger. Die technische Vermittlung erfolgt über AWS Lambda und
                Systems Manager zur Anbieter-Hardware. Tutor-Frage- und Antworttexte werden
                nicht in den Betriebsprotokollen gespeichert.
              </p>
            </section>

            <section aria-labelledby="privacy-storage">
              <h2 id="privacy-storage" className="text-base font-semibold">
                5. Speicherdauer
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  Konto- und Trainingsdaten: bis zur Kontolöschung, spätestens 30 Tage nach
                  Ende der Beta.
                </li>
                <li>Beta-Allowlist: bis zum Ende der Beta.</li>
                <li>Nutzungs-/Lernstatistik: 90 Tage.</li>
                <li>Beta-Feedback: 90 Tage.</li>
                <li>CloudWatch-/Tutor-Logs: 30 Tage.</li>
              </ul>
              <p className="mt-2 text-muted-foreground">
                Technisch notwendige Anmelde- und Trainingszustände können außerdem auf deinem
                Endgerät im Browser gespeichert werden.
              </p>
            </section>

            <section aria-labelledby="privacy-monitoring">
              <h2 id="privacy-monitoring" className="text-base font-semibold">
                6. Betrieb und Monitoring
              </h2>
              <p className="mt-2 text-muted-foreground">
                Owner/Admin-Monitoring ist internes Betriebswerkzeug, kein Nutzerfeature. Es
                dient ausschließlich Betrieb, Sicherheit, Fehleranalyse und Betreuung der
                geschlossenen Beta und kann Kontoaktivität sowie Login-IP-Adresse und
                User-Agent aus Betriebsdaten einbeziehen.
              </p>
            </section>

            <section aria-labelledby="privacy-rights">
              <h2 id="privacy-rights" className="text-base font-semibold">
                7. Deine Rechte
              </h2>
              <p className="mt-2 text-muted-foreground">
                Du kannst Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
                Datenübertragbarkeit und Widerspruch im Rahmen der gesetzlichen Voraussetzungen
                verlangen. Unter{" "}
                <Link to="/datentransparenz" className="underline underline-offset-4">
                  Meine Daten
                </Link>{" "}
                kannst du deine Daten einsehen und exportieren. Die Kontolöschung steht nach
                Live-Abnahme des Self-Service-Wegs dort bereit; bis dahin wende dich an den
                Datenschutzkontakt. Beschwerden kannst du an das Bayerische Landesamt für
                Datenschutzaufsicht (BayLDA) richten.
              </p>
            </section>

            <section aria-labelledby="privacy-review">
              <h2 id="privacy-review" className="text-base font-semibold">
                8. Änderungen des Datenflusses
              </h2>
              <p className="mt-2 text-muted-foreground">
                Materielle Änderungen an Empfängern, AWS-Region, Tutor-/Modellroute, erhobenen
                Daten oder Speicherfristen werden vor einem Deploy erneut geprüft und die
                nutzerseitigen Datenschutzinformationen entsprechend aktualisiert. Vor einem
                öffentlichen oder kommerziellen Rollout erfolgt ebenfalls eine erneute Prüfung.
              </p>
            </section>
          </div>
        </article>
        <nav
          aria-label="Rechtliche Informationen"
          className="mt-5 flex flex-wrap gap-4 text-sm"
        >
          <Link to="/impressum" className="underline underline-offset-4">
            Impressum
          </Link>
          <Link to="/datentransparenz" className="underline underline-offset-4">
            Meine Daten
          </Link>
        </nav>
      </main>
    </div>
  );
}
