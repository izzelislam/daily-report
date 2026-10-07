import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { FiGrid, FiSmartphone, FiSend, FiMessageSquare, FiKey, FiLogOut, FiUsers, FiBookOpen, FiZap, FiGlobe, FiFileText, FiPlay, FiClock, FiSettings } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import type { IconType } from 'react-icons';
import { api, clearToken, getToken } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import SendMessage from './pages/SendMessage';
import Messages from './pages/Messages';
import Tokens from './pages/Tokens';
import Groups from './pages/Groups';
import Contacts from './pages/Contacts';
import Webhooks from './pages/Webhooks';
import Tunnel from './pages/Tunnel';
import DailyReport from './pages/DailyReport';

type NavItem = { to: string; label: string; icon: IconType; end?: boolean; admin?: boolean; children?: { to: string; label: string; icon: IconType }[] };
const nav: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: FiGrid, end: true },
    { to: '/daily-report', label: 'Daily Report', icon: FiFileText, admin: true, children: [
      { to: '/daily-report/run', label: 'Run', icon: FiPlay },
      { to: '/daily-report/recap', label: 'Recap', icon: FiClock },
      { to: '/daily-report/settings', label: 'Settings', icon: FiSettings },
    ] },
  ] },
  { group: 'WhatsApp', items: [
    { to: '/sessions', label: 'Sessions', icon: FiSmartphone },
    { to: '/send', label: 'Send Message', icon: FiSend },
    { to: '/messages', label: 'Messages', icon: FiMessageSquare },
    { to: '/groups', label: 'Groups', icon: FiUsers },
    { to: '/contacts', label: 'Contacts', icon: FiBookOpen },
  ] },
  { group: 'Integration', items: [
    { to: '/webhooks', label: 'Webhooks', icon: FiZap, admin: true },
    { to: '/tunnel', label: 'Public Access', icon: FiGlobe, admin: true },
    { to: '/tokens', label: 'API Tokens', icon: FiKey },
  ] },
];

function Layout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    api('GET', '/api/auth/me').then((r) => (setUsername(r.user.username), setRole(r.user.role))).catch(() => {});
  }, []);

  const groups = nav
    .map((g) => ({ ...g, items: g.items.filter((n) => !n.admin || role === 'admin') }))
    .filter((g) => g.items.length);
  const items = groups.flatMap((g) => g.items.flatMap((i) => (i.children ? i.children.map((c): NavItem => ({ ...c, label: `${i.label} · ${c.label}` })) : [i])));

  const logout = () => {
    clearToken();
    navigate('/login');
  };

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar: fixed to the viewport, scrolls on its own if nav is long */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-800 bg-slate-900 md:flex">
        <div className="flex shrink-0 items-center gap-2 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <FaWhatsapp size={20} />
          </span>
          <span className="text-lg font-semibold text-white">Daily Report</span>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.group}</div>
              <div className="space-y-0.5">
                {g.items.map(({ to, label, icon: Icon, end, children }) => (
                  <div key={to}>
                    <NavLink
                      to={children ? children[0].to : to}
                      end={end}
                      className={() => {
                        const isActive = end ? pathname === to : pathname === to || pathname.startsWith(to + '/');
                        return `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          isActive ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`;
                      }}
                    >
                      {(end ? pathname === to : pathname === to || pathname.startsWith(to + '/')) && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-emerald-400" />}
                      <Icon size={18} /> {label}
                    </NavLink>
                    {children && pathname.startsWith(to) && (
                      <div className="ml-5 mt-0.5 space-y-0.5 border-l border-slate-700 pl-3">
                        {children.map((c) => (
                          <NavLink
                            key={c.to}
                            to={c.to}
                            className={({ isActive }) =>
                              `flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition ${isActive ? 'font-medium text-emerald-400' : 'text-slate-400 hover:text-white'}`
                            }
                          >
                            <c.icon size={14} /> {c.label}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-slate-800 p-3">
          <div className="mb-2 flex items-center gap-2.5 px-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-semibold uppercase text-emerald-400">{username[0] || '?'}</span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium text-slate-100">{username || '…'}</div>
              <div className="text-xs capitalize text-slate-400">{role || 'user'}</div>
            </div>
          </div>
          <button onClick={logout} className="btn w-full border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700">
            <FiLogOut /> Logout
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col md:pl-60">
        {/* mobile top bar (sticky) */}
        <div className="sticky top-0 z-30 md:hidden">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <span className="flex items-center gap-2 font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white"><FaWhatsapp size={16} /></span>Daily Report</span>
            <button onClick={logout} className="btn btn-ghost !px-2.5" aria-label="Logout"><FiLogOut /></button>
          </header>
          <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'}`
                }
              >
                <Icon size={16} /> {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Protected() {
  const navigate = useNavigate();
  useEffect(() => {
    const h = () => navigate('/login');
    window.addEventListener('dr:unauthorized', h);
    return () => window.removeEventListener('dr:unauthorized', h);
  }, [navigate]);
  return getToken() ? <Layout /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="send" element={<SendMessage />} />
        <Route path="messages" element={<Messages />} />
        <Route path="groups" element={<Groups />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="tunnel" element={<Tunnel />} />
        <Route path="daily-report" element={<Navigate to="/daily-report/run" replace />} />
        <Route path="daily-report/:tab" element={<DailyReport />} />
        <Route path="tokens" element={<Tokens />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
