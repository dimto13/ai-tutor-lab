import type { LlmCorrelation } from "./provider";

const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * One tutor request carries the same request ID through server, relay and node logs (#482). The
 * tenant appears there only as a keyed reference: stable per tenant, but neither the tenant ID nor
 * the Cognito subject of a personal tenant can be read from it.
 */
export async function createTutorCorrelation(
  tenantId: string,
  key: string,
  newRequestId: () => string = () => crypto.randomUUID(),
): Promise<LlmCorrelation> {
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    encoder.encode(`trainlabs-tenant-ref/v1:${tenantId}`),
  );
  return { requestId: newRequestId(), tenantRef: hex(new Uint8Array(digest).slice(0, 8)) };
}
