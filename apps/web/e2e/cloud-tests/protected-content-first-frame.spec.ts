import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { signOutFromAccountMenu } from "../helpers/account-settings";
import {
  ANONYMOUS_PLATFORM_CHROME,
  observeProtectedContent,
  protectedContentObservation,
  protectedMarkersInHtml,
  resetProtectedContentObservation,
} from "../helpers/protected-content-observer";
import { expectSignedIn } from "../helpers/sign-in";

// #563: Ohne gültige Sitzung darf die deployte App zu keinem Zeitpunkt Inhalte einer geschützten
// Route rendern: weder im SSR-HTML noch während Hydration, Sitzungsprüfung oder Weiterleitung.
// Geprüft werden die drei Sitzungsprofile aus dem Issue:
// A nie angemeldet, B über die UI abgemeldet, C gespeicherte, aber serverseitig widerrufene Sitzung.
//
// Die Netzwerkdrosselung verlängert das Zeitfenster, in dem der ursprüngliche Fehler sichtbar war
// (Nachladen der öffentlichen Route). Sie ist keine Voraussetzung für einen grünen Lauf.

type CloudEnvironmentName =
  | "CLOUD_BASE_URL"
  | "CLOUD_TEST_EMAIL"
  | "CLOUD_TEST_PASSWORD"
  | "CLOUD_TEST_PERSONAL_EMAIL"
  | "CLOUD_TEST_PERSONAL_PASSWORD";

function requireEnvironmentValue(name: CloudEnvironmentName): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for authenticated cloud acceptance.`);
  return name.endsWith("PASSWORD") ? value : value.trim();
}

const PROTECTED_ROUTES = ["/", "/kompetenz", "/training/vscode-basics.guided"] as const;

async function newObservedContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: requireEnvironmentValue("CLOUD_BASE_URL") });
  await observeProtectedContent(context);
  return context;
}

// CDP gibt es nur in Chromium. Andere Browser laufen ungedrosselt; die Prüfung selbst gilt unverändert.
async function throttleNetwork(page: Page): Promise<void> {
  if (page.context().browser()?.browserType().name() !== "chromium") return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 300,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expectSignedIn(page);
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();
}

async function expectPublicLanding(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/willkommen$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Über KI reden" })).toBeVisible({
    timeout: 30_000,
  });
}

async function expectNoProtectedContent(page: Page, label: string): Promise<void> {
  const { findings, inspectedMutations } = await protectedContentObservation(page);
  expect(
    inspectedMutations,
    `${label}: the observer must see the page being built`,
  ).toBeGreaterThan(0);
  expect(findings, `${label}: protected content rendered without a valid session`).toEqual([]);
}

/** Ruft jede geschützte Route als neues Dokument auf; der Beobachter läuft ab dem ersten Frame. */
async function visitProtectedRoutes(context: BrowserContext, profile: string): Promise<void> {
  for (const route of PROTECTED_ROUTES) {
    const page = await context.newPage();
    try {
      await throttleNetwork(page);
      await page.goto(route);
      await expectPublicLanding(page);
      await expectNoProtectedContent(page, `${profile} ${route}`);
    } finally {
      await page.close();
    }
  }
}

async function cognitoRegion(request: APIRequestContext): Promise<string> {
  const response = await request.get("/amplify_outputs.json");
  expect(response.ok(), "amplify_outputs.json must be served").toBe(true);
  const outputs = (await response.json()) as { auth?: { aws_region?: string } };
  const region = outputs.auth?.aws_region;
  if (!region) throw new Error("amplify_outputs.json names no Cognito region.");
  return region;
}

async function storedAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("CognitoIdentityServiceProvider.") && key.endsWith(".accessToken")) {
        return localStorage.getItem(key);
      }
    }
    return null;
  });
  if (!token) throw new Error("No stored Cognito access token after sign-in.");
  return token;
}

async function hasStoredSession(context: BrowserContext): Promise<boolean> {
  const { origins } = await context.storageState();
  return origins.some((origin) =>
    origin.localStorage.some(
      (entry) =>
        entry.name.startsWith("CognitoIdentityServiceProvider.") &&
        entry.name.endsWith(".accessToken"),
    ),
  );
}

test("#563 A: a first visit without session never renders protected content", async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);

  for (const route of PROTECTED_ROUTES) {
    const response = await request.get(route);
    expect(response.ok(), `SSR ${route} must answer`).toBe(true);
    expect(protectedMarkersInHtml(await response.text()), `SSR ${route}`).toEqual([]);
  }

  const context = await newObservedContext(browser);
  try {
    await visitProtectedRoutes(context, "A");
  } finally {
    await context.close();
  }
});

test("#563 B: signing out never renders the platform for a signed-out visitor", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const context = await newObservedContext(browser);
  try {
    const page = await context.newPage();
    await signIn(
      page,
      requireEnvironmentValue("CLOUD_TEST_EMAIL"),
      requireEnvironmentValue("CLOUD_TEST_PASSWORD"),
    );

    // Vor dem Abmelden ist die Plattform berechtigt sichtbar. Gewertet wird ab dem Abmelden, und
    // zwar das Kontomenü im Zustand „Nicht angemeldet“: Es erscheint genau dann, wenn eine
    // geschützte Route ohne Sitzung rendert.
    await resetProtectedContentObservation(page);
    await throttleNetwork(page);
    await signOutFromAccountMenu(page);
    await expectPublicLanding(page);
    const { findings } = await protectedContentObservation(page);
    expect(
      findings.filter((finding) => finding.marker === ANONYMOUS_PLATFORM_CHROME),
      "B sign-out: protected route rendered for a signed-out visitor",
    ).toEqual([]);

    await visitProtectedRoutes(context, "B");
  } finally {
    await context.close();
  }
});

// Ein eigenes Konto, weil der globale Widerruf alle Sitzungen dieses Kontos beendet. Der Widerruf
// läuft über die öffentliche Cognito-API mit dem Access-Token des Kontos selbst; der Workflow
// braucht dafür keine AWS-IAM-Rechte. Spätere Läufe melden sich ohnehin neu an.
test("#563 C: a stored but revoked session is validated before anything protected renders", async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const region = await cognitoRegion(request);
  const cognitoEndpoint = `https://cognito-idp.${region}.amazonaws.com/`;
  const context = await newObservedContext(browser);
  try {
    const page = await context.newPage();
    await signIn(
      page,
      requireEnvironmentValue("CLOUD_TEST_PERSONAL_EMAIL"),
      requireEnvironmentValue("CLOUD_TEST_PERSONAL_PASSWORD"),
    );

    const revoked = await request.post(cognitoEndpoint, {
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.GlobalSignOut",
      },
      data: JSON.stringify({ AccessToken: await storedAccessToken(page) }),
    });
    expect(revoked.status(), "Cognito GlobalSignOut must revoke the session").toBe(200);
    await page.close();

    // Kein Abmelden und kein Löschen des Speichers: Die widerrufene Sitzung liegt weiter im Browser.
    expect(await hasStoredSession(context), "the revoked session must still be stored").toBe(true);

    const validations: number[] = [];
    context.on("response", (response) => {
      if (
        response.url().startsWith(cognitoEndpoint) &&
        response.request().headers()["x-amz-target"] === "AWSCognitoIdentityProviderService.GetUser"
      ) {
        validations.push(response.status());
      }
    });

    await visitProtectedRoutes(context, "C");
    expect(
      validations.length,
      "C: the app must validate the stored session with Cognito",
    ).toBeGreaterThan(0);
    expect(
      validations.every((status) => status >= 400),
      "C: Cognito must reject the revoked session",
    ).toBe(true);
  } finally {
    await context.close();
  }
});
