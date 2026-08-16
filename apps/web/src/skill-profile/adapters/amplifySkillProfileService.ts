import { generateClient } from "aws-amplify/data";
import type {
  SkillLevel,
  SkillProfileProjection,
  SkillProfileService,
} from "@ai-train-lab/training-engine";
import type { Schema } from "../../../../../amplify/data/resource";

function errorText(errors: unknown): string {
  if (!Array.isArray(errors)) return "Unknown Amplify Data skill profile error";
  const messages = errors
    .map((error) => {
      if (typeof error !== "object" || error === null) return String(error);
      const message = Reflect.get(error, "message");
      const errorType = Reflect.get(error, "errorType");
      return [errorType, message].filter((value) => typeof value === "string").join(": ");
    })
    .filter(Boolean);
  return messages.join("; ") || "Unknown Amplify Data skill profile error";
}

function stringValue(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Skill profile ${fieldName} is invalid`);
  }
  return value;
}

function finiteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Skill profile ${fieldName} is invalid`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, fieldName: string): number {
  const parsed = finiteNumber(value, fieldName);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Skill profile ${fieldName} is invalid`);
  }
  return parsed;
}

function skillLevel(value: unknown): SkillLevel {
  if (
    value === "novice" ||
    value === "advanced_beginner" ||
    value === "practitioner" ||
    value === "proficient"
  ) {
    return value;
  }
  throw new Error("Skill profile level is invalid");
}

function skillProfile(value: unknown): SkillProfileProjection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Skill profile payload is invalid");
  }
  const source = value as Record<string, unknown>;
  const points = finiteNumber(source["points"], "points");
  if (points < 0) throw new Error("Skill profile points are invalid");

  return {
    technologyId: stringValue(source["technologyId"], "technologyId"),
    points,
    level: skillLevel(source["level"]),
    eligibleChallengeCount: nonNegativeInteger(
      source["eligibleChallengeCount"],
      "eligibleChallengeCount",
    ),
    sourceRevision: nonNegativeInteger(source["sourceRevision"], "sourceRevision"),
    calculatedAt: finiteNumber(source["calculatedAt"], "calculatedAt"),
  };
}

export function createAmplifySkillProfileServiceWithClient(
  client: ReturnType<typeof generateClient<Schema>>,
): SkillProfileService {
  return {
    async listSkillProfiles() {
      const result = await client.queries.listMySkillProfiles();
      if (result.errors?.length) throw new Error(errorText(result.errors));
      const profiles: SkillProfileProjection[] = [];
      for (const value of result.data ?? []) {
        if (value) profiles.push(skillProfile(value));
      }
      return profiles;
    },
  };
}

export function createAmplifySkillProfileService(): SkillProfileService {
  return createAmplifySkillProfileServiceWithClient(generateClient<Schema>());
}
