import { expect, test } from "@playwright/test";

test("Ruleset-Negativprobe blockiert Merge bei rotem E2E-Gate", () => {
  expect("e2e-training-modes").toBe("blocked-by-required-check");
});
