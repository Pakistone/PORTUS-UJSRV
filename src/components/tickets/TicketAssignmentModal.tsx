import React, { useState, useMemo } from 'react';
import {
  X,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  ListFilter,
  Layers,
  Search,
  CheckSquare,
  Square,
  ArrowRight,
  Info,
  SlidersHorizontal,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import type { Ticket } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preselectedTickets?: Ticket[];
}

type AssignmentMethod = 'RANGE' | 'INDIVIDUAL';

export const TicketAssignmentModal: React.FC<Props> = ({
  isOpen,
  onClose,
  preselectedTickets = [],
}) => {
  const { currentUser } = useAuth();
  const { tickets, users, carnets, assignTicketsToAgent, reassignUnsoldTickets } = useData();

  // Mode d'opération
  const [method, setMethod] = useState<AssignmentMethod>('RANGE');
  const [isReassignment, setIsReassignment] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedCarnetId, setSelectedCarnetId] = useState<string>('ALL');

  // Sélection de tickets
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>(
    preselectedTickets.map((t) => t.id)
  );

  // Méthode A : Plage continue
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  // Méthode B : Sélection individuelle
  const [searchTerm, setSearchTerm] = useState('');
  const [quickInputNumbers, setQuickInputNumbers] = useState('');
  const [quickInputFeedback, setQuickInputFeedback] = useState<string | null>(null);

  // État UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    count: number;
    agentName: string;
    notificationMsg: string;
  } | null>(null);

  // Liste des agents éligibles (actifs et dans le même secteur pour un responsable)
  const eligibleAgents = useMemo(() => {
    return users.filter((u) => {
      if (u.role !== 'AGENT' || !u.isActive) return false;
      if (currentUser?.role === 'RESPONSABLE') {
        return !currentUser.sectorId || u.sectorId === currentUser.sectorId;
      }
      return true;
    });
  }, [users, currentUser]);

  // Carnets du responsable
  const availableCarnets = useMemo(() => {
    return carnets.filter((c) => {
      if (currentUser?.role === 'RESPONSABLE') {
        return c.assignedToResponsableId === currentUser.id;
      }
      return true;
    });
  }, [carnets, currentUser]);

  // Pool de tous les tickets sous la responsabilité de cet utilisateur
  const responsableTicketsPool = useMemo(() => {
    return tickets.filter((t) => {
      if (currentUser?.role === 'RESPONSABLE') {
        if (t.assignedResponsableId !== currentUser.id) return false;
      }
      if (selectedCarnetId !== 'ALL' && t.carnetId !== selectedCarnetId) {
        return false;
      }
      return true;
    });
  }, [tickets, currentUser, selectedCarnetId]);

  // Tickets éligibles selon l'opération (Nouvelle attribution vs Réattribution)
  // RÈGLES MÉTIER :
  // - Seuls les tickets non vendus peuvent être attribués ou réattribués.
  // - Un ticket vendu ne peut JAMAIS être réattribué.
  // - Un ticket annulé ne peut pas être attribué.
  const eligibleTickets = useMemo(() => {
    return responsableTicketsPool.filter((t) => {
      if (t.status === 'SOLD' || t.status === 'CONTROLLED' || t.status === 'CANCELLED') {
        return false;
      }
      if (isReassignment) {
        return t.status === 'ASSIGNED_TO_AGENT';
      } else {
        return t.status === 'ASSIGNED_TO_RESPONSIBLE' || t.status === 'AVAILABLE';
      }
    });
  }, [responsableTicketsPool, isReassignment]);

  // Helper d'extraction numérique
  const extractNumericSuffix = (val: string): number => {
    const trimmed = val.trim();
    if (!trimmed) return NaN;
    // Extraire les chiffres
    const match = trimmed.match(/\d+/g);
    if (!match) return NaN;
    return parseInt(match[match.length - 1], 10);
  };

  // Analyse en direct de la plage continue saisie
  const rangeAnalysis = useMemo(() => {
    const startNum = extractNumericSuffix(rangeStart);
    const endNum = extractNumericSuffix(rangeEnd);

    if (isNaN(startNum) || isNaN(endNum) || startNum <= 0 || endNum < startNum) {
      return {
        isValid: false,
        totalInRange: 0,
        eligibleTickets: [] as Ticket[],
        soldOrControlledTickets: [] as Ticket[],
        cancelledTickets: [] as Ticket[],
      };
    }

    // Parcourir tous les tickets du pool du carnet / responsable
    const inRangeTickets = responsableTicketsPool.filter((t) => {
      const ticketNum = t.physicalNumber || extractNumericSuffix(t.ticketNumber);
      return !isNaN(ticketNum) && ticketNum >= startNum && ticketNum <= endNum;
    });

    const eligible = inRangeTickets.filter((t) => {
      if (t.status === 'SOLD' || t.status === 'CONTROLLED' || t.status === 'CANCELLED') {
        return false;
      }
      if (isReassignment) {
        return t.status === 'ASSIGNED_TO_AGENT';
      } else {
        return t.status === 'ASSIGNED_TO_RESPONSIBLE' || t.status === 'AVAILABLE';
      }
    });

    const soldOrControlled = inRangeTickets.filter(
      (t) => t.status === 'SOLD' || t.status === 'CONTROLLED'
    );
    const cancelled = inRangeTickets.filter((t) => t.status === 'CANCELLED');

    return {
      isValid: true,
      totalExpected: endNum - startNum + 1,
      totalFound: inRangeTickets.length,
      eligibleTickets: eligible,
      soldOrControlledTickets: soldOrControlled,
      cancelledTickets: cancelled,
    };
  }, [rangeStart, rangeEnd, responsableTicketsPool, isReassignment]);

  // Application automatique de la plage continue
  const handleApplyRange = () => {
    if (!rangeAnalysis.isValid || rangeAnalysis.eligibleTickets.length === 0) return;
    const eligibleIds = rangeAnalysis.eligibleTickets.map((t) => t.id);
    setSelectedTicketIds((prev) => Array.from(new Set([...prev, ...eligibleIds])));
  };

  // Méthode B : Saisie rapide de plusieurs numéros (ex: 003, 008, 011, 025)
  const handleApplyQuickInput = () => {
    setQuickInputFeedback(null);
    if (!quickInputNumbers.trim()) return;

    const tokens = quickInputNumbers
      .split(/[,;\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (tokens.length === 0) return;

    const matchedIds: string[] = [];
    const notFoundTokens: string[] = [];
    const ineligibleTokens: string[] = [];

    tokens.forEach((token) => {
      const targetNum = extractNumericSuffix(token);
      // Chercher le ticket dans le pool
      const found = responsableTicketsPool.find((t) => {
        const ticketNum = t.physicalNumber || extractNumericSuffix(t.ticketNumber);
        return (
          ticketNum === targetNum ||
          t.ticketNumber.toLowerCase().includes(token.toLowerCase())
        );
      });

      if (!found) {
        notFoundTokens.push(token);
      } else if (found.status === 'SOLD' || found.status === 'CONTROLLED') {
        ineligibleTokens.push(`${found.ticketNumber} (VENDU)`);
      } else if (found.status === 'CANCELLED') {
        ineligibleTokens.push(`${found.ticketNumber} (ANNULÉ)`);
      } else {
        matchedIds.push(found.id);
      }
    });

    if (matchedIds.length > 0) {
      setSelectedTicketIds((prev) => Array.from(new Set([...prev, ...matchedIds])));
    }

    const messages: string[] = [];
    if (matchedIds.length > 0) {
      messages.push(`✓ ${matchedIds.length} ticket(s) sélectionné(s).`);
    }
    if (ineligibleTokens.length > 0) {
      messages.push(`⚠️ Exclus car vendus/annulés: ${ineligibleTokens.join(', ')}`);
    }
    if (notFoundTokens.length > 0) {
      messages.push(`❓ Introuvables: ${notFoundTokens.join(', ')}`);
    }

    setQuickInputFeedback(messages.join(' '));
    setQuickInputNumbers('');
  };

  // Bascule sélection individuelle
  const handleToggleTicket = (id: string) => {
    setSelectedTicketIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const currentFilteredIds = filteredIndividualTickets.map((t) => t.id);
    const allSelected = currentFilteredIds.every((id) => selectedTicketIds.includes(id));

    if (allSelected) {
      setSelectedTicketIds((prev) => prev.filter((id) => !currentFilteredIds.includes(id)));
    } else {
      setSelectedTicketIds((prev) => Array.from(new Set([...prev, ...currentFilteredIds])));
    }
  };

  const handleClearSelection = () => {
    setSelectedTicketIds([]);
  };

  // Filtrage pour la vue liste individuelle
  const filteredIndividualTickets = useMemo(() => {
    return eligibleTickets.filter((t) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const matchNumber = t.ticketNumber.toLowerCase().includes(term);
      const matchCarnet = t.carnetNumber.toLowerCase().includes(term);
      const matchPhysical = t.physicalNumber?.toString().includes(term);
      const matchAgent = t.assignedAgentName?.toLowerCase().includes(term);
      return matchNumber || matchCarnet || matchPhysical || matchAgent;
    });
  }, [eligibleTickets, searchTerm]);

  // Validation et soumission finale
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedAgentId) {
      setError('Veuillez sélectionner un agent bénéficiaire.');
      return;
    }
    if (selectedTicketIds.length === 0) {
      setError('Veuillez sélectionner au moins un ticket éligible.');
      return;
    }

    const agent = users.find((u) => u.id === selectedAgentId);
    if (!agent) {
      setError('Agent sélectionné introuvable.');
      return;
    }

    setLoading(true);
    try {
      if (isReassignment) {
        await reassignUnsoldTickets(selectedTicketIds, selectedAgentId);
      } else {
        await assignTicketsToAgent(selectedTicketIds, selectedAgentId);
      }

      setSuccessInfo({
        count: selectedTicketIds.length,
        agentName: agent.fullName,
        notificationMsg: `${selectedTicketIds.length} NOUVEAUX TICKETS VOUS ONT ÉTÉ ATTRIBUÉS`,
      });

      setTimeout(() => {
        setSuccessInfo(null);
        onClose();
      }, 2200);
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'attribution des tickets.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col overflow-hidden">
        {/* ========================================================================= */}
        {/* EN-TÊTE MODALE                                                            */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isReassignment ? 'Réattribution de Tickets non vendus' : 'Attribution des Tickets aux Agents'}
              </h3>
              <p className="text-xs text-slate-400">
                Plage continue (ex: 001 à 020) ou sélection individuelle (ex: 003, 008, 011...)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message d'erreur */}
        {error && (
          <div className="mx-4 sm:mx-6 mt-3 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {/* Écran de succès */}
        {successInfo ? (
          <div className="my-10 px-6 text-center space-y-3 animate-fadeIn">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-lg font-black text-white">
              {successInfo.count} tickets attribués avec succès !
            </h4>
            <p className="text-xs text-slate-300">
              Bénéficiaire : <strong className="text-white">{successInfo.agentName}</strong>
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-emerald-300">
              <span>🔔 Notification persistante envoyée :</span>
              <strong className="font-mono">"{successInfo.notificationMsg}"</strong>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:px-6 space-y-4">
              {/* ========================================================================= */}
              {/* 1. CHOIX DE L'AGENT ET TYPE D'ATTRIBUTION                                 */}
              {/* ========================================================================= */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Choix de l'Agent */}
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">
                    1. Agent de terrain bénéficiaire <span className="text-rose-400">*</span>
                  </label>
                  <select
                    required
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs sm:text-sm text-white focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="">-- Sélectionner un agent --</option>
                    {eligibleAgents.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.fullName} ({ag.sectorName || 'Secteur'} • Tél: {ag.phone || 'Non renseigné'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtre de carnet optionnel */}
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">
                    Carnet source
                  </label>
                  <select
                    value={selectedCarnetId}
                    onChange={(e) => setSelectedCarnetId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs sm:text-sm text-white focus:border-blue-500 focus:outline-hidden"
                  >
                    <option value="ALL">Tous mes carnets disponibles</option>
                    {availableCarnets.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.carnetNumber} ({c.size} tickets • {c.sectorName || 'Secteur'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Type d'attribution (Nouvelle vs Réattribution) */}
              <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsReassignment(false);
                    setSelectedTicketIds([]);
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                    !isReassignment
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Nouvelle attribution (Stock responsable vierge)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsReassignment(true);
                    setSelectedTicketIds([]);
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                    isReassignment
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Réattribution (Tickets non vendus d’un autre agent)
                </button>
              </div>

              {/* ========================================================================= */}
              {/* 2. CHOIX DE LA MÉTHODE D'ATTRIBUTION (ONGLETS A / B)                      */}
              {/* ========================================================================= */}
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-2">
                  2. Méthode d'attribution des tickets
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMethod('RANGE')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition text-left ${
                      method === 'RANGE'
                        ? 'border-blue-500 bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/50'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-blue-400 shrink-0" />
                    <div>
                      <span className="block font-bold">A. PLAGE CONTINUE</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        Ex: Ticket 001 à 020 (auto)
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMethod('INDIVIDUAL')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition text-left ${
                      method === 'INDIVIDUAL'
                        ? 'border-blue-500 bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/50'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <ListFilter className="w-4 h-4 text-blue-400 shrink-0" />
                    <div>
                      <span className="block font-bold">B. SÉLECTION INDIVIDUELLE</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        Ex: 003, 008, 011, 025...
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* CORPS MÉTHODE A : PLAGE CONTINUE                                          */}
              {/* ========================================================================= */}
              {method === 'RANGE' && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                      Définir la plage continue de tickets
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Disponibles dans ce filtre :{' '}
                      <strong className="text-emerald-400">{eligibleTickets.length}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Numéro de Début (ex: 001 ou 1)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 001"
                        value={rangeStart}
                        onChange={(e) => setRangeStart(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 px-3 text-xs sm:text-sm font-mono text-white focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Numéro de Fin (ex: 020 ou 20)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 020"
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 px-3 text-xs sm:text-sm font-mono text-white focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Résumé de détection en direct */}
                  {rangeAnalysis.isValid && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Plage analysée :</span>
                        <span className="font-bold text-white">
                          De #{rangeStart} à #{rangeEnd} ({rangeAnalysis.totalExpected} tickets théoriques)
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Tickets éligibles trouvés :</span>
                        <span className="font-bold text-emerald-400">
                          {rangeAnalysis.eligibleTickets.length} ticket(s) prêts à attribuer
                        </span>
                      </div>

                      {/* Règle stricte : Tickets vendus dans la plage */}
                      {rangeAnalysis.soldOrControlledTickets.length > 0 && (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-300">
                          <strong className="block font-bold">
                            ⚠️ Règle stricte : {rangeAnalysis.soldOrControlledTickets.length} ticket(s) dans cette plage sont DÉJÀ VENDUS et exclus de l'attribution.
                          </strong>
                          <span className="text-[10px] text-rose-300/80">
                            Ex: {rangeAnalysis.soldOrControlledTickets.map((t) => t.ticketNumber).slice(0, 5).join(', ')}
                          </span>
                        </div>
                      )}

                      {/* Règle stricte : Tickets annulés dans la plage */}
                      {rangeAnalysis.cancelledTickets.length > 0 && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-300">
                          <strong className="block font-bold">
                            ⚠️ {rangeAnalysis.cancelledTickets.length} ticket(s) dans cette plage sont ANNULÉS et exclus.
                          </strong>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleApplyRange}
                        disabled={rangeAnalysis.eligibleTickets.length === 0}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 py-2 px-3 text-xs font-bold text-white transition disabled:opacity-40"
                      >
                        <span>
                          Sélectionner automatiquement les {rangeAnalysis.eligibleTickets.length} tickets éligibles de cette plage
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {!rangeAnalysis.isValid && (rangeStart || rangeEnd) && (
                    <p className="text-[11px] text-amber-400">
                      Veuillez saisir des numéros valides (le numéro de fin doit être supérieur ou égal au numéro de début).
                    </p>
                  )}
                </div>
              )}

              {/* ========================================================================= */}
              {/* CORPS MÉTHODE B : SÉLECTION INDIVIDUELLE                                  */}
              {/* ========================================================================= */}
              {method === 'INDIVIDUAL' && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
                  {/* Saisie rapide de plusieurs numéros (ex: 003, 008, 011, 025) */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2">
                    <label className="block text-[11px] font-bold text-slate-200">
                      Saisie rapide séparée par des virgules ou espaces
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Ex: 003, 008, 011, 025"
                        value={quickInputNumbers}
                        onChange={(e) => setQuickInputNumbers(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleApplyQuickInput();
                          }
                        }}
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs font-mono text-white focus:border-blue-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={handleApplyQuickInput}
                        className="rounded-xl bg-slate-800 hover:bg-slate-700 px-3.5 py-2 text-xs font-bold text-white border border-slate-700 transition"
                      >
                        Ajouter
                      </button>
                    </div>
                    {quickInputFeedback && (
                      <p className="text-[11px] text-emerald-400 font-medium">
                        {quickInputFeedback}
                      </p>
                    )}
                  </div>

                  {/* Recherche et bascules de masse */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filtrer par numéro, carnet..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-xl border border-slate-800 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-white focus:border-blue-500 focus:outline-hidden"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold px-2 py-1"
                    >
                      {filteredIndividualTickets.every((t) => selectedTicketIds.includes(t.id))
                        ? 'Désélectionner les résultats'
                        : `Tout sélectionner (${filteredIndividualTickets.length})`}
                    </button>
                  </div>

                  {/* Liste des tickets disponibles */}
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 rounded-xl border border-slate-800 bg-slate-900 p-2">
                    {filteredIndividualTickets.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-500">
                        Aucun ticket éligible ne correspond aux filtres.
                      </div>
                    ) : (
                      filteredIndividualTickets.map((t) => {
                        const isChecked = selectedTicketIds.includes(t.id);
                        return (
                          <div
                            key={t.id}
                            onClick={() => handleToggleTicket(t.id)}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition text-xs ${
                              isChecked
                                ? 'bg-blue-600/20 border-blue-500/50 text-white'
                                : 'bg-slate-950 border-slate-800/80 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-600 shrink-0" />
                              )}
                              <span className="font-mono font-bold">{t.ticketNumber}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                (Carnet: {t.carnetNumber} • #{t.physicalNumber})
                              </span>
                            </div>
                            <div>
                              {isReassignment && t.assignedAgentName && (
                                <span className="text-[10px] text-amber-400 font-semibold">
                                  Actuel : {t.assignedAgentName}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* 3. PANIER / APERÇU DES TICKETS SÉLECTIONNÉS                                */}
              {/* ========================================================================= */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-blue-400" />
                    Total sélectionné pour attribution :{' '}
                    <strong className="text-blue-400 font-mono text-sm ml-1">
                      {selectedTicketIds.length} ticket(s)
                    </strong>
                  </span>
                  {selectedTicketIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
                    >
                      Effacer la sélection
                    </button>
                  )}
                </div>

                {selectedTicketIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1">
                    {selectedTicketIds.map((id) => {
                      const ticket = tickets.find((t) => t.id === id);
                      if (!ticket) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-600/20 border border-blue-500/30 text-[11px] font-mono text-blue-200"
                        >
                          <span>{ticket.ticketNumber}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleTicket(id)}
                            className="text-blue-400 hover:text-white"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Aucun ticket n'est sélectionné. Utilisez la plage continue ou la sélection individuelle ci-dessus.
                  </p>
                )}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* PIED DE MODALE                                                            */}
            {/* ========================================================================= */}
            <div className="flex items-center justify-between p-4 sm:px-6 border-t border-slate-800 bg-slate-900">
              <span className="text-xs text-slate-400">
                {selectedTicketIds.length === 0 ? (
                  'Sélectionnez des tickets pour valider'
                ) : (
                  <>
                    Prêt pour <strong className="text-white">{selectedTicketIds.length} tickets</strong>
                  </>
                )}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading || selectedTicketIds.length === 0 || !selectedAgentId}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-500 transition disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-blue-900/30"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>
                    {loading ? 'Attribution...' : `Valider l'Attribution (${selectedTicketIds.length})`}
                  </span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
