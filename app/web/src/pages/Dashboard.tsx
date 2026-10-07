import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiSmartphone, FiCheckCircle, FiMessageCircle, FiArrowUpRight, FiSend, FiFileText, FiZap, FiGrid, FiCheck, FiInbox, FiTrendingUp } from 'react-icons/fi';
import { api, subscribe, type LogMessage, type SessionInfo, type Stats } from '../api';
import { Empty, fmtTime, PageHeader, SectionCard, StatusBadge } from '../ui';

const greeting = () => {
  const h = new Date().getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
};

export default function Dashboard() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(() => {
    api<SessionInfo[]>('GET', '/api/sessions').then(setSessions).catch(() => {});
    api<LogMessage[]>('GET', '/api/messages?limit=8').then(setMessages).catch(() => {});
    api<Stats>('GET', '/api/stats').then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    return subscribe(() => load());
  }, [load]);

  const connected = sessions.filter((s) => s.status === 'connected').length;
  const healthy = sessions.length > 0 && connected === sessions.length;
  const cards = [
    { label: 'Sessions', value: sessions.length, hint: `${connected} online`, icon: FiSmartphone, tone: 'bg-sky-50 text-sky-600' },
    { label: 'Connected', value: connected, hint: sessions.length ? `${sessions.length - connected} offline` : 'none linked', icon: FiCheckCircle, tone: 'bg-emerald-50 text-emerald-600' },
    { label: 'Messages today', value: stats?.today ?? 0, hint: 'in & out', icon: FiTrendingUp, tone: 'bg-violet-50 text-violet-600' },
    { label: 'Messages total', value: stats?.total ?? 0, hint: 'last 30 days', icon: FiMessageCircle, tone: 'bg-amber-50 text-amber-600' },
  ];

  const quick = [
    { to: '/send', label: 'Send message', desc: 'Text or media', icon: FiSend },
    { to: '/daily-report', label: 'Daily report', desc: 'Build & send today', icon: FiFileText },
    { to: '/sessions', label: 'Sessions', desc: 'Link a device', icon: FiSmartphone },
    { to: '/webhooks', label: 'Webhooks', desc: 'Forward events', icon: FiZap },
  ];

  const steps = [
    { done: sessions.length > 0, label: 'Create a session', to: '/sessions' },
    { done: connected > 0, label: 'Scan the QR code to link WhatsApp', to: '/sessions' },
    { done: (stats?.total ?? 0) > 0, label: 'Send or receive your first message', to: '/send' },
  ];
  const onboarding = steps.some((s) => !s.done);

  return (
    <div className="page">
      <PageHeader
        icon={FiGrid}
        title="Dashboard"
        subtitle={`${greeting()}! Ringkasan sesi WhatsApp dan aktivitas pesan kamu.`}
        action={
          sessions.length > 0 && (
            <span className={`chip !px-3 !py-1 ${healthy ? '!bg-emerald-50 !text-emerald-700' : '!bg-amber-50 !text-amber-700'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${healthy ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {healthy ? 'All sessions online' : `${sessions.length - connected} session offline`}
            </span>
          )
        }
      />

      {onboarding && (
        <section className="card mb-6 border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-5">
          <h2 className="font-semibold">Getting started</h2>
          <p className="mb-3 text-sm text-slate-500">Ikuti langkah berikut untuk mulai memakai Daily Report.</p>
          <ol className="grid gap-2 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link to={s.to} className={`flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 text-sm transition hover:shadow-sm ${s.done ? 'border-emerald-200 text-slate-400 line-through' : 'border-slate-200'}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${s.done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {s.done ? <FiCheck size={14} /> : i + 1}
                  </span>
                  {s.label}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, hint, icon: Icon, tone }) => (
          <div key={label} className="card flex items-center gap-4 p-5 transition hover:shadow-md">
            <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}><Icon size={22} /></span>
            <div>
              <div className="text-2xl font-semibold leading-none">{value.toLocaleString()}</div>
              <div className="mt-1 text-sm text-slate-600">{label}</div>
              <div className="text-xs text-slate-400">{hint}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quick.map(({ to, label, desc, icon: Icon }) => (
          <Link key={to} to={to} className="card group flex items-center gap-3 px-4 py-3 transition hover:border-emerald-300 hover:shadow-md">
            <Icon className="text-emerald-600" size={18} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-slate-400">{desc}</div>
            </div>
            <FiArrowUpRight className="text-slate-300 transition group-hover:text-emerald-600" />
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Sessions"
          description="Linked WhatsApp numbers"
          icon={FiSmartphone}
          action={<Link to="/sessions" className="flex items-center gap-1 text-sm text-emerald-600 hover:underline">Manage <FiArrowUpRight /></Link>}
        >
          {sessions.length === 0 ? (
            <Empty
              icon={<FiSmartphone />}
              text="No sessions yet"
              hint="Create a session and scan the QR code to link your WhatsApp."
              action={<Link to="/sessions" className="btn btn-primary">Create session</Link>}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <li key={s.sessionId} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.sessionId}</div>
                    <div className="text-xs text-slate-500">{s.phoneNumber ? `+${s.phoneNumber}` : 'not linked'}{s.userName ? ` · ${s.userName}` : ''}</div>
                  </div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Latest messages"
          description="Live activity"
          icon={FiInbox}
          action={<Link to="/messages" className="flex items-center gap-1 text-sm text-emerald-600 hover:underline">View all <FiArrowUpRight /></Link>}
        >
          {messages.length === 0 ? (
            <Empty icon={<FiMessageCircle />} text="No messages yet" hint="Incoming and outgoing messages will appear here in real time." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {messages.map((m, i) => (
                <li key={m.id + i} className="flex gap-3 px-5 py-3">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${m.direction === 'in' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {m.direction === 'in' ? 'IN' : 'OUT'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2 text-xs text-slate-500">
                      <span className="truncate"><b className="text-slate-700">{m.peer?.split('@')[0] || '-'}</b> · {m.sessionId}</span>
                      <span className="shrink-0">{fmtTime(m.timestamp)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm">{m.body || `[${m.type}]`}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
