import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SelfAssessedAiLevel } from "@ai-train-lab/training-engine";
import { useAuth } from "@/auth/AuthContext";
import { createApplicationUserPreferencesRepository } from "./applicationUserPreferencesRepository";
import {
  UserPreferencesConflictError,
  type UserPreferencesRecord,
  type UserPreferencesRepository,
  type UserPreferencesSubject,
  type UserPreferencesValue,
} from "./userPreferencesRepository";

interface UserPreferencesContextValue {
  preferences: UserPreferencesRecord | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  selfAssessedAiLevel: SelfAssessedAiLevel | null;
  saveSelfAssessedAiLevel(level: SelfAssessedAiLevel): Promise<void>;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);
const repository = createApplicationUserPreferencesRepository();

function subjectForSession(userId: string, tenantId: string | null): UserPreferencesSubject {
  return { userId, tenantId };
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Die Lernpräferenzen konnten nicht gespeichert werden.";
}

function valueWithAiLevel(
  current: UserPreferencesRecord | null,
  selfAssessedAiLevel: SelfAssessedAiLevel,
): UserPreferencesValue {
  return {
    language: current?.language ?? null,
    preferredTrainingMode: current?.preferredTrainingMode ?? null,
    weeklyGoalMinutes: current?.weeklyGoalMinutes ?? null,
    accessibility: current?.accessibility ?? null,
    selfAssessedAiLevel,
  };
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [preferences, setPreferences] = useState<UserPreferencesRecord | null>(null);
  const [status, setStatus] = useState<UserPreferencesContextValue["status"]>("idle");
  const [error, setError] = useState<string | null>(null);

  const identity = auth.session?.identity ?? null;
  const subject = useMemo(
    () => (identity ? subjectForSession(identity.userId, identity.tenantId) : null),
    [identity?.userId, identity?.tenantId],
  );

  const load = useCallback(
    async (activeRepository: UserPreferencesRepository = repository) => {
      if (!subject) {
        setPreferences(null);
        setStatus("idle");
        setError(null);
        return;
      }

      setStatus("loading");
      setError(null);
      try {
        const loaded = await activeRepository.load(subject);
        setPreferences(loaded);
        setStatus("ready");
      } catch (cause) {
        setPreferences(null);
        setStatus("error");
        setError(messageOf(cause));
      }
    },
    [subject],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const saveSelfAssessedAiLevel = useCallback(
    async (level: SelfAssessedAiLevel) => {
      if (!subject) throw new Error("Kein angemeldeter Nutzer vorhanden.");

      setError(null);
      try {
        const saved = await repository.save(
          subject,
          valueWithAiLevel(preferences, level),
          preferences?.revision ?? null,
        );
        setPreferences(saved);
        setStatus("ready");
      } catch (cause) {
        if (cause instanceof UserPreferencesConflictError) {
          await load();
          throw new Error(
            "Die Lernpräferenzen wurden zwischenzeitlich geändert. Der aktuelle Stand wurde neu geladen.",
          );
        }
        const message = messageOf(cause);
        setError(message);
        setStatus("error");
        throw new Error(message);
      }
    },
    [load, preferences, subject],
  );

  const selfAssessedAiLevel = preferences?.selfAssessedAiLevel ?? null;

  const value = useMemo<UserPreferencesContextValue>(
    () => ({
      preferences,
      status,
      error,
      selfAssessedAiLevel,
      saveSelfAssessedAiLevel,
    }),
    [preferences, status, error, selfAssessedAiLevel, saveSelfAssessedAiLevel],
  );

  return (
    <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>
  );
}

export function useUserPreferences(): UserPreferencesContextValue {
  const context = useContext(UserPreferencesContext);
  if (!context) throw new Error("useUserPreferences must be used inside UserPreferencesProvider");
  return context;
}
