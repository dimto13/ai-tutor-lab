import { spawn } from "node:child_process";

export const quotaFloor = 50;
export const berlinDay = (now) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(now));

export function evaluateQuota(result, now = Date.now()) {
  const unknown = {
    status: "SKIPPED_QUOTA_UNKNOWN",
    provider: "codex",
    checkedAt: now,
    day: berlinDay(now),
    retryAfter: now + 15 * 60_000,
    remainingPercent: null,
    windows: [],
  };
  if (!result || typeof result !== "object") return unknown;
  const buckets =
    result.rateLimitsByLimitId && Object.keys(result.rateLimitsByLimitId).length
      ? Object.values(result.rateLimitsByLimitId)
      : result.rateLimits
        ? [result.rateLimits]
        : [];
  const windows = [];
  for (const bucket of buckets) {
    if (!bucket?.primary || bucket.rateLimitReachedType || bucket.spendControlReached)
      return unknown;
    for (const name of ["primary", "secondary"]) {
      const window = bucket[name];
      if (window === null || window === undefined) continue;
      if (
        typeof window.usedPercent !== "number" ||
        !Number.isFinite(window.usedPercent) ||
        window.usedPercent < 0 ||
        window.usedPercent > 100 ||
        !Number.isSafeInteger(window.resetsAt) ||
        window.resetsAt * 1000 <= now ||
        !Number.isSafeInteger(window.windowDurationMins) ||
        window.windowDurationMins < 1
      )
        return unknown;
      windows.push({
        bucket: bucket.limitId ?? "codex",
        name,
        remainingPercent: 100 - window.usedPercent,
        windowDurationMins: window.windowDurationMins,
        resetsAt: window.resetsAt,
      });
    }
  }
  if (!windows.length) return unknown;
  const remainingPercent = Math.min(...windows.map((w) => w.remainingPercent));
  return {
    status: remainingPercent >= quotaFloor ? "QUOTA_ALLOWED" : "SKIPPED_QUOTA",
    provider: "codex",
    checkedAt: now,
    day: berlinDay(now),
    remainingPercent,
    windows,
  };
}

export function cachedSkip(snapshot, provider, now = Date.now(), force = false) {
  if (
    !snapshot ||
    snapshot.provider !== provider ||
    !Number.isFinite(snapshot.checkedAt) ||
    snapshot.checkedAt > now
  )
    return null;
  if (snapshot.status === "SKIPPED_QUOTA" && snapshot.day === berlinDay(now)) return snapshot;
  if (!force && snapshot.status === "SKIPPED_QUOTA_UNKNOWN" && snapshot.retryAfter > now)
    return snapshot;
  return null; // An allowed snapshot is never authority for a later model start.
}

export function quotaStatusKey(snapshot) {
  return JSON.stringify([snapshot.provider, snapshot.status, snapshot.day]);
}

export async function readCodexQuota({ timeout = 15000 } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn("codex", ["app-server"], {
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "",
      settled = false;
    const stop = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (e) {
        if (e.code !== "ESRCH") error ??= e;
      }
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      const force = setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* already exited */
        }
      }, 2000);
      force.unref();
      child.once("close", () => clearTimeout(force));
      error ? reject(error) : accept(result);
    };
    const timer = setTimeout(() => stop(new Error("QUOTA_API_TIMEOUT")), timeout);
    const send = (value) => child.stdin.write(JSON.stringify(value) + "\n");
    child.stderr.on("data", () => {}); // Never forward account/auth diagnostics into Jenkins logs.
    child.stdin.on("error", () => stop(new Error("QUOTA_API_STDIN")));
    child.on("error", () => stop(new Error("QUOTA_EXECUTABLE_UNAVAILABLE")));
    child.on("close", () => stop(new Error("QUOTA_API_CLOSED")));
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 1024 * 1024) return stop(new Error("QUOTA_API_RESPONSE_LIMIT"));
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          return stop(new Error("QUOTA_API_INVALID_JSON"));
        }
        if (message.id === 0) {
          if (message.error) return stop(new Error("QUOTA_API_INITIALIZATION"));
          send({ method: "initialized", params: {} });
          send({ method: "account/rateLimits/read", id: 1 });
        }
        if (message.id === 1)
          return stop(message.error ? new Error("QUOTA_API_UNAVAILABLE") : null, message.result);
      }
    });
    send({
      method: "initialize",
      id: 0,
      params: { clientInfo: { name: "ai_tutor_jenkins_quota", version: "1.0.0" } },
    });
  });
}
