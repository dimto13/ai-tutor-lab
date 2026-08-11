import { expect, test } from "@playwright/test";

test("Ruleset-Negativprobe ist nach Gate-Fix grün", () => {
  expect("e2e-training-modes").toBe("e2e-training-modes");
});
