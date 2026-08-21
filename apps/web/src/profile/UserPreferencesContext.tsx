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
import { expectedRevisionForWrite } from "./revisionGuard";
import {
  reportUserPreferencesFailure,
  userPreferencesOperationError,
} from "./userPreferencesErrors";
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
  saveWeeklyContinuityPreferences(goalMinutes: number, reminderEnabled: boolean): Promise<void>;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);
const repository = createApplicationUserPreferencesRepository();

function subjectForSession(userId: string, tenantId: string | null): UserPreferencesSubject {
  return { userId, tenantId };
}

function currentValue(current: UserPreferencesRecord | null): UserPreferencesValue {
  return {
    language: current?.language ?? null,
    preferredTrainingMode: current?.preferredTrainingMode ?? null,
    weeklyGoalMinutes: current?.weeklyGoalMinutes ?? null,
    weeklyReminderEnabled: current?.weeklyReminderEnabled ?? null,
    accessibility: current?.accessibility ?? null,
    selfAssessedAiLevel: current?.selfAssessedAiLevel ?? null,
  };
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [preferences, setPreferences] = useState<UserPreferencesRecord | null>(null);
  const [status, setStatus] = useState<UserPreferencesContextValue["status"]>("idle");
  const [error, setError] = useState<string | null>(null);

  const userId = auth.session?.identity.userId ?? null;
  const tenantId = auth.session?.identity.tenantId ?? null;
  const subject = useMemo(
    () => (userId ? subjectForSession(userId, tenantId) : null),
    [tenantId, userId],
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
        reportUserPreferencesFailure("load", cause);
        const operationError = userPreferencesOperationError("load", cause);
        setPreferences(null);
        setStatus("error");
        setError(operationError.message);
      }
    },
    [subject],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const savePreferences = useCallback(
    async (value: UserPreferencesValue) => {
      if (!subject) throw new Error("Kein angemeldeter Nutzer vorhanden.");

      const expectedRevision = expectedRevisionForWrite(
        status,
        preferences,
        "Die Lernpräferenzen wurden noch nicht geladen. Bitte versuche es erneut.",
      );

      setError(null);
      try {
        const saved = await repository.save(subject, value, expectedRevision);
        setPreferences(saved);
        setStatus("ready");
      } catch (cause) {
        if (cause instanceof UserPreferencesConflictError) {
          await load();
          throw new Error(
            "Die Lernpräferenzen wurden zwischenzeitlich geändert. Der aktuelle Stand wurde neu geladen.",
            { cause },
          );
        }
        reportUserPreferencesFailure("save", cause);
        const operationError = userPreferencesOperationError("save", cause);
        setError(operationError.message);
        setStatus("error");
        throw operationError;
      }
    },
    [load, preferences, status, subject],
  );

  const saveSelfAssessedAiLevel = useCallback(
    async (level: SelfAssessedAiLevel) => {
      await savePreferences({ ...currentValue(preferences), selfAssessedAiLevel: level });
    },
    [preferences, savePreferences],
  );

  const saveWeeklyContinuityPreferences = useCallback(
    async (goalMinutes: number, reminderEnabled: boolean) => {
      if (!Number.isInteger(goalMinutes) || goalMinutes < 15 || goalMinutes > 600) {
        throw new Error("Das Wochenziel muss zwischen 15 und 600 Minuten liegen.");
      }
      await savePreferences({
        ...currentValue(preferences),
        weeklyGoalMinutes: goalMinutes,
        weeklyReminderEnabled: reminderEnabled,
      });
    },
    [preferences, savePreferences],
  );

  const selfAssessedAiLevel = preferences?.selfAssessedAiLevel ?? null;

  const value = useMemo<UserPreferencesContextValue>(
    () => ({
      preferences,
      status,
      error,
      selfAssessedAiLevel,
      saveSelfAssessedAiLevel,
      saveWeeklyContinuityPreferences,
    }),
    [
      preferences,
      status,
      error,
      selfAssessedAiLevel,
      saveSelfAssessedAiLevel,
      saveWeeklyContinuityPreferences,
    ],
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
