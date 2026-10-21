import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { TUTOR_HISTORY_MAX_TURNS } from "./tutorGuardrails";
import { tutorLiveSnapshotSchema } from "./tutorLiveSnapshot";
import { answerTutorQuestionOnServer } from "./tutorLlm.server";

const tutorLlmInputSchema = z.object({
  scenarioId: z.string().trim().min(1).max(200),
  mode: z.enum(["explore", "guided", "challenge"]),
  currentStepId: z.string().trim().min(1).max(200).nullable(),
  lastFailure: z.string().trim().min(1).max(1_000).nullable().optional(),
  question: z.string().trim().min(1).max(4_000),
  answerAsQuestion: z.boolean().optional(),
  accessToken: z.string().min(1).max(20_000).nullable(),
  userCode: z.string().max(20_000).optional(),
  liveSnapshot: tutorLiveSnapshotSchema.optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "tutor"]),
        text: z.string().trim().min(1).max(2_000),
      }),
    )
    .max(TUTOR_HISTORY_MAX_TURNS)
    .optional(),
});

export const askTutorLlm = createServerFn({ method: "POST" })
  .validator(tutorLlmInputSchema)
  .handler(async ({ data }) =>
    answerTutorQuestionOnServer({
      scenarioId: data.scenarioId,
      mode: data.mode,
      currentStepId: data.currentStepId,
      ...(data.lastFailure ? { lastFailure: data.lastFailure } : {}),
      question: data.question,
      ...(data.answerAsQuestion ? { answerAsQuestion: true } : {}),
      accessToken: data.accessToken,
      ...(data.userCode === undefined ? {} : { userCode: data.userCode }),
      ...(data.liveSnapshot === undefined ? {} : { liveSnapshot: data.liveSnapshot }),
      ...(data.history === undefined ? {} : { history: data.history }),
    }),
  );
