import { useLocation } from "@tanstack/react-router";
import { Languages } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "./LanguageContext";
import type { PlatformMessageKey, SupportedLanguage } from "./messages";

const options: Array<{ value: SupportedLanguage; labelKey: PlatformMessageKey }> = [
  { value: "de", labelKey: "german" },
  { value: "en", labelKey: "english" },
];

const PUBLIC_ROUTES = new Set(["/willkommen", "/anmelden"]);

export function LanguageSwitcher() {
  const { pathname } = useLocation();
  const { language, saving, setLanguage, t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  if (PUBLIC_ROUTES.has(pathname)) return null;

  return (
    <div
      data-platform-ui="language-switcher"
      className="relative z-[120] flex h-5 w-full shrink-0 items-center justify-end gap-1 border-b border-border bg-panel/95 px-2 backdrop-blur"
    >
      <Languages className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <label className="flex h-5 items-center gap-1 text-[11px] font-medium text-foreground">
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
          className="h-5 rounded border border-border bg-background px-1 py-0 text-[11px] leading-none text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
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
