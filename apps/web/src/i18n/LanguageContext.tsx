import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useUserPreferences } from "@/profile/UserPreferencesContext";
import {
  normalizeLanguage,
  platformMessage,
  type PlatformMessageKey,
  type SupportedLanguage,
} from "./messages";

type LanguageContextValue = {
  language: SupportedLanguage;
  saving: boolean;
  setLanguage(language: SupportedLanguage): Promise<void>;
  t(key: PlatformMessageKey): string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const preferences = useUserPreferences();
  const persistedLanguage = normalizeLanguage(preferences.preferences?.language);
  const [language, setOptimisticLanguage] = useState<SupportedLanguage>(persistedLanguage);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (preferences.status === "ready") setOptimisticLanguage(persistedLanguage);
  }, [persistedLanguage, preferences.status]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback(
    async (nextLanguage: SupportedLanguage) => {
      if (nextLanguage === language) return;
      const previousLanguage = language;
      setOptimisticLanguage(nextLanguage);
      setSaving(true);
      try {
        await preferences.saveLanguage(nextLanguage);
      } catch (error) {
        setOptimisticLanguage(previousLanguage);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [language, preferences],
  );

  const t = useCallback((key: PlatformMessageKey) => platformMessage(language, key), [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, saving, setLanguage, t }),
    [language, saving, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
