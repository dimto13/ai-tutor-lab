import { expect, test } from "../fixtures/browser-error-guard";

const aiTools = ["m365-copilot-tenant", "public-ai-chat", "github-copilot"] as const;

type ClassificationCase = {
  title: string;
  indicators: string[];
  level: string;
  ai: Record<(typeof aiTools)[number], boolean>;
};

async function classifyDocument(
  page: Parameters<typeof test>[0] extends never ? never : any,
  classification: ClassificationCase,
) {
  await page.getByRole("button", { name: new RegExp(classification.title) }).click();
  for (const indicator of classification.indicators) {
    const button = page.getByRole("button", { name: indicator, exact: true });
    if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  }
  await page.getByRole("button", { name: classification.level, exact: true }).click();
  const tool = page.getByLabel("KI-Werkzeug");
  for (const aiTool of aiTools) {
    await tool.selectOption(aiTool);
    await page
      .getByRole("button", { name: classification.ai[aiTool] ? "Zulassen" : "Nicht zulassen", exact: true })
      .click();
  }
}

test("Classification Explore vermittelt Merkmale, Stufen und KI-Nutzung", async ({ page }) => {
  await page.goto("/training/data-classification-ai-usage.explore");
  await expect(page.getByRole("status")).toContainText("Training bereit");
  await expect(page.getByText("ausschließlich synthetische Trainingsdokumente")).toBeVisible();

  for (const label of [
    "Dokumentliste erkunden",
    "Dokumentvorschau erkunden",
    "Klassifizierungsmerkmale erkunden",
    "Klassifizierungsstufen erkunden",
    "KI-Nutzungsentscheidung erkunden",
  ]) {
    await page.getByRole("button", { name: label }).click();
  }

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Classification Guided bearbeitet fünf Beispiele und liefert fachliche near-miss Hinweise", async ({ page }) => {
  await page.goto("/training/data-classification-ai-usage.guided");
  await expect(page.getByRole("status")).toContainText("Training bereit");

  await classifyDocument(page, {
    title: "Pressemitteilung Produktstart",
    indicators: [],
    level: "Öffentlich",
    ai: {
      "m365-copilot-tenant": true,
      "public-ai-chat": true,
      "github-copilot": true,
    },
  });

  await page.getByRole("button", { name: /Interne Meeting-Notiz/ }).click();
  await page.getByRole("button", { name: "Intern", exact: true }).click();
  const tool = page.getByLabel("KI-Werkzeug");
  for (const [aiTool, allowed] of [
    ["m365-copilot-tenant", true],
    ["public-ai-chat", false],
    ["github-copilot", true],
  ] as const) {
    await tool.selectOption(aiTool);
    await page.getByRole("button", { name: allowed ? "Zulassen" : "Nicht zulassen", exact: true }).click();
  }
  await expect(page.getByText(/Merkmal „Kennzeichnung intern“ wurde übersehen/)).toBeVisible();
  await page.getByRole("button", { name: "Kennzeichnung intern", exact: true }).click();

  await page.getByRole("button", { name: /Support-Ticket mit Kontaktdaten/ }).click();
  await page.getByRole("button", { name: "Personenbezogene Daten", exact: true }).click();
  await page.getByRole("button", { name: "Intern", exact: true }).click();
  for (const [aiTool, allowed] of [
    ["m365-copilot-tenant", true],
    ["public-ai-chat", false],
    ["github-copilot", false],
  ] as const) {
    await tool.selectOption(aiTool);
    await page.getByRole("button", { name: allowed ? "Zulassen" : "Nicht zulassen", exact: true }).click();
  }
  await expect(page.getByText(/Aus den markierten Merkmalen folgt „Vertraulich“/)).toBeVisible();
  await page.getByRole("button", { name: "Vertraulich", exact: true }).click();

  await classifyDocument(page, {
    title: "Gehaltsliste",
    indicators: ["Personenbezogene Daten", "Gehalts-/HR-Daten"],
    level: "Streng vertraulich",
    ai: {
      "m365-copilot-tenant": false,
      "public-ai-chat": false,
      "github-copilot": false,
    },
  });

  await page.getByRole("button", { name: /Grenzfall: unsicheres Support-Ticket/ }).click();
  await page.getByRole("button", { name: "Personenbezogene Daten", exact: true }).click();
  await page.getByRole("button", { name: "Vertraulich", exact: true }).click();
  for (const aiTool of aiTools) {
    await tool.selectOption(aiTool);
    await page.getByRole("button", { name: "Nicht zulassen", exact: true }).click();
  }
  await expect(page.getByText(/Im Zweifel höher einstufen/)).toBeVisible();
  await page.getByRole("button", { name: "Streng vertraulich", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});

test("Classification Challenge validiert zehn fachliche Endzustände unabhängig von der Klickreihenfolge", async ({ page }) => {
  await page.goto("/training/data-classification-ai-usage.challenge");
  await expect(page.getByRole("status")).toContainText("Training bereit");

  const cases: ClassificationCase[] = [
    {
      title: "Grenzfall: unsicheres Support-Ticket",
      indicators: ["Personenbezogene Daten"],
      level: "Streng vertraulich",
      ai: {
        "m365-copilot-tenant": false,
        "public-ai-chat": false,
        "github-copilot": false,
      },
    },
    {
      title: "Grenzfall: interne Vorlage mit Platzhalter",
      indicators: ["Kennzeichnung intern"],
      level: "Intern",
      ai: {
        "m365-copilot-tenant": true,
        "public-ai-chat": false,
        "github-copilot": true,
      },
    },
    {
      title: "HR-Bonusentscheidung",
      indicators: ["Gehalts-/HR-Daten", "Personenbezogene Daten"],
      level: "Streng vertraulich",
      ai: {
        "m365-copilot-tenant": false,
        "public-ai-chat": false,
        "github-copilot": false,
      },
    },
    {
      title: "Reisekostenabrechnung",
      indicators: ["Personenbezogene Daten"],
      level: "Vertraulich",
      ai: {
        "m365-copilot-tenant": true,
        "public-ai-chat": false,
        "github-copilot": false,
      },
    },
    {
      title: "Kundenspezifisches Angebot",
      indicators: ["Kundendaten mit Vertragsbezug"],
      level: "Vertraulich",
      ai: {
        "m365-copilot-tenant": true,
        "public-ai-chat": false,
        "github-copilot": false,
      },
    },
    {
      title: "Organigramm mit Personennamen",
      indicators: ["Personenbezogene Daten"],
      level: "Vertraulich",
      ai: {
        "m365-copilot-tenant": true,
        "public-ai-chat": false,
        "github-copilot": false,
      },
    },
    {
      title: "Kundenvertrag",
      indicators: ["Kundendaten mit Vertragsbezug", "Personenbezogene Daten"],
      level: "Vertraulich",
      ai: {
        "m365-copilot-tenant": true,
        "public-ai-chat": false,
        "github-copilot": false,
      },
    },
    {
      title: "Quellcode-Auszug",
      indicators: ["Kennzeichnung intern"],
      level: "Intern",
      ai: {
        "m365-copilot-tenant": true,
        "public-ai-chat": false,
        "github-copilot": true,
      },
    },
    {
      title: "Interner Projektplan",
      indicators: ["Kennzeichnung intern"],
      level: "Intern",
      ai: {
        "m365-copilot-tenant": true,
        "public-ai-chat": false,
        "github-copilot": true,
      },
    },
    {
      title: "Öffentliche FAQ",
      indicators: [],
      level: "Öffentlich",
      ai: {
        "m365-copilot-tenant": true,
        "public-ai-chat": true,
        "github-copilot": true,
      },
    },
  ];

  for (const [index, classification] of cases.entries()) {
    await classifyDocument(page, classification);
    if (index < cases.length - 1) {
      await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toHaveCount(0);
    }
  }

  await expect(page.getByRole("heading", { name: "Training abgeschlossen" })).toBeVisible();
});
