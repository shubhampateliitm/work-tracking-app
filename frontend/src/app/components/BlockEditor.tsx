"use client";
import React, { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { CodeBlockEditor } from './CodeHighlight';

// ---- Types ----

export type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'li' | 'code' | 'hr' | 'image';

export type NoteBlock = {
  id: string;
  type: BlockType;
  text: string;
  indent: number;
  width?: number; // image width as percentage (10–100)
  lang?: string;  // language for code blocks
};

// ---- Serialization ----

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function blocksToMarkdown(blocks: NoteBlock[]): string {
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.type === 'h1') lines.push(`# ${b.text}`);
    else if (b.type === 'h2') lines.push(`## ${b.text}`);
    else if (b.type === 'h3') lines.push(`### ${b.text}`);
    else if (b.type === 'li') lines.push(`${'  '.repeat(Math.max(0, b.indent))}- ${b.text}`);
    else if (b.type === 'code') lines.push(`\`\`\`${b.lang ?? ''}`, b.text, '```');
    else if (b.type === 'hr') lines.push('---');
    else if (b.type === 'image') lines.push(`![w=${b.width ?? 100}](${b.text})`);
    else if (b.text !== '') lines.push(b.text);
  }
  return lines.join('\n');
}

export function markdownToBlocks(md: string): NoteBlock[] {
  if (!md?.trim()) return [{ id: uid(), type: 'p', text: '', indent: 0 }];
  const lines = md.split('\n');
  const blocks: NoteBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('### ')) {
      blocks.push({ id: uid(), type: 'h3', text: line.slice(4), indent: 0 });
    } else if (line.startsWith('## ')) {
      blocks.push({ id: uid(), type: 'h2', text: line.slice(3), indent: 0 });
    } else if (line.startsWith('# ')) {
      blocks.push({ id: uid(), type: 'h1', text: line.slice(2), indent: 0 });
    } else if (line.trim() === '```' || line.startsWith('```')) {
      const lang = line.replace(/^`{3}/, '').trim() || undefined;
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      blocks.push({ id: uid(), type: 'code', text: codeLines.join('\n'), indent: 0, lang });
    } else if (/^(\s*)([-*]) /.test(line)) {
      const m = line.match(/^(\s*)([-*]) (.*)/);
      if (m) blocks.push({ id: uid(), type: 'li', text: m[3], indent: Math.floor(m[1].length / 2) });
    } else if (line.trim() === '---') {
      blocks.push({ id: uid(), type: 'hr', text: '', indent: 0 });
    } else if (/^!\[(?:w=(\d+))?\]\((.+)\)$/.test(line.trim())) {
      const m = line.trim().match(/^!\[(?:w=(\d+))?\]\((.+)\)$/);
      if (m) blocks.push({ id: uid(), type: 'image', text: m[2], indent: 0, width: m[1] ? parseInt(m[1]) : 100 });
    } else if (line.trim() !== '') {
      blocks.push({ id: uid(), type: 'p', text: line, indent: 0 });
    }
    i++;
  }
  if (blocks.length === 0) blocks.push({ id: uid(), type: 'p', text: '', indent: 0 });
  return blocks;
}

// ---- Cursor helpers ----

function getCursorOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return el.innerText.length;
  try {
    const range = sel.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  } catch { return 0; }
}

function focusAtStart(el: HTMLElement) {
  el.focus();
  try {
    const range = document.createRange();
    range.setStart(el.childNodes[0] ?? el, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } catch { el.focus(); }
}

function focusAtEnd(el: HTMLElement) {
  el.focus();
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } catch { el.focus(); }
}

// ---- Fold helpers ----

export function getHiddenIdxs(blocks: NoteBlock[], folded: Set<string>): Set<number> {
  const hidden = new Set<number>();
  const hlvl = (t: BlockType) => t === 'h1' ? 1 : t === 'h2' ? 2 : t === 'h3' ? 3 : 0;
  for (let i = 0; i < blocks.length; i++) {
    if (!folded.has(blocks[i].id)) continue;
    const block = blocks[i];
    if (block.type === 'li') {
      for (let j = i + 1; j < blocks.length; j++) {
        if (blocks[j].type === 'li' && blocks[j].indent > block.indent) hidden.add(j);
        else break;
      }
    } else {
      const lvl = hlvl(block.type);
      if (lvl > 0) {
        for (let j = i + 1; j < blocks.length; j++) {
          const jl = hlvl(blocks[j].type);
          if (jl > 0 && jl <= lvl) break;
          hidden.add(j);
        }
      }
    }
  }
  return hidden;
}

export function hasListChildren(blocks: NoteBlock[], idx: number): boolean {
  const next = blocks[idx + 1];
  return blocks[idx].type === 'li' && next?.type === 'li' && next.indent > blocks[idx].indent;
}

function foldedChildCount(blocks: NoteBlock[], blockIdx: number): number {
  const block = blocks[blockIdx];
  if (block.type === 'li') {
    let c = 0;
    for (let j = blockIdx + 1; j < blocks.length; j++) {
      if (blocks[j].type === 'li' && blocks[j].indent > block.indent) c++;
      else break;
    }
    return c;
  }
  const lvl = block.type === 'h1' ? 1 : block.type === 'h2' ? 2 : 3;
  let c = 0;
  for (let j = blockIdx + 1; j < blocks.length; j++) {
    const jt = blocks[j].type;
    const jl = jt === 'h1' ? 1 : jt === 'h2' ? 2 : jt === 'h3' ? 3 : 0;
    if (jl > 0 && jl <= lvl) break;
    c++;
  }
  return c;
}

// ---- Image block with resize handle ----

function ImageBlockEditor({ block, onWidthChange, onDelete }: {
  block: NoteBlock;
  onWidthChange: (w: number) => void;
  onDelete: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startX: number; startW: number } | null>(null);
  const width = block.width ?? 100;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const containerW = wrapRef.current?.getBoundingClientRect().width ?? 0;
    dragState.current = { startX: e.clientX, startW: width };
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current || containerW === 0) return;
      const pct = ((ev.clientX - dragState.current.startX) / containerW) * 100;
      onWidthChange(Math.max(10, Math.min(100, Math.round(dragState.current.startW + pct))));
    };
    const onUp = () => {
      dragState.current = null;
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div ref={wrapRef} className="nb-image-wrap"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="nb-image-frame" style={{ width: `${width}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.text} className="nb-image" alt="" draggable={false} />
        <div
          className={`nb-image-handle${hovered || dragging ? ' nb-image-handle--show' : ''}`}
          onMouseDown={startResize}
          title="Drag to resize"
        />
        {(hovered || dragging) && (
          <>
            <span className="nb-image-size-label">{width}%</span>
            <button className="nb-image-del" onClick={e => { e.stopPropagation(); onDelete(); }} title="Remove image">✕</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Slash menu ----

const SLASH_ITEMS = [
  { icon: 'T', label: 'Text', type: 'p' as BlockType },
  { icon: 'H1', label: 'Heading 1', type: 'h1' as BlockType },
  { icon: 'H2', label: 'Heading 2', type: 'h2' as BlockType },
  { icon: 'H3', label: 'Heading 3', type: 'h3' as BlockType },
  { icon: '•', label: 'Bullet List', type: 'li' as BlockType },
  { icon: '</>', label: 'Code Block', type: 'code' as BlockType },
  { icon: '—', label: 'Divider', type: 'hr' as BlockType },
];

// ---- Main Component ----

type Props = {
  initialContent: string;
  onChange: (markdown: string) => void;
  apiUrl?: string;
};

export type BlockEditorHandle = { focusFirst: () => void };

export const BlockEditor = forwardRef<BlockEditorHandle, Props>(function BlockEditor({ initialContent, onChange, apiUrl }, ref) {
  const [blocks, setBlocks] = useState<NoteBlock[]>(() => markdownToBlocks(initialContent));
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [slashMenu, setSlashMenu] = useState<{ blockId: string; filter: string; idx: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());
  const composing = useRef(false);

  const hiddenIdxs = useMemo(() => getHiddenIdxs(blocks, folded), [blocks, folded]);

  useImperativeHandle(ref, () => ({
    focusFirst() {
      const first = blocks.find((b, i) => !hiddenIdxs.has(i) && b.type !== 'hr');
      if (!first) return;
      const el = blockRefs.current.get(first.id);
      if (el) focusAtStart(el);
    },
  }), [blocks, hiddenIdxs]);

  // Sync block text from state to DOM only when it differs (handles type conversions)
  useEffect(() => {
    blocks.forEach(b => {
      const el = blockRefs.current.get(b.id);
      if (el && b.type !== 'hr') {
        const domText = el.innerText.replace(/\n$/, '');
        if (domText !== b.text) el.innerText = b.text;
      }
    });
  }, [blocks]);

  // Read all current texts from DOM (used before structural changes)
  // Code and image blocks manage their own state — skip DOM sync for them.
  const syncDomTexts = useCallback((): NoteBlock[] => {
    return blocks.map(b => {
      if (b.type === 'code' || b.type === 'image') return b;
      const el = blockRefs.current.get(b.id);
      return { ...b, text: el ? el.innerText.replace(/\n$/, '') : b.text };
    });
  }, [blocks]);

  const commit = useCallback((newBlocks: NoteBlock[]) => {
    setBlocks(newBlocks);
    onChange(blocksToMarkdown(newBlocks));
  }, [onChange]);

  // Filter slash items by query
  const slashItems = useMemo(() => {
    if (!slashMenu?.filter) return SLASH_ITEMS;
    const q = slashMenu.filter.toLowerCase();
    return SLASH_ITEMS.filter(it => it.label.toLowerCase().includes(q) || it.type.includes(q));
  }, [slashMenu]);

  const applySlash = useCallback((blockId: string, type: BlockType) => {
    setSlashMenu(null);
    const idx = blocks.findIndex(b => b.id === blockId);
    if (idx === -1) return;
    const withDom = syncDomTexts();
    if (type === 'hr') {
      const newPara: NoteBlock = { id: uid(), type: 'p', text: '', indent: 0 };
      const newBlocks = [
        ...withDom.slice(0, idx),
        { id: uid(), type: 'hr' as BlockType, text: '', indent: 0 },
        newPara,
        ...withDom.slice(idx + 1),
      ];
      commit(newBlocks);
      requestAnimationFrame(() => { const el = blockRefs.current.get(newPara.id); if (el) focusAtStart(el); });
    } else {
      const newBlocks = withDom.map((b, i) => i === idx ? { ...b, type, text: '' } : b);
      commit(newBlocks);
      requestAnimationFrame(() => { const el = blockRefs.current.get(blockId); if (el) focusAtStart(el); });
    }
  }, [blocks, syncDomTexts, commit]);

  const handleInput = useCallback((blockId: string, el: HTMLElement) => {
    if (composing.current) return;
    const text = el.innerText.replace(/\n$/, '');
    if (text.startsWith('/')) {
      setSlashMenu(s => s?.blockId === blockId ? { ...s, filter: text.slice(1) } : { blockId, filter: text.slice(1), idx: 0 });
    } else {
      setSlashMenu(null);
    }
  }, []);

  const handleBlur = useCallback((blockId: string, el: HTMLElement) => {
    const text = el.innerText.replace(/\n$/, '');
    const next = blocks.map(b => b.id === blockId ? { ...b, text } : b);
    setBlocks(next);
    onChange(blocksToMarkdown(next));
    // Don't clear slash menu on blur (clicking a menu item blurs the block first)
  }, [blocks, onChange]);

  const changeType = useCallback((blockIdx: number, type: BlockType, clearText = false) => {
    const withDom = syncDomTexts();
    commit(withDom.map((b, i) => i === blockIdx ? { ...b, type, text: clearText ? '' : b.text } : b));
  }, [syncDomTexts, commit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>, blockIdx: number) => {
    const block = blocks[blockIdx];
    const el = blockRefs.current.get(block.id);
    if (!el || composing.current) return;

    // Slash menu key navigation
    if (slashMenu?.blockId === block.id) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashMenu(s => s ? { ...s, idx: (s.idx + 1) % slashItems.length } : s); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashMenu(s => s ? { ...s, idx: (s.idx - 1 + slashItems.length) % slashItems.length } : s); return; }
      if (e.key === 'Enter') { e.preventDefault(); applySlash(block.id, slashItems[slashMenu.idx].type); return; }
      if (e.key === 'Escape') { setSlashMenu(null); el.innerText = ''; return; }
    }

    // Ctrl/Cmd+A: select all text across all visible blocks
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      const visibleBlocks = blocks.filter((_, i) => !hiddenIdxs.has(i) && blocks[i].type !== 'hr');
      if (visibleBlocks.length > 1) {
        const firstEl = blockRefs.current.get(visibleBlocks[0].id);
        const lastEl = blockRefs.current.get(visibleBlocks[visibleBlocks.length - 1].id);
        if (firstEl && lastEl) {
          e.preventDefault();
          const range = document.createRange();
          range.setStart(firstEl.childNodes[0] ?? firstEl, 0);
          const lastChild = lastEl.childNodes[lastEl.childNodes.length - 1] ?? lastEl;
          range.setEnd(lastChild, lastChild.textContent?.length ?? 0);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          return;
        }
      }
      return; // fall through to default single-block select-all
    }

    const cursor = getCursorOffset(el);
    const currentText = el.innerText.replace(/\n$/, '');
    const isHeading = block.type === 'h1' || block.type === 'h2' || block.type === 'h3';

    // Enter: create new block
    if (e.key === 'Enter' && !e.shiftKey) {
      if (block.type === 'code') return; // natural newlines in code
      e.preventDefault();
      if (block.type === 'li' && currentText === '') {
        // Empty list item → exit list to paragraph
        changeType(blockIdx, 'p', false);
        requestAnimationFrame(() => focusAtStart(el));
        return;
      }
      const before = currentText.slice(0, cursor);
      const after = currentText.slice(cursor);
      const nextType: BlockType = isHeading ? 'p' : block.type;
      const newBlock: NoteBlock = { id: uid(), type: nextType, text: after, indent: block.type === 'li' ? block.indent : 0 };
      const withDom = syncDomTexts();
      const cleanBlocks = [
        ...withDom.slice(0, blockIdx),
        { ...block, text: before },
        newBlock,
        ...withDom.slice(blockIdx + 1),
      ];
      commit(cleanBlocks);
      requestAnimationFrame(() => { const newEl = blockRefs.current.get(newBlock.id); if (newEl) focusAtStart(newEl); });
    }

    // Backspace
    if (e.key === 'Backspace') {
      // Cross-block selection (e.g. after Ctrl+A): clear everything to one empty block
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) {
          e.preventDefault();
          const emptyBlock: NoteBlock = { id: uid(), type: 'p', text: '', indent: 0 };
          commit([emptyBlock]);
          requestAnimationFrame(() => { const newEl = blockRefs.current.get(emptyBlock.id); if (newEl) focusAtStart(newEl); });
          return;
        }
      }
      if (cursor === 0) {
        if (currentText === '') {
          if (blocks.length === 1) return;
          e.preventDefault();
          const withDom = syncDomTexts();
          commit(withDom.filter((_, i) => i !== blockIdx));
          requestAnimationFrame(() => {
            const prevEl = blockRefs.current.get(blocks[Math.max(0, blockIdx - 1)].id);
            if (prevEl) focusAtEnd(prevEl);
          });
        } else if (block.type !== 'p') {
          e.preventDefault();
          changeType(blockIdx, 'p');
          requestAnimationFrame(() => focusAtStart(el));
        }
      }
    }

    // Tab: indent/dedent list items
    if (e.key === 'Tab') {
      if (block.type === 'li') {
        e.preventDefault();
        const withDom = syncDomTexts();
        const newIndent = e.shiftKey ? Math.max(0, block.indent - 1) : Math.min(4, block.indent + 1);
        commit(withDom.map((b, i) => i === blockIdx ? { ...b, indent: newIndent } : b));
        requestAnimationFrame(() => focusAtEnd(el));
      } else if (block.type === 'code') {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
      }
    }

    // Auto-convert: "# " → h1, "## " → h2, "### " → h3, "- " → li
    if (e.key === ' ' && cursor === currentText.length) {
      const map: Record<string, BlockType> = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'li', '*': 'li' };
      const target = map[currentText];
      if (target) {
        e.preventDefault();
        changeType(blockIdx, target, true);
        requestAnimationFrame(() => focusAtStart(el));
      }
    }

    // Arrow keys: cross-block navigation
    if (e.key === 'ArrowUp' && cursor === 0) {
      const prevIdx = [...Array(blockIdx).keys()].reverse().find(i => !hiddenIdxs.has(i));
      if (prevIdx !== undefined) { e.preventDefault(); const prevEl = blockRefs.current.get(blocks[prevIdx].id); if (prevEl) focusAtEnd(prevEl); }
    }
    if (e.key === 'ArrowDown' && cursor === currentText.length) {
      const nextIdx = [...Array(blocks.length).keys()].slice(blockIdx + 1).find(i => !hiddenIdxs.has(i));
      if (nextIdx !== undefined) { e.preventDefault(); const nextEl = blockRefs.current.get(blocks[nextIdx].id); if (nextEl) focusAtStart(nextEl); }
    }
  }, [blocks, slashMenu, slashItems, hiddenIdxs, applySlash, changeType, syncDomTexts, commit]);

  const toggleFold = useCallback((blockId: string) => {
    setFolded(prev => { const n = new Set(prev); n.has(blockId) ? n.delete(blockId) : n.add(blockId); return n; });
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const imgItem = Array.from(e.clipboardData.items).find(it => it.type.startsWith('image/'));
    if (!imgItem) return;
    e.preventDefault();
    const file = imgItem.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      if (!url) return;
      const imgBlock: NoteBlock = { id: uid(), type: 'image', text: url, indent: 0, width: 100 };
      const withDom = syncDomTexts();
      commit([...withDom, imgBlock]);
    };
    reader.readAsDataURL(file);
  }, [syncDomTexts, commit]);

  const deleteImageBlock = useCallback((blockId: string) => {
    const withDom = syncDomTexts();
    const next = withDom.filter(b => b.id !== blockId);
    commit(next.length === 0 ? [{ id: uid(), type: 'p', text: '', indent: 0 }] : next);
  }, [syncDomTexts, commit]);

  const updateImageWidth = useCallback((blockId: string, w: number) => {
    const next = blocks.map(b => b.id === blockId ? { ...b, width: w } : b);
    setBlocks(next);
    onChange(blocksToMarkdown(next));
  }, [blocks, onChange]);

  const updateCodeBlock = useCallback((blockId: string, patch: { text?: string; lang?: string | undefined }) => {
    const next = blocks.map(b => b.id === blockId ? { ...b, ...patch } : b);
    setBlocks(next);
    onChange(blocksToMarkdown(next));
  }, [blocks, onChange]);

  const isHeadingType = (t: BlockType) => t === 'h1' || t === 'h2' || t === 'h3';

  return (
    <div className="nb-editor" onClick={() => setSlashMenu(null)} onPaste={handlePaste}>
      {blocks.map((block, blockIdx) => {
        if (hiddenIdxs.has(blockIdx)) return null;
        const isFolded = folded.has(block.id);
        const isHov = hoveredId === block.id;
        const isHead = isHeadingType(block.type);
        const hasFoldableChildren = isHead || hasListChildren(blocks, blockIdx);

        if (block.type === 'code') {
          return (
            <div key={block.id} className="nb-row nb-row--code">
              <div className="nb-gutter" />
              <div className="nb-block-wrap" style={{ flex: 1 }}>
                <CodeBlockEditor
                  code={block.text}
                  lang={block.lang}
                  onChange={text => updateCodeBlock(block.id, { text })}
                  onLangChange={lang => updateCodeBlock(block.id, { lang })}
                  apiUrl={apiUrl}
                />
              </div>
            </div>
          );
        }

        if (block.type === 'image') {
          return (
            <div key={block.id} className="nb-row nb-row--image">
              <div className="nb-gutter" />
              <ImageBlockEditor
                block={block}
                onWidthChange={w => updateImageWidth(block.id, w)}
                onDelete={() => deleteImageBlock(block.id)}
              />
            </div>
          );
        }

        if (block.type === 'hr') {
          return (
            <div key={block.id} className="nb-row nb-row--hr"
              onMouseEnter={() => setHoveredId(block.id)} onMouseLeave={() => setHoveredId(null)}>
              <div className="nb-gutter" />
              <div className="nb-hr-line" />
              {isHov && (
                <button className="nb-hr-del" onClick={e => { e.stopPropagation(); commit(syncDomTexts().filter((_, i) => i !== blockIdx)); }}>×</button>
              )}
            </div>
          );
        }

        return (
          <div key={block.id} className={`nb-row nb-row--${block.type}`}
            onMouseEnter={() => setHoveredId(block.id)} onMouseLeave={() => setHoveredId(null)}>
            <div className="nb-gutter">
              {hasFoldableChildren && (
                <button
                  className={`nb-fold-btn${isFolded ? ' nb-fold-btn--folded' : ''}${isHov || isFolded ? ' nb-fold-btn--show' : ''}`}
                  onClick={e => { e.stopPropagation(); toggleFold(block.id); }}
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
              <div
                ref={el => { if (el) blockRefs.current.set(block.id, el); else blockRefs.current.delete(block.id); }}
                className={`nb-block nb-block--${block.type}${!slashMenu && block.text === '' ? ' nb-block--empty' : ''}`}
                contentEditable
                suppressContentEditableWarning
                data-placeholder=""
                onInput={e => handleInput(block.id, e.currentTarget)}
                onKeyDown={e => handleKeyDown(e, blockIdx)}
                onBlur={e => handleBlur(block.id, e.currentTarget)}
                onCompositionStart={() => { composing.current = true; }}
                onCompositionEnd={e => { composing.current = false; handleInput(block.id, e.currentTarget); }}
              />
              {slashMenu?.blockId === block.id && slashItems.length > 0 && (
                <div className="nb-slash-menu" onClick={e => e.stopPropagation()}>
                  {slashItems.map((item, i) => (
                    <button
                      key={item.type}
                      className={`nb-slash-item${i === slashMenu.idx ? ' nb-slash-item--active' : ''}`}
                      onMouseDown={e => { e.preventDefault(); applySlash(block.id, item.type); }}
                    >
                      <span className="nb-slash-icon">{item.icon}</span>
                      <span className="nb-slash-label">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {isFolded && hasFoldableChildren && (
                <span className="nb-fold-hint" onClick={() => toggleFold(block.id)}>
                  ··· {foldedChildCount(blocks, blockIdx)} hidden
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div className="nb-add-area" onClick={() => {
        const last = blocks[blocks.length - 1];
        if (last?.type === 'p' && last.text === '') {
          const el = blockRefs.current.get(last.id);
          if (el) { focusAtEnd(el); return; }
        }
        const withDom = syncDomTexts();
        const newBlock: NoteBlock = { id: uid(), type: 'p', text: '', indent: 0 };
        commit([...withDom, newBlock]);
        requestAnimationFrame(() => { const el = blockRefs.current.get(newBlock.id); if (el) focusAtStart(el); });
      }} />
    </div>
  );
});
