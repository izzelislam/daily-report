import { useCallback, useEffect, useState } from 'react';
import { FiArrowDownLeft, FiArrowUpRight, FiMessageSquare, FiSearch, FiX } from 'react-icons/fi';
import { api, subscribe, type LogMessage, type SessionInfo } from '../api';
import { Empty, fmtTime, PageHeader } from '../ui';

const PAGE = 50;

function DetailDrawer({ msg, onClose }: { msg: LogMessage; onClose: () => void }) {
  const [thread, setThread] = useState<LogMessage[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!msg.peer) return setThread([]);
    const p = new URLSearchParams({ sessionId: msg.sessionId, peer: msg.peer, limit: '100' });
    const load = () =>
      api<LogMessage[]>('GET', `/api/messages?${p}`)
        .then((rows) => setThread([...rows].reverse()))
        .catch(() => {});
    load();
    return subscribe((e) => e.type === 'message' && load());
  }, [msg.sessionId, msg.peer]);

  const rows: [string, string][] = [
    ['Direction', msg.direction === 'in' ? 'Incoming' : 'Outgoing'],
    ['Contact', msg.peer || '-'],
    ['Session', msg.sessionId],
    ['Type', msg.type || '-'],
    ['Time', fmtTime(msg.timestamp)],
    ['Message ID', msg.id],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">Message detail</h2>
          <button className="btn btn-ghost !px-2.5" onClick={onClose} aria-label="Close"><FiX /></button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <div className={`rounded-xl p-4 text-sm ${msg.direction === 'in' ? 'bg-sky-50' : 'bg-emerald-50'}`}>
            <p className="whitespace-pre-wrap break-words">{msg.body || `[${msg.type}]`}</p>
          </div>

          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="min-w-0 break-all text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-600">Conversation ({thread.length})</h3>
            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              {thread.map((t) => (
                <div key={t.cursor ?? t.id} className={`flex ${t.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${t.direction === 'out' ? 'bg-emerald-600 text-white' : 'bg-white shadow-sm'} ${t.cursor === msg.cursor ? 'ring-2 ring-amber-400' : ''}`}
                  >
                    <p className="whitespace-pre-wrap break-words">{t.body || `[${t.type}]`}</p>
                    <p className={`mt-1 text-[10px] ${t.direction === 'out' ? 'text-emerald-100' : 'text-slate-400'}`}>{fmtTime(t.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

export default function Messages() {
  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState(''); // debounced
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<LogMessage | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    api<SessionInfo[]>('GET', '/api/sessions').then(setSessions).catch(() => {});
  }, []);

  const params = useCallback(
    (before?: number) => {
      const p = new URLSearchParams({ limit: String(PAGE) });
      if (sessionId) p.set('sessionId', sessionId);
      if (query) p.set('q', query);
      if (before) p.set('before', String(before));
      return p.toString();
    },
    [sessionId, query]
  );

  const load = useCallback(() => {
    api<LogMessage[]>('GET', `/api/messages?${params()}`)
      .then((rows) => {
        setMessages(rows);
        setHasMore(rows.length === PAGE);
      })
      .catch(() => {});
  }, [params]);

  const loadMore = async () => {
    const last = messages[messages.length - 1];
    if (!last?.cursor) return;
    const rows = await api<LogMessage[]>('GET', `/api/messages?${params(last.cursor)}`);
    setMessages((m) => [...m, ...rows]);
    setHasMore(rows.length === PAGE);
  };

  useEffect(() => {
    load();
    return subscribe((e) => e.type === 'message' && load());
  }, [load]);

  return (
    <>
      <PageHeader icon={FiMessageSquare} title="Messages" subtitle="Stored in SQLite (last 30 days) · live updates" />

      <div className="card mb-4 flex flex-wrap gap-3 p-4">
        <label className="relative min-w-48 flex-1">
          <FiSearch className="absolute left-3 top-3 text-slate-400" />
          <input className="input !pl-9" placeholder="Search message text…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input !w-auto" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">All sessions</option>
          {sessions.map((s) => <option key={s.sessionId} value={s.sessionId}>{s.sessionId}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {messages.length === 0 ? (
          <Empty icon={<FiMessageSquare />} text="No messages found" hint={query || sessionId ? 'Try a different keyword or session filter.' : 'Messages sent or received by your sessions show up here.'} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {messages.map((m) => (
              <li key={m.cursor ?? m.id}>
                <button onClick={() => setSelected(m)} className="flex w-full gap-3 px-5 py-3 text-left transition hover:bg-slate-50">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.direction === 'in' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {m.direction === 'in' ? <FiArrowDownLeft /> : <FiArrowUpRight />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap justify-between gap-x-3 text-xs text-slate-500">
                      <span><b className="text-slate-700">{m.peer?.split('@')[0] || '-'}</b> · {m.sessionId}</span>
                      <span>{fmtTime(m.timestamp)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-sm">{m.body || `[${m.type}]`}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button className="btn btn-ghost" onClick={loadMore}>Load more</button>
          </div>
        )}
      </div>
      {selected && <DetailDrawer msg={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
