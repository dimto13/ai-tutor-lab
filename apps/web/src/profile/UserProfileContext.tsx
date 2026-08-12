import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/auth/AuthContext";
import { createApplicationUserProfileRepository } from "./applicationUserProfileRepository";
import {
  UserProfileConflictError,
  type UserProfileRecord,
  type UserProfileRepository,
  type UserProfileSubject,
} from "./userProfileRepository";

interface UserProfileContextValue {
  profile: UserProfileRecord | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  displayName: string;
  saveDisplayName(displayName: string): Promise<void>;
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null);
const repository = createApplicationUserProfileRepository();

function subjectForSession(userId: string, tenantId: string | null): UserProfileSubject {
  return { userId, tenantId };
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Das Nutzerprofil konnte nicht gespeichert werden.";
}

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [status, setStatus] = useState<UserProfileContextValue["status"]>("idle");
  const [error, setError] = useState<string | null>(null);

  const identity = auth.session?.identity ?? null;
  const userId = identity?.userId ?? null;
  const tenantId = identity?.tenantId ?? null;
  const subject = useMemo(
    () => (userId ? subjectForSession(userId, tenantId) : null),
    [userId, tenantId],
  );

  const load = useCallback(
    async (activeRepository: UserProfileRepository = repository) => {
      if (!subject) {
        setProfile(null);
        setStatus("idle");
        setError(null);
        return;
      }

      setStatus("loading");
      setError(null);
      try {
        const loaded = await activeRepository.load(subject);
        setProfile(loaded);
        setStatus("ready");
      } catch (cause) {
        setProfile(null);
        setStatus("error");
        setError(messageOf(cause));
      }
    },
    [subject],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const saveDisplayName = useCallback(
    async (displayName: string) => {
      if (!subject) throw new Error("Kein angemeldeter Nutzer vorhanden.");
      const normalized = displayName.trim();
      if (!normalized) throw new Error("Bitte gib einen Namen ein.");
      if (normalized.length > 80) throw new Error("Der Name darf höchstens 80 Zeichen lang sein.");

      setError(null);
      try {
        const saved = await repository.save(
          subject,
          { displayName: normalized },
          profile?.revision ?? null,
        );
        setProfile(saved);
        setStatus("ready");
      } catch (cause) {
        if (cause instanceof UserProfileConflictError) {
          await load();
          throw new Error(
            "Das Profil wurde zwischenzeitlich geändert. Der aktuelle Stand wurde neu geladen.",
          );
        }
        const message = messageOf(cause);
        setError(message);
        setStatus("error");
        throw new Error(message);
      }
    },
    [load, profile?.revision, subject],
  );

  const displayName =
    profile?.displayName?.trim() || identity?.displayName?.trim() || identity?.email || "Angemeldet";

  const value = useMemo<UserProfileContextValue>(
    () => ({ profile, status, error, displayName, saveDisplayName }),
    [profile, status, error, displayName, saveDisplayName],
  );

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>;
}

export function useUserProfile(): UserProfileContextValue {
  const context = useContext(UserProfileContext);
  if (!context) throw new Error("useUserProfile must be used inside UserProfileProvider");
  return context;
}
