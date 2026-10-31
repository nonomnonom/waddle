import { useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { signIn, signOut, signUp } from '../lib/auth.js';

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

export function AccountView({
  user,
  profile,
  onSession,
  notify,
}: {
  user: { id: string; email?: string | null; name?: string | null } | null;
  profile: Profile | null;
  onSession: () => Promise<void>;
  notify: (m: string) => void;
}) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = mode === 'up' ? await signUp({ name: name || email.split('@')[0], email, password }) : await signIn({ email, password });
    setBusy(false);
    if (!r.ok) {
      notify(r.message ?? 'Gagal.');
      return;
    }
    await onSession();
    notify(mode === 'up' ? 'Akun dibuat.' : 'Masuk berhasil.');
  }

  if (!user) {
    return (
      <form className="auth" onSubmit={submit}>
        <h2>{mode === 'up' ? 'Buat akun' : 'Masuk'}</h2>
        <p className="hint">Email dan password cukup untuk versi awal. Login Apple kami tambahkan saat jalur web-nya teruji.</p>
        {mode === 'up' && (
          <label>
            Nama
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Menunggu…' : mode === 'up' ? 'Buat akun' : 'Masuk'}
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>
          {mode === 'up' ? 'Sudah punya akun?' : 'Belum punya akun?'}
        </button>
      </form>
    );
  }

  return (
    <div className="auth">
      <h2>Akun</h2>
      <dl className="kv">
        <dt>Email</dt>
        <dd>{user.email ?? '—'}</dd>
        <dt>Paket</dt>
        <dd>{profile?.plan ?? 'free'}</dd>
        <dt>Tersimpan</dt>
        <dd>{profile?.collected ?? 0} klausa</dd>
        <dt>Permintaan AI hari ini</dt>
        <dd>{profile?.aiRequestsToday ?? 0}</dd>
      </dl>

      <h3>Perangkat</h3>
      <ul className="devices">
        {(profile?.devices ?? []).map((d) => (
          <li key={d.digest}>
            <span>{d.platform}</span>
            <span className="meta">{d.appVersion}</span>
            {d.isCurrent && <span className="badge">perangkat ini</span>}
          </li>
        ))}
        {!profile?.devices?.length && <li className="meta">Belum ada perangkat tercatat.</li>}
      </ul>

      <div className="actions">
        <button
          type="button"
          className="ghost"
          onClick={() => {
            void api('/v1/ping').then((r) => notify(`Server: ${JSON.stringify(r)}`));
          }}
        >
          Uji koneksi
        </button>
        <button
          type="button"
          className="ghost danger"
          onClick={async () => {
            if (!window.confirm('Hapus akun? Semua koleksi dihapus permanen dalam 30 hari.')) return;
            try {
              await api('/v1/account', { method: 'DELETE' });
              await signOut();
              await onSession();
              notify('Penghapusan dimulai.');
            } catch (err) {
              notify(err instanceof ApiError ? err.message : 'Gagal menghapus akun.');
            }
          }}
        >
          Hapus akun
        </button>
        <button
          type="button"
          className="primary"
          onClick={async () => {
            await signOut();
            await onSession();
            notify('Keluar.');
          }}
        >
          Keluar
        </button>
      </div>
    </div>
  );
}
