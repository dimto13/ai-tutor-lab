import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays } from "lucide-react";
import { loadMyWeeklyContinuityRuns } from "@/continuity/applicationWeeklyContinuity";
import {
  buildWeeklyContinuity,
  formatWeekLabel,
  type WeeklyContinuityRun,
} from "@/continuity/weeklyContinuity";
import { useUserPreferences } from "@/profile/UserPreferencesContext";

const DEFAULT_GOAL_MINUTES = 60;

export function WeeklyContinuityCard() {
  const preferences = useUserPreferences();
  const [runs, setRuns] = useState<WeeklyContinuityRun[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [draftGoal, setDraftGoal] = useState(DEFAULT_GOAL_MINUTES);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const persistedGoal = preferences.preferences?.weeklyGoalMinutes ?? null;

  useEffect(() => {
    setDraftGoal(persistedGoal ?? DEFAULT_GOAL_MINUTES);
  }, [persistedGoal]);

  useEffect(() => {
    let active = true;
    setHistoryStatus("loading");
    void loadMyWeeklyContinuityRuns()
      .then((loaded) => {
        if (!active) return;
        setRuns(loaded);
        setHistoryStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setRuns([]);
        setHistoryStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => buildWeeklyContinuity(runs, persistedGoal), [runs, persistedGoal]);
  const maxMinutes = Math.max(persistedGoal ?? 0, ...summary.weeks.map((week) => week.minutes), 1);

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await preferences.saveWeeklyGoalMinutes(draftGoal);
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Das Wochenziel konnte nicht gespeichert werden.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="weekly-continuity-heading"
      className="rounded-xl border border-border bg-card p-5"
      data-testid="weekly-continuity"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15">
            <CalendarDays className="h-4 w-4 text-accent" aria-hidden="true" />
          </span>
          <div>
            <h2 id="weekly-continuity-heading" className="text-base font-semibold text-foreground">
              Lernkontinuität pro Woche
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              Plane deine Lernzeit über die Woche statt über tägliche Streaks. Unterbrechungen
              löschen nichts und verringern weder Punkte noch Kompetenznachweise.
            </p>
          </div>
        </div>
        <div className="text-right" aria-live="polite">
          <p className="text-xs text-muted-foreground">Diese Woche</p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">
            {summary.currentWeekMinutes} Min.
            {persistedGoal ? ` / ${persistedGoal} Min.` : ""}
          </p>
          {summary.goalProgressPercent !== null ? (
            <p className="text-xs text-muted-foreground">
              {summary.goalProgressPercent} % des Wochenziels
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5" aria-label="Lernzeit der letzten acht Wochen">
        <div className="grid grid-cols-8 gap-2" data-testid="weekly-continuity-history">
          {summary.weeks.map((week, index) => {
            const height = Math.max(4, Math.round((week.minutes / maxMinutes) * 64));
            const isCurrent = index === summary.weeks.length - 1;
            return (
              <div key={week.weekStart} className="min-w-0 text-center">
                <div className="flex h-16 items-end justify-center" aria-hidden="true">
                  <div
                    className={`w-full max-w-8 rounded-t-sm ${isCurrent ? "bg-accent" : "bg-muted-foreground/35"}`}
                    style={{ height }}
                  />
                </div>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                  {formatWeekLabel(week.weekStart)}
                </p>
                <p className="text-[10px] font-medium text-foreground">{week.minutes}m</p>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {historyStatus === "loading"
            ? "Acht-Wochen-Verlauf wird geladen …"
            : historyStatus === "error"
              ? "Der persönliche Lernzeitverlauf konnte nicht geladen werden. Dein Wochenziel bleibt erhalten."
              : "Die letzten acht Kalenderwochen werden ohne Streak- oder Verlustwertung dargestellt."}
        </p>
      </div>

      <form
        className="mt-5 flex flex-wrap items-end gap-3 border-t border-border pt-4"
        onSubmit={saveGoal}
      >
        <label className="text-xs font-medium text-foreground">
          Wochenziel in Minuten
          <input
            type="number"
            min={15}
            max={600}
            step={15}
            value={draftGoal}
            onChange={(event) => setDraftGoal(Number(event.target.value))}
            disabled={preferences.status !== "ready" || saving}
            className="mt-1 block h-9 w-28 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <button
          type="submit"
          disabled={preferences.status !== "ready" || saving}
          className="h-9 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Speichern …" : persistedGoal ? "Wochenziel ändern" : "Wochenziel speichern"}
        </button>
        <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">
          Erinnerungen sind standardmäßig aus. Ohne eine separate ausdrückliche Zustimmung wird
          keine Benachrichtigung versendet; ein Erinnerungsversand ist in dieser Ausbaustufe nicht
          aktiviert.
        </p>
      </form>
      {saveError ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {saveError}
        </p>
      ) : null}
    </section>
  );
}
