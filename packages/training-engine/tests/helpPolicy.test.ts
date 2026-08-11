import assert from "node:assert/strict";
import test from "node:test";
import {
  HELP_BONUS_DEDUCTION_PERCENT,
  getHelpBonusDeductionPercent,
} from "../src/helpPolicy.ts";

test("help levels expose the documented step-bonus deductions", () => {
  assert.deepEqual(HELP_BONUS_DEDUCTION_PERCENT, { 1: 10, 2: 25, 3: 50 });
  assert.equal(getHelpBonusDeductionPercent(1), 10);
  assert.equal(getHelpBonusDeductionPercent(2), 25);
  assert.equal(getHelpBonusDeductionPercent(3), 50);
});
