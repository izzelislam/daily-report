import { FormEvent, useEffect, useState } from 'react';
import { FiCheckCircle, FiSearch, FiUsers, FiXCircle } from 'react-icons/fi';
import { api, type SessionInfo } from '../api';
import { Alert, Empty, PageHeader } from '../ui';

interface Result {
  number: string;
  exists: boolean;
  jid: string;
}

export default function Contacts() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sid, setSid] = useState('');
  const [input, setInput] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<SessionInfo[]>('GET', '/api/sessions').then((l) => {
      const ok = l.filter((s) => s.status === 'connected');
      setSessions(ok);
      if (ok[0]) setSid(ok[0].sessionId);
    });
  }, []);

  const check = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const numbers = input.split(/[\s,;]+/).filter(Boolean);
      setResults(await api<Result[]>('POST', '/api/contacts/check', { sessionId: sid, numbers }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onWa = results.filter((r) => r.exists).length;

  return (
    <>
      <PageHeader icon={FiUsers} title="Contacts" subtitle="Check which numbers are registered on WhatsApp (max 100)" />
      <form onSubmit={check} className="card mb-6 max-w-2xl space-y-3 p-5">
        {sessions.length === 0 && <Alert kind="error">No connected session.</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        <select className="input" value={sid} onChange={(e) => setSid(e.target.value)} required>
          {sessions.map((s) => <option key={s.sessionId} value={s.sessionId}>{s.sessionId}</option>)}
        </select>
        <textarea className="input min-h-28" placeholder="08123456789, 628987654321 …" value={input} onChange={(e) => setInput(e.target.value)} required />
        <button className="btn btn-primary" disabled={loading || !sid}><FiSearch /> {loading ? 'Checking…' : 'Check numbers'}</button>
      </form>

      <div className="card max-w-2xl overflow-hidden">
        {results.length === 0 ? (
          <Empty icon={<FiUsers />} text="No results yet" hint="Paste numbers separated by space, comma or new line, then click Check numbers." />
        ) : (
          <>
            <div className="border-b border-slate-100 px-5 py-3 text-sm text-slate-500"><b className="text-emerald-600">{onWa}</b> of {results.length} on WhatsApp · {results.length - onWa} not found</div>
            <ul className="divide-y divide-slate-100">
              {results.map((r) => (
                <li key={r.number} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="font-medium">{r.number}</span>
                  {r.exists ? (
                    <span className="flex items-center gap-1.5 text-emerald-600"><FiCheckCircle /> On WhatsApp</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-slate-400"><FiXCircle /> Not found</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
