type ValidationLike = {
  kind?: string;
  contains?: Record<string, unknown>;
  containsAny?: Record<string, unknown>;
  selector?: string;
  includes?: unknown;
  includesAny?: unknown;
  of?: ValidationLike | ValidationLike[];
};

export interface FreeTextPolicyViolation {
  path: string;
  message: string;
}

const EVENT_FREE_TEXT_FIELDS = new Set(["prompt", "reply", "description"]);
const STATE_FREE_TEXT_SUFFIXES = [".description", ".reply", ".prompt", ".prompt.last"];

const EVENT_MESSAGE =
  "Freitext darf nicht von einem Pflicht-Substring abhängen. Validiere das Ereignis bzw. Ergebnis oder markiere den Schritt nur dann mit exactTextValidation, wenn die exakte Antwort selbst Lernziel ist.";
const STATE_MESSAGE =
  "Freitext-Zustände dürfen nicht über ein Pflicht-Substring validiert werden. Validiere den fachlichen Endzustand statt einer Formulierung.";
// A synonym list is still a required wording: "Prüfung der Änderung" missed every word of
// ["geprüft", "kontrolliert", …] and stopped a learner for good (#591).
const KEYWORD_LIST_MESSAGE =
  "Freitext darf auch nicht von einer Schlüsselwortliste abhängen: eigene Worte treffen keine Liste zuverlässig. Validiere das Ereignis bzw. Ergebnis.";

function isFreeTextStateSelector(selector: string): boolean {
  return STATE_FREE_TEXT_SUFFIXES.some((suffix) => selector.endsWith(suffix));
}

function visitValidation(
  validation: ValidationLike | undefined,
  exactTextValidation: boolean,
  path: string,
  violations: FreeTextPolicyViolation[],
): void {
  if (!validation || exactTextValidation) return;

  if (validation.kind === "event") {
    for (const field of Object.keys(validation.contains ?? {})) {
      if (EVENT_FREE_TEXT_FIELDS.has(field)) {
        violations.push({ path: `${path}.contains.${field}`, message: EVENT_MESSAGE });
      }
    }
    for (const field of Object.keys(validation.containsAny ?? {})) {
      if (EVENT_FREE_TEXT_FIELDS.has(field)) {
        violations.push({ path: `${path}.containsAny.${field}`, message: KEYWORD_LIST_MESSAGE });
      }
    }
  }

  if (
    validation.kind === "state" &&
    typeof validation.selector === "string" &&
    isFreeTextStateSelector(validation.selector)
  ) {
    if (typeof validation.includes === "string") {
      violations.push({ path: `${path}.includes`, message: STATE_MESSAGE });
    }
    if (Array.isArray(validation.includesAny)) {
      violations.push({ path: `${path}.includesAny`, message: KEYWORD_LIST_MESSAGE });
    }
  }

  if (Array.isArray(validation.of)) {
    validation.of.forEach((child, index) =>
      visitValidation(child, exactTextValidation, `${path}.of[${index}]`, violations),
    );
  } else if (validation.of) {
    visitValidation(validation.of, exactTextValidation, `${path}.of`, violations);
  }
}

export function validateStepFreeTextPolicy(step: {
  validation?: ValidationLike;
  exactTextValidation?: boolean;
}): FreeTextPolicyViolation[] {
  const violations: FreeTextPolicyViolation[] = [];
  visitValidation(step.validation, step.exactTextValidation === true, "validation", violations);
  return violations;
}

export function validateCompletionFreeTextPolicy(
  validation: ValidationLike | undefined,
): FreeTextPolicyViolation[] {
  const violations: FreeTextPolicyViolation[] = [];
  visitValidation(validation, false, "completionValidation", violations);
  return violations;
}
