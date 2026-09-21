import React, { useState } from 'react';
import {
  X,
  Search,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  MapPin,
  ShieldAlert,
  Camera,
  Eye,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { exportControlsToExcel } from '../../utils/excelExport';
import { formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import { FRAUD_STATUSES, FRAUD_TYPES } from '../../config/constants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenScan?: () => void;
}

export const ControlsListModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onOpenScan,
}) => {
  const { currentUser } = useAuth();
  const { controls, fraudReports } = useData();

  const [activeTab, setActiveTab] = useState<'CONTROLS' | 'FRAUDS'>('CONTROLS');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  // Filtrer contrôles selon rôle
  const visibleControls = controls.filter((c) => {
    if (currentUser?.role === 'CONTROLEUR') {
      if (c.controleurId !== currentUser.id) return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchPlate = c.plateNumber.toLowerCase().includes(term);
      const matchTicket = c.ticketNumber.toLowerCase().includes(term);
      const matchCtrl = c.controleurName.toLowerCase().includes(term);
      return matchPlate || matchTicket || matchCtrl;
    }
    return true;
  });

  const visibleFrauds = fraudReports.filter((f) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchPlate = f.plateNumber.toLowerCase().includes(term);
      const matchReason = (f.reasonLabel || f.typeLabel || '').toLowerCase().includes(term);
      const matchCtrl = f.controleurName.toLowerCase().includes(term);
      return matchPlate || matchReason || matchCtrl;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white">Registre des Contrôles & Fraudes</h3>
            <p className="text-xs text-slate-400">
              {visibleControls.length} contrôle(s) • {visibleFrauds.length} signalement(s)
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenScan && (
              <button
                onClick={onOpenScan}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500 transition"
              >
                + Nouveau Contrôle
              </button>
            )}
            {activeTab === 'CONTROLS' && (
              <button
                onClick={() => exportControlsToExcel(visibleControls)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-600/30 transition"
                title="Exporter vers Excel"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="hidden sm:inline">Export Excel</span>
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Onglets Contrôles / Fraudes */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex rounded-xl bg-slate-800 p-1 border border-slate-700">
            <button
              onClick={() => setActiveTab('CONTROLS')}
              className={`py-1.5 px-3 text-xs font-bold rounded-lg transition ${
                activeTab === 'CONTROLS'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Contrôles Routiers ({visibleControls.length})
            </button>
            <button
              onClick={() => setActiveTab('FRAUDS')}
              className={`py-1.5 px-3 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                activeTab === 'FRAUDS'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Irrégularités & Fraudes ({visibleFrauds.length})</span>
            </button>
          </div>

          <div className="flex-1 max-w-xs relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrer..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-1.5 pl-9 pr-3 text-xs text-white focus:outline-hidden focus:border-amber-500"
            />
          </div>
        </div>

        {/* Contenu de l'onglet actif */}
        <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
          {activeTab === 'CONTROLS' ? (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Date / Heure</th>
                  <th className="py-2.5 px-3">Résultat</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3">Ticket</th>
                  <th className="py-2.5 px-3">Immatriculation</th>
                  <th className="py-2.5 px-3">Contrôleur</th>
                  <th className="py-2.5 px-3">GPS</th>
                  <th className="py-2.5 px-3">Observations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {visibleControls.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      Aucun contrôle enregistré.
                    </td>
                  </tr>
                ) : (
                  visibleControls.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-900/60 transition">
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                        {formatDateTime(c.controlledAt)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {c.isValid ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> VALIDE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 text-rose-300 px-2 py-0.5 text-[10px] font-bold">
                            <XCircle className="w-3 h-3 text-rose-400" /> NON CONFORME
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            c.isOnline
                              ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                              : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                          }`}
                        >
                          {c.isOnline ? '🌐 En ligne' : '📦 Hors ligne'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                        {c.ticketNumber}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-emerald-400 whitespace-nowrap">
                        {formatPlateDisplay(c.plateNumber)}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-300 whitespace-nowrap">
                        {c.controleurName}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-400 whitespace-nowrap">
                        {c.gpsStatus === 'AVAILABLE' ? (
                          <span className="flex items-center gap-1 text-[11px]">
                            <MapPin className="w-3 h-3 text-emerald-400" />
                            <span>{c.gpsLatitude?.toFixed(3)}, {c.gpsLongitude?.toFixed(3)}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-600">Non capturé</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-400 max-w-xs truncate">
                        {c.validationMessage}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <div className="p-3 space-y-3 font-sans">
              {visibleFrauds.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Aucun signalement d'irrégularité.
                </div>
              ) : (
                visibleFrauds.map((f) => {
                  const statusMeta = FRAUD_STATUSES.find((s) => s.id === f.status);
                  const typeMeta = FRAUD_TYPES.find((t) => t.id === f.type || t.id === f.reason);
                  const photosList = f.photos && f.photos.length > 0 ? f.photos : (f.photoDataUrl ? [f.photoDataUrl] : []);

                  return (
                    <div
                      key={f.id}
                      className="rounded-xl border border-rose-500/30 bg-slate-900/90 p-4 text-xs space-y-2.5"
                    >
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold border ${typeMeta?.badgeColor || 'bg-rose-500/20 text-rose-300 border-rose-500/30'}`}>
                            {f.typeLabel || f.reasonLabel}
                          </span>
                          <span className="font-mono font-black text-sm text-white">
                            {formatPlateDisplay(f.plateNumber)}
                          </span>
                          {f.ticketNumber && (
                            <span className="font-mono text-amber-400 text-[11px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                              Ticket : {f.ticketNumber}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusMeta?.color || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                            {statusMeta?.label || f.status}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {formatDateTime(f.reportedAt)}
                          </span>
                        </div>
                      </div>

                      <p className="text-slate-200 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                        {f.comment}
                      </p>

                      {/* Galerie photos */}
                      {photosList.length > 0 && (
                        <div>
                          <span className="text-[11px] text-slate-400 font-semibold block mb-1.5">
                            {photosList.length} photo{photosList.length > 1 ? 's' : ''} de preuve :
                          </span>
                          <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            {photosList.map((imgUrl, i) => (
                              <img
                                key={i}
                                src={imgUrl}
                                alt={`Preuve ${i + 1}`}
                                className="h-16 w-24 rounded-lg object-cover border border-slate-700 shrink-0"
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Décision administrative si arbitrée */}
                      {f.adminDecisionNote && (
                        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] space-y-1">
                          <div className="flex items-center justify-between text-slate-400">
                            <span className="font-bold text-rose-300">
                              Décision administrative ({f.status}) :
                            </span>
                            {f.adminDecisionByName && (
                              <span>Par {f.adminDecisionByName}</span>
                            )}
                          </div>
                          <p className="text-slate-300 italic">"{f.adminDecisionNote}"</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                        <span>Signalé par : <strong className="text-white">{f.controleurName}</strong></span>
                        {f.gpsLatitude != null ? (
                          <span className="flex items-center gap-1 font-mono text-emerald-400 text-[10px]">
                            <MapPin className="w-3 h-3" />
                            GPS {f.gpsLatitude.toFixed(3)}, {f.gpsLongitude?.toFixed(3)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-600">GPS indisponible</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
