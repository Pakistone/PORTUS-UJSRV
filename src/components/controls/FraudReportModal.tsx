import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  Camera,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Plus,
  Wifi,
  WifiOff,
  Image as ImageIcon,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { FRAUD_TYPES } from '../../config/constants';
import { normalizePlate } from '../../utils/normalization';
import type { FraudType } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultTicketNumber?: string;
  defaultPlateNumber?: string;
}

export const FraudReportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  defaultTicketNumber = '',
  defaultPlateNumber = '',
}) => {
  const { reportFraud, isOnline } = useData();

  const [ticketNumber, setTicketNumber] = useState(defaultTicketNumber);
  const [plateNumber, setPlateNumber] = useState(defaultPlateNumber);
  const [selectedType, setSelectedType] = useState<FraudType>('CAMION_DIFFERENT');
  const [comment, setComment] = useState('');
  // Multi-photos supportées pour preuves incontestables
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  // Prise en charge de plusieurs photos (caméra ou sélection fichier)
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setPhotos((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });

    // Réinitialiser l'input pour permettre de reprendre la même photo si nécessaire
    e.target.value = '';
  };

  const removePhoto = (indexToRemove: number) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPlate = normalizePlate(plateNumber);
    if (!cleanPlate) {
      setError('L’immatriculation du camion/véhicule est obligatoire.');
      return;
    }
    if (!comment.trim()) {
      setError('Veuillez préciser un commentaire circonstancié de constatation.');
      return;
    }

    const typeObj = FRAUD_TYPES.find((t) => t.id === selectedType);

    setLoading(true);
    try {
      await reportFraud({
        ticketNumber: ticketNumber.trim() || undefined,
        plateNumber: cleanPlate,
        type: selectedType,
        typeLabel: typeObj?.label || selectedType,
        comment: comment.trim(),
        photos,
        photoDataUrl: photos[0],
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1600);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l’enregistrement du signalement.');
    } finally {
      setLoading(false);
    }
  };

  const currentTypeMeta = FRAUD_TYPES.find((t) => t.id === selectedType);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-rose-500/40 bg-slate-900 p-5 sm:p-6 shadow-2xl text-slate-100 max-h-[94vh] flex flex-col">
        {/* En-tête modal */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-rose-400">
            <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Signaler une Fraude</h3>
              <p className="text-[11px] text-slate-400">
                Transmission au responsable de zone et à l’administrateur
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

        {/* Indicateur mode réseau / offline-first */}
        <div className="mt-2.5 flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
          <div className="flex items-center gap-1.5">
            {isOnline ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium text-[11px]">
                <Wifi className="w-3.5 h-3.5" /> En ligne — transmission et alerte directes
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-400 font-medium text-[11px]">
                <WifiOff className="w-3.5 h-3.5" /> Hors-ligne — photos stockées localement jusqu'à synchronisation
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 font-mono">GPS auto</span>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="my-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 border border-emerald-500/30 animate-pulse">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-white">Signalement Enregistré avec Succès</h4>
            <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
              Le rapport a été conservé localement avec les preuves photographiques et les coordonnées GPS. L'administrateur et le responsable ont été alertés pour arbitrage.
            </p>
            <p className="text-[11px] text-amber-400 font-semibold">
              Rappel : Le ticket n’est pas annulé automatiquement et reste soumis à analyse.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-3.5 space-y-3.5 flex-1 overflow-y-auto pr-1">
            {/* Type de fraude (Obligatoire) */}
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Type d’infraction / anomalie <span className="text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {FRAUD_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedType(t.id)}
                    className={`text-left p-2.5 rounded-xl border text-xs font-medium transition ${
                      selectedType === t.id
                        ? 'bg-rose-950/70 border-rose-500 text-white shadow-xs'
                        : 'bg-slate-800/70 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>{t.label}</span>
                      {selectedType === t.id && (
                        <span className="w-2 h-2 rounded-full bg-rose-400" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 line-clamp-1 leading-tight">
                      {t.description}
                    </p>
                  </button>
                ))}
              </div>
              {currentTypeMeta && (
                <p className="mt-1.5 text-[11px] text-slate-400 italic px-1">
                  💡 {currentTypeMeta.description}
                </p>
              )}
            </div>

            {/* Immatriculation et Ticket */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Immatriculation observée <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value)}
                  placeholder="1234AB01"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs font-mono font-bold text-white uppercase tracking-wider focus:border-rose-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  N° Ticket présenté (si disponible)
                </label>
                <input
                  type="text"
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  placeholder="VRD-000101"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2 px-3 text-xs font-mono text-white uppercase tracking-wider focus:border-rose-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Commentaire libre */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Commentaire libre & circonstances <span className="text-rose-400">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Décrivez précisément le constat : nom du chauffeur, aspect physique du ticket, refus d'obtempérer, écart d'essieux ou de chargement..."
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-hidden"
              />
            </div>

            {/* Photos jointes (Multi-photos) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Photos de preuve ({photos.length} jointe{photos.length > 1 ? 's' : ''})
                </label>
                <span className="text-[10px] text-slate-400">Stockage local garanti</span>
              </div>

              <div className="space-y-2">
                {/* Galerie de photos capturées */}
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {photos.map((photoUrl, idx) => (
                      <div
                        key={idx}
                        className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-800 aspect-video flex items-center justify-center"
                      >
                        <img
                          src={photoUrl}
                          alt={`Preuve ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-rose-400 hover:bg-rose-600 hover:text-white transition"
                          title="Supprimer cette photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span className="absolute bottom-1 left-1 px-1 rounded bg-black/60 text-[9px] font-mono text-slate-300">
                          #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Bouton d'ajout de photo */}
                <div className="flex items-center gap-2">
                  <label className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-800/70 hover:bg-slate-800 py-3 px-4 text-xs font-medium text-slate-300 hover:text-white cursor-pointer transition">
                    <Camera className="w-4 h-4 text-rose-400" />
                    <span>Prendre une photo (Appareil)</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={handlePhotoCapture}
                    />
                  </label>
                  <label className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 py-3 px-3.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer transition">
                    <ImageIcon className="w-4 h-4 text-blue-400" />
                    <span>Galerie</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handlePhotoCapture}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Avertissement Règle métier */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 text-[11px] text-amber-300/90 leading-relaxed">
              <span className="font-bold text-amber-400">Règle de gestion :</span> Le signalement ne bloque ni n'annule immédiatement le ticket dans le système. Il ouvre un dossier d'analyse pour la direction générale et les responsables de zone.
            </div>

            {/* Boutons d'action */}
            <div className="flex gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 py-2.5 text-xs font-bold text-white hover:from-rose-500 hover:to-rose-600 transition shadow-lg shadow-rose-950 disabled:opacity-50"
              >
                {loading ? 'Enregistrement local...' : 'Transmettre le Signalement'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
