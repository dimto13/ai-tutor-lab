import { Languages } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "./LanguageContext";
import type { PlatformMessageKey, SupportedLanguage } from "./messages";

const options: Array<{ value: SupportedLanguage; labelKey: PlatformMessageKey }> = [
  { value: "de", labelKey: "german" },
  { value: "en", labelKey: "english" },
];

export function LanguageSwitcher() {
  const { language, saving, setLanguage, t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  return (
    <div
      data-platform-ui="language-switcher"
      className="fixed bottom-3 left-3 z-[120] flex items-center gap-2 rounded-lg border border-border bg-panel/95 px-2.5 py-2 shadow-lg backdrop-blur"
    >
      <Languages className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <label className="flex items-center gap-2 text-xs font-medium text-foreground">
        <span>{t("languageLabel")}</span>
        <select
          aria-label={t("changeLanguage")}
          value={language}
          disabled={saving}
          onChange={(event) => {
            setError(null);
            void setLanguage(event.target.value as SupportedLanguage).catch((cause) => {
              setError(cause instanceof Error ? cause.message : t("genericError"));
            });
          }}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>
      <span className="sr-only" aria-live="polite">
        {saving ? t("languageSaving") : error}
      </span>
    </div>
  );
}
