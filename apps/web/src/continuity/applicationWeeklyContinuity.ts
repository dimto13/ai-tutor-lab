import { loadAmplifyWeeklyContinuityRuns } from "@/persistence/adapters/amplifyWeeklyContinuityRepository";
import type { WeeklyContinuityRun } from "./weeklyContinuity";

function configuredMode(): "local" | "remote" {
  const authMode = import.meta.env["VITE_AUTH_MODE"]?.trim().toLowerCase();
  if (authMode === "local") return "local";
  if (authMode === "cognito") return "remote";
  return import.meta.env.PROD ? "remote" : "local";
}

export async function loadMyWeeklyContinuityRuns(): Promise<WeeklyContinuityRun[]> {
  if (configuredMode() === "local") return [];
  return loadAmplifyWeeklyContinuityRuns();
}
