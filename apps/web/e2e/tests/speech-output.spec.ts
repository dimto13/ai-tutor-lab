import { expect, test } from "../fixtures/browser-error-guard";

test("Guide-Sprachausgabe nutzt sichtbaren lokalisierten Text und stoppt bei Sprachwechsel", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = {
      spoken: [] as Array<{ text: string; lang: string }>,
      pauseCount: 0,
      resumeCount: 0,
      cancelCount: 0,
    };

    class MockSpeechSynthesisUtterance {
      text: string;
      lang = "";
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {
          state.cancelCount += 1;
        },
        pause() {
          state.pauseCount += 1;
        },
        resume() {
          state.resumeCount += 1;
        },
        speak(utterance: { text: string; lang: string }) {
          state.spoken.push({ text: utterance.text, lang: utterance.lang });
        },
      },
    });
    Object.defineProperty(window, "__speechTestState", {
      configurable: true,
      value: state,
    });
  });

  await page.goto("/training/vscode-basics.guided");
  await expect(page.getByRole("status")).toHaveText("Training bereit");
  await page.getByRole("combobox", { name: /Sprache wechseln|Change language/ }).selectOption("de");
  await page.getByRole("button", { name: "Guide anzeigen" }).click();

  const explanation = page.getByTestId("guided-speech-explanation");
  const control = page.getByTestId("speech-text-control");
  await expect(explanation).toBeVisible();
  await expect(control).toBeEnabled();
  await expect(control).toHaveAccessibleName("Vorlesen");

  const visibleGermanText = (await explanation.locator("p").innerText()).trim();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = (
          window as typeof window & {
            __speechTestState: { spoken: unknown[] };
          }
        ).__speechTestState;
        return state.spoken.length;
      }),
    )
    .toBe(0);

  await control.focus();
  await expect(control).toBeFocused();
  await control.press("Enter");
  await expect(control).toHaveAccessibleName("Pause");

  const germanSpeech = await page.evaluate(() => {
    const state = (
      window as typeof window & {
        __speechTestState: { spoken: Array<{ text: string; lang: string }> };
      }
    ).__speechTestState;
    return state.spoken.at(-1);
  });
  expect(germanSpeech).toEqual({ text: visibleGermanText, lang: "de-DE" });

  await control.press("Enter");
  await expect(control).toHaveAccessibleName("Fortsetzen");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __speechTestState: { pauseCount: number };
            }
          ).__speechTestState.pauseCount,
      ),
    )
    .toBe(1);

  await control.press("Enter");
  await expect(control).toHaveAccessibleName("Pause");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __speechTestState: { resumeCount: number };
            }
          ).__speechTestState.resumeCount,
      ),
    )
    .toBe(1);

  const cancelBeforeLanguageChange = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __speechTestState: { cancelCount: number };
        }
      ).__speechTestState.cancelCount,
  );
  await page.getByRole("combobox", { name: "Sprache wechseln" }).selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(control).toHaveAccessibleName("Read aloud");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __speechTestState: { cancelCount: number };
            }
          ).__speechTestState.cancelCount,
      ),
    )
    .toBeGreaterThan(cancelBeforeLanguageChange);

  const visibleEnglishText = (await explanation.locator("p").innerText()).trim();
  expect(visibleEnglishText).not.toBe(visibleGermanText);
  await control.press("Enter");

  const englishSpeech = await page.evaluate(() => {
    const state = (
      window as typeof window & {
        __speechTestState: { spoken: Array<{ text: string; lang: string }> };
      }
    ).__speechTestState;
    return state.spoken.at(-1);
  });
  expect(englishSpeech).toEqual({ text: visibleEnglishText, lang: "en-US" });
});
