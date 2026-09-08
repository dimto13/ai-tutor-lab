import { expect, test, type Page } from "@playwright/test";

interface GraphQLErrorShape {
  message: string;
  errorType?: string;
}

interface GraphQLResult<T> {
  data?: T;
  errors?: GraphQLErrorShape[];
}

interface SubmitResult {
  submitBetaFeedback: {
    accepted: boolean;
    duplicate: boolean;
  };
}

function requireEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for authenticated cloud acceptance.`);
  return name.endsWith("_PASSWORD") ? value : value.trim();
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail").fill(requireEnvironmentValue("CLOUD_TEST_EMAIL"));
  await page.getByLabel("Passwort").fill(requireEnvironmentValue("CLOUD_TEST_PASSWORD"));
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
}

async function graphQLResult<T>(
  page: Page,
  query: string,
  variables: Record<string, unknown>,
): Promise<GraphQLResult<T>> {
  return page.evaluate(
    async ({ query: document, variables: operationVariables }) => {
      const outputsResponse = await fetch("/amplify_outputs.json", { cache: "no-store" });
      if (!outputsResponse.ok) {
        throw new Error(`Unable to load Amplify outputs (HTTP ${outputsResponse.status}).`);
      }
      const outputs = (await outputsResponse.json()) as { data?: { url?: string } };
      const dataUrl = outputs.data?.url;
      if (!dataUrl) throw new Error("Live Amplify outputs do not contain data.url.");

      const tokenEntries = Object.entries(localStorage).filter(
        ([key, value]) =>
          (key.endsWith(".accessToken") || key.endsWith(".idToken")) &&
          typeof value === "string" &&
          value.split(".").length === 3,
      );
      tokenEntries.sort(([leftKey], [rightKey]) => {
        const leftRank = leftKey.endsWith(".accessToken") ? 0 : 1;
        const rightRank = rightKey.endsWith(".accessToken") ? 0 : 1;
        const rankDifference = leftRank - rightRank;
        return rankDifference === 0 ? leftKey.localeCompare(rightKey) : rankDifference;
      });
      if (tokenEntries.length === 0) {
        throw new Error("Authenticated Cognito session token was not found in browser storage.");
      }

      let lastResult: GraphQLResult<T> | null = null;
      for (const [, token] of tokenEntries) {
        const response = await fetch(dataUrl, {
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: document, variables: operationVariables }),
        });
        const result = (await response.json()) as GraphQLResult<T>;
        lastResult = result;
        const unauthorized = result.errors?.some(
          (error) =>
            error.errorType === "UnauthorizedException" ||
            error.message.toLowerCase().includes("not authorized"),
        );
        if (response.ok && !unauthorized) return result;
      }

      return lastResult ?? { errors: [{ message: "No Cognito token was accepted by AppSync." }] };
    },
    { query, variables },
  );
}

const submitDocument = `
  mutation CloudSubmitBetaFeedback($input: AWSJSON!) {
    submitBetaFeedback(input: $input) {
      accepted
      duplicate
    }
  }
`;

function feedbackInput(id: string, text: string): string {
  return JSON.stringify({
    id,
    source: "tutor",
    kind: "problem",
    text,
    context: {
      scenarioId: "cloud-beta-feedback-acceptance",
      stepId: "submit",
      mode: "guided",
      runtimeAdapterId: "cloud-acceptance",
      appVersion: "cloud-acceptance",
      commit: "cloud-acceptance",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
    // These fields are deliberately ignored by the resolver. Identity authority
    // must remain on the authenticated server-side caller.
    tenantId: "attacker-controlled",
    userId: "attacker-controlled",
  });
}

test("authenticated beta feedback persists idempotently with server-side identity authority", async ({
  page,
}) => {
  await signIn(page);

  const fixedId = "cloud-beta-feedback-inbox-v1";
  const variables = {
    input: feedbackInput(fixedId, "Cloud acceptance feedback without personal or secret content."),
  };

  const first = await graphQLResult<SubmitResult>(page, submitDocument, variables);
  expect(first.errors ?? []).toEqual([]);
  expect(first.data?.submitBetaFeedback.accepted).toBe(true);

  const second = await graphQLResult<SubmitResult>(page, submitDocument, variables);
  expect(second.errors ?? []).toEqual([]);
  expect(second.data?.submitBetaFeedback).toEqual({ accepted: true, duplicate: true });
});

test("feedback containing a likely secret is rejected before persistence", async ({ page }) => {
  await signIn(page);

  const result = await graphQLResult<SubmitResult>(page, submitDocument, {
    input: feedbackInput(
      "cloud-beta-feedback-secret-rejection-v1",
      "Do not persist this credential: api_key=12345678-secret-value",
    ),
  });

  expect(result.data?.submitBetaFeedback).toBeUndefined();
  expect(result.errors?.some((error) => error.message.includes("secret or token"))).toBe(true);
});
