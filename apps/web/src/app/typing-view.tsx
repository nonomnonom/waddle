import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { useAssist, useRemoteFill } from '../lib/use-assist.js';

const TASKS = [
  { code: 'translate_to_english', label: 'Terjemahkan (AI)' },
  { code: 'paraphrase', label: 'Parafrase' },
  { code: 'find_supporting_references', label: 'Referensi' },
] as const;

interface AiResult {
  text: string;
  provider: string;
  cacheHit: boolean;
  references?: { title: string; authors: string[]; year: number | null; url: string }[];
}

export interface SavedInfo {
  ok: boolean;
  message?: string;
}

export function TypingView({ signedIn, onSaved }: { signedIn: boolean; onSaved: (s: SavedInfo) => void }) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [ai, setAi] = useState<{ task: string; result?: AiResult; error?: string; busy: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const assist = useAssist(text, caret);

  useEffect(() => {
    setChosen(assist.suggestions[0]?.text ?? null);
  }, [assist.suggestions]);

  const clauseWords = useMemo(() => assist.clause.split(/\s+/).filter(Boolean).length, [assist.clause]);

  const runTask = useCallback(
    async (code: string) => {
      if (!assist.clause) return;
      setAi({ task: code, busy: true });
      try {
        const r = await api<AiResult>(`/v1/ai/tasks/${code}`, {
          method: 'POST',
          body: JSON.stringify({ text: assist.clause, sourceLang: 'id', targetLang: 'en', stream: false }),
        });
        setAi({ task: code, busy: false, result: r });
      } catch (err) {
        setAi({ task: code, busy: false, error: err instanceof ApiError ? err.message : 'Gagal menghubungi server.' });
      }
    },
    [assist.clause],
  );

  const save = useCallback(async () => {
    if (!signedIn) {
      onSaved({ ok: false, message: 'Masuk dulu untuk menyimpan.' });
      return;
    }
    if (!assist.clause) return;
    setSaving(true);
    try {
      await api('/v1/contents/batch', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            {
              clientId: crypto.randomUUID(),
              sourceText: assist.clause,
              sourceLang: 'id',
              collectedAt: Date.now(),
              tzOffsetMinutes: -new Date().getTimezoneOffset(),
              ...(chosen
                ? { translation: { targetLang: 'en', provider: ai?.result ? 'remote-llm' : 'local-dictionary', text: chosen } }
                : {}),
            },
          ],
        }),
      });
      onSaved({ ok: true });
    } catch (err) {
      onSaved({ ok: false, message: err instanceof ApiError ? err.message : 'Gagal menyimpan.' });
    } finally {
      setSaving(false);
    }
  }, [assist.clause, chosen, ai, onSaved, signedIn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void save();
      }
      if (e.key === 'Escape') {
        setText('');
        setAi(null);
        areaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const coveragePct = Math.round(assist.coverage * 100);

  return (
    <div className="split">
      <section className="pane">
        <header className="pane-head">
          <h2>Tulis dalam bahasa Indonesia</h2>
          <span className="hint">Klausa aktif dipantau otomatis · Ctrl/Cmd+Enter menyimpan</span>
        </header>
        <textarea
          ref={areaRef}
          className="writer"
          value={text}
          placeholder="Contoh: selamat pagi, rapatnya diundur ke jam tiga."
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          spellCheck={false}
        />
        <div className="statusbar">
          <span>{clauseWords} kata di klausa aktif</span>
          <span className={coveragePct >= 85 ? 'good' : coveragePct > 0 ? 'warn' : ''}>({coveragePct}% dikenali kamus)</span>
          {assist.unknownTokens.length > 0 && <span className="warn">belum di kamus: {assist.unknownTokens.join(', ')}</span>}
        </div>
      </section>

      <section className="pane">
        <header className="pane-head">
          <h2>Terjemahan</h2>
          <span className="hint">{assist.suggestions.length} kandidat lokal</span>
        </header>

        {!assist.clause && <p className="empty">Mulai mengetik di kiri. Terjemahan muncul di sini tanpa perlu internet.</p>}

        <ul className="candidates">
          {assist.suggestions.map((s, i) => (
            <li key={s.text + i} className={chosen === s.text ? 'active' : ''}>
              <button type="button" className="candidate" onClick={() => setChosen(s.text)}>
                <span className="text">{s.text}</span>
                <span className="meta">
                  {s.kind} · {Math.round(s.coverage * 100)}%
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="actions">
          {TASKS.map((t) => (
            <button key={t.code} type="button" className="ghost" disabled={!assist.clause || ai?.busy} onClick={() => void runTask(t.code)}>
              {t.label}
            </button>
          ))}
          <button type="button" className="primary" disabled={!assist.clause || saving} onClick={() => void save()}>
            {saving ? 'Menyimpan…' : 'Simpan ke koleksi'}
          </button>
        </div>

        {ai?.busy && <p className="loading">Menunggu hasil…</p>}
        {ai?.error && <p className="error">{ai.error}</p>}
        {ai?.result && (
          <div className="result">
            <div className="result-head">
              <span>{ai.task}</span>
              <span className="badge">{ai.result.cacheHit ? 'dari cache' : ai.result.provider}</span>
            </div>
            <p className="result-text">{ai.result.text}</p>
            {ai.result.references && ai.result.references.length > 0 && (
              <ul className="refs">
                {ai.result.references.map((r) => (
                  <li key={r.url}>
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.title}
                    </a>
                    <span className="meta">
                      {r.authors.join(', ')}
                      {r.year ? ` · ${r.year}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {ai.task !== 'find_supporting_references' && (
              <button type="button" className="ghost" onClick={() => ai.result && setChosen(ai.result.text)}>
                Pakai sebagai terjemahan
              </button>
            )}
          </div>
        )}
        <RemoteHint clause={assist.clause} tokens={assist.unknownTokens} />
      </section>
    </div>
  );
}

function RemoteHint({ clause, tokens }: { clause: string; tokens: string[] }) {
  const { fill, pending } = useRemoteFill();
  const [out, setOut] = useState<string | null>(null);
  if (!clause || tokens.length === 0) return null;
  return (
    <p className="fill">
      <button type="button" className="ghost" disabled={pending} onClick={() => void fill(clause).then((r) => setOut(r?.text ?? null))}>
        {pending ? 'Memproses…' : 'Lengkapi dengan AI'}
      </button>
      {out && <span> {out}</span>}
    </p>
  );
}
