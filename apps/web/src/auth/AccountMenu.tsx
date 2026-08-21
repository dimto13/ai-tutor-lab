import {
  ChevronDown,
  Database,
  Eye,
  EyeOff,
  Gauge,
  LogOut,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SelfAssessedAiLevel } from "@ai-train-lab/training-engine";
import { useAuth } from "./AuthContext";
import { maskEmailAddress } from "./emailPrivacy";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  loadMyDataTransparencyContext,
  type DataTransparencyContext,
} from "@/data-transparency/userDataTransparency";
import { AI_LEVEL_OPTIONS, aiLevelLabel } from "@/profile/aiLevelOptions";
import { contentRecommendationForAiLevel } from "@/profile/aiLevelRecommendation";
import { useUserPreferences } from "@/profile/UserPreferencesContext";
import { useUserProfile } from "@/profile/UserProfileContext";
import {
  loadAccountScoreSummary,
  type AccountScoreSummary,
} from "@/scoring/accountScoreSummary";

function formatPoints(points: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(points);
}

function scoreVisibilityLabel(context: DataTransparencyContext): string {
  if (context.storageMode === "browser-local") {
    return "Lokaler Modus – keine Tenant-Auswertung";
  }
  if (context.scoreVisibility === "private") {
    return "Privat – nur du siehst deine individuellen Punkte";
  }
  if (context.scoreVisibility === "aggregate") {
    return "Team-Auswertung nur aggregiert ab 5 Personen";
  }
  return context.namedApprovalConfirmed
    ? "Namentliche Tenant-Auswertung ist dokumentiert freigegeben"
    : "Namentliche Tenant-Auswertung ist gesperrt";
}

function scoreValue(summary: AccountScoreSummary | null): string {
  if (!summary) return "…";
  if (summary.kind === "unavailable") return "Nicht verfügbar";
  if (summary.kind === "lower-bound") return `≥ ${formatPoints(summary.points)} SP`;
  return `${formatPoints(summary.points)} SP`;
}

function scoreDetail(summary: AccountScoreSummary | null): string {
  if (!summary) return "Dein persönlicher Punktestand wird geladen.";
  if (summary.kind === "unavailable") {
    return "Im lokalen Entwicklungsmodus gibt es keinen serverautoritativen persönlichen Punktestand.";
  }
  if (summary.kind === "lower-bound") {
    return `Mindestens ${formatPoints(summary.points)} SP aus den neuesten ${summary.eventCount} Score-Ereignissen. Eine exakte Gesamtsumme wird nicht behauptet, solange der Ledger-Read begrenzt ist.`;
  }
  return `${summary.eventCount} serverbestätigte Score-Ereignisse sind in dieser Summe enthalten.`;
}

function languageLabel(language: string | null | undefined): string {
  const normalized = language?.trim().toLowerCase();
  if (!normalized || normalized === "de" || normalized.startsWith("de-")) return "Deutsch";
  return language?.trim() || "Deutsch";
}

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const profile = useUserProfile();
  const preferences = useUserPreferences();
  const identity = auth.session?.identity ?? null;
  const identityUserId = identity?.userId ?? null;
  const identityTenantId = identity?.tenantId ?? null;
  const effectiveAiLevel =
    preferences.status === "ready" ? (preferences.selfAssessedAiLevel ?? "beginner") : null;
  const effectiveAiLevelLabel = effectiveAiLevel ? aiLevelLabel(effectiveAiLevel) : null;
  const aiLevelNavigationValue =
    effectiveAiLevelLabel ?? (preferences.status === "error" ? "nicht verfügbar" : "…");
  const aiLevelNavigationLabel = effectiveAiLevelLabel
    ? `Eigene KI-Erfahrung (Selbsteinschätzung): ${effectiveAiLevelLabel}. Ändern`
    : preferences.status === "error"
      ? "Eigene KI-Erfahrung (Selbsteinschätzung): derzeit nicht verfügbar"
      : "Eigene KI-Erfahrung (Selbsteinschätzung) wird geladen";
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftName, setDraftName] = useState(profile.displayName);
  const [draftAiLevel, setDraftAiLevel] = useState<SelfAssessedAiLevel | null>(
    preferences.selfAssessedAiLevel,
  );
  const [emailVisible, setEmailVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [scoreSummary, setScoreSummary] = useState<AccountScoreSummary | null>(null);
  const [scoreContext, setScoreContext] = useState<DataTransparencyContext | null>(null);
  const [scoreError, setScoreError] = useState(false);
  const aiLevelInputRef = useRef<HTMLInputElement | null>(null);
  const focusAiLevelOnOpenRef = useRef(false);
  const settingsReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const settingsCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  const closeSettings = useCallback(() => {
    const returnFocusTo = settingsReturnFocusRef.current;
    setEmailVisible(false);
    setSettingsOpen(false);
    focusAiLevelOnOpenRef.current = false;
    settingsReturnFocusRef.current = null;
    window.requestAnimationFrame(() => returnFocusTo?.focus());
  }, []);

  useEffect(() => {
    if (!settingsOpen) {
      setDraftName(profile.displayName);
      setDraftAiLevel(preferences.selfAssessedAiLevel);
      setEmailVisible(false);
    }
  }, [preferences.selfAssessedAiLevel, profile.displayName, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;

    const animationFrame = window.requestAnimationFrame(() => {
      if (focusAiLevelOnOpenRef.current) {
        aiLevelInputRef.current?.focus();
        focusAiLevelOnOpenRef.current = false;
        return;
      }
      settingsCloseButtonRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSettings();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSettings, settingsOpen]);

  useEffect(() => {
    if (auth.status !== "authenticated" || !identityUserId) {
      setScoreSummary(null);
      setScoreContext(null);
      setScoreError(false);
      return;
    }

    let active = true;
    setScoreSummary(null);
    setScoreContext(null);
    setScoreError(false);

    void Promise.all([loadAccountScoreSummary(), loadMyDataTransparencyContext()])
      .then(([summary, context]) => {
        if (!active) return;
        setScoreSummary(summary);
        setScoreContext(context);
      })
      .catch(() => {
        if (!active) return;
        setScoreSummary(null);
        setScoreContext(null);
        setScoreError(true);
      });

    return () => {
      active = false;
    };
  }, [auth.status, identityTenantId, identityUserId]);

  const email = identity?.email ?? null;
  const displayedEmail = email ? (emailVisible ? email : maskEmailAddress(email)) : null;
  const draftRecommendation = draftAiLevel ? contentRecommendationForAiLevel(draftAiLevel) : null;
  const identityDisplayName =
    identity?.displayName?.trim() || identity?.email || identity?.userId || "Nicht angemeldet";
  const tenantLabel = !identityTenantId
    ? "Kein Mandant zugeordnet"
    : identityTenantId.startsWith("personal:")
      ? "Persönlicher Bereich"
      : `Mandant: ${identityTenantId}`;
  const currentLanguage = languageLabel(preferences.preferences?.language);

  function openSettings({
    focusAiLevel = false,
    returnFocusTo = null,
  }: {
    focusAiLevel?: boolean;
    returnFocusTo?: HTMLButtonElement | null;
  } = {}) {
    setMenuOpen(false);
    setDraftName(profile.displayName);
    setDraftAiLevel(preferences.selfAssessedAiLevel);
    setEmailVisible(false);
    setSaveError(null);
    focusAiLevelOnOpenRef.current = focusAiLevel;
    settingsReturnFocusRef.current = returnFocusTo;
    setSettingsOpen(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      if (draftName.trim() !== profile.displayName.trim()) {
        await profile.saveDisplayName(draftName);
      }
      if (draftAiLevel && draftAiLevel !== preferences.selfAssessedAiLevel) {
        await preferences.saveSelfAssessedAiLevel(draftAiLevel);
      }
      closeSettings();
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Die Einstellungen konnten nicht gespeichert werden.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!identity) {
    return (
      <span
        data-testid="account-menu-anonymous"
        className="inline-flex h-8 items-center rounded-md border border-border px-2 text-xs text-muted-foreground"
      >
        {auth.status === "loading" ? "Konto wird geladen …" : "Nicht angemeldet"}
      </span>
    );
  }

  return (
    <>
      <div className="flex min-w-0 shrink items-center gap-1.5">
        <button
          type="button"
          data-testid="ai-level-navigation"
          data-platform-ui="ai-level-navigation"
          disabled={!effectiveAiLevel}
          onClick={(event) =>
            openSettings({ focusAiLevel: true, returnFocusTo: event.currentTarget })
          }
          aria-label={aiLevelNavigationLabel}
          title={
            effectiveAiLevelLabel
              ? `Eigene KI-Erfahrung: ${effectiveAiLevelLabel}`
              : aiLevelNavigationValue
          }
          className="inline-flex h-8 min-w-0 shrink items-center justify-center rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:border-ring hover:bg-muted disabled:cursor-default disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
          >
            {compact ? "KI: " : "KI-Level: "}
            {aiLevelNavigationValue}
          </span>
        </button>

        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              ref={menuTriggerRef}
              type="button"
              data-testid="account-menu-trigger"
              aria-label={`Nutzermenü für ${identityDisplayName} öffnen`}
              title="Nutzermenü"
              className="inline-flex h-8 min-w-0 shrink items-center justify-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:border-ring hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span
                className={`${compact ? "hidden 2xl:inline" : "hidden sm:inline"} max-w-40 truncate`}
                aria-hidden="true"
              >
                {identityDisplayName}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            aria-labelledby="account-menu-title"
            data-testid="account-menu-popover"
            className="w-[min(20rem,calc(100vw-1rem))] p-0"
          >
            <div className="border-b border-border p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15">
                  <UserRound className="h-4 w-4 text-accent" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="account-menu-title" className="truncate text-sm font-semibold text-foreground">
                    {identityDisplayName}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={tenantLabel}>
                    {tenantLabel}
                  </p>
                </div>
              </div>
            </div>

            <section aria-labelledby="account-score-title" className="border-b border-border p-4">
              <div className="flex items-start gap-3">
                <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 id="account-score-title" className="text-xs font-semibold text-foreground">
                      Mein Punktestand
                    </h3>
                    <span data-testid="account-score-value" className="text-sm font-semibold text-foreground">
                      {scoreError ? "Nicht verfügbar" : scoreValue(scoreSummary)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {scoreError
                      ? "Punktestand und Sichtbarkeitsregel konnten nicht sicher geladen werden."
                      : scoreDetail(scoreSummary)}
                  </p>
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span data-testid="account-score-visibility">
                      {scoreContext
                        ? scoreVisibilityLabel(scoreContext)
                        : scoreError
                          ? "Sichtbarkeit nicht verfügbar"
                          : "Sichtbarkeit wird geladen …"}
                    </span>
                  </div>
                  <a
                    href="/kompetenz"
                    className="mt-2 inline-flex text-xs font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Kompetenzprofil öffnen
                  </a>
                </div>
              </div>
            </section>

            <div className="p-2">
              <button
                type="button"
                onClick={() =>
                  openSettings({ returnFocusTo: menuTriggerRef.current })
                }
                className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Settings className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">Einstellungen</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    Sprache: {currentLanguage} · KI-Erfahrung: {aiLevelNavigationValue}
                  </span>
                </span>
              </button>
              <a
                href="/datentransparenz"
                className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">Meine Daten</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    Gespeicherte Daten, Empfänger und Aufbewahrung ansehen
                  </span>
                </span>
              </a>
              <a
                href="/datentransparenz#konto-loeschen"
                className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">Konto löschen</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    Informationen zum Löschprozess – keine Sofort-Löschung
                  </span>
                </span>
              </a>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void auth.signOut().catch(() => undefined);
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-xs font-medium text-foreground">Abmelden</span>
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-settings-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-panel p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15">
                <UserRound className="h-4 w-4 text-accent" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="account-settings-title" className="text-base font-semibold text-foreground">
                  Einstellungen
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Kontodaten und Lernpräferenzen für deinen persönlichen Einstieg.
                </p>
              </div>
              <button
                ref={settingsCloseButtonRef}
                type="button"
                onClick={closeSettings}
                aria-label="Einstellungen schließen"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form className="mt-5 space-y-5" onSubmit={handleSave}>
              <section className="rounded-lg border border-border bg-background/35 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Kontodaten
                </h3>

                <label className="mt-3 block">
                  <span className="text-xs font-medium text-foreground">Name</span>
                  <input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    maxLength={80}
                    autoComplete="name"
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Dein Name"
                  />
                </label>

                <div className="mt-4">
                  <span className="text-xs font-medium text-foreground">Mandant</span>
                  <p className="mt-1.5 truncate rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-sm text-muted-foreground">
                    {tenantLabel}
                  </p>
                </div>

                {email ? (
                  <div className="mt-4">
                    <span className="text-xs font-medium text-foreground">E-Mail</span>
                    <div className="mt-1.5 flex items-center gap-2">
                      <p
                        data-testid="account-email"
                        className="min-w-0 flex-1 truncate rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-sm text-muted-foreground"
                        title={displayedEmail ?? undefined}
                      >
                        {displayedEmail}
                      </p>
                      <button
                        type="button"
                        onClick={() => setEmailVisible((visible) => !visible)}
                        aria-label={emailVisible ? "E-Mail verbergen" : "E-Mail anzeigen"}
                        aria-pressed={emailVisible}
                        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:border-ring hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {emailVisible ? (
                          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span className="hidden sm:inline">
                          {emailVisible ? "Verbergen" : "Anzeigen"}
                        </span>
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      Die Adresse stammt aus deiner angemeldeten Identität, ist standardmäßig
                      anonymisiert und wird hier nicht geändert.
                    </p>
                  </div>
                ) : null}
              </section>

              <section className="rounded-lg border border-border bg-background/35 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sprache
                </h3>
                <p className="mt-2 text-sm font-medium text-foreground">{currentLanguage}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Die aktuelle Beta-Oberfläche ist auf Deutsch freigeschaltet. Eine gespeicherte
                  abweichende Sprachpräferenz wird angezeigt, aber nicht als bereits übersetzte
                  Oberfläche ausgegeben.
                </p>
              </section>

              <fieldset className="rounded-lg border border-border bg-background/35 p-4">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  KI-Erfahrung (Selbsteinschätzung)
                </legend>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Deine Selbsteinschätzung beeinflusst Empfehlungen und Erklärungstiefe. Sie ist
                  kein gemessener Kompetenznachweis.
                </p>
                <div className="mt-3 space-y-2">
                  {AI_LEVEL_OPTIONS.map((option) => {
                    const selected = draftAiLevel === option.value;
                    const focusTarget =
                      selected || (!draftAiLevel && option.value === effectiveAiLevel);
                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                          selected
                            ? "border-accent bg-accent/10"
                            : "border-border bg-background/40 hover:border-ring"
                        }`}
                      >
                        <input
                          ref={focusTarget ? aiLevelInputRef : undefined}
                          type="radio"
                          name="self-assessed-ai-level"
                          value={option.value}
                          checked={selected}
                          onChange={() => setDraftAiLevel(option.value)}
                          className="mt-0.5 h-4 w-4 accent-current"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">
                            {option.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                {draftRecommendation ? (
                  <div
                    data-testid="ai-level-recommendation"
                    className="mt-3 rounded-lg border border-accent/40 bg-accent/10 p-3"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                      Empfehlung für deinen Einstieg
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {draftRecommendation.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {draftRecommendation.reason}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Wähle eine Stufe, um eine passende Einstiegsempfehlung zu sehen.
                  </p>
                )}
              </fieldset>

              <section className="rounded-lg border border-border bg-background/35 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Punktesichtbarkeit
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-foreground">
                  {scoreContext
                    ? scoreVisibilityLabel(scoreContext)
                    : scoreError
                      ? "Die aktuelle Sichtbarkeitsregel konnte nicht sicher geladen werden."
                      : "Die aktuelle Sichtbarkeitsregel wird geladen …"}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Diese Stufe ist eine serverseitige Tenant-Regel aus dem Datenschutzvertrag und
                  wird nicht als persönliche Browser-Einstellung überschrieben.
                </p>
              </section>

              <section className="rounded-lg border border-border bg-background/35 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Datentransparenz
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Sieh, welche Daten das Produkt über dich speichert, wer sie sehen kann und welche
                  Aufbewahrungs- oder Löschregeln tatsächlich implementiert sind.
                </p>
                <a
                  href="/datentransparenz"
                  onClick={closeSettings}
                  className="mt-3 inline-flex min-h-9 items-center rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-ring hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Diese Daten werden über mich gespeichert
                </a>
              </section>

              {saveError || profile.error || preferences.error ? (
                <p role="alert" className="text-xs text-destructive">
                  {saveError ?? profile.error ?? preferences.error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeSettings}
                  className="rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={
                    saving ||
                    profile.status === "loading" ||
                    preferences.status === "loading" ||
                    !draftName.trim()
                  }
                  className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {saving ? "Speichern …" : "Speichern"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
