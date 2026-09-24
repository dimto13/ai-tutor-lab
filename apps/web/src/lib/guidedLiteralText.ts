export type GuidedTextPart = { kind: "text" | "literal"; text: string };

const LITERAL_INPUT_PATTERN = /`([^`\n]+)`/g;

export function segmentGuidedLiteralText(text: string): GuidedTextPart[] {
  const parts: GuidedTextPart[] = [];
  let cursor = 0;

  for (const match of text.matchAll(LITERAL_INPUT_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ kind: "text", text: text.slice(cursor, index) });
    parts.push({ kind: "literal", text: match[1] ?? "" });
    cursor = index + match[0].length;
  }

  if (cursor < text.length) parts.push({ kind: "text", text: text.slice(cursor) });
  if (parts.length === 0) parts.push({ kind: "text", text });

  return parts;
}
