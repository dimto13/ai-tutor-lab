import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPolicyPath = path.join(repositoryRoot, ".github", "simulator-currency.json");
const defaultScenarioDirectory = path.join(repositoryRoot, "content", "scenarios");

const dateOnlySchema = z.string().refine(isDateOnly, "expected a real date in YYYY-MM-DD format");

const deviationSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  summary: z.string().min(1),
  details: z.string().min(1),
  observedVersion: z.string().min(1),
  scenarioIds: z.array(z.string().min(1)).min(1),
  status: z.enum(["open", "resolved"]),
});

const productReviewSchema = z.object({
  productId: z.string().min(1),
  displayName: z.string().min(1),
  runtimeAdapterId: z.string().min(1),
  version: z.string().min(1),
  owner: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/),
  lastReviewedAt: dateOnlySchema.nullable(),
  nextReviewAt: dateOnlySchema,
  scenarioIds: z.array(z.string().min(1)).min(1),
  checklist: z.array(z.string().min(1)).min(3),
  deviations: z.array(deviationSchema),
});

export const simulatorCurrencyPolicySchema = z.object({
  schemaVersion: z.literal(1),
  cadenceMonths: z.literal(6),
  epicIssue: z.number().int().positive(),
  milestone: z.number().int().positive(),
  reviewLabels: z.array(z.string().min(1)).min(3),
  deviationLabels: z.array(z.string().min(1)).min(3),
  products: z.array(productReviewSchema).min(1),
});

export type SimulatorCurrencyPolicy = z.infer<typeof simulatorCurrencyPolicySchema>;
export type ProductReview = SimulatorCurrencyPolicy["products"][number];

export interface ScenarioReference {
  id: string;
  filePath: string;
  productId: string;
  runtimeAdapterId: string;
  integrationRuntimeAdapterIds: string[];
}

export interface PlannedIssue {
  key: string;
  marker: string;
  kind: "review" | "deviation";
  title: string;
  body: string;
  labels: string[];
  milestone: number;
  epicIssue: number;
  owner: string;
}

export interface SimulatorCurrencyContext {
  policy: SimulatorCurrencyPolicy;
  scenarios: Map<string, ScenarioReference>;
}

export interface IssueSyncResult {
  created: Array<{ key: string; issueNumber: number }>;
  skipped: Array<{ key: string; issueNumber: number }>;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function parseSimulatorCurrencyPolicy(input: unknown): SimulatorCurrencyPolicy {
  const policy = simulatorCurrencyPolicySchema.parse(input);
  validateRequiredLabels(policy.reviewLabels, "reviewLabels");
  validateRequiredLabels(policy.deviationLabels, "deviationLabels");

  const productIds = new Set<string>();
  const runtimeAdapterIds = new Set<string>();
  for (const product of policy.products) {
    assertUnique(productIds, product.productId, "productId");
    assertUnique(runtimeAdapterIds, product.runtimeAdapterId, "runtimeAdapterId");
    assertUniqueValues(product.scenarioIds, `${product.productId}.scenarioIds`);
    assertUniqueValues(
      product.deviations.map((deviation) => deviation.id),
      `${product.productId}.deviations`,
    );

    if (product.lastReviewedAt && product.nextReviewAt <= product.lastReviewedAt) {
      throw new Error(`${product.productId}.nextReviewAt must be later than lastReviewedAt`);
    }
  }

  return policy;
}

export async function loadSimulatorCurrencyContext(
  options: {
    policyPath?: string;
    scenarioDirectory?: string;
  } = {},
): Promise<SimulatorCurrencyContext> {
  const policyPath = options.policyPath ?? defaultPolicyPath;
  const scenarioDirectory = options.scenarioDirectory ?? defaultScenarioDirectory;
  const policy = parseSimulatorCurrencyPolicy(
    JSON.parse(await readFile(policyPath, "utf8")) as unknown,
  );
  const scenarios = await loadScenarioReferences(scenarioDirectory);
  validateScenarioMappings(policy, scenarios);
  return { policy, scenarios };
}

export async function loadScenarioReferences(
  scenarioDirectory = defaultScenarioDirectory,
): Promise<Map<string, ScenarioReference>> {
  const files = (await readdir(scenarioDirectory)).filter((file) => file.endsWith(".json")).sort();
  const scenarios = new Map<string, ScenarioReference>();

  for (const file of files) {
    const filePath = path.join(scenarioDirectory, file);
    const input = JSON.parse(await readFile(filePath, "utf8")) as {
      id?: unknown;
      environment?: {
        productId?: unknown;
        runtimeAdapterId?: unknown;
        integrationRuntimeAdapterIds?: unknown;
      };
    };
    const id = requireString(input.id, `${file}.id`);
    const productId = requireString(input.environment?.productId, `${file}.environment.productId`);
    const runtimeAdapterId = requireString(
      input.environment?.runtimeAdapterId,
      `${file}.environment.runtimeAdapterId`,
    );
    const integrations = input.environment?.integrationRuntimeAdapterIds ?? [];
    if (!Array.isArray(integrations) || !integrations.every((value) => typeof value === "string")) {
      throw new Error(`${file}.environment.integrationRuntimeAdapterIds must be a string array`);
    }
    if (scenarios.has(id)) throw new Error(`duplicate scenario id ${id}`);

    scenarios.set(id, {
      id,
      filePath: toRepositoryPath(filePath),
      productId,
      runtimeAdapterId,
      integrationRuntimeAdapterIds: [...integrations],
    });
  }

  return scenarios;
}

export function validateScenarioMappings(
  policy: SimulatorCurrencyPolicy,
  scenarios: Map<string, ScenarioReference>,
): void {
  for (const product of policy.products) {
    for (const scenarioId of product.scenarioIds) {
      const scenario = scenarios.get(scenarioId);
      if (!scenario) {
        throw new Error(`${product.productId} references unknown scenario ${scenarioId}`);
      }

      const isPrimaryRuntime = scenario.runtimeAdapterId === product.runtimeAdapterId;
      const isIntegrationRuntime = scenario.integrationRuntimeAdapterIds.includes(
        product.runtimeAdapterId,
      );
      if (!isPrimaryRuntime && !isIntegrationRuntime) {
        throw new Error(`${scenarioId} does not use runtime adapter ${product.runtimeAdapterId}`);
      }
      if (isPrimaryRuntime && scenario.productId !== product.productId) {
        throw new Error(
          `${scenarioId} uses product ${scenario.productId}, not ${product.productId}`,
        );
      }
    }

    for (const deviation of product.deviations) {
      for (const scenarioId of deviation.scenarioIds) {
        if (!product.scenarioIds.includes(scenarioId)) {
          throw new Error(
            `${product.productId}.${deviation.id} references unassigned scenario ${scenarioId}`,
          );
        }
      }
    }
  }
}

export function buildSimulatorCurrencyIssuePlan(
  context: SimulatorCurrencyContext,
  asOf: string,
): PlannedIssue[] {
  if (!isDateOnly(asOf)) throw new Error(`invalid --as-of date ${asOf}`);
  const { policy, scenarios } = context;
  const issues: PlannedIssue[] = [];

  for (const product of policy.products) {
    if (product.nextReviewAt <= asOf) {
      const key = `review:${product.runtimeAdapterId}:${product.nextReviewAt}`;
      issues.push({
        key,
        marker: issueMarker(key),
        kind: "review",
        title: `[Simulator-Review] ${product.displayName} – fällig ${product.nextReviewAt}`,
        body: renderReviewIssue(policy, product, scenarios, key),
        labels: [...policy.reviewLabels],
        milestone: policy.milestone,
        epicIssue: policy.epicIssue,
        owner: product.owner,
      });
    }

    for (const deviation of product.deviations.filter((item) => item.status === "open")) {
      const key = `deviation:${product.runtimeAdapterId}:${deviation.id}`;
      issues.push({
        key,
        marker: issueMarker(key),
        kind: "deviation",
        title: `[Simulator-Drift] ${product.displayName}: ${deviation.summary}`,
        body: renderDeviationIssue(product, deviation, scenarios, key),
        labels: [...policy.deviationLabels],
        milestone: policy.milestone,
        epicIssue: policy.epicIssue,
        owner: product.owner,
      });
    }
  }

  return issues;
}

export async function syncSimulatorCurrencyIssues(
  plan: PlannedIssue[],
  options: {
    repository: string;
    token: string;
    fetchImpl?: FetchLike;
  },
): Promise<IssueSyncResult> {
  if (!/^[^/]+\/[^/]+$/.test(options.repository)) {
    throw new Error("GITHUB_REPOSITORY must use owner/name format");
  }
  if (!options.token) throw new Error("GITHUB_TOKEN is required with --sync");

  const fetchImpl = options.fetchImpl ?? fetch;
  const existingIssues = await listOpenIssues(fetchImpl, options.repository, options.token);
  const result: IssueSyncResult = { created: [], skipped: [] };

  for (const planned of plan) {
    const existing = existingIssues.find((issue) => issue.body.includes(planned.marker));
    if (existing) {
      result.skipped.push({ key: planned.key, issueNumber: existing.number });
      continue;
    }

    const created = await githubRequest<{ id: number; number: number }>(
      fetchImpl,
      options.repository,
      options.token,
      "/issues",
      {
        method: "POST",
        body: JSON.stringify({
          title: planned.title,
          body: planned.body,
          labels: planned.labels,
          milestone: planned.milestone,
          assignees: [planned.owner],
        }),
      },
    );

    await githubRequest(
      fetchImpl,
      options.repository,
      options.token,
      `/issues/${planned.epicIssue}/sub_issues`,
      {
        method: "POST",
        body: JSON.stringify({ sub_issue_id: created.id }),
      },
    );
    existingIssues.push({ number: created.number, body: planned.body });
    result.created.push({ key: planned.key, issueNumber: created.number });
  }

  return result;
}

function renderReviewIssue(
  policy: SimulatorCurrencyPolicy,
  product: ProductReview,
  scenarios: Map<string, ScenarioReference>,
  key: string,
): string {
  return `${issueMarker(key)}
## Prüfauftrag

Halbjährlicher Abgleich von **${product.displayName}** (${product.version}) mit dem Runtime-Adapter \`${product.runtimeAdapterId}\`.

- Verantwortlich: @${product.owner}
- Fällig: ${product.nextReviewAt}
- Turnus: ${policy.cadenceMonths} Monate

### Produkt-Checkliste

${product.checklist.map((item) => `- [ ] ${item}`).join("\n")}

### Zugeordnete Szenarien

${renderScenarioList(product.scenarioIds, scenarios)}

### Abschlussnachweis

- [ ] Geprüfte reale Produktversion und Datum im Issue dokumentiert
- [ ] Nachweise oder reproduzierbare Beobachtungen ergänzt
- [ ] Abweichungen in \`.github/simulator-currency.json\` mit Szenario-IDs erfasst
- [ ] \`lastReviewedAt\` und \`nextReviewAt\` per Pull Request fortgeschrieben

**Anforderung:** NFR-14
**Epic:** EP-12 — Qualitätssicherung & Lernanalytik`;
}

function renderDeviationIssue(
  product: ProductReview,
  deviation: ProductReview["deviations"][number],
  scenarios: Map<string, ScenarioReference>,
  key: string,
): string {
  return `${issueMarker(key)}
## Festgestellte Abweichung

${deviation.details}

- Produkt: **${product.displayName}**
- Beobachtete Version: ${deviation.observedVersion}
- Runtime-Adapter: \`${product.runtimeAdapterId}\`
- Verantwortlich: @${product.owner}

### Betroffene Szenarien

${renderScenarioList(deviation.scenarioIds, scenarios, "- ⚠️")}

### Akzeptanzkriterien

- [ ] Simulator und semantische Runtime-Referenzen sind an das aktuelle Produktverhalten angepasst
- [ ] Betroffene Lerntexte und Szenarien sind geprüft
- [ ] Automatisierte Tests decken die korrigierte Abweichung ab
- [ ] Abweichung in \`.github/simulator-currency.json\` auf \`resolved\` gesetzt

**Anforderung:** NFR-14
**Epic:** EP-12 — Qualitätssicherung & Lernanalytik`;
}

function renderScenarioList(
  scenarioIds: string[],
  scenarios: Map<string, ScenarioReference>,
  prefix = "-",
): string {
  return scenarioIds
    .map((scenarioId) => {
      const scenario = scenarios.get(scenarioId);
      if (!scenario) throw new Error(`unknown scenario ${scenarioId}`);
      return `${prefix} \`${scenarioId}\` — \`${scenario.filePath}\``;
    })
    .join("\n");
}

function issueMarker(key: string): string {
  return `<!-- simulator-currency:${key} -->`;
}

async function listOpenIssues(
  fetchImpl: FetchLike,
  repository: string,
  token: string,
): Promise<Array<{ number: number; body: string }>> {
  const issues: Array<{ number: number; body: string }> = [];
  for (let page = 1; ; page += 1) {
    const batch = await githubRequest<
      Array<{ number: number; body: string | null; pull_request?: unknown }>
    >(fetchImpl, repository, token, `/issues?state=open&per_page=100&page=${page}`);
    issues.push(
      ...batch
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({ number: issue.number, body: issue.body ?? "" })),
    );
    if (batch.length < 100) return issues;
  }
}

async function githubRequest<T = unknown>(
  fetchImpl: FetchLike,
  repository: string,
  token: string,
  apiPath: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}${apiPath}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${apiPath}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

function validateRequiredLabels(labels: string[], field: string): void {
  for (const prefix of ["epic: ", "prio: ", "type: "]) {
    if (!labels.some((label) => label.startsWith(prefix))) {
      throw new Error(`${field} requires a ${prefix.trim()} label`);
    }
  }
}

function assertUnique(seen: Set<string>, value: string, field: string): void {
  if (seen.has(value)) throw new Error(`duplicate ${field} ${value}`);
  seen.add(value);
}

function assertUniqueValues(values: string[], field: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${field} contains duplicates`);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function toRepositoryPath(filePath: string): string {
  return path.relative(repositoryRoot, filePath).split(path.sep).join("/");
}

function parseArguments(argv: string[]): {
  policyPath?: string;
  asOf: string;
  sync: boolean;
} {
  let policyPath: string | undefined;
  let asOf = new Date().toISOString().slice(0, 10);
  let sync = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--sync") {
      sync = true;
    } else if (argument === "--as-of") {
      asOf = argv[index + 1] ?? "";
      index += 1;
    } else if (argument === "--config") {
      const value = argv[index + 1];
      if (!value) throw new Error("--config requires a path");
      policyPath = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }

  return { ...(policyPath ? { policyPath } : {}), asOf, sync };
}

async function runCli(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const context = await loadSimulatorCurrencyContext(
    options.policyPath ? { policyPath: options.policyPath } : {},
  );
  const plan = buildSimulatorCurrencyIssuePlan(context, options.asOf);

  if (!options.sync) {
    console.log(JSON.stringify({ asOf: options.asOf, issues: plan }, null, 2));
    return;
  }

  const result = await syncSimulatorCurrencyIssues(plan, {
    repository: process.env["GITHUB_REPOSITORY"] ?? "",
    token: process.env["GITHUB_TOKEN"] ?? "",
  });
  for (const item of result.created) {
    console.log(`created #${item.issueNumber} for ${item.key}`);
  }
  for (const item of result.skipped) {
    console.log(`kept #${item.issueNumber} for ${item.key}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
