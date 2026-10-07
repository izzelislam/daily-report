import type { ComponentType, ReactNode } from 'react';
import type { SessionInfo } from './api';

const colors: Record<SessionInfo['status'], string> = {
  connected: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  connecting: 'bg-amber-50 text-amber-700 ring-amber-200',
  qr: 'bg-sky-50 text-sky-700 ring-sky-200',
  disconnected: 'bg-slate-100 text-slate-600 ring-slate-200',
  error: 'bg-red-50 text-red-700 ring-red-200',
};

export function StatusBadge({ status }: { status: SessionInfo['status'] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${colors[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

type Icon = ComponentType<{ size?: number }>;

export function PageHeader({ title, subtitle, action, icon: Icon }: { title: string; subtitle?: string; action?: ReactNode; icon?: Icon }) {
  return (
    <div className="page mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <Icon size={22} />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Empty({ icon, text, hint, action }: { icon: ReactNode; text: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400">{icon}</div>
      <p className="text-sm font-medium text-slate-600">{text}</p>
      {hint && <p className="max-w-xs text-xs text-slate-400">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function SectionCard({ title, description, icon: Icon, action, children, className = '' }: { title: string; description?: string; icon?: Icon; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      <div className="card-header">
        <div className="flex items-center gap-3">
          {Icon && <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Icon size={16} /></span>}
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {description && <p className="text-xs text-slate-500">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: Icon }[] }) {
  return (
    <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 font-medium transition ${value === o.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {o.icon && <o.icon size={14} />} {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tip({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs leading-relaxed text-sky-800">{children}</div>;
}

export function Alert({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  const cls = kind === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export const fmtTime = (ts?: number | null) => (ts ? new Date(ts).toLocaleString() : '-');
