import { expect, test } from "@playwright/test";

test("competence page lists every technology without synthesizing local skill values", async ({
  page,
}) => {
  await page.goto("/kompetenz");

  await expect(page.getByRole("heading", { name: "Mein Kompetenzprofil" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kompetenzprofil" })).toBeVisible();
  await expect(page.getByText("Im lokalen Modus nicht autoritativ verfügbar")).toBeVisible();

  for (const technology of [
    "IDE",
    "AI Coding Assistant",
    "CLI Agent",
    "Source Control",
    "Artifact Preview",
  ]) {
    await expect(page.getByRole("heading", { name: technology })).toBeVisible();
  }

  await expect(page.getByText(/persönlichen Selbsteinschätzung/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Meine Trainings" })).toHaveAttribute("href", "/");
});
