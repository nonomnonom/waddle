import { useCallback, useEffect, useState } from 'react';
import '../styles.css';
import { api, API_URL, registerDevice } from '../lib/api.js';
import { refreshSession, type SessionUser } from '../lib/auth.js';
import { TypingView } from './typing-view.js';
import { CollectionView } from './collection-view.js';
import { AccountView } from './account-view.js';

type Tab = 'tulis' | 'koleksi' | 'akun';

interface Profile {
  userId: string;
  displayName: string | null;
  email: string | null;
  locale: string;
  plan: string;
  collected: number;
  aiRequestsToday: number;
  devices: { digest: string; platform: string; appVersion: string; lastSeenAt: number; isCurrent: boolean }[];
}

const APP_VERSION = '0.1.0';

export function App() {
  const [tab, setTab] = useState<Tab>('tulis');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [server, setServer] = useState<'unknown' | 'up' | 'down'>('unknown');
  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 4000);
  }, []);

  const syncSession = useCallback(async () => {
    const s = await refreshSession();
    setUser(s.user);
    if (!s.user) {
      setProfile(null);
      return;
    }
    try {
      await registerDevice(APP_VERSION);
      setProfile(await api<Profile>('/v1/profile'));
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    void syncSession();
    api<{ serverTime: number }>('/v1/ping')
      .then(() => setServer('up'))
      .catch(() => setServer('down'));
  }, [syncSession]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark">w</span>
          <div>
            <strong>waddle</strong>
            <span className="tagline">belajar Inggris sambil mengetik</span>
          </div>
        </div>
        <nav className="tabs" aria-label="Bagian utama">
          {(
            [
              ['tulis', 'Tulis'],
              ['koleksi', 'Koleksi'],
              ['akun', 'Akun'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="session">
          <span className={`dot ${server}`} title={`API ${API_URL}`} />
          {user ? (user.email ?? 'terhubung') : 'belum masuk'}
        </div>
      </header>

      <main>
        {tab === 'tulis' && (
          <TypingView
            signedIn={Boolean(user)}
            onSaved={(r) => notify(r.ok ? 'Tersimpan di koleksi.' : (r.message ?? 'Gagal menyimpan.'))}
          />
        )}
        {tab === 'koleksi' && <CollectionView signedIn={Boolean(user)} notify={notify} />}
        {tab === 'akun' && <AccountView user={user} profile={profile} onSession={syncSession} notify={notify} />}
      </main>

      {server === 'down' && (
        <p className="banner">
          API belum terjangkau di <code>{API_URL}</code>. Jalankan <code>pnpm nx serve api</code> dan siapkan Postgres.
        </p>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
