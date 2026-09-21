import React, { useState, useMemo } from 'react';
import {
  X,
  Layers,
  Search,
  Filter,
  Printer,
  Eye,
  Ban,
  UserCheck,
  History,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ArrowLeft,
  FileSpreadsheet,
  QrCode,
  ShieldCheck,
  Clock,
  User,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { generateCarnetPrintPDF } from '../../utils/pdfGenerator';
import { formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import { CarnetGeneratorModal } from './CarnetGeneratorModal';
import type { Carnet, Ticket, CarnetStatus, TicketStatus } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenCreate?: () => void;
}

export const CarnetManagementModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const {
    carnets,
    tickets,
    users,
    auditLogs,
    assignCarnetToResponsable,
    cancelCarnet,
    cancelTicket,
    updateTicketStatus,
  } = useData();

  // Navigation interne
  const [activeTab, setActiveTab] = useState<'LIST' | 'HISTORY'>('LIST');
  const [selectedCarnet, setSelectedCarnet] = useState<Carnet | null>(null);

  // Filtres et recherche
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CarnetStatus>('ALL');

  // Modals d'actions
  const [generatorModalOpen, setGeneratorModalOpen] = useState(false);
  const [assignModalCarnet, setAssignModalCarnet] = useState<Carnet | null>(null);
  const [selectedResponsableId, setSelectedResponsableId] = useState('');

  // Modals d'annulation avec confirmation obligatoire
  const [cancelModalCarnet, setCancelModalCarnet] = useState<Carnet | null>(null);
  const [cancelCarnetReason, setCancelCarnetReason] = useState('');

  const [cancelModalTicket, setCancelModalTicket] = useState<Ticket | null>(null);
  const [cancelTicketReason, setCancelTicketReason] = useState('');

  // Modal d'inspection de QR code
  const [inspectedTicket, setInspectedTicket] = useState<Ticket | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const responsables = users.filter((u) => u.role === 'RESPONSABLE' && u.isActive);

  // Filtrage des carnets
  const filteredCarnets = useMemo(() => {
    return carnets.filter((c) => {
      if (statusFilter !== 'ALL') {
        if (c.status !== statusFilter) return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchRef = c.carnetNumber.toLowerCase().includes(term);
        const matchPrefix = (c.seriesPrefix || '').toLowerCase().includes(term);
        const matchResp = (c.assignedToResponsableName || '').toLowerCase().includes(term);
        const matchCreator = (c.createdByName || '').toLowerCase().includes(term);
        const matchId = c.id.toLowerCase().includes(term);
        return matchRef || matchPrefix || matchResp || matchCreator || matchId;
      }
      return true;
    });
  }, [carnets, statusFilter, searchTerm]);

  // Tickets du carnet sélectionné
  const carnetTickets = useMemo(() => {
    if (!selectedCarnet) return [];
    return tickets.filter((t) => t.carnetId === selectedCarnet.id);
  }, [tickets, selectedCarnet]);

  // Logs d'audit liés aux carnets et attributions
  const carnetAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const isCarnetAction =
        log.action === 'CARNET_GENERATED' ||
        log.action === 'CARNET_ASSIGNED_RESPONSABLE' ||
        log.action === 'CARNET_CANCELLED' ||
        log.targetEntity === 'Carnet';
      if (selectedCarnet) {
        return (
          isCarnetAction &&
          (log.targetId === selectedCarnet.id ||
            (log.details || '').includes(selectedCarnet.carnetNumber))
        );
      }
      return isCarnetAction;
    });
  }, [auditLogs, selectedCarnet]);

  // Handler d'impression PDF A4 Paysage (9 tickets/page)
  const handlePrintPDF = async (c: Carnet) => {
    const cTickets = tickets.filter((t) => t.carnetId === c.id);
    await generateCarnetPrintPDF(c, cTickets);
  };

  // Attribution d'un carnet à un responsable
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalCarnet || !selectedResponsableId) return;

    setActionLoading(true);
    setActionError(null);
    try {
      await assignCarnetToResponsable(assignModalCarnet.id, selectedResponsableId);
      setActionSuccess(`Le carnet ${assignModalCarnet.carnetNumber} a été attribué avec succès.`);
      setAssignModalCarnet(null);
      setSelectedResponsableId('');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err?.message || 'Erreur lors de l’attribution du carnet.');
    } finally {
      setActionLoading(false);
    }
  };

  // Annulation d'un carnet avec confirmation obligatoire
  const handleCancelCarnetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalCarnet || !cancelCarnetReason.trim()) return;

    setActionLoading(true);
    setActionError(null);
    try {
      await cancelCarnet(cancelModalCarnet.id, cancelCarnetReason);
      setActionSuccess(`Le carnet ${cancelModalCarnet.carnetNumber} a été annulé avec succès.`);
      setCancelModalCarnet(null);
      setCancelCarnetReason('');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err?.message || 'Erreur lors de l’annulation du carnet.');
    } finally {
      setActionLoading(false);
    }
  };

  // Annulation d'un ticket individuel avec confirmation obligatoire
  const handleCancelTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalTicket || !cancelTicketReason.trim()) return;

    setActionLoading(true);
    setActionError(null);
    try {
      await cancelTicket(cancelModalTicket.id, cancelTicketReason);
      setActionSuccess(`Le ticket ${cancelModalTicket.ticketNumber} a été annulé avec succès.`);
      setCancelModalTicket(null);
      setCancelTicketReason('');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err?.message || 'Erreur lors de l’annulation du ticket.');
    } finally {
      setActionLoading(false);
    }
  };

  const getCarnetStatusBadge = (status: CarnetStatus) => {
    switch (status) {
      case 'GENERATED':
        return (
          <span className="rounded-md bg-slate-700/80 px-2 py-0.5 text-[10px] font-bold text-slate-200 border border-slate-600">
            GÉNÉRÉ (STOCK ADMIN)
          </span>
        );
      case 'ASSIGNED_TO_RESPONSIBLE':
        return (
          <span className="rounded-md bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-500/30">
            ATTRIBUÉ RESPONSABLE
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30">
            ANNULÉ
          </span>
        );
      default:
        return (
          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">
            {status}
          </span>
        );
    }
  };

  const getTicketStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'GENERATED':
        return (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
            GÉNÉRÉ
          </span>
        );
      case 'ASSIGNED_TO_RESPONSIBLE':
        return (
          <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-300">
            RESPONSABLE
          </span>
        );
      case 'AVAILABLE':
        return (
          <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300">
            DISPONIBLE
          </span>
        );
      case 'ASSIGNED_TO_AGENT':
        return (
          <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">
            DISTRIBUÉ AGENT
          </span>
        );
      case 'SOLD':
        return (
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
            VENDU
          </span>
        );
      case 'CONTROLLED':
        return (
          <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-300">
            CONTRÔLÉ
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
            ANNULÉ
          </span>
        );
      default:
        return (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
            {status}
          </span>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs">
        <div className="w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[94vh] flex flex-col">
          {/* Header Principal */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
            <div className="flex items-center gap-3">
              {selectedCarnet ? (
                <button
                  onClick={() => setSelectedCarnet(null)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Retour aux Carnets</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Gestion des Carnets & Numérotation des Tickets
                    </h3>
                    <p className="text-xs text-slate-400">
                      Multiples obligatoires de 3 (ex: 3, 6, 9... 150, 153). Impression PDF 9/page A4.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!selectedCarnet && (
                <>
                  <button
                    onClick={() => setActiveTab('LIST')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                      activeTab === 'LIST'
                        ? 'bg-slate-800 text-white border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Carnets ({filteredCarnets.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('HISTORY')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                      activeTab === 'HISTORY'
                        ? 'bg-slate-800 text-white border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Historique Attributions</span>
                  </button>
                  <button
                    onClick={() => setGeneratorModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-500 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Générer Carnet</span>
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Feedback messages */}
          {actionSuccess && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{actionSuccess}</span>
            </div>
          )}
          {actionError && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{actionError}</span>
            </div>
          )}

          {/* CONTENU SELON LA VUE */}
          {selectedCarnet ? (
            /* ========================================================================= */
            /* VUE DÉTAILLÉE : TICKETS DU CARNET SÉLECTIONNÉ                             */
            /* ========================================================================= */
            <div className="mt-4 flex-1 flex flex-col min-h-0 space-y-4">
              {/* Carte Récapitulative du Carnet */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-[11px] text-slate-500 uppercase font-bold">Référence Carnet</span>
                  <p className="text-base font-black text-white font-mono mt-0.5">{selectedCarnet.carnetNumber}</p>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">UUID: {selectedCarnet.id}</p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 uppercase font-bold">Volume & Série</span>
                  <p className="text-sm font-bold text-slate-200 mt-0.5">
                    {selectedCarnet.size} tickets ({Math.ceil(selectedCarnet.size / 9)} page(s) A4)
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Numéros {selectedCarnet.seriesPrefix}-{String(selectedCarnet.startNumber).padStart(6, '0')} à{' '}
                    {selectedCarnet.seriesPrefix}-{String(selectedCarnet.endNumber).padStart(6, '0')}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 uppercase font-bold">Statut & Affectation</span>
                  <div className="mt-1">{getCarnetStatusBadge(selectedCarnet.status)}</div>
                  <p className="text-[11px] text-slate-300 mt-1 font-semibold">
                    {selectedCarnet.assignedToResponsableName
                      ? `Resp: ${selectedCarnet.assignedToResponsableName}`
                      : 'Non assigné (Stock Admin)'}
                  </p>
                </div>
                <div className="flex flex-col justify-between items-start sm:items-end gap-2">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-500 uppercase font-bold">Généré le</span>
                    <p className="text-xs text-slate-300">{formatDateTime(selectedCarnet.createdAt)}</p>
                    <p className="text-[11px] text-slate-400">par {selectedCarnet.createdByName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePrintPDF(selectedCarnet)}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-md transition"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Imprimer PDF (9/page)</span>
                    </button>
                    {selectedCarnet.status !== 'CANCELLED' && (
                      <button
                        onClick={() => setCancelModalCarnet(selectedCarnet)}
                        className="flex items-center gap-1 rounded-xl bg-rose-500/20 border border-rose-500/30 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/30 transition"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Annuler Carnet</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tableau des tickets du carnet */}
              <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">Numéro Physique</th>
                      <th className="py-2.5 px-3">UUID Ticket</th>
                      <th className="py-2.5 px-3">Statut</th>
                      <th className="py-2.5 px-3">Agent</th>
                      <th className="py-2.5 px-3">Véhicule</th>
                      <th className="py-2.5 px-3">Date Vente</th>
                      <th className="py-2.5 px-3 text-center">QR Code</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {carnetTickets.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          Aucun ticket trouvé pour ce carnet.
                        </td>
                      </tr>
                    ) : (
                      carnetTickets.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-900/60 transition">
                          <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                            {t.ticketNumber}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-500 whitespace-nowrap">
                            {t.id.slice(0, 16)}...
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">{getTicketStatusBadge(t.status)}</td>
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
                            <button
                              onClick={() => setInspectedTicket(t)}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                              title="Inspecter le payload QR Code sécurisé"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {t.status !== 'CANCELLED' && t.status !== 'SOLD' && (
                              <button
                                onClick={() => setCancelModalTicket(t)}
                                className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] font-sans font-semibold border border-rose-500/20 transition"
                              >
                                Annuler
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'HISTORY' ? (
            /* ========================================================================= */
            /* VUE HISTORIQUE DES ATTRIBUTIONS & CYCLES DE VIE                            */
            /* ========================================================================= */
            <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-white">Journal d'Attribution & Événements Carnets</h4>
                  <p className="text-xs text-slate-400">
                    Traçabilité inviolable : Administrateur, Responsable, Date, Heure et Références.
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-mono">{carnetAuditLogs.length} entrées</span>
              </div>

              {carnetAuditLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Aucun événement d'attribution ou d'opération sur les carnets pour le moment.
                </div>
              ) : (
                <div className="space-y-2 font-mono">
                  {carnetAuditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl border border-slate-800 bg-slate-900/80 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              log.action === 'CARNET_GENERATED'
                                ? 'bg-blue-500/20 text-blue-300'
                                : log.action === 'CARNET_ASSIGNED_RESPONSABLE'
                                ? 'bg-purple-500/20 text-purple-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {log.action}
                          </span>
                          <span className="text-slate-300 font-sans font-semibold">Par {log.actorName}</span>
                        </div>
                        <span>{formatDateTime(log.timestamp)}</span>
                      </div>
                      <p className="text-slate-200 font-sans text-xs">{log.details}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ========================================================================= */
            /* VUE LISTE DES CARNETS                                                     */
            /* ========================================================================= */
            <div className="mt-4 flex-1 flex flex-col min-h-0 space-y-3">
              {/* Filtres et Recherche */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Référence C-2026-001, préfixe, responsable..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-2 pl-9 pr-3 text-xs text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="rounded-xl border border-slate-700 bg-slate-800/90 py-2 px-3 text-xs text-white focus:outline-hidden focus:border-emerald-500"
                >
                  <option value="ALL">Tous les statuts</option>
                  <option value="GENERATED">Généré (Stock Admin)</option>
                  <option value="ASSIGNED_TO_RESPONSIBLE">Attribué au Responsable</option>
                  <option value="CANCELLED">Annulé</option>
                </select>

                <div className="flex items-center justify-end text-xs text-slate-400">
                  <span>
                    {filteredCarnets.length} carnet(s) affiché(s) sur {carnets.length}
                  </span>
                </div>
              </div>

              {/* Tableau des Carnets */}
              <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">Référence Unique</th>
                      <th className="py-2.5 px-3">Taille (x3)</th>
                      <th className="py-2.5 px-3">Plage Physique</th>
                      <th className="py-2.5 px-3">Statut</th>
                      <th className="py-2.5 px-3">Responsable Attribué</th>
                      <th className="py-2.5 px-3">Date Génération</th>
                      <th className="py-2.5 px-3">Ventes</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredCarnets.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          Aucun carnet ne correspond à votre recherche.
                        </td>
                      </tr>
                    ) : (
                      filteredCarnets.map((c) => {
                        const cTickets = tickets.filter((t) => t.carnetId === c.id);
                        const soldCount = cTickets.filter((t) => t.status === 'SOLD').length;
                        return (
                          <tr key={c.id} className="hover:bg-slate-900/60 transition">
                            <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span>{c.carnetNumber}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="font-bold text-slate-200">{c.size} tickets</span>
                              <span className="text-[10px] text-slate-500 ml-1">
                                ({Math.ceil(c.size / 9)} p.)
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                              {c.seriesPrefix}-{String(c.startNumber).padStart(6, '0')} →{' '}
                              {String(c.endNumber).padStart(6, '0')}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {getCarnetStatusBadge(c.status)}
                            </td>
                            <td className="py-2.5 px-3 font-sans text-slate-300 whitespace-nowrap">
                              {c.assignedToResponsableName ? (
                                <span className="font-semibold text-purple-300">
                                  {c.assignedToResponsableName}
                                </span>
                              ) : (
                                <span className="text-slate-500 italic">Non assigné</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                              {formatDateTime(c.createdAt)}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  soldCount > 0
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'text-slate-500'
                                }`}
                              >
                                {soldCount} / {c.size}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1 font-sans">
                                {/* Voir les tickets du carnet */}
                                <button
                                  onClick={() => setSelectedCarnet(c)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                                  title="Consulter les tickets du carnet"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>

                                {/* Imprimer le PDF 9/page A4 */}
                                <button
                                  onClick={() => handlePrintPDF(c)}
                                  className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition"
                                  title="Imprimer le carnet en PDF (9 tickets par page A4 paysage)"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>

                                {/* Attribuer au responsable si non encore attribué */}
                                {!c.assignedToResponsableId && c.status !== 'CANCELLED' && (
                                  <button
                                    onClick={() => setAssignModalCarnet(c)}
                                    className="p-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 transition"
                                    title="Attribuer à un responsable"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Annuler le carnet */}
                                {c.status !== 'CANCELLED' && (
                                  <button
                                    onClick={() => setCancelModalCarnet(c)}
                                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition"
                                    title="Annuler le carnet"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Bouton de fermeture global en bas */}
          <div className="mt-4 border-t border-slate-800 pt-3 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
            >
              Fermer la fenêtre
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL ATTRIBUTION DU CARNET AU RESPONSABLE                                */}
      {/* ========================================================================= */}
      {assignModalCarnet && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-purple-400" />
                <h4 className="text-base font-bold text-white">Attribuer le Carnet au Responsable</h4>
              </div>
              <button
                onClick={() => setAssignModalCarnet(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs space-y-1">
                <p className="text-slate-400">Carnet à attribuer :</p>
                <p className="font-mono font-bold text-white text-sm">{assignModalCarnet.carnetNumber}</p>
                <p className="text-[11px] text-slate-500">
                  {assignModalCarnet.size} tickets (Numéros {assignModalCarnet.startNumber} à {assignModalCarnet.endNumber})
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Choisir le Responsable
                </label>
                <select
                  required
                  value={selectedResponsableId}
                  onChange={(e) => setSelectedResponsableId(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-sm text-white focus:border-purple-500 focus:outline-hidden"
                >
                  <option value="">-- Sélectionner un responsable actif --</option>
                  {responsables.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fullName} ({r.sectorName || 'Secteur'} • Tél: {r.phone || 'Non renseigné'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-purple-500/20 bg-purple-500/10 p-3 text-[11px] text-purple-300 space-y-1">
                <p className="font-bold">Règle de traçabilité automatique :</p>
                <p>• L’attribution enregistre automatiquement : carnet, responsable, administrateur, date et heure.</p>
                <p>• Tous les tickets non vendus passent immédiatement à l'état "ASSIGNED_TO_RESPONSIBLE".</p>
                <p>• Aucun bouton de confirmation de réception n'est requis pour le destinataire.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignModalCarnet(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !selectedResponsableId}
                  className="flex-1 rounded-xl bg-purple-600 py-2.5 text-xs font-bold text-white hover:bg-purple-500 shadow-md transition disabled:opacity-50"
                >
                  {actionLoading ? 'Attribution...' : 'Confirmer l’Attribution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL ANNULATION CARNET AVEC CONFIRMATION OBLIGATOIRE                     */}
      {/* ========================================================================= */}
      {cancelModalCarnet && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
                <h4 className="text-base font-bold text-white">Confirmation : Annuler le Carnet</h4>
              </div>
              <button
                onClick={() => setCancelModalCarnet(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCancelCarnetSubmit} className="mt-4 space-y-4">
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 space-y-1">
                <p className="font-bold">⚠️ Action irréversible :</p>
                <p>
                  Vous vous apprêtez à annuler le carnet{' '}
                  <strong className="text-white font-mono">{cancelModalCarnet.carnetNumber}</strong>.
                </p>
                <p>
                  Tous les tickets vierges ou non vendus de ce carnet seront marqués comme annulés et
                  invalidés pour la vente et le contrôle.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Motif obligatoire d’annulation
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancelCarnetReason}
                  onChange={(e) => setCancelCarnetReason(e.target.value)}
                  placeholder="Ex: Erreur d’impression, carnet égaré avant distribution..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white focus:border-rose-500 focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelModalCarnet(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Retour
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !cancelCarnetReason.trim()}
                  className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-500 shadow-md transition disabled:opacity-50"
                >
                  {actionLoading ? 'Annulation...' : 'Confirmer l’Annulation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL ANNULATION TICKET INDIVIDUEL AVEC CONFIRMATION OBLIGATOIRE          */}
      {/* ========================================================================= */}
      {cancelModalTicket && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-900 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
                <h4 className="text-base font-bold text-white">Confirmation : Annuler le Ticket</h4>
              </div>
              <button
                onClick={() => setCancelModalTicket(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCancelTicketSubmit} className="mt-4 space-y-4">
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 space-y-1">
                <p className="font-bold">⚠️ Action irréversible :</p>
                <p>
                  Annulation du ticket physique{' '}
                  <strong className="text-white font-mono">{cancelModalTicket.ticketNumber}</strong> (UUID:{' '}
                  {cancelModalTicket.id.slice(0, 16)}...).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Motif obligatoire d’annulation
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancelTicketReason}
                  onChange={(e) => setCancelTicketReason(e.target.value)}
                  placeholder="Ex: Ticket endommagé physiquement lors de la découpe..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white focus:border-rose-500 focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelModalTicket(null)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Retour
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !cancelTicketReason.trim()}
                  className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-500 shadow-md transition disabled:opacity-50"
                >
                  {actionLoading ? 'Annulation...' : 'Confirmer l’Annulation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL INSPECTION QR CODE DU TICKET                                       */}
      {/* ========================================================================= */}
      {inspectedTicket && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-cyan-400" />
                <h4 className="text-base font-bold text-white">Sécurité QR Code du Ticket</h4>
              </div>
              <button
                onClick={() => setInspectedTicket(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>NUMÉRO PHYSIQUE :</span>
                  <span className="text-white font-bold">{inspectedTicket.ticketNumber}</span>
                </div>
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>UUID INTERNE :</span>
                  <span className="text-white font-bold">{inspectedTicket.id}</span>
                </div>
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>CARNET :</span>
                  <span className="text-cyan-300 font-bold">{inspectedTicket.carnetNumber}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1">
                  Charge Utile Unique Encodée dans le QR Code (Anti-Falsification)
                </label>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-emerald-400 break-all overflow-x-auto">
                  {inspectedTicket.qrPayload}
                </div>
              </div>

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-[11px] text-cyan-300 space-y-1">
                <p className="font-bold">Garantie d'unicité et de cryptographie :</p>
                <p>
                  Le QR Code ne contient pas uniquement le numéro physique. Il encapsule un jeton unique,
                  l'UUID interne du ticket, l'identifiant du carnet et une signature cryptographique
                  permettant aux contrôleurs d'authentifier le titre hors-ligne.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInspectedTicket(null)}
                className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 mt-2"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CarnetGeneratorModal déclenchable */}
      <CarnetGeneratorModal
        isOpen={generatorModalOpen}
        onClose={() => setGeneratorModalOpen(false)}
      />
    </>
  );
};
