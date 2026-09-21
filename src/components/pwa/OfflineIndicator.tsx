import React from 'react';
import { WifiOff, CloudUpload, CheckCircle2 } from 'lucide-react';
import { useOnlineStatus } from './usePWAInstall';

interface Props {
  pendingSyncCount?: number;
  lastSyncedSaleNumber?: string | null;
  onManualSync?: () => void;
  isSyncing?: boolean;
}

export const OfflineIndicator: React.FC<Props> = ({
  pendingSyncCount = 0,
  lastSyncedSaleNumber = null,
  onManualSync,
  isSyncing = false,
}) => {
  const isOnline = useOnlineStatus();

  return (
    <>
      {/* Bannière Hors Ligne */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-amber-500 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow-md">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 animate-bounce" />
            <span>MODE HORS LIGNE ACTIF — Ventes et contrôles enregistrés localement</span>
          </div>
          <span className="text-[11px] font-bold uppercase bg-amber-600/30 px-2 py-0.5 rounded">
            Autonome
          </span>
        </div>
      )}

      {/* Badge synchronisation flottant si ventes en attente */}
      {pendingSyncCount > 0 && (
        <aside
          aria-label="Synchronisation des ventes"
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-96 z-40 flex items-center justify-between rounded-xl border border-amber-500/40 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <CloudUpload className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-300">
                🟠 VENTE ENREGISTRÉE — SYNCHRONISATION EN ATTENTE
              </p>
              <p className="text-[11px] text-slate-400">
                {pendingSyncCount} opération{pendingSyncCount > 1 ? 's' : ''} en attente sur cet appareil
              </p>
            </div>
          </div>
          {isOnline && onManualSync && (
            <button
              onClick={onManualSync}
              disabled={isSyncing}
              className="ml-2 shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSyncing ? 'En cours...' : 'Synchroniser'}
            </button>
          )}
        </aside>
      )}

      {/* Confirmation temporaire de synchronisation */}
      {lastSyncedSaleNumber && pendingSyncCount === 0 && (
        <aside
          aria-label="Statut de synchronisation"
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-slate-900/95 px-4 py-2.5 shadow-xl backdrop-blur-md text-emerald-400 text-xs font-bold animate-in fade-in slide-in-from-bottom duration-300"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>🟢 VENTE SYNCHRONISÉE ({lastSyncedSaleNumber})</span>
        </aside>
      )}
    </>
  );
};
