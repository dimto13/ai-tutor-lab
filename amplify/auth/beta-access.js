export const BETA_ACCESS_DENIED_MARKER = "BETA_ACCESS_DENIED";

export function normalizeBetaEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function parseBetaAllowlist(value) {
  return new Set((value ?? "").split(",").map(normalizeBetaEmail).filter(Boolean));
}

export function isBetaAllowed(email, allowlistValue) {
  const normalizedEmail = normalizeBetaEmail(email);
  if (!normalizedEmail) return false;
  return parseBetaAllowlist(allowlistValue).has(normalizedEmail);
}
