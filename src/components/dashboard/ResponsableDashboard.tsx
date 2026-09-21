import React, { useState, useMemo, useEffect } from 'react';
import {
  UserPlus,
  HandCoins,
  Ticket as TicketIcon,
  Banknote,
  AlertTriangle,
  History,
  FileSpreadsheet,
  CheckCircle2,
  ShieldAlert,
  Users,
  Receipt,
  ArrowRight,
  TrendingUp,
  Search,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from './StatCard';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import { formatFCFA, formatPlateDisplay } from '../../utils/normalization';
import { EntityRankingChart, EntityRankItem } from './DashboardCharts';

// Modals
import { TicketAssignmentModal } from '../tickets/TicketAssignmentModal';
import { RemiseFormModal } from '../remises/RemiseFormModal';
import { RemisesListModal } from '../remises/RemisesListModal';
import { TicketListModal } from '../tickets/TicketListModal';
import { SalesListModal } from '../sales/SalesListModal';
import { ControlsListModal } from '../controls/ControlsListModal';
import { VentesARemettreModal } from '../remises/VentesARemettreModal';
import { AdvancedSearchModal } from '../search/AdvancedSearchModal';
import { ExpensesModule } from '../expenses/ExpensesModule';
import { AgentDirectoryView } from '../agents/AgentDirectoryView';

export const ResponsableDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { users, tickets, sales, remises, alerts, fraudReports } = useData();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'agents' | 'expenses'>('dashboard');

  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [remiseModalOpen, setRemiseModalOpen] = useState(false);
  const [selectedAgentForRemise, setSelectedAgentForRemise] = useState<string | undefined>();
  const [ventesARemettreOpen, setVentesARemettreOpen] = useState(false);
  const [selectedAgentForVentes, setSelectedAgentForVentes] = useState<string | undefined>();
  const [remisesListOpen, setRemisesListOpen] = useState(false);
  const [ticketsListOpen, setTicketsListOpen] = useState(false);
  const [salesListOpen, setSalesListOpen] = useState(false);
  const [controlsListOpen, setControlsListOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  useEffect(() => {
    const handleNotificationClicked = (e: Event) => {
      const customEvent = e as CustomEvent;
      const notification = customEvent.detail;
      if (!notification) return;

      const type = notification.type;
      if (type === 'ASSIGNMENT') {
        setAssignmentModalOpen(true);
      } else if (type === 'REMITTANCE' || type === 'FINANCIAL_ALERT') {
        setRemiseModalOpen(true);
      }
    };
    window.addEventListener('portus-notification-clicked', handleNotificationClicked);
    return () => window.removeEventListener('portus-notification-clicked', handleNotificationClicked);
  }, []);

  // ---------------------------------------------------------------------------
  // DONNÉES STRICTEMENT LIMITÉES AU SECTEUR DU RESPONSABLE
  // ---------------------------------------------------------------------------
  const sectorId = currentUser?.sectorId;

  // Agents du secteur
  const sectorAgents = useMemo(() => {
    return users.filter(
      (u) =>
        u.role === 'AGENT' &&
        u.isActive &&
        (!sectorId || u.sectorId === sectorId)
    );
  }, [users, sectorId]);

  // Tickets du secteur
  const sectorTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (t.assignedResponsableId === currentUser?.id) return true;
      if (sectorId && t.sectorId === sectorId) return true;
      return false;
    });
  }, [tickets, currentUser, sectorId]);

  // 1. Tickets disponibles (prêts à attribuer ou en main des agents)
  const availableInSector = useMemo(() => {
    return sectorTickets.filter(
      (t) =>
        t.status === 'ASSIGNED_TO_RESPONSIBLE' ||
        t.status === 'AVAILABLE' ||
        t.status === 'ASSIGNED_TO_AGENT'
    );
  }, [sectorTickets]);

  const readyToAssignCount = useMemo(() => {
    return sectorTickets.filter(
      (t) =>
        t.status === 'ASSIGNED_TO_RESPONSIBLE' ||
        t.status === 'AVAILABLE'
    ).length;
  }, [sectorTickets]);

  const inAgentHandsCount = useMemo(() => {
    return sectorTickets.filter((t) => t.status === 'ASSIGNED_TO_AGENT').length;
  }, [sectorTickets]);

  // 2. Tickets vendus du secteur
  const sectorSoldTickets = useMemo(() => {
    return sectorTickets.filter(
      (t) => t.status === 'SOLD' || t.status === 'CONTROLLED'
    );
  }, [sectorTickets]);
  const ticketsSold = sectorSoldTickets.length;

  // 3. Valeur des ventes
  const totalSalesAmount = ticketsSold * TICKET_PRICE_FCFA;

  // 4. Remises du secteur
  const sectorRemises = useMemo(() => {
    return remises.filter(
      (r) =>
        r.responsableId === currentUser?.id ||
        (sectorId && r.sectorId === sectorId)
    );
  }, [remises, currentUser, sectorId]);
  const totalRemittedAmount = sectorRemises.reduce((sum, r) => sum + r.amount, 0);

  // 5. Solde du secteur (recettes restant à récupérer)
  const remainingSectorBalance = Math.max(0, totalSalesAmount - totalRemittedAmount);
  const sectorEcart = Math.max(0, totalRemittedAmount - totalSalesAmount);

  // 6. Alertes financières sur les agents du secteur
  const sectorAlerts = useMemo(() => {
    return alerts.filter((a) => !sectorId || a.sectorId === sectorId);
  }, [alerts, sectorId]);

  // 7. Ventes non couvertes (tickets vendus sans remise associée)
  const unremittedTickets = useMemo(() => {
    return sectorSoldTickets.filter((t) => !t.coveredByRemiseId);
  }, [sectorSoldTickets]);

  // 8. Ventes par agent du secteur (données pour le graphique de classement)
  const salesByAgentItems: EntityRankItem[] = useMemo(() => {
    return sectorAgents.map((ag) => {
      const agTickets = sectorTickets.filter((t) => t.assignedAgentId === ag.id);
      const count = agTickets.filter(
        (t) => t.status === 'SOLD' || t.status === 'CONTROLLED'
      ).length;
      const amount = count * TICKET_PRICE_FCFA;

      const agRemises = sectorRemises.filter((r) => r.agentId === ag.id);
      const remitted = agRemises.reduce((sum, r) => sum + r.amount, 0);

      return {
        id: ag.id,
        name: ag.fullName,
        detail: ag.phone,
        count,
        amount,
        remitted,
      };
    }).sort((a, b) => b.count - a.count);
  }, [sectorAgents, sectorTickets, sectorRemises]);

  const handleOpenRemiseForAgent = (agentId: string) => {
    setSelectedAgentForRemise(agentId);
    setRemiseModalOpen(true);
  };

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 space-y-5">
      {/* Navigation Onglets */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 flex-wrap">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
            activeTab === 'dashboard'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-950'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Tableau de Bord</span>
        </button>
        <button
          onClick={() => setActiveTab('agents')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
            activeTab === 'agents'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Suivi de mes Agents</span>
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
            activeTab === 'expenses'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>💰 Dépenses</span>
        </button>
      </div>

      {activeTab === 'expenses' ? (
        <ExpensesModule />
      ) : activeTab === 'agents' ? (
        <AgentDirectoryView viewMode="RESPONSABLE" />
      ) : (
        <div className="space-y-5">
      {/* ========================================================================= */}
      {/* EN-TÊTE DU TABLEAU DE BORD RESPONSABLE                                    */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase font-black tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
              Espace Secteur
            </span>
            <span className="rounded bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-300">
              {currentUser?.sectorName || 'Secteur Non Assigné'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
            Tableau de Bord Responsable
          </h2>
          <p className="text-xs text-slate-400">
            Gestion du stock du secteur, distribution aux agents et encaissement des remises.
          </p>
        </div>

        {/* Boutons d'actions rapides */}
        <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
          <button
            onClick={() => setSearchModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-amber-500/40 px-3.5 py-2 text-xs font-bold text-amber-300 hover:bg-slate-700 transition cursor-pointer shadow-xs"
            title="Recherche par ticket, immatriculation, agent ou période"
          >
            <Search className="w-4 h-4 text-amber-400" />
            <span>Recherches</span>
          </button>
          <button
            onClick={() => {
              setSelectedAgentForVentes(undefined);
              setVentesARemettreOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 px-3.5 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition cursor-pointer"
          >
            <Receipt className="w-4 h-4" />
            <span>Ventes Non Couvertes ({unremittedTickets.length})</span>
          </button>
          <button
            onClick={() => setAssignmentModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-blue-950 hover:bg-blue-500 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Distribuer Tickets</span>
          </button>
          <button
            onClick={() => {
              setSelectedAgentForRemise(undefined);
              setRemiseModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-950 hover:bg-emerald-500 transition cursor-pointer"
          >
            <HandCoins className="w-4 h-4" />
            <span>Enregistrer Remise</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ALERTES FINANCIÈRES DU SECTEUR                                            */}
      {/* ========================================================================= */}
      {sectorAlerts.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4" />
              <span>Avertissements de Remises ({sectorAlerts.length} agent(s) en vigilance)</span>
            </div>
            <span className="text-[11px] text-amber-300/80">Dès 10 tickets vendus non versés</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {sectorAlerts.map((al) => (
              <div
                key={al.id}
                className="rounded-xl border border-amber-500/30 bg-slate-900/90 p-3 text-xs flex items-center justify-between"
              >
                <div>
                  <p className="font-bold text-white">{al.agentName}</p>
                  <p className="text-[11px] text-amber-300 font-semibold mt-0.5">
                    {al.unremittedTicketsCount} tickets non versés ({formatFCFA(al.unremittedAmount)})
                  </p>
                </div>
                <button
                  onClick={() => handleOpenRemiseForAgent(al.agentId)}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500 transition cursor-pointer"
                >
                  Encaisser
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8 KPIS OBLIGATOIRES RESPONSABLE (SECTEUR UNIQUEMENT)                      */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {/* 1. Tickets Disponibles */}
        <StatCard
          title="Tickets Disponibles"
          value={availableInSector.length}
          subtitle={`${readyToAssignCount} prêts • ${inAgentHandsCount} en main`}
          icon={<TicketIcon className="w-4 h-4" />}
          variant="blue"
          onClick={() => setTicketsListOpen(true)}
        />

        {/* 2. Tickets Vendus */}
        <StatCard
          title="Tickets Vendus"
          value={ticketsSold}
          subtitle="Total secteur validé"
          icon={<CheckCircle2 className="w-4 h-4" />}
          variant="emerald"
          onClick={() => setSalesListOpen(true)}
        />

        {/* 3. Valeur Ventes */}
        <StatCard
          title="Valeur des Ventes"
          value={formatFCFA(totalSalesAmount)}
          subtitle={`${ticketsSold} × 5 000 FCFA`}
          icon={<Receipt className="w-4 h-4" />}
          variant="emerald"
          onClick={() => setSalesListOpen(true)}
        />

        {/* 4. Remises */}
        <StatCard
          title="Remises Encaissées"
          value={formatFCFA(totalRemittedAmount)}
          subtitle={`${sectorRemises.length} versement(s)`}
          icon={<HandCoins className="w-4 h-4" />}
          variant="blue"
          onClick={() => setRemisesListOpen(true)}
        />

        {/* 5. Solde */}
        <StatCard
          title="Solde à Récupérer"
          value={formatFCFA(remainingSectorBalance)}
          subtitle={sectorEcart > 0 ? `Écart : +${formatFCFA(sectorEcart)}` : 'À verser par les agents'}
          icon={<AlertTriangle className="w-4 h-4" />}
          variant={remainingSectorBalance > 0 ? 'amber' : 'slate'}
          onClick={() => {
            setSelectedAgentForVentes(undefined);
            setVentesARemettreOpen(true);
          }}
        />

        {/* 6. Alertes */}
        <StatCard
          title="Alertes Financières"
          value={sectorAlerts.length}
          subtitle="Agents avec solde élevé"
          icon={<AlertTriangle className="w-4 h-4" />}
          variant={sectorAlerts.length > 0 ? 'amber' : 'slate'}
          onClick={() => {
            setSelectedAgentForVentes(undefined);
            setVentesARemettreOpen(true);
          }}
        />

        {/* 7. Agents */}
        <StatCard
          title="Agents du Secteur"
          value={sectorAgents.length}
          subtitle="Vendeurs actifs"
          icon={<Users className="w-4 h-4" />}
          variant="slate"
          onClick={() => setAssignmentModalOpen(true)}
        />

        {/* 8. Ventes Non Couvertes */}
        <StatCard
          title="Ventes Non Couvertes"
          value={unremittedTickets.length}
          subtitle={`Valeur : ${formatFCFA(unremittedTickets.length * TICKET_PRICE_FCFA)}`}
          icon={<Receipt className="w-4 h-4" />}
          variant={unremittedTickets.length > 0 ? 'amber' : 'slate'}
          onClick={() => {
            setSelectedAgentForVentes(undefined);
            setVentesARemettreOpen(true);
          }}
        />
      </div>

      {/* ========================================================================= */}
      {/* GRAPHIQUE DES VENTES PAR AGENT DU SECTEUR                                 */}
      {/* ========================================================================= */}
      <EntityRankingChart
        title="Ventes par Agent du Secteur"
        items={salesByAgentItems}
        emptyMessage="Aucun agent n'a encore enregistré de ventes dans ce secteur."
        showRemitted={true}
      />

      {/* ========================================================================= */}
      {/* TABLEAU DES AGENTS DU SECTEUR & ÉTAT FINANCIER DÉTAILLÉ                   */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">
              Agents du Secteur ({sectorAgents.length})
            </h3>
            <p className="text-xs text-slate-400">
              Suivi individuel des tickets distribués, vendus et des soldes financiers
            </p>
          </div>
          <button
            onClick={() => setRemisesListOpen(true)}
            className="text-xs text-blue-400 hover:underline font-semibold"
          >
            Registre des Remises ({sectorRemises.length})
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400 bg-slate-900/70">
              <tr>
                <th className="py-2.5 px-3">Agent</th>
                <th className="py-2.5 px-3">Téléphone</th>
                <th className="py-2.5 px-3 text-center">En Main (Dispo)</th>
                <th className="py-2.5 px-3 text-center">Tickets Vendus</th>
                <th className="py-2.5 px-3 text-right">Montant Attendu</th>
                <th className="py-2.5 px-3 text-right">Montant Remis</th>
                <th className="py-2.5 px-3 text-right">Solde Restant</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {sectorAgents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
                    Aucun agent affecté à ce secteur.
                  </td>
                </tr>
              ) : (
                sectorAgents.map((ag) => {
                  const agTickets = sectorTickets.filter((t) => t.assignedAgentId === ag.id);
                  const availableCount = agTickets.filter((t) => t.status === 'ASSIGNED_TO_AGENT').length;
                  const soldCount = agTickets.filter((t) => t.status === 'SOLD' || t.status === 'CONTROLLED').length;
                  const totalEarned = soldCount * TICKET_PRICE_FCFA;

                  const agRemises = sectorRemises.filter((r) => r.agentId === ag.id);
                  const remitted = agRemises.reduce((sum, r) => sum + r.amount, 0);
                  const balance = Math.max(0, totalEarned - remitted);
                  const hasAlert = Math.ceil(balance / TICKET_PRICE_FCFA) >= 10;

                  return (
                    <tr key={ag.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3 px-3 font-sans font-bold text-white whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{ag.fullName}</span>
                          {hasAlert && (
                            <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-bold">
                              ALERTE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-400 whitespace-nowrap font-sans">
                        {ag.phone || '—'}
                      </td>
                      <td className="py-3 px-3 text-center text-blue-300 font-bold whitespace-nowrap">
                        {availableCount}
                      </td>
                      <td className="py-3 px-3 text-center text-emerald-400 font-bold whitespace-nowrap">
                        {soldCount}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-300 whitespace-nowrap">
                        {formatFCFA(totalEarned)}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-400 font-bold whitespace-nowrap">
                        {formatFCFA(remitted)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold whitespace-nowrap">
                        <span className={balance > 0 ? 'text-amber-400' : 'text-slate-400'}>
                          {formatFCFA(balance)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap font-sans">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedAgentForVentes(ag.id);
                              setVentesARemettreOpen(true);
                            }}
                            className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                          >
                            Ventes
                          </button>
                          <button
                            onClick={() => handleOpenRemiseForAgent(ag.id)}
                            className="rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-600/30 transition cursor-pointer"
                          >
                            Encaisser
                          </button>
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

      {/* Modals Responsable */}
      <TicketAssignmentModal
        isOpen={assignmentModalOpen}
        onClose={() => setAssignmentModalOpen(false)}
      />
      <RemiseFormModal
        isOpen={remiseModalOpen}
        onClose={() => setRemiseModalOpen(false)}
        preselectedAgentId={selectedAgentForRemise}
      />
      <VentesARemettreModal
        isOpen={ventesARemettreOpen}
        onClose={() => setVentesARemettreOpen(false)}
        preselectedAgentId={selectedAgentForVentes}
      />
      <RemisesListModal
        isOpen={remisesListOpen}
        onClose={() => setRemisesListOpen(false)}
        onOpenNewRemise={() => {
          setRemisesListOpen(false);
          setRemiseModalOpen(true);
        }}
      />
      <TicketListModal
        isOpen={ticketsListOpen}
        onClose={() => setTicketsListOpen(false)}
      />
      <SalesListModal
        isOpen={salesListOpen}
        onClose={() => setSalesListOpen(false)}
      />
      <ControlsListModal
        isOpen={controlsListOpen}
        onClose={() => setControlsListOpen(false)}
      />
      <AdvancedSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
        </div>
      )}
    </div>
  );
};
