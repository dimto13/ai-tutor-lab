import AxeBuilder from "@axe-core/playwright";
import { test as browserErrorTest, type Page } from "./browser-error-guard";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"] as const;

type AccessibilityException = {
  ruleId: string;
  route: RegExp;
  target: string;
  reason: string;
  followUpIssue: number;
};

// Keep exceptions centralized, exact and temporary. An entry must identify one axe rule,
// one route and one exact serialized node target, explain why it cannot be fixed immediately,
// and link to the follow-up issue that removes it.
const accessibilityExceptions: readonly AccessibilityException[] = [];

type AxeAnalysis = Awaited<ReturnType<AxeBuilder["analyze"]>>;
type AxeViolation = AxeAnalysis["violations"][number];
type AxeNode = AxeViolation["nodes"][number];

type AllowedFinding = {
  ruleId: string;
  route: string;
  target: string;
  reason: string;
  followUpIssue: number;
};

function pagePath(pageUrl: string): string {
  try {
    return new URL(pageUrl).pathname;
  } catch {
    return pageUrl;
  }
}

function serializedTarget(node: AxeNode): string {
  return JSON.stringify(node.target);
}

function matchingException(
  ruleId: string,
  node: AxeNode,
  route: string,
): AccessibilityException | undefined {
  const target = serializedTarget(node);
  return accessibilityExceptions.find(
    (exception) =>
      exception.ruleId === ruleId && exception.route.test(route) && exception.target === target,
  );
}

function formatViolations(state: string, route: string, violations: AxeViolation[]): string {
  return [
    `Accessibility violations detected: ${state}`,
    `Route: ${route}`,
    ...violations.flatMap((violation, violationIndex) => [
      "",
      `${violationIndex + 1}. ${violation.id} (${violation.impact ?? "impact unknown"})`,
      `Help: ${violation.help}`,
      `Docs: ${violation.helpUrl}`,
      ...violation.nodes.flatMap((node, nodeIndex) => [
        `  Node ${nodeIndex + 1}: ${serializedTarget(node)}`,
        `  HTML: ${node.html}`,
        `  Failure: ${node.failureSummary ?? "<no failure summary>"}`,
      ]),
    ]),
  ].join("\n");
}

async function scanAccessibility(
  page: Page,
  state: string,
  attach: (name: string, options: { body: string; contentType: string }) => Promise<void>,
): Promise<void> {
  const route = pagePath(page.url());
  if (route === "/willkommen") {
    await page.locator(".lp-dots button:not([disabled])").first().waitFor({ state: "visible" });
  }

  const results = await new AxeBuilder({ page }).withTags([...wcagTags]).analyze();
  const allowedFindings: AllowedFinding[] = [];
  const unexpectedViolations: AxeViolation[] = [];

  for (const violation of results.violations) {
    const unexpectedNodes: AxeNode[] = [];

    for (const node of violation.nodes) {
      const exception = matchingException(violation.id, node, route);
      if (exception) {
        allowedFindings.push({
          ruleId: violation.id,
          route,
          target: serializedTarget(node),
          reason: exception.reason,
          followUpIssue: exception.followUpIssue,
        });
      } else {
        unexpectedNodes.push(node);
      }
    }

    if (unexpectedNodes.length > 0) {
      unexpectedViolations.push({ ...violation, nodes: unexpectedNodes });
    }
  }

  if (unexpectedViolations.length === 0) return;

  const diagnostics = formatViolations(state, route, unexpectedViolations);
  await attach("axe-accessibility-violations", {
    body: JSON.stringify(
      {
        state,
        route,
        wcagTags,
        violations: unexpectedViolations,
        allowedFindings,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await attach("axe-accessibility-summary", {
    body: diagnostics,
    contentType: "text/plain",
  });

  throw new Error(diagnostics);
}

type AccessibilityFixtures = {
  accessibility: {
    check(state: string): Promise<void>;
  };
};

export const test = browserErrorTest.extend<AccessibilityFixtures>({
  accessibility: async ({ page }, provide, testInfo) => {
    await provide({
      check: (state) =>
        scanAccessibility(page, state, (name, options) => testInfo.attach(name, options)),
    });
  },
});

export { expect } from "./browser-error-guard";
export type { BrowserContext, Locator, Page } from "./browser-error-guard";
