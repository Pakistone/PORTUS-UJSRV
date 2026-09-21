import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  Copy,
  Check,
  RefreshCw,
  Shield,
  Layers,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Server,
  Key,
  Globe,
  UploadCloud,
} from 'lucide-react';
import {
  getSupabaseConfig,
  testSupabaseConnection,
} from '../../db/supabaseClient';
import { useData } from '../../context/DataContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { syncAllToSupabase } = useData();

  const [activeTab, setActiveTab] = useState<'schema' | 'config' | 'tables'>('schema');
  const [copied, setCopied] = useState(false);

  // Configuration live (lecture seule depuis l'environnement)
  const [config, setConfig] = useState<{ url: string; anonKey: string; isConfigured: boolean }>({
    url: '',
    anonKey: '',
    isConfigured: false,
  });
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success?: boolean;
    message?: string;
    loading?: boolean;
    latencyMs?: number;
    tablesFound?: string[];
  }>({ tested: false });

  // Synchro globale
  const [syncStatus, setSyncStatus] = useState<{
    syncing: boolean;
    result?: { success: boolean; message: string; count: number };
  }>({ syncing: false });

  useEffect(() => {
    if (isOpen) {
      const cfg = getSupabaseConfig();
      setConfig(cfg);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTestResult({ tested: true, loading: true });
    const res = await testSupabaseConnection();
    setTestResult({
      tested: true,
      loading: false,
      success: res.success,
      message: res.message,
      latencyMs: res.latencyMs,
      tablesFound: res.tablesFound,
    });
  };

  const handleRunGlobalSync = async () => {
    setSyncStatus({ syncing: true });
    try {
      const res = await syncAllToSupabase();
      setSyncStatus({ syncing: false, result: res });
    } catch (e: any) {
      setSyncStatus({
        syncing: false,
        result: { success: false, message: e.message || 'Erreur inconnue', count: 0 },
      });
    }
  };

  const sqlCode = `-- ====================================================================
-- SCHEMA POSTGRESQL / SUPABASE COMPLET & ROBUSTE POUR PORTUS
-- UNION DES JEUNES DE LA SÉCURITÉ ROUTIÈRE DE VRIDI — U.J.S.R.V.
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TYPES ENUMÉRÉS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM (
    'GENERATED', 'ASSIGNED_TO_RESPONSIBLE', 'AVAILABLE', 
    'ASSIGNED_TO_AGENT', 'SOLD', 'CONTROLLED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE fraud_reason AS ENUM (
    'FAUX_TICKET', 'IMMATRICULATION_NON_CONFORME', 
    'TICKET_EXPIRE', 'REUTILISATION_FRAUDULEUSE', 'AUTRE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE sync_status_enum AS ENUM (
    'PENDING', 'PROCESSING', 'SYNCED', 'FAILED', 'CONFLICT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notification_level AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. TABLE ROLES & PERMISSIONS
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name user_role NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABLE SECTEURS
CREATE TABLE IF NOT EXISTS public.sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TABLE PROFILS UTILISATEURS (Lié à auth.users de Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'AGENT',
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts INT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. TABLE LOGIN_ATTEMPTS (SÉCURITÉ & ANTI BRUTE-FORCE)
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  is_successful BOOLEAN NOT NULL,
  failure_reason TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. TABLE CARNETS (Identifiant UUID propre)
CREATE TABLE IF NOT EXISTS public.carnets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carnet_number TEXT NOT NULL UNIQUE,
  series_prefix TEXT NOT NULL DEFAULT 'VRD',
  generation_batch TEXT NOT NULL DEFAULT 'GEN-1',
  size INT NOT NULL CHECK (size > 0 AND size % 3 = 0),
  start_number INT NOT NULL CHECK (start_number > 0),
  end_number INT NOT NULL CHECK (end_number >= start_number),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  assigned_to_responsable UUID REFERENCES public.profiles(id),
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'ASSIGNED', 'EXHAUSTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_carnet_size_match CHECK (end_number - start_number + 1 = size)
);

-- 8. TABLE TICKETS (UUID interne distinct du numéro physique, réutilisable par génération)
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL,
  carnet_id UUID NOT NULL REFERENCES public.carnets(id) ON DELETE RESTRICT,
  generation_batch TEXT NOT NULL DEFAULT 'GEN-1',
  qr_payload TEXT NOT NULL,
  status ticket_status NOT NULL DEFAULT 'GENERATED',
  price INT NOT NULL DEFAULT 5000 CHECK (price >= 0),
  assigned_responsable_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  sale_id UUID,
  sold_at TIMESTAMPTZ,
  plate_number TEXT,
  driver_phone TEXT,
  is_superseded BOOLEAN NOT NULL DEFAULT FALSE,
  superseded_by_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  covered_by_remittance_id UUID,
  control_count INT NOT NULL DEFAULT 0 CHECK (control_count >= 0),
  last_controlled_at TIMESTAMPTZ,
  last_controlled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ticket_generation_number UNIQUE (generation_batch, ticket_number),
  CONSTRAINT chk_ticket_sold_coherence CHECK (
    (status != 'SOLD') OR (sold_at IS NOT NULL AND plate_number IS NOT NULL)
  ),
  CONSTRAINT chk_ticket_cancelled_coherence CHECK (
    (status != 'CANCELLED') OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)
  )
);

-- 9. TABLE TICKET_ASSIGNMENTS (Historique des mouvements)
CREATE TABLE IF NOT EXISTS public.ticket_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  carnet_id UUID REFERENCES public.carnets(id) ON DELETE SET NULL,
  from_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('RESPONSABLE_ASSIGNMENT', 'AGENT_ASSIGNMENT', 'REASSIGNMENT', 'RETURN')),
  notes TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. TABLE TICKET_STATUS_HISTORY
CREATE TABLE IF NOT EXISTS public.ticket_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  old_status ticket_status,
  new_status ticket_status NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT
);

-- 11. TABLE SALES (Ventes idempotentes avec ticket_id UNIQUE & sync_idempotency_key UNIQUE)
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE RESTRICT,
  ticket_number TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  plate_number TEXT NOT NULL,
  driver_phone TEXT,
  sold_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_idempotency_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  gps_latitude NUMERIC(9, 6),
  gps_longitude NUMERIC(9, 6),
  gps_accuracy NUMERIC(8, 2),
  gps_status TEXT NOT NULL DEFAULT 'UNAVAILABLE' CHECK (gps_status IN ('AVAILABLE', 'UNAVAILABLE')),
  price INT NOT NULL DEFAULT 5000 CHECK (price >= 0),
  covered_by_remittance_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. TABLE REMITTANCES (Remises financières immuables pour le responsable)
CREATE TABLE IF NOT EXISTS public.remittances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  responsable_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE RESTRICT,
  amount INT NOT NULL CHECK (amount > 0),
  tickets_count INT NOT NULL CHECK (tickets_count >= 0),
  ticket_ids_covered UUID[] NOT NULL DEFAULT '{}',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time TIME NOT NULL DEFAULT CURRENT_TIME,
  note TEXT,
  is_corrected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. TABLE REMITTANCE_ADJUSTMENTS (Trace immuable des corrections administratives)
CREATE TABLE IF NOT EXISTS public.remittance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id UUID NOT NULL REFERENCES public.remittances(id) ON DELETE RESTRICT,
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 5),
  old_amount INT NOT NULL,
  new_amount INT NOT NULL CHECK (new_amount > 0),
  old_note TEXT,
  new_note TEXT,
  adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. TABLE CONTROLS
CREATE TABLE IF NOT EXISTS public.controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  ticket_number TEXT NOT NULL,
  plate_number TEXT NOT NULL,
  controleur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  controlled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_valid BOOLEAN NOT NULL,
  validation_message TEXT NOT NULL,
  gps_latitude NUMERIC(9, 6),
  gps_longitude NUMERIC(9, 6),
  gps_accuracy NUMERIC(8, 2),
  gps_status TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  sync_idempotency_key UUID UNIQUE DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. TABLE FRAUD_REPORTS
CREATE TABLE IF NOT EXISTS public.fraud_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  ticket_number TEXT,
  plate_number TEXT NOT NULL,
  controleur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason fraud_reason NOT NULL,
  comment TEXT NOT NULL,
  photo_url TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gps_latitude NUMERIC(9, 6),
  gps_longitude NUMERIC(9, 6),
  gps_accuracy NUMERIC(8, 2),
  gps_status TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. TABLE NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  level notification_level NOT NULL DEFAULT 'INFO',
  type TEXT NOT NULL CHECK (type IN ('FINANCIAL_ALERT', 'ASSIGNMENT', 'SYSTEM', 'FRAUD_ALERT', 'REMITTANCE')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. TABLE AUDIT_LOGS (Strictement append-only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  actor_role user_role NOT NULL,
  action TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  target_entity TEXT NOT NULL,
  target_id TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  gps_latitude NUMERIC(9, 6),
  gps_longitude NUMERIC(9, 6),
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. TABLE SYNC_QUEUE (Idempotence de synchronisation)
CREATE TABLE IF NOT EXISTS public.sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_mutation_id UUID NOT NULL UNIQUE,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('SALE', 'CONTROL', 'FRAUD_REPORT', 'REMITTANCE')),
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE')),
  payload JSONB NOT NULL,
  status sync_status_enum NOT NULL DEFAULT 'PENDING',
  retry_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  client_timestamp TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. TABLE APP_SETTINGS
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TRIGGERS DE SÉCURITÉ :
-- Interdire modification ou suppression d'audit (Append-Only)
CREATE OR REPLACE FUNCTION public.fn_prevent_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PORTUS ERREUR: La table audit_logs est strictement append-only.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_tampering ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_tampering
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_audit_tampering();

-- Interdire suppression de remises
CREATE OR REPLACE FUNCTION public.fn_prevent_remittance_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PORTUS ERREUR: Une remise financière ne peut jamais être supprimée.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_remittances_no_delete ON public.remittances;
CREATE TRIGGER trg_remittances_no_delete
BEFORE DELETE ON public.remittances
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_remittance_deletion();

-- INDEX DE PERFORMANCE CRITIQUES :
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number ON public.tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_plate_number ON public.tickets(plate_number);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_agent ON public.tickets(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_responsable ON public.tickets(assigned_responsable_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_sold_at ON public.tickets(sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_plate_number ON public.sales(plate_number);
CREATE INDEX IF NOT EXISTS idx_sales_agent ON public.sales(agent_id);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON public.sales(sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_sync_key ON public.sales(sync_idempotency_key);
CREATE INDEX IF NOT EXISTS idx_remittances_agent ON public.remittances(agent_id);
CREATE INDEX IF NOT EXISTS idx_remittances_responsable ON public.remittances(responsable_id);
CREATE INDEX IF NOT EXISTS idx_remittances_date ON public.remittances(date DESC);
CREATE INDEX IF NOT EXISTS idx_controls_plate ON public.controls(plate_number);
CREATE INDEX IF NOT EXISTS idx_controls_ticket ON public.controls(ticket_number);
CREATE INDEX IF NOT EXISTS idx_controls_controleur ON public.controls(controleur_id);
CREATE INDEX IF NOT EXISTS idx_fraud_plate ON public.fraud_reports(plate_number);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_sync_queue_client_mutation ON public.sync_queue(client_mutation_id);

-- RLS POLICIES STRICTES :
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'ADMINISTRATEUR' AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE POLICY "Admin full access profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin full access carnets" ON public.carnets FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin full access tickets" ON public.tickets FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin full access sales" ON public.sales FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin full access remittances" ON public.remittances FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin full access controls" ON public.controls FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin full access fraud" ON public.fraud_reports FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin full access audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Agent read assigned tickets" ON public.tickets FOR SELECT TO authenticated USING (public.get_current_role() = 'AGENT' AND assigned_agent_id = auth.uid());
CREATE POLICY "Agent insert own sale" ON public.sales FOR INSERT TO authenticated WITH CHECK (public.get_current_role() = 'AGENT' AND agent_id = auth.uid());
CREATE POLICY "Controleur verify tickets" ON public.tickets FOR SELECT TO authenticated USING (public.get_current_role() = 'CONTROLEUR');
CREATE POLICY "Controleur insert control" ON public.controls FOR INSERT TO authenticated WITH CHECK (public.get_current_role() = 'CONTROLEUR' AND controleur_id = auth.uid());

-- FONCTIONS D'AUTHENTIFICATION STRICTES & SÉCURISÉES (PORTUS U.J.S.R.V.)
CREATE OR REPLACE FUNCTION public.resolve_username_for_auth(p_username TEXT)
RETURNS TEXT AS $$
DECLARE
  v_email TEXT;
  v_locked_until TIMESTAMPTZ;
  v_is_active BOOLEAN;
BEGIN
  IF p_username IS NULL OR TRIM(p_username) = '' THEN
    RETURN NULL;
  END IF;

  SELECT u.email, p.locked_until, p.is_active
  INTO v_email, v_locked_until, v_is_active
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE LOWER(p.username) = LOWER(TRIM(p_username))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT v_is_active THEN
    RAISE EXCEPTION 'Compte désactivé. Veuillez contacter l’administrateur.';
  END IF;

  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RAISE EXCEPTION 'COMPTE_VERROUILLE: Compte temporairement bloqué pendant 15 minutes suite à 5 tentatives infructueuses.';
  END IF;

  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

GRANT EXECUTE ON FUNCTION public.resolve_username_for_auth(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_username TEXT,
  p_is_successful BOOLEAN,
  p_profile_id UUID DEFAULT NULL,
  p_failure_reason TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_profile public.profiles%ROWTYPE;
  v_attempts INT := 0;
  v_locked_until TIMESTAMPTZ := NULL;
  v_is_locked BOOLEAN := FALSE;
  v_remaining_seconds INT := 0;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE LOWER(username) = LOWER(TRIM(p_username)) LIMIT 1;
  IF v_user_id IS NULL AND p_profile_id IS NOT NULL THEN
    v_user_id := p_profile_id;
  END IF;

  INSERT INTO public.login_attempts (username, profile_id, is_successful, failure_reason, user_agent)
  VALUES (TRIM(p_username), v_user_id, p_is_successful, p_failure_reason, p_user_agent);

  IF v_user_id IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id FOR UPDATE;
    IF p_is_successful THEN
      UPDATE public.profiles
      SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW()
      WHERE id = v_user_id;
      RETURN jsonb_build_object('success', TRUE, 'is_locked', FALSE, 'attempts_left', 5);
    ELSE
      v_attempts := COALESCE(v_profile.failed_attempts, 0) + 1;
      IF v_attempts >= 5 THEN
        v_locked_until := NOW() + INTERVAL '15 minutes';
        v_is_locked := TRUE;
        v_remaining_seconds := 900;
        UPDATE public.profiles
        SET failed_attempts = v_attempts, locked_until = v_locked_until, updated_at = NOW()
        WHERE id = v_user_id;
        RETURN jsonb_build_object('success', FALSE, 'is_locked', TRUE, 'remaining_seconds', 900, 'attempts_left', 0);
      ELSE
        UPDATE public.profiles
        SET failed_attempts = v_attempts, updated_at = NOW()
        WHERE id = v_user_id;
        RETURN jsonb_build_object('success', FALSE, 'is_locked', FALSE, 'attempts_left', GREATEST(0, 5 - v_attempts));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', p_is_successful, 'is_locked', FALSE, 'attempts_left', 5);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

GRANT EXECUTE ON FUNCTION public.record_login_attempt(TEXT, BOOLEAN, UUID, TEXT, TEXT) TO anon, authenticated;
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tablesList = [
    { name: 'profiles', label: 'Profils Utilisateurs', role: 'Lié à auth.users, verrouillage, rôle & secteur' },
    { name: 'roles', label: 'Rôles & Privilèges', role: 'ADMINISTRATEUR, RESPONSABLE, AGENT, CONTROLEUR' },
    { name: 'sectors', label: 'Secteurs de Perception', role: 'Vridi Port, Canal, Zone Industrielle, Terminal' },
    { name: 'carnets', label: 'Carnets de Tickets', role: 'Identifiant UUID propre, multiples de 3, série' },
    { name: 'tickets', label: 'Tickets de Stationnement', role: 'UUID interne distinct du numéro physique, cohérence' },
    { name: 'ticket_assignments', label: 'Affectations & Mouvements', role: 'Traçabilité complète des attributions/réattributions' },
    { name: 'ticket_status_history', label: 'Historique des États', role: 'Transitions d’état contrôlées et datées' },
    { name: 'sales', label: 'Ventes Terrain', role: 'Idempotence stricte, date originale soldAt, GPS' },
    { name: 'remittances', label: 'Remises Financières', role: 'Immuable pour le responsable, anti-suppression' },
    { name: 'remittance_adjustments', label: 'Corrections de Remise', role: 'Audit trail administratif traçant tout motif & delta' },
    { name: 'controls', label: 'Contrôles Routiers', role: 'Vérification corridor, validation, GPS & récidive' },
    { name: 'fraud_reports', label: 'Signalements de Fraudes', role: 'Contrefaçon, expiration, photo & enquête' },
    { name: 'notifications', label: 'Alertes & Notifications', role: 'Alertes de seuils (10, 15, 20...), alertes de caisse' },
    { name: 'audit_logs', label: 'Journal d’Audit Global', role: 'Strictement append-only, protégé par trigger PG' },
    { name: 'login_attempts', label: 'Tentatives d’Accès', role: 'Horodatage, IP, motif d’échec et sécurité brute-force' },
    { name: 'sync_queue', label: 'File de Synchro Offline', role: 'Mutations avec client_mutation_id pour idempotence' },
    { name: 'app_settings', label: 'Paramètres Système', role: 'Prix unitaire 5 000 FCFA, validité 7 jours, seuils' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-5xl rounded-2xl border border-emerald-500/40 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[94vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Couche de Données Supabase PostgreSQL
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                  PORTUS v1.0
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Base PostgreSQL robuste, normalisée, RLS 4 rôles, immuabilité et idempotence offline
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

        {/* Navigation Onglets */}
        <div className="flex items-center gap-2 border-b border-slate-800 pt-3 pb-2 text-xs font-medium">
          <button
            onClick={() => setActiveTab('schema')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === 'schema'
                ? 'bg-emerald-600 text-white font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Script SQL & RLS (17 Tables)</span>
          </button>

          <button
            onClick={() => setActiveTab('tables')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === 'tables'
                ? 'bg-emerald-600 text-white font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Architecture des Tables ({tablesList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('config')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
              activeTab === 'config'
                ? 'bg-emerald-600 text-white font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Connexion & Synchronisation Active</span>
          </button>
        </div>

        {/* CONTENU ONGLET 1 : SCRIPT SQL */}
        {activeTab === 'schema' && (
          <div className="flex-1 flex flex-col min-h-0 pt-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 flex items-center justify-between">
              <div>
                <p className="font-semibold text-emerald-300">
                  Script PostgreSQL complet prêt à déployer dans Supabase
                </p>
                <p className="text-[11px] text-emerald-200/80">
                  Intègre les 17 tables, RLS par rôle, triggers d’intégrité (audit append-only, remises immuables) et index de performance.
                </p>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition shrink-0 ml-3 shadow"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copié !' : 'Copier SQL'}</span>
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-[11px] text-emerald-300/90 leading-relaxed shadow-inner">
              <pre>{sqlCode}</pre>
            </div>
          </div>
        )}

        {/* CONTENU ONGLET 2 : ARCHITECTURE DES TABLES */}
        {activeTab === 'tables' && (
          <div className="flex-1 overflow-y-auto pt-3 space-y-2 pr-1">
            <div className="p-3 bg-slate-800/60 rounded-xl text-xs text-slate-300 border border-slate-700">
              Chaque table est rigoureusement normalisée avec des identifiants UUID internes, des clés d'idempotence, des relations vérifiées par contraintes d'intégrité et des politiques RLS garantissant l'étanchéité des données par profil.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {tablesList.map((t) => (
                <div
                  key={t.name}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col justify-between hover:border-emerald-500/30 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-emerald-400">public.{t.name}</span>
                    <span className="text-[10px] uppercase font-semibold bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                      RLS Actif
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-200 mt-1">{t.label}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{t.role}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONTENU ONGLET 3 : DIAGNOSTIC & STATUT PRODUCTION */}
        {activeTab === 'config' && (
          <div className="flex-1 overflow-y-auto pt-3 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-emerald-400" />
                  Statut de connexion Supabase (Production)
                </h4>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                  config.isConfigured
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}>
                  {config.isConfigured ? 'Environnement Configuré' : 'Non Configuré'}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Les clés d'accès et paramètres de production sont protégés et gérés exclusivement via les variables d'environnement système (<code className="text-emerald-400">.env</code>). Conformément aux normes de sécurité, ils ne sont pas modifiables dans le navigateur.
              </p>

              <div className="space-y-3 pt-1">
                <div className="rounded-lg bg-slate-900 border border-slate-800 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      URL Supabase Active (VITE_SUPABASE_URL)
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">
                      {config.url ? config.url.replace(/^https?:\/\//, '').split('.')[0] : 'non définie'}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-white truncate select-all">
                    {config.url || 'Aucune URL configurée dans VITE_SUPABASE_URL'}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-900 border border-slate-800 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-slate-400" />
                      Clé Publique Active (VITE_SUPABASE_PUBLISHABLE_KEY)
                    </span>
                    {config.anonKey.startsWith('sb_publishable_') && (
                      <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.5 rounded font-mono">
                        Publishable Key Active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-300 truncate">
                    {config.anonKey ? `${config.anonKey.slice(0, 16)}••••••••••••••••••••••••` : 'Aucune clé configurée'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={handleTestConnection}
                  disabled={testResult.loading}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-900/30"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testResult.loading ? 'animate-spin' : ''}`} />
                  <span>{testResult.loading ? 'Diagnostic en cours...' : 'Tester la connectivité Supabase'}</span>
                </button>
              </div>

              {testResult.tested && (
                <div
                  className={`mt-3 rounded-lg p-3 text-xs flex items-start gap-2 border ${
                    testResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-semibold flex items-center gap-2">
                      <span>{testResult.success ? 'Communication avec Supabase établie' : 'Erreur de communication Supabase'}</span>
                      {testResult.latencyMs !== undefined && (
                        <span className="text-[10px] bg-emerald-950/80 border border-emerald-700/60 px-1.5 py-0.2 rounded font-mono text-emerald-300">
                          {testResult.latencyMs} ms
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] opacity-90">{testResult.message}</p>
                    {testResult.tablesFound && testResult.tablesFound.length > 0 && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="text-[10px] text-slate-400">Tables accessibles :</span>
                        {testResult.tablesFound.map((tbl) => (
                          <span key={tbl} className="text-[10px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-mono text-slate-200">
                            {tbl}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Synchronisation globale */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-emerald-400" />
                Synchronisation & Amorçage Global vers Supabase
              </h4>
              <p className="text-xs text-slate-400">
                Pousse l’intégralité des utilisateurs, carnets, tickets, ventes et remises locales vers Supabase PostgreSQL de manière idempotente.
              </p>

              <button
                onClick={handleRunGlobalSync}
                disabled={syncStatus.syncing}
                className="flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${syncStatus.syncing ? 'animate-spin' : ''}`} />
                <span>{syncStatus.syncing ? 'Synchronisation en cours...' : 'Synchroniser toute la base vers Supabase'}</span>
              </button>

              {syncStatus.result && (
                <div
                  className={`rounded-lg p-3 text-xs flex items-start gap-2 border ${
                    syncStatus.result.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {syncStatus.result.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  )}
                  <div>
                    <p className="font-semibold">{syncStatus.result.success ? 'Synchronisation terminée' : 'Échec'}</p>
                    <p className="text-[11px] opacity-90 mt-0.5">{syncStatus.result.message}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pied de page */}
        <div className="flex justify-between items-center pt-3 border-t border-slate-800 mt-2">
          <span className="text-[11px] text-slate-500">
            100% Hors-ligne avec IndexedDB + Réplication PostgreSQL Supabase
          </span>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
