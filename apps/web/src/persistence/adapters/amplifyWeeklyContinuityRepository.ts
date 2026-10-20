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
    if (typeof run.finishedAt !== "number") continue;

    // `durationMs` is the wall-clock time between start and finish, breaks included. Only the
    // measured learning time counts (#582).
    const continuityRun: WeeklyContinuityRun = {
      finishedAt: run.finishedAt,
      learningMs: typeof run.activeDurationMs === "number" ? run.activeDurationMs : null,
    };
    if (typeof run.scenarioId === "string") continuityRun.scenarioId = run.scenarioId;
    if (typeof run.mode === "string") continuityRun.mode = run.mode;
    if (typeof run.sessionId === "string") continuityRun.sessionId = run.sessionId;
    runs.push(continuityRun);
  }
  return runs;
}
