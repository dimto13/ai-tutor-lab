import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

type RequiredEnvironment =
  | "CLOUD_TEST_EMAIL"
  | "CLOUD_TEST_PASSWORD"
  | "TUTOR_SMOKE_CONTEXT_FILE";

function required(name: RequiredEnvironment): string {
  const value = process.env[name];
  if (!value) throw new Error(name + " is required for the tutor micro smoke.");
  return name.endsWith("PASSWORD") ? value : value.trim();
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
}

async function cognitoSubject(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const decodePayload = (token: string): Record<string, unknown> | null => {
      const parts = token.split(".");
      if (parts.length !== 3 || !parts[1]) return null;
      try {
        const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
        return JSON.parse(atob(padded)) as Record<string, unknown>;
      } catch {
        return null;
      }
    };

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      const value = window.localStorage.getItem(key);
      if (!value) continue;
      const payload = decodePayload(value);
      if (payload?.["token_use"] === "access" && typeof payload["sub"] === "string") {
        return payload["sub"];
      }
    }
    return null;
  });
}

test("explicit opt-in sends exactly one authenticated tutor request", async ({ page }) => {
  const email = required("CLOUD_TEST_EMAIL");
  const password = required("CLOUD_TEST_PASSWORD");
  const contextFile = required("TUTOR_SMOKE_CONTEXT_FILE");

  await signIn(page, email, password);

  const subject = await cognitoSubject(page);
  expect(subject, "The authenticated Cognito access-token subject must be discoverable locally.").toMatch(
    /^[0-9a-f-]{36}$/i,
  );

  await page.goto("/training/vscode-shortcuts.challenge");

  const briefing = page.getByRole("button", {
    name: /Aufgabe verstanden.*Sekunden starten/,
  });
  if (await briefing.isVisible()) {
    await briefing.click();
  }

  const input = page.getByPlaceholder("Frage an den Tutor…");
  await expect(input).toBeVisible();
  await input.fill("Was ist ein Workspace?");

  await writeFile(
    contextFile,
    JSON.stringify({ sub: subject, startedAtMs: Date.now() }),
    { encoding: "utf8", mode: 0o600 },
  );

  // Exactly one UI submit. Playwright retries are disabled in the dedicated config.
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(input).toBeDisabled();
  await expect(input).toBeEnabled({ timeout: 35_000 });
});
