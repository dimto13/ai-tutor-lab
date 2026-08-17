import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
if (!baseURL) {
  throw new Error(
    "PLAYWRIGHT_BASE_URL is required for the production-artifact suite; this config must not start a dev server.",
  );
}

// #309: Deliberately small but beta-critical subset of the existing E2E suite.
// Keep the selection explicit here so production coverage cannot shrink silently.
// Together these existing tests cover:
// - /, /willkommen, /anmelden, /kompetenz
// - vscode-basics.explore, vscode-basics.guided, vscode-basics.challenge
// - guided reload/resume persistence
const productionArtifactTestTitles = [
  "Copilot-Kachel bietet Explore, Guided und Challenge",
  "zeigt die Eröffnungsszene und führt zu Anmeldung oder Registrierung",
  "führt von der Anmeldeseite angemeldet zurück ins Dashboard",
  "competence page lists every technology without synthesizing local skill values",
  "Explore: Oberfläche inspizieren erhöht den Fortschritt und erklärt das Konzept",
  "Guided: Explorer, Folder, Editor, Speichern und Panel laufen als Anfängerpfad",
  "Challenge: freier Klickpfad wird ausschließlich über den gespeicherten Zielzustand bewertet",
  "Reload: geführter Fortschritt und übersprungene Grundbegriffe bleiben erhalten",
] as const;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const productionArtifactGrep = new RegExp(
  `(?:${productionArtifactTestTitles.map(escapeRegExp).join("|")})$`,
);

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "landing-page.spec.ts",
    "skill-profile.spec.ts",
    "copilot-modes.spec.ts",
    "vscode-basics.spec.ts",
  ],
  grep: productionArtifactGrep,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ["line"],
        [
          "html",
          {
            outputFolder: "playwright-report-production-artifact",
            open: "never",
          },
        ],
      ]
    : "list",
  outputDir: "test-results-production-artifact",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "production-artifact-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
