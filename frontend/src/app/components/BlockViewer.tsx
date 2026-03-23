"use client";
import React, { useState } from 'react';
import { markdownToBlocks, getHiddenIdxs, hasListChildren, NoteBlock, BlockType } from './BlockEditor';
import { CodeView } from './CodeHighlight';

const URL_RE = /https?:\/\/[^\s<>"')]+/g;

function TextWithLinks({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const url = m[0];
    parts.push(
      <a key={m.index} href={url} target="_blank" rel="noopener noreferrer" className="nb-link"
        onClick={e => e.stopPropagation()}>
        {url}
      </a>
    );
    last = m.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function foldedChildCount(blocks: NoteBlock[], headingIdx: number): number {
  const lvl = blocks[headingIdx].type === 'h1' ? 1 : blocks[headingIdx].type === 'h2' ? 2 : 3;
  let c = 0;
  for (let j = headingIdx + 1; j < blocks.length; j++) {
    const jt = blocks[j].type;
    const jl = jt === 'h1' ? 1 : jt === 'h2' ? 2 : jt === 'h3' ? 3 : 0;
    if (jl > 0 && jl <= lvl) break;
    c++;
  }
  return c;
}

const isHeadingType = (t: BlockType) => t === 'h1' || t === 'h2' || t === 'h3';

export function BlockViewer({ content, apiUrl }: { content: string; apiUrl?: string }) {
  const blocks = markdownToBlocks(content);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const hiddenIdxs = getHiddenIdxs(blocks, folded);

  const toggleFold = (id: string) => {
    setFolded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  return (
    <div className="nb-viewer">
      {blocks.map((block, blockIdx) => {
        if (hiddenIdxs.has(blockIdx)) return null;
        const isFolded = folded.has(block.id);
        const isHov = hoveredId === block.id;
        const isHead = isHeadingType(block.type);
        const hasFoldableChildren = isHead || hasListChildren(blocks, blockIdx);

        if (block.type === 'image') {
          return (
            <div key={block.id} className="nb-vrow nb-vrow--image">
              <div className="nb-gutter" />
              <div className="nb-image-wrap">
                <div className="nb-image-frame" style={{ width: `${block.width ?? 100}%` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={block.text} className="nb-image" alt="" draggable={false} />
                </div>
              </div>
            </div>
          );
        }

        if (block.type === 'hr') {
          return <div key={block.id} className="nb-vrow nb-vrow--hr"><div className="nb-hr-line" /></div>;
        }

        return (
          <div
            key={block.id}
            className={`nb-vrow nb-vrow--${block.type}`}
            onMouseEnter={() => setHoveredId(block.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div className="nb-gutter">
              {hasFoldableChildren && (
                <button
                  className={`nb-fold-btn${isFolded ? ' nb-fold-btn--folded' : ''}${isHov || isFolded ? ' nb-fold-btn--show' : ''}`}
                  onClick={() => toggleFold(block.id)}
                  title={isFolded ? 'Expand' : 'Collapse'}
                >
                  {isFolded ? '▸' : '▾'}
                </button>
              )}
            </div>
            <div
              className="nb-block-wrap"
              style={block.type === 'li' ? { '--nb-indent': block.indent } as React.CSSProperties : undefined}
            >
              {block.type === 'li' && <span className="nb-li-dot">•</span>}
              <div className={`nb-block nb-block--${block.type} nb-block--readonly`}>
                {block.type === 'code' ? (
                  <CodeView code={block.text} lang={block.lang} apiUrl={apiUrl} />
                ) : block.text ? (
                  <TextWithLinks text={block.text} />
                ) : (
                  <span className="nb-block-empty-placeholder" />
                )}
              </div>
              {isFolded && hasFoldableChildren && (
                <span className="nb-fold-hint" onClick={() => toggleFold(block.id)}>
                  ··· {foldedChildCount(blocks, blockIdx)} hidden
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
