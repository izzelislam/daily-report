import { FormEvent, useCallback, useEffect, useState } from 'react';
import { FiPlus, FiSquare, FiLogOut, FiTrash2, FiSmartphone, FiPlay, FiSend } from 'react-icons/fi';
import { MdQrCode2 as FiQrCode } from 'react-icons/md';
import { FaWhatsapp } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { api, subscribe, type SessionInfo } from '../api';
import { Alert, Empty, fmtTime, PageHeader, StatusBadge } from '../ui';

function QRModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await api('GET', `/api/sessions/${id}/qr`);
        if (!alive) return;
        setStatus(r.status);
        setQr(r.qr?.qrBase64 || null);
        if (r.status === 'connected') setTimeout(onClose, 1200);
      } catch {
        /* ignore */
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Scan QR · {id}</h3>
        <p className="mb-4 text-sm text-slate-500">WhatsApp → Linked devices → Link a device</p>
        <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-lg border border-slate-200 bg-white">
          {status === 'connected' ? (
            <span className="font-medium text-emerald-600">Connected ✓</span>
          ) : qr ? (
            <img src={qr} alt="QR code" className="h-full w-full" />
          ) : (
            <span className="text-sm text-slate-400">Waiting for QR…</span>
          )}
        </div>
        <button className="btn btn-ghost mt-5 w-full" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

const accent: Record<SessionInfo['status'], string> = {
  connected: 'bg-emerald-500',
  connecting: 'bg-amber-400',
  qr: 'bg-sky-500',
  disconnected: 'bg-slate-300',
  error: 'bg-red-500',
};

function SessionCard({
  s,
  onQR,
  run,
}: {
  s: SessionInfo;
  onQR: () => void;
  run: (fn: () => Promise<unknown>, confirm?: string) => void;
}) {
  const connected = s.status === 'connected';
  const id = encodeURIComponent(s.sessionId);
  return (
    <div className="card group relative flex flex-col overflow-hidden transition hover:shadow-md">
      <div className={`h-1 ${accent[s.status]}`} />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${connected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            <FaWhatsapp size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{s.sessionId}</h3>
            <p className="truncate text-sm text-slate-500">{s.phoneNumber ? `+${s.phoneNumber}` : 'Not linked yet'}</p>
          </div>
          <StatusBadge status={s.status} />
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs">
          <div>
            <dt className="text-slate-400">Name</dt>
            <dd className="truncate font-medium text-slate-700">{s.userName || '-'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Last activity</dt>
            <dd className="truncate font-medium text-slate-700">{s.lastSeenAt ? fmtTime(new Date(s.lastSeenAt).getTime()) : '-'}</dd>
          </div>
        </dl>

        {s.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{s.error}</p>}

        <div className="mt-auto flex flex-wrap gap-2">
          {connected ? (
            <Link to={`/send?session=${id}`} className="btn btn-primary flex-1"><FiSend /> Send</Link>
          ) : s.status === 'disconnected' || s.status === 'error' ? (
            <button className="btn btn-primary flex-1" onClick={() => run(() => api('POST', '/api/sessions', { id: s.sessionId }))}><FiPlay /> Start</button>
          ) : null}
          {!connected && <button className="btn btn-ghost flex-1" onClick={onQR}><FiQrCode /> QR</button>}
          <button className="btn btn-ghost !px-2.5" title="Stop" onClick={() => run(() => api('POST', `/api/sessions/${id}/stop`))}><FiSquare /></button>
          <button className="btn btn-ghost !px-2.5" title="Logout" onClick={() => run(() => api('POST', `/api/sessions/${id}/logout`), `Logout ${s.sessionId}?`)}><FiLogOut /></button>
          <button className="btn btn-danger !px-2.5" title="Delete" onClick={() => run(() => api('DELETE', `/api/sessions/${id}`), `Delete ${s.sessionId} and its data?`)}><FiTrash2 /></button>
        </div>
      </div>
    </div>
  );
}

export default function Sessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [newId, setNewId] = useState('');
  const [error, setError] = useState('');
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<SessionInfo[]>('GET', '/api/sessions').then(setSessions).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    return subscribe((e) => {
      if (e.type === 'session' || e.type === 'qr') load();
    });
  }, [load]);

  const run = async (fn: () => Promise<unknown>, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setError('');
    try {
      await fn();
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const id = newId.trim();
    await run(async () => {
      await api('POST', '/api/sessions', { id });
      setQrFor(id);
      setNewId('');
    });
    setBusy(false);
  };

  return (
    <>
      <PageHeader icon={FiSmartphone} title="Sessions" subtitle={`${sessions.length} session · ${sessions.filter((s) => s.status === 'connected').length} connected — each session is one linked WhatsApp number`} />

      <form onSubmit={add} className="card mb-6 flex flex-wrap items-center gap-3 p-4">
        <input
          className="input !w-auto min-w-0 flex-1"
          placeholder="Session id (e.g. sales-1)"
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          pattern="[a-zA-Z0-9_\-]{1,64}"
          title="Letters, numbers, _ and -"
          required
        />
        <button className="btn btn-primary" disabled={busy}><FiPlus /> New session</button>
      </form>

      {error && <div className="mb-4"><Alert kind="error">{error}</Alert></div>}

      {sessions.length === 0 ? (
        <div className="card"><Empty icon={<FiSmartphone />} text="No sessions yet" hint="Type a session id above (e.g. sales-1), click New session, then scan the QR code from WhatsApp → Linked devices." /></div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sessions.map((s) => (
            <SessionCard key={s.sessionId} s={s} onQR={() => setQrFor(s.sessionId)} run={run} />
          ))}
        </div>
      )}

      {qrFor && <QRModal id={qrFor} onClose={() => { setQrFor(null); load(); }} />}
    </>
  );
}
