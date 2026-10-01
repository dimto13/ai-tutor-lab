import type { ScenarioScoreAwardStatus } from "../scoring/useScenarioScoreAward.ts";

/**
 * Schlaegt der Abschluss offline fehl, scheitert in derselben Situation meist auch die
 * Serverwertung. Der Abschlussbildschirm sagt dann ausdruecklich, die Wertung sei nicht bestaetigt,
 * "weil der Abschluss noch nicht gespeichert ist". Ist der Abschluss danach gespeichert, ist dieser
 * Grund entfallen -- die Wertung fordert sich selbst neu an, statt den Lernenden einen zweiten Knopf
 * druecken zu lassen, dessen Begruendung nicht mehr zutrifft.
 *
 * Die Entscheidung haengt bewusst an der Flanke von "Fehler" nach "kein Fehler":
 * - ein dauerhaft fehlerfreier Abschluss loest nichts aus,
 * - ein weiterhin fehlgeschlagener Abschluss loest nichts aus, weil die Ursache noch besteht,
 * - ein erneut fehlgeschlagener Wertungsversuch wiederholt sich nicht endlos, weil die Flanke
 *   danach nicht mehr vorliegt.
 */
export function scoreRetryFollowsCompletionSave(input: {
  readonly previousCompletionSaveFailure: string | null;
  readonly completionSaveFailure: string | null;
  readonly scoreStatus: ScenarioScoreAwardStatus;
}): boolean {
  if (input.previousCompletionSaveFailure === null) return false;
  if (input.completionSaveFailure !== null) return false;
  return input.scoreStatus === "error";
}
