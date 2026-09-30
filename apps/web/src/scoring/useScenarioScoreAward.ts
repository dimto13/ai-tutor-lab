import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppendScoreEventResult, TrainingMode } from "@ai-train-lab/training-engine";
import { createApplicationAttestationService } from "../attestations/applicationAttestationService";
import { createApplicationScenarioScoreService } from "./applicationScenarioScoreService";
import {
  ATTESTATION_FAILURE_MESSAGE,
  AWARD_FAILURE_MESSAGE,
  attestationIssued,
  awardOnce,
  completionKey,
  failureMessage,
  issueAttestationOnce,
  rememberedAward,
} from "./completionAwardLifecycle";

export type ScenarioScoreAwardStatus = "idle" | "unavailable" | "pending" | "ready" | "error";
export type ScenarioAttestationStatus = "idle" | "unavailable" | "pending" | "ready" | "error";

export interface ScenarioScoreAwardState {
  status: ScenarioScoreAwardStatus;
  result: AppendScoreEventResult | null;
  error: string | null;
  /** Challenge attestations are a separate server outcome and never change `status`. */
  attestationStatus: ScenarioAttestationStatus;
  attestationError: string | null;
  retry: () => void;
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
  const [attestationStatus, setAttestationStatus] = useState<ScenarioAttestationStatus>("idle");
  const [attestationError, setAttestationError] = useState<string | null>(null);

  const retry = useCallback(() => {
    setRetryToken((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!service) {
      setStatus("unavailable");
      setResult(null);
      setError(null);
      setAttestationStatus("unavailable");
      setAttestationError(null);
      return;
    }
    if (finishedAt === null) {
      setStatus("idle");
      setResult(null);
      setError(null);
      setAttestationStatus("idle");
      setAttestationError(null);
      return;
    }

    const activeService = service;
    const activeAttestationService = attestationService;
    const activeCompletionKey = completionKey(scenarioId, mode, finishedAt);
    let cancelled = false;

    const remembered = rememberedAward(activeCompletionKey);
    if (remembered) {
      setResult(remembered);
      setStatus("ready");
      setError(null);
    } else {
      setStatus("pending");
      setResult(null);
      setError(null);
    }

    void (async () => {
      if (!remembered) {
        try {
          const award = await awardOnce(activeCompletionKey, () =>
            activeService.awardScenario({ scenarioId, mode }),
          );
          if (cancelled) return;
          setResult(award);
          setStatus("ready");
          setError(null);
        } catch (reason: unknown) {
          if (cancelled) return;
          setResult(null);
          setError(failureMessage(reason, AWARD_FAILURE_MESSAGE));
          setStatus("error");
          setAttestationStatus("idle");
          setAttestationError(null);
          return;
        }
      }

      if (mode !== "challenge") {
        if (!cancelled) {
          setAttestationStatus("idle");
          setAttestationError(null);
        }
        return;
      }
      if (!activeAttestationService) {
        if (!cancelled) {
          setAttestationStatus("unavailable");
          setAttestationError(null);
        }
        return;
      }
      if (attestationIssued(activeCompletionKey)) {
        if (!cancelled) {
          setAttestationStatus("ready");
          setAttestationError(null);
        }
        return;
      }

      if (!cancelled) {
        setAttestationStatus("pending");
        setAttestationError(null);
      }
      try {
        await issueAttestationOnce(activeCompletionKey, async () => {
          await activeAttestationService.issueChallenge({ scenarioId });
        });
        if (cancelled) return;
        setAttestationStatus("ready");
        setAttestationError(null);
      } catch (reason: unknown) {
        if (cancelled) return;
        // The score stays awarded; only the attestation is missing.
        setAttestationStatus("error");
        setAttestationError(failureMessage(reason, ATTESTATION_FAILURE_MESSAGE));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attestationService, finishedAt, mode, retryToken, scenarioId, service]);

  return { status, result, error, attestationStatus, attestationError, retry };
}
