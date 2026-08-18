import { Eye, EyeOff, LogOut, Settings, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SelfAssessedAiLevel } from "@ai-train-lab/training-engine";
import { useAuth } from "./AuthContext";
import { maskEmailAddress } from "./emailPrivacy";
import { AI_LEVEL_OPTIONS, aiLevelLabel } from "@/profile/aiLevelOptions";
import { contentRecommendationForAiLevel } from "@/profile/aiLevelRecommendation";
import { useUserPreferences } from "@/profile/UserPreferencesContext";
import { useUserProfile } from "@/profile/UserProfileContext";

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const profile = useUserProfile();
  const preferences = useUserPreferences();
  const effectiveAiLevel = preferences.selfAssessedAiLevel ?? "beginner";
  const effectiveAiLevelLabel = aiLevelLabel(effectiveAiLevel);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftName, setDraftName] = useState(profile.displayName);
  const [draftAiLevel, setDraftAiLevel] = useState<SelfAssessedAiLevel | null>(
    preferences.selfAssessedAiLevel,
  );
  const [emailVisible, setEmailVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const aiLevelInputRef = useRef<HTMLInputElement | null>(null);
  const focusAiLevelOnOpenRef = useRef(false);
  const settingsReturnFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!settingsOpen) {
      setDraftName(profile.displayName);
      setDraftAiLevel(preferences.selfAssessedAiLevel);
      setEmailVisible(false);
    }
  }, [preferences.selfAssessedAiLevel, profile.displayName, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen || !focusAiLevelOnOpenRef.current) return;

    const animationFrame = window.requestAnimationFrame(() => {
      aiLevelInputRef.current?.focus();
      focusAiLevelOnOpenRef.current = false;
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [settingsOpen]);

  const email = auth.session?.identity.email ?? profile.profile?.email ?? null;
  const displayedEmail = email ? (emailVisible ? email : maskEmailAddress(email)) : null;
  const draftRecommendation = draftAiLevel ? contentRecommendationForAiLevel(draftAiLevel) : null;

  function openSettings({
    focusAiLevel = false,
    returnFocusTo = null,
  }: {
    focusAiLevel?: boolean;
    returnFocusTo?: HTMLButtonElement | null;
  } = {}) {
    setDraftName(profile.displayName);
    setDraftAiLevel(preferences.selfAssessedAiLevel);
    setEmailVisible(false);
    setSaveError(null);
    focusAiLevelOnOpenRef.current = focusAiLevel;
    settingsReturnFocusRef.current = returnFocusTo;
    setSettingsOpen(true);
  }

  function closeSettings() {
    const returnFocusTo = settingsReturnFocusRef.current;
    setEmailVisible(false);
    setSettingsOpen(false);
    focusAiLevelOnOpenRef.current = false;
    settingsReturnFocusRef.current = null;
    window.requestAnimationFrame(() => returnFocusTo?.focus());
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

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={`${compact ? "hidden 2xl:inline" : "hidden sm:inline"} max-w-52 truncate text-xs text-muted-foreground`}
          title={profile.displayName}
        >
          {profile.displayName}
        </span>
        <button
          type="button"
          data-testid="ai-level-navigation"
          data-platform-ui="ai-level-navigation"
          onClick={(event) =>
            openSettings({ focusAiLevel: true, returnFocusTo: event.currentTarget })
          }
          aria-label={`Eigene KI-Erfahrung (Selbsteinschätzung): ${effectiveAiLevelLabel}. Ändern`}
          title={`Eigene KI-Erfahrung: ${effectiveAiLevelLabel}`}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:border-ring hover:bg-muted"
        >
          <span aria-hidden="true" className="whitespace-nowrap">
            {compact ? (
              <>
                <span className="2xl:hidden">KI: </span>
                <span className="hidden 2xl:inline">KI-Level: </span>
              </>
            ) : (
              "KI-Level: "
            )}
            {effectiveAiLevelLabel}
          </span>
        </button>
        <button
          type="button"
          onClick={(event) => openSettings({ returnFocusTo: event.currentTarget })}
          aria-label="Einstellungen öffnen"
          title="Einstellungen"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:border-ring hover:bg-muted"
        >
          <Settings className="h-3.5 w-3.5" />
          <span className={compact ? "hidden 2xl:inline" : "hidden md:inline"}>Einstellungen</span>
        </button>
        <button
          type="button"
          onClick={() => void auth.signOut().catch(() => undefined)}
          aria-label="Abmelden"
          title="Abmelden"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:border-ring hover:bg-muted"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className={compact ? "hidden 2xl:inline" : "hidden md:inline"}>Abmelden</span>
        </button>
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
                <UserRound className="h-4 w-4 text-accent" />
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
                type="button"
                onClick={closeSettings}
                aria-label="Einstellungen schließen"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
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
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
                    placeholder="Dein Name"
                  />
                </label>

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
                        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:border-ring hover:bg-muted"
                      >
                        {emailVisible ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden sm:inline">
                          {emailVisible ? "Verbergen" : "Anzeigen"}
                        </span>
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      Die Adresse ist standardmäßig anonymisiert und wird hier nicht geändert.
                    </p>
                  </div>
                ) : null}
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
                    const focusTarget = selected || (!draftAiLevel && option.value === effectiveAiLevel);
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

              {saveError || profile.error || preferences.error ? (
                <p role="alert" className="text-xs text-destructive">
                  {saveError ?? profile.error ?? preferences.error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeSettings}
                  className="rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
                  className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
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
