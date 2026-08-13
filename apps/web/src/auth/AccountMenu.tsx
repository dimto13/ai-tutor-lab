import { LogOut, Settings, UserRound, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { useUserProfile } from "@/profile/UserProfileContext";

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const profile = useUserProfile();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftName, setDraftName] = useState(profile.displayName);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsOpen) setDraftName(profile.displayName);
  }, [profile.displayName, settingsOpen]);

  const email = auth.session?.identity.email ?? profile.profile?.email ?? null;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await profile.saveDisplayName(draftName);
      setSettingsOpen(false);
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Das Profil konnte nicht gespeichert werden.",
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
          onClick={() => {
            setDraftName(profile.displayName);
            setSaveError(null);
            setSettingsOpen(true);
          }}
          aria-label="Einstellungen öffnen"
          title="Einstellungen"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:border-ring hover:bg-white/5"
        >
          <Settings className="h-3.5 w-3.5" />
          <span className={compact ? "hidden 2xl:inline" : "hidden md:inline"}>Einstellungen</span>
        </button>
        <button
          type="button"
          onClick={() => void auth.signOut().catch(() => undefined)}
          aria-label="Abmelden"
          title="Abmelden"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:border-ring hover:bg-white/5"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className={compact ? "hidden 2xl:inline" : "hidden md:inline"}>Abmelden</span>
        </button>
      </div>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-settings-title"
            className="w-full max-w-md rounded-xl border border-border bg-panel p-5 shadow-2xl"
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
                  Passe die Angaben an, mit denen dich die Lernplattform anspricht.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Einstellungen schließen"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleSave}>
              <label className="block">
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
                <div>
                  <span className="text-xs font-medium text-foreground">E-Mail</span>
                  <p className="mt-1.5 truncate rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                    {email}
                  </p>
                </div>
              ) : null}

              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-xs font-medium text-foreground">Lernpräferenzen</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Dein selbst eingeschätztes KI-Level wird im nächsten Schritt hier ergänzt und für
                  passende Lernempfehlungen verwendet.
                </p>
              </div>

              {saveError || profile.error ? (
                <p role="alert" className="text-xs text-destructive">
                  {saveError ?? profile.error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving || !draftName.trim()}
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
