import type { UiTargetRef } from "@/types/training";

export interface TutorAttentionRequest {
  requestId: number;
  targetIds: UiTargetRef[];
  label: string;
}

type TutorAttentionListener = () => void;

let currentTutorAttention: TutorAttentionRequest | null = null;
let requestSequence = 0;
const tutorAttentionListeners = new Set<TutorAttentionListener>();

export function getTutorAttention(): TutorAttentionRequest | null {
  return currentTutorAttention;
}

export function getTutorAttentionServerSnapshot(): TutorAttentionRequest | null {
  return null;
}

export function subscribeTutorAttention(listener: TutorAttentionListener): () => void {
  tutorAttentionListeners.add(listener);
  return () => tutorAttentionListeners.delete(listener);
}

function publish(): void {
  for (const listener of tutorAttentionListeners) listener();
}

export function requestTutorAttention(targetIds: readonly UiTargetRef[], label: string): void {
  const normalizedTargets = [...new Set(targetIds)];
  if (normalizedTargets.length === 0) {
    clearTutorAttention();
    return;
  }

  requestSequence += 1;
  currentTutorAttention = {
    requestId: requestSequence,
    targetIds: normalizedTargets,
    label,
  };
  publish();
}

export function clearTutorAttention(requestId?: number): void {
  if (!currentTutorAttention) return;
  if (requestId !== undefined && currentTutorAttention.requestId !== requestId) return;
  currentTutorAttention = null;
  publish();
}
