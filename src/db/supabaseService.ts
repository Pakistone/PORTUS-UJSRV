/**
 * Service Métier Supabase PostgreSQL pour PORTUS — U.J.S.R.V.
 * Fournit la couche d'accès aux données pour l'ensemble des tables :
 * profiles, roles, sectors, carnets, tickets, ticket_assignments,
 * sales, controls, fraud_reports, remittances, remittance_adjustments,
 * notifications, audit_logs, login_attempts, sync_queue, app_settings.
 */

import { getSupabase } from './supabaseClient';
import type {
  User,
  Carnet,
  Ticket,
  TicketStatus,
  Sale,
  Control,
  FraudReport,
  Remise,
  AuditLog,
  FinancialAlert,
  Expense,
} from '../types';

const ADMIN_USER_ROLES = ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR'] as const;

function sanitizeUuidOrNull(val?: string | null): string | null {
  if (!val) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(val) ? val : null;
}

export interface SyncQueueItem {
  id?: string;
  clientMutationId: string;
  agentId: string;
  entityType: 'SALE' | 'CONTROL' | 'FRAUD_REPORT' | 'REMITTANCE';
  operation: 'INSERT' | 'UPDATE';
  payload: Record<string, any>;
  status?: 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED' | 'CONFLICT';
  retryCount?: number;
  errorMessage?: string | null;
  clientTimestamp: string;
  processedAt?: string | null;
}

export interface RemittanceAdjustment {
  id?: string;
  remittanceId: string;
  adminId: string;
  reason: string;
  oldAmount: number;
  newAmount: number;
  oldNote?: string;
  newNote?: string;
  adjustedAt?: string;
}

export interface NotificationItem {
  id?: string;
  recipientId: string;
  senderId?: string;
  title: string;
  message: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  type: 'FINANCIAL_ALERT' | 'ASSIGNMENT' | 'SYSTEM' | 'FRAUD_ALERT' | 'REMITTANCE' | 'SALE';
  metadata?: Record<string, any>;
  isRead?: boolean;
  createdAt?: string;
}

function normalizeAdminUserRow(row: any): User {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    sectorId: row.sector_id,
    sectorName: row.sector?.name || row.sectors?.name,
    phone: row.phone,
    isActive: row.is_active,
    failedAttempts: row.failed_attempts || 0,
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function describeFunctionError(error: unknown, fallback: string): string {
  const status = error && typeof error === 'object' && 'context' in error
    ? Number((error as any).context?.status)
    : 0;
  const message = typeof error === 'string'
    ? error
    : error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string'
      ? (error as any).message
      : error && typeof error === 'object' && 'error' in error && typeof (error as any).error === 'string'
        ? (error as any).error
        : fallback;

  const normalized = String(message).toLowerCase();

  if (status === 401 || normalized.includes('session') || normalized.includes('jwt') || normalized.includes('token') || normalized.includes('unauthorized')) {
    return 'Session administrateur expirée ou non autorisée. Veuillez vous reconnecter.';
  }
  if (status === 403 || normalized.includes('forbidden')) {
    return 'Accès refusé : cette action est réservée à un administrateur PORTUS.';
  }
  if (normalized.includes('duplicate') || normalized.includes('already') || normalized.includes('utilis')) {
    return 'Ce nom d’utilisateur est déjà utilisé. Veuillez en choisir un autre.';
  }
  if (normalized.includes('role') && (normalized.includes('invalid') || normalized.includes('not allowed') || normalized.includes('restricted'))) {
    return 'Rôle invalide. Les rôles autorisés sont ADMINISTRATEUR, RESPONSABLE, AGENT et CONTROLEUR.';
  }
  if (normalized.includes('password') || normalized.includes('weak') || normalized.includes('validation')) {
    return 'Le mot de passe fourni est trop faible ou invalide. Utilisez au moins 12 caractères.';
  }
  if (normalized.includes('network') || normalized.includes('fetch') || normalized.includes('failed to fetch') || normalized.includes('edge')) {
    return 'Erreur réseau ou échec de l’exécution de la fonction Supabase. Veuillez réessayer.';
  }
  if (normalized.includes('403') || normalized.includes('not allowed')) {
    return 'Accès refusé : cette action est réservée à un administrateur PORTUS.';
  }

  return fallback;
}

async function ensureAdminFunctionAccess(supabase: ReturnType<typeof getSupabase>) {
  if (!supabase) {
    throw new Error('Supabase n’est pas configuré.');
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error('Session administrateur expirée. Veuillez vous reconnecter.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', session.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'ADMINISTRATEUR' || !profile.is_active) {
    throw new Error('Accès refusé : cette action est réservée à l’administrateur PORTUS.');
  }

  return { supabase, session };
}

export const SupabaseDataLayer = {
  /**
   * Vérifie si Supabase est connecté et prêt
   */
  isAvailable(): boolean {
    return Boolean(getSupabase());
  },

  // ------------------------------------------------------------------
  // 1. PROFILS & UTILISATEURS
  // ------------------------------------------------------------------
  async fetchProfiles(): Promise<User[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    try {
      await ensureAdminFunctionAccess(supabase);
      const { data, error } = await supabase.functions.invoke('admin-user-management', {
        body: { action: 'list' },
      });

      if (!error && Array.isArray(data?.users)) {
        return data.users.map(normalizeAdminUserRow);
      }

      if (error) {
        throw error;
      }
    } catch (error) {
      console.warn('Supabase fetchProfiles edge error:', error);
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*, sectors(name)')
      .order('full_name', { ascending: true });

    if (error) {
      console.warn('Supabase fetchProfiles error:', error.message);
      return [];
    }

    return (data || []).map(normalizeAdminUserRow);
  },

  /**
   * Crée un utilisateur officiel dans Supabase Auth et public.profiles
   */
  async createAdminUser(userData: {
    username: string;
    fullName: string;
    role: string;
    sectorId?: string;
    phone?: string;
    passwordRaw: string;
  }): Promise<User> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase n’est pas configuré.');
    }

    if (!ADMIN_USER_ROLES.includes(userData.role as typeof ADMIN_USER_ROLES[number])) {
      throw new Error('Rôle invalide. Les rôles autorisés sont ADMINISTRATEUR, RESPONSABLE, AGENT et CONTROLEUR.');
    }

    try {
      await ensureAdminFunctionAccess(supabase);
      const { data, error } = await supabase.functions.invoke('admin-user-management', {
        body: {
          action: 'create',
          username: userData.username,
          fullName: userData.fullName,
          role: userData.role,
          sectorId: userData.sectorId,
          phone: userData.phone,
          passwordRaw: userData.passwordRaw,
        },
      });

      if (error) {
        throw error;
      }

      const row = data?.user;
      if (!row) {
        throw new Error('Erreur lors de la création du compte utilisateur.');
      }

      return normalizeAdminUserRow(row);
    } catch (error) {
      throw new Error(describeFunctionError(error, 'Erreur lors de la création de l’utilisateur dans Supabase.'));
    }
  },

  /**
   * Modifie un utilisateur dans Supabase profiles
   */
  async updateAdminUser(userId: string, updates: {
    fullName?: string;
    phone?: string;
    sectorId?: string;
    role?: string;
    isActive?: boolean;
  }): Promise<User> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase n’est pas configuré.');
    }

    const payload: Record<string, any> = { action: 'update', id: userId };
    if (updates.fullName !== undefined) payload.fullName = updates.fullName;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.sectorId !== undefined) payload.sectorId = updates.sectorId;
    if (updates.role !== undefined) payload.role = updates.role;
    if (updates.isActive !== undefined) payload.isActive = updates.isActive;

    try {
      await ensureAdminFunctionAccess(supabase);
      const { data, error } = await supabase.functions.invoke('admin-user-management', { body: payload });
      if (error) {
        throw error;
      }
      const row = data?.user;
      if (!row) {
        throw new Error('Erreur lors de la mise à jour de l’utilisateur.');
      }
      return normalizeAdminUserRow(row);
    } catch (error) {
      throw new Error(describeFunctionError(error, 'Erreur lors de la mise à jour de l’utilisateur.'));
    }
  },

  /**
   * Réinitialise le mot de passe d'un utilisateur dans Supabase Auth
   */
  async resetAdminUserPassword(userId: string, newPasswordRaw: string): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase n’est pas configuré.');
    }

    try {
      await ensureAdminFunctionAccess(supabase);
      const { data, error } = await supabase.functions.invoke('admin-user-management', {
        body: {
          action: 'reset_password',
          id: userId,
          newPasswordRaw,
        },
      });

      if (error) {
        throw error;
      }

      return Boolean(data?.success ?? true);
    } catch (error) {
      throw new Error(describeFunctionError(error, 'Erreur lors de la réinitialisation du mot de passe.'));
    }
  },

  async upsertProfile(user: User): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        username: user.username,
        full_name: user.fullName,
        role: user.role,
        sector_id: user.sectorId || null,
        phone: user.phone || null,
        is_active: user.isActive,
        failed_attempts: user.failedAttempts,
        locked_until: user.lockedUntil || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Supabase upsertProfile error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 2. SECTEURS & RÔLES
  // ------------------------------------------------------------------
  async fetchSectors(): Promise<Array<{ id: string; code: string; name: string; description?: string }>> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('sectors')
      .select('*')
      .order('code', { ascending: true });

    if (error) {
      console.warn('Supabase fetchSectors error:', error.message);
      return [];
    }
    return data || [];
  },

  async fetchRoles(): Promise<Array<{ id: string; name: string; label: string; permissions: any }>> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase.from('roles').select('*');
    if (error) {
      console.warn('Supabase fetchRoles error:', error.message);
      return [];
    }
    return data || [];
  },

  // ------------------------------------------------------------------
  // 3. CARNETS
  // ------------------------------------------------------------------
  async fetchCarnets(): Promise<Carnet[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('carnets')
      .select('*, created_profile:profiles!created_by(full_name), resp_profile:profiles!assigned_to_responsable(full_name), sectors(name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchCarnets error:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      carnetNumber: row.carnet_number,
      seriesPrefix: row.series_prefix,
      size: row.size,
      startNumber: row.start_number,
      endNumber: row.end_number,
      createdById: row.created_by,
      createdByName: row.created_profile?.full_name || 'ADMINISTRATEUR',
      assignedToResponsableId: row.assigned_to_responsable,
      assignedToResponsableName: row.resp_profile?.full_name,
      sectorId: row.sector_id,
      sectorName: row.sectors?.name,
      createdAt: row.created_at,
      status: row.status,
    }));
  },

  async insertCarnet(carnet: Carnet): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('carnets').upsert(
      {
        id: carnet.id,
        carnet_number: carnet.carnetNumber,
        series_prefix: carnet.seriesPrefix,
        generation_batch: 'GEN-1',
        size: carnet.size,
        start_number: carnet.startNumber,
        end_number: carnet.endNumber,
        created_by: sanitizeUuidOrNull(carnet.createdById),
        assigned_to_responsable: sanitizeUuidOrNull(carnet.assignedToResponsableId),
        sector_id: sanitizeUuidOrNull(carnet.sectorId),
        status: carnet.status,
        created_at: carnet.createdAt,
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Supabase insertCarnet error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 4. TICKETS & AFFECTATIONS
  // ------------------------------------------------------------------
  async fetchTickets(): Promise<Ticket[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('tickets')
      .select('*, carnets(carnet_number), resp:profiles!assigned_responsable_id(full_name), agent:profiles!assigned_agent_id(full_name, phone), sectors(name)')
      .order('ticket_number', { ascending: true });

    if (error) {
      console.warn('Supabase fetchTickets error:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      ticketNumber: row.ticket_number,
      carnetId: row.carnet_id,
      carnetNumber: row.carnets?.carnet_number || 'CARNET',
      qrPayload: row.qr_payload,
      status: row.status,
      price: row.price,
      assignedResponsableId: row.assigned_responsable_id,
      assignedResponsableName: row.resp?.full_name,
      assignedAgentId: row.assigned_agent_id,
      assignedAgentName: row.agent?.full_name,
      assignedAgentPhone: row.agent?.phone || undefined,
      sectorId: row.sector_id,
      sectorName: row.sectors?.name,
      saleId: row.sale_id,
      soldAt: row.sold_at,
      plateNumber: row.plate_number,
      driverPhone: row.driver_phone,
      isSuperseded: row.is_superseded,
      coveredByRemiseId: row.covered_by_remittance_id,
      controlCount: row.control_count,
      lastControlledAt: row.last_controlled_at,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      createdAt: row.created_at,
    }));
  },

  async fetchTicketForVerification(identifier: string): Promise<Ticket | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      const clean = identifier.trim();
      // Recherche par ID ou par numéro de ticket
      const { data, error } = await supabase
        .from('tickets')
        .select('*, carnets(carnet_number), resp:profiles!assigned_responsable_id(full_name), agent:profiles!assigned_agent_id(full_name, phone), sectors(name)')
        .or(`id.eq.${clean},ticket_number.eq.${clean},ticket_number.ilike.${clean}`)
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;

      return {
        id: data.id,
        ticketNumber: data.ticket_number,
        carnetId: data.carnet_id,
        carnetNumber: data.carnets?.carnet_number || 'CARNET',
        qrPayload: data.qr_payload,
        status: data.status,
        price: data.price,
        assignedResponsableId: data.assigned_responsable_id,
        assignedResponsableName: data.resp?.full_name,
        assignedAgentId: data.assigned_agent_id,
        assignedAgentName: data.agent?.full_name,
        assignedAgentPhone: data.agent?.phone || undefined,
        sectorId: data.sector_id,
        sectorName: data.sectors?.name,
        saleId: data.sale_id,
        soldAt: data.sold_at,
        plateNumber: data.plate_number,
        driverPhone: data.driver_phone,
        isSuperseded: data.is_superseded,
        coveredByRemiseId: data.covered_by_remittance_id,
        controlCount: data.control_count,
        lastControlledAt: data.last_controlled_at,
        cancelledAt: data.cancelled_at,
        cancellationReason: data.cancellation_reason,
        createdAt: data.created_at,
      };
    } catch {
      return null;
    }
  },

  async fetchTicketsByPlate(plate: string): Promise<Ticket[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    try {
      const cleanPlate = plate.replace(/[\s\-_]/g, '').toUpperCase();
      const { data, error } = await supabase
        .from('tickets')
        .select('*, carnets(carnet_number), resp:profiles!assigned_responsable_id(full_name), agent:profiles!assigned_agent_id(full_name, phone), sectors(name)')
        .ilike('plate_number', `%${cleanPlate}%`)
        .order('sold_at', { ascending: false });

      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        ticketNumber: row.ticket_number,
        carnetId: row.carnet_id,
        carnetNumber: row.carnets?.carnet_number || 'CARNET',
        qrPayload: row.qr_payload,
        status: row.status,
        price: row.price,
        assignedResponsableId: row.assigned_responsable_id,
        assignedResponsableName: row.resp?.full_name,
        assignedAgentId: row.assigned_agent_id,
        assignedAgentName: row.agent?.full_name,
        assignedAgentPhone: row.agent?.phone || undefined,
        sectorId: row.sector_id,
        sectorName: row.sectors?.name,
        saleId: row.sale_id,
        soldAt: row.sold_at,
        plateNumber: row.plate_number,
        driverPhone: row.driver_phone,
        isSuperseded: row.is_superseded,
        coveredByRemiseId: row.covered_by_remittance_id,
        controlCount: row.control_count,
        lastControlledAt: row.last_controlled_at,
        cancelledAt: row.cancelled_at,
        cancellationReason: row.cancellation_reason,
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  },

  async insertTicketsBatch(tickets: Ticket[]): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase || tickets.length === 0) return false;

    const payload = tickets.map((t) => ({
      id: t.id,
      ticket_number: t.ticketNumber,
      carnet_id: t.carnetId,
      generation_batch: 'GEN-1',
      qr_payload: t.qrPayload,
      status: t.status,
      price: t.price || 5000,
      assigned_responsable_id: sanitizeUuidOrNull(t.assignedResponsableId),
      assigned_agent_id: sanitizeUuidOrNull(t.assignedAgentId),
      sector_id: sanitizeUuidOrNull(t.sectorId),
      created_at: t.createdAt,
    }));

    const { error } = await supabase
      .from('tickets')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('Supabase insertTicketsBatch error:', error.message);
      return false;
    }
    return true;
  },

  async updateTicketAssignment(
    ticketIds: string[],
    agentId: string,
    responsableId?: string
  ): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase
      .from('tickets')
      .update({
        assigned_agent_id: agentId,
        status: 'ASSIGNED_TO_AGENT',
        updated_at: new Date().toISOString(),
      })
      .in('id', ticketIds);

    if (error) {
      console.warn('Supabase updateTicketAssignment error:', error.message);
      return false;
    }

    // Enregistrer les mouvements dans ticket_assignments
    if (responsableId) {
      const assignments = ticketIds.map((tId) => ({
        ticket_id: tId,
        to_profile_id: agentId,
        assigned_by: responsableId,
        assignment_type: 'AGENT_ASSIGNMENT',
        assigned_at: new Date().toISOString(),
      }));
      await supabase.from('ticket_assignments').insert(assignments);
    }

    return true;
  },

  async updateTicketStatus(params: {
    ticketId: string;
    status?: TicketStatus;
    assignedResponsableId?: string | null;
    assignedAgentId?: string | null;
    isSuperseded?: boolean;
    supersededByTicketNumber?: string;
  }): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (params.status !== undefined) {
      updatePayload.status = params.status;
    }
    if (params.assignedResponsableId !== undefined) {
      updatePayload.assigned_responsable_id = params.assignedResponsableId;
    }
    if (params.assignedAgentId !== undefined) {
      updatePayload.assigned_agent_id = params.assignedAgentId;
    }
    if (params.isSuperseded !== undefined) {
      updatePayload.is_superseded = params.isSuperseded;
    }
    if (params.supersededByTicketNumber !== undefined) {
      updatePayload.superseded_by_ticket_number = params.supersededByTicketNumber;
    }

    const { error } = await supabase
      .from('tickets')
      .update(updatePayload)
      .eq('id', params.ticketId);

    if (error) {
      console.warn('Supabase updateTicketStatus error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 5. VENTES (IDEMPOTENTES & OFFLINE READY)
  // ------------------------------------------------------------------
  async fetchSales(): Promise<Sale[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('sales')
      .select('*, agent:profiles!agent_id(full_name), sectors(name)')
      .order('sold_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchSales error:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      ticketId: row.ticket_id,
      ticketNumber: row.ticket_number,
      agentId: row.agent_id,
      agentName: row.agent?.full_name || 'AGENT',
      sectorId: row.sector_id,
      sectorName: row.sectors?.name,
      plateNumber: row.plate_number,
      driverPhone: row.driver_phone,
      soldAt: row.sold_at,
      gpsLatitude: row.gps_latitude,
      gpsLongitude: row.gps_longitude,
      gpsAccuracy: row.gps_accuracy,
      gpsStatus: row.gps_status,
      syncedAt: row.synced_at,
      syncStatus: 'SYNCED',
      price: row.price,
      coveredByRemiseId: row.covered_by_remittance_id,
    }));
  },

  /**
   * Insère une vente de façon strictement idempotente.
   * Utilise ticket_id UNIQUE et sync_idempotency_key UNIQUE pour éviter tout doublon.
   */
  async insertSaleIdempotent(sale: Sale): Promise<{ success: boolean; isDuplicate: boolean; error?: string }> {
    const supabase = getSupabase();
    if (!supabase) return { success: false, isDuplicate: false, error: 'Supabase non configuré' };

    // Vérifier si la vente existe déjà par son id ou ticket_id
    const { data: existing } = await supabase
      .from('sales')
      .select('id, ticket_id')
      .or(`id.eq.${sale.id},ticket_id.eq.${sale.ticketId}`)
      .maybeSingle();

    if (existing) {
      // Déjà présent en base distante -> considérer comme succès idempotent
      return { success: true, isDuplicate: true };
    }

    const { error } = await supabase.from('sales').insert({
      id: sale.id,
      ticket_id: sale.ticketId,
      ticket_number: sale.ticketNumber,
      agent_id: sale.agentId,
      sector_id: sale.sectorId || null,
      plate_number: sale.plateNumber,
      driver_phone: sale.driverPhone || null,
      sold_at: sale.soldAt, // Date originale préservée
      synced_at: new Date().toISOString(),
      sync_idempotency_key: sale.id, // Utilise l'ID de vente généré comme clé d'idempotence
      gps_latitude: sale.gpsLatitude,
      gps_longitude: sale.gpsLongitude,
      gps_accuracy: sale.gpsAccuracy,
      gps_status: sale.gpsStatus,
      price: sale.price || 5000,
    });

    if (error) {
      // Vérifier si violation de contrainte d'unicité (idempotence)
      if (error.code === '23505') {
        return { success: true, isDuplicate: true };
      }
      return { success: false, isDuplicate: false, error: error.message };
    }

    return { success: true, isDuplicate: false };
  },

  // ------------------------------------------------------------------
  // 6. REMISES (REMITTANCES) & HISTORIQUE DES AJUSTEMENTS
  // ------------------------------------------------------------------
  async fetchRemittances(): Promise<Remise[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data: remisesData, error } = await supabase
      .from('remittances')
      .select('*, agent:profiles!agent_id(full_name), resp:profiles!responsable_id(full_name), sectors(name), remittance_adjustments(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchRemittances error:', error.message);
      return [];
    }

    return (remisesData || []).map((row: any) => ({
      id: row.id,
      reference: row.reference,
      agentId: row.agent_id,
      agentName: row.agent?.full_name || 'AGENT',
      responsableId: row.responsable_id,
      responsableName: row.resp?.full_name || 'RESPONSABLE',
      sectorId: row.sector_id,
      sectorName: row.sectors?.name || 'VRIDI',
      amount: row.amount,
      date: row.date,
      time: row.time,
      createdAt: row.created_at,
      note: row.note,
      ticketIdsCovered: row.ticket_ids_covered || [],
      ticketsCount: row.tickets_count,
      isCorrected: row.is_corrected,
      history: (row.remittance_adjustments || []).map((adj: any) => ({
        id: adj.id,
        modifiedAt: adj.adjusted_at,
        modifiedById: adj.admin_id,
        modifiedByName: 'ADMINISTRATEUR',
        reason: adj.reason,
        oldAmount: adj.old_amount,
        newAmount: adj.new_amount,
        oldNote: adj.old_note,
        newNote: adj.new_note,
      })),
    }));
  },

  async insertRemittance(remise: Remise): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('remittances').upsert(
      {
        id: remise.id,
        reference: remise.reference,
        agent_id: remise.agentId,
        responsable_id: remise.responsableId,
        sector_id: remise.sectorId,
        amount: remise.amount,
        tickets_count: remise.ticketsCount,
        ticket_ids_covered: remise.ticketIdsCovered,
        date: remise.date,
        time: remise.time,
        note: remise.note || null,
        is_corrected: remise.isCorrected || false,
        created_at: remise.createdAt,
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Supabase insertRemittance error:', error.message);
      return false;
    }
    return true;
  },

  /**
   * Enregistre un ajustement administratif de remise avec traçabilité immuable
   */
  async recordRemittanceAdjustment(adjustment: RemittanceAdjustment): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    // 1. Insérer la nouvelle trace dans remittance_adjustments
    const { error: adjError } = await supabase.from('remittance_adjustments').insert({
      remittance_id: adjustment.remittanceId,
      admin_id: adjustment.adminId,
      reason: adjustment.reason,
      old_amount: adjustment.oldAmount,
      new_amount: adjustment.newAmount,
      old_note: adjustment.oldNote || null,
      new_note: adjustment.newNote || null,
      adjusted_at: new Date().toISOString(),
    });

    if (adjError) {
      console.warn('Supabase recordRemittanceAdjustment error:', adjError.message);
      return false;
    }

    // 2. Mettre à jour le montant dans remittances en marquant is_corrected = true
    const { error: remError } = await supabase
      .from('remittances')
      .update({
        amount: adjustment.newAmount,
        note: adjustment.newNote || null,
        is_corrected: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adjustment.remittanceId);

    if (remError) {
      console.warn('Supabase update remittance error:', remError.message);
      return false;
    }

    return true;
  },

  // ------------------------------------------------------------------
  // 7. CONTRÔLES & FRAUDES
  // ------------------------------------------------------------------
  async fetchControls(): Promise<Control[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('controls')
      .select('*, controleur:profiles!controleur_id(full_name)')
      .order('controlled_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchControls error:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      ticketId: row.ticket_id,
      ticketNumber: row.ticket_number,
      plateNumber: row.plate_number,
      controleurId: row.controleur_id,
      controleurName: row.controleur?.full_name || 'CONTRÔLEUR',
      controlledAt: row.controlled_at,
      isValid: row.is_valid,
      validationMessage: row.validation_message,
      gpsLatitude: row.gps_latitude,
      gpsLongitude: row.gps_longitude,
      gpsAccuracy: row.gps_accuracy,
      gpsStatus: row.gps_status,
      syncStatus: 'SYNCED',
    }));
  },

  async insertControl(ctrl: Control): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('controls').upsert(
      {
        id: ctrl.id,
        ticket_id: ctrl.ticketId || null,
        ticket_number: ctrl.ticketNumber,
        plate_number: ctrl.plateNumber,
        controleur_id: ctrl.controleurId,
        controlled_at: ctrl.controlledAt,
        is_valid: ctrl.isValid,
        validation_message: ctrl.validationMessage,
        gps_latitude: ctrl.gpsLatitude,
        gps_longitude: ctrl.gpsLongitude,
        gps_accuracy: ctrl.gpsAccuracy,
        gps_status: ctrl.gpsStatus,
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Supabase insertControl error:', error.message);
      return false;
    }
    return true;
  },

  async fetchFraudReports(): Promise<FraudReport[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('fraud_reports')
      .select('*, controleur:profiles!controleur_id(full_name)')
      .order('reported_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchFraudReports error:', error.message);
      return [];
    }

    const reasonLabels: Record<string, string> = {
      CAMION_DIFFERENT: 'CAMION DIFFÉRENT',
      TICKET_SUSPECT: 'TICKET SUSPECT',
      TICKET_FALSIFIE: 'TICKET FALSIFIÉ',
      TICKET_DEJA_PRESENTE: 'TICKET DÉJÀ PRÉSENTÉ',
      AUTRE: 'AUTRE',
      FAUX_TICKET: 'TICKET FALSIFIÉ',
      IMMATRICULATION_NON_CONFORME: 'CAMION DIFFÉRENT',
      TICKET_EXPIRE: 'TICKET SUSPECT',
      REUTILISATION_FRAUDULEUSE: 'TICKET DÉJÀ PRÉSENTÉ',
    };

    return (data || []).map((row: any) => {
      let parsedPhotos: string[] = [];
      if (Array.isArray(row.photos)) {
        parsedPhotos = row.photos;
      } else if (typeof row.photos === 'string') {
        try {
          parsedPhotos = JSON.parse(row.photos);
        } catch {
          parsedPhotos = row.photo_url ? [row.photo_url] : [];
        }
      } else if (row.photo_url) {
        parsedPhotos = [row.photo_url];
      }

      const repDate = row.reported_at ? row.reported_at.split('T')[0] : new Date().toISOString().split('T')[0];
      const repTime = row.reported_at && row.reported_at.includes('T') ? row.reported_at.split('T')[1].slice(0, 8) : '12:00:00';

      return {
        id: row.id,
        ticketNumber: row.ticket_number,
        plateNumber: row.plate_number,
        controleurId: row.controleur_id,
        controleurName: row.controleur?.full_name || 'CONTRÔLEUR',
        type: (row.fraud_type || row.reason || 'AUTRE') as any,
        typeLabel: reasonLabels[row.fraud_type || row.reason] || row.reason || 'Infraction',
        reason: row.reason,
        reasonLabel: reasonLabels[row.reason] || row.reason,
        comment: row.comment,
        photos: parsedPhotos,
        photoDataUrl: parsedPhotos[0] || row.photo_url,
        reportedAt: row.reported_at,
        reportedDate: repDate,
        reportedTime: repTime,
        gpsLatitude: row.gps_latitude,
        gpsLongitude: row.gps_longitude,
        gpsStatus: row.gps_latitude != null ? 'AVAILABLE' : 'UNAVAILABLE',
        status: (row.status || 'NOUVEAU') as any,
        processingHistory: Array.isArray(row.processing_history) ? row.processing_history : [],
        adminDecisionNote: row.admin_decision_note,
        adminDecisionBy: row.admin_decision_by,
        adminDecisionByName: row.admin_decision_by_name,
        adminDecisionAt: row.admin_decision_at,
        syncStatus: 'SYNCED',
        syncedAt: row.updated_at || row.reported_at,
      };
    });
  },

  async insertFraudReport(report: FraudReport): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('fraud_reports').upsert(
      {
        id: report.id,
        ticket_number: report.ticketNumber || null,
        plate_number: report.plateNumber,
        controleur_id: report.controleurId,
        reason: report.type || report.reason || 'AUTRE',
        comment: report.comment,
        photo_url: report.photos?.[0] || report.photoDataUrl || null,
        reported_at: report.reportedAt,
        gps_latitude: report.gpsLatitude,
        gps_longitude: report.gpsLongitude,
        status: report.status || 'NOUVEAU',
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Supabase insertFraudReport error:', error.message);
      return false;
    }
    return true;
  },

  async updateFraudReportStatus(
    fraudId: string,
    status: FraudReport['status'],
    adminNote?: string,
    adminId?: string
  ): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase
      .from('fraud_reports')
      .update({
        status,
        admin_decision_note: adminNote || null,
        admin_decision_by: adminId || null,
        admin_decision_at: new Date().toISOString(),
      })
      .eq('id', fraudId);

    if (error) {
      console.warn('Supabase updateFraudReportStatus error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 8. AUDIT LOGS (APPEND-ONLY)
  // ------------------------------------------------------------------
  async fetchAuditLogs(): Promise<AuditLog[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('Supabase fetchAuditLogs error:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      actorId: row.actor_id,
      actorName: row.actor_name,
      actorRole: row.actor_role,
      action: row.action,
      timestamp: row.timestamp,
      targetEntity: row.target_entity,
      targetId: row.target_id,
      oldValue: row.old_value,
      newValue: row.new_value,
      gpsLatitude: row.gps_latitude,
      gpsLongitude: row.gps_longitude,
      details: row.details,
    }));
  },

  async insertAuditLog(log: AuditLog): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('audit_logs').insert({
      id: log.id,
      actor_id: log.actorId.startsWith('usr-') ? null : log.actorId, // Supabase UUID guard
      actor_name: log.actorName,
      actor_role: log.actorRole,
      action: log.action,
      timestamp: log.timestamp,
      target_entity: log.targetEntity,
      target_id: log.targetId,
      old_value: log.oldValue || null,
      new_value: log.newValue || null,
      gps_latitude: log.gpsLatitude || null,
      gps_longitude: log.gpsLongitude || null,
      details: log.details || null,
    });

    if (error) {
      console.warn('Supabase insertAuditLog error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 9. FILE D'ATTENTE DE SYNCHRONISATION IDEMPOTENTE (SYNC_QUEUE)
  // ------------------------------------------------------------------
  async pushToSyncQueue(item: SyncQueueItem): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('sync_queue').insert({
      client_mutation_id: item.clientMutationId,
      agent_id: item.agentId,
      entity_type: item.entityType,
      operation: item.operation,
      payload: item.payload,
      status: 'PENDING',
      client_timestamp: item.clientTimestamp,
    });

    if (error) {
      if (error.code === '23505') {
        // Mutation déjà reçue (idempotence)
        return true;
      }
      console.warn('Supabase pushToSyncQueue error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 10. NOTIFICATIONS & ALERTES DE SEUILS
  // ------------------------------------------------------------------
  async fetchNotifications(userId: string): Promise<NotificationItem[]> {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchNotifications error:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      recipientId: row.recipient_id,
      senderId: row.sender_id,
      title: row.title,
      message: row.message,
      level: row.level,
      type: row.type,
      metadata: row.metadata,
      isRead: row.is_read,
      createdAt: row.created_at,
    }));
  },

  async insertNotification(notif: NotificationItem): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.from('notifications').insert({
      recipient_id: notif.recipientId,
      sender_id: notif.senderId || null,
      title: notif.title,
      message: notif.message,
      level: notif.level,
      type: notif.type,
      metadata: notif.metadata || {},
      is_read: false,
    });

    if (error) {
      console.warn('Supabase insertNotification error:', error.message);
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // 11. TENTATIVES DE CONNEXION (LOGIN_ATTEMPTS) & VERROUILLAGE SERVEUR
  // ------------------------------------------------------------------
  async recordLoginAttempt(params: {
    username: string;
    profileId?: string;
    isSuccessful: boolean;
    failureReason?: string;
  }): Promise<{ isLocked?: boolean; remainingSeconds?: number; attemptsLeft?: number } | void> {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      // 1. Appel prioritaire à la RPC serveur
      const { data, error } = await supabase.rpc('record_login_attempt', {
        p_identifier: params.username,
        p_is_success: params.isSuccessful,
        p_failure_reason: params.failureReason || null,
        p_ip: null,
        p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });

      if (!error && data) {
        return {
          isLocked: data.is_locked,
          remainingSeconds: data.remaining_seconds,
          attemptsLeft: data.attempts_left,
        };
      }
    } catch {
      // Fallback
    }

    try {
      await supabase.from('login_attempts').insert({
        username: params.username,
        profile_id: params.profileId || null,
        is_successful: params.isSuccessful,
        failure_reason: params.failureReason || null,
        attempted_at: new Date().toISOString(),
      });
    } catch {
      // Silencieux
    }
  },

  async getAccountLockoutStatus(identifier: string): Promise<{ isLocked: boolean; remainingSeconds: number }> {
    const supabase = getSupabase();
    if (!supabase) return { isLocked: false, remainingSeconds: 0 };

    try {
      const { data, error } = await supabase.rpc('get_account_lockout_status', {
        p_identifier: identifier,
      });

      if (!error && data) {
        return {
          isLocked: Boolean(data.is_locked),
          remainingSeconds: data.remaining_seconds || 0,
        };
      }
    } catch (err) {
      console.warn('Erreur getAccountLockoutStatus:', err);
    }

    return { isLocked: false, remainingSeconds: 0 };
  },

  // ------------------------------------------------------------------
  // 12. RPC SÉCURISÉES POUR TICKETS, VENTES ET CONTRÔLES (HMAC-SHA256)
  // ------------------------------------------------------------------
  async verifyTicketSecureRPC(params: {
    identifier: string;
    scannedToken?: string;
    plateNumber?: string;
  }): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase.rpc('verify_ticket_secure', {
        p_ticket_identifier: params.identifier.trim(),
        p_scanned_token: params.scannedToken ? params.scannedToken.trim() : null,
        p_plate_number: params.plateNumber ? params.plateNumber.trim() : null,
      });

      if (error) {
        console.warn('Supabase verify_ticket_secure RPC error:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Exception verifyTicketSecureRPC:', err);
      return null;
    }
  },

  async recordControlSecureRPC(params: {
    identifier: string;
    scannedToken?: string;
    plateNumber?: string;
    location?: string;
    notes?: string;
  }): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase.rpc('record_control_secure', {
      p_ticket_identifier: params.identifier.trim(),
      p_scanned_token: params.scannedToken ? params.scannedToken.trim() : null,
      p_plate_number: params.plateNumber ? params.plateNumber.trim() : null,
      p_location: params.location ? params.location.trim() : null,
      p_notes: params.notes ? params.notes.trim() : null,
    });

    if (error) {
      console.warn('Supabase record_control_secure RPC error:', error.message);
      throw new Error(error.message);
    }
    return data;
  },

  async processSyncOperation(params: { operationId: string; agentId: string; entityType: 'SALE' | 'CONTROL'; payload: Record<string, any> }): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase non disponible');
    const { data, error } = await supabase.rpc('process_sync_operation', {
      p_actor: params.agentId, p_operation_id: params.operationId, p_entity_type: params.entityType, p_payload: params.payload
    });
    if (error) throw new Error(error.message);
    return data;
  },

  async sellTicketSecureRPC(params: {
    ticketId: string;
    plateNumber: string;
    driverPhone?: string;
    syncIdempotencyKey?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    soldAt?: string;
  }): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase.rpc('sell_ticket_secure', {
      p_ticket_id: params.ticketId,
      p_plate_number: params.plateNumber.trim().toUpperCase(),
      p_driver_phone: params.driverPhone ? params.driverPhone.trim() : null,
      p_sync_idempotency_key: params.syncIdempotencyKey || null,
      p_latitude: params.latitude || null,
      p_longitude: params.longitude || null,
      p_accuracy: params.accuracy || null,
      p_sold_at: params.soldAt || null,
    });

    if (error) {
      console.warn('Supabase sell_ticket_secure RPC error:', error.message);
      throw new Error(error.message);
    }
    return data;
  },

  async assignTicketsSecureRPC(params: {
    agentId: string;
    ticketIds: string[];
  }): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase.rpc('assign_tickets_to_agent_secure', {
      p_agent_id: params.agentId,
      p_ticket_ids: params.ticketIds,
    });

    if (error) {
      console.warn('Supabase assign_tickets_to_agent_secure RPC error:', error.message);
      throw new Error(error.message);
    }
    return data;
  },

  async supersedeTicketSecureRPC(params: {
    oldTicketId: string;
    newTicketId: string;
    reason: string;
  }): Promise<any> {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase non disponible');

    const { data, error } = await supabase.rpc('supersede_ticket_secure', {
      p_old_ticket_id: params.oldTicketId,
      p_new_ticket_id: params.newTicketId,
      p_reason: params.reason,
    });

    if (error) {
      console.warn('Supabase supersede_ticket_secure RPC error:', error.message);
      throw new Error(error.message);
    }
    return data;
  },

  // ------------------------------------------------------------------
  // 13. PARAMÈTRES APPLICATIFS (APP_SETTINGS)
  // ------------------------------------------------------------------
  async fetchAppSettings(): Promise<Record<string, any>> {
    const supabase = getSupabase();
    if (!supabase) return {};

    const { data, error } = await supabase.from('app_settings').select('key, value');
    if (error) {
      console.warn('Supabase fetchAppSettings error:', error.message);
      return {};
    }

    const settings: Record<string, any> = {};
    (data || []).forEach((row: any) => {
      settings[row.key] = row.value;
    });
    return settings;
  },
};
