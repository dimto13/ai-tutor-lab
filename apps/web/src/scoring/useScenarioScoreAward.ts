import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppendScoreEventResult, TrainingMode } from "@ai-train-lab/training-engine";
import { createApplicationAttestationService } from "../attestations/applicationAttestationService";
import { createApplicationScenarioScoreService } from "./applicationScenarioScoreService";

export type ScenarioScoreAwardStatus = "idle" | "unavailable" | "pending" | "ready" | "error";

export interface ScenarioScoreAwardState {
  status: ScenarioScoreAwardStatus;
  result: AppendScoreEventResult | null;
  error: string | null;
  retry: () => void;
}

interface RememberedScoreAward {
  award: AppendScoreEventResult;
}

const MAX_REMEMBERED_AWARDS = 64;
const rememberedAwards = new Map<string, RememberedScoreAward>();
const pendingAwards = new Map<string, Promise<AppendScoreEventResult>>();

function completionKey(scenarioId: string, mode: TrainingMode, finishedAt: number): string {
  return `${scenarioId}\u0000${mode}\u0000${finishedAt}`;
}

function rememberAward(key: string, award: AppendScoreEventResult): void {
  rememberedAwards.delete(key);
  rememberedAwards.set(key, { award });
  while (rememberedAwards.size > MAX_REMEMBERED_AWARDS) {
    const oldestKey = rememberedAwards.keys().next().value;
    if (oldestKey === undefined) break;
    rememberedAwards.delete(oldestKey);
  }
}

export function useScenarioScoreAward(
  scenarioId: string,
  mode: TrainingMode,
  finishedAt: number | null,
): ScenarioScoreAwardState {
  const service = useMemo(() => createApplicationScenarioScoreService(), []);
  const attestationService = useMemo(() => createApplicationAttestationService(), []);
  const [retryToken, setRetryToken] = useState(0);
  const [status, setStatus] = useState<ScenarioScoreAwardStatus>(service ? "idle" : "unavailable");
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

    const activeService = service;
    const activeAttestationService = attestationService;
    const activeCompletionKey = completionKey(scenarioId, mode, finishedAt);
    const remembered = rememberedAwards.get(activeCompletionKey);
    let cancelled = false;

    if (remembered) {
      setResult(remembered.award);
      setStatus("ready");
      setError(null);
      return;
    }

    setStatus("pending");
    setResult(null);
    setError(null);

    let completionPromise = pendingAwards.get(activeCompletionKey);
    if (!completionPromise) {
      completionPromise = activeService.awardScenario({ scenarioId, mode }).then(async (award) => {
        if (mode === "challenge" && activeAttestationService) {
          await activeAttestationService.issueChallenge({ scenarioId });
        }
        rememberAward(activeCompletionKey, award);
        return award;
      });
      pendingAwards.set(activeCompletionKey, completionPromise);
      void completionPromise.finally(() => {
        if (pendingAwards.get(activeCompletionKey) === completionPromise) {
          pendingAwards.delete(activeCompletionKey);
        }
      });
    }

    void completionPromise
      .then((award) => {
        if (cancelled) return;
        setResult(award);
        setStatus("ready");
        setError(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message =
          reason instanceof Error ? reason.message : "Score konnte nicht gespeichert werden";
        setResult(null);
        setError(message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [attestationService, finishedAt, mode, retryToken, scenarioId, service]);

  return { status, result, error, retry };
}
