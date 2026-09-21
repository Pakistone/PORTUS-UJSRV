import React, { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Users, Phone, MapPin, Clock, Shield, AlertCircle } from 'lucide-react';
import { formatFCFA, formatDateTime } from '../../utils/normalization';

interface AgentDirectoryViewProps {
  viewMode?: 'CONTROLEUR' | 'RESPONSABLE' | 'ADMIN';
}

export const AgentDirectoryView: React.FC<AgentDirectoryViewProps> = ({ viewMode = 'ADMIN' }) => {
  const { currentUser } = useAuth();
  const { users, sales, tickets, remises } = useData();

  // Liste de tous les agents (rôle AGENT)
  const agents = useMemo(() => {
    return users.filter((u) => u.role === 'AGENT');
  }, [users]);

  // Calculs pour la vue Responsable (étanchéité financière)
  const responsableStats = useMemo(() => {
    if (viewMode !== 'RESPONSABLE' && currentUser?.role !== 'RESPONSABLE') return new Map();

    const stats = new Map<string, {
      ticketsVendusCeResp: number;
      montantAttendu: number;
      montantRemis: number;
      soldeDu: number;
      otherRespTicketsCount: number;
      otherRespNames: Set<string>;
    }>();

    agents.forEach((agent) => {
      // Tickets confiés par le responsable connecté
      const agentTickets = tickets.filter((t) => t.assignedAgentId === agent.id);
      
      const ticketsCeResp = agentTickets.filter((t) => t.assignedResponsableId === currentUser?.id);
      const soldTicketsCeResp = ticketsCeResp.filter((t) => t.status === 'SOLD');
      const montantAttendu = soldTicketsCeResp.length * 5000;

      // Remises encaissées par ce responsable auprès de cet agent
      const agentRemises = remises.filter(
        (r) => r.agentId === agent.id && r.responsableId === currentUser?.id
      );
      const montantRemis = agentRemises.reduce((sum, r) => sum + r.amount, 0);

      // Tickets d'autres responsables
      const otherRespTickets = agentTickets.filter(
        (t) => t.assignedResponsableId && t.assignedResponsableId !== currentUser?.id
      );
      const otherRespNames = new Set<string>();
      otherRespTickets.forEach((t) => {
        if (t.assignedResponsableName) otherRespNames.add(t.assignedResponsableName);
      });

      stats.set(agent.id, {
        ticketsVendusCeResp: soldTicketsCeResp.length,
        montantAttendu,
        montantRemis,
        soldeDu: montantAttendu - montantRemis,
        otherRespTicketsCount: otherRespTickets.length,
        otherRespNames,
      });
    });

    return stats;
  }, [agents, tickets, remises, currentUser, viewMode]);

  // Dernière position GPS connue issue des ventes pour chaque agent
  const agentLastGpsMap = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number; accuracy?: number; time: string }>();
    
    const sortedSales = [...sales].sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());

    sortedSales.forEach((s) => {
      if (s.agentId && s.gpsStatus === 'AVAILABLE' && s.gpsLatitude != null && s.gpsLongitude != null && !map.has(s.agentId)) {
        map.set(s.agentId, {
          lat: s.gpsLatitude,
          lng: s.gpsLongitude,
          accuracy: s.gpsAccuracy ?? undefined,
          time: s.soldAt,
        });
      }
    });

    return map;
  }, [sales]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <span>Annuaire & Suivi des Agents Terrain</span>
          </h2>
          <p className="text-xs text-slate-400">
            {viewMode === 'CONTROLEUR'
              ? 'Vue Contrôleur : Contacts directs et dernière position GPS terrain'
              : viewMode === 'RESPONSABLE'
              ? 'Vue Responsable : Suivi financier étanche des agents de votre lot'
              : 'Vue Globale Annuaire Agents'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const gps = agentLastGpsMap.get(agent.id);
          const rStats = responsableStats.get(agent.id);

          return (
            <div
              key={agent.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg flex flex-col justify-between space-y-4 hover:border-slate-700 transition"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">{agent.fullName}</h3>
                    <p className="text-xs text-slate-400 font-mono">@{agent.username}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                    {agent.sectorName || 'Vridi Port'}
                  </span>
                </div>

                {/* Téléphone & Appel direct */}
                <div className="pt-2 flex items-center justify-between border-t border-slate-800/80">
                  <span className="text-xs text-slate-400">Téléphone :</span>
                  {agent.phone ? (
                    <a
                      href={`tel:${agent.phone}`}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-mono font-bold text-emerald-300 hover:bg-emerald-600/30 transition"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{agent.phone}</span>
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500 italic">Non renseigné</span>
                  )}
                </div>
              </div>

              {/* Spécificité Vue Contrôleur : GPS uniquement */}
              {viewMode === 'CONTROLEUR' && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-300">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <span>Dernière position GPS connue :</span>
                  </div>
                  {gps ? (
                    <div className="space-y-1 font-mono text-[11px] text-slate-300 pl-5">
                      <div>Lat, Lng : {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</div>
                      {gps.accuracy && <div>Précision : ±{gps.accuracy}m</div>}
                      <div className="text-slate-400 flex items-center gap-1 pt-0.5">
                        <Clock className="w-3 h-3 text-blue-400" />
                        <span>{formatDateTime(gps.time)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="pl-5 text-slate-500 italic text-[11px]">
                      Aucune position GPS récente (pas de vente enregistrée aujourd'hui).
                    </div>
                  )}
                </div>
              )}

              {/* Spécificité Vue Responsable : Chiffres étanches */}
              {viewMode === 'RESPONSABLE' && rStats && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                    <span className="text-slate-400">Tickets vendus (vos lots) :</span>
                    <span className="font-bold text-white font-mono">{rStats.ticketsVendusCeResp}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                    <span className="text-slate-400">Montant attendu :</span>
                    <span className="font-bold text-emerald-400 font-mono">{formatFCFA(rStats.montantAttendu)}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                    <span className="text-slate-400">Montant remis :</span>
                    <span className="font-bold text-blue-400 font-mono">{formatFCFA(rStats.montantRemis)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold">Solde dû :</span>
                    <span className={`font-bold font-mono ${rStats.soldeDu > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {formatFCFA(rStats.soldeDu)}
                    </span>
                  </div>

                  {rStats.otherRespTicketsCount > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 italic">
                      ℹ️ {rStats.otherRespTicketsCount} autre(s) ticket(s) en main (remis par Resp.{' '}
                      {Array.from(rStats.otherRespNames).join(', ')})
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
