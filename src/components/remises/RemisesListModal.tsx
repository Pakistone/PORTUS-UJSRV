import React, { useState } from 'react';
import {
  X,
  Search,
  FileSpreadsheet,
  Printer,
  Wrench,
  History,
  AlertCircle,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { exportRemisesToExcel } from '../../utils/excelExport';
import { generateRemiseReceiptPDF } from '../../utils/pdfGenerator';
import { formatFCFA, formatDateTime } from '../../utils/normalization';
import { ExceptionalCorrectionModal } from './ExceptionalCorrectionModal';
import type { Remise } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewRemise?: () => void;
}

export const RemisesListModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onOpenNewRemise,
}) => {
  const { currentUser } = useAuth();
  const { remises } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCorrectionRemise, setSelectedCorrectionRemise] = useState<Remise | null>(null);
  const [viewHistoryRemise, setViewHistoryRemise] = useState<Remise | null>(null);

  if (!isOpen) return null;

  // Filtrer selon rôle
  const visibleRemises = remises.filter((r) => {
    if (currentUser?.role === 'AGENT') {
      if (r.agentId !== currentUser.id) return false;
    } else if (currentUser?.role === 'RESPONSABLE') {
      if (r.sectorId && currentUser.sectorId && r.sectorId !== currentUser.sectorId) return false;
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchRef = r.reference.toLowerCase().includes(term);
      const matchAgent = r.agentName.toLowerCase().includes(term);
      const matchResp = r.responsableName.toLowerCase().includes(term);
      return matchRef || matchAgent || matchResp;
    }
    return true;
  });

  const totalAmount = visibleRemises.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">Registre des Remises Financières</h3>
              <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold font-mono">
                Total : {formatFCFA(totalAmount)}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {visibleRemises.length} versement(s) comptabilisé(s)
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenNewRemise && (currentUser?.role === 'RESPONSABLE' || currentUser?.role === 'ADMINISTRATEUR') && (
              <button
                onClick={onOpenNewRemise}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition"
              >
                + Nouvelle Remise
              </button>
            )}
            <button
              onClick={() => exportRemisesToExcel(visibleRemises)}
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
            placeholder="Rechercher par référence (REM-2026-XXXX), agent ou responsable..."
            className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-2.5 pl-9 pr-3 text-xs text-white focus:outline-hidden focus:border-blue-500"
          />
        </div>

        {/* Tableau */}
        <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
              <tr>
                <th className="py-2.5 px-3">Référence</th>
                <th className="py-2.5 px-3">Date / Heure</th>
                <th className="py-2.5 px-3">Agent</th>
                <th className="py-2.5 px-3">Responsable</th>
                <th className="py-2.5 px-3">Secteur</th>
                <th className="py-2.5 px-3 text-center">Tickets</th>
                <th className="py-2.5 px-3 text-right">Montant</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {visibleRemises.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Aucune remise trouvée.
                  </td>
                </tr>
              ) : (
                visibleRemises.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/60 transition">
                    <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{r.reference}</span>
                        {r.isCorrected && (
                          <button
                            onClick={() => setViewHistoryRemise(r)}
                            className="rounded bg-amber-500/20 text-amber-300 p-0.5 text-[9px] font-bold flex items-center gap-0.5"
                            title="Remise rectifiée (cliquer pour voir l'historique)"
                          >
                            <History className="w-3 h-3" />
                            <span>MODIFIÉ</span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-200 whitespace-nowrap">
                      {r.agentName}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-400 whitespace-nowrap">
                      {r.responsableName}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-400 whitespace-nowrap">
                      {r.sectorName || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center text-emerald-400 font-bold whitespace-nowrap">
                      {r.ticketsCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-white whitespace-nowrap">
                      {formatFCFA(r.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5 font-sans">
                        {/* Imprimer le reçu officiel PDF */}
                        <button
                          onClick={() => generateRemiseReceiptPDF(r)}
                          className="rounded p-1 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                          title="Télécharger le reçu officiel PDF"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {/* Correction Exceptionnelle (Admin uniquement) */}
                        {currentUser?.role === 'ADMINISTRATEUR' && (
                          <button
                            onClick={() => setSelectedCorrectionRemise(r)}
                            className="rounded p-1 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
                            title="Correction exceptionnelle Administrateur"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Historique des Corrections */}
        {viewHistoryRemise && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <History className="w-5 h-5" />
                  <span>Historique des Corrections : {viewHistoryRemise.reference}</span>
                </div>
                <button
                  onClick={() => setViewHistoryRemise(null)}
                  className="rounded p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {viewHistoryRemise.history.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">
                    Aucune modification enregistrée.
                  </p>
                ) : (
                  viewHistoryRemise.history.map((h) => (
                    <div key={h.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs space-y-1">
                      <div className="flex justify-between font-bold text-white">
                        <span>Par : {h.modifiedByName}</span>
                        <span className="text-slate-400 font-mono text-[10px]">
                          {formatDateTime(h.modifiedAt)}
                        </span>
                      </div>
                      <div className="text-slate-300">
                        Ancien : <strong>{formatFCFA(h.oldAmount)}</strong> ➔ Nouveau :{' '}
                        <strong className="text-emerald-400">{formatFCFA(h.newAmount)}</strong>
                      </div>
                      <div className="text-[11px] text-amber-300/90 pt-1 border-t border-slate-800">
                        Motif : {h.reason}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => setViewHistoryRemise(null)}
                className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Fermer
              </button>
            </div>
          </div>
        )}

        {/* Modal de Correction Exceptionnelle */}
        {selectedCorrectionRemise && (
          <ExceptionalCorrectionModal
            remise={selectedCorrectionRemise}
            onClose={() => setSelectedCorrectionRemise(null)}
          />
        )}
      </div>
    </div>
  );
};
