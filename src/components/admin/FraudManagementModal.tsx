import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Camera,
  MessageSquare,
  History,
  FileCheck,
  ChevronRight,
  ChevronLeft,
  Eye,
  AlertTriangle,
  Send,
  FileSpreadsheet,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { FRAUD_STATUSES, FRAUD_TYPES } from '../../config/constants';
import { formatDateTime, formatPlateDisplay } from '../../utils/normalization';
import type { FraudReport, FraudReportStatus } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialFilterStatus?: FraudReportStatus | 'ALL';
}

export const FraudManagementModal: React.FC<Props> = ({
  isOpen,
  onClose,
  initialFilterStatus = 'ALL',
}) => {
  const { currentUser } = useAuth();
  const { fraudReports, updateFraudReportStatus } = useData();

  const [selectedStatusTab, setSelectedStatusTab] = useState<FraudReportStatus | 'ALL'>(initialFilterStatus);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFraud, setSelectedFraud] = useState<FraudReport | null>(null);
  const [activeMobilePane, setActiveMobilePane] = useState<'list' | 'detail'>('list');

  // Formulaire d'arbitrage
  const [decisionStatus, setDecisionStatus] = useState<FraudReportStatus>('CONFIRME');
  const [decisionNote, setDecisionNote] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionSuccess, setDecisionSuccess] = useState(false);

  // Visionneuse de photo en grand format
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  // Calcul des compteurs par statut
  const countAll = fraudReports.length;
  const countNouveau = fraudReports.filter((f) => f.status === 'NOUVEAU').length;
  const countEnCours = fraudReports.filter((f) => f.status === 'EN_COURS').length;
  const countTraite = fraudReports.filter((f) => f.status === 'TRAITE').length;
  const countRejete = fraudReports.filter((f) => f.status === 'REJETE').length;
  const countConfirme = fraudReports.filter((f) => f.status === 'CONFIRME').length;

  const statusCounts: Record<FraudReportStatus | 'ALL', number> = {
    ALL: countAll,
    NOUVEAU: countNouveau,
    EN_COURS: countEnCours,
    TRAITE: countTraite,
    REJETE: countRejete,
    CONFIRME: countConfirme,
  };

  // Filtrage
  const filteredReports = fraudReports.filter((report) => {
    if (selectedStatusTab !== 'ALL' && report.status !== selectedStatusTab) {
      return false;
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchPlate = report.plateNumber.toLowerCase().includes(term);
      const matchTicket = report.ticketNumber?.toLowerCase().includes(term) || false;
      const matchCtrl = report.controleurName.toLowerCase().includes(term);
      const matchType = report.typeLabel?.toLowerCase().includes(term) || false;
      const matchComment = report.comment.toLowerCase().includes(term);
      return matchPlate || matchTicket || matchCtrl || matchType || matchComment;
    }
    return true;
  });

  const handleSelectReport = (report: FraudReport) => {
    setSelectedFraud(report);
    setDecisionStatus(report.status === 'NOUVEAU' ? 'CONFIRME' : report.status);
    setDecisionNote(report.adminDecisionNote || '');
    setDecisionError(null);
    setDecisionSuccess(false);
    setActiveMobilePane('detail');
  };

  const handleApplyDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFraud) return;

    if (!decisionNote.trim()) {
      setDecisionError('Veuillez saisir une motivation écrite obligatoire pour cette décision administrative.');
      return;
    }

    setIsSubmittingDecision(true);
    setDecisionError(null);

    try {
      const updated = await updateFraudReportStatus(
        selectedFraud.id,
        decisionStatus,
        decisionNote.trim()
      );
      setSelectedFraud(updated);
      setDecisionSuccess(true);
      setTimeout(() => setDecisionSuccess(false), 2500);
    } catch (err: any) {
      setDecisionError(err?.message || 'Erreur lors de l’enregistrement de la décision.');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const getStatusBadge = (status: FraudReportStatus) => {
    const meta = FRAUD_STATUSES.find((s) => s.id === status);
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
          meta?.color || 'bg-slate-700 text-slate-300 border-slate-600'
        }`}
      >
        {meta?.label || status}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const meta = FRAUD_TYPES.find((t) => t.id === type);
    return (
      <span
        className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold border ${
          meta?.badgeColor || 'bg-rose-500/20 text-rose-300 border-rose-500/30'
        }`}
      >
        {meta?.label || type}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl text-slate-100 h-[92vh] flex flex-col overflow-hidden">
        {/* ========================================================================= */}
        {/* EN-TÊTE PRINCIPAL                                                         */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600 to-rose-800 shadow-md shadow-rose-950/60 text-white">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Gestion des Signalements de Fraude & Décisions Administratives
                </h2>
                <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold text-rose-300 border border-rose-500/30">
                  {countNouveau} nouveau{countNouveau > 1 ? 'x' : ''} à traiter
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Arbitrage contradictoire, traçabilité des pièces à conviction et audit des décisions.
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

        {/* ========================================================================= */}
        {/* ONGLETS PAR STATUT & BARRE DE RECHERCHE                                   */}
        {/* ========================================================================= */}
        <div className="border-b border-slate-800 bg-slate-950/70 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Onglets des 5 statuts demandés */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => {
                setSelectedStatusTab('ALL');
                setActiveMobilePane('list');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                selectedStatusTab === 'ALL'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span>Tous</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
                {statusCounts.ALL}
              </span>
            </button>

            {FRAUD_STATUSES.map((st) => (
              <button
                key={st.id}
                onClick={() => {
                  setSelectedStatusTab(st.id);
                  setActiveMobilePane('list');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  selectedStatusTab === st.id
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span>{st.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    st.id === 'NOUVEAU' && statusCounts.NOUVEAU > 0
                      ? 'bg-rose-500 text-white font-black animate-pulse'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {statusCounts[st.id]}
                </span>
              </button>
            ))}
          </div>

          {/* Recherche */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setActiveMobilePane('list');
              }}
              placeholder="Immat, ticket, motif, contrôleur..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CORPS : LISTE GAUCHE (60%) + FICHE DÉTAILLÉE ARBITRAGE DROITE (40%)        */}
        {/* ========================================================================= */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-slate-900/30">
          {/* COLONNE GAUCHE : TABLEAU / LISTE DES SIGNALEMENTS */}
          <div className={`lg:col-span-7 border-r border-slate-800/80 overflow-y-auto p-4 space-y-3 ${activeMobilePane === 'list' ? 'block' : 'hidden lg:block'}`}>
            {filteredReports.length === 0 ? (
              <div className="py-24 text-center space-y-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-500">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-slate-400">
                  Aucun signalement de fraude ne correspond à ces critères.
                </p>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Tous les signalements transmis par les contrôleurs routiers apparaîtront ici.
                </p>
              </div>
            ) : (
              filteredReports.map((report) => {
                const isSelected = selectedFraud?.id === report.id;
                const photoCount = report.photos?.length || (report.photoDataUrl ? 1 : 0);

                return (
                  <div
                    key={report.id}
                    onClick={() => handleSelectReport(report)}
                    className={`p-4 rounded-xl border transition cursor-pointer space-y-2.5 ${
                      isSelected
                        ? 'border-rose-500/85 bg-rose-500/[0.04] shadow-md shadow-rose-950/20'
                        : 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/50 hover:border-slate-700/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getTypeBadge(report.type || report.reason || 'AUTRE')}
                        <span className="font-mono font-bold text-xs text-white bg-slate-950 px-2.5 py-1 rounded-md border border-slate-850 tracking-wider">
                          {formatPlateDisplay(report.plateNumber)}
                        </span>
                        {report.ticketNumber && (
                          <span className="font-mono text-slate-400 text-[11px] bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/35">
                            Ticket : {report.ticketNumber}
                          </span>
                        )}
                      </div>
                      <div>{getStatusBadge(report.status)}</div>
                    </div>

                    {/* Commentaire résumé */}
                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/40">
                      {report.comment}
                    </p>

                    {/* Métadonnées & photos */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                      <div className="flex items-center gap-2">
                        <span>Par : <strong className="text-slate-200">{report.controleurName}</strong></span>
                        <span>•</span>
                        <span className="font-mono text-slate-450">{formatDateTime(report.reportedAt)}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {photoCount > 0 ? (
                          <span className="flex items-center gap-1 text-emerald-400 font-bold text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                            <Camera className="w-3 h-3" />
                            {photoCount} photo{photoCount > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">Sans photo</span>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* COLONNE DROITE : DOSSIER D'ARBITRAGE ADMINISTRATIF */}
          <div className={`lg:col-span-5 bg-slate-950/40 overflow-y-auto p-5 flex flex-col justify-between ${activeMobilePane === 'detail' ? 'block' : 'hidden lg:block'}`}>
            {selectedFraud ? (
              <div className="space-y-4">
                {/* Bouton Retour pour Mobile */}
                <button
                  type="button"
                  onClick={() => setActiveMobilePane('list')}
                  className="flex items-center gap-1.5 text-xs text-rose-400 font-bold mb-4 hover:text-rose-300 lg:hidden px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Retour à la liste des dossiers</span>
                </button>

                {/* En-tête du dossier sélectionné */}
                <div className="border-b border-slate-800 pb-3 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-white">Dossier #{selectedFraud.id}</h3>
                      {getStatusBadge(selectedFraud.status)}
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Constaté le {formatDateTime(selectedFraud.reportedAt)}
                    </p>
                  </div>
                  {getTypeBadge(selectedFraud.type || selectedFraud.reason || 'AUTRE')}
                </div>

                {/* Données d'identification */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900 p-3 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Immatriculation</span>
                    <span className="font-mono font-black text-white text-sm">
                      {formatPlateDisplay(selectedFraud.plateNumber)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Ticket Associé</span>
                    <span className="font-mono font-bold text-amber-400">
                      {selectedFraud.ticketNumber || 'Aucun ticket présenté'}
                    </span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Agent Contrôleur</span>
                      <span className="text-slate-200 font-semibold">{selectedFraud.controleurName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold text-right">GPS</span>
                      {selectedFraud.gpsLatitude != null ? (
                        <span className="flex items-center gap-1 font-mono text-[11px] text-emerald-400">
                          <MapPin className="w-3 h-3" />
                          {selectedFraud.gpsLatitude.toFixed(4)}, {selectedFraud.gpsLongitude?.toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">Non disponible</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Motif circonstancié & commentaire */}
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-rose-400" />
                    <span>Constat du Contrôleur</span>
                  </h4>
                  <div className="p-3 rounded-xl border border-slate-800 bg-slate-900 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {selectedFraud.comment}
                  </div>
                </div>

                {/* Photos de preuve */}
                {((selectedFraud.photos && selectedFraud.photos.length > 0) || selectedFraud.photoDataUrl) && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Pièces Photographiques (Preuves locales)</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {(selectedFraud.photos && selectedFraud.photos.length > 0
                        ? selectedFraud.photos
                        : [selectedFraud.photoDataUrl!]
                      ).map((imgUrl, i) => (
                        <div
                          key={i}
                          onClick={() => setPreviewPhotoUrl(imgUrl)}
                          className="group relative aspect-video rounded-xl overflow-hidden border border-slate-700 bg-slate-900 cursor-pointer"
                        >
                          <img
                            src={imgUrl}
                            alt={`Preuve ${i + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs gap-1 font-bold">
                            <Eye className="w-4 h-4" /> Agrandir
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Historique des traitements administratifs */}
                {selectedFraud.processingHistory && selectedFraud.processingHistory.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-blue-400" />
                      <span>Historique de Traitement Administratif</span>
                    </h4>
                    <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                      {selectedFraud.processingHistory.map((hist) => (
                        <div
                          key={hist.id}
                          className="p-2 rounded-lg border border-slate-800 bg-slate-900/80 text-[11px] space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200">{hist.adminName}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {formatDateTime(hist.processedAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Statut :</span>
                            <span className="font-bold text-slate-300">{hist.fromStatus}</span>
                            <span className="text-slate-500">→</span>
                            <span className="font-bold text-rose-400">{hist.toStatus}</span>
                          </div>
                          <p className="text-slate-300 italic bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
                            "{hist.decisionNote}"
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* FORMULAIRE DE PRISE DE DÉCISION ADMINISTRATIVE */}
                <form
                  onSubmit={handleApplyDecision}
                  className="rounded-xl border border-rose-500/30 bg-rose-950/10 p-3.5 space-y-3"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300 uppercase tracking-wider">
                    <FileCheck className="w-4 h-4 text-rose-400" />
                    <span>Enregistrer une Décision Administrative</span>
                  </div>

                  {decisionError && (
                    <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px]">
                      {decisionError}
                    </div>
                  )}

                  {decisionSuccess && (
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Décision enregistrée et auditée avec succès.
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Nouveau Statut
                    </label>
                    <select
                      value={decisionStatus}
                      onChange={(e) => setDecisionStatus(e.target.value as FraudReportStatus)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-rose-500 focus:outline-hidden"
                    >
                      <option value="EN_COURS">EN COURS (En cours d'investigation)</option>
                      <option value="CONFIRME">CONFIRMÉ (Fraude avérée)</option>
                      <option value="REJETE">REJETÉ (Fausse alerte / Ticket régulier)</option>
                      <option value="TRAITE">TRAITÉ (Dossier clos / Sanction appliquée)</option>
                      <option value="NOUVEAU">NOUVEAU (Remettre en attente)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Motivation de la décision (Inaltérable & Auditée) <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={decisionNote}
                      onChange={(e) => setDecisionNote(e.target.value)}
                      placeholder="Indiquez les raisons de la confirmation, du rejet ou des instructions transmises..."
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <p className="text-[10px] text-slate-400 italic">
                      Traçabilité garantie dans l'Audit Trail.
                    </p>
                    <button
                      type="submit"
                      disabled={isSubmittingDecision}
                      className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 transition shadow-md disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSubmittingDecision ? 'Enregistrement...' : 'Valider la Décision'}</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-3">
                <button
                  type="button"
                  onClick={() => setActiveMobilePane('list')}
                  className="flex items-center gap-1.5 text-xs text-rose-400 font-bold mb-2 hover:text-rose-300 lg:hidden px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 transition"
                >
                  <ChevronLeft className="w-4 h-4" /> Retour à la liste
                </button>
                <FileCheck className="w-12 h-12 text-slate-700" />
                <h4 className="text-sm font-bold text-slate-400">Aucun signalement sélectionné</h4>
                <p className="text-xs max-w-xs leading-relaxed">
                  Sélectionnez un signalement dans la liste pour consulter les preuves, les photos et consigner l’arbitrage administratif.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* PIED DU MODAL */}
        <div className="border-t border-slate-800 p-3 bg-slate-900 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>
              Total de {countAll} signalement(s) répertorié(s) — Conservation locale et réplication Cloud.
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
          >
            Fermer
          </button>
        </div>
      </div>

      {/* MODAL VISIONNEUSE PHOTO PLEIN ÉCRAN */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-70 bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] flex flex-col items-center">
            <img
              src={previewPhotoUrl}
              alt="Preuve agrandie"
              className="max-h-[80vh] w-auto rounded-2xl object-contain shadow-2xl border border-slate-800"
            />
            <button
              onClick={() => setPreviewPhotoUrl(null)}
              className="mt-3 rounded-full bg-slate-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-700 transition"
            >
              Fermer l'aperçu
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
