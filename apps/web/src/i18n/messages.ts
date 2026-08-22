export const SUPPORTED_LANGUAGES = ["de", "en"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export type LocalizedText = string | Partial<Record<SupportedLanguage, string>>;

export function normalizeLanguage(language: string | null | undefined): SupportedLanguage {
  const normalized = language?.trim().toLowerCase();
  if (normalized === "en" || normalized?.startsWith("en-")) return "en";
  return "de";
}

export function resolveLocalizedText(value: LocalizedText, language: SupportedLanguage): string {
  if (typeof value === "string") return value;
  return value[language] ?? value.de ?? value.en ?? "";
}

export const platformMessages = {
  de: {
    languageLabel: "Sprache",
    german: "Deutsch",
    english: "English",
    changeLanguage: "Sprache wechseln",
    languageSaving: "Sprache wird gespeichert …",
    pageNotFound: "Seite nicht gefunden",
    pageNotFoundDescription: "Die angeforderte Seite existiert nicht oder wurde verschoben.",
    goHome: "Zur Startseite",
    pageLoadError: "Diese Seite konnte nicht geladen werden",
    tryAgain: "Erneut versuchen",
    genericError: "Es ist ein unerwarteter Fehler aufgetreten.",
  },
  en: {
    languageLabel: "Language",
    german: "Deutsch",
    english: "English",
    changeLanguage: "Change language",
    languageSaving: "Saving language …",
    pageNotFound: "Page not found",
    pageNotFoundDescription: "The page you requested does not exist or has been moved.",
    goHome: "Go home",
    pageLoadError: "This page could not be loaded",
    tryAgain: "Try again",
    genericError: "Something unexpected went wrong.",
  },
} as const;

export type PlatformMessageKey = keyof (typeof platformMessages)["de"];

export function platformMessage(language: SupportedLanguage, key: PlatformMessageKey): string {
  return platformMessages[language]?.[key] ?? platformMessages.de[key];
}
