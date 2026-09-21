import React, { useState } from 'react';
import { X, Wrench, AlertTriangle } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { formatFCFA } from '../../utils/normalization';
import type { Remise } from '../../types';

interface Props {
  remise: Remise | null;
  onClose: () => void;
}

export const ExceptionalCorrectionModal: React.FC<Props> = ({ remise, onClose }) => {
  const { correctRemiseAdmin } = useData();
  const [newAmount, setNewAmount] = useState<string>(remise?.amount ? String(remise.amount) : '');
  const [newNote, setNewNote] = useState<string>(remise?.note || '');
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!remise) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Le motif de correction est strictement obligatoire.');
      return;
    }
    const numAmt = Number(newAmount || 0);
    if (numAmt <= 0) {
      setError('Le montant doit être supérieur à zéro.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await correctRemiseAdmin(remise.id, numAmt, newNote, reason);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la correction.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4 overflow-y-auto backdrop-blur-xs">
      <div className="w-full max-w-lg my-auto rounded-2xl border border-amber-500/40 bg-slate-900 p-6 pb-28 sm:pb-32 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-amber-400">
            <Wrench className="w-5 h-5" />
            <h3 className="text-base font-bold text-white">Correction Exceptionnelle de Remise</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            RÉSERVÉ À L’ADMINISTRATEUR EN CAS D’ERREUR AVÉRÉE
          </p>
          <p className="text-[11px] text-amber-300/80 leading-relaxed">
            L'ancien montant ({formatFCFA(remise.amount)}) sera conservé dans l’historique immuable avec votre nom, la date exacte et le motif saisi.
          </p>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Référence de Remise
            </label>
            <input
              type="text"
              readOnly
              value={`${remise.reference} (Agent: ${remise.agentName})`}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 px-3 text-xs font-mono text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nouveau Montant Rectifié (FCFA)
            </label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={newAmount}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d]/g, '').replace(/^0+/, '');
                setNewAmount(cleaned);
              }}
              placeholder="0"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-sm font-bold font-mono text-white focus:border-amber-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nouvelle Note / Observation
            </label>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Observation mise à jour"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-amber-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Motif obligatoire de la correction
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Justifiez précisément la raison de cette modification manuelle..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white focus:border-amber-500 focus:outline-hidden"
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim()}
              className="flex-1 rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white hover:bg-amber-500 transition disabled:opacity-50"
            >
              {loading ? 'Application...' : 'Enregistrer la Correction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
