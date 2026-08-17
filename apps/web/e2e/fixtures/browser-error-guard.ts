import {
  expect,
  test as base,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from "@playwright/test";

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
  allowMissingSourceUrl?: boolean;
  pagePath?: RegExp;
  reason: string;
};

const browserErrorAllowlist: readonly BrowserErrorAllowance[] = [
  {
    type: "console.error",
    sourceUrl:
      /^https:\/\/fonts\.gstatic\.com\/s\/jetbrainsmono\/v24\/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYaTNPxDcwg\.woff2$/,
    text: /^Failed to load resource: the server responded with a status of 404 \(\)$/,
    reason:
      "The isolated CI environment reproducibly receives a 404 for this exact external JetBrains Mono font asset. No application, React, router, resolver or runtime errors are covered.",
  },
  {
    type: "console.error",
    pagePath:
      /^\/training\/(?:artifact-preview-foundation\.guided|html-page-workflow\.(?:explore|guided|challenge))$/,
    sourceUrl: /^about:srcdoc#?$/,
    allowMissingSourceUrl: true,
    text: /^Blocked script execution in 'about:srcdoc#?' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\.$/,
    reason:
      "Chromium emits this exact diagnostic when Playwright observes the intentionally script-disabled artifact-preview srcdoc sandbox. Artifact HTML validation independently rejects script tags; this exception is limited to the artifact-preview training routes, the exact sandbox message and an about:srcdoc source when Chromium reports one.",
  },
];

function pagePath(pageUrl: string): string {
  try {
    return new URL(pageUrl).pathname;
  } catch {
    return pageUrl;
  }
}

function isAllowedBrowserError(event: BrowserErrorEvent): boolean {
  return browserErrorAllowlist.some((allowance) => {
    if (allowance.type !== event.type || !allowance.text.test(event.text)) return false;
    if (allowance.sourceUrl) {
      if (event.sourceUrl === undefined) {
        if (!allowance.allowMissingSourceUrl) return false;
      } else if (!allowance.sourceUrl.test(event.sourceUrl)) {
        return false;
      }
    }
    if (allowance.pagePath && !allowance.pagePath.test(pagePath(event.pageUrl))) return false;
    return true;
  });
}

function currentRoutes(context: BrowserContext): string[] {
  return [
    ...new Set(
      context
        .pages()
        .filter((page) => !page.isClosed())
        .map((page) => page.url()),
    ),
  ];
}

function formatBrowserErrors(
  events: readonly BrowserErrorEvent[],
  routesAtTeardown: readonly string[],
): string {
  return [
    "Unexpected browser errors detected:",
    `Routes at teardown: ${routesAtTeardown.length > 0 ? routesAtTeardown.join(", ") : "<none>"}`,
    ...events.flatMap((event, index) => [
      "",
      `${index + 1}. ${event.type}`,
      `URL at error: ${event.pageUrl}`,
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
      let diagnostics: string | undefined;

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
        const routesAtTeardown = currentRoutes(context);
        context.off("page", attachPageListeners);
        for (const [monitoredPage, listeners] of pageListeners) {
          monitoredPage.off("pageerror", listeners.onPageError);
          monitoredPage.off("console", listeners.onConsole);
        }

        const unexpectedErrors = observedErrors.filter((event) => !isAllowedBrowserError(event));
        if (unexpectedErrors.length > 0) {
          diagnostics = formatBrowserErrors(unexpectedErrors, routesAtTeardown);
          await testInfo.attach("browser-errors", {
            body: diagnostics,
            contentType: "text/plain",
          });
        }
      }

      if (diagnostics) throw new Error(diagnostics);
    },
    { auto: true },
  ],
});

export { expect };
export type { BrowserContext, Locator, Page } from "@playwright/test";
