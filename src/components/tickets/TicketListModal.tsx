import React, { useState } from 'react';
import {
  X,
  Search,
  Printer,
  FileSpreadsheet,
  Ban,
  Edit2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { exportTicketsToExcel } from '../../utils/excelExport';
import { generateCarnetPrintPDF } from '../../utils/pdfGenerator';
import { formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import type { Ticket, TicketStatus } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  carnetFilterId?: string;
}

export const TicketListModal: React.FC<Props> = ({ isOpen, onClose, carnetFilterId }) => {
  const { currentUser } = useAuth();
  const { tickets, carnets, cancelTicket, correctPlateNumber } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedCarnetId, setSelectedCarnetId] = useState<string>(carnetFilterId || 'ALL');

  // Modal d'annulation
  const [cancelTargetTicket, setCancelTargetTicket] = useState<Ticket | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Modal de correction d'immatriculation
  const [correctTargetTicket, setCorrectTargetTicket] = useState<Ticket | null>(null);
  const [newPlate, setNewPlate] = useState('');
  const [correctReason, setCorrectReason] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filtrer selon rôle
  const visibleTickets = tickets.filter((t) => {
    if (currentUser?.role === 'RESPONSABLE') {
      if (t.assignedResponsableId !== currentUser.id) return false;
    } else if (currentUser?.role === 'AGENT') {
      if (t.assignedAgentId !== currentUser.id) return false;
    }

    if (selectedCarnetId !== 'ALL' && t.carnetId !== selectedCarnetId) return false;
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchNum = t.ticketNumber.toLowerCase().includes(term);
      const matchPlate = (t.plateNumber || '').toLowerCase().includes(term);
      const matchAgent = (t.assignedAgentName || '').toLowerCase().includes(term);
      return matchNum || matchPlate || matchAgent;
    }
    return true;
  });

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTargetTicket || !cancelReason.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await cancelTicket(cancelTargetTicket.id, cancelReason);
      setCancelTargetTicket(null);
      setCancelReason('');
    } catch (err: any) {
      setActionError(err?.message || 'Erreur lors de l’annulation.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCorrectPlateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctTargetTicket || !newPlate.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await correctPlateNumber(correctTargetTicket.id, newPlate, correctReason || 'Correction saisie');
      setCorrectTargetTicket(null);
      setNewPlate('');
      setCorrectReason('');
    } catch (err: any) {
      setActionError(err?.message || 'Erreur lors de la correction.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrintCarnet = async (carnetId: string) => {
    const c = carnets.find((item) => item.id === carnetId);
    if (!c) return;
    const cTickets = tickets.filter((t) => t.carnetId === carnetId);
    await generateCarnetPrintPDF(c, cTickets);
  };

  const statusBadge = (t: Ticket) => {
    if (t.status === 'CANCELLED') {
      return <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">ANNULÉ</span>;
    }
    if (t.isSuperseded) {
      return <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">REMPLACÉ</span>;
    }
    switch (t.status) {
      case 'SOLD':
        return <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">VENDU (ACTIF)</span>;
      case 'ASSIGNED_TO_AGENT':
        return <span className="rounded-md bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300">CHEZ L’AGENT</span>;
      case 'ASSIGNED_TO_RESPONSIBLE':
        return <span className="rounded-md bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">RESPONSABLE</span>;
      case 'GENERATED':
        return <span className="rounded-md bg-slate-500/20 px-2 py-0.5 text-[10px] font-bold text-slate-300">GÉNÉRÉ</span>;
      default:
        return <span className="rounded-md bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-300">{t.status}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white">Gestion des Tickets & Carnets</h3>
            <p className="text-xs text-slate-400">
              {visibleTickets.length} ticket(s) répertorié(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportTicketsToExcel(visibleTickets)}
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

        {/* Barre de filtres et recherche */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Numéro, plaque, agent..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-2 pl-9 pr-3 text-xs text-white focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-800/90 py-2 px-3 text-xs text-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="AVAILABLE">Disponibles</option>
            <option value="ASSIGNED_TO_AGENT">Attribués aux agents</option>
            <option value="SOLD">Vendus (Actifs)</option>
            <option value="CANCELLED">Annulés</option>
          </select>

          <select
            value={selectedCarnetId}
            onChange={(e) => setSelectedCarnetId(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-800/90 py-2 px-3 text-xs text-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="ALL">Tous les carnets</option>
            {carnets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.carnetNumber} ({c.size} tickets)
              </option>
            ))}
          </select>
        </div>

        {/* Tableau Responsive des tickets */}
        <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
              <tr>
                <th className="py-2.5 px-3">Numéro</th>
                <th className="py-2.5 px-3">Carnet</th>
                <th className="py-2.5 px-3">Statut</th>
                <th className="py-2.5 px-3">Agent</th>
                <th className="py-2.5 px-3">Immatriculation</th>
                <th className="py-2.5 px-3">Vente</th>
                <th className="py-2.5 px-3">Contrôles</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {visibleTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Aucun ticket ne correspond à vos critères.
                  </td>
                </tr>
              ) : (
                visibleTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-900/60 transition">
                    <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                      {t.ticketNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{t.carnetNumber}</span>
                        {currentUser?.role === 'ADMINISTRATEUR' && (
                          <button
                            onClick={() => handlePrintCarnet(t.carnetId)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400"
                            title="Imprimer le carnet PDF (9/page A4)"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {statusBadge(t)}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-300 whitespace-nowrap">
                      {t.assignedAgentName || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-emerald-400 whitespace-nowrap">
                      {t.plateNumber ? formatPlateDisplay(t.plateNumber) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {formatDateTime(t.soldAt)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        t.controlCount > 0 ? 'bg-blue-500/20 text-blue-300' : 'text-slate-500'
                      }`}>
                        {t.controlCount} fois
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1 font-sans">
                        {/* Correction d'immatriculation (Admin ou Responsable après vente) */}
                        {(currentUser?.role === 'ADMINISTRATEUR' || currentUser?.role === 'RESPONSABLE') && t.status === 'SOLD' && (
                          <button
                            onClick={() => {
                              setCorrectTargetTicket(t);
                              setNewPlate(t.plateNumber || '');
                            }}
                            className="rounded p-1 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
                            title="Corriger l’immatriculation"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Annulation (Admin uniquement) */}
                        {currentUser?.role === 'ADMINISTRATEUR' && t.status !== 'CANCELLED' && (
                          <button
                            onClick={() => setCancelTargetTicket(t)}
                            className="rounded p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                            title="Annuler ce ticket"
                          >
                            <Ban className="w-3.5 h-3.5" />
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

        {/* Modal d'Annulation Ticket (Admin) */}
        {cancelTargetTicket && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-6 text-slate-100 shadow-2xl">
              <div className="flex items-center gap-2 text-rose-400 mb-3">
                <AlertTriangle className="w-5 h-5" />
                <h4 className="text-base font-bold text-white">
                  Annuler le Ticket {cancelTargetTicket.ticketNumber}
                </h4>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Attention : Un ticket annulé n'est plus considéré comme valide et sera rejeté
                immédiatement par les contrôleurs sur le terrain. Cette opération sera tracée dans le journal d'audit.
              </p>
              <form onSubmit={handleCancelSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Motif d’annulation obligatoire
                  </label>
                  <input
                    type="text"
                    required
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Ex: Erreur matérielle, ticket déchiré, doublon"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white focus:border-rose-500 focus:outline-hidden"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCancelTargetTicket(null)}
                    className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-500 transition disabled:opacity-50"
                  >
                    {actionLoading ? 'Annulation...' : 'Confirmer l’annulation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Correction Immatriculation (Admin ou Responsable) */}
        {correctTargetTicket && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-slate-900 p-6 text-slate-100 shadow-2xl">
              <div className="flex items-center gap-2 text-amber-400 mb-3">
                <Edit2 className="w-5 h-5" />
                <h4 className="text-base font-bold text-white">
                  Corriger l’Immatriculation ({correctTargetTicket.ticketNumber})
                </h4>
              </div>
              <p className="text-xs text-slate-300 mb-4">
                L’ancienne immatriculation sera remplacée et l'opération sera inscrite dans le journal d'audit.
              </p>
              <form onSubmit={handleCorrectPlateSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nouvelle Immatriculation
                  </label>
                  <input
                    type="text"
                    required
                    value={newPlate}
                    onChange={(e) => setNewPlate(e.target.value)}
                    placeholder="Ex: AB1234CD"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white uppercase focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Motif de la correction
                  </label>
                  <input
                    type="text"
                    required
                    value={correctReason}
                    onChange={(e) => setCorrectReason(e.target.value)}
                    placeholder="Ex: Erreur de saisie par l'agent"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrectTargetTicket(null)}
                    className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300"
                  >
                    Fermer
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white hover:bg-amber-500 transition disabled:opacity-50"
                  >
                    {actionLoading ? 'Mise à jour...' : 'Valider la Correction'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
