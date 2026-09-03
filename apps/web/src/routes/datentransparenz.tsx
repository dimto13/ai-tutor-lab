import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Database, Download, GraduationCap, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountMenu } from "@/auth/AccountMenu";
import { useAuth } from "@/auth/AuthContext";
import {
  dataCategories,
  downloadOwnDataExport,
  loadMyDataTransparencyContext,
  type DataStorageMode,
  type DataTransparencyContext,
} from "@/data-transparency/userDataTransparency";
import { userFacingError, userFacingErrorMessage, type UserFacingError } from "@/errors/userFacingError";
import { useLanguage } from "@/i18n/LanguageContext";
import { useUserPreferences } from "@/profile/UserPreferencesContext";
import { useUserProfile } from "@/profile/UserProfileContext";

export const Route = createFileRoute("/datentransparenz")({ component: DataTransparencyPage });

function configuredStorageMode(): DataStorageMode {
  const authMode = import.meta.env["VITE_AUTH_MODE"]?.trim().toLowerCase();
  if (authMode === "local") return "browser-local";
  if (authMode === "cognito") return "cloud";
  return import.meta.env.PROD ? "cloud" : "browser-local";
}

function policyIndependentCategories() {
  return dataCategories({
    storageMode: configuredStorageMode(),
    scoreVisibility: "private",
    leaderboardsEnabled: false,
    namedApprovalConfirmed: false,
    rawTelemetryRetentionDays: null,
    telemetryPseudonymizationMode: null,
  }).filter((category) => category.id !== "scores" && category.id !== "telemetry");
}

function DataTransparencyPage() {
  const auth = useAuth();
  const profile = useUserProfile();
  const preferences = useUserPreferences();
  const { language } = useLanguage();
  const [context, setContext] = useState<DataTransparencyContext | null>(null);
  const [contextError, setContextError] = useState<UserFacingError | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const identity = auth.session?.identity ?? null;

  const loadContext = useCallback(async () => {
    setContextError(null);
    try {
      setContext(await loadMyDataTransparencyContext());
    } catch (cause) {
      console.error("Data transparency context load failed", cause);
      setContext(null);
      setContextError(userFacingError(cause));
    }
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const categories = useMemo(() => {
    if (context) return dataCategories(context);
    if (contextError) return policyIndependentCategories();
    return [];
  }, [context, contextError]);

  async function exportOwnData() {
    if (!identity) return;
    setExporting(true);
    setExportStatus(null);
    try {
      await downloadOwnDataExport({ identity, profile: profile.profile, preferences: preferences.preferences });
      setExportStatus(language === "en" ? "Your data export was created as a JSON file." : "Dein Eigendatenexport wurde als JSON-Datei erstellt.");
    } catch (cause) {
      console.error("Own-data export failed", cause);
      setExportStatus(userFacingErrorMessage(userFacingError(cause), language, "export"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <GraduationCap className="h-5 w-5 text-accent" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-foreground">AI Training Lab</span>
          <div className="ml-auto min-w-0"><AccountMenu compact /></div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Link to="/" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {language === "en" ? "My training" : "Meine Trainings"}
        </Link>
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" /><p className="text-xs font-semibold uppercase tracking-wide text-accent">{language === "en" ? "Data transparency" : "Datentransparenz"}</p></div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{language === "en" ? "Data stored about me" : "Diese Daten werden über mich gespeichert"}</h1>
          </div>
          <section aria-labelledby="own-data-export-title" className="w-full rounded-xl border border-border bg-panel p-4 lg:max-w-sm">
            <div className="flex items-start gap-3"><Database className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" /><div><h2 id="own-data-export-title" className="text-sm font-semibold text-foreground">{language === "en" ? "Export my data" : "Eigene Daten exportieren"}</h2></div></div>
            <button type="button" onClick={() => void exportOwnData()} disabled={exporting || !identity} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Download className="h-4 w-4" aria-hidden="true" />{exporting ? (language === "en" ? "Creating export …" : "Export wird erstellt …") : (language === "en" ? "Export my data as JSON" : "Meine Daten als JSON exportieren")}
            </button>
            {exportStatus ? <p role="status" aria-live="polite" className="mt-2 text-xs leading-relaxed text-muted-foreground">{exportStatus}</p> : null}
          </section>
        </div>
        {contextError ? (
          <div role="alert" className="mt-6 rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
            <p>{userFacingErrorMessage(contextError, language, "read")}</p>
            <p className="mt-1 text-xs">{language === "en" ? "No data was changed. Policy-dependent details remain hidden until they can be loaded safely." : "Es wurden keine Daten verändert. Policyabhängige Angaben bleiben ausgeblendet, bis sie sicher geladen werden können."}</p>
            <button type="button" onClick={() => void loadContext()} className="mt-3 min-h-10 rounded-md border border-current px-3 py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{language === "en" ? "Try again" : "Erneut versuchen"}</button>
          </div>
        ) : null}
        {!context && !contextError ? <p role="status" className="mt-6 text-sm text-muted-foreground">{language === "en" ? "Loading visibility and retention rules …" : "Sichtbarkeits- und Aufbewahrungsregeln werden geladen …"}</p> : null}
        {categories.length > 0 ? <div data-testid="data-transparency-categories" className="mt-6 grid gap-4 lg:grid-cols-2">{categories.map((category) => <section key={category.id} className="rounded-xl border border-border bg-panel p-5"><h2 className="text-base font-semibold text-foreground">{category.title}</h2><p className="mt-2 text-sm text-foreground">{category.stored}</p></section>)}</div> : null}
      </main>
    </div>
  );
}
