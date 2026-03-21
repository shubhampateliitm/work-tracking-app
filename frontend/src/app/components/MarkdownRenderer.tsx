"use client";
import React, { useState } from 'react';

// ---- Inline parser ----

type Inline = string | { t: 'b' | 'i' | 'c'; v: string };

function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const re = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+?`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const s = m[0];
    if (s.startsWith('**')) parts.push({ t: 'b', v: s.slice(2, -2) });
    else if (s.startsWith('`')) parts.push({ t: 'c', v: s.slice(1, -1) });
    else parts.push({ t: 'i', v: s.slice(1, -1) });
    last = m.index + s.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Inlines({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((n, i) => {
        if (typeof n === 'string') return <React.Fragment key={i}>{n}</React.Fragment>;
        if (n.t === 'b') return <strong key={i}>{n.v}</strong>;
        if (n.t === 'c') return <code key={i} className="note-inline-code">{n.v}</code>;
        return <em key={i}>{n.v}</em>;
      })}
    </>
  );
}

// ---- Block parser ----

export type ListItem = { text: string; children: ListItem[] };

type FlatBlock =
  | { k: 'h1' | 'h2' | 'h3'; text: string }
  | { k: 'p'; text: string }
  | { k: 'list'; items: ListItem[] }
  | { k: 'hr' };

function buildListTree(flat: { indent: number; text: string }[]): ListItem[] {
  const root: ListItem[] = [];
  const stack: { item: ListItem; indent: number }[] = [];
  for (const f of flat) {
    const node: ListItem = { text: f.text, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].indent >= f.indent) stack.pop();
    if (stack.length === 0) root.push(node);
    else stack[stack.length - 1].item.children.push(node);
    stack.push({ item: node, indent: f.indent });
  }
  return root;
}

function parseBlocks(text: string): FlatBlock[] {
  const lines = text.split('\n');
  const blocks: FlatBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('### ')) { blocks.push({ k: 'h3', text: line.slice(4) }); i++; }
    else if (line.startsWith('## ')) { blocks.push({ k: 'h2', text: line.slice(3) }); i++; }
    else if (line.startsWith('# ')) { blocks.push({ k: 'h1', text: line.slice(2) }); i++; }
    else if (/^(\s*)([-*]) /.test(line)) {
      const flat: { indent: number; text: string }[] = [];
      while (i < lines.length) {
        const lm = lines[i].match(/^(\s*)([-*]) (.*)/);
        if (lm) { flat.push({ indent: lm[1].length, text: lm[3] }); i++; }
        else if (lines[i].trim() === '') { i++; break; }
        else break;
      }
      blocks.push({ k: 'list', items: buildListTree(flat) });
    }
    else if (line.trim() === '---') { blocks.push({ k: 'hr' }); i++; }
    else if (line.trim() !== '') { blocks.push({ k: 'p', text: line }); i++; }
    else i++;
  }
  return blocks;
}

// ---- Section tree ----

type SectionNode = { k: 'section'; level: 1 | 2 | 3; title: string; children: RNode[] };
type RNode = SectionNode | { k: 'p'; text: string } | { k: 'list'; items: ListItem[] } | { k: 'hr' };

function buildTree(blocks: FlatBlock[]): RNode[] {
  const root: RNode[] = [];
  const stack: { level: 1 | 2 | 3; node: SectionNode }[] = [];
  const target = (): RNode[] => (stack.length > 0 ? stack[stack.length - 1].node.children : root);

  for (const b of blocks) {
    if (b.k === 'h1' || b.k === 'h2' || b.k === 'h3') {
      const level = b.k === 'h1' ? 1 : b.k === 'h2' ? 2 : 3;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      const section: SectionNode = { k: 'section', level, title: b.text, children: [] };
      target().push(section);
      stack.push({ level, node: section });
    } else if (b.k === 'p') {
      target().push({ k: 'p', text: b.text });
    } else if (b.k === 'list') {
      target().push({ k: 'list', items: b.items });
    } else if (b.k === 'hr') {
      target().push({ k: 'hr' });
    }
  }
  return root;
}

// ---- Render components ----

function NodeRender({ node }: { node: RNode }) {
  const [open, setOpen] = useState(true);

  if (node.k === 'section') {
    const Tag = node.level === 1 ? 'h2' : node.level === 2 ? 'h3' : 'h4';
    return (
      <div className={`md-section md-section--${node.level}`}>
        <Tag className={`md-heading md-h${node.level}`}>
          <button
            className={`md-toggle${open ? ' md-toggle--open' : ''}`}
            onClick={() => setOpen(o => !o)}
            title={open ? 'Collapse section' : 'Expand section'}
          >
            {open ? '▾' : '▸'}
          </button>
          <Inlines text={node.title} />
        </Tag>
        {open && (
          <div className="md-section-body">
            {node.children.map((c, i) => <NodeRender key={i} node={c} />)}
          </div>
        )}
      </div>
    );
  }

  if (node.k === 'p') return <p className="note-md-p"><Inlines text={node.text} /></p>;
  if (node.k === 'hr') return <hr className="md-hr" />;
  if (node.k === 'list') return <ListGroup items={node.items} />;
  return null;
}

function ListGroup({ items }: { items: ListItem[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="md-list-group">
      <button
        className={`md-list-toggle${open ? ' md-list-toggle--open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        {open ? '▾' : '▸'}
        <span className="md-list-count">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </button>
      {open && (
        <ul className="md-list">
          {items.map((item, i) => <ListItemRender key={i} item={item} />)}
        </ul>
      )}
    </div>
  );
}

function ListItemRender({ item }: { item: ListItem }) {
  const [open, setOpen] = useState(true);
  return (
    <li className="md-list-item">
      <span className="md-list-item-row">
        {item.children.length > 0 && (
          <button className="md-sub-toggle" onClick={() => setOpen(o => !o)}>
            {open ? '▾' : '▸'}
          </button>
        )}
        {item.children.length === 0 && <span className="md-bullet">•</span>}
        <Inlines text={item.text} />
      </span>
      {open && item.children.length > 0 && (
        <ul className="md-list md-list--nested">
          {item.children.map((c, i) => <ListItemRender key={i} item={c} />)}
        </ul>
      )}
    </li>
  );
}

export function CollapsibleMarkdown({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) return <p className="note-md-empty">Nothing to preview yet.</p>;
  const tree = buildTree(parseBlocks(text));
  return (
    <div className={`note-md-body${className ? ' ' + className : ''}`}>
      {tree.map((node, i) => <NodeRender key={i} node={node} />)}
    </div>
  );
}
