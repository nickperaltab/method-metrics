// The work-log markdown layer: parsing, the plain-text digest, and the
// "Tidy up" pass. formatNotes is held to a strict contract — it reformats and
// never rewrites — because a consultant has to be able to paste raw notes and
// still recognise every line afterwards.

import { describe, it, expect } from 'vitest';
import { parseMarkdown, markdownToText, formatNotes, WORK_LOG_TEMPLATE } from '../../src/lib/markdown.js';

const types = (md) => parseMarkdown(md).map((b) => b.type);

describe('parseMarkdown', () => {
  it('reads headings at each level', () => {
    const blocks = parseMarkdown('# One\n## Two\n### Three\n#### Four');
    expect(blocks.map((b) => b.level)).toEqual([1, 2, 3, 4]);
    expect(blocks.every((b) => b.type === 'heading')).toBe(true);
  });

  it('groups consecutive bullets into one list', () => {
    const blocks = parseMarkdown('- a\n- b\n- c');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('list');
    expect(blocks[0].ordered).toBe(false);
    expect(blocks[0].items).toHaveLength(3);
  });

  it('keeps ordered and unordered lists apart', () => {
    expect(types('- a\n1. b')).toEqual(['list', 'list']);
    const [unordered, ordered] = parseMarkdown('- a\n1. b');
    expect(unordered.ordered).toBe(false);
    expect(ordered.ordered).toBe(true);
  });

  it('joins wrapped lines into one paragraph', () => {
    const blocks = parseMarkdown('first line\nsecond line\n\nnew para');
    expect(types('first line\nsecond line\n\nnew para')).toEqual(['para', 'para']);
    expect(blocks[0].spans.map((s) => s.text).join('')).toBe('first line second line');
  });

  it('parses inline emphasis, code and links', () => {
    const [block] = parseMarkdown('a **bold** and *it* and `x` and [link](https://method.me)');
    const kinds = block.spans.map((s) => s.type);
    expect(kinds).toContain('strong');
    expect(kinds).toContain('em');
    expect(kinds).toContain('code');
    const link = block.spans.find((s) => s.type === 'link');
    expect(link.href).toBe('https://method.me');
  });

  it('degrades a non-http link to plain text rather than rendering it', () => {
    // The renderer puts a link span in an <a href>, and React does not block
    // javascript: URLs there — so the parser has to.
    const [block] = parseMarkdown('[click](javascript:alert(1))');
    expect(block.spans.every((s) => s.type !== 'link')).toBe(true);
    expect(block.spans.map((s) => s.text).join('')).toContain('click');
  });

  it('handles fenced code, quotes and rules', () => {
    expect(types('```\ncode\n```')).toEqual(['code']);
    expect(parseMarkdown('```\nline1\nline2\n```')[0].text).toBe('line1\nline2');
    expect(types('> quoted')).toEqual(['quote']);
    expect(types('---')).toEqual(['hr']);
  });

  it('never drops a line it does not understand', () => {
    const weird = '<<not markdown>>\n|table|ish|';
    const text = markdownToText(weird);
    expect(text).toContain('not markdown');
    expect(text).toContain('table');
  });

  it('returns no blocks for empty input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown(null)).toEqual([]);
  });

  it('parses its own template', () => {
    const blocks = parseMarkdown(WORK_LOG_TEMPLATE);
    const headings = blocks.filter((b) => b.type === 'heading').map((b) => b.spans[0].text);
    expect(headings).toEqual(['What we did', 'Decisions', 'Blockers', 'Next steps']);
  });
});

describe('markdownToText', () => {
  it('flattens to a single line and truncates', () => {
    const text = markdownToText('## Head\n\n- one\n- two');
    expect(text).toBe('Head one two');
    expect(markdownToText('x'.repeat(300)).length).toBeLessThanOrEqual(160);
    expect(markdownToText('x'.repeat(300))).toMatch(/…$/);
  });
});

describe('formatNotes', () => {
  it('converts pasted unicode bullets to markdown bullets', () => {
    expect(formatNotes('• one\n· two\n– three')).toBe('- one\n- two\n- three\n');
  });

  it('promotes a bare section label to a heading', () => {
    expect(formatNotes('Next steps:\n- call them')).toBe('## Next steps\n\n- call them\n');
  });

  it('leaves a section name inside a sentence alone', () => {
    const out = formatNotes('We agreed the next steps: I will send the scope');
    expect(out).not.toContain('##');
    expect(out.trim()).toBe('We agreed the next steps: I will send the scope');
  });

  it('collapses runs of blank lines and trims trailing whitespace', () => {
    expect(formatNotes('a   \n\n\n\nb')).toBe('a\n\nb\n');
  });

  it('puts a blank line before a heading that was glued to a paragraph', () => {
    expect(formatNotes('some text\n## Heading')).toBe('some text\n\n## Heading\n');
  });

  it('is idempotent — tidying twice changes nothing further', () => {
    const once = formatNotes('Blockers:\n• waiting on the file\n\n\nNext steps:\n• chase it');
    expect(formatNotes(once)).toBe(once);
  });

  it('never loses a word', () => {
    const raw = 'Attendees:\n• Dana\n• Marcus\nDecisions\n- ship it\nrandom trailing line';
    const before = raw.match(/[A-Za-z]+/g).join(' ');
    const after = formatNotes(raw).match(/[A-Za-z]+/g).join(' ');
    expect(after).toBe(before);
  });

  it('handles empty input', () => {
    expect(formatNotes('')).toBe('');
    expect(formatNotes(null)).toBe('');
  });
});
