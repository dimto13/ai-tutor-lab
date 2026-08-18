import type { ClassificationValidationSpec, EngineValidationResult } from "./types.ts";
import type { ValidationContext, ValidatorSpec } from "./validation.ts";

interface ClassificationLevelView {
  id: string;
  label: string;
  rank: number;
}

interface ClassificationIndicatorView {
  id: string;
  label: string;
}

interface ClassificationDocumentProgressView {
  markedIndicatorIds: string[];
  selectedLevelId: string | null;
  aiDecisions: Record<string, boolean>;
}

interface ClassificationValidationStateView {
  viewedDocumentIds: string[];
  scheme: {
    levels: ClassificationLevelView[];
    indicators: ClassificationIndicatorView[];
  };
  documentProgress: Record<string, ClassificationDocumentProgressView>;
}

const IGNORE: EngineValidationResult = { outcome: "ignore" };
const PASS: EngineValidationResult = { outcome: "pass" };

export async function validateClassification(
  rawSpec: ValidatorSpec,
  context: ValidationContext,
): Promise<EngineValidationResult> {
  if (rawSpec.kind !== "classification" || !context.query) return IGNORE;
  const spec = rawSpec as ClassificationValidationSpec;
  const rawState = await context.query(spec.selector);
  if (rawState === undefined || rawState === null) return IGNORE;
  const state = parseValidationState(rawState);
  if (!state) {
    throw new TypeError(`Invalid classification validation state for selector: ${spec.selector}`);
  }
  if (!state.viewedDocumentIds.includes(spec.documentId)) return IGNORE;

  const progress = state.documentProgress[spec.documentId];
  if (!progress?.selectedLevelId) return IGNORE;
  const requiredAiEntries = Object.entries(spec.expectedAiDecisions);

  const expectedIndicators = new Set(spec.expectedIndicatorIds);
  const actualIndicators = new Set(progress.markedIndicatorIds);
  const missingIndicator = spec.expectedIndicatorIds.find((id) => !actualIndicators.has(id));
  if (missingIndicator) {
    return nearMiss(
      `Merkmal „${indicatorLabel(state, missingIndicator)}“ wurde übersehen. Prüfe dieses Merkmal und bewerte die Einstufung danach erneut.`,
      {
        rule: "classification.indicator.missing",
        documentId: spec.documentId,
        indicatorId: missingIndicator,
      },
    );
  }

  const unexpectedIndicator = progress.markedIndicatorIds.find((id) => !expectedIndicators.has(id));
  if (unexpectedIndicator) {
    return nearMiss(
      `Merkmal „${indicatorLabel(state, unexpectedIndicator)}“ wurde fälschlich als klassifizierungsrelevant markiert. Prüfe den konkreten Dokumentinhalt.`,
      {
        rule: "classification.indicator.unexpected",
        documentId: spec.documentId,
        indicatorId: unexpectedIndicator,
      },
    );
  }

  if (progress.selectedLevelId !== spec.expectedLevelId) {
    const selectedLabel = levelLabel(state, progress.selectedLevelId);
    const expectedLabel = levelLabel(state, spec.expectedLevelId);
    if (progress.selectedLevelId === spec.uncertaintyEscalationFromLevelId) {
      return nearMiss(
        `Im Zweifel höher einstufen: „${selectedLabel}“ ist für diesen Grenzfall zu niedrig. Verwende „${expectedLabel}“ und prüfe anschließend die KI-Nutzung erneut.`,
        {
          rule: "classification.uncertainty.escalate",
          documentId: spec.documentId,
          selectedLevelId: progress.selectedLevelId,
          expectedLevelId: spec.expectedLevelId,
        },
      );
    }
    return nearMiss(
      `Die gewählte Stufe „${selectedLabel}“ passt noch nicht. Aus den markierten Merkmalen folgt „${expectedLabel}“.`,
      {
        rule: "classification.level",
        documentId: spec.documentId,
        selectedLevelId: progress.selectedLevelId,
        expectedLevelId: spec.expectedLevelId,
      },
    );
  }

  for (const [tool, expectedAllowed] of requiredAiEntries) {
    if (!Object.hasOwn(progress.aiDecisions, tool)) continue;
    const actualAllowed = progress.aiDecisions[tool];
    if (actualAllowed !== expectedAllowed) {
      return nearMiss(
        `Die KI-Nutzungsentscheidung für „${tool}“ ist noch nicht korrekt: bei „${levelLabel(
          state,
          spec.expectedLevelId,
        )}“ ist die Nutzung ${expectedAllowed ? "zulässig" : "nicht zulässig"}.`,
        {
          rule: "classification.ai-decision",
          documentId: spec.documentId,
          tool,
          expectedAllowed,
          actualAllowed,
        },
      );
    }
  }

  if (!requiredAiEntries.every(([tool]) => Object.hasOwn(progress.aiDecisions, tool))) return IGNORE;
  return PASS;
}

function nearMiss(message: string, details: Record<string, unknown>): EngineValidationResult {
  return { outcome: "near-miss", message, details };
}

function parseValidationState(value: unknown): ClassificationValidationStateView | null {
  if (!isRecord(value)) return null;
  const viewedDocumentIds = value["viewedDocumentIds"];
  const scheme = value["scheme"];
  const documentProgress = value["documentProgress"];
  if (
    !Array.isArray(viewedDocumentIds) ||
    !viewedDocumentIds.every((id) => typeof id === "string")
  ) {
    return null;
  }
  if (
    !isRecord(scheme) ||
    !Array.isArray(scheme["levels"]) ||
    !Array.isArray(scheme["indicators"])
  ) {
    return null;
  }
  if (!isRecord(documentProgress)) return null;

  const levels = scheme["levels"].flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const id = candidate["id"];
    const label = candidate["label"];
    const rank = candidate["rank"];
    return typeof id === "string" && typeof label === "string" && typeof rank === "number"
      ? [{ id, label, rank }]
      : [];
  });
  const indicators = scheme["indicators"].flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const id = candidate["id"];
    const label = candidate["label"];
    return typeof id === "string" && typeof label === "string" ? [{ id, label }] : [];
  });

  const parsedProgress: Record<string, ClassificationDocumentProgressView> = {};
  for (const [documentId, candidate] of Object.entries(documentProgress)) {
    if (!isRecord(candidate)) return null;
    const markedIndicatorIds = candidate["markedIndicatorIds"];
    const selectedLevelId = candidate["selectedLevelId"];
    const aiDecisions = candidate["aiDecisions"];
    if (
      !Array.isArray(markedIndicatorIds) ||
      !markedIndicatorIds.every((id) => typeof id === "string") ||
      (selectedLevelId !== null && typeof selectedLevelId !== "string") ||
      !isRecord(aiDecisions) ||
      !Object.values(aiDecisions).every((decision) => typeof decision === "boolean")
    ) {
      return null;
    }
    parsedProgress[documentId] = {
      markedIndicatorIds: [...markedIndicatorIds],
      selectedLevelId,
      aiDecisions: { ...aiDecisions } as Record<string, boolean>,
    };
  }

  if (levels.length !== scheme["levels"].length || indicators.length !== scheme["indicators"].length) {
    return null;
  }

  return {
    viewedDocumentIds: [...viewedDocumentIds],
    scheme: { levels, indicators },
    documentProgress: parsedProgress,
  };
}

function indicatorLabel(state: ClassificationValidationStateView, indicatorId: string): string {
  return (
    state.scheme.indicators.find((indicator) => indicator.id === indicatorId)?.label ?? indicatorId
  );
}

function levelLabel(state: ClassificationValidationStateView, levelId: string): string {
  return state.scheme.levels.find((level) => level.id === levelId)?.label ?? levelId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
