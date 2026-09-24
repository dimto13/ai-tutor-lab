import { Fragment } from "react";
import { BookOpen } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { requestGuidedConceptHighlight } from "@/components/overlay/guidedConceptHighlight";
import { segmentGlossaryText } from "@/lib/glossary";

const LITERAL_INPUT_PATTERN = /`([^`\n]+)`/g;

function GlossarySegments({ text, conceptKeys }: { text: string; conceptKeys: readonly string[] }) {
  return segmentGlossaryText(text, conceptKeys).map((segment, index) => {
    if (!segment.concept) return <span key={`${index}-${segment.text}`}>{segment.text}</span>;

    const concept = segment.concept;
    return (
      <Popover
        key={`${index}-${concept.key}`}
        onOpenChange={(open) => requestGuidedConceptHighlight(open ? concept : null)}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-baseline gap-0.5 rounded-sm font-medium text-accent underline decoration-accent/50 decoration-dotted underline-offset-2 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${concept.term}: Begriffserklärung öffnen und in der Oberfläche zeigen`}
          >
            {segment.text}
            <BookOpen className="h-2.5 w-2.5 self-center" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Begriff einfach erklärt
          </p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">{concept.term}</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-foreground">{concept.simple}</p>
          {concept.uiTargets.length > 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-accent">
              Die blaue Markierung zeigt dir den zugehörigen Bereich in der Oberfläche.
            </p>
          ) : null}
          <details className="mt-3 text-[12px] text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">
              Technisch genauer
            </summary>
            <p className="mt-2 leading-relaxed">{concept.advanced}</p>
          </details>
        </PopoverContent>
      </Popover>
    );
  });
}

export function GlossaryText({
  children,
  conceptKeys,
}: {
  children: string;
  conceptKeys: readonly string[];
}) {
  const parts: Array<{ kind: "text" | "literal"; text: string }> = [];
  let cursor = 0;

  for (const match of children.matchAll(LITERAL_INPUT_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ kind: "text", text: children.slice(cursor, index) });
    parts.push({ kind: "literal", text: match[1] ?? "" });
    cursor = index + match[0].length;
  }
  if (cursor < children.length) parts.push({ kind: "text", text: children.slice(cursor) });
  if (parts.length === 0) parts.push({ kind: "text", text: children });

  return parts.map((part, index) =>
    part.kind === "literal" ? (
      <code
        key={`${index}-${part.text}`}
        className="mx-0.5 inline-block rounded border border-current bg-muted px-1.5 py-0.5 font-mono font-semibold text-foreground shadow-sm forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]"
      >
        {part.text}
      </code>
    ) : (
      <Fragment key={`${index}-${part.text}`}>
        <GlossarySegments text={part.text} conceptKeys={conceptKeys} />
      </Fragment>
    ),
  );
}
