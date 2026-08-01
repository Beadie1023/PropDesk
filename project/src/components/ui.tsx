import type { ReactNode } from 'react';
import type { RiskStatus } from '@/types';

export function Panel({
  title,
  subtitle,
  icon,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-header">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-700/60 text-accent-400 shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100 truncate">
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-steel-400 truncate">{subtitle}</p>
              )}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusDot({ status, pulse = false }: { status: RiskStatus; pulse?: boolean }) {
  const colorMap: Record<RiskStatus, string> = {
    green: 'bg-bull-500',
    yellow: 'bg-warn-500',
    red: 'bg-bear-500',
  };
  const ringMap: Record<RiskStatus, string> = {
    green: 'ring-bull-500/30',
    yellow: 'ring-warn-500/40',
    red: 'ring-bear-500/50',
  };
  return (
    <span className="relative inline-flex">
      <span
        className={`h-2.5 w-2.5 rounded-full ring-4 ${colorMap[status]} ${ringMap[status]} ${
          pulse && status !== 'green' ? 'animate-pulseSoft' : ''
        }`}
      />
    </span>
  );
}

export function StatusBadge({ status }: { status: RiskStatus }) {
  const map: Record<RiskStatus, { label: string; cls: string }> = {
    green: { label: 'CLEAR', cls: 'bg-bull-500/15 text-bull-400 border-bull-500/30' },
    yellow: { label: 'CAUTION', cls: 'bg-warn-500/15 text-warn-400 border-warn-500/30' },
    red: { label: 'STOP', cls: 'bg-bear-500/15 text-bear-400 border-bear-500/30' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`chip border ${cls}`}>
      <StatusDot status={status} />
      {label}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm text-steel-400">{message}</p>
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex items-center gap-3 text-steel-400">
        <span className="h-5 w-5 rounded-full border-2 border-ink-600 border-t-accent-500 animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
