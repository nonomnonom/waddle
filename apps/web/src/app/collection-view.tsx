import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api.js';

interface Fragment {
  id: string;
  sourceText: string;
  sourceLang: string;
  collectedAt: number;
  tzOffsetMinutes: number;
  translation?: { targetLang: string; provider: string; text: string } | null;
}

interface Page {
  items: Fragment[];
  nextCursor: string | null;
  daysWithData: string[];
}

const DAY_MS = 86_400_000;
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Tanggal tampilan memakai offset user saat item disimpan, bukan offset browser sekarang. */
function localDay(f: Fragment): string {
  const d = new Date(f.collectedAt + (f.tzOffsetMinutes ?? 0) * 60_000);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const today = new Date();
  const diff = Math.round((Number(new Date(today.toISOString().slice(0, 10) + 'T12:00:00')) - Number(d)) / DAY_MS);
  if (diff === 0) return 'Hari ini';
  if (diff === 1) return 'Kemarin';
  return `${DAYS[d.getDay()]}, ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}`;
}

export function CollectionView({ signedIn, notify }: { signedIn: boolean; notify: (m: string) => void }) {
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!signedIn) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      q.set('limit', '100');
      setPage(await api<Page>(`/v1/contents?${q.toString()}`));
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Gagal memuat koleksi.');
    } finally {
      setLoading(false);
    }
  }, [signedIn, from, to, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const items = (page?.items ?? []).filter((i) => !removed.has(i.id));
    const map = new Map<string, Fragment[]>();
    for (const item of items) {
      const key = localDay(item);
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [page, removed]);

  async function remove(id: string) {
    try {
      await api(`/v1/contents/${id}`, { method: 'DELETE' });
      setRemoved((prev) => new Set(prev).add(id));
      notify('Terhapus. Bersih dalam 30 hari.');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Gagal menghapus.');
    }
  }

  if (!signedIn) return <p className="empty">Masuk untuk melihat koleksi kamu.</p>;

  return (
    <div className="collection">
      <header className="filters">
        <label>
          Dari
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Sampai
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="ghost" onClick={() => void load()}>
          Segarkan
        </button>
        <span className="count">{page ? `${page.items.length} tersimpan` : 'memuat…'}</span>
      </header>

      {loading && <p className="loading">Memuat…</p>}
      {!loading && groups.length === 0 && (
        <p className="empty">Belum ada yang disimpan. Koleksi muncul per tanggal sesuai waktu kamu mengetik.</p>
      )}

      {groups.map(([day, items]) => (
        <section key={day} className="day">
          <h3>
            {dayLabel(day)} <span className="meta">{items.length} item</span>
          </h3>
          <ul>
            {items.map((f) => (
              <li key={f.id}>
                <div className="row">
                  <div>
                    <p className="id-text">{f.sourceText}</p>
                    <p className="en-text">
                      {f.translation?.text ?? <span className="meta">terjemahan menyusul</span>}
                      {f.translation && <span className="badge">{f.translation.provider}</span>}
                    </p>
                  </div>
                  <button type="button" className="ghost danger" onClick={() => void remove(f.id)}>
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
