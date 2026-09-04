import { createHash } from "node:crypto";

const REDACTED = "[REDACTED]";
const MAX_TEXT = 240;

const secretPatterns = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\b(?:authorization|cookie|set-cookie|x-api-key)\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
];

const piiPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:user|tenant)[_-]?id\s*[:=]\s*[^\s,;]+/gi,
];

function cleanText(value) {
  if (typeof value !== "string") return undefined;
  let result = value;
  for (const pattern of [...secretPatterns, ...piiPatterns]) {
    result = result.replace(pattern, REDACTED);
  }
  result = result.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return result.slice(0, MAX_TEXT) || undefined;
}

export function sanitizeRuntimeIncident(input) {
  if (!input || typeof input !== "object") throw new TypeError("incident input is required");

  const errorCode = cleanText(input.errorCode);
  const errorClass = cleanText(input.errorClass);
  const component = cleanText(input.component);
  const releaseSha = cleanText(input.releaseSha);
  if (!errorCode || !errorClass || !component || !releaseSha) {
    throw new TypeError("errorCode, errorClass, component and releaseSha are required");
  }

  return Object.freeze({
    errorCode,
    errorClass,
    component,
    releaseSha,
    safeContext: cleanText(input.safeContext),
    recovery: cleanText(input.recovery),
  });
}

export function fingerprintRuntimeIncident(incident) {
  const safe = sanitizeRuntimeIncident(incident);
  return createHash("sha256")
    .update([safe.errorCode, safe.errorClass, safe.component].join("\u001f"))
    .digest("hex");
}

export function buildRuntimeIncidentIssue(incident, aggregate) {
  const safe = sanitizeRuntimeIncident(incident);
  const count =
    Number.isSafeInteger(aggregate?.count) && aggregate.count > 0 ? aggregate.count : 1;
  const firstSeen = cleanText(aggregate?.firstSeen) ?? "unknown";
  const lastSeen = cleanText(aggregate?.lastSeen) ?? firstSeen;
  const fingerprint = fingerprintRuntimeIncident(safe);

  const context = safe.safeContext ? `\n- Safe context: ${safe.safeContext}` : "";
  const recovery = safe.recovery ? `\n- Recovery: ${safe.recovery}` : "";
  return Object.freeze({
    fingerprint,
    title: `[runtime-incident] ${safe.errorCode} in ${safe.component}`,
    body: `Automated runtime evidence; human senior review is required.\n\n- Error class: ${safe.errorClass}\n- Error code: ${safe.errorCode}\n- Component: ${safe.component}\n- Release SHA: ${safe.releaseSha}\n- Occurrences: ${count}\n- First seen: ${firstSeen}\n- Last seen: ${lastSeen}${context}${recovery}\n- Fingerprint: ${fingerprint}`,
    labels: ["source: runtime-incident", "needs: senior-review"],
  });
}

export function createIncidentGate({
  maxEvents = 20,
  windowMs = 60_000,
  failureThreshold = 5,
} = {}) {
  const events = [];
  let consecutiveFailures = 0;
  let circuitOpen = false;

  return Object.freeze({
    admit(now = Date.now()) {
      while (events.length && now - events[0] >= windowMs) events.shift();
      if (circuitOpen) return Object.freeze({ allowed: false, reason: "circuit-open" });
      if (events.length >= maxEvents) {
        return Object.freeze({ allowed: false, reason: "rate-limited" });
      }
      events.push(now);
      return Object.freeze({ allowed: true, reason: "accepted" });
    },
    recordDelivery(success) {
      consecutiveFailures = success ? 0 : consecutiveFailures + 1;
      if (consecutiveFailures >= failureThreshold) circuitOpen = true;
    },
    resetCircuit() {
      consecutiveFailures = 0;
      circuitOpen = false;
    },
  });
}
