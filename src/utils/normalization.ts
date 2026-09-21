/**
 * Module de Normalisation des Données Métier de PORTUS
 * 
 * RÈGLES STRICTES :
 * - Tous les textes métier doivent être automatiquement normalisés :
 *   - majuscules
 *   - suppression des caractères spéciaux (selon le contexte)
 *   - suppression des accents (É -> E, etc.)
 * - Exemple immatriculation : "Ab-1234 cd" -> "AB1234CD"
 * - Exemple nom : "Kouassi Éric" -> "KOUASSI ERIC"
 * - Téléphone : uniquement sous forme de chiffres (sans imposer de préfixe obligatoire)
 * 
 * ⚠️ RÈGLE CRITIQUE :
 * NE JAMAIS transformer ou modifier les mots de passe.
 * Les mots de passe sont conservés/utilisés exactement comme saisis.
 */

/**
 * Supprime les accents d'une chaîne
 */
export function removeAccents(str: string): string {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalisation générale d'un texte métier (nom, prénom, lieu, secteur, etc.)
 * - Retire les accents
 * - Met en majuscules
 * - Remplace les espaces multiples par un seul
 * - Nettoie les bords
 */
export function normalizeText(str: string): string {
  if (!str) return '';
  const withoutAccents = removeAccents(str);
  return withoutAccents
    .toUpperCase()
    .replace(/[^A-Z0-9\s\-_.']/g, '') // Garde lettres, chiffres, espaces et ponctuation basique
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalisation stricte d'une plaque d'immatriculation
 * "Ab-1234 cd" => "AB1234CD"
 * Retire tous les tirets, espaces, points et caractères non alphanumériques, majuscule sans accent.
 */
export function normalizePlate(plate: string): string {
  if (!plate) return '';
  const clean = removeAccents(plate);
  return clean.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Formatage d'affichage d'une plaque pour la lisibilité humaine
 * ex: "AB1234CD" -> "AB-1234-CD" ou affichage propre
 */
export function formatPlateDisplay(plate: string): string {
  const norm = normalizePlate(plate);
  if (!norm) return '';
  // Si format ivoirien typique 2 lettres + 4 chiffres + 2 lettres
  if (/^[A-Z]{2}\d{4}[A-Z]{2}$/.test(norm)) {
    return `${norm.slice(0, 2)}-${norm.slice(2, 6)}-${norm.slice(6)}`;
  }
  return norm;
}

/**
 * Normalisation du nom de personne
 * "Kouassi Éric" => "KOUASSI ERIC"
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  const withoutAccents = removeAccents(name);
  return withoutAccents
    .toUpperCase()
    .replace(/[^A-Z\s\-']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalisation d'un numéro de téléphone
 * Ne conserve que les chiffres. Ne force pas de format ivoirien.
 * ex: "+225 07-12-34-56" -> "22507123456"
 * ex: "05 44 22 11" -> "05442211"
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Formatage d'un montant en FCFA
 */
export function formatFCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(amount) + ' FCFA';
}

/**
 * Formatage date et heure locale
 */
export function formatDateTime(isoString: string | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function formatDate(isoString: string | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}
