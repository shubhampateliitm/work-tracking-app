"use client";
import React, { useRef, useState, useCallback, useEffect } from 'react';
import Prism from 'prismjs';
// Dependency chain must be in order: clike → java → scala, javascript → typescript
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-bash';

export const SUPPORTED_LANGS = [
  { id: 'go',         label: 'Go' },
  { id: 'scala',      label: 'Scala' },
  { id: 'python',     label: 'Python' },
  { id: 'bash',       label: 'Bash' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'Node.js / JS' },
];

// Map our lang IDs to Prism grammar keys
const PRISM_LANG: Record<string, string> = {
  go: 'go',
  scala: 'scala',
  python: 'python',
  bash: 'bash',
  typescript: 'typescript',
  javascript: 'javascript',
};

export function highlight(code: string, lang?: string): string {
  if (!lang) return escapeHtml(code);
  const prismLang = PRISM_LANG[lang];
  if (!prismLang || !Prism.languages[prismLang]) return escapeHtml(code);
  try {
    return Prism.highlight(code, Prism.languages[prismLang], prismLang);
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- Read-only highlighted code block ----

export function CodeView({ code, lang }: { code: string; lang?: string }) {
  const html = highlight(code, lang);
  return (
    <div className="nb-code-view">
      {lang && <span className="nb-code-lang-badge">{SUPPORTED_LANGS.find(l => l.id === lang)?.label ?? lang}</span>}
      <pre className={`nb-code-pre language-${lang ?? 'none'}`}
        dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} />
    </div>
  );
}

// ---- Editable code block (textarea + highlight overlay) ----

type CodeEditorProps = {
  code: string;
  lang?: string;
  onChange: (code: string) => void;
  onLangChange: (lang: string | undefined) => void;
};

export function CodeBlockEditor({ code, lang, onChange, onLangChange }: CodeEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Keep textarea height in sync with content
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [code]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = code.slice(0, start) + '  ' + code.slice(end);
      onChange(next);
      requestAnimationFrame(() => ta.setSelectionRange(start + 2, start + 2));
    }
  }, [code, onChange]);

  const html = highlight(code, lang);

  return (
    <div className="nb-code-editor-wrap">
      {/* Language selector */}
      <div className="nb-code-toolbar">
        <button
          className="nb-code-lang-btn"
          onClick={e => { e.stopPropagation(); setShowLangMenu(v => !v); }}
        >
          {SUPPORTED_LANGS.find(l => l.id === lang)?.label ?? 'Plain'}
          <span className="nb-code-lang-arrow">▾</span>
        </button>
        {showLangMenu && (
          <div className="nb-code-lang-menu" onClick={e => e.stopPropagation()}>
            <button className="nb-code-lang-item" onClick={() => { onLangChange(undefined); setShowLangMenu(false); }}>
              Plain
            </button>
            {SUPPORTED_LANGS.map(l => (
              <button
                key={l.id}
                className={`nb-code-lang-item${lang === l.id ? ' nb-code-lang-item--active' : ''}`}
                onClick={() => { onLangChange(l.id); setShowLangMenu(false); }}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Overlay: highlighted pre behind transparent textarea */}
      <div className="nb-code-overlay-wrap">
        <pre
          className="nb-code-overlay-pre"
          aria-hidden
          dangerouslySetInnerHTML={{ __html: (html || '&nbsp;') + '\n' }}
        />
        <textarea
          ref={taRef}
          className="nb-code-overlay-ta"
          value={code}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={1}
        />
      </div>
    </div>
  );
}
