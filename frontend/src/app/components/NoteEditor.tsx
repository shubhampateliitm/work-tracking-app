"use client";
import React, { useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { BlockEditor, BlockEditorHandle } from './BlockEditor';

type Props = {
  title: string;
  content: string;
  onTitleChange: (t: string) => void;
  onContentChange: (c: string) => void;
  onSave: () => void;
  onCancel: () => void;
  apiUrl?: string;
};

export function NoteEditor({ title, content, onTitleChange, onContentChange, onSave, onCancel, apiUrl }: Props) {
  const editorRef = useRef<BlockEditorHandle>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Lock body scroll and focus title on mount
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    titleRef.current?.focus();
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Escape to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const modal = (
    <div className="note-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="note-modal" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="note-modal-header">
          <input
            ref={titleRef}
            className="note-modal-title"
            placeholder="Untitled note…"
            value={title}
            onChange={e => onTitleChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); editorRef.current?.focusFirst(); }
            }}
          />
          <button className="note-modal-close" onClick={onCancel} title="Close (Esc)">✕</button>
        </div>

        {/* Body */}
        <div className="note-modal-body">
          <BlockEditor ref={editorRef} initialContent={content} onChange={onContentChange} apiUrl={apiUrl} />
        </div>

        {/* Footer */}
        <div className="note-modal-footer">
          <button className="note-modal-cancel" onClick={onCancel}>Cancel</button>
          <button
            className="note-modal-save"
            onClick={onSave}
            disabled={!title.trim() || !content.trim()}
          >
            Save note
          </button>
        </div>

      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
