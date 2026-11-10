// A small, safe reading of the Markdown an AI client writes a Candidate Brief in: headings, lists,
// paragraphs, and bold. Everything else, HTML included, stays plain text. The result is shown
// with React elements, which escape text, so nothing in a brief can run as code in the page.

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; lines: string[] };

const heading = /^(#{1,6})\s+(.*)$/;
const bullet = /^[-*+]\s+(.*)$/;
const numbered = /^\d+[.)]\s+(.*)$/;

export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  // A blank line ends a paragraph. A list goes on after one, so a loosely written list stays whole.
  let afterBlank = false;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") {
      afterBlank = true;
      continue;
    }
    const last = blocks.at(-1);
    const continues = !afterBlank;
    afterBlank = false;
    const h = heading.exec(line);
    if (h) {
      // Headings deeper than four levels are rare in a brief; they are shown as level four.
      blocks.push({ kind: "heading", level: Math.min(h[1]!.length, 4) as 1 | 2 | 3 | 4, text: h[2]!.trim() });
      continue;
    }
    const bulletItem = bullet.exec(line);
    const numberedItem = bulletItem ? null : numbered.exec(line);
    const item = bulletItem ?? numberedItem;
    if (item) {
      const ordered = numberedItem !== null;
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(item[1]!);
      else blocks.push({ kind: "list", ordered, items: [item[1]!] });
      continue;
    }
    // An indented line right after a list item is that item, wrapped.
    if (last?.kind === "list" && continues && /^\s/.test(raw)) {
      last.items[last.items.length - 1] += ` ${line}`;
      continue;
    }
    if (last?.kind === "paragraph" && continues) last.lines.push(line);
    else blocks.push({ kind: "paragraph", lines: [line] });
  }
  return blocks;
}

export interface InlinePart {
  bold: boolean;
  text: string;
}

// Splits a line at **bold** pairs. A ** with no partner stays as written.
export function inlineParts(line: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let rest = line;
  for (let match = /\*\*(.+?)\*\*/.exec(rest); match; match = /\*\*(.+?)\*\*/.exec(rest)) {
    if (match.index > 0) parts.push({ bold: false, text: rest.slice(0, match.index) });
    parts.push({ bold: true, text: match[1]! });
    rest = rest.slice(match.index + match[0].length);
  }
  if (rest !== "") parts.push({ bold: false, text: rest });
  return parts;
}
