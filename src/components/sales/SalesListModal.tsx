import React, { useState } from 'react';
import { X, Search, FileSpreadsheet, MapPin, CheckCircle, Clock } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { exportSalesToExcel } from '../../utils/excelExport';
import { formatFCFA, formatDateTime, formatPlateDisplay } from '../../utils/normalization';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SalesListModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const { sales } = useData();
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  // Filtrer selon rôle
  const visibleSales = sales.filter((s) => {
    if (currentUser?.role === 'AGENT') {
      if (s.agentId !== currentUser.id) return false;
    } else if (currentUser?.role === 'RESPONSABLE') {
      if (s.sectorId && currentUser.sectorId && s.sectorId !== currentUser.sectorId) return false;
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchPlate = s.plateNumber.toLowerCase().includes(term);
      const matchTicket = s.ticketNumber.toLowerCase().includes(term);
      const matchAgent = s.agentName.toLowerCase().includes(term);
      return matchPlate || matchTicket || matchAgent;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white">Historique Détaillé des Ventes</h3>
            <p className="text-xs text-slate-400">
              {visibleSales.length} vente(s) enregistrée(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportSalesToExcel(visibleSales)}
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

        {/* Barre de recherche */}
        <div className="mt-4 relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par immatriculation, numéro de ticket ou nom d’agent..."
            className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-2.5 pl-9 pr-3 text-xs text-white focus:outline-hidden focus:border-emerald-500"
          />
        </div>

        {/* Tableau Responsive */}
        <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
              <tr>
                <th className="py-2.5 px-3">Ticket</th>
                <th className="py-2.5 px-3">Immatriculation</th>
                <th className="py-2.5 px-3">Agent</th>
                <th className="py-2.5 px-3">Date Vente (Originale)</th>
                <th className="py-2.5 px-3">Téléphone</th>
                <th className="py-2.5 px-3">GPS</th>
                <th className="py-2.5 px-3">Statut Synchro</th>
                <th className="py-2.5 px-3 text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {visibleSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Aucune vente enregistrée.
                  </td>
                </tr>
              ) : (
                visibleSales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-900/60 transition">
                    <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                      {s.ticketNumber}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-emerald-400 whitespace-nowrap">
                      {formatPlateDisplay(s.plateNumber)}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-300 whitespace-nowrap">
                      {s.agentName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                      {formatDateTime(s.soldAt)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {s.driverPhone || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                      {s.gpsStatus === 'AVAILABLE' ? (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <MapPin className="w-3 h-3 text-emerald-400" />
                          <span>{s.gpsLatitude?.toFixed(3)}, {s.gpsLongitude?.toFixed(3)}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600">Non capturé</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                      {s.syncStatus === 'SYNCED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle className="w-3 h-3" /> Synchronisé
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          <Clock className="w-3 h-3" /> En attente
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-white whitespace-nowrap">
                      {formatFCFA(s.price)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
