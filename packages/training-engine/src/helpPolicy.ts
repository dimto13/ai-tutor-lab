export type HelpLevel = 1 | 2 | 3;

/**
 * Share of the step bonus forfeited by the respective help level.
 * Baseline scoring remains a server-side concern; this policy is exposed so the
 * guide can explain the consequence before a learner requests help.
 */
export const HELP_BONUS_DEDUCTION_PERCENT = {
  1: 10,
  2: 25,
  3: 50,
} as const satisfies Record<HelpLevel, number>;

export function getHelpBonusDeductionPercent(level: HelpLevel): number {
  return HELP_BONUS_DEDUCTION_PERCENT[level];
}
