import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../../amplify/data/resource";
import type { WeeklyContinuityRun } from "./weeklyContinuity";

const RUN_LIMIT = 100;

function configuredMode(): "local" | "remote" {
  const authMode = import.meta.env["VITE_AUTH_MODE"]?.trim().toLowerCase();
  if (authMode === "local") return "local";
  if (authMode === "cognito") return "remote";
  return import.meta.env.PROD ? "remote" : "local";
}

export async function loadMyWeeklyContinuityRuns(): Promise<WeeklyContinuityRun[]> {
  if (configuredMode() === "local") return [];

  const client = generateClient<Schema>();
  const result = await client.queries.listMyScenarioRuns({ limit: RUN_LIMIT });
  if (result.errors?.length) {
    const message = result.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(message || "Lernverlauf konnte nicht geladen werden.");
  }

  const runs: WeeklyContinuityRun[] = [];
  for (const run of result.data ?? []) {
    if (!run) continue;
    if (typeof run.finishedAt !== "number" || typeof run.durationMs !== "number") continue;
    runs.push({ finishedAt: run.finishedAt, durationMs: run.durationMs });
  }
  return runs;
}
