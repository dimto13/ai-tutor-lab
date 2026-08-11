import type {
  EngineValidationResult,
  TrainingEvent,
  Validation,
  ValidationOutcome,
  ValidationResult,
} from "./types.ts";

export interface ValidatorSpec {
  kind: string;
}

export interface ValidationContext {
  event?: TrainingEvent;
  events?: readonly TrainingEvent[];
  query?: (selector: string) => Promise<unknown>;
}

export type ValidationHandler = (
  validation: ValidatorSpec,
  context: ValidationContext,
  registry: ValidatorRegistry,
) => Promise<EngineValidationResult>;

const PASS: EngineValidationResult = { outcome: "pass" };
const IGNORE: EngineValidationResult = { outcome: "ignore" };
const EVENT_MISMATCH_MESSAGE =
  "Die Aktion wurde erkannt, erfüllt aber noch nicht das erwartete Ergebnis.";
const EVENT_CONTENT_MISSING_MESSAGE = "Die Aktion wurde erkannt, der erwartete Inhalt fehlt noch.";

export class ValidatorRegistry {
  private readonly handlers = new Map<string, ValidationHandler>();

  register(kind: string, handler: ValidationHandler): this {
    this.handlers.set(kind, handler);
    return this;
  }

  async validate(
    validation: ValidatorSpec,
    context: ValidationContext = {},
  ): Promise<EngineValidationResult> {
    const handler = this.handlers.get(validation.kind);
    if (!handler) throw new Error(`No validator registered for kind: ${validation.kind}`);
    return handler(validation, context, this);
  }
}

export function createDefaultValidatorRegistry(): ValidatorRegistry {
  return new ValidatorRegistry()
    .register("event", validateEvent)
    .register("state", validateState)
    .register("sequence", validateSequence)
    .register("all", validateAll)
    .register("any", validateAny);
}

/** Transitional adapter until all authored scenarios use declarative validation. */
export function normalizeLegacyValidationResult(result: ValidationResult): EngineValidationResult {
  if (result.ok) return PASS;
  return result.message
    ? { outcome: "near-miss", message: result.message }
    : { outcome: "near-miss" };
}

async function validateEvent(
  spec: ValidatorSpec,
  context: ValidationContext,
): Promise<EngineValidationResult> {
  const validation = asValidation(spec, "event");
  const event = context.event;
  if (!event || event.type !== validation.type) return IGNORE;

  const payload = eventPayload(event);
  for (const [key, expected] of Object.entries(validation.match ?? {})) {
    if (payload[key] !== expected) {
      return nearMiss("event.match", key, EVENT_MISMATCH_MESSAGE);
    }
  }
  for (const [key, expectedFragment] of Object.entries(validation.contains ?? {})) {
    const actual = payload[key];
    if (typeof actual !== "string" || !actual.includes(expectedFragment)) {
      return nearMiss("event.contains", key, EVENT_CONTENT_MISSING_MESSAGE);
    }
  }
  for (const [key, expectedFragments] of Object.entries(validation.containsAny ?? {})) {
    const actual = payload[key];
    if (
      typeof actual !== "string" ||
      !expectedFragments.some((fragment) => containsNormalizedFragment(actual, fragment))
    ) {
      return nearMiss("event.containsAny", key, EVENT_CONTENT_MISSING_MESSAGE);
    }
  }
  return PASS;
}

async function validateState(
  spec: ValidatorSpec,
  context: ValidationContext,
): Promise<EngineValidationResult> {
  const validation = asValidation(spec, "state");
  if (!context.query) return IGNORE;

  const value = await context.query(validation.selector);
  if (Object.hasOwn(validation, "equals") && value !== validation.equals) {
    return nearMiss("state.equals", validation.selector);
  }
  if (Object.hasOwn(validation, "includes") && !includesValue(value, validation.includes)) {
    return nearMiss("state.includes", validation.selector);
  }
  if (
    validation.includesAny &&
    !validation.includesAny.some((candidate) => includesValue(value, candidate, true))
  ) {
    return nearMiss("state.includesAny", validation.selector);
  }
  if (Object.hasOwn(validation, "excludes") && includesValue(value, validation.excludes)) {
    return nearMiss("state.excludes", validation.selector);
  }
  if (validation.match) {
    if (!isRecord(value)) return nearMiss("state.match", validation.selector);
    for (const [key, expected] of Object.entries(validation.match)) {
      if (value[key] !== expected) return nearMiss("state.match", key);
    }
  }
  return PASS;
}

async function validateSequence(
  spec: ValidatorSpec,
  context: ValidationContext,
  registry: ValidatorRegistry,
): Promise<EngineValidationResult> {
  const validation = asValidation(spec, "sequence");
  const events = context.events ?? (context.event ? [context.event] : []);
  if (events.length === 0) return IGNORE;

  if (!validation.ordered) {
    const results = await Promise.all(
      validation.of.map(async (item) => bestResultForEvents(item, events, context, registry)),
    );
    return combineAll(results);
  }

  let cursor = 0;
  for (const item of validation.of) {
    let matched = false;
    let nearMissResult: EngineValidationResult | null = null;
    for (; cursor < events.length; cursor += 1) {
      const event = events[cursor]!;
      const result = await registry.validate(item, {
        ...context,
        event,
        events: [event],
      });
      if (result.outcome === "pass") {
        matched = true;
        cursor += 1;
        break;
      }
      if (result.outcome === "near-miss") nearMissResult = result;
    }
    if (!matched) return nearMissResult ?? IGNORE;
  }
  return PASS;
}

async function validateAll(
  spec: ValidatorSpec,
  context: ValidationContext,
  registry: ValidatorRegistry,
): Promise<EngineValidationResult> {
  const validation = asValidation(spec, "all");
  const results = await Promise.all(validation.of.map((item) => registry.validate(item, context)));
  return combineAll(results);
}

async function validateAny(
  spec: ValidatorSpec,
  context: ValidationContext,
  registry: ValidatorRegistry,
): Promise<EngineValidationResult> {
  const validation = asValidation(spec, "any");
  const results = await Promise.all(validation.of.map((item) => registry.validate(item, context)));
  if (results.some((result) => result.outcome === "pass")) return PASS;
  return results.find((result) => result.outcome === "near-miss") ?? IGNORE;
}

async function bestResultForEvents(
  validation: Validation,
  events: readonly TrainingEvent[],
  context: ValidationContext,
  registry: ValidatorRegistry,
): Promise<EngineValidationResult> {
  let nearMissResult: EngineValidationResult | null = null;
  for (const event of events) {
    const result = await registry.validate(validation, { ...context, event, events: [event] });
    if (result.outcome === "pass") return result;
    if (result.outcome === "near-miss") nearMissResult = result;
  }
  return nearMissResult ?? IGNORE;
}

function asValidation<K extends Validation["kind"]>(
  spec: ValidatorSpec,
  kind: K,
): ExtractValidation<K> {
  if (spec.kind !== kind) throw new TypeError(`Expected ${kind} validation`);
  return spec as ExtractValidation<K>;
}

type ExtractValidation<K extends Validation["kind"]> = K extends "event"
  ? Extract<Validation, { kind: "event" }>
  : K extends "state"
    ? Extract<Validation, { kind: "state" }>
    : K extends "sequence"
      ? Extract<Validation, { kind: "sequence" }>
      : K extends "all"
        ? { kind: "all"; of: Validation[] }
        : { kind: "any"; of: Validation[] };

function combineAll(results: EngineValidationResult[]): EngineValidationResult {
  if (results.every((result) => result.outcome === "pass")) return PASS;
  return results.find((result) => result.outcome === "near-miss") ?? IGNORE;
}

function nearMiss(rule: string, field: string, message?: string): EngineValidationResult {
  return {
    outcome: "near-miss",
    ...(message ? { message } : {}),
    details: { rule, field },
  };
}

function eventPayload(event: TrainingEvent): Record<string, unknown> {
  return isRecord(event.payload) ? event.payload : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function includesValue(actual: unknown, expected: unknown, normalized = false): boolean {
  if (Array.isArray(actual)) return actual.includes(expected);
  if (typeof actual !== "string") return false;
  const expectedText = String(expected);
  return normalized
    ? containsNormalizedFragment(actual, expectedText)
    : actual.includes(expectedText);
}

function normalizeComparableText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .toLocaleLowerCase("de-DE");
}

function containsNormalizedFragment(actual: string, expected: string): boolean {
  return normalizeComparableText(actual).includes(normalizeComparableText(expected));
}

export function validationOutcomeRank(outcome: ValidationOutcome): number {
  return outcome === "pass" ? 2 : outcome === "near-miss" ? 1 : 0;
}
