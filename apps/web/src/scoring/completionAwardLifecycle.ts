import type { AppendScoreEventResult, TrainingMode } from "@ai-train-lab/training-engine";

/**
 * Completion-side bookkeeping for the two independent server outcomes of finishing a training:
 * the authoritative score award and — for challenges — the issued attestation.
 *
 * They are tracked separately on purpose. A failed attestation must never present the awarded
 * score as unsaved (#456 regression class), and a remembered award must never be replayed just
 * because the attestation is retried.
 */

const MAX_REMEMBERED_COMPLETIONS = 64;

const rememberedAwards = new Map<string, AppendScoreEventResult>();
const pendingAwards = new Map<string, Promise<AppendScoreEventResult>>();
const issuedAttestations = new Set<string>();
const pendingAttestations = new Map<string, Promise<void>>();

export const AWARD_FAILURE_MESSAGE = "Score konnte nicht gespeichert werden";
export const ATTESTATION_FAILURE_MESSAGE = "Nachweis konnte nicht ausgestellt werden";

export function completionKey(scenarioId: string, mode: TrainingMode, finishedAt: number): string {
  return `${scenarioId}\u0000${mode}\u0000${finishedAt}`;
}

export function failureMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message.length > 0 ? reason.message : fallback;
}

function evict<T>(entries: Map<string, T> | Set<string>): void {
  while (entries.size > MAX_REMEMBERED_COMPLETIONS) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function rememberedAward(key: string): AppendScoreEventResult | null {
  return rememberedAwards.get(key) ?? null;
}

/**
 * Deduplicates the award across re-renders and concurrent completion screens: the first caller
 * starts the request, every later caller joins the same in-flight promise.
 */
export async function awardOnce(
  key: string,
  start: () => Promise<AppendScoreEventResult>,
): Promise<AppendScoreEventResult> {
  const remembered = rememberedAwards.get(key);
  if (remembered) return remembered;

  let running = pendingAwards.get(key);
  if (!running) {
    const started = start();
    running = started;
    pendingAwards.set(key, started);
    // One combined handler keeps the bookkeeping out of the caller's promise chain without
    // leaving a rejected derived promise behind.
    void started.then(
      (award) => {
        rememberedAwards.delete(key);
        rememberedAwards.set(key, award);
        evict(rememberedAwards);
        if (pendingAwards.get(key) === started) pendingAwards.delete(key);
      },
      () => {
        if (pendingAwards.get(key) === started) pendingAwards.delete(key);
      },
    );
  }
  return running;
}

export function attestationIssued(key: string): boolean {
  return issuedAttestations.has(key);
}

/** Same deduplication for the attestation, tracked independently from the award. */
export async function issueAttestationOnce(key: string, start: () => Promise<void>): Promise<void> {
  if (issuedAttestations.has(key)) return;

  let running = pendingAttestations.get(key);
  if (!running) {
    const started = start();
    running = started;
    pendingAttestations.set(key, started);
    void started.then(
      () => {
        issuedAttestations.add(key);
        evict(issuedAttestations);
        if (pendingAttestations.get(key) === started) pendingAttestations.delete(key);
      },
      () => {
        if (pendingAttestations.get(key) === started) pendingAttestations.delete(key);
      },
    );
  }
  return running;
}

/** Test seam: the ledger is module state because completion screens mount and unmount freely. */
export function resetCompletionLedger(): void {
  rememberedAwards.clear();
  pendingAwards.clear();
  issuedAttestations.clear();
  pendingAttestations.clear();
}
