import { useEffect, useMemo, useState } from 'react';
import { BilingualAssist, PhraseBook, type Suggestion } from '@waddle/engine';

export interface AssistState {
  /** klausa aktif (yang sedang diketik) */
  clause: string;
  suggestions: Suggestion[];
  coverage: number;
  unknownTokens: string[];
}

/** Klausa aktif = potongan teks terakhir yang belum ditutup tanda baca kalimat. */
export function activeClause(text: string, caret: number): string {
  const upto = text.slice(0, caret);
  const parts = upto.split(/(?<=[.!?…])\s+/);
  return (parts.at(-1) ?? '').trim();
}

export function useAssist(text: string, caret: number, debounceMs = 120): AssistState {
  const assist = useMemo(() => new BilingualAssist(new PhraseBook()), []);
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), debounceMs);
    return () => clearTimeout(t);
  }, [text, debounceMs]);

  const clause = activeClause(debounced, Math.min(caret, debounced.length));
  const suggestions = clause ? assist.suggest(clause) : [];
  const gap = assist.needsRemote(clause);

  return {
    clause,
    suggestions,
    coverage: suggestions[0]?.coverage ?? 0,
    unknownTokens: gap.unknownTokens,
  };
}

/** Isi terjemahan dari lane remote, lalu gabungkan ke state lokal. */
export function useRemoteFill() {
  const [pending, setPending] = useState(false);
  const fill = async (clause: string): Promise<{ text: string; cacheHit: boolean } | null> => {
    setPending(true);
    try {
      const { api } = await import('./api.js');
      const r = await api<{ text: string; cacheHit: boolean }>('/v1/ai/tasks/translate_to_english', {
        method: 'POST',
        body: JSON.stringify({ text: clause, sourceLang: 'id', targetLang: 'en', stream: false }),
      });
      return r;
    } catch {
      return null;
    } finally {
      setPending(false);
    }
  };
  return { fill, pending };
}
