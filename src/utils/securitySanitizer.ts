/**
 * Module de Sécurité Applicative, Assainissement (Sanitization) & Protection Anti-Injection
 * PORTUS — Union des Jeunes de la Sécurité Routière de Vridi (U.J.S.R.V.)
 * 
 * Protège l'ensemble des formulaires, commentaires, notes, recherches et signalements
 * contre :
 * - Les injections XSS (Cross-Site Scripting stocké ou réfléchi)
 * - Les balises HTML et scripts malveillants (<script>, <iframe>, <svg>, event handlers)
 * - Les injections de pseudo-protocoles (javascript:, data:, vbscript:)
 * - Les caractères de contrôle et null bytes (\0, \x00)
 * - Les attaques par débordement de taille (buffer flooding)
 */

/**
 * Nettoie une chaîne de texte libre (commentaire, note, motif, recherche)
 * en supprimant toute trace de balisage HTML, scripts ou vecteurs d'injection XSS.
 */
export function sanitizeInput(
  input: unknown,
  options: {
    maxLength?: number;
    allowNewlines?: boolean;
    trim?: boolean;
  } = {}
): string {
  if (input === null || input === undefined) return '';
  let str = String(input);

  const { maxLength = 2000, allowNewlines = true, trim = true } = options;

  // 1. Tronquer à la longueur maximale autorisée pour prévenir les attaques DoS
  if (str.length > maxLength) {
    str = str.slice(0, maxLength);
  }

  // 2. Supprimer les null bytes et caractères de contrôle dangereux
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 3. Supprimer les balises HTML complètes ou tronquées (ex: <script>, <img ...>)
  str = str.replace(/<\/?[^>]+(>|$)/gi, '');

  // 4. Supprimer les pseudo-protocoles malveillants (javascript:, vbscript:, data:)
  str = str.replace(/(?:javascript|vbscript|data):/gi, '');

  // 5. Supprimer les gestionnaires d'événements inline (ex: onload=, onerror=, onclick=)
  str = str.replace(/on\w+\s*=/gi, '');

  // 6. Échapper les entités résiduelles sensibles
  str = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // 7. Gérer les retours à la ligne
  if (!allowNewlines) {
    str = str.replace(/[\r\n]+/g, ' ');
  }

  return trim ? str.trim() : str;
}

/**
 * Assainit une requête de recherche pour prévenir les injections et requêtes aberrantes.
 * Restreint aux caractères alphanumériques et ponctuation de recherche standard.
 */
export function sanitizeSearchQuery(query: string, maxLength = 100): string {
  if (!query) return '';
  let clean = query.trim().slice(0, maxLength);
  // Supprimer les caractères de contrôle et chevrons
  clean = clean.replace(/[<>\"'`;\\]/g, '');
  // Nettoyer les espaces multiples
  clean = clean.replace(/\s+/g, ' ');
  return clean;
}

/**
 * Assainit un commentaire circonstancié de signalement de fraude.
 */
export function sanitizeComment(comment: string, maxLength = 1500): string {
  return sanitizeInput(comment, { maxLength, allowNewlines: true, trim: true });
}

/**
 * Assainit une note financière ou justificatif administratif de remise.
 */
export function sanitizeNote(note: string, maxLength = 800): string {
  return sanitizeInput(note, { maxLength, allowNewlines: true, trim: true });
}

/**
 * Assainit un motif d'annulation de ticket ou de carnet.
 */
export function sanitizeReason(reason: string, maxLength = 500): string {
  return sanitizeInput(reason, { maxLength, allowNewlines: false, trim: true });
}

/**
 * Valide les exigences de complexité minimale pour un mot de passe sécurisé.
 * Règles : Au moins 6 caractères, non vide.
 * RÈGLE CRITIQUE : Le mot de passe n'est JAMAIS normalisé ou altéré.
 */
export function validatePasswordSecurity(password: string): {
  isValid: boolean;
  message?: string;
} {
  if (!password || password.length === 0) {
    return { isValid: false, message: 'Le mot de passe ne peut pas être vide.' };
  }
  if (password.length < 12) {
    return { isValid: false, message: 'Le mot de passe doit comporter au moins 12 caractères.' };
  }
  return { isValid: true };
}
