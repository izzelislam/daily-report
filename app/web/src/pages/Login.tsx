import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaWhatsapp } from 'react-icons/fa';
import { FiLock, FiUser, FiKey } from 'react-icons/fi';
import { api, setToken } from '../api';
import { Alert } from '../ui';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'password' | 'token'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'password') {
        const r = await api('POST', '/api/auth/login', { username, password });
        setToken(r.token);
      } else {
        setToken(tokenInput.trim());
        await api('GET', '/api/auth/me'); // validates token
      }
      navigate('/');
    } catch (err: any) {
      localStorage.removeItem('dr_token');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-slate-100 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-7 shadow-xl">
        <div className="flex flex-col items-center gap-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <FaWhatsapp size={28} />
          </span>
          <h1 className="text-xl font-semibold">Daily Report</h1>
          <p className="text-sm text-slate-500">WhatsApp automation &amp; daily reporting</p>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {(['password', 'token'] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md py-1.5 font-medium capitalize transition ${mode === m ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            >
              {m === 'password' ? 'Username' : 'Access Token'}
            </button>
          ))}
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        {mode === 'password' ? (
          <>
            <label className="relative block">
              <FiUser className="absolute left-3 top-3 text-slate-400" />
              <input className="input !pl-9" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
            </label>
            <label className="relative block">
              <FiLock className="absolute left-3 top-3 text-slate-400" />
              <input className="input !pl-9" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </>
        ) : (
          <label className="relative block">
            <FiKey className="absolute left-3 top-3 text-slate-400" />
            <input className="input !pl-9 font-mono" placeholder="dr_xxxxxxxx…" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} required />
          </label>
        )}

        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-xs text-slate-400">
          First time? Run <code className="rounded bg-slate-100 px-1">dailyreport init</code> in your terminal.
        </p>
      </form>
    </div>
  );
}
