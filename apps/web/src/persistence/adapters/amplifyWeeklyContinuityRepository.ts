import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../../../amplify/data/resource";
import type { WeeklyContinuityRun } from "../../continuity/weeklyContinuity";

const RUN_LIMIT = 100;

export async function loadAmplifyWeeklyContinuityRuns(): Promise<WeeklyContinuityRun[]> {
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
