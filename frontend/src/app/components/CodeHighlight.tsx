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

export const EXECUTABLE_LANGS = new Set(['python', 'javascript', 'bash', 'go', 'typescript']);

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

// ---- Execution output component ----

type ExecState = 'idle' | 'running' | 'done';
type ExecResult = { stdout: string; stderr: string; exit_code: number; timed_out: boolean };

function CodeOutput({ result, state }: { result: ExecResult | null; state: ExecState }) {
  if (state === 'idle' && !result) return null;

  if (state === 'running') {
    return (
      <div className="nb-code-output nb-code-output--running">
        <span className="nb-code-output-label">Running…</span>
        <span className="nb-code-output-spinner">⟳</span>
      </div>
    );
  }

  if (!result) return null;

  const hasError = result.stderr && result.stderr.trim().length > 0;
  const hasOutput = result.stdout && result.stdout.trim().length > 0;

  return (
    <div className={`nb-code-output${hasError && !hasOutput ? ' nb-code-output--error' : ''}`}>
      {result.timed_out && (
        <div className="nb-code-output-timeout">
          <span className="nb-code-output-label">⏱ Timed out</span>
        </div>
      )}
      {hasOutput && (
        <div className="nb-code-output-section">
          <span className="nb-code-output-label">Output</span>
          <pre className="nb-code-output-pre">{result.stdout}</pre>
        </div>
      )}
      {hasError && (
        <div className="nb-code-output-section nb-code-output-section--error">
          <span className="nb-code-output-label">Error</span>
          <pre className="nb-code-output-pre nb-code-output-pre--error">{result.stderr}</pre>
        </div>
      )}
      {!hasOutput && !hasError && !result.timed_out && (
        <div className="nb-code-output-section">
          <span className="nb-code-output-label">✓ Executed (no output)</span>
        </div>
      )}
    </div>
  );
}

// ---- Read-only highlighted code block ----

export function CodeView({ code, lang, apiUrl }: { code: string; lang?: string; apiUrl?: string }) {
  const [execState, setExecState] = useState<ExecState>('idle');
  const [execResult, setExecResult] = useState<ExecResult | null>(null);
  const html = highlight(code, lang);
  const canExecute = lang && EXECUTABLE_LANGS.has(lang) && apiUrl;

  const runCode = useCallback(async () => {
    if (!canExecute) return;
    setExecState('running');
    setExecResult(null);
    try {
      const res = await fetch(`${apiUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang, code }),
      });
      if (res.ok) {
        setExecResult(await res.json());
      } else {
        setExecResult({ stdout: '', stderr: `HTTP ${res.status}: ${await res.text()}`, exit_code: -1, timed_out: false });
      }
    } catch (err) {
      setExecResult({ stdout: '', stderr: `Network error: ${err}`, exit_code: -1, timed_out: false });
    }
    setExecState('done');
  }, [apiUrl, lang, code, canExecute]);

  return (
    <div className="nb-code-view">
      <div className="nb-code-view-header">
        {lang && <span className="nb-code-lang-badge">{SUPPORTED_LANGS.find(l => l.id === lang)?.label ?? lang}</span>}
        {canExecute && (
          <button
            className={`nb-code-run-btn${execState === 'running' ? ' nb-code-run-btn--running' : ''}`}
            onClick={runCode}
            disabled={execState === 'running'}
            title="Run code"
          >
            {execState === 'running' ? '⟳' : '▶'} Run
          </button>
        )}
      </div>
      <pre className={`nb-code-pre language-${lang ?? 'none'}`}
        dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} />
      <CodeOutput result={execResult} state={execState} />
    </div>
  );
}

// ---- Editable code block (textarea + highlight overlay) ----

type CodeEditorProps = {
  code: string;
  lang?: string;
  onChange: (code: string) => void;
  onLangChange: (lang: string | undefined) => void;
  apiUrl?: string;
};

export function CodeBlockEditor({ code, lang, onChange, onLangChange, apiUrl }: CodeEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [execState, setExecState] = useState<ExecState>('idle');
  const [execResult, setExecResult] = useState<ExecResult | null>(null);

  const canExecute = lang && EXECUTABLE_LANGS.has(lang) && apiUrl;

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

  const runCode = useCallback(async () => {
    if (!canExecute) return;
    setExecState('running');
    setExecResult(null);
    try {
      const res = await fetch(`${apiUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang, code }),
      });
      if (res.ok) {
        setExecResult(await res.json());
      } else {
        setExecResult({ stdout: '', stderr: `HTTP ${res.status}: ${await res.text()}`, exit_code: -1, timed_out: false });
      }
    } catch (err) {
      setExecResult({ stdout: '', stderr: `Network error: ${err}`, exit_code: -1, timed_out: false });
    }
    setExecState('done');
  }, [apiUrl, lang, code, canExecute]);

  const html = highlight(code, lang);

  return (
    <div className="nb-code-editor-wrap">
      {/* Language selector + Run button */}
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
        {canExecute && (
          <button
            className={`nb-code-run-btn${execState === 'running' ? ' nb-code-run-btn--running' : ''}`}
            onClick={e => { e.stopPropagation(); runCode(); }}
            disabled={execState === 'running'}
            title="Run code"
          >
            {execState === 'running' ? '⟳' : '▶'} Run
          </button>
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

      {/* Execution output */}
      <CodeOutput result={execResult} state={execState} />
    </div>
  );
}
