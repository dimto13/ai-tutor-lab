import type {
  EventValidation,
  StateValidation,
  TrainingEvent,
  Validation,
  ValidationOutcome,
} from "./types.ts";

export interface ValidationContext {
  event?: TrainingEvent;
  eventHistory?: readonly TrainingEvent[];
  queryState?: (selector: string) => Promise<unknown>;
}

export type ValidationEvaluator<T extends Validation = Validation> = (
  validation: T,
  context: ValidationContext,
  registry: ValidatorRegistry,
) => Promise<ValidationOutcome>;

const PASS: ValidationOutcome = { status: "pass" };
const IGNORE: ValidationOutcome = { status: "ignore" };

function nearMiss(message: string): ValidationOutcome {
  return { status: "near-miss", message };
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

function eventPayload(event: TrainingEvent): Record<string, unknown> {
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    return {};
  }
  return event.payload as Record<string, unknown>;
}

function matchesStateValue(validation: StateValidation, value: unknown): boolean {
  if (Object.prototype.hasOwnProperty.call(validation, "equals") && value !== validation.equals) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(validation, "includes")) {
    if (Array.isArray(value)) {
      if (!value.includes(validation.includes)) return false;
    } else if (typeof value === "string") {
      if (!value.includes(String(validation.includes))) return false;
    } else {
      return false;
    }
  }

  if (validation.includesAny) {
    if (Array.isArray(value)) {
      if (!validation.includesAny.some((candidate) => value.includes(candidate))) return false;
    } else if (typeof value === "string") {
      if (
        !validation.includesAny.some((candidate) =>
          containsNormalizedFragment(value, String(candidate)),
        )
      ) {
        return false;
      }
    } else {
      return false;
    }
  }

  if (Object.prototype.hasOwnProperty.call(validation, "excludes")) {
    if (Array.isArray(value)) {
      if (value.includes(validation.excludes)) return false;
    } else if (typeof value === "string") {
      if (value.includes(String(validation.excludes))) return false;
    } else {
      return false;
    }
  }

  if (validation.match) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    for (const [key, expected] of Object.entries(validation.match)) {
      if (record[key] !== expected) return false;
    }
  }

  return true;
}

const eventEvaluator: ValidationEvaluator<EventValidation> = async (validation, context) => {
  const event = context.event;
  if (!event || event.type !== validation.type) return IGNORE;

  const payload = eventPayload(event);
  for (const [key, expected] of Object.entries(validation.match ?? {})) {
    if (payload[key] !== expected) {
      return nearMiss("Die Aktion wurde erkannt, erfüllt aber noch nicht das erwartete Ergebnis.");
    }
  }

  for (const [key, expectedFragment] of Object.entries(validation.contains ?? {})) {
    const actual = payload[key];
    if (typeof actual !== "string" || !actual.includes(expectedFragment)) {
      return nearMiss("Die Aktion wurde erkannt, der erwartete Inhalt fehlt noch.");
    }
  }

  for (const [key, expectedFragments] of Object.entries(validation.containsAny ?? {})) {
    const actual = payload[key];
    if (
      typeof actual !== "string" ||
      !expectedFragments.some((fragment) => containsNormalizedFragment(actual, fragment))
    ) {
      return nearMiss("Die Aktion wurde erkannt, der erwartete Inhalt fehlt noch.");
    }
  }

  return PASS;
};

const stateEvaluator: ValidationEvaluator<StateValidation> = async (validation, context) => {
  if (!context.queryState) return IGNORE;
  const value = await context.queryState(validation.selector);
  return matchesStateValue(validation, value)
    ? PASS
    : nearMiss("Der aktuelle Zustand erfüllt das erwartete Ergebnis noch nicht.");
};

const allEvaluator: ValidationEvaluator<Extract<Validation, { kind: "all" }>> = async (
  validation,
  context,
  registry,
) => {
  const outcomes = await Promise.all(
    validation.of.map((item) => registry.evaluate(item, context)),
  );
  if (outcomes.every((outcome) => outcome.status === "pass")) return PASS;
  return outcomes.find((outcome) => outcome.status === "near-miss") ?? IGNORE;
};

const anyEvaluator: ValidationEvaluator<Extract<Validation, { kind: "any" }>> = async (
  validation,
  context,
  registry,
) => {
  const outcomes = await Promise.all(
    validation.of.map((item) => registry.evaluate(item, context)),
  );
  if (outcomes.some((outcome) => outcome.status === "pass")) return PASS;
  return outcomes.find((outcome) => outcome.status === "near-miss") ?? IGNORE;
};

const sequenceEvaluator: ValidationEvaluator<Extract<Validation, { kind: "sequence" }>> = async (
  validation,
  context,
  registry,
) => {
  const history = context.eventHistory ?? (context.event ? [context.event] : []);
  let cursor = 0;

  for (const item of validation.of) {
    if (item.kind !== "event") {
      const outcome = await registry.evaluate(item, context);
      if (outcome.status !== "pass") return outcome;
      continue;
    }

    let matchedIndex = -1;
    for (let index = cursor; index < history.length; index += 1) {
      const outcome = await registry.evaluate(item, { ...context, event: history[index] });
      if (outcome.status === "pass") {
        matchedIndex = index;
        break;
      }
    }

    if (matchedIndex < 0) {
      const currentOutcome = context.event
        ? await registry.evaluate(item, context)
        : IGNORE;
      return currentOutcome.status === "near-miss" ? currentOutcome : IGNORE;
    }
    cursor = matchedIndex + 1;
  }

  return PASS;
};

export class ValidatorRegistry {
  private readonly evaluators = new Map<string, ValidationEvaluator>();

  register<T extends Validation>(kind: T["kind"], evaluator: ValidationEvaluator<T>): this {
    this.evaluators.set(kind, evaluator as ValidationEvaluator);
    return this;
  }

  async evaluate(validation: Validation, context: ValidationContext): Promise<ValidationOutcome> {
    const evaluator = this.evaluators.get(validation.kind);
    if (!evaluator) {
      throw new Error(`No validator registered for kind: ${validation.kind}`);
    }
    return evaluator(validation, context, this);
  }
}

export function createDefaultValidatorRegistry(): ValidatorRegistry {
  return new ValidatorRegistry()
    .register("event", eventEvaluator)
    .register("state", stateEvaluator)
    .register("sequence", sequenceEvaluator)
    .register("all", allEvaluator)
    .register("any", anyEvaluator);
}

export const defaultValidatorRegistry = createDefaultValidatorRegistry();

export function evaluateValidation(
  validation: Validation,
  context: ValidationContext,
): Promise<ValidationOutcome> {
  return defaultValidatorRegistry.evaluate(validation, context);
}
