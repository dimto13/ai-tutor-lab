import { sameTrainingStateKey } from "@ai-train-lab/training-engine";
import type { TrainingStateKey } from "@ai-train-lab/training-engine";
import {
  OFFLINE_TRAINING_STATE_SCHEMA_VERSION,
  type OfflineRuntimeEntry,
  type OfflineSessionEntry,
  type OfflineTrainingStateStore,
} from "../offlineTrainingStateStore.ts";
import { browserLocalStorage } from "./browserLocalStorage.ts";
import type { StorageLike } from "./localStorageTrainingStateRepository.ts";

function subjectKey(key: TrainingStateKey): string {
  const tenantKey =
    key.subject.tenantId === null
      ? "tenant:none"
      : `tenant:value:${encodeURIComponent(key.subject.tenantId)}`;
  return `${tenantKey}:user:${encodeURIComponent(key.subject.userId)}`;
}

export function offlineSessionStorageKey(key: TrainingStateKey): string {
  return `ai-training-lab:${subjectKey(key)}:${encodeURIComponent(key.scenarioId)}:mode:${key.mode}:offline-sync:session:v1`;
}

export function offlineRuntimeStorageKey(key: TrainingStateKey, runtimeId: string): string {
  return `ai-training-lab:${subjectKey(key)}:${encodeURIComponent(key.scenarioId)}:mode:${key.mode}:offline-sync:runtime:${encodeURIComponent(runtimeId)}:v1`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRemoteRevision(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && (value as number) >= 0);
}

function parseStoredKey(value: unknown): TrainingStateKey | null {
  if (!isObject(value)) return null;
  const subject = value["subject"];
  if (!isObject(subject) || typeof subject["userId"] !== "string") return null;
  if (subject["tenantId"] !== null && typeof subject["tenantId"] !== "string") return null;
  const mode = value["mode"];
  if (mode !== "explore" && mode !== "guided" && mode !== "challenge") return null;
  if (typeof value["scenarioId"] !== "string") return null;

  return {
    subject: {
      userId: subject["userId"],
      tenantId: subject["tenantId"] as string | null,
    },
    scenarioId: value["scenarioId"],
    mode,
  };
}

function parseCommon(raw: string, key: TrainingStateKey): Record<string, unknown> | null {
  const parsed: unknown = JSON.parse(raw);
  if (!isObject(parsed)) return null;
  if (parsed["schemaVersion"] !== OFFLINE_TRAINING_STATE_SCHEMA_VERSION) return null;
  const storedKey = parseStoredKey(parsed["key"]);
  if (!storedKey || !sameTrainingStateKey(storedKey, key)) return null;
  if (!isRemoteRevision(parsed["remoteRevision"])) return null;
  if (typeof parsed["updatedAt"] !== "number" || !Number.isFinite(parsed["updatedAt"])) return null;
  if (typeof parsed["pending"] !== "boolean") return null;
  return parsed;
}

function parseSession(raw: string, key: TrainingStateKey): OfflineSessionEntry | null {
  const parsed = parseCommon(raw, key);
  if (!parsed || !isObject(parsed["value"])) return null;
  return parsed as unknown as OfflineSessionEntry;
}

function parseRuntime(
  raw: string,
  key: TrainingStateKey,
  runtimeId: string,
): OfflineRuntimeEntry | null {
  const parsed = parseCommon(raw, key);
  if (!parsed || parsed["runtimeId"] !== runtimeId || typeof parsed["deleted"] !== "boolean") {
    return null;
  }
  return parsed as unknown as OfflineRuntimeEntry;
}

export class LocalStorageOfflineTrainingStateStore implements OfflineTrainingStateStore {
  readonly storage: StorageLike;

  constructor(storage: StorageLike) {
    this.storage = storage;
  }

  loadSession(key: TrainingStateKey): OfflineSessionEntry | null {
    const raw = this.storage.getItem(offlineSessionStorageKey(key));
    if (!raw) return null;
    try {
      return parseSession(raw, key);
    } catch {
      return null;
    }
  }

  saveSession(entry: OfflineSessionEntry): void {
    this.storage.setItem(offlineSessionStorageKey(entry.key), JSON.stringify(entry));
  }

  deleteSession(key: TrainingStateKey): void {
    this.storage.removeItem(offlineSessionStorageKey(key));
  }

  loadRuntimeSnapshot(key: TrainingStateKey, runtimeId: string): OfflineRuntimeEntry | null {
    const raw = this.storage.getItem(offlineRuntimeStorageKey(key, runtimeId));
    if (!raw) return null;
    try {
      return parseRuntime(raw, key, runtimeId);
    } catch {
      return null;
    }
  }

  saveRuntimeSnapshot(entry: OfflineRuntimeEntry): void {
    this.storage.setItem(
      offlineRuntimeStorageKey(entry.key, entry.runtimeId),
      JSON.stringify(entry),
    );
  }

  deleteRuntimeSnapshot(key: TrainingStateKey, runtimeId: string): void {
    this.storage.removeItem(offlineRuntimeStorageKey(key, runtimeId));
  }
}

export function createBrowserOfflineTrainingStateStore(): OfflineTrainingStateStore {
  const storage = browserLocalStorage();
  if (!storage) throw new Error("Offline training state store requires window.localStorage");
  return new LocalStorageOfflineTrainingStateStore(storage);
}
