import { browserLocalStorage } from "@/persistence/adapters/browserLocalStorage";

export type FeedbackSource = "tutor" | "completion";
export type FeedbackKind = "problem" | "ux" | "improvement" | "general";
export type FeedbackViewportClass = "compact" | "small" | "medium" | "large" | "unknown";

export interface FeedbackRuntimeContextSnapshot {
  productId: string | null;
  capabilities: string[];
  viewportClass: FeedbackViewportClass;
  stepStatus: string | null;
  hintsUsed: number;
  mistakes: number;
}

export interface FeedbackScreenshotAttachment {
  kind: "screenshot";
  mediaType: "image/png";
  dataUrl: string;
  width: number;
  height: number;
  capturedArea: "training-surface";
}

export interface FeedbackContextSnapshot {
  scenarioId: string;
  stepId: string | null;
  mode: string;
  runtimeAdapterId: string | null;
  runtime: FeedbackRuntimeContextSnapshot | null;
  appVersion: string;
  commit: string;
  timestamp: string;
}

export interface FeedbackRecord {
  id: string;
  source: FeedbackSource;
  kind: FeedbackKind;
  text: string;
  context: FeedbackContextSnapshot;
  screenshot?: FeedbackScreenshotAttachment;
}

interface PersistedFeedbackRecord {
  id: string;
  source: FeedbackSource;
  kind?: FeedbackKind;
  text: string;
  context: {
    scenarioId: string;
    stepId: string | null;
    mode: string;
    runtimeAdapterId: string | null;
    runtime?: FeedbackRuntimeContextSnapshot | null;
    appVersion: string;
    commit: string;
    timestamp: string;
  };
  screenshot?: FeedbackScreenshotAttachment;
}

export interface SaveFeedbackOptions {
  kind?: FeedbackKind;
  screenshot?: FeedbackScreenshotAttachment | null;
}

const STORAGE_KEY = "ai-training-lab:feedback:v1";
const NOTICE_KEY = "ai-training-lab:feedback-notice:v1";

function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `feedback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isViewportClass(value: unknown): value is FeedbackViewportClass {
  return (
    value === "compact" ||
    value === "small" ||
    value === "medium" ||
    value === "large" ||
    value === "unknown"
  );
}

function isRuntimeContext(
  value: unknown,
): value is FeedbackRuntimeContextSnapshot | null | undefined {
  if (value === null || value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const runtime = value as Record<string, unknown>;
  return (
    (runtime["productId"] === null || typeof runtime["productId"] === "string") &&
    Array.isArray(runtime["capabilities"]) &&
    runtime["capabilities"].every((capability) => typeof capability === "string") &&
    isViewportClass(runtime["viewportClass"]) &&
    (runtime["stepStatus"] === null || typeof runtime["stepStatus"] === "string") &&
    typeof runtime["hintsUsed"] === "number" &&
    typeof runtime["mistakes"] === "number"
  );
}

function isScreenshotAttachment(value: unknown): value is FeedbackScreenshotAttachment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const screenshot = value as Record<string, unknown>;
  return (
    screenshot["kind"] === "screenshot" &&
    screenshot["mediaType"] === "image/png" &&
    typeof screenshot["dataUrl"] === "string" &&
    screenshot["dataUrl"].startsWith("data:image/png;base64,") &&
    typeof screenshot["width"] === "number" &&
    typeof screenshot["height"] === "number" &&
    screenshot["capturedArea"] === "training-surface"
  );
}

function isFeedbackKind(value: unknown): value is FeedbackKind {
  return value === "problem" || value === "ux" || value === "improvement" || value === "general";
}

function isPersistedFeedbackRecord(value: unknown): value is PersistedFeedbackRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const context = record["context"];
  if (!context || typeof context !== "object" || Array.isArray(context)) return false;
  const snapshot = context as Record<string, unknown>;
  const kind = record["kind"];
  const screenshot = record["screenshot"];
  return (
    typeof record["id"] === "string" &&
    (record["source"] === "tutor" || record["source"] === "completion") &&
    (kind === undefined || isFeedbackKind(kind)) &&
    typeof record["text"] === "string" &&
    typeof snapshot["scenarioId"] === "string" &&
    (snapshot["stepId"] === null || typeof snapshot["stepId"] === "string") &&
    typeof snapshot["mode"] === "string" &&
    (snapshot["runtimeAdapterId"] === null || typeof snapshot["runtimeAdapterId"] === "string") &&
    isRuntimeContext(snapshot["runtime"]) &&
    typeof snapshot["appVersion"] === "string" &&
    typeof snapshot["commit"] === "string" &&
    typeof snapshot["timestamp"] === "string" &&
    (screenshot === undefined || isScreenshotAttachment(screenshot))
  );
}

function normalizeFeedbackRecord(record: PersistedFeedbackRecord): FeedbackRecord {
  return {
    id: record.id,
    source: record.source,
    kind: record.kind ?? "general",
    text: record.text,
    context: {
      ...record.context,
      runtime: record.context.runtime ?? null,
    },
    ...(record.screenshot ? { screenshot: record.screenshot } : {}),
  };
}

export function loadFeedbackRecords(): FeedbackRecord[] {
  const storage = browserLocalStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isPersistedFeedbackRecord).map(normalizeFeedbackRecord)
      : [];
  } catch {
    return [];
  }
}

export function saveFeedbackRecord(
  source: FeedbackSource,
  text: string,
  context: Omit<FeedbackContextSnapshot, "timestamp">,
  options: SaveFeedbackOptions = {},
): FeedbackRecord {
  const storage = browserLocalStorage();
  if (!storage) throw new Error("Feedback storage is not available");

  const normalizedText = text.trim();
  if (!normalizedText) throw new TypeError("Feedback text must not be empty");

  const record: FeedbackRecord = {
    id: createId(),
    source,
    kind: options.kind ?? "general",
    text: normalizedText,
    context: {
      ...context,
      timestamp: new Date().toISOString(),
    },
    ...(options.screenshot ? { screenshot: options.screenshot } : {}),
  };
  const records = [...loadFeedbackRecords(), record];
  storage.setItem(STORAGE_KEY, JSON.stringify(records));
  return record;
}

export function hasAcknowledgedFeedbackNotice(): boolean {
  return browserLocalStorage()?.getItem(NOTICE_KEY) === "1";
}

export function acknowledgeFeedbackNotice(): void {
  browserLocalStorage()?.setItem(NOTICE_KEY, "1");
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
