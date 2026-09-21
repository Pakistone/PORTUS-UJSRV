import React, { useState } from 'react';
import {
  X,
  Search,
  FileSpreadsheet,
  ShieldAlert,
  Clock,
  User,
  Filter,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { exportAuditLogsToExcel } from '../../utils/excelExport';
import { formatDateTime } from '../../utils/normalization';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const AuditTrailModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { auditLogs } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  if (!isOpen) return null;

  const filteredLogs = auditLogs.filter((log) => {
    if (roleFilter !== 'ALL' && log.actorRole !== roleFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchActor = log.actorName.toLowerCase().includes(term);
      const matchAction = log.action.toLowerCase().includes(term);
      const matchDetails = (log.details || '').toLowerCase().includes(term);
      const matchEntity = log.targetEntity.toLowerCase().includes(term);
      return matchActor || matchAction || matchDetails || matchEntity;
    }
    return true;
  });

  const getActionColor = (action: string) => {
    if (action.includes('CANCEL') || action.includes('FRAUD') || action.includes('DEACTIVATED')) {
      return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
    if (action.includes('CORRECTION') || action.includes('PASSWORD') || action.includes('PLATE')) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    }
    if (action.includes('SOLD') || action.includes('CREATED') || action.includes('GENERATED')) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
    return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Journal d’Audit Trail Immuable</h3>
              <p className="text-xs text-slate-400">
                Traçabilité intégrale de toutes les opérations sensibles et financières
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportAuditLogsToExcel(filteredLogs)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-600/30 transition"
              title="Exporter vers Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>
            <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filtres */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par opérateur, action, immatriculation ou détail..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-2.5 pl-9 pr-3 text-xs text-white focus:outline-hidden focus:border-amber-500"
            />
          </div>

          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-2.5 pl-9 pr-3 text-xs text-white focus:outline-hidden focus:border-amber-500"
            >
              <option value="ALL">Tous les rôles</option>
              <option value="ADMINISTRATEUR">Administrateur</option>
              <option value="RESPONSABLE">Responsable Secteur</option>
              <option value="AGENT">Agent de Terrain</option>
              <option value="CONTROLEUR">Contrôleur Routier</option>
            </select>
          </div>
        </div>

        {/* Liste chronologique de l'audit */}
        <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-2 space-y-2">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Aucun événement d'audit ne correspond à vos filtres.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs hover:border-slate-700 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-mono font-bold ${getActionColor(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>
                    <span className="font-bold text-white flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {log.actorName}
                    </span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[9px] text-slate-400">
                      {log.actorRole}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{formatDateTime(log.timestamp)}</span>
                  </div>
                </div>

                <p className="text-slate-300 leading-relaxed font-sans">{log.details}</p>

                {(log.oldValue || log.newValue) && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-mono bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                    <div className="text-slate-400">
                      <span className="text-rose-400 font-bold">Valeur Précédente :</span>
                      <pre className="overflow-x-auto whitespace-pre-wrap mt-0.5">
                        {JSON.stringify(log.oldValue, null, 2)}
                      </pre>
                    </div>
                    <div className="text-slate-400">
                      <span className="text-emerald-400 font-bold">Nouvelle Valeur :</span>
                      <pre className="overflow-x-auto whitespace-pre-wrap mt-0.5">
                        {JSON.stringify(log.newValue, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
