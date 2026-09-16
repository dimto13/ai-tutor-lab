import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { deleteAmplifyOwnAccount } from "@/persistence/adapters/amplifyDataTransparency";

export function AccountDeletionPanel() {
  const auth = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    if (!confirmed || deleting || !auth.session?.identity) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAmplifyOwnAccount();
      await auth.signOut();
      window.location.assign("/anmelden");
    } catch {
      setError(
        "Dein Konto konnte nicht vollständig gelöscht werden. Es wurden keine weiteren Löschversuche ausgeführt. Bitte versuche es später erneut oder wende dich an den Support.",
      );
      setDeleting(false);
    }
  }

  return (
    <section
      id="konto-loeschen"
      aria-labelledby="account-deletion-title"
      className="mt-8 rounded-xl border border-destructive/40 bg-panel p-5"
    >
      <div className="flex items-start gap-3">
        <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <h2 id="account-deletion-title" className="text-base font-semibold text-foreground">
            Konto löschen
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Dabei werden deine nutzerbezogenen Cloud-Daten für deine angemeldete Identität und
            anschließend dein Anmeldekonto gelöscht. Dieser Vorgang kann nicht rückgängig gemacht
            werden.
          </p>
        </div>
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={deleting}
          className="mt-1"
        />
        <span>Ich verstehe, dass mein Konto und meine eigenen Daten dauerhaft gelöscht werden.</span>
      </label>

      <button
        type="button"
        onClick={() => void deleteAccount()}
        disabled={!confirmed || deleting || !auth.session?.identity}
        className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {deleting ? "Konto wird gelöscht …" : "Konto und eigene Daten endgültig löschen"}
      </button>

      {error ? (
        <p role="alert" className="mt-3 text-sm leading-relaxed text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
