import { z } from "zod";
import type { RuntimeSeed } from "../types/training.ts";

export type ArtifactPreviewViewMode = "preview" | "source";
export type ArtifactPrimitive = string | number | boolean | null;
export type ArtifactJsonValue =
  ArtifactPrimitive | ArtifactJsonValue[] | { [key: string]: ArtifactJsonValue };

interface ArtifactBase {
  id: string;
  title: string;
  description?: string | undefined;
}

export interface HtmlArtifact extends ArtifactBase {
  type: "html";
  html: string;
}

export interface TableArtifactColumn {
  key: string;
  label: string;
}

export interface TableArtifact extends ArtifactBase {
  type: "table";
  columns: TableArtifactColumn[];
  rows: Array<Record<string, ArtifactPrimitive>>;
  formulas?: Record<string, string> | undefined;
}

export interface DataArtifact extends ArtifactBase {
  type: "data";
  value: ArtifactJsonValue;
}

export type PreviewArtifact = HtmlArtifact | TableArtifact | DataArtifact;

export interface ArtifactRevision {
  id: string;
  artifactId: string;
  label: string;
  next: PreviewArtifact;
}

export interface ArtifactPreviewSeed {
  artifacts: PreviewArtifact[];
  revisions: ArtifactRevision[];
  activeArtifactId: string;
  viewMode: ArtifactPreviewViewMode;
}

const ALLOWED_HTML_TAGS = new Set([
  "article",
  "code",
  "div",
  "em",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "header",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
  "a",
]);

const GLOBAL_HTML_ATTRIBUTES = new Set(["aria-label", "role"]);
const TAG_HTML_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
};

const TAG_PATTERN = /<\/?([A-Za-z][A-Za-z0-9-]*)([^<>]*)>/g;
const ATTRIBUTE_PATTERN = /\s+([A-Za-z][A-Za-z0-9:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/y;

function validateAttribute(tag: string, name: string, value: string | undefined): string | null {
  const normalizedName = name.toLowerCase();
  if (
    !GLOBAL_HTML_ATTRIBUTES.has(normalizedName) &&
    !TAG_HTML_ATTRIBUTES[tag]?.has(normalizedName)
  ) {
    return `Attribut ${name} ist für <${tag}> nicht erlaubt`;
  }
  if (value === undefined) return `Attribut ${name} benötigt einen Wert in Anführungszeichen`;
  if (normalizedName === "href" && !value.startsWith("#")) {
    return "Links dürfen nur simulierte #-Ziele innerhalb des Artefakts verwenden";
  }
  if ((normalizedName === "colspan" || normalizedName === "rowspan") && !/^\d+$/.test(value)) {
    return `Attribut ${name} muss eine positive Ganzzahl sein`;
  }
  if (normalizedName === "scope" && value !== "col" && value !== "row") {
    return "scope muss col oder row sein";
  }
  return null;
}

/**
 * Conservative allow-list validation for HTML authored as scenario data.
 * Unknown syntax is rejected instead of being repaired by the browser.
 */
export function validateArtifactHtml(html: string): string[] {
  const issues: string[] = [];
  if (/<!|<\?|<!--/i.test(html)) {
    issues.push("Deklarationen, Processing Instructions und Kommentare sind nicht erlaubt");
  }

  const stack: string[] = [];
  let cursor = 0;
  for (const match of html.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0;
    const textBetween = html.slice(cursor, index);
    if (/[<>]/.test(textBetween)) issues.push("Nicht erkannte oder nicht geschlossene HTML-Syntax");

    const fullTag = match[0];
    const tag = (match[1] ?? "").toLowerCase();
    const attributeText = match[2] ?? "";
    const closing = fullTag.startsWith("</");
    if (!ALLOWED_HTML_TAGS.has(tag)) issues.push(`Tag <${tag}> ist nicht erlaubt`);

    if (closing) {
      if (attributeText.trim())
        issues.push(`Schließendes Tag </${tag}> darf keine Attribute haben`);
      const openTag = stack.pop();
      if (openTag !== tag) issues.push(`Tag </${tag}> schließt nicht das zuletzt geöffnete Tag`);
    } else {
      let attributeCursor = 0;
      while (attributeCursor < attributeText.length) {
        ATTRIBUTE_PATTERN.lastIndex = attributeCursor;
        const attribute = ATTRIBUTE_PATTERN.exec(attributeText);
        if (!attribute || attribute.index !== attributeCursor) {
          if (attributeText.slice(attributeCursor).trim()) {
            issues.push(`Nicht erlaubte Attributsyntax in <${tag}>`);
          }
          break;
        }
        attributeCursor = ATTRIBUTE_PATTERN.lastIndex;
        const name = attribute[1] ?? "";
        const value = attribute[2] ?? attribute[3];
        const issue = validateAttribute(tag, name, value);
        if (issue) issues.push(issue);
      }
      stack.push(tag);
    }
    cursor = index + fullTag.length;
  }

  if (/[<>]/.test(html.slice(cursor)))
    issues.push("Nicht erkannte oder nicht geschlossene HTML-Syntax");
  if (stack.length > 0) issues.push(`Nicht geschlossene Tags: ${stack.join(", ")}`);
  return [...new Set(issues)];
}

const nonBlankString = z.string().trim().min(1);
const artifactPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const artifactJsonValueSchema: z.ZodType<ArtifactJsonValue> = z.lazy(() =>
  z.union([
    artifactPrimitiveSchema,
    z.array(artifactJsonValueSchema),
    z.record(artifactJsonValueSchema),
  ]),
);

const artifactBase = {
  id: nonBlankString,
  title: nonBlankString,
  description: nonBlankString.optional(),
};

export const htmlArtifactSchema = z
  .object({
    ...artifactBase,
    type: z.literal("html"),
    html: z.string().min(1),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    for (const issue of validateArtifactHtml(artifact.html)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue, path: ["html"] });
    }
  });

export const tableArtifactSchema = z
  .object({
    ...artifactBase,
    type: z.literal("table"),
    columns: z.array(z.object({ key: nonBlankString, label: nonBlankString }).strict()).min(1),
    rows: z.array(z.record(artifactPrimitiveSchema)),
    formulas: z.record(nonBlankString).optional(),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    const keys = artifact.columns.map((column) => column.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tabellenspalten müssen eindeutig sein",
      });
    }
    artifact.rows.forEach((row, index) => {
      for (const key of Object.keys(row)) {
        if (!keys.includes(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unbekannte Tabellenspalte: ${key}`,
            path: ["rows", index, key],
          });
        }
      }
    });
  });

export const dataArtifactSchema = z
  .object({
    ...artifactBase,
    type: z.literal("data"),
    value: artifactJsonValueSchema,
  })
  .strict();

export const previewArtifactSchema = z.union([
  htmlArtifactSchema,
  tableArtifactSchema,
  dataArtifactSchema,
]);

export const artifactPreviewSeedSchema = z
  .object({
    artifacts: z.array(previewArtifactSchema).min(1),
    revisions: z
      .array(
        z
          .object({
            id: nonBlankString,
            artifactId: nonBlankString,
            label: nonBlankString,
            next: previewArtifactSchema,
          })
          .strict(),
      )
      .default([]),
    activeArtifactId: nonBlankString.optional(),
    viewMode: z.enum(["preview", "source"]).default("preview"),
  })
  .strict()
  .superRefine((seed, ctx) => {
    const artifactIds = seed.artifacts.map((artifact) => artifact.id);
    if (new Set(artifactIds).size !== artifactIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Artefakt-IDs müssen eindeutig sein" });
    }
    if (seed.activeArtifactId && !artifactIds.includes(seed.activeArtifactId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Aktives Artefakt existiert nicht: ${seed.activeArtifactId}`,
        path: ["activeArtifactId"],
      });
    }
    const revisionIds = seed.revisions.map((revision) => revision.id);
    if (new Set(revisionIds).size !== revisionIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Revisions-IDs müssen eindeutig sein" });
    }
    seed.revisions.forEach((revision, index) => {
      if (!artifactIds.includes(revision.artifactId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Revision referenziert unbekanntes Artefakt: ${revision.artifactId}`,
          path: ["revisions", index, "artifactId"],
        });
      }
      if (revision.next.id !== revision.artifactId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Revisionsziel muss dieselbe Artefakt-ID behalten",
          path: ["revisions", index, "next", "id"],
        });
      }
    });
  });

export function parseArtifactPreviewSeed(seed?: RuntimeSeed): ArtifactPreviewSeed | null {
  if (!seed || !("artifactPreview" in seed)) return null;
  const parsed = artifactPreviewSeedSchema.parse(seed["artifactPreview"]);
  return {
    artifacts: parsed.artifacts,
    revisions: parsed.revisions,
    activeArtifactId: parsed.activeArtifactId ?? parsed.artifacts[0]!.id,
    viewMode: parsed.viewMode,
  };
}

export function buildSandboxedArtifactDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
    :root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#172033;background:#fff}
    body{margin:0;padding:20px;line-height:1.5}h1,h2,h3,h4{line-height:1.2}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #d8dee9;padding:8px;text-align:left}th{background:#f4f7fb}code,pre{font-family:ui-monospace,monospace}
    a{color:#0969da}section,article{max-width:760px;margin:auto}
  </style></head><body>${html}</body></html>`;
}
