import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Database, Download, GraduationCap, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AccountMenu } from "@/auth/AccountMenu";
import { useAuth } from "@/auth/AuthContext";
import {
  dataCategories,
  downloadOwnDataExport,
  loadMyDataTransparencyContext,
  type DataTransparencyContext,
} from "@/data-transparency/userDataTransparency";
import { useUserPreferences } from "@/profile/UserPreferencesContext";
import { useUserProfile } from "@/profile/UserProfileContext";

export const Route = createFileRoute("/datentransparenz")({
  head: () => ({
    meta: [
      { title: "Meine gespeicherten Daten – AI Training Lab" },
      {
        name: "description",
        content: "Transparenz über gespeicherte Daten, Sichtbarkeit und Aufbewahrung.",
      },
    ],
  }),
  component: DataTransparencyPage,
});

function scoreVisibilityLabel(context: DataTransparencyContext): string {
  if (context.storageMode === "browser-local") return "Lokaler Modus";
  if (context.scoreVisibility === "private") return "Punkte: privat";
  if (context.scoreVisibility === "aggregate") return "Punkte: aggregiert ab n=5";
  return context.namedApprovalConfirmed ? "Punkte: namentlich freigegeben" : "Punkte: gesperrt";
}

function DataTransparencyPage() {
  const auth = useAuth();
  const profile = useUserProfile();
  const preferences = useUserPreferences();
  const [context, setContext] = useState<DataTransparencyContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const identity = auth.session?.identity ?? null;

  useEffect(() => {
    let active = true;
    void loadMyDataTransparencyContext()
      .then((loaded) => {
        if (!active) return;
        setContext(loaded);
        setContextError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setContext(null);
        setContextError(
          cause instanceof Error
            ? cause.message
            : "Die aktuelle Sichtbarkeits- und Aufbewahrungspolicy konnte nicht geladen werden.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => (context ? dataCategories(context) : []), [context]);

  async function exportOwnData() {
    if (!identity) {
      setExportStatus("Eigendatenexport erfordert eine aktive Anmeldung.");
      return;
    }
    setExporting(true);
    setExportStatus(null);
    try {
      await downloadOwnDataExport({
        identity,
        profile: profile.profile,
        preferences: preferences.preferences,
      });
      setExportStatus("Dein Eigendatenexport wurde als JSON-Datei erstellt.");
    } catch (cause) {
      setExportStatus(
        cause instanceof Error ? cause.message : "Der Eigendatenexport konnte nicht erstellt werden.",
      );
    } finally {
      setExporting(false);
    }
  }

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

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Meine Trainings
        </Link>

        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                Datentransparenz
              </p>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Diese Daten werden über mich gespeichert
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Die Angaben unten beschreiben die tatsächlich vorhandenen Produktdaten, ihre
              Speicherorte, die technisch vorgesehenen Empfänger und die derzeit implementierten
              Aufbewahrungs- oder Löschregeln. Wo keine automatische Löschfrist existiert, steht das
              ausdrücklich dabei.
            </p>
          </div>

          <section
            aria-labelledby="own-data-export-title"
            className="w-full rounded-xl border border-border bg-panel p-4 lg:max-w-sm"
          >
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <div>
                <h2 id="own-data-export-title" className="text-sm font-semibold text-foreground">
                  Eigene Daten exportieren
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Der Cloud-Export wird serverseitig ausschließlich für deinen angemeldeten Nutzer
                  und Tenant erzeugt. Subject-gescopte Browserdaten werden lokal ergänzt. Tokens und
                  nicht personenbezogene Tenant-Aggregate werden nicht exportiert.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void exportOwnData()}
              disabled={exporting || !context || !identity}
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {exporting ? "Export wird erstellt …" : "Meine Daten als JSON exportieren"}
            </button>
            {exportStatus ? (
              <p role="status" className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {exportStatus}
              </p>
            ) : null}
          </section>
        </div>

        {contextError ? (
          <div role="alert" className="mt-6 rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
            Die aktuelle Tenant-Policy konnte nicht sicher geladen werden. Deshalb werden keine
            möglicherweise falschen Sichtbarkeits- oder Retention-Angaben angezeigt. {contextError}
          </div>
        ) : null}

        {!context && !contextError ? (
          <p role="status" className="mt-6 text-sm text-muted-foreground">
            Sichtbarkeits- und Aufbewahrungsregeln werden geladen …
          </p>
        ) : null}

        {context ? (
          <>
            <div className="mt-7 flex flex-wrap gap-2" aria-label="Aktueller Datenkontext">
              <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs text-foreground">
                {context.storageMode === "cloud" ? "Speichermodus: Cloud" : "Speichermodus: Browser lokal"}
              </span>
              <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs text-foreground">
                {scoreVisibilityLabel(context)}
              </span>
              {context.rawTelemetryRetentionDays !== null ? (
                <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs text-foreground">
                  Rohtelemetrie: {context.rawTelemetryRetentionDays} Tage
                </span>
              ) : null}
            </div>

            <div data-testid="data-transparency-categories" className="mt-6 grid gap-4 lg:grid-cols-2">
              {categories.map((category) => (
                <section
                  key={category.id}
                  data-category={category.id}
                  aria-labelledby={`data-category-${category.id}`}
                  className="rounded-xl border border-border bg-panel p-5"
                >
                  <h2 id={`data-category-${category.id}`} className="text-base font-semibold text-foreground">
                    {category.title}
                  </h2>
                  <dl className="mt-4 space-y-4 text-sm">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Was wird gespeichert?
                      </dt>
                      <dd className="mt-1 leading-relaxed text-foreground">{category.stored}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Wo?
                      </dt>
                      <dd className="mt-1 leading-relaxed text-foreground">{category.storage}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Wer kann es sehen?
                      </dt>
                      <dd className="mt-1 leading-relaxed text-foreground">{category.recipients}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Aufbewahrung / Löschung
                      </dt>
                      <dd className="mt-1 leading-relaxed text-foreground">{category.retention}</dd>
                    </div>
                  </dl>
                </section>
              ))}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
