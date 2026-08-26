export function ExploreInspectButton({
  targetRef,
  label,
  onInspect,
}: {
  targetRef: string;
  label: string;
  onInspect: (targetRef: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onInspect(targetRef)}
      className="rounded border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-label={`${label} erkunden`}
    >
      Erkunden
    </button>
  );
}
