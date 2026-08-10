export type FeedbackSource = "tutor" | "completion";

export interface FeedbackContextSnapshot {
  scenarioId: string;
  stepId: string | null;
  mode: string;
  runtimeAdapterId: string | null;
  appVersion: string;
  commit: string;
  timestamp: string;
}

export interface FeedbackRecord {
  id: string;
  source: FeedbackSource;
  text: string;
  context: FeedbackContextSnapshot;
}

const STORAGE_KEY = "ai-training-lab:feedback:v1";
const NOTICE_KEY = "ai-training-lab:feedback-notice:v1";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `feedback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isFeedbackRecord(value: unknown): value is FeedbackRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const context = record["context"];
  if (!context || typeof context !== "object" || Array.isArray(context)) return false;
  const snapshot = context as Record<string, unknown>;
  return (
    typeof record["id"] === "string" &&
    (record["source"] === "tutor" || record["source"] === "completion") &&
    typeof record["text"] === "string" &&
    typeof snapshot["scenarioId"] === "string" &&
    (snapshot["stepId"] === null || typeof snapshot["stepId"] === "string") &&
    typeof snapshot["mode"] === "string" &&
    (snapshot["runtimeAdapterId"] === null || typeof snapshot["runtimeAdapterId"] === "string") &&
    typeof snapshot["appVersion"] === "string" &&
    typeof snapshot["commit"] === "string" &&
    typeof snapshot["timestamp"] === "string"
  );
}

export function loadFeedbackRecords(): FeedbackRecord[] {
  const localStorage = storage();
  if (!localStorage) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isFeedbackRecord) : [];
  } catch {
    return [];
  }
}

export function saveFeedbackRecord(
  source: FeedbackSource,
  text: string,
  context: Omit<FeedbackContextSnapshot, "timestamp">,
): FeedbackRecord {
  const localStorage = storage();
  if (!localStorage) throw new Error("Feedback storage is not available");

  const normalizedText = text.trim();
  if (!normalizedText) throw new TypeError("Feedback text must not be empty");

  const record: FeedbackRecord = {
    id: createId(),
    source,
    text: normalizedText,
    context: {
      ...context,
      timestamp: new Date().toISOString(),
    },
  };
  const records = [...loadFeedbackRecords(), record];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  return record;
}

export function hasAcknowledgedFeedbackNotice(): boolean {
  return storage()?.getItem(NOTICE_KEY) === "1";
}

export function acknowledgeFeedbackNotice(): void {
  storage()?.setItem(NOTICE_KEY, "1");
}

export function feedbackExportJson(): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      feedback: loadFeedbackRecords(),
    },
    null,
    2,
  );
}

export function downloadFeedbackExport(): void {
  const blob = new Blob([feedbackExportJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ai-training-lab-feedback-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
