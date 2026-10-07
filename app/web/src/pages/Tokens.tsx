import { FormEvent, useCallback, useEffect, useState } from 'react';
import { FiCopy, FiKey, FiPlus, FiTrash2 } from 'react-icons/fi';
import { api, type TokenItem } from '../api';
import { Alert, Empty, fmtTime, PageHeader } from '../ui';

export default function Tokens() {
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<TokenItem[]>('GET', '/api/tokens').then(setTokens).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api('POST', '/api/tokens', { name: name.trim() || 'api-token' });
      setCreated(r.token);
      setName('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const revoke = async (t: TokenItem) => {
    if (!window.confirm(`Revoke token "${t.name}"?`)) return;
    try {
      await api('DELETE', `/api/tokens/${t.id}`);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader icon={FiKey} title="API Tokens" subtitle="Use as Authorization: Bearer <token> for the API and CLI" />

      <form onSubmit={create} className="card mb-6 flex flex-wrap items-center gap-3 p-4">
        <input className="input !w-auto min-w-0 flex-1" placeholder="Token name (e.g. n8n)" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
        <button className="btn btn-primary"><FiPlus /> Create token</button>
      </form>

      {error && <div className="mb-4"><Alert kind="error">{error}</Alert></div>}
      {created && (
        <div className="mb-6">
          <Alert kind="success">
            <div className="mb-1 font-medium">Copy this token now — it will not be shown again.</div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 font-mono text-xs">{created}</code>
              <button className="btn btn-ghost !px-2.5" onClick={() => navigator.clipboard?.writeText(created)}><FiCopy /></button>
            </div>
          </Alert>
        </div>
      )}

      <div className="card overflow-hidden">
        {tokens.length === 0 ? (
          <Empty icon={<FiKey />} text="No tokens yet" hint="Create a token to call the API from n8n, scripts or the CLI." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Token</th>
                <th className="hidden px-5 py-3 sm:table-cell">Created</th>
                <th className="hidden px-5 py-3 md:table-cell">Last used</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-3 font-medium">{t.name}</td>
                  <td className="px-5 py-3 text-slate-600">{t.username}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{t.prefix}…</td>
                  <td className="hidden px-5 py-3 text-slate-500 sm:table-cell">{fmtTime(t.created_at)}</td>
                  <td className="hidden px-5 py-3 text-slate-500 md:table-cell">{fmtTime(t.last_used_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button className="btn btn-danger !px-2.5" onClick={() => revoke(t)} title="Revoke"><FiTrash2 /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
