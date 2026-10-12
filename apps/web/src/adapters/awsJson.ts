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
 * Every string is decoded as JSON, so a JSON string value arrives quoted (`"\"text\""`). Objects,
 * arrays, numbers, booleans and `null` are returned unchanged. Invalid JSON is an error naming the
 * field, never a silently empty value.
 */
export function decodeAwsJson(value: unknown, field: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch (cause) {
    throw new Error(`${field} is not valid AWSJSON`, { cause });
  }
}
