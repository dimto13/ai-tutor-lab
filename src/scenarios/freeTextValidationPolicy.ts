type ValidationLike = {
  kind?: string;
  contains?: Record<string, unknown>;
  selector?: string;
  includes?: unknown;
  of?: ValidationLike[];
};

export interface FreeTextPolicyViolation {
  path: string;
  message: string;
}

const EVENT_FREE_TEXT_FIELDS = new Set(["prompt", "reply", "description"]);
const STATE_FREE_TEXT_SUFFIXES = [".description", ".reply", ".prompt"];

function isFreeTextStateSelector(selector: string): boolean {
  return STATE_FREE_TEXT_SUFFIXES.some((suffix) => selector.endsWith(suffix));
}

function visitValidation(
  validation: ValidationLike | undefined,
  exactTextValidation: boolean,
  path: string,
  violations: FreeTextPolicyViolation[],
): void {
  if (!validation) return;

  if (validation.kind === "event" && validation.contains) {
    for (const field of Object.keys(validation.contains)) {
      if (EVENT_FREE_TEXT_FIELDS.has(field) && !exactTextValidation) {
        violations.push({
          path: `${path}.contains.${field}`,
          message:
            "Freitext darf nicht von einem Pflicht-Substring abhängen. Validiere das Ereignis bzw. Ergebnis oder markiere den Schritt nur dann mit exactTextValidation, wenn die exakte Antwort selbst Lernziel ist.",
        });
      }
    }
  }

  if (
    validation.kind === "state" &&
    typeof validation.selector === "string" &&
    isFreeTextStateSelector(validation.selector) &&
    typeof validation.includes === "string" &&
    !exactTextValidation
  ) {
    violations.push({
      path: `${path}.includes`,
      message:
        "Freitext-Zustände dürfen nicht über ein Pflicht-Substring validiert werden. Validiere den fachlichen Endzustand statt einer Formulierung.",
    });
  }

  if (validation.kind === "all" && Array.isArray(validation.of)) {
    validation.of.forEach((child, index) =>
      visitValidation(child, exactTextValidation, `${path}.of[${index}]`, violations),
    );
  }
}

export function validateStepFreeTextPolicy(step: {
  validation?: ValidationLike;
  exactTextValidation?: boolean;
}): FreeTextPolicyViolation[] {
  const violations: FreeTextPolicyViolation[] = [];
  visitValidation(
    step.validation,
    step.exactTextValidation === true,
    "validation",
    violations,
  );
  return violations;
}

export function validateCompletionFreeTextPolicy(
  validation: ValidationLike | undefined,
): FreeTextPolicyViolation[] {
  const violations: FreeTextPolicyViolation[] = [];
  visitValidation(validation, false, "completionValidation", violations);
  return violations;
}
