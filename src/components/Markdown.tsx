import type { ReactNode } from 'react';

/** Inline formatting: **bold**, *italic* and `code`. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const key = match.index;
    if (match[1]) parts.push(<strong key={key}>{match[1]}</strong>);
    else if (match[2]) parts.push(<code key={key}>{match[2]}</code>);
    else parts.push(<em key={key}>{match[3]}</em>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * A deliberately small Markdown subset for model replies: headings, lists and
 * paragraphs. Output is React elements, never HTML strings.
 */
export default function Markdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heading = line.match(/^(#{1,3})\s+(.*)/);
    if (heading) {
      blocks.push(<h4 key={i}>{inline(heading[2])}</h4>);
      i++;
    } else if (/^\s*[-*]\s/.test(line) || /^\s*\d+[.)]\s/.test(line)) {
      const ordered = /^\s*\d+[.)]\s/.test(line);
      const items: string[] = [];
      while (
        i < lines.length &&
        (ordered ? /^\s*\d+[.)]\s/ : /^\s*[-*]\s/).test(lines[i])
      )
        items.push(lines[i++].replace(/^\s*(?:[-*]|\d+[.)])\s/, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={i}>
          {items.map((item, j) => (
            <li key={j}>{inline(item)}</li>
          ))}
        </List>,
      );
    } else if (line.trim()) {
      const paragraph: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,3}\s|\s*[-*]\s|\s*\d+[.)]\s)/.test(lines[i])
      )
        paragraph.push(lines[i++]);
      blocks.push(<p key={i}>{inline(paragraph.join(' '))}</p>);
    } else i++;
  }
  return <div className="markdown">{blocks}</div>;
}
