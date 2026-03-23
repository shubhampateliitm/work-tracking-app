"use client";
import React, { useState, useEffect } from 'react';
import { TaskNote } from '../types';
import { BlockViewer } from './BlockViewer';
import { NoteEditor } from './NoteEditor';

type Props = {
  apiUrl: string;
};

export function NotesView({ apiUrl }: Props) {
  const [catalog, setCatalog] = useState<TaskNote[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingNote, setEditingNote] = useState<TaskNote | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiUrl}/notes/catalog`);
        if (res.ok) setCatalog(await res.json());
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [apiUrl]);

  const filtered = catalog.filter(n =>
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (n.task_title ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openEdit = (note: TaskNote) => {
    setEditingNote(note);
    setDraftTitle(note.title);
    setDraftContent(note.content);
  };

  const saveEdit = async () => {
    if (!editingNote) return;
    const updated = { ...editingNote, title: draftTitle, content: draftContent, is_published: true };
    try {
      const res = await fetch(`${apiUrl}/notes/${editingNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const saved: TaskNote = await res.json();
        setCatalog(prev => prev.map(n => n.id === saved.id ? { ...saved, task_title: n.task_title } : n));
      }
    } catch { /* ignore */ }
    setEditingNote(null);
  };

  const formatDate = (ds?: string | null) => {
    if (!ds) return '';
    return new Date(ds).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="notes-catalog-view">
      <div className="notes-catalog-header">
        <h2 className="notes-catalog-title">Notes Catalog</h2>
        <p className="notes-catalog-subtitle">Published notes from across your tasks</p>
        <input
          className="notes-catalog-search"
          type="search"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {loading && <p className="notes-catalog-empty">Loading...</p>}
      {!loading && filtered.length === 0 && (
        <div className="notes-catalog-empty">
          {catalog.length === 0
            ? 'No published notes yet. Open a task, add notes, and click "Publish to Catalog".'
            : 'No notes match your search.'}
        </div>
      )}

      {editingNote && (
        <NoteEditor
          title={draftTitle}
          content={draftContent}
          onTitleChange={setDraftTitle}
          onContentChange={setDraftContent}
          onSave={saveEdit}
          onCancel={() => setEditingNote(null)}
          apiUrl={apiUrl}
        />
      )}

      <div className="notes-catalog-grid">
        {filtered.map(note => (
          <div
            key={note.id}
            className={`catalog-note-card${expandedId === note.id ? ' catalog-note-card--expanded' : ''}`}
          >
            <div className="catalog-note-header" onClick={() => setExpandedId(expandedId === note.id ? null : note.id)}>
              <div className="catalog-note-title-row">
                <h3 className="catalog-note-title">{note.title}</h3>
                <div className="catalog-note-actions">
                  <button
                    className="catalog-note-edit-btn"
                    aria-label="Edit note"
                    onClick={e => { e.stopPropagation(); openEdit(note); }}
                  >
                    Edit
                  </button>
                  <span className="catalog-note-expand-btn">{expandedId === note.id ? '▲' : '▼'}</span>
                </div>
              </div>
              <div className="catalog-note-meta">
                <span className="catalog-note-task">from: {note.task_title}</span>
                {note.updated_at && <span className="catalog-note-date">{formatDate(note.updated_at)}</span>}
              </div>
            </div>
            {expandedId === note.id ? (
              <div className="catalog-note-body">
                <BlockViewer content={note.content} apiUrl={apiUrl} />
              </div>
            ) : (
              <p className="catalog-note-excerpt">
                {note.content.split('\n').find(l => l.trim() && !l.startsWith('#')) ?? note.content.slice(0, 150)}
                {note.content.length > 150 ? '…' : ''}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
