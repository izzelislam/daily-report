import { FormEvent, useCallback, useEffect, useState } from 'react';
import { FiCopy, FiLink, FiLogOut, FiPlus, FiUserMinus, FiUserPlus, FiUsers, FiX, FiStar } from 'react-icons/fi';
import { api, type GroupItem, type SessionInfo } from '../api';
import { Alert, Empty, PageHeader } from '../ui';

interface GroupDetail {
  id: string;
  subject: string;
  desc?: string;
  participants: { id: string; admin: string | null }[];
}

const numbersOf = (s: string) => s.split(/[\s,;]+/).filter(Boolean);

export default function Groups() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sid, setSid] = useState('');
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [subject, setSubject] = useState('');
  const [members, setMembers] = useState('');
  const [addNums, setAddNums] = useState('');

  useEffect(() => {
    api<SessionInfo[]>('GET', '/api/sessions').then((l) => {
      const ok = l.filter((s) => s.status === 'connected');
      setSessions(ok);
      if (ok[0]) setSid(ok[0].sessionId);
    });
  }, []);

  const guard = async (fn: () => Promise<void>) => {
    setError('');
    setInfo('');
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const base = `/api/sessions/${sid}/groups`;
  const loadGroups = useCallback(
    () => sid && guard(async () => setGroups(await api<GroupItem[]>('GET', base))),
    [sid] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    setDetail(null);
    setGroups([]);
    loadGroups();
  }, [loadGroups]);

  const open = (id: string) => guard(async () => setDetail(await api('GET', `${base}/${encodeURIComponent(id)}`)));
  const gpath = (suffix: string) => `${base}/${encodeURIComponent(detail!.id)}${suffix}`;

  const create = (e: FormEvent) => {
    e.preventDefault();
    guard(async () => {
      await api('POST', base, { subject, participants: numbersOf(members) });
      setSubject('');
      setMembers('');
      await loadGroups();
    });
  };

  const participantAction = (action: string, participants: string[]) =>
    guard(async () => {
      await api('POST', gpath('/participants'), { action, participants });
      setAddNums('');
      setDetail(await api('GET', gpath('')));
    });

  return (
    <>
      <PageHeader
        icon={FiUsers}
        title="Groups"
        subtitle="Browse and manage WhatsApp groups"
        action={
          <select className="input !w-auto" value={sid} onChange={(e) => setSid(e.target.value)}>
            {sessions.map((s) => <option key={s.sessionId} value={s.sessionId}>{s.sessionId}</option>)}
          </select>
        }
      />
      {error && <div className="mb-4"><Alert kind="error">{error}</Alert></div>}
      {info && <div className="mb-4"><Alert kind="success">{info}</Alert></div>}

      {sessions.length === 0 ? (
        <div className="card"><Empty icon={<FiUsers />} text="No connected session" hint="Link a WhatsApp session first to browse its groups." /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-2">
            <form onSubmit={create} className="card space-y-3 p-4">
              <h2 className="font-semibold">New group</h2>
              <input className="input" placeholder="Group name" value={subject} onChange={(e) => setSubject(e.target.value)} required />
              <textarea className="input min-h-20" placeholder="Member numbers (comma / space separated)" value={members} onChange={(e) => setMembers(e.target.value)} required />
              <button className="btn btn-primary"><FiPlus /> Create</button>
            </form>

            <div className="card overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-3 font-semibold">Your groups ({groups.length})</div>
              {groups.length === 0 ? (
                <Empty icon={<FiUsers />} text="No groups" />
              ) : (
                <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
                  {groups.map((g) => (
                    <li key={g.id}>
                      <button onClick={() => open(g.id)} className={`flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50 ${detail?.id === g.id ? 'bg-emerald-50' : ''}`}>
                        <span className="min-w-0 truncate font-medium">{g.subject}</span>
                        <span className="ml-3 shrink-0 text-xs text-slate-500">{g.size} members</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="lg:col-span-3">
            {!detail ? (
              <div className="card"><Empty icon={<FiUsers />} text="Select a group" /></div>
            ) : (
              <div className="card">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{detail.subject}</h2>
                    <p className="break-all font-mono text-xs text-slate-400">{detail.id}</p>
                    {detail.desc && <p className="mt-2 text-sm text-slate-600">{detail.desc}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost" onClick={() => guard(async () => {
                      const r = await api('GET', gpath('/invite'));
                      await navigator.clipboard?.writeText(r.link);
                      setInfo(`Invite link copied: ${r.link}`);
                    })}><FiLink /> <FiCopy /></button>
                    <button className="btn btn-danger" onClick={() => window.confirm('Leave this group?') && guard(async () => {
                      await api('POST', gpath('/leave'));
                      setDetail(null);
                      await loadGroups();
                    })}><FiLogOut /> Leave</button>
                  </div>
                </div>

                <form
                  className="flex flex-wrap gap-3 border-b border-slate-100 p-4"
                  onSubmit={(e) => { e.preventDefault(); participantAction('add', numbersOf(addNums)); }}
                >
                  <input className="input !w-auto min-w-0 flex-1" placeholder="Add numbers…" value={addNums} onChange={(e) => setAddNums(e.target.value)} required />
                  <button className="btn btn-primary"><FiUserPlus /> Add</button>
                </form>

                <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                  {detail.participants.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <span className="flex items-center gap-2">
                        {p.id.split('@')[0]}
                        {p.admin && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700"><FiStar size={11} />{p.admin === 'superadmin' ? 'owner' : 'admin'}</span>}
                      </span>
                      <span className="flex gap-1">
                        {p.admin !== 'superadmin' && (
                          <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => participantAction(p.admin ? 'demote' : 'promote', [p.id])}>
                            {p.admin ? 'Demote' : 'Promote'}
                          </button>
                        )}
                        <button className="btn btn-danger !px-2 !py-1" title="Remove" onClick={() => window.confirm(`Remove ${p.id.split('@')[0]}?`) && participantAction('remove', [p.id])}>
                          <FiUserMinus /><span className="sr-only">Remove</span>
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
