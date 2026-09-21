import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  Flashlight,
  FlashlightOff,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

interface QrCameraScannerProps {
  onScan: (decodedData: string) => void;
  isActive: boolean;
  onCloseScanner?: () => void;
}

export const QrCameraScanner: React.FC<QrCameraScannerProps> = ({
  onScan,
  isActive,
  onCloseScanner,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const lastScannedTimeRef = useRef<number>(0);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Émission d'un bip léger de confirmation lors de la détection
  const playBeep = () => {
    try {
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // Note La5 (880Hz)
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
    } catch {
      // Ignorer si audio bloqué
    }
  };

  const stopCamera = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
    setTorchOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasPermission(false);
      setErrorMessage("La caméra n'est pas supportée sur ce navigateur ou cet appareil.");
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        try {
          await videoRef.current.play();
        } catch (playErr: any) {
          if (playErr.name === 'AbortError') {
            return;
          }
          throw playErr;
        }
      }

      // Vérifier support du flash (torche)
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities: any = track.getCapabilities?.() || {};
        if (capabilities.torch) {
          setTorchSupported(true);
        } else {
          setTorchSupported(false);
        }
      }

      setHasPermission(true);
      setIsScanning(true);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      console.warn('Erreur accès caméra:', err);
      setHasPermission(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage("L'accès à la caméra a été refusé. Veuillez autoriser la caméra dans vos paramètres.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage("Aucune caméra physique n'a été détectée sur cet appareil.");
      } else {
        setErrorMessage("Impossible d'activer la caméra : " + (err.message || 'Erreur inconnue'));
      }
    }
  }, [facingMode, stopCamera]);

  // Boucle d'analyse vidéo continue avec jsQR et limitation de fréquence (10-12 FPS / ~95ms) + ROI central 360x360
  const tick = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isScanning) {
      animationFrameId.current = requestAnimationFrame(tick);
      return;
    }

    const now = Date.now();
    // Limiter la fréquence à ~10-12 images par seconde (intervalle de 90ms min)
    if (now - lastScannedTimeRef.current < 90 && lastScannedTimeRef.current > 0) {
      animationFrameId.current = requestAnimationFrame(tick);
      return;
    }

    const video = videoRef.current;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        const width = video.videoWidth;
        const height = video.videoHeight;

        // ROI (Region Of Interest) central de 360x360 pour éviter d'analyser toute la frame 720p/1080p
        const roiSize = Math.min(width, height, 360);
        const startX = Math.floor((width - roiSize) / 2);
        const startY = Math.floor((height - roiSize) / 2);

        canvas.width = roiSize;
        canvas.height = roiSize;
        ctx.drawImage(video, startX, startY, roiSize, roiSize, 0, 0, roiSize, roiSize);

        const imageData = ctx.getImageData(0, 0, roiSize, roiSize);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          lastScannedTimeRef.current = now;
          playBeep();
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate(100);
            } catch {
              // Ignore
            }
          }
          onScan(code.data);
        }
      }
    }

    animationFrameId.current = requestAnimationFrame(tick);
  }, [isScanning, onScan]);

  // Démarrer/arrêter la caméra selon isActive
  useEffect(() => {
    if (isActive) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isActive, startCamera, stopCamera]);

  // Lancer la boucle d'analyse vidéo
  useEffect(() => {
    if (isScanning) {
      animationFrameId.current = requestAnimationFrame(tick);
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [isScanning, tick]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch (e) {
        console.warn('Impossible de modifier la torche:', e);
      }
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-black border border-slate-800 shadow-2xl flex flex-col items-center justify-center min-h-[280px] sm:min-h-[320px]">
      {/* Flux vidéo */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover max-h-[360px]"
        autoPlay
        playsInline
        muted
      />

      {/* Canvas invisible pour traitement d'image jsQR */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Cadre de ciblage / Viewfinder avec animation laser */}
      {isScanning && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
          <div className="relative w-56 h-56 sm:w-64 sm:h-64 border-2 border-dashed border-emerald-400/80 rounded-2xl shadow-[0_0_25px_rgba(16,185,129,0.35)] flex items-center justify-center overflow-hidden">
            {/* 4 coins renforcés */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

            {/* Ligne de balayage laser animée */}
            <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-bounce" />

            <div className="bg-black/60 backdrop-blur-xs px-3 py-1 rounded-full text-[11px] font-mono font-bold text-emerald-300 border border-emerald-500/40">
              CADRER LE QR CODE DU TICKET
            </div>
          </div>
        </div>
      )}

      {/* Barre d'actions rapides sur la caméra */}
      <div className="absolute bottom-3 inset-x-3 flex items-center justify-between pointer-events-auto bg-slate-900/85 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 rounded-lg transition flex items-center gap-1.5 font-bold ${
                torchOn
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
              title={torchOn ? 'Éteindre la torche' : 'Allumer la torche'}
            >
              {torchOn ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
              <span className="hidden sm:inline">{torchOn ? 'Torche ON' : 'Torche'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleFacingMode}
            className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1.5 font-bold"
            title="Inverser caméra (avant/arrière)"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Caméra {facingMode === 'environment' ? 'Arr.' : 'Av.'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onCloseScanner && (
            <button
              type="button"
              onClick={onCloseScanner}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Fermer Caméra
            </button>
          )}
        </div>
      </div>

      {/* Message d'erreur ou autorisation */}
      {errorMessage && (
        <div className="absolute inset-0 bg-slate-950/95 p-6 flex flex-col items-center justify-center text-center space-y-3 z-20">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <CameraOff className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-white">Caméra indisponible</h4>
          <p className="text-xs text-slate-400 max-w-xs">{errorMessage}</p>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={startCamera}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition"
            >
              Réessayer
            </button>
            {onCloseScanner && (
              <button
                type="button"
                onClick={onCloseScanner}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                Passer en recherche manuelle
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
