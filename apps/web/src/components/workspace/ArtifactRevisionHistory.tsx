import type { ArtifactPreviewState } from "@/runtime/artifactPreviewRuntime";
import type { PreviewArtifact } from "@/runtime/artifactPreviewContent";

interface ArtifactRevisionHistoryProps {
  state: ArtifactPreviewState;
  activeArtifact: PreviewArtifact;
  selectedRevisionId: string | null;
  onSelectRevision(revisionId: string | null): void;
}

export function ArtifactRevisionHistory({
  state,
  activeArtifact,
  selectedRevisionId,
  onSelectRevision,
}: ArtifactRevisionHistoryProps) {
  const applied = state.revisions.filter(
    (revision) =>
      revision.artifactId === activeArtifact.id &&
      state.appliedRevisionIds.includes(revision.id),
  );

  if (applied.length === 0) return null;

  return (
    <div
      data-highlight="artifact.preview.revisionHistory"
      className="border-b border-border bg-panel px-3 py-2"
      aria-label="Revisionsverlauf"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Revisionsverlauf
        </span>
        <span className="text-[9px] text-muted-foreground">Nur Ansicht</span>
      </div>
      <div className="flex gap-1 overflow-x-auto" role="list" aria-label="Artefaktstände">
        {applied.map((revision) => {
          const selected = selectedRevisionId === revision.id;
          return (
            <button
              key={revision.id}
              type="button"
              role="listitem"
              aria-pressed={selected}
              onClick={() => onSelectRevision(revision.id)}
              className={`min-w-fit rounded-md border px-2 py-1 text-[10px] ${
                selected
                  ? "border-accent/60 bg-accent/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {revision.label}
            </button>
          );
        })}
        <button
          type="button"
          role="listitem"
          aria-pressed={selectedRevisionId === null}
          onClick={() => onSelectRevision(null)}
          className={`min-w-fit rounded-md border px-2 py-1 text-[10px] font-medium ${
            selectedRevisionId === null
              ? "border-success/50 bg-success/10 text-success"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Aktueller Stand
        </button>
      </div>
    </div>
  );
}
