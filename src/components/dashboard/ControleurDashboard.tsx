import React, { useState, useMemo } from 'react';
import {
  QrCode,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  MapPin,
  Clock,
  Filter,
  Calendar,
  Search,
  History,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from './StatCard';
import { formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import {
  PeriodSelector,
  PeriodFilterState,
  filterItemByPeriod,
} from './DashboardCharts';

// Modals
import { ControlScanModal } from '../controls/ControlScanModal';
import { FraudReportModal } from '../controls/FraudReportModal';
import { ControlsListModal } from '../controls/ControlsListModal';
import { AdvancedSearchModal } from '../search/AdvancedSearchModal';
import { AgentDirectoryView } from '../agents/AgentDirectoryView';

export const ControleurDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { controls, fraudReports } = useData();

  const [activeTab, setActiveTab] = useState<'controls' | 'directory'>('controls');
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [fraudModalOpen, setFraudModalOpen] = useState(false);
  const [controlsListOpen, setControlsListOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // Filtre temporel pour le contrôleur
  const [period, setPeriod] = useState<PeriodFilterState>({ type: 'today' });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VALID' | 'INVALID'>('ALL');

  // Contrôles du contrôleur connecté
  const myControls = useMemo(() => {
    return controls.filter((c) => c.controleurId === currentUser?.id);
  }, [controls, currentUser]);

  const myFrauds = useMemo(() => {
    return fraudReports.filter((f) => f.controleurId === currentUser?.id);
  }, [fraudReports, currentUser]);

  // 1. Contrôles du jour
  const todayPeriodState: PeriodFilterState = { type: 'today' };
  const todayControls = useMemo(() => {
    return myControls.filter((c) => filterItemByPeriod(c.controlledAt, todayPeriodState));
  }, [myControls]);

  // 2. Contrôles de la période sélectionnée
  const periodControls = useMemo(() => {
    return myControls.filter((c) => filterItemByPeriod(c.controlledAt, period));
  }, [myControls, period]);

  const periodValidCount = useMemo(() => {
    return periodControls.filter((c) => c.isValid).length;
  }, [periodControls]);

  const periodInvalidCount = useMemo(() => {
    return periodControls.filter((c) => !c.isValid).length;
  }, [periodControls]);

  // 3. Signalements de fraude sur la période & total
  const periodFrauds = useMemo(() => {
    return myFrauds.filter((f) => filterItemByPeriod(f.reportedAt, period));
  }, [myFrauds, period]);

  // 4. Historique filtré pour l'affichage
  const displayedHistory = useMemo(() => {
    return myControls.filter((c) => {
      if (statusFilter === 'VALID' && !c.isValid) return false;
      if (statusFilter === 'INVALID' && c.isValid) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchPlate = c.plateNumber.toLowerCase().includes(q);
        const matchTicket = c.ticketNumber.toLowerCase().includes(q);
        const matchMsg = c.validationMessage?.toLowerCase().includes(q);
        return matchPlate || matchTicket || matchMsg;
      }
      return true;
    });
  }, [myControls, statusFilter, searchQuery]);

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 space-y-5">
      {/* ========================================================================= */}
      {/* EN-TÊTE CONTRÔLEUR                                                        */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase font-black tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              Poste de Contrôle Routier
            </span>
            <span className="text-[11px] text-slate-400">
              {currentUser?.fullName}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
            Tableau de Bord Contrôleur
          </h2>
          <p className="text-xs text-slate-400">
            Scan QR Code sur le terrain, détection des fraudes et procès-verbaux de contrôle.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setSearchModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-slate-700 transition cursor-pointer"
            title="Rechercher par ticket ou immatriculation"
          >
            <Search className="w-4 h-4 text-amber-400" />
            <span>Rechercher</span>
          </button>
          <button
            onClick={() => setControlsListOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
          >
            <History className="w-4 h-4 text-amber-400" />
            <span>Registre Complet ({myControls.length})</span>
          </button>
        </div>
      </div>

      {/* Navigation Tiers / Onglets Contrôleur */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('controls')}
          className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition ${
            activeTab === 'controls'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Contrôles & Vérifications
        </button>
        <button
          onClick={() => setActiveTab('directory')}
          className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition ${
            activeTab === 'directory'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Annuaire & Localisation Agents
        </button>
      </div>

      {activeTab === 'directory' ? (
        <AgentDirectoryView viewMode="CONTROLEUR" />
      ) : (
        <>
          {/* ========================================================================= */}
          {/* ACTIONS PRIORITAIRES TERRAIN (GROS BOUTONS TOUCH FRIENDLY)                */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Bouton Scan / Vérification */}
            <button
              id="btn-controleur-scan"
              onClick={() => setScanModalOpen(true)}
              className="flex flex-col items-center justify-center p-5 sm:p-6 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white shadow-xl shadow-amber-950 active:scale-98 transition text-center cursor-pointer space-y-2 border border-amber-500/50"
            >
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-black/20 text-white">
                <QrCode className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-wide">
                  CONTRÔLER UN VÉHICULE
                </h3>
                <p className="text-xs text-amber-100 font-medium">
                  Scanner QR Code ou saisir la plaque d'immatriculation
                </p>
              </div>
            </button>

            {/* Bouton Signalement Fraude */}
            <button
              id="btn-controleur-fraud"
              onClick={() => setFraudModalOpen(true)}
              className="flex flex-col items-center justify-center p-5 sm:p-6 rounded-2xl bg-slate-900 hover:bg-slate-800 text-rose-300 shadow-xl border border-rose-500/40 active:scale-98 transition text-center cursor-pointer space-y-2"
            >
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400">
                <ShieldAlert className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black tracking-wide">
                  SIGNALER UNE FRAUDE
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Faux ticket, plaque usurpée ou refus de stationnement
                </p>
              </div>
            </button>
          </div>

          {/* ========================================================================= */}
          {/* STATISTIQUES CONTRÔLEUR                                                   */}
          {/* ========================================================================= */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Indicateurs d'Activité
              </h3>
              <PeriodSelector period={period} onChange={setPeriod} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              <StatCard
                title="Contrôles (Période)"
                value={periodControls.length}
                subtitle="Vérifications effectuées"
                icon={<ShieldCheck className="w-4 h-4" />}
                variant="slate"
              />
              <StatCard
                title="Tickets Valides"
                value={periodValidCount}
                subtitle="Conformes corridor"
                icon={<CheckCircle2 className="w-4 h-4" />}
                variant="emerald"
              />
              <StatCard
                title="Tickets Rejetés"
                value={periodInvalidCount}
                subtitle="Fraudes / Expirés"
                icon={<XCircle className="w-4 h-4" />}
                variant={periodInvalidCount > 0 ? 'rose' : 'slate'}
              />
              <StatCard
                title="Fraudes Signalées"
                value={periodFrauds.length}
                subtitle="Procès-verbaux"
                icon={<AlertTriangle className="w-4 h-4" />}
                variant={periodFrauds.length > 0 ? 'rose' : 'slate'}
              />
            </div>
          </div>

          {/* ========================================================================= */}
          {/* HISTORIQUE RÉCENT DES CONTRÔLES                                           */}
          {/* ========================================================================= */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Derniers Contrôles Effectués</h3>
                <p className="text-xs text-slate-400">
                  {displayedHistory.length} contrôle(s) affiché(s)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e: any) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-800 py-1.5 px-3 text-xs text-white focus:border-amber-500"
                >
                  <option value="ALL">Tous les statuts</option>
                  <option value="VALID">Valides uniquement</option>
                  <option value="INVALID">Rejetés uniquement</option>
                </select>
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrer par plaque ou numéro de ticket..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white focus:border-amber-500 focus:outline-hidden"
              />
            </div>

            {displayedHistory.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                Aucun contrôle enregistré sur cette période.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {displayedHistory.slice(0, 15).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950 text-xs gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{c.ticketNumber}</span>
                        <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {formatPlateDisplay(c.plateNumber)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {formatDateTime(c.controlledAt)} • {c.validationMessage}
                      </p>
                    </div>
                    <div>
                      {c.isValid ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" /> VALIDE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                          <XCircle className="w-3.5 h-3.5" /> REJETÉ
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals Contrôleur */}
      <ControlScanModal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
      />
      <FraudReportModal
        isOpen={fraudModalOpen}
        onClose={() => setFraudModalOpen(false)}
      />
      <ControlsListModal
        isOpen={controlsListOpen}
        onClose={() => setControlsListOpen(false)}
        onOpenScan={() => {
          setControlsListOpen(false);
          setScanModalOpen(true);
        }}
      />
      <AdvancedSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
    </div>
  );
};
