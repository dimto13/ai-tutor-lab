/**
 * AppSync `AWSJSON` wire format for the Amplify adapters.
 *
 * AppSync carries `a.json()` arguments and fields as JSON strings; only the resolver sees the
 * parsed value. The Amplify Data client passes custom-operation variables through unchanged and
 * does not parse custom-type fields, so every adapter has to encode on the way out and decode on
 * the way in. Missing both made each remote training-state write fail and each remote read look
 * like an empty session (#528, #545).
 */

export function encodeAwsJson(value: unknown): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Value cannot be sent as AWSJSON");
  return encoded;
}

/**
 * A string is decoded; anything else is returned unchanged, so an already parsed value and `null`
 * pass through. Invalid JSON is an error naming the field, never a silently empty value.
 */
export function decodeAwsJson(value: unknown, field: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${field} is not valid AWSJSON`);
  }
}
