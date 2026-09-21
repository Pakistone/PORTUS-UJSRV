/**
 * Constantes métier de PORTUS — U.J.S.R.V.
 * Union des Jeunes de la Sécurité Routière de Vridi
 */

export const ORG_INFO = {
  NAME: 'PORTUS',
  FULL_ORG_NAME: 'UNION DES JEUNES DE LA SÉCURITÉ ROUTIÈRE DE VRIDI',
  SHORT_ORG_NAME: 'U.J.S.R.V.',
  COMMUNE: 'Port-Bouët / Vridi, Abidjan',
  COUNTRY: "Côte d'Ivoire",
  CURRENCY: 'FCFA',
} as const;

/**
 * PRIX CENTRALISÉ DU TICKET
 * Règle métier : 5 000 FCFA par ticket
 */
export const TICKET_PRICE_FCFA = 5000;

/**
 * RÈGLES DE VALIDITÉ ET DUPLICATION
 * Si une immatriculation possède déjà un ticket vendu il y a moins de 7 jours,
 * un avertissement doit être affiché et l'agent doit confirmer explicitement.
 */
export const ACTIVE_TICKET_VALIDITY_DAYS = 7;
export const ACTIVE_TICKET_VALIDITY_MS = ACTIVE_TICKET_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

/**
 * SEUILS D'ALERTES DE REMISE FINANCIÈRE
 * 10 tickets sans remise -> alerte
 * 15 -> nouvelle alerte
 * 20 -> nouvelle alerte
 * 25 -> nouvelle alerte, etc.
 * Ces alertes sont informatives et ne bloquent JAMAIS la vente.
 */
export const REMISE_ALERT_START_THRESHOLD = 10;
export const REMISE_ALERT_STEP = 5;

/**
 * RÈGLES DES CARNETS ET IMPRESSION
 * La taille d'un carnet doit être un multiple de 3 (3, 6, 9, 12, ... 150, 153...)
 * L'impression physique est de 9 tickets par feuille A4 paysage (grille 3x3)
 */
export const CARNET_SIZE_MULTIPLE = 3;
export const TICKETS_PER_PAGE_A4_LANDSCAPE = 9;

/**
 * SÉCURITÉ ET BRUTE-FORCE
 * Après 5 tentatives échouées : blocage temporaire de 15 minutes
 */
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * SECTEURS DE VRIDI PAR DÉFAUT
 */
export const DEFAULT_SECTORS = [
  { id: 'sec-vridi-port', name: 'VRIDI PORT / TERMINAL', code: 'VPT' },
  { id: 'sec-vridi-canal', name: 'VRIDI CANAL / PONT', code: 'VCN' },
  { id: 'sec-vridi-zi', name: 'VRIDI ZONE INDUSTRIELLE', code: 'VZI' },
  { id: 'sec-vridi-sir', name: 'VRIDI RAFFINERIE / SIR', code: 'VSR' },
];

/**
 * TYPES D'INFRACTIONS ET FRAUDES ROUTIÈRES (U.J.S.R.V.)
 * Types stricts demandés :
 * - CAMION DIFFÉRENT
 * - TICKET SUSPECT
 * - TICKET FALSIFIÉ
 * - TICKET DÉJÀ PRÉSENTÉ
 * - AUTRE
 */
export const FRAUD_TYPES: {
  id: 'CAMION_DIFFERENT' | 'TICKET_SUSPECT' | 'TICKET_FALSIFIE' | 'TICKET_DEJA_PRESENTE' | 'AUTRE';
  label: string;
  description: string;
  badgeColor: string;
}[] = [
  {
    id: 'CAMION_DIFFERENT',
    label: 'CAMION DIFFÉRENT',
    description: 'Le camion contrôlé ne correspond pas à l’immatriculation figurant sur le ticket présenté.',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  {
    id: 'TICKET_SUSPECT',
    label: 'TICKET SUSPECT',
    description: 'Anomalie visuelle, QR code douteux, police d’écriture ou papier altéré.',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  },
  {
    id: 'TICKET_FALSIFIE',
    label: 'TICKET FALSIFIÉ',
    description: 'Faux ticket manifeste, contrefaçon grossière ou numéro inexistant dans les souches officielles.',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  {
    id: 'TICKET_DEJA_PRESENTE',
    label: 'TICKET DÉJÀ PRÉSENTÉ',
    description: 'Tentative de passage multiple d’un même ticket pour des véhicules ou rotations différents.',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  {
    id: 'AUTRE',
    label: 'AUTRE',
    description: 'Autre infraction, refus d’obtempérer, altercation ou situation inhabituelle.',
    badgeColor: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  },
];

export const FRAUD_STATUSES: {
  id: 'NOUVEAU' | 'EN_COURS' | 'TRAITE' | 'REJETE' | 'CONFIRME';
  label: string;
  color: string;
  description: string;
}[] = [
  {
    id: 'NOUVEAU',
    label: 'Nouveau',
    color: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    description: 'Signalé récemment sur le corridor, en attente de première lecture.',
  },
  {
    id: 'EN_COURS',
    label: 'En cours',
    color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    description: 'Dossier pris en charge pour vérification auprès du responsable et de l’agent.',
  },
  {
    id: 'CONFIRME',
    label: 'Confirmé',
    color: 'bg-red-600/30 text-red-200 border-red-500/40',
    description: 'Fraude avérée après analyse des pièces et historique.',
  },
  {
    id: 'REJETE',
    label: 'Rejeté',
    color: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    description: 'Fausse alerte, erreur de saisie du contrôleur ou ticket conforme.',
  },
  {
    id: 'TRAITE',
    label: 'Traité',
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    description: 'Dossier clôturé administrativement avec mesures appliquées.',
  },
];

// Rétrocompatibilité
export const FRAUD_REASONS = FRAUD_TYPES;

