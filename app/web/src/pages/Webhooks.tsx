import { FormEvent, useCallback, useEffect, useState } from 'react';
import { FiPlay, FiPlus, FiTrash2, FiZap } from 'react-icons/fi';
import { api, type WebhookItem } from '../api';
import { Alert, Empty, fmtTime, PageHeader } from '../ui';

export default function Webhooks() {
  const [hooks, setHooks] = useState<WebhookItem[]>([]);
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [selected, setSelected] = useState<string[]>(['*']);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(() => {
    api<WebhookItem[]>('GET', '/api/webhooks').then(setHooks).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    api<string[]>('GET', '/api/webhooks/events').then(setEventNames).catch(() => {});
  }, [load]);

  const guard = async (fn: () => Promise<void>) => {
    setError('');
    setInfo('');
    try {
      await fn();
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleEvent = (ev: string) =>
    setSelected((cur) => {
      if (ev === '*') return ['*'];
      const next = cur.filter((e) => e !== '*');
      const out = next.includes(ev) ? next.filter((e) => e !== ev) : [...next, ev];
      return out.length ? out : ['*'];
    });

  const create = (e: FormEvent) => {
    e.preventDefault();
    guard(async () => {
      await api('POST', '/api/webhooks', { name, url, secret: secret || undefined, events: selected });
      setName('');
      setUrl('');
      setSecret('');
      setSelected(['*']);
    });
  };

  return (
    <>
      <PageHeader icon={FiZap} title="Webhooks" subtitle="POST events to your own endpoint (n8n, Zapier, custom…)" />
      {error && <div className="mb-4"><Alert kind="error">{error}</Alert></div>}
      {info && <div className="mb-4"><Alert kind="success">{info}</Alert></div>}

      <form onSubmit={create} className="card mb-6 space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={64} />
          <input className="input sm:col-span-2" type="url" placeholder="https://example.com/hook" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </div>
        <input className="input" placeholder="Secret (optional) — used for X-DailyReport-Signature HMAC-SHA256" value={secret} onChange={(e) => setSecret(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {['*', ...eventNames].map((ev) => (
            <button
              type="button"
              key={ev}
              onClick={() => toggleEvent(ev)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${selected.includes(ev) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
              {ev === '*' ? 'all events' : ev}
            </button>
          ))}
        </div>
        <button className="btn btn-primary"><FiPlus /> Add webhook</button>
      </form>

      <div className="card overflow-hidden">
        {hooks.length === 0 ? (
          <Empty icon={<FiZap />} text="No webhooks yet" hint="Add an endpoint above to receive message and session events as JSON POST requests." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {hooks.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {h.name}
                    {!h.enabled && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">disabled</span>}
                    {h.hasSecret && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-600">signed</span>}
                  </div>
                  <div className="truncate text-xs text-slate-500">{h.url}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {h.events === '*' ? 'all events' : h.events} · last: {h.last_status || '-'} {h.last_at ? `(${fmtTime(h.last_at)})` : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={() => guard(async () => {
                    const r = await api('POST', `/api/webhooks/${h.id}/test`);
                    setInfo(`Test "${h.name}" → ${r.status}`);
                  })}><FiPlay /> Test</button>
                  <button className="btn btn-ghost" onClick={() => guard(async () => { await api('PATCH', `/api/webhooks/${h.id}`, { enabled: !h.enabled }); })}>
                    {h.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button className="btn btn-danger !px-2.5" title="Delete" onClick={() => window.confirm(`Delete "${h.name}"?`) && guard(async () => { await api('DELETE', `/api/webhooks/${h.id}`); })}>
                    <FiTrash2 />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
