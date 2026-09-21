import React, { useState, useMemo, useEffect } from 'react';
import {
  ShoppingCart,
  Ticket as TicketIcon,
  Banknote,
  AlertTriangle,
  RefreshCw,
  Clock,
  CheckCircle2,
  Bell,
  BellRing,
  Search,
  Filter,
  Eye,
  Check,
  Tag,
  Car,
  Calendar,
  Receipt,
  History,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from './StatCard';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import { formatFCFA, formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import type { Ticket } from '../../types';

// Modales
import { SaleFormModal } from '../sales/SaleFormModal';
import { SalesListModal } from '../sales/SalesListModal';
import { TicketListModal } from '../tickets/TicketListModal';
import { VentesARemettreModal } from '../remises/VentesARemettreModal';
import { AdvancedSearchModal } from '../search/AdvancedSearchModal';

export const AgentDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    tickets,
    sales,
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    getAgentStats,
    pendingSyncCount,
    lastSyncedSaleNumber,
    syncOfflineQueue,
    isOnline,
    isSyncing,
  } = useData();

  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [salesListOpen, setSalesListOpen] = useState(false);
  const [ticketsListOpen, setTicketsListOpen] = useState(false);
  const [ventesModalOpen, setVentesModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [selectedTicketForSale, setSelectedTicketForSale] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handleNotificationClicked = (e: Event) => {
      const customEvent = e as CustomEvent;
      const notification = customEvent.detail;
      if (!notification) return;

      const type = notification.type;
      if (type === 'ASSIGNMENT' || type === 'REMITTANCE' || type === 'SALE' || type === 'FINANCIAL_ALERT') {
        setVentesModalOpen(true);
      }
    };
    window.addEventListener('portus-notification-clicked', handleNotificationClicked);
    return () => window.removeEventListener('portus-notification-clicked', handleNotificationClicked);
  }, []);

  // Filtrage des tickets personnels de l'agent
  // RÈGLE STRICTE : L'agent ne voit QUE ses propres tickets !
  const [ticketFilterTab, setTicketFilterTab] = useState<'ALL' | 'AVAILABLE' | 'SOLD'>('ALL');
  const [ticketSearch, setTicketSearch] = useState('');

  const stats = currentUser
    ? getAgentStats(currentUser.id)
    : {
        assignedCount: 0,
        availableCount: 0,
        soldCount: 0,
        ticketsSold: 0,
        totalSalesAmount: 0,
        expectedAmount: 0,
        remittedAmount: 0,
        remainingBalance: 0,
        ecart: 0,
        unremittedTicketsCount: 0,
      };

  const hasThresholdAlert = stats.unremittedTicketsCount >= 10;

  // Ventes personnelles de l'agent
  const agentSales = useMemo(() => {
    return sales.filter((s) => s.agentId === currentUser?.id);
  }, [sales, currentUser]);

  // Notifications personnelles de l'agent (triées par date décroissante)
  const agentNotifications = useMemo(() => {
    if (!currentUser) return [];
    return notifications.filter((n) => n.recipientId === currentUser.id);
  }, [notifications, currentUser]);

  const unreadNotifications = useMemo(() => {
    return agentNotifications.filter((n) => !n.isRead);
  }, [agentNotifications]);

  // RÈGLE MÉTIER : L'agent ne voit STRICTEMENT que ses propres tickets
  const myTickets = useMemo(() => {
    if (!currentUser) return [];
    return tickets.filter((t) => t.assignedAgentId === currentUser.id);
  }, [tickets, currentUser]);

  // Tickets disponibles (en main, prêts à être vendus)
  const availableTickets = useMemo(() => {
    return myTickets.filter((t) => t.status === 'ASSIGNED_TO_AGENT');
  }, [myTickets]);

  // Tickets vendus (ou contrôlés)
  const soldTickets = useMemo(() => {
    return myTickets.filter((t) => t.status === 'SOLD' || t.status === 'CONTROLLED');
  }, [myTickets]);

  // Tickets restants (stock disponible restant en main)
  const remainingTicketsCount = availableTickets.length;

  // Filtrage pour l'affichage de la table
  const displayedTickets = useMemo(() => {
    return myTickets.filter((t) => {
      if (ticketFilterTab === 'AVAILABLE') {
        if (t.status !== 'ASSIGNED_TO_AGENT') return false;
      } else if (ticketFilterTab === 'SOLD') {
        if (t.status !== 'SOLD' && t.status !== 'CONTROLLED') return false;
      }

      if (ticketSearch) {
        const term = ticketSearch.toLowerCase();
        const matchNum = t.ticketNumber.toLowerCase().includes(term);
        const matchCarnet = t.carnetNumber.toLowerCase().includes(term);
        const matchPlate = t.plateNumber?.toLowerCase().includes(term);
        const matchPhysical = t.physicalNumber?.toString().includes(term);
        return matchNum || matchCarnet || matchPlate || matchPhysical;
      }
      return true;
    });
  }, [myTickets, ticketFilterTab, ticketSearch]);

  const handleStartSale = (ticketId?: string) => {
    setSelectedTicketForSale(ticketId);
    setSaleModalOpen(true);
  };

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 space-y-5">
      {/* ========================================================================= */}
      {/* NOTIFICATIONS PERSISTANTES DE L'AGENT                                     */}
      {/* ========================================================================= */}
      {unreadNotifications.length > 0 && (
        <div className="rounded-2xl border border-blue-500/40 bg-gradient-to-r from-blue-950/90 via-slate-900 to-slate-900 p-4 shadow-xl text-blue-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <BellRing className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-blue-400">
                  Nouvelles Attributions & Notifications
                </span>
                <span className="ml-2 inline-flex items-center rounded-full bg-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                  {unreadNotifications.length} non lue(s)
                </span>
              </div>
            </div>
            {currentUser && (
              <button
                onClick={() => markAllNotificationsAsRead(currentUser.id)}
                className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          <div className="space-y-2">
            {unreadNotifications.slice(0, 3).map((notif) => (
              <div
                key={notif.id}
                className="flex items-center justify-between p-3 rounded-xl border border-blue-500/20 bg-blue-950/40 text-xs gap-3"
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span>{notif.message}</span>
                  </div>
                  <p className="text-[11px] text-blue-300/80">
                    {notif.metadata?.assignedBy ? `Attribué par : ${notif.metadata.assignedBy}` : ''} • {formatDateTime(notif.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => markNotificationAsRead(notif.id)}
                  className="shrink-0 flex items-center gap-1 rounded-lg bg-blue-600/30 hover:bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition border border-blue-500/40"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Compris</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BANNIÈRE DE STATUT DE SYNCHRONISATION HORS LIGNE / EN LIGNE               */}
      {/* ========================================================================= */}
      {lastSyncedSaleNumber && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-3.5 flex items-center justify-between animate-fadeIn text-emerald-300">
          <div className="flex items-center gap-2 font-bold text-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>🟢 VENTE SYNCHRONISÉE AVEC SUCCÈS ({lastSyncedSaleNumber})</span>
          </div>
        </div>
      )}

      {pendingSyncCount > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/15 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-amber-200">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
            <div>
              <p className="text-xs font-bold">
                🟠 {pendingSyncCount} VENTE(S) HORS LIGNE ENREGISTRÉE(S) — SYNCHRONISATION EN ATTENTE
              </p>
              <p className="text-[11px] text-amber-300/80">
                Vos ventes sont sécurisées localement. La date originale de vente sera préservée.
              </p>
            </div>
          </div>
          {isOnline && (
            <button
              onClick={syncOfflineQueue}
              disabled={isSyncing}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-500 transition shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Synchronisation...' : 'Synchroniser maintenant'}</span>
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* GROS BOUTON MOBILE PRINCIPAL : NOUVELLE VENTE TICKET 5 000 FCFA           */}
      {/* ========================================================================= */}
      <div className="rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/80 via-slate-900 to-slate-900 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Guichet Vente Terrain
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchModalOpen(true)}
              className="text-[11px] font-bold text-amber-300 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg border border-amber-500/40 flex items-center gap-1 transition"
              title="Rechercher par ticket ou immatriculation"
            >
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span>Rechercher</span>
            </button>
            <span className="text-xs text-slate-400">
              {stats.availableCount} ticket(s) disponible(s)
            </span>
          </div>
        </div>

        <button
          id="btn-agent-new-sale"
          onClick={() => handleStartSale()}
          disabled={stats.availableCount === 0}
          className="w-full flex items-center justify-center gap-3 rounded-2xl bg-emerald-600 py-4 px-6 text-base sm:text-lg font-black tracking-wide text-white shadow-xl shadow-emerald-950 hover:bg-emerald-500 active:scale-98 transition disabled:opacity-50 cursor-pointer"
        >
          <ShoppingCart className="w-6 h-6" />
          <span>NOUVELLE VENTE TICKET ({formatFCFA(TICKET_PRICE_FCFA)})</span>
        </button>

        {stats.availableCount === 0 && (
          <p className="text-center text-xs text-rose-400 font-semibold">
            Stock épuisé. Veuillez contacter votre responsable de secteur pour recevoir de nouveaux tickets.
          </p>
        )}
      </div>

      {/* ========================================================================= */}
      {/* AVERTISSEMENT REMISE FINANCIÈRE (NON BLOQUANT POUR LA VENTE)              */}
      {/* ========================================================================= */}
      {stats.unremittedTicketsCount >= 10 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-1 text-xs text-amber-200">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <AlertTriangle className="w-4 h-4" />
            <span>RAPPEL : VERSEMENT REQUIS AUPRÈS DU RESPONSABLE</span>
          </div>
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            Vous avez atteint <strong>{stats.unremittedTicketsCount} tickets vendus non encore régularisés</strong> (Solde dû :{' '}
            <strong>{formatFCFA(stats.remainingBalance)}</strong>). Veuillez effectuer votre versement dès que possible.
          </p>
          <p className="text-[10px] text-emerald-400 font-semibold pt-1">
            ✓ Vous pouvez continuer vos ventes normalement sur le terrain.
          </p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8 KPIS PERSONNELS AGENT (OPTIMISÉS SMARTPHONE ET RESPONSIVE)               */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {/* 1. Tickets Disponibles */}
        <StatCard
          title="Tickets Disponibles"
          value={availableTickets.length}
          subtitle="Prêts à être vendus"
          icon={<TicketIcon className="w-4 h-4" />}
          variant="emerald"
          onClick={() => setTicketFilterTab('AVAILABLE')}
        />

        {/* 2. Tickets Vendus */}
        <StatCard
          title="Tickets Vendus"
          value={soldTickets.length}
          subtitle="Ventes enregistrées"
          icon={<CheckCircle2 className="w-4 h-4" />}
          variant="blue"
          onClick={() => setTicketFilterTab('SOLD')}
        />

        {/* 3. Valeur des Ventes */}
        <StatCard
          title="Valeur des Ventes"
          value={formatFCFA(stats.expectedAmount)}
          subtitle={`${soldTickets.length} × 5 000 FCFA`}
          icon={<Receipt className="w-4 h-4" />}
          variant="emerald"
          onClick={() => setTicketFilterTab('SOLD')}
        />

        {/* 4. Montant Remis */}
        <StatCard
          title="Montant Remis"
          value={formatFCFA(stats.remittedAmount)}
          subtitle="Versé au responsable"
          icon={<Banknote className="w-4 h-4" />}
          variant="blue"
        />

        {/* 5. Solde Restant */}
        <StatCard
          title="Solde Restant"
          value={formatFCFA(stats.remainingBalance)}
          subtitle={stats.ecart > 0 ? `Écart : +${formatFCFA(stats.ecart)}` : 'À régulariser'}
          icon={<AlertTriangle className="w-4 h-4" />}
          variant={stats.remainingBalance > 0 ? 'amber' : 'slate'}
          onClick={() => setVentesModalOpen(true)}
        />

        {/* 6. Ventes à Remettre */}
        <StatCard
          title="Ventes à Remettre"
          value={stats.unremittedTicketsCount}
          subtitle={`Valeur : ${formatFCFA(stats.unremittedTicketsCount * TICKET_PRICE_FCFA)}`}
          icon={<Receipt className="w-4 h-4" />}
          variant={stats.unremittedTicketsCount > 0 ? 'amber' : 'slate'}
          onClick={() => setVentesModalOpen(true)}
        />

        {/* 7. Alertes */}
        <StatCard
          title="Alertes Financières"
          value={hasThresholdAlert ? 1 : 0}
          subtitle={hasThresholdAlert ? 'Seuil 10+ dépassé' : 'Situation normale'}
          icon={<AlertTriangle className="w-4 h-4" />}
          variant={hasThresholdAlert ? 'amber' : 'slate'}
          onClick={() => setVentesModalOpen(true)}
        />

        {/* 8. Historique */}
        <StatCard
          title="Historique Ventes"
          value={agentSales.length}
          subtitle="Consulter les reçus"
          icon={<History className="w-4 h-4" />}
          variant="slate"
          onClick={() => setSalesListOpen(true)}
        />
      </div>

      {/* ========================================================================= */}
      {/* BILAN FINANCIER PERSONNEL DE L'AGENT                                      */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Mon Bilan Financier Personnel</h3>
              <p className="text-[11px] text-slate-400">
                Tarif fixe : {formatFCFA(TICKET_PRICE_FCFA)} • Calcul automatique strict
              </p>
            </div>
          </div>
          <button
            onClick={() => setVentesModalOpen(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 px-3.5 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition cursor-pointer"
          >
            <Receipt className="w-4 h-4" />
            <span>Ventes à Remettre ({stats.unremittedTicketsCount})</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-500">Tickets Vendus</span>
            <p className="text-base sm:text-lg font-black text-white font-mono mt-0.5">
              {stats.soldCount}
            </p>
            <p className="text-[10px] text-slate-400">Ventes enregistrées</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-500">Montant Attendu</span>
            <p className="text-base sm:text-lg font-black text-white font-mono mt-0.5">
              {formatFCFA(stats.expectedAmount)}
            </p>
            <p className="text-[10px] text-slate-400">{stats.soldCount} × 5 000 FCFA</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-500">Montant Remis</span>
            <p className="text-base sm:text-lg font-black text-emerald-400 font-mono mt-0.5">
              {formatFCFA(stats.remittedAmount)}
            </p>
            <p className="text-[10px] text-slate-400">Versé au responsable</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-500">Solde Restant</span>
            <p className={`text-base sm:text-lg font-black font-mono mt-0.5 ${stats.remainingBalance > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
              {formatFCFA(stats.remainingBalance)}
            </p>
            <p className="text-[10px] text-slate-400">
              {stats.remainingBalance > 0 ? `${stats.unremittedTicketsCount} ticket(s) dû(s)` : 'Régularisé'}
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <span className="text-[10px] uppercase font-bold text-slate-500">Écart</span>
            <p className={`text-base sm:text-lg font-black font-mono mt-0.5 ${stats.ecart > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
              {stats.ecart > 0 ? `+${formatFCFA(stats.ecart)}` : '—'}
            </p>
            <p className="text-[10px] text-slate-400">
              {stats.ecart > 0 ? 'Excédent versé' : 'Aucun écart'}
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION DÉDIÉE : MES TICKETS CONFIÉS (NUMÉRO TICKET, STATUT, ACTIONS)     */}
      {/* L'AGENT NE VOIT QUE SES PROPRES TICKETS                                  */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TicketIcon className="w-4 h-4 text-emerald-400" />
              <span>Mes Tickets Confiés ({myTickets.length})</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Visualisation exclusive de votre stock personnel de tickets
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTicketFilterTab('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                ticketFilterTab === 'ALL'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Tous ({myTickets.length})
            </button>
            <button
              onClick={() => setTicketFilterTab('AVAILABLE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                ticketFilterTab === 'AVAILABLE'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Disponibles ({availableTickets.length})
            </button>
            <button
              onClick={() => setTicketFilterTab('SOLD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                ticketFilterTab === 'SOLD'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Vendus ({soldTickets.length})
            </button>
          </div>
        </div>

        {/* Barre de recherche ticket */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par numéro de ticket, carnet..."
            value={ticketSearch}
            onChange={(e) => setTicketSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white focus:border-emerald-500 focus:outline-hidden"
          />
        </div>

        {/* Liste des tickets */}
        {displayedTickets.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            Aucun ticket ne correspond au filtre sélectionné.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {displayedTickets.map((t) => {
              const isAvailable = t.status === 'ASSIGNED_TO_AGENT';
              const isSold = t.status === 'SOLD' || t.status === 'CONTROLLED';

              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950 text-xs hover:border-slate-700 transition gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-white">
                          {t.ticketNumber}
                        </span>
                        {/* Statut lisible */}
                        {isAvailable && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                            DISPONIBLE
                          </span>
                        )}
                        {t.status === 'SOLD' && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/30 text-[10px] font-bold text-blue-400">
                            VENDU
                          </span>
                        )}
                        {t.status === 'CONTROLLED' && (
                          <span className="px-2 py-0.5 rounded-md bg-teal-500/15 border border-teal-500/30 text-[10px] font-bold text-teal-400">
                            CONTRÔLÉ
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>Carnet : {t.carnetNumber}</span>
                        {t.physicalNumber && <span>• #{t.physicalNumber}</span>}
                        {t.plateNumber && (
                          <span className="font-mono text-emerald-300">
                            • Immat : {formatPlateDisplay(t.plateNumber)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAvailable ? (
                      <button
                        onClick={() => handleStartSale(t.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Vendre ce ticket</span>
                      </button>
                    ) : (
                      <div className="text-right">
                        <span className="font-mono font-bold text-white text-xs">
                          {formatFCFA(t.price)}
                        </span>
                        {t.soldAt && (
                          <p className="text-[10px] text-slate-400">
                            {formatDateTime(t.soldAt)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MES DERNIÈRES VENTES                                                      */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-white">Mes Ventes Récentes ({agentSales.length})</h3>
          <button
            onClick={() => setSalesListOpen(true)}
            className="text-xs text-emerald-400 hover:underline font-semibold"
          >
            Historique complet
          </button>
        </div>

        {agentSales.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            Aucune vente enregistrée pour le moment.
          </div>
        ) : (
          <div className="space-y-2">
            {agentSales.slice(0, 5).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white">{s.ticketNumber}</span>
                    <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {formatPlateDisplay(s.plateNumber)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {formatDateTime(s.soldAt)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-white">{formatFCFA(s.price)}</span>
                  <div className="text-[10px] mt-0.5">
                    {s.syncStatus === 'SYNCED' ? (
                      <span className="text-emerald-400">Synchronisé</span>
                    ) : (
                      <span className="text-amber-400">En attente</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modales */}
      <SaleFormModal
        isOpen={saleModalOpen}
        onClose={() => {
          setSaleModalOpen(false);
          setSelectedTicketForSale(undefined);
        }}
        defaultTicketId={selectedTicketForSale}
      />
      <SalesListModal
        isOpen={salesListOpen}
        onClose={() => setSalesListOpen(false)}
      />
      <TicketListModal
        isOpen={ticketsListOpen}
        onClose={() => setTicketsListOpen(false)}
      />
      <VentesARemettreModal
        isOpen={ventesModalOpen}
        onClose={() => setVentesModalOpen(false)}
        preselectedAgentId={currentUser?.id}
      />
      <AdvancedSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
    </div>
  );
};
