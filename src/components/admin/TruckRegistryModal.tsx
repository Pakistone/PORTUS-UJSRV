import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { X, Search, Truck, Phone, Calendar, Download, ShieldAlert, FileSpreadsheet } from 'lucide-react';
import { formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import { exportSalesToExcel } from '../../utils/excelExport';

interface TruckRegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TruckRegistryModal: React.FC<TruckRegistryModalProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const { sales, tickets } = useData();
  const [searchTerm, setSearchTerm] = useState('');

  // Vérification stricte d'habilitation Administrateur
  if (!isOpen) return null;

  if (currentUser?.role !== 'ADMINISTRATEUR') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 text-center shadow-2xl space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Accès Restreint</h3>
            <p className="text-xs text-slate-400 mt-1">
              Le Registre Flotte & Contacts Chauffeurs est strictement réservé à l'Administrateur principal.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  // Extraction unique des camions enregistrés via les ventes
  const registryMap = useMemo(() => {
    const map = new Map<string, {
      plateNumber: string;
      lastDriverPhone: string;
      lastSeen: string;
      totalPassages: number;
      lastAgentName: string;
      lastSector: string;
    }>();

    sales.forEach((s) => {
      const plate = s.plateNumber.toUpperCase().trim();
      if (!plate) return;

      const existing = map.get(plate);
      if (!existing) {
        map.set(plate, {
          plateNumber: plate,
          lastDriverPhone: s.driverPhone || '—',
          lastSeen: s.soldAt,
          totalPassages: 1,
          lastAgentName: s.agentName,
          lastSector: s.sectorName || 'Vridi Port',
        });
      } else {
        existing.totalPassages += 1;
        if (new Date(s.soldAt) > new Date(existing.lastSeen)) {
          existing.lastSeen = s.soldAt;
          existing.lastDriverPhone = s.driverPhone || existing.lastDriverPhone;
          existing.lastAgentName = s.agentName;
          existing.lastSector = s.sectorName || existing.lastSector;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  }, [sales]);

  const filteredRegistry = useMemo(() => {
    return registryMap.filter((item) =>
      item.plateNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.lastDriverPhone.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.lastAgentName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [registryMap, searchTerm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col max-h-[90vh]">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Registre Flotte & Contacts Chauffeurs CEDEAO</h2>
              <p className="text-xs text-slate-400">
                Base centralisée des immatriculations et contacts chauffeurs ({registryMap.length} camions référencés)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre de recherche et actions */}
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-950/50">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrer par immatriculation ou téléphone..."
              className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            onClick={() => exportSalesToExcel(sales)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition cursor-pointer w-full sm:w-auto justify-center"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exporter le Registre (Excel)</span>
          </button>
        </div>

        {/* Liste des camions */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredRegistry.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs">
              Aucun camion enregistré dans le registre pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-4 font-bold">Immatriculation</th>
                    <th className="py-3 px-4 font-bold">Téléphone Chauffeur</th>
                    <th className="py-3 px-4 font-bold">Passages</th>
                    <th className="py-3 px-4 font-bold">Dernier Agent</th>
                    <th className="py-3 px-4 font-bold">Dernier Passage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRegistry.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        {formatPlateDisplay(item.plateNumber)}
                      </td>
                      <td className="py-3 px-4 font-mono text-white flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {item.lastDriverPhone}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center rounded-full bg-slate-800 px-2.5 py-0.5 font-bold text-slate-300">
                          {item.totalPassages} passage(s)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300">{item.lastAgentName}</td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {formatDateTime(item.lastSeen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pied de modal */}
        <div className="border-t border-slate-800 p-4 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
