import { useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  CheckCircle2,
  Code2,
  Eye,
  FileCode2,
  RefreshCw,
  ShieldCheck,
  Table2,
} from "lucide-react";
import {
  artifactPreviewRuntime,
  type ArtifactPreviewState,
} from "@/runtime/artifactPreviewRuntime";
import {
  buildSandboxedArtifactDocument,
  type DataArtifact,
  type HtmlArtifact,
  type PreviewArtifact,
  type TableArtifact,
} from "@/runtime/artifactPreviewContent";
import { useTraining } from "@/state/trainingStore";

const EMPTY_STATE: ArtifactPreviewState = {
  artifacts: [],
  activeArtifactId: null,
  viewMode: "preview",
  revisions: [],
  appliedRevisionIds: [],
  verifiedIds: [],
};

const TYPE_LABELS: Record<PreviewArtifact["type"], string> = {
  html: "HTML",
  table: "Tabelle",
  data: "Daten",
};

export function ArtifactPreviewPanel() {
  const { mode, scenario, persistRuntimeSnapshot, restoreRuntimeSnapshot } = useTraining();
  const [state, setState] = useState<ArtifactPreviewState>(EMPTY_STATE);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeArtifact =
    state.artifacts.find((artifact) => artifact.id === state.activeArtifactId) ?? null;
  const nextRevision = state.revisions.find(
    (revision) =>
      revision.artifactId === activeArtifact?.id && !state.appliedRevisionIds.includes(revision.id),
  );

  useEffect(() => {
    const container = rootRef.current;
    if (!container) return;
    let disposed = false;
    const unsubscribe = artifactPreviewRuntime.subscribeState((nextState, reason) => {
      setState(nextState);
      if (reason === "mutation") {
        persistRuntimeSnapshot(artifactPreviewRuntime.id, nextState);
      }
    });
    void (async () => {
      await artifactPreviewRuntime.mount(container, scenario.environment?.seed);
      if (!disposed) await restoreRuntimeSnapshot(artifactPreviewRuntime.id);
    })();
    return () => {
      disposed = true;
      unsubscribe();
      void artifactPreviewRuntime.unmount();
    };
  }, [scenario.environment?.seed, persistRuntimeSnapshot, restoreRuntimeSnapshot]);

  const inspect = (ref: string) => {
    if (mode === "explore") artifactPreviewRuntime.inspect(ref);
  };

  return (
    <aside
      ref={rootRef}
      data-highlight="artifact.preview.panel"
      onClickCapture={() => inspect("artifact.preview.panel")}
      className="flex min-h-0 w-[46%] min-w-[360px] flex-col border-l-2 border-accent/40 bg-[#0b0f14]"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-[#111720] px-3">
        <Eye className="h-4 w-4 text-accent" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          Ergebnis · simuliert
        </span>
        <span className="ml-auto rounded border border-success/30 bg-success/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-success">
          isolierte Vorschau
        </span>
      </div>

      <div
        data-highlight="artifact.preview.selector"
        onClickCapture={() => inspect("artifact.preview.selector")}
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-panel p-2"
      >
        {state.artifacts.map((artifact) => {
          const Icon =
            artifact.type === "html" ? FileCode2 : artifact.type === "table" ? Table2 : Braces;
          return (
            <button
              key={artifact.id}
              type="button"
              onClick={() => artifactPreviewRuntime.selectArtifact(artifact.id)}
              className={`inline-flex min-w-fit items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] ${
                artifact.id === state.activeArtifactId
                  ? "border-accent/60 bg-accent/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {artifact.title}
              <span className="text-[9px] uppercase text-muted-foreground">
                {TYPE_LABELS[artifact.type]}
              </span>
            </button>
          );
        })}
      </div>

      {activeArtifact ? (
        <>
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">
                {activeArtifact.title}
              </p>
              {activeArtifact.description ? (
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {activeArtifact.description}
                </p>
              ) : null}
            </div>
            {activeArtifact.type === "html" ? (
              <div
                data-highlight="artifact.preview.viewToggle"
                onClickCapture={() => inspect("artifact.preview.viewToggle")}
                className="flex rounded-md border border-border p-0.5"
              >
                <ViewButton
                  active={state.viewMode === "preview"}
                  icon={Eye}
                  label="Vorschau"
                  onClick={() => artifactPreviewRuntime.setViewMode("preview")}
                />
                <ViewButton
                  active={state.viewMode === "source"}
                  icon={Code2}
                  label="Quelltext"
                  onClick={() => artifactPreviewRuntime.setViewMode("source")}
                />
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            <ArtifactSurface
              artifact={activeArtifact}
              viewMode={state.viewMode}
              inspect={inspect}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-border bg-panel p-3">
            {nextRevision ? (
              <button
                type="button"
                data-highlight="artifact.preview.applyRevision"
                onClick={() => artifactPreviewRuntime.applyRevision(nextRevision.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-foreground hover:bg-accent/20"
              >
                <RefreshCw className="h-3.5 w-3.5 text-accent" /> {nextRevision.label}
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground">
                Keine weitere Revision hinterlegt
              </span>
            )}
            <button
              type="button"
              data-highlight="artifact.preview.verify"
              onClick={() => artifactPreviewRuntime.verifyActiveArtifact()}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium ${
                state.verifiedIds.includes(activeArtifact.id)
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-border text-foreground hover:border-ring"
              }`}
            >
              {state.verifiedIds.includes(activeArtifact.id) ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              {state.verifiedIds.includes(activeArtifact.id) ? "Geprüft" : "Ergebnis geprüft"}
            </button>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
          Dieses Szenario enthält noch kein Artefakt für die Vorschau.
        </div>
      )}
    </aside>
  );
}

function ViewButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Eye;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] ${
        active ? "bg-white/10 text-foreground" : "text-muted-foreground"
      }`}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}

function ArtifactSurface({
  artifact,
  viewMode,
  inspect,
}: {
  artifact: PreviewArtifact;
  viewMode: ArtifactPreviewState["viewMode"];
  inspect(ref: string): void;
}) {
  if (artifact.type === "html") {
    return <HtmlSurface artifact={artifact} viewMode={viewMode} inspect={inspect} />;
  }
  if (artifact.type === "table") return <TableSurface artifact={artifact} inspect={inspect} />;
  return <DataSurface artifact={artifact} inspect={inspect} />;
}

function HtmlSurface({
  artifact,
  viewMode,
  inspect,
}: {
  artifact: HtmlArtifact;
  viewMode: ArtifactPreviewState["viewMode"];
  inspect(ref: string): void;
}) {
  const document = useMemo(() => buildSandboxedArtifactDocument(artifact.html), [artifact.html]);
  if (viewMode === "source") {
    return (
      <pre
        data-highlight="artifact.preview.source"
        onClick={() => inspect("artifact.preview.source")}
        className="min-h-full overflow-auto rounded-md border border-border bg-[#06090d] p-4 font-mono text-[11px] leading-5 text-foreground"
      >
        <code>{artifact.html}</code>
      </pre>
    );
  }
  return (
    <iframe
      title={`Vorschau: ${artifact.title}`}
      data-highlight="artifact.preview.rendered"
      onClick={() => inspect("artifact.preview.rendered")}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={document}
      className="h-full min-h-72 w-full rounded-md border border-border bg-white"
    />
  );
}

function TableSurface({
  artifact,
  inspect,
}: {
  artifact: TableArtifact;
  inspect(ref: string): void;
}) {
  return (
    <div
      data-highlight="artifact.preview.table"
      onClick={() => inspect("artifact.preview.table")}
      className="overflow-hidden rounded-md border border-border bg-card"
    >
      <table className="w-full text-left text-[11px]">
        <thead className="bg-white/5 text-muted-foreground">
          <tr>
            {artifact.columns.map((column) => (
              <th key={column.key} className="border-b border-border px-3 py-2 font-medium">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {artifact.rows.map((row, index) => (
            <tr key={index} className="border-b border-border last:border-0">
              {artifact.columns.map((column) => (
                <td key={column.key} className="px-3 py-2 text-foreground">
                  {String(row[column.key] ?? "")}
                  {artifact.formulas?.[column.key] ? (
                    <span
                      className="ml-1 text-[9px] text-muted-foreground"
                      title={artifact.formulas[column.key]}
                    >
                      ƒ
                    </span>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataSurface({
  artifact,
  inspect,
}: {
  artifact: DataArtifact;
  inspect(ref: string): void;
}) {
  return (
    <pre
      data-highlight="artifact.preview.data"
      onClick={() => inspect("artifact.preview.data")}
      className="min-h-full overflow-auto rounded-md border border-border bg-[#06090d] p-4 font-mono text-[11px] leading-5 text-foreground"
    >
      <code>{JSON.stringify(artifact.value, null, 2)}</code>
    </pre>
  );
}
