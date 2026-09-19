import { useMemo } from "react";
import {
  buildSandboxedArtifactDocument,
  type DataArtifact,
  type HtmlArtifact,
  type PreviewArtifact,
  type TableArtifact,
} from "@/runtime/artifactPreviewContent";
import type { ArtifactPreviewState } from "@/runtime/artifactPreviewRuntime";

export function ArtifactPreviewSurface({
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
  if (artifact.type === "table") {
    return <TableSurface artifact={artifact} inspect={inspect} />;
  }
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
