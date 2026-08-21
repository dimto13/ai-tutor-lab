import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { answerTutorQuestionOnServer } from "./tutorLlm.server";

const tutorLlmInputSchema = z.object({
  scenarioId: z.string().trim().min(1).max(200),
  mode: z.enum(["explore", "guided", "challenge"]),
  currentStepId: z.string().trim().min(1).max(200).nullable(),
  question: z.string().trim().min(1).max(4_000),
  accessToken: z.string().min(1).max(20_000).nullable(),
  userCode: z.string().max(20_000).optional(),
});

export const askTutorLlm = createServerFn({ method: "POST" })
  .validator(tutorLlmInputSchema)
  .handler(async ({ data }) => answerTutorQuestionOnServer(data));
