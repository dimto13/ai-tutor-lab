import type { M365CopilotState, M365PromptQuality } from "./m365CopilotRuntime.ts";

/**
 * How the simulated Copilot judges a prompt: goal, context, audience, tone and output format.
 * The guided step names each missing part (#591), so these lists catch common phrasings rather
 * than one expected wording.
 */
export function assessPromptQuality(prompt: string, state: M365CopilotState): M365PromptQuality {
  const normalized = prompt
    .trim()
    .toLocaleLowerCase("de-DE")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const words = normalized.split(/\s+/).filter(Boolean);
  const hasAny = (terms: string[]) => terms.some((term) => normalized.includes(term));
  // Short words only count as whole words: "fur" is also part of "Durchführung" (#601).
  const tokens = new Set(words.map((word) => word.replace(/[^\p{L}\p{N}]/gu, "")));
  const hasWord = (terms: string[]) => terms.some((term) => tokens.has(term));

  return {
    goal:
      words.length >= 5 &&
      hasAny([
        "erstelle",
        "fasse",
        "analys",
        "vergleiche",
        "entwurf",
        "entwirf",
        "liste",
        "schreib",
        "gib",
        "zeig",
        "nenn",
        "beschreib",
        "erklar",
        "formulier",
        "verfass",
        "bereite",
        "plane",
        "sammle",
        "ubersicht",
        "create",
        "summar",
        "analy",
        "compare",
        "draft",
        "write",
      ]),
    context:
      state.groundingMode === "work"
        ? state.contextSourceIds.length > 0 ||
          hasAny(["kontext", "projekt", "besprechung", "pilot", "context", "project", "meeting"])
        : hasAny(["web", "offentlich", "quelle", "public", "source"]),
    audience:
      hasWord(["fur", "furs", "fuer", "fuers"]) ||
      hasAny([
        "an die ",
        "an den ",
        "team",
        "zielgruppe",
        "leser",
        "empfanger",
        "vorstand",
        "chef",
        "abteilung",
        "mitarbeit",
        "stakeholder",
        "leitung",
        "management",
        "kunde",
        "kolleg",
        "audience",
        "customer",
        "colleague",
      ]),
    tone: hasAny([
      "sachlich",
      "professionell",
      "kurz",
      "pragnant",
      "freundlich",
      "neutral",
      "knapp",
      "klar",
      "verstandlich",
      "einfach",
      "formell",
      "locker",
      "hoflich",
      "ton",
      "professional",
      "concise",
      "friendly",
      "tone",
    ]),
    outputFormat: hasAny([
      "liste",
      "tabelle",
      "punkte",
      "stichpunkt",
      "absatz",
      "mail",
      "zusammenfassung",
      "aufzahlung",
      "tabellar",
      "gliederung",
      "uberschrift",
      "satz",
      "satze",
      "nachricht",
      "bericht",
      "agenda",
      "format",
      "list",
      "table",
      "bullet",
      "paragraph",
      "email",
      "summary",
    ]),
  };
}
