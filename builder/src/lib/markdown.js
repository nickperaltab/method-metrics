// Minimal markdown for PS work-log notes: a parser to a block AST, plus a
// tidy-up pass for pasted notes.
//
// Why hand-rolled instead of a dependency: the work log needs headings, lists,
// emphasis, code and links — nothing more — and the render target is React
// elements (see components/projects/MarkdownBody.jsx), never an HTML string.
// That means no `dangerouslySetInnerHTML` anywhere in this path, so notes
// pasted out of a customer email can't inject markup. Adding a full markdown
// library would buy features nobody asked for and hand us an XSS surface.
//
// Parsing lives here (plain .js, unit-tested); rendering lives in the component.

/** Inline spans: text | strong | em | code | link. Deliberately not nested. */
function parseInline(text) {
  const spans = [];
  // One pass, longest-delimiter-first so ** wins over *.
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;
  let last = 0;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) spans.push({ type: 'text', text: text.slice(last, m.index) });
    const token = m[0];
    if (token.startsWith('**')) {
      spans.push({ type: 'strong', text: token.slice(2, -2) });
    } else if (token.startsWith('`')) {
      spans.push({ type: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('[')) {
      const cut = token.indexOf('](');
      const label = token.slice(1, cut);
      const href = token.slice(cut + 2, -1);
      // Only http(s) survives — a link span renders as an <a href>, and React
      // does not block javascript:/data: URLs there.
      if (/^https?:\/\//i.test(href)) spans.push({ type: 'link', text: label, href });
      else spans.push({ type: 'text', text: label });
    } else {
      spans.push({ type: 'em', text: token.slice(1, -1) });
    }
    last = m.index + token.length;
  }
  if (last < text.length) spans.push({ type: 'text', text: text.slice(last) });
  return spans.length ? spans : [{ type: 'text', text: '' }];
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,4})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^```/;
const RULE = /^(-{3,}|\*{3,}|_{3,})\s*$/;

/**
 * Markdown → block AST. Blocks: heading, para, list, quote, code, hr.
 * Unknown syntax degrades to paragraph text rather than being dropped, so a
 * consultant's notes never silently lose a line.
 */
export function parseMarkdown(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'para', spans: parseInline(para.join(' ')) });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };
  const flushAll = () => { flushPara(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (FENCE.test(line)) {
      flushAll();
      const body = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    if (!line.trim()) { flushAll(); continue; }

    if (RULE.test(line)) { flushAll(); blocks.push({ type: 'hr' }); continue; }

    const heading = line.match(HEADING);
    if (heading) {
      flushAll();
      blocks.push({ type: 'heading', level: heading[1].length, spans: parseInline(heading[2]) });
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      flushAll();
      blocks.push({ type: 'quote', spans: parseInline(quote[1]) });
      continue;
    }

    const bullet = line.match(BULLET);
    const ordered = !bullet && line.match(ORDERED);
    if (bullet || ordered) {
      flushPara();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { type: 'list', ordered: isOrdered, items: [] };
      }
      list.items.push(parseInline((bullet ?? ordered)[1]));
      continue;
    }

    flushList();
    para.push(line.trim());
  }
  flushAll();
  return blocks;
}

/** Plain-text digest of a markdown body — for one-line previews in tables. */
export function markdownToText(md, maxLength = 160) {
  const text = parseMarkdown(md)
    .flatMap((b) => (b.spans ? b.spans.map((s) => s.text) : b.items ? b.items.flat().map((s) => s.text) : [b.text ?? '']))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** The scaffold a new work-log entry starts from. */
export const WORK_LOG_TEMPLATE = `## What we did

-

## Decisions

-

## Blockers

-

## Next steps

-
`;

// Section names we recognise when someone pastes flat notes. Matched on a line
// that is just the label (with or without a colon), so a sentence mentioning
// "next steps" mid-paragraph isn't promoted to a heading.
const KNOWN_SECTIONS = [
  'what we did', 'work done', 'summary', 'notes',
  'decisions', 'decisions made',
  'blockers', 'issues', 'risks',
  'next steps', 'next actions', 'follow-ups', 'follow ups', 'action items',
  'attendees', 'customizations', 'open questions', 'questions',
];

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Tidy pasted notes into consistent markdown. Deliberately conservative — it
 * reformats, it never rewrites: no summarising, no reordering, no invented
 * content. A consultant has to be able to paste raw Zoom notes and still
 * recognise every line afterwards.
 *
 * What it does:
 *  - normalises line endings and strips trailing whitespace
 *  - turns `•`, `·`, `–`, `‣` and tab-indented dashes into `- ` bullets
 *  - promotes a bare "Next steps:" style line to a `##` heading
 *  - guarantees one blank line around headings and collapses blank runs
 */
export function formatNotes(raw) {
  const lines = String(raw ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];

  for (const original of lines) {
    let line = original.replace(/\s+$/, '');
    if (!line.trim()) { out.push(''); continue; }

    // Unicode bullets → markdown bullets.
    line = line.replace(/^\s*[•·‣▪◦–—]\s*/, '- ');

    // A line that is only a known section label becomes a heading.
    const label = line.replace(/[:：]\s*$/, '').trim().toLowerCase();
    if (!line.startsWith('#') && KNOWN_SECTIONS.includes(label)) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(`## ${titleCase(label)}`);
      out.push('');
      continue;
    }

    // Blank line before an existing heading so it can't glue to a paragraph.
    if (/^#{1,4}\s/.test(line) && out.length && out[out.length - 1] !== '') out.push('');

    out.push(line);
  }

  // Exactly one trailing newline on a non-empty body — it's a markdown file, and
  // a stable ending is what makes tidying twice a no-op.
  const body = out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');
  return body ? `${body}\n` : '';
}
