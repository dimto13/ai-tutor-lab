import { expect, test as base } from "@playwright/test";

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

export const test = base.extend<BrowserErrorFixtures>({
  browserErrorGuard: [
    async ({ page }, use, testInfo) => {
      const observedErrors: BrowserErrorEvent[] = [];

      const onPageError = (error: Error) => {
        observedErrors.push({
          type: "pageerror",
          pageUrl: page.url(),
          text: error.stack ?? error.message,
        });
      };

      const onConsole = (message: Parameters<Parameters<typeof page.on<"console">>[1]>[0]) => {
        if (message.type() !== "error") return;
        const location = message.location();
        observedErrors.push({
          type: "console.error",
          pageUrl: page.url(),
          sourceUrl: location.url || undefined,
          text: message.text(),
        });
      };

      page.on("pageerror", onPageError);
      page.on("console", onConsole);

      try {
        await use();
      } finally {
        page.off("pageerror", onPageError);
        page.off("console", onConsole);

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
