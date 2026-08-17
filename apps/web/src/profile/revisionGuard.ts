export type RevisionLoadStatus = "idle" | "loading" | "ready" | "error";

/**
 * Ermittelt die erwartete Revision für einen revisionsgeschützten Write.
 *
 * Die Persistenz-Resolver deuten eine fehlende erwartete Revision als Create-Guard
 * `attribute_not_exists(id)`. Diese Bedeutung ist nur dann korrekt, wenn der Zustand geladen
 * wurde und dabei nachweislich kein Satz vorhanden war. Ein noch ladender oder fehlerhafter
 * Zustand ist von "kein Satz vorhanden" nicht unterscheidbar und darf deshalb keinen Write
 * auslösen, weil er sonst an einem bereits vorhandenen Satz als Revisionskonflikt scheitert.
 */
export function expectedRevisionForWrite(
  status: RevisionLoadStatus,
  record: { revision: number } | null,
  notLoadedMessage: string,
): number | null {
  if (status !== "ready") throw new Error(notLoadedMessage);
  return record?.revision ?? null;
}
