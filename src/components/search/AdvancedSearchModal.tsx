import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  FileSpreadsheet,
  FileText,
  X,
  Calendar,
  User as UserIcon,
  Shield,
  Layers,
  Car,
  Clock,
  ArrowUpDown,
  Download,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import {
  PeriodSelector,
  PeriodFilterState,
  filterItemByPeriod,
} from '../dashboard/DashboardCharts';
import {
  EnrichedTicketRow,
  exportFilteredTicketsToExcel,
  generateManagementReportPDF,
  formatPeriodLabel,
  formatTicketStatusLabel,
} from '../../utils/advancedExport';
import {
  formatDateTime,
  formatDate,
  formatPlateDisplay,
  formatFCFA,
  normalizePlate,
} from '../../utils/normalization';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import type { Ticket, TicketStatus } from '../../types';

interface AdvancedSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
  initialPlate?: string;
}

export const AdvancedSearchModal: React.FC<AdvancedSearchModalProps> = ({
  isOpen,
  onClose,
  initialQuery = '',
  initialPlate = '',
}) => {
  const { currentUser } = useAuth();
  const { tickets, sales, remises, controls, users, sectors } = useData();

  // ---------------------------------------------------------------------------
  // ÉTATS DES FILTRES SELON LE RÔLE
  // ---------------------------------------------------------------------------
  // 1. Recherche par numéro de ticket
  const [ticketQuery, setTicketQuery] = useState(initialQuery);

  // 2. Recherche par immatriculation
  const [plateQuery, setPlateQuery] = useState(initialPlate);

  // 3. Période (Responsable, Admin)
  const [period, setPeriod] = useState<PeriodFilterState>({ type: 'month' });

  // 4. Agent (Responsable pour ses agents, Admin pour tous)
  const [selectedAgentId, setSelectedAgentId] = useState<string>('ALL');

  // 5. Responsable (Admin uniquement)
  const [selectedResponsableId, setSelectedResponsableId] = useState<string>('ALL');

  // 6. Statut (Admin uniquement)
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Tri des résultats
  const [sortBy, setSortBy] = useState<'date' | 'ticket' | 'plate'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // État de chargement pour les exports
  const [exportLoading, setExportLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // LISTES DE RÉFÉRENCE SELON LE PÉRIMÈTRE DU RÔLE
  // ---------------------------------------------------------------------------
  const userRole = currentUser?.role || 'AGENT';

  // Agents accessibles
  const accessibleAgents = useMemo(() => {
    if (userRole === 'ADMINISTRATEUR') {
      return users.filter((u) => u.role === 'AGENT' && u.isActive);
    }
    if (userRole === 'RESPONSABLE') {
      return users.filter(
        (u) => u.role === 'AGENT' && u.isActive && (!currentUser?.sectorId || u.sectorId === currentUser.sectorId)
      );
    }
    return [];
  }, [users, userRole, currentUser]);

  // Responsables accessibles (Admin)
  const accessibleResponsables = useMemo(() => {
    if (userRole === 'ADMINISTRATEUR') {
      return users.filter((u) => u.role === 'RESPONSABLE' && u.isActive);
    }
    return [];
  }, [users, userRole]);

  // ---------------------------------------------------------------------------
  // INDEXATION RAPIDE POUR LES CORRÉLATIONS
  // ---------------------------------------------------------------------------
  const salesByTicketNumber = useMemo(() => {
    const map = new Map<string, typeof sales[0]>();
    for (const s of sales) {
      map.set(s.ticketNumber, s);
    }
    return map;
  }, [sales]);

  const remisesById = useMemo(() => {
    const map = new Map<string, typeof remises[0]>();
    for (const r of remises) {
      map.set(r.id, r);
    }
    return map;
  }, [remises]);

  const controlsByTicketNumber = useMemo(() => {
    const map = new Map<string, typeof controls[0]>();
    for (const c of controls) {
      // Garder le contrôle le plus récent
      if (!map.has(c.ticketNumber) || new Date(c.controlledAt) > new Date(map.get(c.ticketNumber)!.controlledAt)) {
        map.set(c.ticketNumber, c);
      }
    }
    return map;
  }, [controls]);

  // ---------------------------------------------------------------------------
  // APPLICATION DES RÈGLES DE SÉCURITÉ ET FILTRAGE MULTI-CRITÈRES
  // ---------------------------------------------------------------------------
  const filteredResults: EnrichedTicketRow[] = useMemo(() => {
    if (!currentUser) return [];

    return tickets
      .filter((t) => {
        // =====================================================================
        // SÉCURITÉ RÔLE : NE JAMAIS EXPOSER DES DONNÉES NON AUTORISÉES
        // =====================================================================
        if (userRole === 'AGENT') {
          // L'Agent ne voit STRICTEMENT que ses propres tickets
          if (t.assignedAgentId !== currentUser.id) return false;
        } else if (userRole === 'RESPONSABLE') {
          // Le Responsable ne voit que les tickets de son secteur
          if (currentUser.sectorId) {
            const matchesSector = t.sectorId === currentUser.sectorId;
            const matchesResp = t.assignedResponsableId === currentUser.id;
            if (!matchesSector && !matchesResp) return false;
          }
        } else if (userRole === 'CONTROLEUR') {
          // Le Contrôleur n'accède qu'aux tickets vendus/contrôlés ou concernés par un contrôle
          // Ne voit pas les stocks bruts non attribués
        }

        // =====================================================================
        // 1. RECHERCHE PAR NUMÉRO DE TICKET (AGENT, RESPONSABLE, ADMIN, CONTRÔLEUR)
        // =====================================================================
        if (ticketQuery.trim()) {
          const q = ticketQuery.trim().toLowerCase();
          const matchNum = t.ticketNumber.toLowerCase().includes(q);
          const matchCarnet = t.carnetNumber.toLowerCase().includes(q);
          const matchPhysical = t.physicalNumber?.toString().includes(q);
          if (!matchNum && !matchCarnet && !matchPhysical) return false;
        }

        // =====================================================================
        // 2. RECHERCHE PAR IMMATRICULATION (AGENT, RESPONSABLE, ADMIN, CONTRÔLEUR)
        // =====================================================================
        if (plateQuery.trim()) {
          const cleanSearchPlate = normalizePlate(plateQuery);
          const cleanTicketPlate = t.plateNumber ? normalizePlate(t.plateNumber) : '';
          const rawMatch = (t.plateNumber || '').toLowerCase().includes(plateQuery.trim().toLowerCase());
          const normMatch = cleanTicketPlate.includes(cleanSearchPlate);
          if (!rawMatch && !normMatch) return false;
        }

        // =====================================================================
        // 3. FILTRE PÉRIODE (RESPONSABLE, ADMIN)
        // =====================================================================
        if (userRole === 'RESPONSABLE' || userRole === 'ADMINISTRATEUR') {
          // Si le ticket est vendu, on filtre par sa date de vente ; sinon par sa date de création
          const dateToEvaluate = t.soldAt || t.createdAt;
          if (!filterItemByPeriod(dateToEvaluate, period)) {
            return false;
          }
        }

        // =====================================================================
        // 4. FILTRE PAR AGENT (RESPONSABLE, ADMIN)
        // =====================================================================
        if (userRole === 'RESPONSABLE' || userRole === 'ADMINISTRATEUR') {
          if (selectedAgentId !== 'ALL') {
            if (t.assignedAgentId !== selectedAgentId) return false;
          }
        }

        // =====================================================================
        // 5. FILTRE PAR RESPONSABLE (ADMIN UNIQUEMENT)
        // =====================================================================
        if (userRole === 'ADMINISTRATEUR') {
          if (selectedResponsableId !== 'ALL') {
            if (t.assignedResponsableId !== selectedResponsableId) return false;
          }
        }

        // =====================================================================
        // 6. FILTRE PAR STATUT (ADMIN UNIQUEMENT)
        // =====================================================================
        if (userRole === 'ADMINISTRATEUR') {
          if (selectedStatus !== 'ALL') {
            if (selectedStatus === 'SOLD_ALL') {
              if (t.status !== 'SOLD' && t.status !== 'CONTROLLED') return false;
            } else if (selectedStatus === 'UNREMITTED') {
              // Vendu mais non couvert par remise
              if (t.status !== 'SOLD' && t.status !== 'CONTROLLED') return false;
              if (t.coveredByRemiseId) return false;
            } else if (selectedStatus === 'REMITTED') {
              // Vendu et couvert par remise
              if (t.status !== 'SOLD' && t.status !== 'CONTROLLED') return false;
              if (!t.coveredByRemiseId) return false;
            } else if (t.status !== selectedStatus) {
              return false;
            }
          }
        }

        return true;
      })
      .map((t) => {
        const s = salesByTicketNumber.get(t.ticketNumber);
        const rId = t.coveredByRemiseId || s?.coveredByRemiseId;
        const r = rId ? remisesById.get(rId) : undefined;
        const c = controlsByTicketNumber.get(t.ticketNumber);
        return {
          ticket: t,
          sale: s,
          remise: r,
          lastControl: c,
        };
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'date') {
          const dateA = a.ticket.soldAt || a.ticket.createdAt;
          const dateB = b.ticket.soldAt || b.ticket.createdAt;
          cmp = new Date(dateA).getTime() - new Date(dateB).getTime();
        } else if (sortBy === 'ticket') {
          cmp = a.ticket.ticketNumber.localeCompare(b.ticket.ticketNumber);
        } else if (sortBy === 'plate') {
          cmp = (a.ticket.plateNumber || '').localeCompare(b.ticket.plateNumber || '');
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      });
  }, [
    tickets,
    currentUser,
    userRole,
    ticketQuery,
    plateQuery,
    period,
    selectedAgentId,
    selectedResponsableId,
    selectedStatus,
    sortBy,
    sortOrder,
    salesByTicketNumber,
    remisesById,
    controlsByTicketNumber,
  ]);

  // Réinitialiser les filtres
  const handleResetFilters = () => {
    setTicketQuery('');
    setPlateQuery('');
    setPeriod({ type: 'month' });
    setSelectedAgentId('ALL');
    setSelectedResponsableId('ALL');
    setSelectedStatus('ALL');
  };

  // Export Excel (ADMIN)
  const handleExcelExport = () => {
    if (userRole !== 'ADMINISTRATEUR') return;
    setExportLoading(true);
    try {
      exportFilteredTicketsToExcel(
        filteredResults,
        period,
        currentUser
      );
    } finally {
      setExportLoading(false);
    }
  };

  // Export PDF (ADMIN)
  const handlePdfExport = () => {
    if (userRole !== 'ADMINISTRATEUR') return;
    setExportLoading(true);
    try {
      generateManagementReportPDF(filteredResults, period, currentUser);
    } finally {
      setExportLoading(false);
    }
  };

  if (!isOpen) return null;

  // Calculs synthétiques pour le bandeau supérieur de résultats
  const totalFiltered = filteredResults.length;
  const soldCount = filteredResults.filter(
    (i) => i.ticket.status === 'SOLD' || i.ticket.status === 'CONTROLLED'
  ).length;
  const totalValue = soldCount * TICKET_PRICE_FCFA;
  const remittedCount = filteredResults.filter(
    (i) => i.remise || i.ticket.coveredByRemiseId
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-6xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in-50 zoom-in-95">
        {/* ===================================================================== */}
        {/* EN-TÊTE MODALE AVEC IDENTITÉ PORTUS                                    */}
        {/* ===================================================================== */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-black tracking-wider text-amber-400">
                  Moteur de Recherche Avancée & Exports
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded-full border border-slate-700">
                  {userRole}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                {userRole === 'ADMINISTRATEUR'
                  ? 'Recherche Globale, Filtrage Multi-Critères & Exports Officiels'
                  : userRole === 'RESPONSABLE'
                  ? 'Recherche Sectorielle par Ticket, Immatriculation, Agent & Période'
                  : 'Recherche Rapide par Ticket & Immatriculation'}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ===================================================================== */}
        {/* FORMULAIRE DES FILTRES ADAPTÉ AU RÔLE                                  */}
        {/* ===================================================================== */}
        <div className="p-4 sm:p-5 bg-slate-900 border-b border-slate-800 space-y-3.5 overflow-y-auto max-h-[38vh]">
          {/* Ligne 1 : Ticket & Immatriculation (TOUS LES RÔLES) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1. Ticket */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Numéro de Ticket ou Carnet
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={ticketQuery}
                  onChange={(e) => setTicketQuery(e.target.value)}
                  placeholder="Ex: VRD-000101, C001, 101..."
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:border-amber-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* 2. Immatriculation */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Immatriculation Camion
              </label>
              <div className="relative">
                <Car className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={plateQuery}
                  onChange={(e) => setPlateQuery(e.target.value)}
                  placeholder="Ex: 12-AB-34 ou 12AB34..."
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-9 pr-3 py-2 text-xs font-mono uppercase text-amber-300 placeholder-slate-500 focus:border-amber-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Ligne 2 : Filtres Temporels et Structurels (RESPONSABLE & ADMIN) */}
          {(userRole === 'RESPONSABLE' || userRole === 'ADMINISTRATEUR') && (
            <div className="pt-2 border-t border-slate-800/80 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                    Filtre par Période :
                  </span>
                </div>
                <PeriodSelector period={period} onChange={setPeriod} />
              </div>

              {/* Filtres Agent / Responsable / Statut */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Agent (Responsable et Admin) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Agent de Terrain
                  </label>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-hidden"
                  >
                    <option value="ALL">Tous les agents ({accessibleAgents.length})</option>
                    {accessibleAgents.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.fullName} {ag.sectorName ? `(${ag.sectorName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Responsable (Admin uniquement) */}
                {userRole === 'ADMINISTRATEUR' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Responsable de Secteur
                    </label>
                    <select
                      value={selectedResponsableId}
                      onChange={(e) => setSelectedResponsableId(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-hidden"
                    >
                      <option value="ALL">Tous les responsables ({accessibleResponsables.length})</option>
                      {accessibleResponsables.map((resp) => (
                        <option key={resp.id} value={resp.id}>
                          {resp.fullName} {resp.sectorName ? `(${resp.sectorName})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Statut du Ticket (Admin uniquement) */}
                {userRole === 'ADMINISTRATEUR' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Statut du Titre
                    </label>
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-hidden"
                    >
                      <option value="ALL">Tous les statuts</option>
                      <option value="SOLD_ALL">Tous vendus (Vendus + Contrôlés)</option>
                      <option value="UNREMITTED">Vendus NON REMIS (En attente de versement)</option>
                      <option value="REMITTED">Vendus et REMIS (Couverts)</option>
                      <option value="ASSIGNED_TO_AGENT">En main agent (Disponibles à la vente)</option>
                      <option value="AVAILABLE">En secteur (Responsable)</option>
                      <option value="GENERATED">Au siège (Généré non distribué)</option>
                      <option value="CANCELLED">Annulés</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bouton de réinitialisation rapide */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              {filteredResults.length} résultat{filteredResults.length > 1 ? 's' : ''} trouvé{filteredResults.length > 1 ? 's' : ''}
            </span>
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-400 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Réinitialiser les filtres</span>
            </button>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* BANDEAU SYNTHÈSE & BOUTONS D'EXPORT OFFICIELS (ADMIN UNIQUEMENT)      */}
        {/* ===================================================================== */}
        {userRole === 'ADMINISTRATEUR' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-2.5 bg-slate-950/60 border-b border-slate-800">
            {/* KPI récapitulatifs */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
                <span className="text-slate-400">Total : </span>
                <span className="font-bold text-white">{totalFiltered} tickets</span>
              </div>
              <div className="bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-lg">
                <span className="text-emerald-400">Ventes : </span>
                <span className="font-bold text-emerald-200">
                  {soldCount} ({formatFCFA(totalValue)})
                </span>
              </div>
              <div className="bg-blue-950/40 border border-blue-800/40 px-2.5 py-1 rounded-lg">
                <span className="text-blue-400">Remis : </span>
                <span className="font-bold text-blue-200">
                  {remittedCount} tickets ({formatFCFA(remittedCount * TICKET_PRICE_FCFA)})
                </span>
              </div>
            </div>

            {/* Actions d'export XLSX et PDF */}
            <div className="flex items-center gap-2">
              <button
                id="btn-export-excel-filtered"
                onClick={handleExcelExport}
                disabled={exportLoading || filteredResults.length === 0}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-emerald-950 hover:bg-emerald-500 disabled:opacity-50 transition cursor-pointer"
                title="Exporter les résultats actuels en fichier XLSX"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Excel (XLSX)</span>
              </button>

              <button
                id="btn-export-pdf-filtered"
                onClick={handlePdfExport}
                disabled={exportLoading || filteredResults.length === 0}
                className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-amber-950 hover:bg-amber-500 disabled:opacity-50 transition cursor-pointer"
                title="Générer le rapport de gestion PDF officiel imprimable"
              >
                <FileText className="w-4 h-4" />
                <span>Rapport PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* TABLEAU DES RÉSULTATS DÉTAILLÉS                                       */}
        {/* ===================================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {filteredResults.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-slate-400 mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-300">
                Aucun résultat ne correspond à votre recherche
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Vérifiez les critères saisis (numéro de ticket, immatriculation) ou élargissez la période de recherche.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-3">Ticket / Carnet</th>
                    <th className="py-3 px-3">Statut</th>
                    <th className="py-3 px-3">Immatriculation</th>
                    <th className="py-3 px-3">Agent</th>
                    {(userRole === 'ADMINISTRATEUR' || userRole === 'RESPONSABLE') && (
                      <th className="py-3 px-3">Responsable / Secteur</th>
                    )}
                    <th className="py-3 px-3">Date Vente</th>
                    <th className="py-3 px-3 text-right">Montant</th>
                    <th className="py-3 px-3">Contrôle Routier</th>
                    <th className="py-3 px-3">Remise Financière</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredResults.map(({ ticket: t, sale: s, remise: r, lastControl: c }) => {
                    const isSold = t.status === 'SOLD' || t.status === 'CONTROLLED';

                    return (
                      <tr
                        key={t.id}
                        className="hover:bg-slate-900/60 transition group text-slate-200"
                      >
                        {/* 1. Ticket & Carnet */}
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-white block">
                            {t.ticketNumber}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            Carnet: {t.carnetNumber}
                          </span>
                        </td>

                        {/* 2. Statut */}
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              t.status === 'SOLD' || t.status === 'CONTROLLED'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : t.status === 'CANCELLED'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : t.status === 'ASSIGNED_TO_AGENT'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {formatTicketStatusLabel(t.status)}
                          </span>
                        </td>

                        {/* 3. Immatriculation */}
                        <td className="py-2.5 px-3">
                          {t.plateNumber ? (
                            <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                              {formatPlateDisplay(t.plateNumber)}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>

                        {/* 4. Agent */}
                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-slate-200">
                            {t.assignedAgentName || s?.agentName || '—'}
                          </p>
                          {t.driverPhone && (
                            <p className="text-[10px] text-slate-500">Chauffeur: {t.driverPhone}</p>
                          )}
                        </td>

                        {/* 5. Responsable / Secteur */}
                        {(userRole === 'ADMINISTRATEUR' || userRole === 'RESPONSABLE') && (
                          <td className="py-2.5 px-3">
                            <p className="text-slate-300">
                              {t.assignedResponsableName || '—'}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {t.sectorName || '—'}
                            </p>
                          </td>
                        )}

                        {/* 6. Date Vente */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {t.soldAt ? (
                            <div>
                              <p className="font-medium text-slate-300">{formatDate(t.soldAt)}</p>
                              <p className="text-[10px] text-slate-500">
                                {t.soldAt.includes('T') ? t.soldAt.split('T')[1].slice(0, 5) : ''}
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>

                        {/* 7. Montant */}
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          {isSold ? (
                            <span className="text-emerald-400">5 000 F</span>
                          ) : (
                            <span className="text-slate-500">0 F</span>
                          )}
                        </td>

                        {/* 8. Contrôle */}
                        <td className="py-2.5 px-3">
                          {t.controlCount > 0 || c ? (
                            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <div>
                                <span className="text-[11px]">Oui ({t.controlCount || 1}x)</span>
                                {c?.controleurName && (
                                  <p className="text-[9px] text-slate-400 truncate max-w-[120px]">
                                    Par {c.controleurName}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-500">Non contrôlé</span>
                          )}
                        </td>

                        {/* 9. Remise */}
                        <td className="py-2.5 px-3">
                          {isSold ? (
                            r || t.coveredByRemiseId ? (
                              <div className="text-emerald-400">
                                <span className="font-bold text-[11px] block">Couverte</span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {r ? r.reference : 'Remis'}
                                </span>
                              </div>
                            ) : (
                              <div className="text-rose-400">
                                <span className="font-bold text-[11px] block">À remettre</span>
                                <span className="text-[10px] text-slate-400">5 000 FCFA dus</span>
                              </div>
                            )
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ===================================================================== */}
        {/* PIED DE MODALE                                                        */}
        {/* ===================================================================== */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-950 text-xs">
          <div className="text-slate-400">
            Affichage de <span className="font-bold text-white">{filteredResults.length}</span> résultat(s)
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
