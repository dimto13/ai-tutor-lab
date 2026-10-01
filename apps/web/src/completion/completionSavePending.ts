/**
 * Der Pending-Zustand des Abschluss-Writes gehoert immer dem juengsten Versuch.
 *
 * Der Persistenz-Effekt startet bei jeder Aenderung neu und bricht den vorherigen Lauf ab. Ohne
 * Besitzregel entstehen daraus zwei Fehler, die einander ausschliessen:
 *
 * - Wertet ein abgebrochener Lauf seinen Ausgang nicht mehr aus, bleibt der Zustand haengen und der
 *   Wiederholen-Knopf ist dauerhaft gesperrt -- gerade dann, wenn der Lernende ihn braucht.
 * - Wertet er ihn dagegen aus, nimmt ein spaet eintreffender Vorgaenger den Zustand eines laufenden
 *   Versuchs zurueck und gibt den Knopf mitten im Speichern wieder frei. Damit waere genau die
 *   Doppelklick-Rennbedingung zurueck, die der Zustand verhindern soll.
 *
 * Beides loest dieselbe Regel: jeder Start bekommt eine Nummer, und nur der Lauf mit der aktuellen
 * Nummer darf den Zustand zuruecknehmen. Ein Start setzt den Zustand ausserdem immer neu -- damit
 * raeumt der naechste Lauf einen haengengebliebenen Zustand mit auf, auch wenn er selbst gar keinen
 * Abschluss schreibt.
 */
export interface CompletionSavePendingState {
  /** Laufende Nummer des juengsten Versuchs. */
  readonly latestRun: number;
  readonly pending: boolean;
}

export const initialCompletionSavePending: CompletionSavePendingState = {
  latestRun: 0,
  pending: false,
};

export function startCompletionSave(
  state: CompletionSavePendingState,
  savesFinishedSession: boolean,
): CompletionSavePendingState {
  return { latestRun: state.latestRun + 1, pending: savesFinishedSession };
}

export function settleCompletionSave(
  state: CompletionSavePendingState,
  run: number,
): CompletionSavePendingState {
  if (run !== state.latestRun) return state;
  if (!state.pending) return state;
  return { ...state, pending: false };
}
