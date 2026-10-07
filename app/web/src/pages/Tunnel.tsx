import { useCallback, useEffect, useState } from 'react';
import { FiAlertTriangle, FiCheck, FiCopy, FiExternalLink, FiGlobe, FiPower } from 'react-icons/fi';
import { api } from '../api';
import { Alert, fmtTime, PageHeader } from '../ui';

interface TunnelStatus {
  installed: boolean;
  state: 'stopped' | 'starting' | 'running' | 'error';
  url: string | null;
  mode: 'quick' | 'named' | null;
  error: string | null;
  startedAt: number | null;
}

const badge: Record<TunnelStatus['state'], string> = {
  running: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  starting: 'bg-amber-50 text-amber-700 ring-amber-200',
  stopped: 'bg-slate-100 text-slate-600 ring-slate-200',
  error: 'bg-red-50 text-red-700 ring-red-200',
};

export default function Tunnel() {
  const [st, setSt] = useState<TunnelStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api<TunnelStatus>('GET', '/api/tunnel').then(setSt).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (path: '/api/tunnel/start' | '/api/tunnel/stop') => {
    setError('');
    setBusy(true);
    try {
      setSt(await api<TunnelStatus>('POST', path));
    } catch (e: any) {
      setError(e.message);
      load();
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!st?.url) return;
    await navigator.clipboard?.writeText(st.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const running = st?.state === 'running';
  const isQuickUrl = !!st?.url?.startsWith('http');

  return (
    <>
      <PageHeader icon={FiGlobe} title="Public Access" subtitle="Open this dashboard from anywhere through a Cloudflare Tunnel" />

      {error && <div className="mb-4"><Alert kind="error">{error}</Alert></div>}
      {st && !st.installed && (
        <div className="mb-4">
          <Alert kind="error">
            <code>cloudflared</code> is not installed on the server. Install it with <code>brew install cloudflared</code>, then refresh.
          </Alert>
        </div>
      )}

      <div className="card max-w-2xl space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${running ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              <FiGlobe size={22} />
            </span>
            <div>
              <h2 className="font-semibold">Cloudflare Tunnel</h2>
              <p className="text-sm text-slate-500">{st?.mode === 'named' ? 'Named tunnel (your domain)' : 'Quick tunnel (random trycloudflare.com URL)'}</p>
            </div>
          </div>
          {st && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badge[st.state]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {st.state}
            </span>
          )}
        </div>

        {st?.state === 'error' && st.error && <Alert kind="error">{st.error}</Alert>}

        {running && st?.url && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Public URL</label>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{st.url}</code>
              <button className="btn btn-ghost !px-2.5" onClick={copy} title="Copy">{copied ? <FiCheck /> : <FiCopy />}</button>
              {isQuickUrl && (
                <a className="btn btn-ghost !px-2.5" href={st.url} target="_blank" rel="noreferrer" title="Open"><FiExternalLink /></a>
              )}
            </div>
            <p className="text-xs text-slate-400">Started {fmtTime(st.startedAt)}. Give it ~10 seconds after starting before opening the link.</p>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <FiAlertTriangle className="mt-0.5 shrink-0" />
          <p>Anyone who knows the URL can reach the login page. Use a strong password, and keep the tunnel off when you don't need it. The URL changes each time you start a quick tunnel.</p>
        </div>

        {running || st?.state === 'starting' ? (
          <button className="btn btn-danger" disabled={busy} onClick={() => act('/api/tunnel/stop')}>
            <FiPower /> Stop tunnel
          </button>
        ) : (
          <button className="btn btn-primary" disabled={busy || !st?.installed} onClick={() => act('/api/tunnel/start')}>
            <FiPower /> {busy ? 'Starting…' : 'Start tunnel'}
          </button>
        )}
      </div>
    </>
  );
}
