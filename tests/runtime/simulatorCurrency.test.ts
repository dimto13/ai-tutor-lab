import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSimulatorCurrencyIssuePlan,
  loadSimulatorCurrencyContext,
  parseSimulatorCurrencyPolicy,
  syncSimulatorCurrencyIssues,
  validateScenarioMappings,
  type FetchLike,
} from "../../scripts/check-simulator-currency.ts";

test("simulator currency policy maps every product review to real scenarios and runtimes", async () => {
  const context = await loadSimulatorCurrencyContext();

  assert.equal(context.policy.cadenceMonths, 6);
  assert.deepEqual(
    context.policy.products.map((product) => product.runtimeAdapterId),
    ["vscode-simulator", "github-copilot-vscode-simulator"],
  );
  assert.doesNotThrow(() => validateScenarioMappings(context.policy, context.scenarios));
});

test("due product reviews become fully classified Epic sub-issue plans", async () => {
  const context = await loadSimulatorCurrencyContext();
  const input = structuredClone(context.policy);
  for (const product of input.products) {
    product.lastReviewedAt = null;
    product.nextReviewAt = "2026-08-09";
    product.deviations = [];
  }
  const policy = parseSimulatorCurrencyPolicy(input);
  const beforeDueDate = buildSimulatorCurrencyIssuePlan(
    { policy, scenarios: context.scenarios },
    "2026-08-08",
  );

  assert.equal(beforeDueDate.length, 0);
  const plan = buildSimulatorCurrencyIssuePlan(
    { policy, scenarios: context.scenarios },
    "2026-08-09",
  );

  assert.equal(plan.length, 2);
  for (const issue of plan) {
    assert.equal(issue.kind, "review");
    assert.equal(issue.epicIssue, 83);
    assert.equal(issue.milestone, 4);
    assert.ok(issue.labels.includes("epic: EP-12"));
    assert.ok(issue.labels.includes("prio: should"));
    assert.ok(issue.labels.includes("type: chore"));
    assert.match(issue.body, /### Produkt-Checkliste/);
    assert.match(issue.body, /### Zugeordnete Szenarien/);
    assert.ok(issue.body.includes(issue.marker));
  }
});

test("open deviations mark assigned scenarios and create bug issue plans", async () => {
  const context = await loadSimulatorCurrencyContext();
  const input = structuredClone(context.policy);
  for (const product of input.products) {
    product.deviations = [];
  }
  input.products[1]?.deviations.push({
    id: "chat-mode-label-2026-10",
    summary: "Chat-Modus ist veraltet",
    details: "Simulator und reale Oberfläche verwenden unterschiedliche Bezeichnungen.",
    observedVersion: "2026-10",
    scenarioIds: ["copilot-basics.guided"],
    status: "open",
  });
  const policy = parseSimulatorCurrencyPolicy(input);
  validateScenarioMappings(policy, context.scenarios);

  const plan = buildSimulatorCurrencyIssuePlan(
    { policy, scenarios: context.scenarios },
    "2026-08-08",
  );

  assert.equal(plan.length, 1);
  assert.equal(plan[0]?.kind, "deviation");
  assert.ok(plan[0]?.labels.includes("type: bug"));
  assert.match(plan[0]?.body ?? "", /⚠️ `copilot-basics\.guided`/);
  assert.match(plan[0]?.body ?? "", /content\/scenarios\/copilot-basics\.guided\.json/);
});

test("unknown or wrongly assigned scenarios fail policy validation", async () => {
  const context = await loadSimulatorCurrencyContext();
  const input = structuredClone(context.policy);
  input.products[0]!.scenarioIds = ["missing-scenario"];
  const policy = parseSimulatorCurrencyPolicy(input);

  assert.throws(
    () => validateScenarioMappings(policy, context.scenarios),
    /references unknown scenario missing-scenario/,
  );
});

test("GitHub synchronization deduplicates markers and attaches new issues below the Epic", async () => {
  const context = await loadSimulatorCurrencyContext();
  const input = structuredClone(context.policy);
  for (const product of input.products) {
    product.deviations = [];
  }
  input.products[0]!.lastReviewedAt = null;
  input.products[0]!.nextReviewAt = "2026-08-09";
  input.products[1]!.nextReviewAt = "2027-02-10";
  const policy = parseSimulatorCurrencyPolicy(input);
  const planned = buildSimulatorCurrencyIssuePlan(
    { policy, scenarios: context.scenarios },
    "2026-08-09",
  )[0];
  assert.ok(planned);

  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchImpl: FetchLike = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : null;
    requests.push({ url, method, body });

    if (method === "GET") return jsonResponse([]);
    if (url.endsWith("/issues")) return jsonResponse({ id: 9876, number: 201 }, 201);
    if (url.endsWith("/issues/83/sub_issues")) return jsonResponse({}, 201);
    return jsonResponse({ message: "unexpected request" }, 500);
  };

  const result = await syncSimulatorCurrencyIssues([planned], {
    repository: "dimto13/ai-tutor-lab",
    token: "test-token",
    fetchImpl,
  });

  assert.deepEqual(result, {
    created: [{ key: planned.key, issueNumber: 201 }],
    skipped: [],
  });
  const createBody = requests.find((request) => request.url.endsWith("/issues"))?.body as {
    labels?: string[];
    milestone?: number;
    assignees?: string[];
    body?: string;
  };
  assert.deepEqual(createBody.labels, planned.labels);
  assert.equal(createBody.milestone, 4);
  assert.deepEqual(createBody.assignees, [planned.owner]);
  assert.ok(createBody.body?.includes(planned.marker));
  assert.deepEqual(requests.at(-1)?.body, { sub_issue_id: 9876 });

  const existingFetch: FetchLike = async () => jsonResponse([{ number: 201, body: planned.body }]);
  const deduplicated = await syncSimulatorCurrencyIssues([planned], {
    repository: "dimto13/ai-tutor-lab",
    token: "test-token",
    fetchImpl: existingFetch,
  });
  assert.deepEqual(deduplicated, {
    created: [],
    skipped: [{ key: planned.key, issueNumber: 201 }],
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
