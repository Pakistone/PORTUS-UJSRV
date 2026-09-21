/**
 * Utilitaire de Géolocalisation pour le terrain
 * Règle métier : Ne jamais bloquer une vente ou un contrôle si le GPS est indisponible.
 */

export interface GpsResult {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'GPS_UNAVAILABLE';
  errorDetails?: string;
}

export async function getCurrentCoordinates(): Promise<GpsResult> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return {
      latitude: null,
      longitude: null,
      accuracy: null,
      status: 'GPS_UNAVAILABLE',
      errorDetails: 'Géolocalisation non supportée par le navigateur',
    };
  }

  return new Promise((resolve) => {
    // Timeout court de 5 secondes pour ne pas ralentir l'agent sur le terrain
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
          status: 'AVAILABLE',
        });
      },
      (error) => {
        let message = 'GPS indisponible';
        if (error.code === error.PERMISSION_DENIED) {
          message = 'Autorisation GPS refusée';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = 'Position non détectée';
        } else if (error.code === error.TIMEOUT) {
          message = 'Délai GPS dépassé';
        }
        resolve({
          latitude: null,
          longitude: null,
          accuracy: null,
          status: 'GPS_UNAVAILABLE',
          errorDetails: message,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 30000,
      }
    );
  });
}
