import type { ReactNode } from 'react';

type ChartCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  height?: number;
};

export function ChartCard({ title, subtitle, children, height = 280 }: ChartCardProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        {subtitle ? <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      <div style={{ height }}>{children}</div>
    </section>
  );
}
