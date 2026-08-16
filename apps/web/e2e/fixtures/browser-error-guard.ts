import { expect, test as base, type ConsoleMessage, type Page } from "@playwright/test";

type BrowserErrorType = "pageerror" | "console.error";

type BrowserErrorEvent = {
  type: BrowserErrorType;
  pageUrl: string;
  sourceUrl?: string;
  text: string;
};

type BrowserErrorAllowance = {
  type: BrowserErrorType;
  text: RegExp;
  sourceUrl?: RegExp;
  reason: string;
};

// Keep this list empty unless a reproducible external-environment error is observed.
// Application, React, router, resolver and runtime failures must never be allowlisted.
const browserErrorAllowlist: readonly BrowserErrorAllowance[] = [];

function isAllowedBrowserError(event: BrowserErrorEvent): boolean {
  return browserErrorAllowlist.some((allowance) => {
    if (allowance.type !== event.type || !allowance.text.test(event.text)) return false;
    if (!allowance.sourceUrl) return true;
    return event.sourceUrl !== undefined && allowance.sourceUrl.test(event.sourceUrl);
  });
}

function formatBrowserErrors(events: readonly BrowserErrorEvent[]): string {
  return [
    "Unexpected browser errors detected:",
    ...events.flatMap((event, index) => [
      "",
      `${index + 1}. ${event.type}`,
      `URL: ${event.pageUrl}`,
      ...(event.sourceUrl ? [`Source: ${event.sourceUrl}`] : []),
      `Error: ${event.text}`,
    ]),
  ].join("\n");
}

type BrowserErrorFixtures = {
  browserErrorGuard: void;
};

type PageListeners = {
  onPageError: (error: Error) => void;
  onConsole: (message: ConsoleMessage) => void;
};

export const test = base.extend<BrowserErrorFixtures>({
  browserErrorGuard: [
    async ({ context, page }, use, testInfo) => {
      const observedErrors: BrowserErrorEvent[] = [];
      const pageListeners = new Map<Page, PageListeners>();

      const attachPageListeners = (monitoredPage: Page) => {
        if (pageListeners.has(monitoredPage)) return;

        const onPageError = (error: Error) => {
          observedErrors.push({
            type: "pageerror",
            pageUrl: monitoredPage.url(),
            text: error.stack ?? error.message,
          });
        };

        const onConsole = (message: ConsoleMessage) => {
          if (message.type() !== "error") return;
          const location = message.location();
          observedErrors.push({
            type: "console.error",
            pageUrl: monitoredPage.url(),
            sourceUrl: location.url || undefined,
            text: message.text(),
          });
        };

        monitoredPage.on("pageerror", onPageError);
        monitoredPage.on("console", onConsole);
        pageListeners.set(monitoredPage, { onPageError, onConsole });
      };

      attachPageListeners(page);
      for (const existingPage of context.pages()) attachPageListeners(existingPage);
      context.on("page", attachPageListeners);

      try {
        await use();
      } finally {
        context.off("page", attachPageListeners);
        for (const [monitoredPage, listeners] of pageListeners) {
          monitoredPage.off("pageerror", listeners.onPageError);
          monitoredPage.off("console", listeners.onConsole);
        }

        const unexpectedErrors = observedErrors.filter((event) => !isAllowedBrowserError(event));
        if (unexpectedErrors.length > 0) {
          const diagnostics = formatBrowserErrors(unexpectedErrors);
          await testInfo.attach("browser-errors", {
            body: diagnostics,
            contentType: "text/plain",
          });
          throw new Error(diagnostics);
        }
      }
    },
    { auto: true },
  ],
});

export { expect };
export type { BrowserContext, Locator, Page } from "@playwright/test";
