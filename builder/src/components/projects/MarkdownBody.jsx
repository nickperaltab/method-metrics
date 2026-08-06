// Renders the block AST from lib/markdown.js as React elements.
//
// Nothing here builds an HTML string, so `dangerouslySetInnerHTML` is never
// involved — work-log notes are frequently pasted straight out of a customer
// email, and this is the boundary that makes that safe. Link hrefs were already
// restricted to http(s) by the parser.

import { parseMarkdown } from '../../lib/markdown';

const styles = {
  body: { fontSize: 14, color: '#374151', lineHeight: 1.6 },
  h: {
    1: { fontSize: 17, fontWeight: 700, color: '#1a1a1a', margin: '20px 0 8px' },
    2: { fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: '18px 0 6px' },
    3: { fontSize: 13, fontWeight: 700, color: '#374151', margin: '16px 0 6px' },
    4: {
      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
      letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280', margin: '16px 0 6px',
    },
  },
  para: { margin: '0 0 10px' },
  list: { margin: '0 0 12px', paddingLeft: 22 },
  li: { margin: '0 0 4px' },
  quote: {
    margin: '0 0 12px', padding: '6px 12px', borderLeft: '3px solid #e2e5e9',
    color: '#6b7280', fontStyle: 'italic',
  },
  code: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, background: '#f6f7f8',
    border: '1px solid #eceef0', borderRadius: 4, padding: '1px 5px',
  },
  pre: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, background: '#f6f7f8',
    border: '1px solid #eceef0', borderRadius: 6, padding: '10px 12px',
    overflowX: 'auto', margin: '0 0 12px',
  },
  hr: { border: 'none', borderTop: '1px solid #e2e5e9', margin: '16px 0' },
  link: { color: '#047857', textUnderlinePosition: 'under' },
  first: { marginTop: 0 },
};

function Spans({ spans }) {
  return spans.map((span, i) => {
    switch (span.type) {
      case 'strong':
        return <strong key={i}>{span.text}</strong>;
      case 'em':
        return <em key={i}>{span.text}</em>;
      case 'code':
        return <code key={i} style={styles.code}>{span.text}</code>;
      case 'link':
        return (
          <a key={i} href={span.href} target="_blank" rel="noreferrer" style={styles.link}>
            {span.text}
          </a>
        );
      default:
        return <span key={i}>{span.text}</span>;
    }
  });
}

export default function MarkdownBody({ markdown, style }) {
  const blocks = parseMarkdown(markdown);
  if (!blocks.length) return null;

  return (
    <div style={{ ...styles.body, ...style }}>
      {blocks.map((block, i) => {
        const first = i === 0 ? styles.first : null;
        switch (block.type) {
          case 'heading': {
            const Tag = `h${Math.min(block.level + 1, 6)}`;
            return (
              <Tag key={i} style={{ ...styles.h[block.level], ...first }}>
                <Spans spans={block.spans} />
              </Tag>
            );
          }
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            return (
              <Tag key={i} style={{ ...styles.list, ...first }}>
                {block.items.map((spans, j) => (
                  <li key={j} style={styles.li}><Spans spans={spans} /></li>
                ))}
              </Tag>
            );
          }
          case 'quote':
            return (
              <blockquote key={i} style={{ ...styles.quote, ...first }}>
                <Spans spans={block.spans} />
              </blockquote>
            );
          case 'code':
            return <pre key={i} style={{ ...styles.pre, ...first }}>{block.text}</pre>;
          case 'hr':
            return <hr key={i} style={styles.hr} />;
          default:
            return (
              <p key={i} style={{ ...styles.para, ...first }}>
                <Spans spans={block.spans} />
              </p>
            );
        }
      })}
    </div>
  );
}
