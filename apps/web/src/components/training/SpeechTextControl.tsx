import { Pause, Play, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";

export function SpeechTextControl({ text }: { text: string }) {
  const { language, t } = useLanguage();
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<"idle" | "speaking" | "paused">("idle");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setAvailable(
      typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        typeof SpeechSynthesisUtterance !== "undefined",
    );
  }, []);

  useEffect(() => {
    setState("idle");
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      utteranceRef.current = null;
    };
  }, [text, language]);

  const handleToggle = () => {
    if (!available) return;

    if (state === "speaking") {
      window.speechSynthesis.pause();
      setState("paused");
      return;
    }

    if (state === "paused" && utteranceRef.current) {
      window.speechSynthesis.resume();
      setState("speaking");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === "en" ? "en-US" : "de-DE";
    utterance.onend = () => {
      utteranceRef.current = null;
      setState("idle");
    };
    utterance.onerror = () => {
      utteranceRef.current = null;
      setState("idle");
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setState("speaking");
  };

  const paused = state === "paused";
  const speaking = state === "speaking";
  const label = speaking ? t("speechPause") : paused ? t("speechResume") : t("speechPlay");

  return (
    <button
      type="button"
      data-testid="speech-text-control"
      disabled={!available}
      onClick={handleToggle}
      aria-label={available ? label : t("speechUnavailable")}
      title={available ? label : t("speechUnavailable")}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-background text-[11px] font-medium text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 sm:w-auto sm:px-2.5 sm:py-1.5"
    >
      {speaking ? (
        <Pause className="h-3.5 w-3.5" aria-hidden="true" />
      ) : paused ? (
        <Play className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
