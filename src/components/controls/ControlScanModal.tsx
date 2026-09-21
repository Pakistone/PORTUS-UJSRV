import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertOctagon,
  ShieldAlert,
  MapPin,
  Clock,
  Phone,
  User,
  Car,
  FileText,
  Wifi,
  WifiOff,
  Sparkles,
  Camera,
  RotateCcw,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { formatDateTime, formatPlateDisplay, normalizePlate, normalizeText } from '../../utils/normalization';
import { FraudReportModal } from './FraudReportModal';
import { QrCameraScanner } from './QrCameraScanner';
import type { Ticket, Control } from '../../types';
import type { VerifyTicketResult } from '../../context/DataContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ControlScanModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { verifyTicket, searchTicketsByPlate, recordControl, tickets, isOnline } = useData();

  // Mode actif : 'CAMERA' ou 'MANUAL'
  const [mode, setMode] = useState<'CAMERA' | 'MANUAL'>('CAMERA');
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Résultat d'une vérification unique
  const [result, setResult] = useState<VerifyTicketResult | null>(null);

  // Résultats d'une recherche manuelle par plaque (si plusieurs tickets trouvés)
  const [plateSearchResults, setPlateSearchResults] = useState<Ticket[] | null>(null);

  // Message de confirmation après enregistrement du contrôle
  const [recordedControl, setRecordedControl] = useState<Control | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Modal de signalement de fraude
  const [fraudModalOpen, setFraudModalOpen] = useState(false);

  // Réinitialiser à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setPlateSearchResults(null);
      setRecordedControl(null);
      setInputQuery('');
      setMode('CAMERA');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Récupérer quelques tickets récents d'exemple
  const sampleTickets = tickets.filter((t) => t.status === 'SOLD' || t.status === 'CONTROLLED').slice(0, 4);

  // ----------------------------------------------------
  // Gestion du Scan QR par Caméra
  // ----------------------------------------------------
  const handleQrScan = async (rawCode: string) => {
    if (!rawCode || loading) return;
    setLoading(true);
    setRecordedControl(null);
    setPlateSearchResults(null);

    try {
      const res = await verifyTicket(rawCode);
      setResult(res);
      // Auto-enregistrement automatique du contrôle pour accélérer le travail sur le corridor
      await autoRecordControl(res);
    } catch (err: any) {
      setResult({
        status: 'INVALID_UNKNOWN',
        bannerTitle: '🔴 TICKET INVALIDE — QR CODE NON RECONNU',
        ticket: null,
        agentName: null,
        agentPhone: null,
        verifiedVia: isOnline ? 'SERVER' : 'LOCAL_CACHE',
        message: err?.message || 'Code QR illisible ou non conforme.',
        isRepeatedControl: false,
        previousControlCount: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // Enregistrement d'un contrôle (automatique ou manuel)
  // ----------------------------------------------------
  const autoRecordControl = async (res: VerifyTicketResult) => {
    setIsRecording(true);
    try {
      const ticketNum = res.ticket?.ticketNumber || 'QR_INCONNU';
      // Le contrôleur ne saisit PAS l'immatriculation observée : on prend l'immatriculation enregistrée
      const plateNum = res.ticket?.plateNumber || 'NON_RENSEIGNEE';
      const isValid = res.status === 'VALID';
      const resultType: Control['resultType'] =
        res.status === 'VALID'
          ? 'VALID'
          : res.status === 'CANCELLED'
          ? 'CANCELLED'
          : 'INVALID_UNKNOWN';

      const ctrl = await recordControl({
        ticketNumber: ticketNum,
        plateNumber: plateNum,
        isValid,
        message: res.message,
        resultType,
      });
      setRecordedControl(ctrl);
    } catch (err) {
      console.error('Erreur enregistrement contrôle routier:', err);
    } finally {
      setIsRecording(false);
    }
  };

  // ----------------------------------------------------
  // Recherche Manuelle (Plaque ou Numéro de ticket)
  // ----------------------------------------------------
  const handleManualSearch = async () => {
    const raw = inputQuery.trim();
    if (!raw) return;

    setLoading(true);
    setRecordedControl(null);
    setResult(null);
    setPlateSearchResults(null);

    const cleanPlate = normalizePlate(raw);
    const cleanNum = normalizeText(raw).toUpperCase();

    try {
      // 1. Si la requête ressemble à une immatriculation ou contient des chiffres/lettres
      const plateMatches = await searchTicketsByPlate(cleanPlate);

      if (plateMatches.length > 1) {
        // "Si plusieurs tickets actifs correspondent : afficher tous les résultats pertinents"
        setPlateSearchResults(plateMatches);
        setLoading(false);
        return;
      } else if (plateMatches.length === 1) {
        // Un seul ticket trouvé par plaque : on l'inspecte directement
        const singleTicket = plateMatches[0];
        const res = await verifyTicket(singleTicket.ticketNumber);
        setResult(res);
        await autoRecordControl(res);
        setLoading(false);
        return;
      }

      // 2. Sinon, tentative de vérification directe par numéro de ticket
      const res = await verifyTicket(cleanNum);
      setResult(res);
      await autoRecordControl(res);
    } catch (err: any) {
      setResult({
        status: 'INVALID_UNKNOWN',
        bannerTitle: '🔴 TICKET INVALIDE — QR CODE NON RECONNU',
        ticket: null,
        agentName: null,
        agentPhone: null,
        verifiedVia: isOnline ? 'SERVER' : 'LOCAL_CACHE',
        message: 'Aucun ticket trouvé pour cette immatriculation ou ce numéro.',
        isRepeatedControl: false,
        previousControlCount: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTicketFromMulti = async (t: Ticket) => {
    setLoading(true);
    try {
      const res = await verifyTicket(t.ticketNumber);
      setResult(res);
      setPlateSearchResults(null);
      await autoRecordControl(res);
    } catch (err) {
      console.error('Erreur sélection ticket', err);
    } finally {
      setLoading(false);
    }
  };

  const resetToCamera = () => {
    setResult(null);
    setPlateSearchResults(null);
    setRecordedControl(null);
    setInputQuery('');
    setMode('CAMERA');
  };

  // ----------------------------------------------------
  // Rendu de la bannière de statut selon les exigences
  // ----------------------------------------------------
  const renderStatusBanner = () => {
    if (!result) return null;

    if (result.status === 'VALID') {
      return (
        <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-950/60 p-5 shadow-lg shadow-emerald-950/40 text-center space-y-2 animate-in fade-in zoom-in-95 duration-200">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-emerald-300 tracking-wide">
            🟢 TICKET VALIDE — AUTORISÉ
          </h2>
          <p className="text-xs text-emerald-200/90 max-w-md mx-auto">
            {result.message}
          </p>
        </div>
      );
    }

    if (result.status === 'CANCELLED') {
      return (
        <div className="rounded-2xl border-2 border-rose-600 bg-rose-950/60 p-5 shadow-lg shadow-rose-950/40 text-center space-y-2 animate-in fade-in zoom-in-95 duration-200">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <XCircle className="w-9 h-9" />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-rose-300 tracking-wide">
            ❌ TICKET ANNULÉ — NON VALIDE
          </h2>
          <p className="text-xs text-rose-200/90 max-w-md mx-auto">
            {result.message}
          </p>
        </div>
      );
    }

    if (result.status === 'INVALID_UNKNOWN') {
      return (
        <div className="rounded-2xl border-2 border-rose-500 bg-rose-950/70 p-5 shadow-lg shadow-rose-950/40 text-center space-y-2 animate-in fade-in zoom-in-95 duration-200">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <AlertOctagon className="w-9 h-9" />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-rose-200 tracking-wide">
            🔴 TICKET INVALIDE — QR CODE NON RECONNU
          </h2>
          <p className="text-xs text-rose-200/90 max-w-md mx-auto">
            Ce code ne correspond à aucun ticket officiel dans la base de données de l’U.J.S.R.V.
          </p>
        </div>
      );
    }

    if (result.status === 'SUPERSEDED') {
      return (
        <div className="rounded-2xl border-2 border-amber-500 bg-amber-950/60 p-5 shadow-lg shadow-amber-950/40 text-center space-y-2 animate-in fade-in zoom-in-95 duration-200">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-9 h-9" />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-amber-300 tracking-wide">
            ⚠️ TICKET INACTIF — REMPLACÉ PAR UN NOUVEAU TICKET
          </h2>
          <p className="text-xs text-amber-200/90 max-w-md mx-auto">
            {result.message}
          </p>
        </div>
      );
    }

    // Par défaut / non vendu
    return (
      <div className="rounded-2xl border-2 border-rose-500 bg-rose-950/60 p-5 shadow-lg shadow-rose-950/40 text-center space-y-2 animate-in fade-in zoom-in-95 duration-200">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
          <AlertTriangle className="w-9 h-9" />
        </div>
        <h2 className="text-lg sm:text-xl font-black text-rose-300 tracking-wide">
          🔴 TICKET INVALIDE — NON ENCORE VENDU
        </h2>
        <p className="text-xs text-rose-200/90 max-w-md mx-auto">
          {result.message}
        </p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl text-slate-100 max-h-[95vh] flex flex-col overflow-hidden">
        {/* En-tête avec indicateurs de connexion */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Module Contrôleur</h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isOnline
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  <span>{isOnline ? 'Serveur En Ligne' : 'Cache Hors Ligne'}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Contrôle de conformité des véhicules sur le corridor portuaire
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

        {/* Sélecteur de mode : Caméra vs Recherche Manuelle */}
        {!result && !plateSearchResults && (
          <div className="px-5 pt-3 pb-1 border-b border-slate-800 bg-slate-900/50">
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setMode('CAMERA')}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition ${
                  mode === 'CAMERA'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Scanner Caméra</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('MANUAL')}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition ${
                  mode === 'MANUAL'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Search className="w-4 h-4" />
                <span>Recherche Manuelle</span>
              </button>
            </div>
          </div>
        )}

        {/* Corps principal défilable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* ================================================================ */}
          {/* ÉCRAN 1 : SCANNER CAMÉRA EN DIRECT                               */}
          {/* ================================================================ */}
          {mode === 'CAMERA' && !result && !plateSearchResults && (
            <div className="space-y-3">
              <QrCameraScanner
                isActive={isOpen && mode === 'CAMERA'}
                onScan={handleQrScan}
                onCloseScanner={() => setMode('MANUAL')}
              />

              <div className="text-center space-y-1 pt-1">
                <p className="text-xs text-slate-400 font-medium">
                  Dirigez la caméra vers le QR Code imprimé sur la quittance physique.
                </p>
                <p className="text-[11px] text-slate-500">
                  {isOnline
                    ? '📡 Vérification automatique en direct sur la base serveur.'
                    : '📦 Mode hors-ligne : vérification instantanée sur le cache local.'}
                </p>
              </div>

              {/* Raccourcis de test rapide sur simulateur/desktop */}
              {sampleTickets.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1.5 mt-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" /> Simulation rapide (cliquer pour tester) :
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {sampleTickets.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => handleQrScan(st.ticketNumber)}
                        className="rounded-md border border-slate-700 bg-slate-800/90 px-2 py-1 text-[11px] font-mono text-slate-300 hover:border-amber-500 hover:text-white transition"
                      >
                        {st.ticketNumber} ({formatPlateDisplay(st.plateNumber || '—')})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* ÉCRAN 2 : RECHERCHE MANUELLE PAR IMMATRICULATION OU TICKET        */}
          {/* ================================================================ */}
          {mode === 'MANUAL' && !result && !plateSearchResults && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Rechercher par Immatriculation ou N° Ticket
                </label>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                    placeholder="Ex: AB1234CD ou VRD-000101"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 py-3.5 pl-4 pr-24 text-base font-mono font-bold text-white uppercase tracking-wider focus:border-amber-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleManualSearch}
                    disabled={loading || !inputQuery.trim()}
                    className="absolute right-1.5 top-1.5 bottom-1.5 flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-500 transition disabled:opacity-50"
                  >
                    <Search className="w-4 h-4" />
                    <span>Rechercher</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  La recherche par immatriculation affichera tous les tickets actifs correspondants.
                </p>
              </div>

              {/* Exemples cliquables */}
              {sampleTickets.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                    Tickets récents dans la base locale :
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {sampleTickets.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setInputQuery(st.plateNumber || st.ticketNumber);
                          handleQrScan(st.ticketNumber);
                        }}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-800 bg-slate-950 hover:border-amber-500/50 hover:bg-slate-800 transition text-left"
                      >
                        <div>
                          <div className="font-mono font-bold text-emerald-400 text-xs">
                            {formatPlateDisplay(st.plateNumber || 'NON DÉFINIE')}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {st.ticketNumber}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {st.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* ÉCRAN 3 : MULTIPLES TICKETS TROUVÉS POUR UNE IMMATRICULATION     */}
          {/* ================================================================ */}
          {plateSearchResults && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Plusieurs tickets trouvés pour cette immatriculation
                  </h4>
                  <p className="text-xs text-slate-400">
                    Sélectionnez le ticket physique présenté par le chauffeur pour validation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetToCamera}
                  className="text-xs text-amber-400 hover:underline font-bold"
                >
                  Nouvelle recherche
                </button>
              </div>

              <div className="space-y-2">
                {plateSearchResults.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleSelectTicketFromMulti(t)}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-950 hover:border-amber-500 cursor-pointer transition space-y-2 hover:bg-slate-800/40"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-white text-sm">
                          {t.ticketNumber}
                        </span>
                        <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-xs border border-emerald-500/20">
                          {formatPlateDisplay(t.plateNumber || '—')}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          t.status === 'SOLD' || t.status === 'CONTROLLED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : t.status === 'CANCELLED'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                      <div>
                        Vendu le : <span className="text-slate-300 font-medium">{formatDateTime(t.soldAt)}</span>
                      </div>
                      <div>
                        Agent : <span className="text-slate-300 font-medium">{t.assignedAgentName || '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* ÉCRAN 4 : RÉSULTAT DU CONTRÔLE DÉTAILLÉ                          */}
          {/* ================================================================ */}
          {result && (
            <div className="space-y-4">
              {/* Bannière principale */}
              {renderStatusBanner()}

              {/* Fiche d'informations requises pour le contrôle */}
              {result.ticket && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-slate-400 font-medium">Numéro de ticket :</span>
                    <span className="font-mono font-black text-white text-sm sm:text-base">
                      {result.ticket.ticketNumber}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-slate-400 font-medium">Statut officiel :</span>
                    <span
                      className={`font-bold px-2.5 py-0.5 rounded-full text-[11px] ${
                        result.ticket.status === 'SOLD' || result.ticket.status === 'CONTROLLED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {result.ticket.status === 'SOLD'
                        ? 'VALIDE (VENDU)'
                        : result.ticket.status === 'CONTROLLED'
                        ? 'VALIDE (CONTRÔLÉ)'
                        : result.ticket.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-slate-400 font-medium flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5 text-slate-400" />
                      <span>Immatriculation enregistrée :</span>
                    </span>
                    <span className="font-mono font-black text-emerald-400 text-sm bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                      {result.ticket.plateNumber
                        ? formatPlateDisplay(result.ticket.plateNumber)
                        : 'Non renseignée'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-slate-400 font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Date et heure de vente :</span>
                    </span>
                    <span className="text-slate-200 font-semibold font-mono">
                      {formatDateTime(result.ticket.soldAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-slate-400 font-medium flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>Nom de l'agent vendeur :</span>
                    </span>
                    <span className="text-white font-bold">
                      {result.agentName || result.ticket.assignedAgentName || 'Agent U.J.S.R.V.'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-slate-400 font-medium flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Téléphone de l'agent :</span>
                    </span>
                    {result.agentPhone ? (
                      <a
                        href={`tel:${result.agentPhone}`}
                        className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-bold font-mono underline"
                        title="Appeler l'agent"
                      >
                        <Phone className="w-3 h-3" />
                        <span>{result.agentPhone}</span>
                      </a>
                    ) : (
                      <span className="text-slate-500 italic">Non renseigné</span>
                    )}
                  </div>

                  {/* Informations nécessaires au contrôle */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Carnet d'origine :</span>
                      <span className="font-mono text-slate-300">{result.ticket.carnetNumber}</span>
                    </div>
                    {result.ticket.sectorName && (
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Secteur de vente :</span>
                        <span className="text-slate-300">{result.ticket.sectorName}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Source de vérification :</span>
                      <span className="font-semibold text-slate-300">
                        {result.verifiedVia === 'SERVER'
                          ? '📡 Serveur Central (Temps Réel)'
                          : '📦 Base Locale (Cache Hors Ligne)'}
                      </span>
                    </div>

                    {/* Historique des contrôles : conservé et affiché informativement, SANS alerte rouge "DÉJÀ CONTRÔLÉ" */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                      <span>Historique de passage :</span>
                      <span className="text-slate-300 font-medium">
                        {result.previousControlCount > 0 ? (
                          <span>
                            Déjà contrôlé <strong className="text-white">{result.previousControlCount}</strong> fois
                            {result.ticket.lastControlledAt && (
                              <span className="text-slate-400">
                                {' '}• Dernier passage : {formatDateTime(result.ticket.lastControlledAt)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-emerald-400">Premier passage de contrôle aujourd'hui</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmation d'enregistrement automatique du contrôle */}
              {recordedControl && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-300 space-y-1 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Contrôle routier automatiquement horodaté & enregistré !</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-emerald-200/80 font-mono">
                    <span>Heure : {formatDateTime(recordedControl.controlledAt)}</span>
                    <span>
                      GPS :{' '}
                      {recordedControl.gpsStatus === 'AVAILABLE'
                        ? `${recordedControl.gpsLatitude?.toFixed(4)}, ${recordedControl.gpsLongitude?.toFixed(4)}`
                        : 'Non disponible'}
                    </span>
                    <span>
                      Mode : {recordedControl.isOnline ? 'En ligne (synchronisé)' : 'Hors ligne (en attente)'}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions du contrôleur */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetToCamera}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 py-3 text-xs font-bold text-white transition shadow-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Scanner le Véhicule Suivant</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFraudModalOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-600/20 border border-rose-500/40 px-4 py-3 text-xs font-bold text-rose-300 hover:bg-rose-600/30 transition"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>Signaler Fraude</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pied de page du modal */}
        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3 bg-slate-900/90 text-xs">
          <div className="text-[11px] text-slate-500">
            {mode === 'CAMERA' ? 'Mode Scanner Vidéo Actif' : 'Mode Saisie Manuelle'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-1.5 font-bold text-slate-300 transition"
          >
            Fermer
          </button>
        </div>

        {/* Modal de signalement de fraude */}
        {fraudModalOpen && (
          <FraudReportModal
            isOpen={fraudModalOpen}
            onClose={() => setFraudModalOpen(false)}
            defaultTicketNumber={result?.ticket?.ticketNumber || inputQuery}
            defaultPlateNumber={result?.ticket?.plateNumber || inputQuery}
          />
        )}
      </div>
    </div>
  );
};
