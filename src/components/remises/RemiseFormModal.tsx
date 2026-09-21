import React, { useState } from 'react';
import { X, HandCoins, AlertCircle, CheckCircle2, Printer } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import { formatFCFA } from '../../utils/normalization';
import { generateRemiseReceiptPDF } from '../../utils/pdfGenerator';
import type { Remise } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preselectedAgentId?: string;
}

export const RemiseFormModal: React.FC<Props> = ({
  isOpen,
  onClose,
  preselectedAgentId,
}) => {
  const { currentUser } = useAuth();
  const { users, recordRemise, getAgentStats } = useData();

  const [selectedAgentId, setSelectedAgentId] = useState(preselectedAgentId || '');
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRemise, setCreatedRemise] = useState<Remise | null>(null);

  if (!isOpen) return null;

  const eligibleAgents = users.filter((u) => {
    if (u.role !== 'AGENT' || !u.isActive) return false;
    if (currentUser?.role === 'RESPONSABLE') {
      return u.sectorId === currentUser.sectorId;
    }
    return true;
  });

  const agentStats = selectedAgentId ? getAgentStats(selectedAgentId) : null;

  const handleAgentChange = (agId: string) => {
    setSelectedAgentId(agId);
    if (agId) {
      const stats = getAgentStats(agId);
      setAmount(stats.remainingBalance > 0 ? String(stats.remainingBalance) : ''); // Préremplir avec le solde exact dû
    } else {
      setAmount('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numAmount = Number(amount || 0);
    if (!selectedAgentId) {
      setError('Veuillez sélectionner un agent.');
      return;
    }
    if (numAmount <= 0) {
      setError('Le montant doit être supérieur à zéro.');
      return;
    }

    setLoading(true);
    try {
      const remise = await recordRemise({
        agentId: selectedAgentId,
        amount: numAmount,
        note: note.trim() || undefined,
      });
      setCreatedRemise(remise);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l’enregistrement de la remise.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintReceipt = async () => {
    if (!createdRemise) return;
    await generateRemiseReceiptPDF(createdRemise);
  };

  const handleClose = () => {
    setCreatedRemise(null);
    setAmount('');
    setNote('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
      <div className="w-full max-w-lg my-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 pb-28 sm:pb-32 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
              <HandCoins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Enregistrer une Remise Financière</h3>
              <p className="text-[11px] text-slate-400">
                Versement des recettes tickets des agents au responsable
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="rounded-lg p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {createdRemise ? (
          <div className="my-6 space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-emerald-400">
                Remise Enregistrée
              </span>
              <h4 className="text-xl font-black text-white mt-0.5">{createdRemise.reference}</h4>
              <p className="text-sm font-semibold text-slate-300 mt-1">
                Montant : <strong className="text-emerald-400">{formatFCFA(createdRemise.amount)}</strong>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Agent : {createdRemise.agentName} • {createdRemise.ticketsCount} tickets couverts
              </p>
            </div>

            <div className="flex gap-2 pt-3">
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-lg hover:bg-emerald-500 transition"
              >
                <Printer className="w-4 h-4" />
                <span>Télécharger le Récépissé Officiel (PDF)</span>
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl bg-slate-800 px-4 py-3 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Choix de l'Agent */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Sélectionner l’Agent
              </label>
              <select
                required
                value={selectedAgentId}
                onChange={(e) => handleAgentChange(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-sm text-white focus:border-blue-500 focus:outline-hidden"
              >
                <option value="">-- Choisir un agent --</option>
                {eligibleAgents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.fullName} ({ag.sectorName || 'Secteur'})
                  </option>
                ))}
              </select>
            </div>

            {/* Fiche d'état financier de l'Agent sélectionné */}
            {agentStats && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="font-bold text-slate-300">Situation financière de l'agent</span>
                  <span className="text-[11px] text-slate-400">Prix : 5 000 FCFA / ticket</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-slate-400">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-500">Tickets Vendus</p>
                    <p className="text-sm font-bold text-white font-mono">{agentStats.soldCount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-500">Montant Attendu</p>
                    <p className="text-sm font-bold text-white font-mono">{formatFCFA(agentStats.expectedAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-500">Montant Déjà Remis</p>
                    <p className="text-sm font-bold text-emerald-400 font-mono">{formatFCFA(agentStats.remittedAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-500">
                      {agentStats.ecart > 0 ? 'Écart Positif' : 'Solde Restant Dû'}
                    </p>
                    <p className={`text-sm font-bold font-mono ${agentStats.ecart > 0 ? 'text-emerald-400' : agentStats.remainingBalance > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {agentStats.ecart > 0 ? `+${formatFCFA(agentStats.ecart)}` : formatFCFA(agentStats.remainingBalance)}
                    </p>
                  </div>
                </div>

                {/* Simulation de la nouvelle remise */}
                {Number(amount || 0) > 0 && (
                  <div className="mt-2 rounded-lg bg-slate-900 border border-slate-800 p-2.5 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                      Impact après cette remise ({formatFCFA(Number(amount))}) :
                    </p>
                    {(() => {
                      const numAmt = Number(amount || 0);
                      const newTotalRemitted = agentStats.remittedAmount + numAmt;
                      const newBalance = Math.max(0, agentStats.expectedAmount - newTotalRemitted);
                      const newEcart = Math.max(0, newTotalRemitted - agentStats.expectedAmount);
                      return (
                        <div className="flex items-center justify-between text-xs pt-0.5">
                          <span className="text-slate-300 font-medium">
                            {newEcart > 0 ? 'Nouvel Écart Positif :' : 'Nouveau Solde Restant :'}
                          </span>
                          <span className={`font-mono font-bold ${newEcart > 0 ? 'text-emerald-400' : newBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {newEcart > 0 ? `+${formatFCFA(newEcart)} (Excédent)` : newBalance === 0 ? '0 FCFA (Entièrement régularisé)' : formatFCFA(newBalance)}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {agentStats.unremittedTicketsCount >= 10 && (
                  <p className="text-[11px] text-amber-300 font-semibold bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                    ⚠️ Alerte de dépassement : {agentStats.unremittedTicketsCount} tickets non versés ({formatFCFA(agentStats.remainingBalance)}).
                  </p>
                )}
              </div>
            )}

            {/* Montant versé (remise partielle autorisée) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  Montant remis (FCFA) — <span className="text-emerald-400 font-normal">Remise partielle autorisée</span>
                </label>
                <span className="text-[11px] text-slate-400 font-mono">
                  {Math.floor(Number(amount || 0) / TICKET_PRICE_FCFA)} ticket(s) plein(s) couvert(s)
                </span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                required
                value={amount}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^\d]/g, '').replace(/^0+/, '');
                  setAmount(cleaned);
                }}
                placeholder="0"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-base font-bold font-mono text-white focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Note ou observation */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Observation / Note (Facultatif)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: Remise partielle de mi-journée ou solde complet"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Mention d'immutabilité */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-[11px] text-slate-400 flex items-start gap-2">
              <span className="text-blue-400 font-bold shrink-0">🔒 Immutabilité :</span>
              <span>
                Le responsable ne peut ni modifier ni supprimer une remise enregistrée. Seul l'administrateur peut procéder à une correction exceptionnelle motivée.
              </span>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading || !selectedAgentId || Number(amount || 0) <= 0}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-500 transition shadow-md disabled:opacity-50"
              >
                {loading ? 'Enregistrement...' : 'Enregistrer la Remise'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
