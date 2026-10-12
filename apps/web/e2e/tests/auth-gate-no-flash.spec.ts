import { expect, test } from "../fixtures/browser-error-guard";
import { signOutFromAccountMenu } from "../helpers/account-settings";

// #563: Auf dem Weg von einer geschützten Route zur öffentlichen Seite meldet der Router die
// Ziel-URL schon, während er noch die alte Route gemountet hat. Ein Gate, das nur die Ziel-URL
// prüft, gibt in diesem Moment die geschützte Seite für eine abgemeldete Sitzung frei. Der Check
// beobachtet deshalb jede DOM-Änderung statt eines Endzustands: Der Flash dauert nur so lange wie
// das Nachladen der öffentlichen Route.
//
// Das Kontomenü gibt es nur im Chrome geschützter Routen. Zeigt es „Nicht angemeldet“, rendert eine
// geschützte Route ohne Sitzung.

interface Sample {
  path: string;
  protectedChromeWithoutSession: boolean;
}

test("zeigt nach dem Abmelden auf dem Weg zur Landingpage keine Plattforminhalte", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Meine Trainings" })).toBeVisible();

  await page.evaluate(() => {
    const samples: Sample[] = [];
    new MutationObserver(() => {
      samples.push({
        path: location.pathname,
        protectedChromeWithoutSession:
          document.querySelector('[data-testid="account-menu-anonymous"]') !== null,
      });
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
    Reflect.set(window, "__authGateSamples", samples);
  });

  await signOutFromAccountMenu(page);
  await expect(page).toHaveURL(/\/willkommen$/);
  await expect(page.getByRole("heading", { name: "Über KI reden" })).toBeVisible();

  const samples = await page.evaluate(() => Reflect.get(window, "__authGateSamples") as Sample[]);
  expect(samples.length, "the observer must see the redirect").toBeGreaterThan(0);
  expect(
    samples.filter((sample) => sample.protectedChromeWithoutSession),
    "protected content rendered for a signed-out visitor",
  ).toEqual([]);
});
