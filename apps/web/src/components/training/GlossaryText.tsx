import { BookOpen } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { segmentGlossaryText } from "@/lib/glossary";

export function GlossaryText({
  children,
  conceptKeys,
}: {
  children: string;
  conceptKeys: readonly string[];
}) {
  return segmentGlossaryText(children, conceptKeys).map((segment, index) => {
    if (!segment.concept) return <span key={`${index}-${segment.text}`}>{segment.text}</span>;

    const concept = segment.concept;
    return (
      <Popover key={`${index}-${concept.key}`}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-baseline gap-0.5 rounded-sm font-medium text-accent underline decoration-accent/50 decoration-dotted underline-offset-2 hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${concept.term}: Begriffserklärung öffnen`}
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
