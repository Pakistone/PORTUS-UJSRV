import React, { useState, useEffect } from 'react';
import { X, Settings, DollarSign, KeyRound, Check, AlertCircle, Trash2, AlertTriangle, Download, Upload } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { formatFCFA } from '../../utils/normalization';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminSettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { ticketPrice, updateTicketPrice, resetUserPassword, resetApplicationData } = useData();
  const { currentUser } = useAuth();

  const [priceInput, setPriceInput] = useState(String(ticketPrice));
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePriceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const num = Number(priceInput);
    if (isNaN(num) || num <= 0) {
      setError('Veuillez saisir un prix valide supérieur à zéro.');
      return;
    }
    setLoading(true);
    try {
      await updateTicketPrice(num);
      setSuccess(`Prix unitaire du ticket mis à jour avec succès : ${formatFCFA(num)}`);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la mise à jour du prix.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!newAdminPassword || newAdminPassword.length < 12) {
      setError('Le mot de passe doit contenir au moins 12 caractères.');
      return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!currentUser) return;

    setLoading(true);
    try {
      await resetUserPassword(currentUser.id, newAdminPassword);
      setSuccess('Mot de passe administrateur réinitialisé avec succès !');
      setNewAdminPassword('');
      setConfirmAdminPassword('');
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la réinitialisation du mot de passe.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Paramètres Système & Sécurité Admin</h3>
              <p className="text-[11px] text-slate-400">
                Configuration du tarif et réinitialisation des accès
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{success}</span>
          </div>
        )}

        <div className="mt-4 space-y-6">
          {/* Section 1 : Prix du Ticket */}
          <form onSubmit={handlePriceSubmit} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Tarif Unitaire du Ticket
              </h4>
            </div>
            <p className="text-[11px] text-slate-400">
              Modifiez le prix officiel appliqué lors de l'enregistrement des ventes de tickets.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Prix unitaire (FCFA)
              </label>
              <input
                type="number"
                min="100"
                step="100"
                required
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 px-3 text-sm font-bold font-mono text-white focus:border-emerald-500 focus:outline-hidden"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Enregistrement...' : 'Mettre à jour le Tarif'}
            </button>
          </form>

          {/* Section 2 : Réinitialisation Mot de Passe Admin */}
          <form onSubmit={handlePasswordResetSubmit} className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <KeyRound className="w-4 h-4 text-blue-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Réinitialisation Mot de Passe Administrateur
              </h4>
            </div>
            <p className="text-[11px] text-slate-400">
              Définissez un nouveau mot de passe sécurisé pour votre compte administrateur ({currentUser?.username}).
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                required
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                placeholder="Nouveau mot de passe"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                required
                value={confirmAdminPassword}
                onChange={(e) => setConfirmAdminPassword(e.target.value)}
                placeholder="Confirmer le nouveau mot de passe"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs text-white focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-500 transition cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Réinitialisation...' : 'Réinitialiser le Mot de Passe'}
            </button>
          </form>

          {/* Section : Sauvegarde & Restauration */}
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Download className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Sauvegarde & Restauration
              </h4>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Téléchargez une sauvegarde complète de votre base de données locale sous forme de fichier JSON sécurisé, ou restaurez une ancienne sauvegarde sur cet appareil.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  setSuccess(null);
                  try {
                    const { getDB } = await import('../../db/indexedDb');
                    const db = await getDB();
                    const backupData: Record<string, any> = {};
                    
                    const stores = [
                      'users',
                      'carnets',
                      'tickets',
                      'sales',
                      'controls',
                      'fraud_reports',
                      'remises',
                      'expenses',
                      'audit_logs',
                      'ticket_assignments',
                      'notifications'
                    ];
                    
                    for (const store of stores) {
                      if (db.objectStoreNames.contains(store as any)) {
                        backupData[store] = await db.getAll(store as any);
                      }
                    }
                    
                    const jsonString = JSON.stringify(backupData, null, 2);
                    const blob = new Blob([jsonString], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    const dateStr = new Date().toISOString().slice(0, 10);
                    link.href = url;
                    link.download = `portus_ujsrv_backup_${dateStr}.json`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    
                    setSuccess('Sauvegarde locale générée et téléchargée avec succès.');
                  } catch (err: any) {
                    setError(err?.message || 'Erreur lors de l’exportation de la sauvegarde.');
                  } finally {
                    setLoading(false);
                  }
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 py-2 px-3 text-xs font-bold hover:bg-slate-700 transition cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sauvegarder</span>
              </button>

              <label className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 py-2 px-3 text-xs font-bold hover:bg-slate-700 transition cursor-pointer disabled:opacity-50">
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>Restaurer</span>
                <input
                  type="file"
                  accept=".json"
                  disabled={loading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    if (!window.confirm('Êtes-vous sûr de vouloir restaurer cette sauvegarde ? Vos données locales actuelles seront remplacées.')) {
                      e.target.value = '';
                      return;
                    }
                    
                    setLoading(true);
                    setError(null);
                    setSuccess(null);
                    
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                      try {
                        const text = event.target?.result as string;
                        const backupData = JSON.parse(text);
                        
                        const { getDB } = await import('../../db/indexedDb');
                        const db = await getDB();
                        
                        const stores = [
                          'users',
                          'carnets',
                          'tickets',
                          'sales',
                          'controls',
                          'fraud_reports',
                          'remises',
                          'expenses',
                          'audit_logs',
                          'ticket_assignments',
                          'notifications'
                        ];
                        
                        const tx = db.transaction(stores as any, 'readwrite');
                        for (const store of stores) {
                          if (db.objectStoreNames.contains(store as any) && backupData[store]) {
                            const os = tx.objectStore(store as any);
                            await os.clear();
                            for (const item of backupData[store]) {
                              await os.put(item);
                            }
                          }
                        }
                        await tx.done;
                        
                        setSuccess('Base de données restaurée avec succès ! Redémarrage...');
                        setTimeout(() => {
                          window.location.reload();
                        }, 1500);
                      } catch (err: any) {
                        setError('Fichier invalide ou erreur de restauration : ' + (err?.message || err));
                      } finally {
                        setLoading(false);
                        e.target.value = '';
                      }
                    };
                    reader.onerror = () => {
                      setError('Erreur lors de la lecture du fichier de sauvegarde.');
                      setLoading(false);
                      e.target.value = '';
                    };
                    reader.readAsText(file);
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Section 3 : Réinitialisation Complète de l'App */}
          <div className="space-y-3 rounded-xl border border-rose-950 bg-rose-950/20 p-4">
            <div className="flex items-center gap-2 border-b border-rose-900/60 pb-2">
              <Trash2 className="w-4 h-4 text-rose-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">
                Zone de Danger : Réinitialisation
              </h4>
            </div>
            <p className="text-[11px] text-rose-300/80 leading-relaxed">
              Cette action supprimera définitivement tous les tickets générés, carnets, ventes enregistrées, contrôles routiers et rapports d'anomalies (localement et sur la base distante si connectée).
            </p>
            
            {!showConfirmReset ? (
              <button
                type="button"
                onClick={() => setShowConfirmReset(true)}
                className="w-full rounded-xl bg-rose-900/40 hover:bg-rose-900/80 border border-rose-800 text-rose-200 py-2 text-xs font-bold transition cursor-pointer"
              >
                Réinitialiser l'Application...
              </button>
            ) : (
              <div className="space-y-3 pt-1">
                <div className="rounded-lg bg-rose-950/40 border border-rose-900/40 p-2.5 text-[10px] text-rose-300 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>Cette opération est irréversible. Pour continuer, veuillez taper <strong>CONFIRMER</strong> ci-dessous.</span>
                </div>
                <div>
                  <input
                    type="text"
                    value={resetConfirmationText}
                    onChange={(e) => setResetConfirmationText(e.target.value)}
                    placeholder="Tapez CONFIRMER"
                    className="w-full rounded-xl border border-rose-800 bg-rose-950/40 py-2 px-3 text-xs text-rose-100 focus:border-rose-500 focus:outline-hidden font-bold"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowConfirmReset(false);
                      setResetConfirmationText('');
                    }}
                    className="flex-1 rounded-xl bg-slate-800 border border-slate-700 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={loading || resetConfirmationText !== 'CONFIRMER'}
                    onClick={async () => {
                      setLoading(true);
                      setError(null);
                      setSuccess(null);
                      try {
                        await resetApplicationData();
                        setSuccess('Application réinitialisée avec succès. Redémarrage imminent...');
                        setTimeout(() => {
                          window.location.reload();
                        }, 1800);
                      } catch (err: any) {
                        setError(err?.message || 'Erreur de réinitialisation.');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white py-2 text-xs font-bold transition cursor-pointer disabled:opacity-40"
                  >
                    {loading ? 'Purge...' : 'Confirmer Purge'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
            >
              Fermer la fenêtre
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
