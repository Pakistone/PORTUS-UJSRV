import React, { useState } from 'react';
import {
  Calendar,
  ChevronDown,
  TrendingUp,
  Banknote,
  Users,
  PieChart as PieIcon,
  BarChart3,
} from 'lucide-react';
import { formatFCFA } from '../../utils/normalization';

export type PeriodType = 'today' | 'week' | 'month' | 'custom';

export interface PeriodFilterState {
  type: PeriodType;
  startDate?: string;
  endDate?: string;
}

interface PeriodSelectorProps {
  period: PeriodFilterState;
  onChange: (period: PeriodFilterState) => void;
  className?: string;
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  period,
  onChange,
  className = '',
}) => {
  const [showCustom, setShowCustom] = useState(period.type === 'custom');

  const handleTypeChange = (type: PeriodType) => {
    if (type === 'custom') {
      setShowCustom(true);
      const today = new Date().toISOString().split('T')[0];
      onChange({
        type: 'custom',
        startDate: period.startDate || today,
        endDate: period.endDate || today,
      });
    } else {
      setShowCustom(false);
      onChange({ type });
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950/80 border border-slate-800 rounded-xl">
        <button
          type="button"
          onClick={() => handleTypeChange('today')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            period.type === 'today'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          Aujourd'hui
        </button>
        <button
          type="button"
          onClick={() => handleTypeChange('week')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            period.type === 'week'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          Cette semaine
        </button>
        <button
          type="button"
          onClick={() => handleTypeChange('month')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            period.type === 'month'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          Ce mois
        </button>
        <button
          type="button"
          onClick={() => handleTypeChange('custom')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
            period.type === 'custom'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Personnalisée</span>
        </button>
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-400 text-[11px] font-medium">Du:</span>
            <input
              type="date"
              value={period.startDate || ''}
              onChange={(e) =>
                onChange({
                  type: 'custom',
                  startDate: e.target.value,
                  endDate: period.endDate,
                })
              }
              className="bg-transparent text-white font-mono text-xs focus:outline-hidden"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-400 text-[11px] font-medium">Au:</span>
            <input
              type="date"
              value={period.endDate || ''}
              onChange={(e) =>
                onChange({
                  type: 'custom',
                  startDate: period.startDate,
                  endDate: e.target.value,
                })
              }
              className="bg-transparent text-white font-mono text-xs focus:outline-hidden"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Vérifie si une date ISO est dans la période sélectionnée
export function filterItemByPeriod(
  dateIsoStr: string | undefined | null,
  period: PeriodFilterState
): boolean {
  if (!dateIsoStr) return false;
  const d = new Date(dateIsoStr);
  if (isNaN(d.getTime())) return false;

  const now = new Date();

  if (period.type === 'today') {
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  if (period.type === 'week') {
    // Calcul de début de semaine (Lundi)
    const currentDay = now.getDay();
    const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return d >= monday && d <= sunday;
  }

  if (period.type === 'month') {
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth()
    );
  }

  if (period.type === 'custom') {
    if (period.startDate) {
      const start = new Date(`${period.startDate}T00:00:00.000`);
      if (d < start) return false;
    }
    if (period.endDate) {
      const end = new Date(`${period.endDate}T23:59:59.999`);
      if (d > end) return false;
    }
    return true;
  }

  return true;
}

// Génère les points d'historique adaptés à la période sélectionnée
export function buildTimelineData(
  sales: { soldAt: string; price: number }[],
  remises: { createdAt?: string; remittedAt?: string; amount: number }[],
  period: PeriodFilterState
): TimelinePoint[] {
  const getRemiseDate = (r: { createdAt?: string; remittedAt?: string }) => r.createdAt || r.remittedAt || '';

  if (period.type === 'today') {
    const slots = [
      { label: '06h-09h', minH: 6, maxH: 9 },
      { label: '09h-12h', minH: 9, maxH: 12 },
      { label: '12h-15h', minH: 12, maxH: 15 },
      { label: '15h-18h', minH: 15, maxH: 18 },
      { label: '18h-21h', minH: 18, maxH: 21 },
      { label: '21h-24h', minH: 21, maxH: 24 },
    ];

    return slots.map((slot) => {
      const slotSales = sales.filter((s) => {
        if (!filterItemByPeriod(s.soldAt, period)) return false;
        const h = new Date(s.soldAt).getHours();
        return h >= slot.minH && h < slot.maxH;
      });
      const slotRemises = remises.filter((r) => {
        const dStr = getRemiseDate(r);
        if (!filterItemByPeriod(dStr, period)) return false;
        const h = new Date(dStr).getHours();
        return h >= slot.minH && h < slot.maxH;
      });

      return {
        label: slot.label,
        count: slotSales.length,
        amount: slotSales.reduce((acc, s) => acc + s.price, 0),
        remittedAmount: slotRemises.reduce((acc, r) => acc + r.amount, 0),
      };
    });
  }

  if (period.type === 'week') {
    const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    // JavaScript getDay(): 0 is Sunday, 1 is Monday ... 6 is Saturday
    // Mapping: Monday (1) -> 0, Sunday (0) -> 6
    return dayNames.map((name, dayIndex) => {
      const jsDayTarget = dayIndex === 6 ? 0 : dayIndex + 1;
      const daySales = sales.filter((s) => {
        if (!filterItemByPeriod(s.soldAt, period)) return false;
        return new Date(s.soldAt).getDay() === jsDayTarget;
      });
      const dayRemises = remises.filter((r) => {
        const dStr = getRemiseDate(r);
        if (!filterItemByPeriod(dStr, period)) return false;
        return new Date(dStr).getDay() === jsDayTarget;
      });

      return {
        label: name,
        count: daySales.length,
        amount: daySales.reduce((acc, s) => acc + s.price, 0),
        remittedAmount: dayRemises.reduce((acc, r) => acc + r.amount, 0),
      };
    });
  }

  if (period.type === 'month') {
    const weeks = [
      { label: 'Sem 1', minD: 1, maxD: 7 },
      { label: 'Sem 2', minD: 8, maxD: 14 },
      { label: 'Sem 3', minD: 15, maxD: 21 },
      { label: 'Sem 4', minD: 22, maxD: 28 },
      { label: 'Sem 5', minD: 29, maxD: 31 },
    ];

    return weeks.map((w) => {
      const wSales = sales.filter((s) => {
        if (!filterItemByPeriod(s.soldAt, period)) return false;
        const d = new Date(s.soldAt).getDate();
        return d >= w.minD && d <= w.maxD;
      });
      const wRemises = remises.filter((r) => {
        const dStr = getRemiseDate(r);
        if (!filterItemByPeriod(dStr, period)) return false;
        const d = new Date(dStr).getDate();
        return d >= w.minD && d <= w.maxD;
      });

      return {
        label: w.label,
        count: wSales.length,
        amount: wSales.reduce((acc, s) => acc + s.price, 0),
        remittedAmount: wRemises.reduce((acc, r) => acc + r.amount, 0),
      };
    });
  }

  // Custom
  const matchingSales = sales.filter((s) => filterItemByPeriod(s.soldAt, period));
  const matchingRemises = remises.filter((r) => filterItemByPeriod(getRemiseDate(r), period));

  // Regrouper par jour (max 8 jours récents)
  const groupedByDate: Record<string, { count: number; amount: number; remitted: number }> = {};
  for (const s of matchingSales) {
    const dStr = s.soldAt.split('T')[0];
    if (!groupedByDate[dStr]) groupedByDate[dStr] = { count: 0, amount: 0, remitted: 0 };
    groupedByDate[dStr].count += 1;
    groupedByDate[dStr].amount += s.price;
  }
  for (const r of matchingRemises) {
    const dStr = getRemiseDate(r).split('T')[0];
    if (dStr) {
      if (!groupedByDate[dStr]) groupedByDate[dStr] = { count: 0, amount: 0, remitted: 0 };
      groupedByDate[dStr].remitted += r.amount;
    }
  }

  const keys = Object.keys(groupedByDate).sort();
  if (keys.length === 0) {
    return [
      { label: 'Début', count: 0, amount: 0, remittedAmount: 0 },
      { label: 'Fin', count: 0, amount: 0, remittedAmount: 0 },
    ];
  }

  return keys.slice(-8).map((k) => {
    const parts = k.split('-');
    const label = `${parts[2]}/${parts[1]}`;
    return {
      label,
      count: groupedByDate[k].count,
      amount: groupedByDate[k].amount,
      remittedAmount: groupedByDate[k].remitted,
    };
  });
}

// ---------------------------------------------------------------------------
// 1. GRAPHIQUE VENTES PAR PÉRIODE (TIMELINE / HISTOGRAMME RESPONSIVE)
// ---------------------------------------------------------------------------
export interface TimelinePoint {
  label: string;
  count: number;
  amount: number;
  remittedAmount?: number;
}

interface TimelineChartProps {
  data: TimelinePoint[];
  title?: string;
  subtitle?: string;
  showRemises?: boolean;
}

export const SalesTimelineChart: React.FC<TimelineChartProps> = ({
  data,
  title = 'Évolution des Ventes',
  subtitle,
  showRemises = false,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.count, showRemises && d.remittedAmount ? d.remittedAmount / 5000 : 0)),
    5
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800 pb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
              {title}
            </h4>
          </div>
          {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
        </div>

        {showRemises && (
          <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
              Ventes
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
              Remises
            </span>
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs">
          Aucune donnée disponible pour cette période.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Histogramme en colonnes SVG responsive */}
          <div className="h-44 sm:h-52 w-full flex items-end gap-1 sm:gap-2 pt-6 px-1">
            {data.map((pt, idx) => {
              const heightPct = Math.round((pt.count / maxVal) * 100);
              const remHeightPct = pt.remittedAmount
                ? Math.round(((pt.remittedAmount / 5000) / maxVal) * 100)
                : 0;

              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {/* Tooltip */}
                  {hoveredIdx === idx && (
                    <div className="absolute -top-10 z-20 whitespace-nowrap rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1 text-[10px] text-white shadow-xl pointer-events-none">
                      <span className="font-bold">{pt.label}</span> : {pt.count} ticket(s) ({formatFCFA(pt.amount)})
                      {showRemises && pt.remittedAmount !== undefined && (
                        <div className="text-blue-400">
                          Remis : {formatFCFA(pt.remittedAmount)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Barres */}
                  <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-full">
                    {/* Barre Vente */}
                    <div
                      style={{ height: `${Math.max(heightPct, 4)}%` }}
                      className="w-full max-w-[18px] rounded-t-sm bg-emerald-500 hover:bg-emerald-400 transition-all shadow-sm"
                    />

                    {/* Barre Remise (si affichée) */}
                    {showRemises && (
                      <div
                        style={{ height: `${Math.max(remHeightPct, pt.remittedAmount ? 4 : 0)}%` }}
                        className="w-full max-w-[18px] rounded-t-sm bg-blue-500 hover:bg-blue-400 transition-all shadow-sm"
                      />
                    )}
                  </div>

                  {/* Label X */}
                  <span className="text-[9px] sm:text-[10px] text-slate-400 mt-1 truncate max-w-[42px] sm:max-w-none text-center">
                    {pt.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-800/60 px-1">
            <span>Total période : {data.reduce((s, d) => s + d.count, 0)} ticket(s)</span>
            <span className="font-mono font-bold text-slate-300">
              {formatFCFA(data.reduce((s, d) => s + d.amount, 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. CLASSEMENT & BARRES COMPARATIVES (PAR AGENT OU PAR RESPONSABLE)
// ---------------------------------------------------------------------------
export interface EntityRankItem {
  id: string;
  name: string;
  detail?: string;
  count: number;
  amount: number;
  remitted?: number;
  badge?: string;
}

interface EntityRankingProps {
  title: string;
  items: EntityRankItem[];
  emptyMessage?: string;
  showRemitted?: boolean;
}

export const EntityRankingChart: React.FC<EntityRankingProps> = ({
  title,
  items,
  emptyMessage = 'Aucune donnée disponible',
  showRemitted = false,
}) => {
  const maxCount = Math.max(...items.map((i) => i.count), 1);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
            {title}
          </h4>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {items.length} enregistré(s)
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-xs font-sans">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3">
          {items.slice(0, 8).map((item, index) => {
            const pct = Math.round((item.count / maxCount) * 100);

            return (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-800 text-[10px] font-bold text-slate-400">
                      {index + 1}
                    </span>
                    <span className="font-bold text-white truncate">{item.name}</span>
                    {item.detail && (
                      <span className="text-[10px] text-slate-500 truncate hidden sm:inline">
                        ({item.detail})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 font-mono shrink-0">
                    <span className="font-bold text-emerald-400">
                      {item.count} <span className="text-[10px] font-sans text-slate-400">t.</span>
                    </span>
                    <span className="text-slate-300 text-[11px]">
                      {formatFCFA(item.amount)}
                    </span>
                  </div>
                </div>

                {/* Barre de progression */}
                <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                  <div
                    style={{ width: `${Math.max(pct, 2)}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
                  />
                </div>

                {showRemitted && item.remitted !== undefined && (
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-0.5">
                    <span>Remis : {formatFCFA(item.remitted)}</span>
                    <span className={item.amount > item.remitted ? 'text-amber-400' : 'text-emerald-400'}>
                      Solde : {formatFCFA(Math.max(0, item.amount - item.remitted))}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3. RÉPARTITION DU STOCK (DISPONIBLES / ASSIGNÉS / VENDUS / ANNULÉS)
// ---------------------------------------------------------------------------
export interface StockBreakdown {
  inStockCount: number;
  inSectorCount: number;
  inAgentCount: number;
  soldCount: number;
  cancelledCount: number;
  total: number;
}

interface StockBreakdownChartProps {
  breakdown: StockBreakdown;
  pricePerTicket?: number;
}

export const StockDistributionChart: React.FC<StockBreakdownChartProps> = ({
  breakdown,
  pricePerTicket = 5000,
}) => {
  const total = breakdown.total || 1;
  const availableTotal = breakdown.inStockCount + breakdown.inSectorCount + breakdown.inAgentCount;

  const inStockPct = Math.round((breakdown.inStockCount / total) * 100);
  const inSectorPct = Math.round((breakdown.inSectorCount / total) * 100);
  const inAgentPct = Math.round((breakdown.inAgentCount / total) * 100);
  const soldPct = Math.round((breakdown.soldCount / total) * 100);
  const cancelledPct = Math.round((breakdown.cancelledCount / total) * 100);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <PieIcon className="w-4 h-4 text-blue-400" />
          <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
            Répartition & État du Stock
          </h4>
        </div>
        <span className="text-[11px] font-mono text-emerald-400 font-bold">
          {availableTotal} disponibles ({formatFCFA(availableTotal * pricePerTicket)})
        </span>
      </div>

      {/* Barre segmentée empilée */}
      <div className="h-3 w-full rounded-full bg-slate-950 flex overflow-hidden p-0.5 border border-slate-800">
        <div style={{ width: `${inStockPct}%` }} title={`Magasin : ${breakdown.inStockCount}`} className="bg-slate-400 h-full rounded-l-sm" />
        <div style={{ width: `${inSectorPct}%` }} title={`Secteur : ${breakdown.inSectorCount}`} className="bg-blue-500 h-full" />
        <div style={{ width: `${inAgentPct}%` }} title={`Agent : ${breakdown.inAgentCount}`} className="bg-amber-400 h-full" />
        <div style={{ width: `${soldPct}%` }} title={`Vendus : ${breakdown.soldCount}`} className="bg-emerald-500 h-full" />
        <div style={{ width: `${cancelledPct}%` }} title={`Annulés : ${breakdown.cancelledCount}`} className="bg-rose-500 h-full rounded-r-sm" />
      </div>

      {/* Légende détaillée en grille */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
        <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
            <span>En Magasin (Siège)</span>
          </div>
          <p className="font-mono font-bold text-white mt-0.5">{breakdown.inStockCount}</p>
        </div>

        <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
          <div className="flex items-center gap-1.5 text-blue-400 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            <span>En Secteur</span>
          </div>
          <p className="font-mono font-bold text-white mt-0.5">{breakdown.inSectorCount}</p>
        </div>

        <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
          <div className="flex items-center gap-1.5 text-amber-400 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            <span>En Main Agent</span>
          </div>
          <p className="font-mono font-bold text-white mt-0.5">{breakdown.inAgentCount}</p>
        </div>

        <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
          <div className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span>Vendus</span>
          </div>
          <p className="font-mono font-bold text-white mt-0.5">{breakdown.soldCount}</p>
        </div>

        <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
          <div className="flex items-center gap-1.5 text-rose-400 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
            <span>Annulés</span>
          </div>
          <p className="font-mono font-bold text-white mt-0.5">{breakdown.cancelledCount}</p>
        </div>

        <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
          <div className="flex items-center gap-1.5 text-purple-400 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
            <span>Total Émis</span>
          </div>
          <p className="font-mono font-bold text-white mt-0.5">{breakdown.total}</p>
        </div>
      </div>
    </div>
  );
};
