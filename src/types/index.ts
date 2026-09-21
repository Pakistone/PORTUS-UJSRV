/**
 * Types TypeScript pour PORTUS — U.J.S.R.V.
 */

export type Role = 'ADMINISTRATEUR' | 'RESPONSABLE' | 'AGENT' | 'CONTROLEUR';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  sectorId?: string;
  sectorName?: string;
  phone?: string;
  isActive: boolean;
  failedAttempts: number;
  lockedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TicketStatus =
  | 'GENERATED'
  | 'ASSIGNED_TO_RESPONSIBLE'
  | 'AVAILABLE'
  | 'ASSIGNED_TO_AGENT'
  | 'SOLD'
  | 'CONTROLLED'
  | 'CANCELLED';

export type CarnetStatus =
  | 'GENERATED'
  | 'ASSIGNED_TO_RESPONSIBLE'
  | 'AVAILABLE'
  | 'EXHAUSTED'
  | 'CANCELLED'
  | 'CREATED'
  | 'ASSIGNED';

export interface Carnet {
  id: string; // UUID unique
  carnetNumber: string; // Ex: C-2026-001
  seriesPrefix: string; // Ex: VRD
  size: number; // Multiples de 3 (3, 6, 9, ... 150, 153...)
  startNumber: number;
  endNumber: number;
  createdById: string;
  createdByName: string;
  assignedToResponsableId?: string;
  assignedToResponsableName?: string;
  assignedAt?: string; // Date et heure d'attribution au responsable
  assignedById?: string; // Administrateur ayant attribué
  assignedByName?: string;
  sectorId?: string;
  sectorName?: string;
  createdAt: string; // Date et heure de génération
  status: CarnetStatus;
}

export interface Ticket {
  id: string; // Identifiant interne unique
  ticketNumber: string; // Numéro affiché (ex: VRD-000101)
  physicalNumber?: number; // Numéro séquentiel physique (ex: 1, 2... 100)
  carnetId: string;
  carnetNumber: string;
  qrPayload: string; // Payload crypté / lisible pour QR code
  status: TicketStatus;
  price: number; // 5 000 FCFA
  assignedResponsableId?: string;
  assignedResponsableName?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  assignedAgentPhone?: string;
  sectorId?: string;
  sectorName?: string;

  // Données de vente
  saleId?: string;
  soldAt?: string; // Date/heure originale de vente (ISO)
  plateNumber?: string; // Normalisé (ex: AB1234CD)
  driverPhone?: string; // Chiffres uniquement
  isSuperseded?: boolean; // Remplacé par un nouveau ticket actif pour la même immat
  supersededByTicketNumber?: string;
  coveredByRemiseId?: string;

  // Données de contrôle
  controlCount: number;
  lastControlledAt?: string;
  lastControlledBy?: string;

  // Annulation
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;

  createdAt: string;
}

export interface Sale {
  id: string; // Identifiant de vente unique UUID (généré immédiatement hors ligne)
  ticketId: string;
  ticketNumber: string;
  agentId: string;
  agentName: string;
  sectorId?: string;
  sectorName?: string;
  plateNumber: string; // Normalisé
  driverPhone?: string; // Chiffres uniquement ou vide
  soldAt: string; // Date originale de vente (NE JAMAIS écraser par la synchro)
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAccuracy: number | null;
  gpsStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'GPS_UNAVAILABLE';
  syncedAt?: string; // Date/heure réelle de synchronisation
  syncStatus: 'PENDING_SYNC' | 'SYNCED';
  price: number; // 5000 FCFA
  coveredByRemiseId?: string;
}

export interface Control {
  id: string;
  ticketId?: string;
  ticketNumber: string;
  plateNumber: string;
  controleurId: string;
  controleurName: string;
  controlledAt: string;
  isValid: boolean;
  validationMessage: string;
  resultType?: 'VALID' | 'CANCELLED' | 'INVALID_UNKNOWN' | 'SUPERSEDED' | 'NOT_SOLD';
  isOnline?: boolean;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAccuracy: number | null;
  gpsStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'GPS_UNAVAILABLE';
  syncStatus: 'PENDING_SYNC' | 'SYNCED';
  syncedAt?: string;
}

export type FraudType =
  | 'CAMION_DIFFERENT'
  | 'TICKET_SUSPECT'
  | 'TICKET_FALSIFIE'
  | 'TICKET_DEJA_PRESENTE'
  | 'AUTRE';

export type FraudReportStatus =
  | 'NOUVEAU'
  | 'EN_COURS'
  | 'TRAITE'
  | 'REJETE'
  | 'CONFIRME';

export interface FraudProcessingHistoryEntry {
  id: string;
  processedAt: string;
  adminId: string;
  adminName: string;
  fromStatus: FraudReportStatus;
  toStatus: FraudReportStatus;
  decisionNote: string;
}

export interface FraudReport {
  id: string;
  ticketNumber?: string;
  plateNumber: string;
  sectorId?: string;
  sectorName?: string;
  controleurId: string;
  controleurName: string;
  // Type de fraude normalisé
  type: FraudType;
  typeLabel: string;
  // Ancien champ rétrocompatible
  reason?: string;
  reasonLabel?: string;
  comment: string;
  // Photos de preuve (multiple et stockage local offline-first garanti)
  photos: string[]; // Tableau de data URLs base64
  photoDataUrl?: string; // rétrocompatibilité 1ère photo
  reportedAt: string; // ISO String
  reportedDate: string; // YYYY-MM-DD
  reportedTime: string; // HH:mm:ss
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsStatus?: 'AVAILABLE' | 'UNAVAILABLE';
  status: FraudReportStatus;
  processingHistory?: FraudProcessingHistoryEntry[];
  adminDecisionNote?: string;
  adminDecisionBy?: string;
  adminDecisionByName?: string;
  adminDecisionAt?: string;
  // Statut hors-ligne & synchronisation
  isOnline?: boolean;
  syncStatus: 'PENDING_SYNC' | 'SYNCED';
  syncedAt?: string;
}

export interface RemiseHistoryEntry {
  id: string;
  modifiedAt: string;
  modifiedById: string;
  modifiedByName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  reason: string;
  oldAmount: number;
  newAmount: number;
  oldNote?: string;
  newNote?: string;
}

export interface AgentFinancialSummary {
  agentId: string;
  agentName: string;
  sectorId?: string;
  sectorName?: string;
  responsableId?: string;
  responsableName?: string;
  ticketsSold: number;
  expectedAmount: number; // ticketsSold * 5 000 FCFA
  remittedAmount: number; // total des remises
  remainingBalance: number; // solde restant dû (si remittedAmount < expectedAmount)
  ecart: number; // écart positif (si remittedAmount > expectedAmount)
  unremittedTicketsCount: number; // nombre équivalent de tickets restants
  hasAlert: boolean;
  alertThreshold?: number; // 10, 15, 20...
  alertLevel?: 'WARNING' | 'CRITICAL';
}

export interface FinancialOverviewTotals {
  totalSalesAmount: number; // Montant total attendu des ventes
  totalRemittedAmount: number; // Montant total remis
  totalRemainingBalance: number; // Solde total restant
  totalSoldTickets: number; // Nombre de tickets vendus
  stockDisponibleTickets: number; // Tickets disponibles non vendus
  valeurStockDisponible: number; // stockDisponibleTickets * 5 000 FCFA
  totalIssuedTickets: number; // Tickets valides émis (non annulés)
  valeurPotentielleStock: number; // totalIssuedTickets * 5 000 FCFA
  activeAlertsCount: number; // Nombre d'alertes financières
}

export interface Remise {
  id: string;
  reference: string; // Ex: REM-2026-0042
  agentId: string;
  agentName: string;
  responsableId: string;
  responsableName: string;
  sectorId: string;
  sectorName: string;
  amount: number; // Montant remis en FCFA
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  createdAt: string;
  note?: string;
  ticketIdsCovered: string[]; // Liste des IDs de tickets couverts par cette remise
  ticketsCount: number; // Nombre équivalent de tickets
  isCorrected?: boolean;
  history: RemiseHistoryEntry[];
}

export type ExpenseCategory =
  | 'MATÉRIEL'
  | 'AGENT'
  | 'AUTORITÉS'
  | 'RÉPARATION / ENTRETIEN'
  | 'CARBURANT'
  | 'TRANSPORT'
  | 'AUTRE';

export type ExpenseStatus = 'PENDING' | 'VALIDATED' | 'REJECTED' | 'CANCELLED';

export interface Expense {
  id: string; // UUID interne
  expenseNumber: string; // Ex: EXP-2026-000001
  amount: number; // en FCFA > 0
  category: ExpenseCategory;
  description: string; // motif / description
  expenseDate: string; // ISO / YYYY-MM-DD
  receiptUrl?: string | null; // Justificatif photo optionnel
  status: ExpenseStatus;
  createdBy: string;
  createdByName: string;
  createdByRole: Role;
  responsibleId?: string | null;
  responsibleName?: string | null;
  sectorId?: string | null;
  sectorName?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  cancellationReason?: string | null;
  correctionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string | null;
  offlineId?: string | null;
}

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'SESSION_EXPIRED'
  | 'ACCOUNT_LOCKED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED'
  | 'CARNET_GENERATED'
  | 'CARNET_ASSIGNED_RESPONSABLE'
  | 'CARNET_CANCELLED'
  | 'TICKETS_ASSIGNED_AGENT'
  | 'TICKETS_REASSIGNED'
  | 'TICKET_SOLD'
  | 'SALE_SYNCED'
  | 'PLATE_CORRECTED'
  | 'TICKET_CANCELLED'
  | 'TICKET_CONTROLLED'
  | 'CONTROL_SYNCED'
  | 'FRAUD_REPORTED'
  | 'FRAUD_STATUS_UPDATED'
  | 'FRAUD_CONFIRMED'
  | 'FRAUD_REJECTED'
  | 'FRAUD_SYNCED'
  | 'REMISE_RECORDED'
  | 'REMISE_EXCEPTIONAL_CORRECTION'
  | 'EXPENSE_CREATED'
  | 'EXPENSE_UPDATED'
  | 'EXPENSE_VALIDATED'
  | 'EXPENSE_REJECTED'
  | 'EXPENSE_CORRECTED'
  | 'EXPENSE_CANCELLED'
  | 'EXPENSE_SYNCED'
  | 'DATABASE_EXPORTED'
  | 'DATABASE_RESET'
  | 'CONFIG_UPDATE';

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  action: AuditAction;
  timestamp: string;
  targetEntity: string;
  targetId: string;
  oldValue?: string | number | Record<string, unknown> | null;
  newValue?: string | number | Record<string, unknown> | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  details?: string;
}

export interface FinancialAlert {
  id: string;
  agentId: string;
  agentName: string;
  sectorId?: string;
  sectorName?: string;
  unremittedTicketsCount: number;
  unremittedAmount: number;
  thresholdPassed: number; // 10, 15, 20...
  level: 'WARNING' | 'CRITICAL';
  createdAt: string;
}

export interface TicketAssignment {
  id: string;
  ticketId: string;
  carnetId?: string;
  fromProfileId?: string;
  toProfileId: string;
  assignedBy: string;
  assignmentType: 'RESPONSABLE_ASSIGNMENT' | 'AGENT_ASSIGNMENT' | 'REASSIGNMENT' | 'RETURN';
  notes?: string;
  assignedAt: string;
}

export interface RemittanceAdjustment {
  id: string;
  remittanceId: string;
  adminId: string;
  reason: string;
  oldAmount: number;
  newAmount: number;
  oldNote?: string;
  newNote?: string;
  adjustedAt: string;
}

export interface SyncQueueRecord {
  id: string;
  clientMutationId: string;
  agentId: string;
  entityType: 'SALE' | 'CONTROL' | 'FRAUD_REPORT' | 'REMITTANCE';
  operation: 'INSERT' | 'UPDATE';
  payload: Record<string, unknown>;
  status: 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED' | 'CONFLICT';
  retryCount: number;
  errorMessage?: string | null;
  clientTimestamp: string;
  processedAt?: string | null;
}

export interface NotificationRecord {
  id: string;
  recipientId: string;
  senderId?: string;
  title: string;
  message: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  type: 'FINANCIAL_ALERT' | 'ASSIGNMENT' | 'SYSTEM' | 'FRAUD_ALERT' | 'REMITTANCE' | 'SALE';
  metadata?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface LoginAttempt {
  id: string;
  username: string;
  profileId?: string;
  ipAddress?: string;
  userAgent?: string;
  isSuccessful: boolean;
  failureReason?: string;
  attemptedAt: string;
}

export interface AppSetting {
  key: string;
  value: unknown;
  description?: string;
  updatedBy?: string;
  updatedAt: string;
}
