import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  FileSpreadsheet,
  HandCoins,
  Receipt,
  User,
  MapPin,
  Calendar,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import { formatFCFA, formatDateTime } from '../../utils/normalization';
import { exportVentesARemettreToExcel } from '../../utils/excelExport';
import { RemiseFormModal } from './RemiseFormModal';
import type { Sale } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preselectedAgentId?: string;
}

export const VentesARemettreModal: React.FC<Props> = ({
  isOpen,
  onClose,
  preselectedAgentId,
}) => {
  const { currentUser } = useAuth();
  const { tickets, sales, users } = useData();

  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>(preselectedAgentId || '');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [remiseModalAgentId, setRemiseModalAgentId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Liste des agents éligibles selon le rôle de l'utilisateur
  const eligibleAgents = users.filter((u) => {
    if (u.role !== 'AGENT') return false;
    if (currentUser?.role === 'RESPONSABLE') {
      return !currentUser.sectorId || u.sectorId === currentUser.sectorId;
    }
    return true;
  });

  // Ventes / tickets vendus non encore couverts par une remise
  const unremittedSales = useMemo(() => {
    // Retrouver tous les tickets vendus sans remise associée
    return tickets
      .filter((t) => (t.status === 'SOLD' || t.status === 'CONTROLLED') && !t.coveredByRemiseId)
      .map((t) => {
        const sale = sales.find((s) => s.ticketId === t.id || s.ticketNumber === t.ticketNumber);
        return {
          ticketId: t.id,
          ticketNumber: t.ticketNumber,
          carnetNumber: t.carnetNumber,
          plateNumber: t.plateNumber || sale?.plateNumber || '—',
          soldAt: t.soldAt || sale?.soldAt || t.createdAt,
          price: sale?.price || TICKET_PRICE_FCFA,
          agentId: t.assignedAgentId || sale?.agentId || '',
          agentName: t.assignedAgentName || sale?.agentName || 'Agent Inconnu',
          sectorId: t.sectorId || sale?.sectorId,
          sectorName: t.sectorName || sale?.sectorName || 'Secteur Non Défini',
          driverPhone: t.driverPhone || sale?.driverPhone,
          saleObj: sale,
        };
      })
      .filter((item) => {
        // Filtrage par rôle de l'utilisateur connecté
        if (currentUser?.role === 'AGENT') {
          if (item.agentId !== currentUser.id) return false;
        } else if (currentUser?.role === 'RESPONSABLE') {
          if (currentUser.sectorId && item.sectorId && item.sectorId !== currentUser.sectorId) {
            return false;
          }
        }

        // Filtre Agent
        if (selectedAgentFilter && item.agentId !== selectedAgentFilter) {
          return false;
        }

        // Filtre Secteur
        if (selectedSectorFilter && item.sectorId !== selectedSectorFilter) {
          return false;
        }

        // Recherche par mot clé
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          const matchTicket = item.ticketNumber.toLowerCase().includes(term);
          const matchPlate = item.plateNumber.toLowerCase().includes(term);
          const matchAgent = item.agentName.toLowerCase().includes(term);
          return matchTicket || matchPlate || matchAgent;
        }

        return true;
      })
      .sort((a, b) => b.soldAt.localeCompare(a.soldAt));
  }, [tickets, sales, currentUser, selectedAgentFilter, selectedSectorFilter, searchTerm]);

  const totalTickets = unremittedSales.length;
  const totalExpectedAmount = totalTickets * TICKET_PRICE_FCFA;

  const handleExportExcel = () => {
    // Créer des objets format Sale pour l'exportateur
    const salesForExport: Sale[] = unremittedSales.map((item) => ({
      id: item.ticketId,
      ticketId: item.ticketId,
      ticketNumber: item.ticketNumber,
      agentId: item.agentId,
      agentName: item.agentName,
      sectorId: item.sectorId || '',
      sectorName: item.sectorName,
      plateNumber: item.plateNumber,
      driverPhone: item.driverPhone,
      soldAt: item.soldAt,
      price: item.price,
      gpsLatitude: null,
      gpsLongitude: null,
      gpsAccuracy: null,
      gpsStatus: 'UNAVAILABLE',
      syncStatus: 'SYNCED',
    }));
    exportVentesARemettreToExcel(salesForExport);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs">
        <div className="w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6 shadow-2xl text-slate-100 max-h-[94vh] flex flex-col">
          {/* En-tête */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    Ventes à Remettre (Recettes Non Couvertes)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Registre des tickets vendus sur le terrain en attente de versement financier
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={handleExportExcel}
                disabled={totalTickets === 0}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-600/30 transition disabled:opacity-40 cursor-pointer"
                title="Exporter la liste vers Excel"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Excel</span>
              </button>

              {(currentUser?.role === 'RESPONSABLE' || currentUser?.role === 'ADMINISTRATEUR') && (
                <button
                  onClick={() => setRemiseModalAgentId(selectedAgentFilter || eligibleAgents[0]?.id || '')}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-500 transition shadow-md cursor-pointer"
                >
                  <HandCoins className="w-4 h-4" />
                  <span>Encaisser Remise</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="rounded-xl p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Bandeau de synthèse globale */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
              <span className="text-[10px] uppercase font-bold text-slate-500">Tickets Non Couverts</span>
              <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono mt-0.5">
                {totalTickets}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Tickets vendus à recouvrer</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
              <span className="text-[10px] uppercase font-bold text-slate-500">Montant Total Attendu</span>
              <p className="text-xl sm:text-2xl font-black text-white font-mono mt-0.5">
                {formatFCFA(totalExpectedAmount)}
              </p>
              <p className="text-[11px] text-emerald-400 font-medium mt-0.5">
                Tarif fixe : 5 000 FCFA / unité
              </p>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-800 bg-slate-950 p-3.5 flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold text-slate-500">Statut de Recouvrement</span>
              <p className="text-sm font-bold text-slate-200 mt-1 flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${totalTickets > 0 ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                {totalTickets > 0 ? `${totalTickets} ticket(s) en attente de remise` : 'Aucun versement en attente'}
              </p>
            </div>
          </div>

          {/* Barre de filtres et recherche */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher par ticket, plaque ou agent..."
                className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-2.5 pl-9 pr-3 text-xs text-white focus:outline-hidden focus:border-blue-500"
              />
            </div>

            {currentUser?.role !== 'AGENT' && (
              <div>
                <select
                  value={selectedAgentFilter}
                  onChange={(e) => setSelectedAgentFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-2.5 px-3 text-xs text-white focus:outline-hidden focus:border-blue-500"
                >
                  <option value="">Tous les agents ({eligibleAgents.length})</option>
                  {eligibleAgents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.fullName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {currentUser?.role === 'ADMINISTRATEUR' && (
              <div>
                <select
                  value={selectedSectorFilter}
                  onChange={(e) => setSelectedSectorFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/90 py-2.5 px-3 text-xs text-white focus:outline-hidden focus:border-blue-500"
                >
                  <option value="">Tous les secteurs</option>
                  <option value="sec-vridi-port">VRIDI PORT</option>
                  <option value="sec-zone-indus">ZONE INDUSTRIELLE</option>
                  <option value="sec-autoroute-nord">AUTOROUTE DU NORD</option>
                  <option value="sec-gesco">GESCO</option>
                </select>
              </div>
            )}
          </div>

          {/* Tableau des Ventes à Remettre */}
          <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                <tr>
                  <th className="py-3 px-3">N° Ticket</th>
                  <th className="py-3 px-3">Immatriculation</th>
                  <th className="py-3 px-3">Date & Heure Vente</th>
                  <th className="py-3 px-3">Agent Vendeur</th>
                  <th className="py-3 px-3">Secteur</th>
                  <th className="py-3 px-3 text-right">Montant</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {unremittedSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 font-sans">
                      <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                      Aucune vente à remettre pour les critères sélectionnés.
                    </td>
                  </tr>
                ) : (
                  unremittedSales.map((item) => (
                    <tr key={item.ticketId} className="hover:bg-slate-900/60 transition">
                      <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                        <span className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-emerald-400">
                          {item.ticketNumber}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="rounded bg-slate-900 border border-slate-700 px-2 py-0.5 text-xs font-bold text-white">
                          {item.plateNumber}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap font-sans text-[11px]">
                        {formatDateTime(item.soldAt)}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-200 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{item.agentName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-400 whitespace-nowrap text-[11px]">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>{item.sectorName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-white whitespace-nowrap">
                        {formatFCFA(item.price)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap font-sans">
                        {(currentUser?.role === 'RESPONSABLE' || currentUser?.role === 'ADMINISTRATEUR') && (
                          <button
                            onClick={() => setRemiseModalAgentId(item.agentId)}
                            className="rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-600/30 transition cursor-pointer"
                          >
                            Encaisser
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pied de page du modal */}
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              Total : <strong className="text-white font-mono">{totalTickets}</strong> ticket(s) • Total dû :{' '}
              <strong className="text-emerald-400 font-mono">{formatFCFA(totalExpectedAmount)}</strong>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>

      {/* Modal d'encaissement direct d'une remise */}
      {remiseModalAgentId && (
        <RemiseFormModal
          isOpen={true}
          onClose={() => setRemiseModalAgentId(null)}
          preselectedAgentId={remiseModalAgentId}
        />
      )}
    </>
  );
};
