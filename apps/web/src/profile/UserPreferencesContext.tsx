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
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);
const repository = createApplicationUserPreferencesRepository();

function subjectForSession(userId: string, tenantId: string | null): UserPreferencesSubject {
  return { userId, tenantId };
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

  const saveSelfAssessedAiLevel = useCallback(
    async (level: SelfAssessedAiLevel) => {
      if (!subject) throw new Error("Kein angemeldeter Nutzer vorhanden.");

      const expectedRevision = expectedRevisionForWrite(
        status,
        preferences,
        "Die Lernpräferenzen wurden noch nicht geladen. Bitte versuche es erneut.",
      );

      setError(null);
      try {
        const saved = await repository.save(
          subject,
          valueWithAiLevel(preferences, level),
          expectedRevision,
        );
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
