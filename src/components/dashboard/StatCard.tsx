import React, { ReactNode } from 'react';

interface StatCardProps {
  id?: string;
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  variant?: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate';
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  id,
  title,
  value,
  subtitle,
  icon,
  variant = 'slate',
  onClick,
}) => {
  const variantStyles = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    rose: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
    slate: 'bg-slate-800/80 border-slate-700/60 text-slate-300',
  };

  const iconBgStyles = {
    emerald: 'bg-emerald-500/20 text-emerald-400',
    blue: 'bg-blue-500/20 text-blue-400',
    amber: 'bg-amber-500/20 text-amber-400',
    rose: 'bg-rose-500/20 text-rose-400',
    slate: 'bg-slate-700/50 text-slate-300',
  };

  return (
    <div
      id={id}
      onClick={onClick}
      className={`rounded-2xl border p-4 shadow-sm backdrop-blur-xs transition ${
        variantStyles[variant]
      } ${onClick ? 'cursor-pointer hover:border-slate-500 active:scale-98' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBgStyles[variant]}`}>
          {icon}
        </div>
      </div>
      <div className="mt-2">
        <span className="text-2xl font-black tracking-tight text-white">{value}</span>
      </div>
      {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
    </div>
  );
};
