import type { BrowserContext, Page } from "@playwright/test";

// #563: Ein nicht angemeldeter Besuch darf zu keinem Zeitpunkt Inhalte einer geschützten Route
// rendern. Der Flash dauerte im Fehlerfall nur so lange wie das Nachladen der öffentlichen Route,
// ein Endzustand oder ein Screenshot beweist deshalb nichts. Der Beobachter wird per Init-Script vor
// dem Anwendungscode jedes Dokuments installiert und sieht so auch die vom HTML-Parser eingefügten
// SSR-Knoten und Knoten, die React gleich wieder entfernt.
//
// Merkmale geschützter Inhalte:
// - das Kontomenü, das es nur im Chrome geschützter Routen gibt,
// - Überschriften und Statuszeilen von Dashboard, Kompetenzprofil und Training.
// <head> und Skripte zählen nicht: Der Seitentitel „Meine Trainings – …“ und der dehydrierte
// Router-Zustand sind statisch und enthalten keine Nutzerdaten.

export const ANONYMOUS_PLATFORM_CHROME = '[data-testid="account-menu-anonymous"]';

const PROTECTED_SELECTORS = ['[data-testid^="account-menu"]'] as const;

const PROTECTED_TEXTS = [
  "Meine Trainings",
  "Mein Kompetenzprofil",
  "Training bereit",
  "Training wird geladen",
] as const;

export interface ProtectedContentFinding {
  marker: string;
  path: string;
  /** performance.now() des Dokuments beim ersten Auftreten. */
  at: number;
}

export interface ProtectedContentObservation {
  findings: ProtectedContentFinding[];
  /** Anzahl ausgewerteter Mutationen; 0 hieße, dass der Beobachter nichts gesehen hat. */
  inspectedMutations: number;
}

interface ObserverState {
  findings: ProtectedContentFinding[];
  inspectedMutations: number;
  reset: () => void;
}

const STATE_KEY = "__protectedContentObserver";

export async function observeProtectedContent(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ({ selectors, texts, stateKey }) => {
      const ignoredTags = new Set(["HEAD", "TITLE", "META", "SCRIPT", "STYLE", "TEMPLATE"]);
      const seen = new Set<string>();
      const state: ObserverState = {
        findings: [],
        inspectedMutations: 0,
        reset() {
          state.findings.length = 0;
          seen.clear();
        },
      };
      Object.defineProperty(window, stateKey, { value: state });

      const ignored = (node: Node | null): boolean => {
        for (let current = node; current; current = current.parentNode) {
          if (current instanceof Element && ignoredTags.has(current.tagName)) return true;
        }
        return false;
      };

      const record = (marker: string) => {
        const key = `${marker}|${location.pathname}`;
        if (seen.has(key)) return;
        seen.add(key);
        state.findings.push({ marker, path: location.pathname, at: performance.now() });
      };

      const textOf = (node: Node): string => {
        if (node instanceof Text) return node.data;
        if (!(node instanceof Element)) return "";
        let text = "";
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
          acceptNode: (candidate) =>
            ignored(candidate.parentNode) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
        });
        for (let current = walker.nextNode(); current; current = walker.nextNode()) {
          text += (current as Text).data;
        }
        return text;
      };

      // Ein entfernter Knoten hat keinen Elternteil mehr; ob er im <head> lag, sagt dann das Ziel
      // der Mutation.
      const inspect = (node: Node, target: Node) => {
        if (ignored(target) || ignored(node)) return;
        if (node instanceof Element) {
          for (const selector of selectors) {
            if (node.matches(selector) || node.querySelector(selector)) record(selector);
          }
        }
        const text = textOf(node);
        for (const marker of texts) {
          if (text.includes(marker)) record(marker);
        }
      };

      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          state.inspectedMutations += 1;
          if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => inspect(node, mutation.target));
          } else {
            inspect(mutation.target, mutation.target);
          }
        }
      }).observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["data-testid"],
      });
    },
    { selectors: [...PROTECTED_SELECTORS], texts: [...PROTECTED_TEXTS], stateKey: STATE_KEY },
  );
}

export async function protectedContentObservation(
  page: Page,
): Promise<ProtectedContentObservation> {
  return page.evaluate((stateKey) => {
    const state = Reflect.get(window, stateKey) as ObserverState | undefined;
    if (!state) throw new Error("The protected-content observer is not installed in this page.");
    return { findings: [...state.findings], inspectedMutations: state.inspectedMutations };
  }, STATE_KEY);
}

/** Verwirft bisherige Befunde, etwa die berechtigt angezeigte Plattform vor dem Abmelden. */
export async function resetProtectedContentObservation(page: Page): Promise<void> {
  await page.evaluate((stateKey) => {
    (Reflect.get(window, stateKey) as ObserverState).reset();
  }, STATE_KEY);
}

/**
 * Merkmale geschützter Inhalte im ausgelieferten SSR-HTML. Ausgewertet wird nur der <body> ohne
 * Skripte, Styles und Templates, aus denselben Gründen wie beim Beobachter.
 */
export function protectedMarkersInHtml(html: string): string[] {
  const body = html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html;
  const markup = body.replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, "");
  const markers: string[] = [];
  if (/data-testid="account-menu/.test(markup)) markers.push(PROTECTED_SELECTORS[0]);
  const text = markup.replace(/<[^>]+>/g, "");
  for (const marker of PROTECTED_TEXTS) {
    if (text.includes(marker)) markers.push(marker);
  }
  return markers;
}
