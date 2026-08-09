export const REAL_RUNTIME_EVENT_TYPES = [
  "runtime.ready",
  "file.opened",
  "file.saved",
  "terminal.opened",
] as const;

export type RealRuntimeEventType = (typeof REAL_RUNTIME_EVENT_TYPES)[number];

export interface RectLike {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface RealRuntimeEvent {
  id: string;
  source: string;
  type: RealRuntimeEventType;
  timestamp: string;
  sessionId: string;
  payload: Record<string, unknown>;
}

const fargateFrankfurtPricesUsd = {
  x86_64: { vCpuHour: 0.04656, memoryGbHour: 0.00511 },
  arm64: { vCpuHour: 0.03725, memoryGbHour: 0.00409 },
  extraStorageGbHour: 0.000132,
} as const;

export function translateEmbeddedTargetRect(frame: RectLike, target: RectLike): RectLike {
  return {
    top: frame.top + target.top,
    left: frame.left + target.left,
    width: target.width,
    height: target.height,
  };
}

export function isRealRuntimeEvent(
  input: unknown,
  expected: { source: string; sessionId: string },
): input is RealRuntimeEvent {
  if (!isRecord(input) || !isRecord(input["payload"])) return false;
  if (input["source"] !== expected.source || input["sessionId"] !== expected.sessionId) {
    return false;
  }
  if (!REAL_RUNTIME_EVENT_TYPES.includes(input["type"] as RealRuntimeEventType)) return false;
  if (typeof input["id"] !== "string" || input["id"].length === 0) return false;
  if (typeof input["timestamp"] !== "string" || !Number.isFinite(Date.parse(input["timestamp"]))) {
    return false;
  }
  const type = input["type"] as RealRuntimeEventType;
  return !containsDocumentContent(input["payload"]) && hasExpectedPayload(type, input["payload"]);
}

export function estimateFargateSessionCost(options: {
  architecture: "x86_64" | "arm64";
  seconds: number;
  vCpu?: number;
  memoryGb?: number;
  ephemeralStorageGb?: number;
}): {
  cpuUsd: number;
  memoryUsd: number;
  extraStorageUsd: number;
  totalUsd: number;
} {
  if (!Number.isFinite(options.seconds) || options.seconds < 0) {
    throw new Error("seconds must be a non-negative number");
  }
  const vCpu = options.vCpu ?? 1;
  const memoryGb = options.memoryGb ?? 2;
  const ephemeralStorageGb = options.ephemeralStorageGb ?? 30;
  for (const [name, value] of Object.entries({ vCpu, memoryGb, ephemeralStorageGb })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative`);
  }

  const hours = options.seconds / 3600;
  const prices = fargateFrankfurtPricesUsd[options.architecture];
  const cpuUsd = vCpu * prices.vCpuHour * hours;
  const memoryUsd = memoryGb * prices.memoryGbHour * hours;
  const extraStorageUsd =
    Math.max(0, ephemeralStorageGb - 20) * fargateFrankfurtPricesUsd.extraStorageGbHour * hours;
  return {
    cpuUsd,
    memoryUsd,
    extraStorageUsd,
    totalUsd: cpuUsd + memoryUsd + extraStorageUsd,
  };
}

function containsDocumentContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsDocumentContent);
  if (!isRecord(value)) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (["content", "contents", "documenttext", "text"].includes(key.toLowerCase())) return true;
    if (containsDocumentContent(nested)) return true;
  }
  return false;
}

function hasExpectedPayload(type: RealRuntimeEventType, payload: Record<string, unknown>): boolean {
  const keys = Object.keys(payload).sort();
  if (type === "runtime.ready") {
    return (
      keys.join(",") === "openDocumentCount" &&
      Number.isInteger(payload["openDocumentCount"]) &&
      Number(payload["openDocumentCount"]) >= 0
    );
  }
  if (type === "file.opened" || type === "file.saved") {
    return (
      keys.join(",") === "filename,uriScheme" &&
      typeof payload["filename"] === "string" &&
      payload["filename"].length > 0 &&
      typeof payload["uriScheme"] === "string" &&
      payload["uriScheme"].length > 0
    );
  }
  return keys.length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
