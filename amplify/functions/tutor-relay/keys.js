import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export const REQUEST_AAD = "trainlabs-tutor-relay/request/v1";
export const RESPONSE_AAD = "trainlabs-tutor-relay/response/v1";

const IV_BYTES = 12;
const TAG_BYTES = 16;

function masterKeyBytes(masterKey) {
  const bytes = Buffer.from(String(masterKey ?? "").trim(), "base64");
  if (bytes.length !== 32) {
    throw new Error("TUTOR_RELAY_KEY must be 32 random bytes, base64-encoded");
  }
  return bytes;
}

function derive(master, info) {
  return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), info, 32));
}

/**
 * One owner-managed secret yields two independent keys: the bearer the SSR server function sends
 * to the relay and the AES key that protects the prompt inside the SSM command. The RMI-PC only
 * holds the payload key, the SSR build only the bearer.
 */
export function deriveRelayKeys(masterKey) {
  const master = masterKeyBytes(masterKey);
  return {
    bearer: derive(master, "trainlabs-tutor-relay/bearer/v1").toString("base64url"),
    payloadKey: derive(master, "trainlabs-tutor-relay/payload/v1"),
  };
}

/** AES-256-GCM; the token is base64(iv | ciphertext | tag), matching Python's AESGCM layout. */
export function sealPayload(key, plaintext, aad) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString("base64");
}

export function openPayload(key, token, aad) {
  const raw = Buffer.from(token, "base64");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new Error("Sealed payload is too short");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)),
    decipher.final(),
  ]).toString("utf8");
}
