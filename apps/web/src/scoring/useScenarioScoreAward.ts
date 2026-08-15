import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppendScoreEventResult, TrainingMode } from "@ai-train-lab/training-engine";
import { createApplicationScenarioScoreService } from "./applicationScenarioScoreService";

export type ScenarioScoreAwardStatus = "idle" | "unavailable" | "pending" | "ready" | "error";

export interface ScenarioScoreAwardState {
  status: ScenarioScoreAwardStatus;
  result: AppendScoreEventResult | null;
  error: string | null;
  retry: () => void;
}

const MAX_AUTOMATIC_ATTEMPTS = 5;

function online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

export function useScenarioScoreAward(
  scenarioId: string,
  mode: TrainingMode,
  finishedAt: number | null,
): ScenarioScoreAwardState {
  const service = useMemo(() => createApplicationScenarioScoreService(), []);
  const [retryToken, setRetryToken] = useState(0);
  const [status, setStatus] = useState<ScenarioScoreAwardStatus>(
    service ? "idle" : "unavailable",
  );
  const [result, setResult] = useState<AppendScoreEventResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const retry = useCallback(() => {
    setRetryToken((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!service) {
      setStatus("unavailable");
      setResult(null);
      setError(null);
      return;
    }
    if (finishedAt === null) {
      setStatus("idle");
      setResult(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    let attempts = 0;

    function clearTimer(): void {
      if (timer !== null && typeof window !== "undefined") window.clearTimeout(timer);
      timer = null;
    }

    function scheduleRetry(run: () => void): void {
      if (attempts >= MAX_AUTOMATIC_ATTEMPTS || !online() || typeof window === "undefined") {
        return;
      }
      const delay = Math.min(400 * attempts, 1600);
      timer = window.setTimeout(run, delay);
    }

    function run(): void {
      if (cancelled) return;
      clearTimer();
      attempts += 1;
      setStatus("pending");
      setError(null);

      void service
        .awardScenario({ scenarioId, mode })
        .then((award) => {
          if (cancelled) return;
          setResult(award);
          setStatus("ready");
          setError(null);
        })
        .catch((reason: unknown) => {
          if (cancelled) return;
          const message = reason instanceof Error ? reason.message : "Score konnte nicht geladen werden";
          setError(message);
          setStatus("error");
          scheduleRetry(run);
        });
    }

    function handleOnline(): void {
      attempts = 0;
      run();
    }

    setResult(null);
    run();
    if (typeof window !== "undefined") window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      clearTimer();
      if (typeof window !== "undefined") window.removeEventListener("online", handleOnline);
    };
  }, [finishedAt, mode, retryToken, scenarioId, service]);

  return { status, result, error, retry };
}
