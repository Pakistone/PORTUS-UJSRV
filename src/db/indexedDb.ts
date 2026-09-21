/**
 * Base de données locale IndexedDB pour PORTUS — U.J.S.R.V.
 * Utilise 'idb' avec gestion résiliente des connexions et reconnexion automatique en cas d'interruption ou d'AbortError.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  User,
  Carnet,
  Ticket,
  Sale,
  Control,
  FraudReport,
  Remise,
  Expense,
  AuditLog,
  LoginAttempt,
  TicketAssignment,
  NotificationRecord,
} from '../types';

interface PortusDB extends DBSchema {
  users: {
    key: string;
    value: User;
    indexes: { 'by-username': string; 'by-role': string };
  };
  carnets: {
    key: string;
    value: Carnet;
    indexes: { 'by-responsable': string; 'by-carnet-number': string };
  };
  tickets: {
    key: string;
    value: Ticket;
    indexes: {
      'by-ticket-number': string;
      'by-carnet': string;
      'by-agent': string;
      'by-responsable': string;
      'by-status': string;
      'by-plate': string;
    };
  };
  sales: {
    key: string;
    value: Sale;
    indexes: {
      'by-agent': string;
      'by-ticket-number': string;
      'by-plate': string;
      'by-sync-status': string;
      'by-sold-at': string;
    };
  };
  controls: {
    key: string;
    value: Control;
    indexes: { 'by-plate': string; 'by-ticket-number': string; 'by-controleur': string };
  };
  fraud_reports: {
    key: string;
    value: FraudReport;
    indexes: { 'by-plate': string; 'by-controleur': string; 'by-status': string };
  };
  remises: {
    key: string;
    value: Remise;
    indexes: { 'by-agent': string; 'by-responsable': string; 'by-reference': string };
  };
  expenses: {
    key: string;
    value: Expense;
    indexes: {
      'by-expense-number': string;
      'by-status': string;
      'by-sector': string;
      'by-responsable': string;
      'by-created-by': string;
    };
  };
  audit_logs: {
    key: string;
    value: AuditLog;
    indexes: { 'by-action': string; 'by-actor': string; 'by-timestamp': string };
  };
  ticket_assignments: {
    key: string;
    value: TicketAssignment;
    indexes: { 'by-ticket': string; 'by-to-profile': string; 'by-from-profile': string };
  };
  notifications: {
    key: string;
    value: NotificationRecord;
    indexes: { 'by-recipient': string; 'by-created-at': string };
  };
  login_attempts: {
    key: string;
    value: LoginAttempt;
    indexes: { 'by-username': string; 'by-attempted-at': string };
  };
  settings: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'portus_ujsrv_db_v1';
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase<PortusDB>> | null = null;

export async function getDB(): Promise<IDBPDatabase<PortusDB>> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      if (!db || !db.objectStoreNames) {
        dbPromise = null;
      }
    } catch {
      dbPromise = null;
    }
  }

  if (!dbPromise) {
    dbPromise = openDB<PortusDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Users store
        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'id' });
          userStore.createIndex('by-username', 'username', { unique: true });
          userStore.createIndex('by-role', 'role');
        }

        // Carnets store
        if (!db.objectStoreNames.contains('carnets')) {
          const carnetStore = db.createObjectStore('carnets', { keyPath: 'id' });
          carnetStore.createIndex('by-responsable', 'assignedToResponsableId');
          carnetStore.createIndex('by-carnet-number', 'carnetNumber', { unique: true });
        }

        // Tickets store
        if (!db.objectStoreNames.contains('tickets')) {
          const ticketStore = db.createObjectStore('tickets', { keyPath: 'id' });
          ticketStore.createIndex('by-ticket-number', 'ticketNumber', { unique: true });
          ticketStore.createIndex('by-carnet', 'carnetId');
          ticketStore.createIndex('by-agent', 'assignedAgentId');
          ticketStore.createIndex('by-responsable', 'assignedResponsableId');
          ticketStore.createIndex('by-status', 'status');
          ticketStore.createIndex('by-plate', 'plateNumber');
        }

        // Sales store
        if (!db.objectStoreNames.contains('sales')) {
          const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
          salesStore.createIndex('by-agent', 'agentId');
          salesStore.createIndex('by-ticket-number', 'ticketNumber');
          salesStore.createIndex('by-plate', 'plateNumber');
          salesStore.createIndex('by-sync-status', 'syncStatus');
          salesStore.createIndex('by-sold-at', 'soldAt');
        }

        // Controls store
        if (!db.objectStoreNames.contains('controls')) {
          const controlsStore = db.createObjectStore('controls', { keyPath: 'id' });
          controlsStore.createIndex('by-plate', 'plateNumber');
          controlsStore.createIndex('by-ticket-number', 'ticketNumber');
          controlsStore.createIndex('by-controleur', 'controleurId');
        }

        // Fraud reports store
        if (!db.objectStoreNames.contains('fraud_reports')) {
          const fraudStore = db.createObjectStore('fraud_reports', { keyPath: 'id' });
          fraudStore.createIndex('by-plate', 'plateNumber');
          fraudStore.createIndex('by-controleur', 'controleurId');
          fraudStore.createIndex('by-status', 'status');
        }

        // Remises store
        if (!db.objectStoreNames.contains('remises')) {
          const remisesStore = db.createObjectStore('remises', { keyPath: 'id' });
          remisesStore.createIndex('by-agent', 'agentId');
          remisesStore.createIndex('by-responsable', 'responsableId');
          remisesStore.createIndex('by-reference', 'reference', { unique: true });
        }

        // Expenses store
        if (!db.objectStoreNames.contains('expenses')) {
          const expenseStore = db.createObjectStore('expenses', { keyPath: 'id' });
          expenseStore.createIndex('by-expense-number', 'expenseNumber', { unique: true });
          expenseStore.createIndex('by-status', 'status');
          expenseStore.createIndex('by-sector', 'sectorId');
          expenseStore.createIndex('by-responsable', 'responsibleId');
          expenseStore.createIndex('by-created-by', 'createdBy');
        }

        // Audit store
        if (!db.objectStoreNames.contains('audit_logs')) {
          const auditStore = db.createObjectStore('audit_logs', { keyPath: 'id' });
          auditStore.createIndex('by-action', 'action');
          auditStore.createIndex('by-actor', 'actorId');
          auditStore.createIndex('by-timestamp', 'timestamp');
        }

        // Ticket assignments store
        if (!db.objectStoreNames.contains('ticket_assignments')) {
          const assignmentStore = db.createObjectStore('ticket_assignments', { keyPath: 'id' });
          assignmentStore.createIndex('by-ticket', 'ticketId');
          assignmentStore.createIndex('by-to-profile', 'toProfileId');
          assignmentStore.createIndex('by-from-profile', 'fromProfileId');
        }

        // Notifications store
        if (!db.objectStoreNames.contains('notifications')) {
          const notifStore = db.createObjectStore('notifications', { keyPath: 'id' });
          notifStore.createIndex('by-recipient', 'recipientId');
          notifStore.createIndex('by-created-at', 'createdAt');
        }

        // Login attempts store
        if (!db.objectStoreNames.contains('login_attempts')) {
          const loginStore = db.createObjectStore('login_attempts', { keyPath: 'id' });
          loginStore.createIndex('by-username', 'username');
          loginStore.createIndex('by-attempted-at', 'attemptedAt');
        }

        // Settings / meta
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
      blocked() {
        dbPromise = null;
      },
      blocking() {
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }

  try {
    return await dbPromise;
  } catch (err: any) {
    if (
      err?.message?.includes('closing') ||
      err?.name === 'AbortError' ||
      err?.message?.includes('aborted')
    ) {
      dbPromise = null;
      return openDB<PortusDB>(DB_NAME, DB_VERSION);
    }
    throw err;
  }
}

/**
 * Initialisation de la base de données IndexedDB en mode production.
 * L'authentification et les profils sont gérés exclusivement par Supabase Auth / PostgreSQL.
 * IndexedDB sert de cache local résilient et de file d'attente hors ligne.
 * Aucun compte par défaut ni mot de passe en clair n'est stocké en local.
 */
export async function initializeDatabase(): Promise<void> {
  const db = await getDB();

  // Purge de sécurité de tout mot de passe résiduel stocké localement
  try {
    const legacyPasswords = await db.get('settings', 'user_passwords');
    if (legacyPasswords) {
      await db.delete('settings', 'user_passwords');
    }
  } catch {
    // ignore
  }

  const isInitialized = await db.get('settings', 'is_initialized');
  if (isInitialized) {
    return;
  }

  // Marquer la base comme initialisée (carnets, tickets, ventes restent synchronisés avec Supabase)
  await db.put('settings', true, 'is_initialized');
}
