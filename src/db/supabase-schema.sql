-- ====================================================================
-- SCHEMA POSTGRESQL / SUPABASE COMPLET & ROBUSTE POUR PORTUS
-- UNION DES JEUNES DE LA SÉCURITÉ ROUTIÈRE DE VRIDI — U.J.S.R.V.
-- Système de perception, traçabilité et contrôle des vignettes
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. EXTENSIONS
-- --------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- 2. TYPES ÉNUMÉRÉS
-- --------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM (
    'GENERATED',
    'ASSIGNED_TO_RESPONSIBLE',
    'AVAILABLE',
    'ASSIGNED_TO_AGENT',
    'SOLD',
    'CONTROLLED',
    'SUPERSEDED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE fraud_reason AS ENUM (
    'FAUX_TICKET',
    'IMMATRICULATION_NON_CONFORME',
    'TICKET_EXPIRE',
    'REUTILISATION_FRAUDULEUSE',
    'AUTRE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE sync_status_enum AS ENUM (
    'PENDING',
    'PROCESSING',
    'SYNCED',
    'FAILED',
    'CONFLICT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notification_level AS ENUM (
    'INFO',
    'WARNING',
    'CRITICAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- --------------------------------------------------------------------
-- 3. TABLE DES RÔLES & PERMISSIONS (NORMALISATION)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name user_role NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertion des 4 rôles fondamentaux de PORTUS
INSERT INTO public.roles (name, label, description, permissions)
VALUES 
  ('ADMINISTRATEUR', 'Administrateur Général', 'Gestion globale, paramétrages, générations de carnets, corrections exceptionnelles et audit.', '["ALL"]'::jsonb),
  ('RESPONSABLE', 'Responsable de Secteur', 'Supervision du secteur de Vridi, distribution de carnets/tickets, réattribution des invendus, enregistrement des remises.', '["SECTOR_MANAGE", "DISTRIBUTE_TICKETS", "REASSIGN_UNSOLD", "RECORD_REMITTANCE", "VIEW_SECTOR_REPORTS"]'::jsonb),
  ('AGENT', 'Agent Percepteur Terrain', 'Vente exclusive des tickets attribués, encaissement (5 000 FCFA), déclaration d''immatriculation et mode hors-ligne.', '["SELL_ASSIGNED_TICKETS", "VIEW_OWN_SALES", "CHECK_PLATE"]'::jsonb),
  ('CONTROLEUR', 'Contrôleur Routier', 'Contrôle de conformité sur le corridor portuaire, vérification QR code/immatriculation et signalement de fraudes.', '["VERIFY_TICKETS", "RECORD_CONTROL", "REPORT_FRAUD"]'::jsonb)
ON CONFLICT (name) DO UPDATE SET 
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions;

-- --------------------------------------------------------------------
-- 4. TABLE SECTEURS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Données initiales des secteurs portuaires de Vridi
INSERT INTO public.sectors (code, name, description)
VALUES 
  ('VRD-PORT', 'VRIDI PORT', 'Zone principale du terminal à conteneurs et quais portuaires'),
  ('VRD-CANAL', 'VRIDI CANAL', 'Axe de transit du canal et dépôts logistiques'),
  ('VRD-ZONE-IND', 'VRIDI ZONE INDUSTRIELLE', 'Secteur des usines, raffineries et entrepôts de stockage'),
  ('VRD-TERMINAL', 'VRIDI TERMINAL SUD', 'Zone tampon des poids lourds et camions citernes')
ON CONFLICT (code) DO NOTHING;

-- --------------------------------------------------------------------
-- 5. TABLE PROFILS UTILISATEURS (Liée à auth.users de Supabase)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 6. TABLE DES TENTATIVES DE CONNEXION (SÉCURITÉ & AUDIT BRUTE-FORCE)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 7. TABLE CARNETS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.carnets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carnet_number TEXT NOT NULL UNIQUE,
  series_prefix TEXT NOT NULL DEFAULT 'VRD',
  generation_batch TEXT NOT NULL DEFAULT 'GEN-1',
  size INT NOT NULL CHECK (size > 0 AND size % 3 = 0), -- Règle : multiple de 3 obligatoire
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

-- --------------------------------------------------------------------
-- 8. TABLE TICKETS
-- --------------------------------------------------------------------
-- Un ticket a son UUID interne propre.
-- Son numéro physique (ex: VRD-000101) est distinct de son identifiant interne.
-- La contrainte UNIQUE composite permet de réutiliser éventuellement un numéro
-- dans une génération/batch différente, tout en empêchant les doublons dans la même génération.
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
  
  -- Données de vente
  sale_id UUID,
  sold_at TIMESTAMPTZ, -- Date originale de vente (ne jamais écraser par la synchro)
  plate_number TEXT,  -- Normalisé majuscule sans tiret ni espace
  driver_phone TEXT,
  is_superseded BOOLEAN NOT NULL DEFAULT FALSE,
  superseded_by_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  superseded_by_ticket_number TEXT,
  covered_by_remittance_id UUID,

  -- Contrôles routiers
  control_count INT NOT NULL DEFAULT 0 CHECK (control_count >= 0),
  last_controlled_at TIMESTAMPTZ,
  last_controlled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Annulation administrative
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Contrainte d'unicité par lot de génération (permet réutilisation en batch futur)
  CONSTRAINT uq_ticket_generation_number UNIQUE (generation_batch, ticket_number),

  -- Contraintes de cohérence d'état
  CONSTRAINT chk_ticket_sold_coherence CHECK (
    (status != 'SOLD') OR (sold_at IS NOT NULL AND plate_number IS NOT NULL)
  ),
  CONSTRAINT chk_ticket_cancelled_coherence CHECK (
    (status != 'CANCELLED') OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)
  )
);

-- --------------------------------------------------------------------
-- 9. TABLE TICKET_ASSIGNMENTS (TRAÇABILITÉ COMPLÈTE DES MOUVEMENTS)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 10. TABLE TICKET_STATUS_HISTORY (HISTORIQUE DES TRANSITIONS D'ÉTATS)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  old_status ticket_status,
  new_status ticket_status NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT
);

-- --------------------------------------------------------------------
-- 11. TABLE VENTES (IDEMPOTENCE OFFLINE & CONTRAINTES STRICTES)
-- --------------------------------------------------------------------
-- Un ticket ne peut être vendu qu'une seule fois (ticket_id UNIQUE).
-- La synchronisation utilise sync_idempotency_key UNIQUE pour empêcher tout doublon.
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE RESTRICT,
  ticket_number TEXT NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  plate_number TEXT NOT NULL,
  driver_phone TEXT,
  sold_at TIMESTAMPTZ NOT NULL, -- Date originale sur le terrain (immuable)
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

-- Clé étrangère différée pour lier le ticket à la vente
ALTER TABLE public.tickets 
  ADD CONSTRAINT fk_tickets_sale 
  FOREIGN KEY (sale_id) 
  REFERENCES public.sales(id) 
  ON DELETE SET NULL 
  DEFERRABLE INITIALLY DEFERRED;

-- --------------------------------------------------------------------
-- 12. TABLE REMISES FINANCIÈRES (REMITTANCES)
-- --------------------------------------------------------------------
-- Une remise est IMMUABLE pour le responsable.
-- Les suppressions sont physiquement interdites par trigger et RLS.
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

-- Liaison des tickets à la remise
ALTER TABLE public.tickets 
  ADD CONSTRAINT fk_tickets_remittance 
  FOREIGN KEY (covered_by_remittance_id) 
  REFERENCES public.remittances(id) 
  ON DELETE SET NULL;

ALTER TABLE public.sales 
  ADD CONSTRAINT fk_sales_remittance 
  FOREIGN KEY (covered_by_remittance_id) 
  REFERENCES public.remittances(id) 
  ON DELETE SET NULL;

-- --------------------------------------------------------------------
-- 13. TABLE REMITTANCE_ADJUSTMENTS (CORRECTIONS ADMINISTRATIVES TRAÇÉES)
-- --------------------------------------------------------------------
-- Aucune suppression de remise : toute correction administrative insère
-- une nouvelle trace avec motif obligatoire, ancien et nouveau montant.
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

-- --------------------------------------------------------------------
-- 14. TABLE CONTRÔLES ROUTIERS (CONTROLS)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 15. TABLE SIGNALEMENTS DE FRAUDES (FRAUD_REPORTS)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 16. TABLE NOTIFICATIONS (ALERTES FINANCIÈRES & SYSTÈME)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 17. TABLE AUDIT_LOGS (STRICTEMENT APPEND-ONLY)
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 18. TABLE SYNC_QUEUE (FILE D'ATTENTE DE SYNCHRONISATION OFFLINE IDEMPOTENTE)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_mutation_id UUID NOT NULL UNIQUE, -- Identifiant unique de synchronisation côté client
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

-- --------------------------------------------------------------------
-- 19. TABLE APP_SETTINGS (PARAMÈTRES GLOBAUX CENTRALISÉS)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Paramètres de base de PORTUS
INSERT INTO public.app_settings (key, value, description)
VALUES 
  ('ticket_price_fcfa', '5000'::jsonb, 'Prix fixe unitaire de la taxe de stationnement en FCFA'),
  ('ticket_validity_days', '7'::jsonb, 'Durée de validité d''un ticket avant alerte doublon (jours)'),
  ('carnet_size_multiple', '3'::jsonb, 'Multiple obligatoire pour la taille d''un carnet de tickets'),
  ('remittance_alert_start_threshold', '10'::jsonb, 'Nombre de tickets vendus sans versement déclenchant la 1ère alerte'),
  ('remittance_alert_step', '5'::jsonb, 'Pas d''incrémentation des alertes financières (10, 15, 20...)'),
  ('system_name', '"PORTUS — U.J.S.R.V."'::jsonb, 'Nom officiel du système de gestion')
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description;

-- ====================================================================
-- TRIGGERS & SÉCURITÉ BASE DE DONNÉES (IMMUABILITÉ & COHÉRENCE)
-- ====================================================================

-- A. INTERDICTION STRICTE DE MODIFIER OU SUPPRIMER L'AUDIT (APPEND-ONLY)
CREATE OR REPLACE FUNCTION public.fn_prevent_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PORTUS ERREUR SÉCURITÉ: La table audit_logs est strictement append-only. Aucune modification ou suppression n''est permise.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_tampering ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_tampering
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_audit_tampering();

-- B. INTERDICTION DE SUPPRIMER LES REMISES (IMMUABILITÉ)
CREATE OR REPLACE FUNCTION public.fn_prevent_remittance_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PORTUS ERREUR: Une remise financière est définitive et ne peut jamais être supprimée. Utilisez la correction administrative.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_remittances_no_delete ON public.remittances;
CREATE TRIGGER trg_remittances_no_delete
BEFORE DELETE ON public.remittances
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_remittance_deletion();

-- C. VÉRIFICATION D'IMMUABILITÉ PAR LE RESPONSABLE LORS D'UNE MISE À JOUR DE REMISE
CREATE OR REPLACE FUNCTION public.fn_protect_remittance_updates()
RETURNS TRIGGER AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role = 'RESPONSABLE' THEN
    RAISE EXCEPTION 'PORTUS ERREUR: Un responsable ne peut pas modifier une remise enregistrée. Seul un administrateur peut enregistrer une correction traçable.';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_remittances_protect_update ON public.remittances;
CREATE TRIGGER trg_remittances_protect_update
BEFORE UPDATE ON public.remittances
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_remittance_updates();

-- D. SYNCHRONISATION AUTOMATIQUE DU STATUT DU TICKET LORS D'UNE VENTE
CREATE OR REPLACE FUNCTION public.fn_on_sale_inserted()
RETURNS TRIGGER AS $$
BEGIN
  -- Mettre à jour le ticket lié
  UPDATE public.tickets
  SET 
    status = 'SOLD',
    sale_id = NEW.id,
    sold_at = NEW.sold_at,
    plate_number = NEW.plate_number,
    driver_phone = NEW.driver_phone,
    updated_at = NOW()
  WHERE id = NEW.ticket_id;

  -- Enregistrer l'historique d'état
  INSERT INTO public.ticket_status_history (
    ticket_id, old_status, new_status, changed_by, reason
  ) VALUES (
    NEW.ticket_id, 'ASSIGNED_TO_AGENT', 'SOLD', NEW.agent_id, 'Vente de ticket enregistrée (Immatriculation: ' || NEW.plate_number || ')'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sale_update_ticket ON public.sales;
CREATE TRIGGER trg_sale_update_ticket
AFTER INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.fn_on_sale_inserted();

-- ====================================================================
-- INDEX DE PERFORMANCE & RECHERCHE HAUTE DISPONIBILITÉ
-- ====================================================================

-- 0. Index sur profils (profiles)
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_sector ON public.profiles(sector_id);

-- 1. Index sur tickets
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number ON public.tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_plate_number ON public.tickets(plate_number);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_agent ON public.tickets(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_responsable ON public.tickets(assigned_responsable_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_sold_at ON public.tickets(sold_at);
CREATE INDEX IF NOT EXISTS idx_tickets_carnet ON public.tickets(carnet_id);
CREATE INDEX IF NOT EXISTS idx_tickets_sector ON public.tickets(sector_id);

-- 2. Index sur ventes (sales)
CREATE INDEX IF NOT EXISTS idx_sales_plate_number ON public.sales(plate_number);
CREATE INDEX IF NOT EXISTS idx_sales_agent ON public.sales(agent_id);
CREATE INDEX IF NOT EXISTS idx_sales_sector ON public.sales(sector_id);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON public.sales(sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_sync_key ON public.sales(sync_idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sales_ticket ON public.sales(ticket_id);

-- 3. Index sur remises (remittances)
CREATE INDEX IF NOT EXISTS idx_remittances_agent ON public.remittances(agent_id);
CREATE INDEX IF NOT EXISTS idx_remittances_responsable ON public.remittances(responsable_id);
CREATE INDEX IF NOT EXISTS idx_remittances_date ON public.remittances(date DESC);
CREATE INDEX IF NOT EXISTS idx_remittances_created_at ON public.remittances(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_remittances_reference ON public.remittances(reference);

-- 4. Index sur contrôles et fraudes
CREATE INDEX IF NOT EXISTS idx_controls_plate ON public.controls(plate_number);
CREATE INDEX IF NOT EXISTS idx_controls_ticket ON public.controls(ticket_number);
CREATE INDEX IF NOT EXISTS idx_controls_controleur ON public.controls(controleur_id);
CREATE INDEX IF NOT EXISTS idx_controls_controlled_at ON public.controls(controlled_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_plate ON public.fraud_reports(plate_number);
CREATE INDEX IF NOT EXISTS idx_fraud_ticket ON public.fraud_reports(ticket_number);
CREATE INDEX IF NOT EXISTS idx_fraud_status ON public.fraud_reports(status);
CREATE INDEX IF NOT EXISTS idx_fraud_reported_at ON public.fraud_reports(reported_at DESC);

-- 5. Index sur audit & synchronisation
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_target_entity ON public.audit_logs(target_entity);
CREATE INDEX IF NOT EXISTS idx_sync_queue_client_mutation ON public.sync_queue(client_mutation_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status_time ON public.sync_queue(status, client_timestamp);
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_time ON public.login_attempts(username, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON public.notifications(recipient_id, is_read);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES RIGOUREUSES & VÉRIFIÉES
-- ====================================================================

-- Activer RLS sur TOUTES les tables
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Fonctions utilitaires SECURITY DEFINER pour évaluer les privilèges sans contournement
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_sector_id()
RETURNS UUID AS $$
  SELECT sector_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'ADMINISTRATEUR' AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_responsable()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'RESPONSABLE' AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- --------------------------------------------------------------------
-- A. POLITIQUES POUR 'roles', 'sectors' ET 'app_settings'
-- --------------------------------------------------------------------
-- Tout utilisateur authentifié peut lire les rôles et secteurs actifs
CREATE POLICY "Read roles authenticated" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read sectors authenticated" ON public.sectors FOR SELECT TO authenticated USING (is_active = true OR public.is_admin());
CREATE POLICY "Admin manage sectors" ON public.sectors FOR ALL TO authenticated USING (public.is_admin());
-- Paramètres généraux de l'application :
-- Les utilisateurs authentifiés ont accès en lecture à l'exception stricte de la clé HMAC serveur
CREATE POLICY "Read app settings authenticated" ON public.app_settings FOR SELECT TO authenticated 
  USING (key != 'server_hmac_signing_key' OR public.is_admin());
CREATE POLICY "Admin update app settings" ON public.app_settings FOR ALL TO authenticated USING (public.is_admin());

-- --------------------------------------------------------------------
-- B. POLITIQUES POUR 'profiles'
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Responsable read sector profiles" ON public.profiles FOR SELECT TO authenticated
  USING (
    public.is_admin() OR 
    (public.is_responsable() AND (sector_id = public.get_current_sector_id() OR id = auth.uid()))
  );

CREATE POLICY "User read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "User update own phone" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- --------------------------------------------------------------------
-- C. POLITIQUES POUR 'carnets'
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access carnets" ON public.carnets FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Responsable read sector carnets" ON public.carnets FOR SELECT TO authenticated
  USING (
    public.is_responsable() AND 
    (assigned_to_responsable = auth.uid() OR sector_id = public.get_current_sector_id())
  );

-- --------------------------------------------------------------------
-- D. POLITIQUES POUR 'tickets' (MUTATIONS VIA RPC SÉCURISÉES SEULEMENT)
-- --------------------------------------------------------------------
-- 1. Administrateur : accès global
CREATE POLICY "Admin full access tickets" ON public.tickets FOR ALL TO authenticated USING (public.is_admin());

-- 2. Responsable : uniquement son secteur et ses agents
CREATE POLICY "Responsable read sector tickets" ON public.tickets FOR SELECT TO authenticated
  USING (
    public.is_responsable() AND 
    (assigned_responsable_id = auth.uid() OR sector_id = public.get_current_sector_id())
  );

-- 3. Agent : uniquement ses tickets attribués
CREATE POLICY "Agent read assigned tickets" ON public.tickets FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'AGENT' AND 
    assigned_agent_id = auth.uid()
  );

-- 4. Contrôleur : lecture des tickets pour vérification de validité
CREATE POLICY "Controleur verify tickets" ON public.tickets FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'CONTROLEUR' OR
    public.is_responsable() OR
    public.is_admin()
  );

-- --------------------------------------------------------------------
-- E. POLITIQUES POUR 'sales' (VENTES - MUTATIONS VIA RPC 'sell_ticket_secure')
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access sales" ON public.sales FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Responsable read sector sales" ON public.sales FOR SELECT TO authenticated
  USING (
    public.is_responsable() AND 
    (sector_id = public.get_current_sector_id() OR agent_id IN (
      SELECT id FROM public.profiles WHERE sector_id = public.get_current_sector_id()
    ))
  );

CREATE POLICY "Agent read own sales" ON public.sales FOR SELECT TO authenticated
  USING (public.get_current_role() = 'AGENT' AND agent_id = auth.uid());

-- --------------------------------------------------------------------
-- F. POLITIQUES POUR 'remittances' & 'remittance_adjustments'
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access remittances" ON public.remittances FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Responsable read sector remittances" ON public.remittances FOR SELECT TO authenticated
  USING (
    public.is_responsable() AND 
    (responsable_id = auth.uid() OR sector_id = public.get_current_sector_id())
  );

CREATE POLICY "Responsable insert remittance" ON public.remittances FOR INSERT TO authenticated
  WITH CHECK (
    public.is_responsable() AND 
    responsable_id = auth.uid()
  );

CREATE POLICY "Agent read own remittances" ON public.remittances FOR SELECT TO authenticated
  USING (agent_id = auth.uid());

-- Corrections de remise (table d'ajustements : admin uniquement)
CREATE POLICY "Admin full access remittance adjustments" ON public.remittance_adjustments 
  FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Responsable view remittance adjustments" ON public.remittance_adjustments 
  FOR SELECT TO authenticated USING (public.is_responsable());

-- --------------------------------------------------------------------
-- G. POLITIQUES POUR 'controls' & 'fraud_reports'
-- (LES CONTRÔLES SONT ENREGISTRÉS PAR LA RPC 'record_control_secure')
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access controls" ON public.controls FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Admin full access fraud reports" ON public.fraud_reports FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Controleur read own controls" ON public.controls FOR SELECT TO authenticated
  USING (public.get_current_role() = 'CONTROLEUR' AND controleur_id = auth.uid());

CREATE POLICY "Controleur read own fraud reports" ON public.fraud_reports FOR SELECT TO authenticated
  USING (public.get_current_role() = 'CONTROLEUR' AND controleur_id = auth.uid());

CREATE POLICY "Controleur insert fraud report" ON public.fraud_reports FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() = 'CONTROLEUR' AND 
    controleur_id = auth.uid()
  );

CREATE POLICY "Responsable read sector fraud reports" ON public.fraud_reports FOR SELECT TO authenticated
  USING (public.is_responsable());

-- --------------------------------------------------------------------
-- H. POLITIQUES POUR 'audit_logs' (APPEND-ONLY VIA TRIGGER & RLS)
-- --------------------------------------------------------------------
CREATE POLICY "Admin read all audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Authenticated insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- --------------------------------------------------------------------
-- I. POLITIQUES POUR 'notifications'
-- --------------------------------------------------------------------
CREATE POLICY "User read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR public.is_admin());

CREATE POLICY "User update own notifications read status" ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "System insert notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

-- --------------------------------------------------------------------
-- J. POLITIQUES POUR 'sync_queue'
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access sync queue" ON public.sync_queue FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Agent manage own sync queue" ON public.sync_queue FOR ALL TO authenticated
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

-- --------------------------------------------------------------------
-- K. POLITIQUES POUR 'ticket_assignments' & 'ticket_status_history'
-- --------------------------------------------------------------------
CREATE POLICY "Admin full access assignments" ON public.ticket_assignments FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Responsable read assignments" ON public.ticket_assignments FOR SELECT TO authenticated USING (public.is_responsable());
CREATE POLICY "Responsable insert assignments" ON public.ticket_assignments FOR INSERT TO authenticated WITH CHECK (assigned_by = auth.uid());

CREATE POLICY "Admin read status history" ON public.ticket_status_history FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Responsable read status history" ON public.ticket_status_history FOR SELECT TO authenticated USING (public.is_responsable());

-- ====================================================================
-- L. DÉFENSE EN PROFONDEUR : TRIGGERS SERVEUR CRITIQUES (NE JAMAIS FAIRE CONFIANCE AU CLIENT)
-- ====================================================================

-- 1. VÉRIFICATION DE MUTATION DE TICKET (SEUL L'ADMIN PEUT ANNULER UN TICKET)
CREATE OR REPLACE FUNCTION public.check_ticket_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- RÈGLE MÉTIER : Un responsable ou agent ne doit JAMAIS pouvoir annuler un ticket
  IF NEW.status = 'CANCELLED' AND (OLD.status IS NULL OR OLD.status != 'CANCELLED') THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Privilège insuffisant : Seul l’administrateur général est autorisé à annuler un ticket ou carnet.';
    END IF;
  END IF;

  -- Empêcher la rétrogradation arbitraire d'un ticket vendu vers disponible
  IF OLD.status IN ('SOLD', 'CONTROLLED') AND NEW.status IN ('AVAILABLE', 'ASSIGNED_TO_RESPONSIBLE', 'ASSIGNED_TO_AGENT') THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Violation d’intégrité : Impossible de réattribuer ou de libérer un ticket déjà vendu.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_ticket_mutation ON public.tickets;
CREATE TRIGGER trg_check_ticket_mutation
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.check_ticket_mutation();

-- 2. VALIDATION FINANCIÈRE DES VENTES (RECALCUL OBLIGATOIRE CÔTÉ SERVEUR)
CREATE OR REPLACE FUNCTION public.validate_sale_financials()
RETURNS TRIGGER AS $$
DECLARE
  v_assigned_agent UUID;
  v_ticket_status ticket_status;
BEGIN
  -- RÈGLE FINANCIÈRE : Le prix unitaire est IMPOSÉ à 5 000 FCFA côté serveur (anti-tampering)
  NEW.price := 5000;

  -- Vérifier l'existence et l'attribution du ticket
  SELECT assigned_agent_id, status INTO v_assigned_agent, v_ticket_status 
  FROM public.tickets 
  WHERE id = NEW.ticket_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket introuvable pour la vente (ID: %).', NEW.ticket_id;
  END IF;

  -- Un agent ne peut vendre QUE les tickets qui lui sont assignés
  IF v_assigned_agent IS NOT NULL AND v_assigned_agent != NEW.agent_id THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Violation de sécurité : Ce ticket est attribué à un autre agent.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_sale_financials ON public.sales;
CREATE TRIGGER trg_validate_sale_financials
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.validate_sale_financials();

-- 3. IMMUTABILITÉ DES VENTES (UN AGENT NE PEUT JAMAIS MODIFIER UNE VENTE)
CREATE OR REPLACE FUNCTION public.prevent_sale_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Violation de sécurité : Les ventes enregistrées sont immuables.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_sale_mutation ON public.sales;
CREATE TRIGGER trg_prevent_sale_mutation
  BEFORE UPDATE OR DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sale_mutation();

-- 4. VALIDATION FINANCIÈRE DES REMISES (RECALCUL CÔTÉ SERVEUR)
CREATE OR REPLACE FUNCTION public.validate_remittance_financials()
RETURNS TRIGGER AS $$
BEGIN
  -- Le montant doit être strictement positif
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Montant de remise invalide (%) : Le montant doit être strictement positif.', NEW.amount;
  END IF;

  -- Le nombre de tickets couverts est calculé mathématiquement côté serveur
  NEW.tickets_count := FLOOR(NEW.amount / 5000);

  -- Un responsable ne peut jamais modifier une remise existante
  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Privilège insuffisant : Un responsable ne peut pas modifier une remise enregistrée. Seul l’administrateur peut procéder à un ajustement auditée.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_remittance_financials ON public.remittances;
CREATE TRIGGER trg_validate_remittance_financials
  BEFORE INSERT OR UPDATE ON public.remittances
  FOR EACH ROW EXECUTE FUNCTION public.validate_remittance_financials();

-- ====================================================================
-- M. GESTION CRYPTOGRAPHIQUE DES SIGNATURES HMAC-SHA256 (SERVEUR SEULEMENT)
-- LE CLIENT WEB NE DOIT JAMAIS DÉTENIR LA CLÉ SECRÈTE HMAC
-- ====================================================================

-- 1. CLÉ SECRÈTE HMAC SERVEUR (INTERNE - ACCÈS RÉVOQUÉ POUR LE CLIENT)
CREATE OR REPLACE FUNCTION public.get_server_hmac_secret()
RETURNS TEXT AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT (value->>'secret') INTO v_secret 
  FROM public.app_settings 
  WHERE key = 'server_hmac_signing_key';

  IF v_secret IS NULL OR v_secret = '' THEN
    v_secret := encode(gen_random_bytes(32), 'hex');
    INSERT INTO public.app_settings (key, value, description)
    VALUES (
      'server_hmac_signing_key',
      jsonb_build_object('secret', v_secret, 'algorithm', 'HMAC-SHA256', 'created_at', NOW()),
      'Clé secrète serveur HMAC-SHA256 pour signature inviolable des QR codes'
    )
    ON CONFLICT (key) DO UPDATE SET updated_at = NOW();
  END IF;

  RETURN v_secret;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

REVOKE ALL ON FUNCTION public.get_server_hmac_secret() FROM PUBLIC, anon, authenticated;

-- 2. FONCTION DE CALCUL DE LA SIGNATURE HMAC-SHA256 D'UN PAYLOAD CANONIQUE
CREATE OR REPLACE FUNCTION public.sign_ticket_canonical(p_canonical TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN encode(hmac(p_canonical::bytea, public.get_server_hmac_secret()::bytea, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

REVOKE ALL ON FUNCTION public.sign_ticket_canonical(TEXT) FROM PUBLIC, anon, authenticated;

-- 3. TRIGGER AUTOMATIQUE POUR SIGNER LES TICKETS LORS DE LEUR CRÉATION
CREATE OR REPLACE FUNCTION public.generate_secure_ticket_qr()
RETURNS TRIGGER AS $$
DECLARE
  v_canonical TEXT;
  v_sig TEXT;
  v_carnet_ref TEXT := 'VRD';
BEGIN
  SELECT carnet_number INTO v_carnet_ref FROM public.carnets WHERE id = NEW.carnet_id;

  -- Format canonique officiel : PORTUS|v1|ticket_id|carnet_number|ticket_number|price
  v_canonical := 'PORTUS|v1|' || NEW.id::TEXT || '|' || COALESCE(v_carnet_ref, 'VRD') || '|' || NEW.ticket_number || '|' || COALESCE(NEW.price, 5000)::TEXT;
  v_sig := public.sign_ticket_canonical(v_canonical);

  NEW.qr_payload := jsonb_build_object(
    'v', 1,
    'tid', NEW.id,
    'cid', NEW.carnet_id,
    'ref', COALESCE(v_carnet_ref, 'VRD'),
    'num', NEW.ticket_number,
    'price', COALESCE(NEW.price, 5000),
    'sig', v_sig
  )::TEXT;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

DROP TRIGGER IF EXISTS trg_generate_secure_ticket_qr ON public.tickets;
CREATE TRIGGER trg_generate_secure_ticket_qr
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  WHEN (NEW.qr_payload IS NULL OR NEW.qr_payload = '')
  EXECUTE FUNCTION public.generate_secure_ticket_qr();

-- ====================================================================
-- N. RPC SÉCURISÉES DE PRODUCTION
-- ====================================================================

-- 1. VÉRIFICATION AUTORITAIRE DE TICKET (SIGNATURE HMAC-SHA256, VALIDITÉ, IMMATRICULATION, CONTRÔLES)
CREATE OR REPLACE FUNCTION public.verify_ticket_secure(
  p_ticket_identifier TEXT,
  p_scanned_token TEXT DEFAULT NULL,
  p_plate_number TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_ticket RECORD;
  v_stored_sig TEXT := NULL;
  v_expected_sig TEXT := NULL;
  v_canonical TEXT;
  v_sig_valid BOOLEAN := FALSE;
  v_plate_match BOOLEAN := TRUE;
  v_clean_search TEXT;
  v_clean_scanned_plate TEXT := NULL;
  v_clean_ticket_plate TEXT := NULL;
  v_controls_count INT := 0;
  v_last_control TIMESTAMPTZ := NULL;
  v_is_valid BOOLEAN := FALSE;
  v_status_code TEXT := 'VALID';
  v_message TEXT := 'Ticket authentique et valide.';
BEGIN
  v_clean_search := TRIM(p_ticket_identifier);
  IF v_clean_search IS NULL OR v_clean_search = '' THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_EMPTY',
      'valid', false,
      'signature_verified', false,
      'message', 'Identifiant de ticket manquant.'
    );
  END IF;

  -- 1. Rechercher le ticket par identifiant ou numéro physique
  SELECT t.*, c.carnet_number, p.full_name AS agent_name, p.phone AS agent_phone, s.name AS sector_name
  INTO v_ticket
  FROM public.tickets t
  LEFT JOIN public.carnets c ON c.id = t.carnet_id
  LEFT JOIN public.profiles p ON p.id = t.assigned_agent_id
  LEFT JOIN public.sectors s ON s.id = t.sector_id
  WHERE t.ticket_number ILIKE v_clean_search 
     OR t.id::TEXT = v_clean_search
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_UNKNOWN',
      'valid', false,
      'signature_verified', false,
      'message', 'Ce ticket n’existe pas dans le registre officiel de l’U.J.S.R.V.'
    );
  END IF;

  -- 2. Extraction du token/signature cryptographique
  IF v_ticket.qr_payload IS NOT NULL AND v_ticket.qr_payload != '' THEN
    BEGIN
      v_stored_sig := (v_ticket.qr_payload::jsonb)->>'sig';
      IF v_stored_sig IS NULL OR v_stored_sig = '' THEN
        v_stored_sig := (v_ticket.qr_payload::jsonb)->>'tok';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_stored_sig := NULL;
    END;
  END IF;

  -- Recalcul de la signature attendue par le serveur
  v_canonical := 'PORTUS|v1|' || v_ticket.id::TEXT || '|' || COALESCE(v_ticket.carnet_number, 'VRD') || '|' || v_ticket.ticket_number || '|' || COALESCE(v_ticket.price, 5000)::TEXT;
  v_expected_sig := public.sign_ticket_canonical(v_canonical);

  IF p_scanned_token IS NOT NULL AND TRIM(p_scanned_token) != '' THEN
    IF TRIM(p_scanned_token) = v_expected_sig OR TRIM(p_scanned_token) = v_stored_sig THEN
      v_sig_valid := TRUE;
    ELSE
      RETURN jsonb_build_object(
        'status', 'FORGED_SIGNATURE',
        'valid', false,
        'signature_verified', false,
        'ticket_number', v_ticket.ticket_number,
        'message', 'ALERTE SÉCURITÉ : Signature cryptographique invalide ou altérée. Faux ticket détecté !'
      );
    END IF;
  ELSE
    v_sig_valid := (v_stored_sig = v_expected_sig);
  END IF;

  -- 3. Historique des contrôles préalables
  SELECT COUNT(*), MAX(controlled_at)
  INTO v_controls_count, v_last_control
  FROM public.controls
  WHERE ticket_id = v_ticket.id;

  -- 4. Vérification de concordance de plaque d'immatriculation
  IF p_plate_number IS NOT NULL AND TRIM(p_plate_number) != '' AND v_ticket.plate_number IS NOT NULL THEN
    v_clean_scanned_plate := UPPER(REGEXP_REPLACE(p_plate_number, '[^A-Z0-9]', '', 'g'));
    v_clean_ticket_plate := UPPER(REGEXP_REPLACE(v_ticket.plate_number, '[^A-Z0-9]', '', 'g'));

    IF v_clean_scanned_plate != '' AND v_clean_ticket_plate != '' AND v_clean_scanned_plate != v_clean_ticket_plate THEN
      v_plate_match := FALSE;
      v_status_code := 'PLATE_MISMATCH';
      v_message := 'ALERTE IMMATRICULATION : Ticket émis pour le camion ' || v_ticket.plate_number || ' mais présenté sur ' || UPPER(TRIM(p_plate_number)) || ' (Fraude suspectée).';
    END IF;
  END IF;

  -- 5. Vérification du statut métier
  IF v_ticket.is_superseded THEN
    v_status_code := 'SUPERSEDED';
    v_message := 'Ticket inactif (SUPERSEDED) : ce ticket a été remplacé par un nouveau ticket actif.';
    v_is_valid := FALSE;
  ELSIF v_ticket.status = 'CANCELLED' THEN
    v_status_code := 'CANCELLED';
    v_message := 'Ticket officiellement annulé par l’administration.';
    v_is_valid := FALSE;
  ELSIF v_ticket.status IN ('GENERATED', 'ASSIGNED_TO_RESPONSIBLE', 'AVAILABLE', 'ASSIGNED_TO_AGENT') THEN
    v_status_code := 'NOT_SOLD';
    v_message := 'Ticket officiel mais NON ENCORE VENDU. Stationnement non autorisé.';
    v_is_valid := FALSE;
  ELSIF NOT v_plate_match THEN
    v_is_valid := FALSE;
  ELSIF v_ticket.status IN ('SOLD', 'CONTROLLED') THEN
    v_is_valid := TRUE;
    IF v_ticket.status = 'CONTROLLED' THEN
      v_status_code := 'ALREADY_CONTROLLED';
      v_message := 'Ticket valide (déjà contrôlé ' || v_controls_count || ' fois).';
    ELSE
      v_status_code := 'VALID';
      v_message := 'Ticket officiel valide et autorisé.';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status_code,
    'valid', v_is_valid,
    'signature_verified', v_sig_valid,
    'ticket_id', v_ticket.id,
    'ticket_number', v_ticket.ticket_number,
    'carnet_number', v_ticket.carnet_number,
    'price', v_ticket.price,
    'status_db', v_ticket.status,
    'plate_number', v_ticket.plate_number,
    'driver_phone', v_ticket.driver_phone,
    'sold_at', v_ticket.sold_at,
    'sector_name', v_ticket.sector_name,
    'agent_name', v_ticket.agent_name,
    'agent_phone', v_ticket.agent_phone,
    'is_superseded', COALESCE(v_ticket.is_superseded, false),
    'control_count', v_controls_count,
    'last_controlled_at', v_last_control,
    'plate_match', v_plate_match,
    'message', v_message
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

GRANT EXECUTE ON FUNCTION public.verify_ticket_secure(TEXT, TEXT, TEXT) TO anon, authenticated;

-- 2. ENREGISTREMENT SÉCURISÉ D'UN CONTRÔLE ROUTIER (LE CONTRÔLEUR NE PEUT PAS FALSIFIER IS_VALID)
CREATE OR REPLACE FUNCTION public.record_control_secure(
  p_ticket_identifier TEXT,
  p_scanned_token TEXT DEFAULT NULL,
  p_plate_number TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_role user_role;
  v_verif JSONB;
  v_control_id UUID := gen_random_uuid();
  v_is_valid BOOLEAN;
  v_anomaly_detected BOOLEAN;
  v_ticket_id UUID;
  v_ticket_number TEXT;
  v_status_code TEXT;
  v_message TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE;
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Accès refusé : Profil inactif ou non trouvé.';
  END IF;

  IF v_caller_role NOT IN ('CONTROLEUR', 'ADMINISTRATEUR', 'RESPONSABLE') THEN
    RAISE EXCEPTION 'Accès refusé : Seuls les contrôleurs, responsables et administrateurs peuvent enregistrer un contrôle.';
  END IF;

  -- 1. Évaluation autoritaire par le serveur
  v_verif := public.verify_ticket_secure(p_ticket_identifier, p_scanned_token, p_plate_number);
  
  v_is_valid := (v_verif->>'valid')::BOOLEAN;
  v_anomaly_detected := NOT v_is_valid;
  v_status_code := v_verif->>'status';
  v_message := v_verif->>'message';
  
  IF (v_verif->>'ticket_id') IS NOT NULL THEN
    v_ticket_id := (v_verif->>'ticket_id')::UUID;
    v_ticket_number := v_verif->>'ticket_number';
  ELSE
    v_ticket_number := p_ticket_identifier;
  END IF;

  -- 2. Insertion avec validité calculée par le serveur
  INSERT INTO public.controls (
    id, ticket_id, ticket_number, controleur_id, controlled_at,
    is_valid, plate_number, location, anomaly_detected, notes
  ) VALUES (
    v_control_id,
    v_ticket_id,
    v_ticket_number,
    auth.uid(),
    NOW(),
    v_is_valid,
    p_plate_number,
    p_location,
    v_anomaly_detected,
    COALESCE(p_notes, v_message)
  );

  -- 3. Mise à jour du statut du ticket si valide
  IF v_is_valid AND v_ticket_id IS NOT NULL THEN
    UPDATE public.tickets
    SET status = 'CONTROLLED',
        updated_at = NOW()
    WHERE id = v_ticket_id AND status = 'SOLD';

    INSERT INTO public.ticket_status_history (
      ticket_id, old_status, new_status, changed_by, reason
    ) VALUES (
      v_ticket_id, 'SOLD', 'CONTROLLED', auth.uid(), 'Contrôle routier officiel validé (' || COALESCE(p_location, 'Vridi') || ')'
    );
  END IF;

  -- 4. Audit
  INSERT INTO public.audit_logs (
    actor_id, actor_name, actor_role, action, target_entity, target_id, details, timestamp
  ) VALUES (
    auth.uid(),
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    v_caller_role,
    CASE WHEN v_is_valid THEN 'CONTROL_PASSED' ELSE 'CONTROL_ANOMALY' END,
    'Ticket',
    COALESCE(v_ticket_id::TEXT, v_ticket_number),
    'Contrôle pour ticket ' || v_ticket_number || ' : ' || v_message,
    NOW()
  );

  RETURN jsonb_build_object(
    'control_id', v_control_id,
    'valid', v_is_valid,
    'status', v_status_code,
    'message', v_message,
    'anomaly_detected', v_anomaly_detected,
    'verification', v_verif
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

GRANT EXECUTE ON FUNCTION public.record_control_secure(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 3. VENTE SÉCURISÉE ET IDEMPOTENTE D'UN TICKET (PROTECTION ANTI-TAMPERING & MUTEX)
CREATE OR REPLACE FUNCTION public.sell_ticket_secure(
  p_ticket_id UUID,
  p_plate_number TEXT,
  p_driver_phone TEXT DEFAULT NULL,
  p_sync_idempotency_key UUID DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_accuracy DOUBLE PRECISION DEFAULT NULL,
  p_sold_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller RECORD;
  v_ticket RECORD;
  v_existing_sale RECORD;
  v_clean_plate TEXT;
  v_sale_id UUID;
  v_sold_timestamp TIMESTAMPTZ;
  v_price INT := 5000;
BEGIN
  -- 1. Appelant
  SELECT id, full_name, role, is_active, sector_id
  INTO v_caller
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND OR NOT v_caller.is_active THEN
    RAISE EXCEPTION 'Accès refusé : Utilisateur inactif ou inexistant.';
  END IF;

  IF v_caller.role NOT IN ('AGENT', 'ADMINISTRATEUR', 'RESPONSABLE') THEN
    RAISE EXCEPTION 'Accès refusé : Rôle non autorisé pour effectuer des ventes.';
  END IF;

  -- 2. Idempotence
  IF p_sync_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_sale 
    FROM public.sales 
    WHERE sync_idempotency_key = p_sync_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_duplicate', true,
        'sale_id', v_existing_sale.id,
        'ticket_id', v_existing_sale.ticket_id,
        'ticket_number', v_existing_sale.ticket_number,
        'price', v_existing_sale.price,
        'sold_at', v_existing_sale.sold_at,
        'message', 'Vente déjà enregistrée (idempotence).'
      );
    END IF;
  END IF;

  -- 3. Validation de l'immatriculation
  v_clean_plate := UPPER(TRIM(p_plate_number));
  IF v_clean_plate IS NULL OR LENGTH(v_clean_plate) < 3 THEN
    RAISE EXCEPTION 'Numéro d’immatriculation invalide. Veuillez renseigner une immatriculation conforme.';
  END IF;

  -- 4. Verrouillage du ticket
  SELECT * INTO v_ticket
  FROM public.tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket introuvable (ID: %).', p_ticket_id;
  END IF;

  IF v_ticket.status = 'SOLD' OR v_ticket.status = 'CONTROLLED' THEN
    IF p_sync_idempotency_key IS NOT NULL AND v_ticket.sale_id IS NOT NULL THEN
      SELECT * INTO v_existing_sale FROM public.sales WHERE id = v_ticket.sale_id;
      IF FOUND THEN
        RETURN jsonb_build_object(
          'success', true,
          'idempotent_duplicate', true,
          'sale_id', v_existing_sale.id,
          'ticket_id', v_existing_sale.ticket_id,
          'ticket_number', v_existing_sale.ticket_number,
          'price', v_existing_sale.price,
          'sold_at', v_existing_sale.sold_at,
          'message', 'Ce ticket a déjà été vendu.'
        );
      END IF;
    END IF;
    RAISE EXCEPTION 'Ce ticket a déjà été vendu le % pour le véhicule %.', v_ticket.sold_at, v_ticket.plate_number;
  END IF;

  IF v_ticket.is_superseded THEN
    RAISE EXCEPTION 'Ce ticket a été remplacé par un autre ticket (SUPERSEDED).';
  END IF;

  IF v_ticket.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Ce ticket a été annulé par l’administration.';
  END IF;

  IF v_caller.role = 'AGENT' AND v_ticket.assigned_agent_id != auth.uid() THEN
    RAISE EXCEPTION 'Violation de sécurité : Ce ticket n’est pas attribué à votre compte agent.';
  END IF;

  -- 5. Création de la vente
  v_sale_id := gen_random_uuid();
  v_sold_timestamp := COALESCE(p_sold_at, NOW());

  INSERT INTO public.sales (
    id, ticket_id, ticket_number, carnet_id, agent_id, sector_id,
    plate_number, driver_phone, price, sold_at,
    gps_latitude, gps_longitude, gps_accuracy, sync_idempotency_key, created_at
  ) VALUES (
    v_sale_id,
    v_ticket.id,
    v_ticket.ticket_number,
    v_ticket.carnet_id,
    auth.uid(),
    COALESCE(v_ticket.sector_id, v_caller.sector_id),
    v_clean_plate,
    NULLIF(TRIM(p_driver_phone), ''),
    v_price,
    v_sold_timestamp,
    p_latitude,
    p_longitude,
    p_accuracy,
    p_sync_idempotency_key,
    NOW()
  );

  -- 6. Mise à jour du ticket
  UPDATE public.tickets
  SET status = 'SOLD',
      sale_id = v_sale_id,
      sold_at = v_sold_timestamp,
      plate_number = v_clean_plate,
      driver_phone = NULLIF(TRIM(p_driver_phone), ''),
      updated_at = NOW()
  WHERE id = v_ticket.id;

  -- 7. Historique d'état
  INSERT INTO public.ticket_status_history (
    ticket_id, old_status, new_status, changed_by, reason
  ) VALUES (
    v_ticket.id, v_ticket.status, 'SOLD', auth.uid(), 'Vente officielle véhicule ' || v_clean_plate
  );

  -- 8. Audit
  INSERT INTO public.audit_logs (
    actor_id, actor_name, actor_role, action, target_entity, target_id, details, timestamp
  ) VALUES (
    auth.uid(),
    v_caller.full_name,
    v_caller.role,
    'TICKET_SOLD',
    'Ticket',
    v_ticket.id::TEXT,
    'Vente du ticket ' || v_ticket.ticket_number || ' au camion ' || v_clean_plate || ' (5 000 FCFA)',
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'ticket_id', v_ticket.id,
    'ticket_number', v_ticket.ticket_number,
    'plate_number', v_clean_plate,
    'price', v_price,
    'sold_at', v_sold_timestamp
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

GRANT EXECUTE ON FUNCTION public.sell_ticket_secure(UUID, TEXT, TEXT, UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TIMESTAMPTZ) TO authenticated;

-- 4. ATTRIBUTION SÉCURISÉE DE TICKETS À UN AGENT PAR LE RESPONSABLE DU SECTEUR
CREATE OR REPLACE FUNCTION public.assign_tickets_to_agent_secure(
  p_agent_id UUID,
  p_ticket_ids UUID[]
)
RETURNS JSONB AS $$
DECLARE
  v_caller RECORD;
  v_agent RECORD;
  v_count INT := 0;
  v_tid UUID;
BEGIN
  SELECT id, full_name, role, is_active, sector_id INTO v_caller FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR NOT v_caller.is_active THEN
    RAISE EXCEPTION 'Accès refusé : Profil inactif.';
  END IF;

  IF v_caller.role NOT IN ('RESPONSABLE', 'ADMINISTRATEUR') THEN
    RAISE EXCEPTION 'Seuls les responsables de secteur et administrateurs peuvent attribuer des tickets.';
  END IF;

  SELECT id, full_name, role, sector_id INTO v_agent FROM public.profiles WHERE id = p_agent_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent destinataire introuvable ou inactif.';
  END IF;

  IF v_caller.role = 'RESPONSABLE' AND v_agent.sector_id != v_caller.sector_id THEN
    RAISE EXCEPTION 'Vous ne pouvez attribuer des tickets qu’aux agents de votre secteur.';
  END IF;

  FOREACH v_tid IN ARRAY p_ticket_ids LOOP
    UPDATE public.tickets
    SET status = 'ASSIGNED_TO_AGENT',
        assigned_agent_id = p_agent_id,
        assigned_responsable_id = COALESCE(assigned_responsable_id, auth.uid()),
        updated_at = NOW()
    WHERE id = v_tid
      AND status IN ('ASSIGNED_TO_RESPONSIBLE', 'AVAILABLE')
      AND (v_caller.role = 'ADMINISTRATEUR' OR sector_id = v_caller.sector_id OR assigned_responsable_id = auth.uid());

    IF FOUND THEN
      v_count := v_count + 1;
      INSERT INTO public.ticket_status_history (
        ticket_id, old_status, new_status, changed_by, reason
      ) VALUES (
        v_tid, 'ASSIGNED_TO_RESPONSIBLE', 'ASSIGNED_TO_AGENT', auth.uid(), 'Attribution à l’agent ' || v_agent.full_name
      );
    END IF;
  END LOOP;

  INSERT INTO public.audit_logs (
    actor_id, actor_name, actor_role, action, target_entity, target_id, details, timestamp
  ) VALUES (
    auth.uid(), v_caller.full_name, v_caller.role, 'TICKETS_ASSIGNED', 'Agent', p_agent_id::TEXT,
    v_count || ' ticket(s) attribué(s) à ' || v_agent.full_name, NOW()
  );

  RETURN jsonb_build_object('success', true, 'assigned_count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

GRANT EXECUTE ON FUNCTION public.assign_tickets_to_agent_secure(UUID, UUID[]) TO authenticated;

-- 5. REMPLACEMENT SÉCURISÉ D'UN TICKET (SUPERSEDING)
CREATE OR REPLACE FUNCTION public.supersede_ticket_secure(
  p_old_ticket_id UUID,
  p_new_ticket_id UUID,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller RECORD;
  v_old RECORD;
  v_new RECORD;
BEGIN
  SELECT id, full_name, role, is_active INTO v_caller FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_caller.role NOT IN ('ADMINISTRATEUR', 'RESPONSABLE') THEN
    RAISE EXCEPTION 'Privilège insuffisant pour effectuer un remplacement de ticket.';
  END IF;

  SELECT * INTO v_old FROM public.tickets WHERE id = p_old_ticket_id FOR UPDATE;
  SELECT * INTO v_new FROM public.tickets WHERE id = p_new_ticket_id FOR UPDATE;

  IF v_old.id IS NULL OR v_new.id IS NULL THEN
    RAISE EXCEPTION 'L’un des tickets est introuvable.';
  END IF;

  IF v_new.status != 'ASSIGNED_TO_AGENT' AND v_new.status != 'AVAILABLE' THEN
    RAISE EXCEPTION 'Le nouveau ticket n’est pas disponible.';
  END IF;

  UPDATE public.tickets
  SET is_superseded = TRUE,
      superseded_by_ticket_id = v_new.id,
      superseded_at = NOW(),
      superseded_reason = p_reason,
      status = 'SUPERSEDED',
      updated_at = NOW()
  WHERE id = v_old.id;

  UPDATE public.tickets
  SET replaces_ticket_id = v_old.id,
      plate_number = v_old.plate_number,
      driver_phone = v_old.driver_phone,
      status = 'SOLD',
      sale_id = v_old.sale_id,
      sold_at = NOW(),
      updated_at = NOW()
  WHERE id = v_new.id;

  INSERT INTO public.ticket_status_history (
    ticket_id, old_status, new_status, changed_by, reason
  ) VALUES (
    v_old.id, v_old.status, 'SUPERSEDED', auth.uid(), 'Remplacé par ticket ' || v_new.ticket_number || ' : ' || p_reason
  );

  INSERT INTO public.audit_logs (
    actor_id, actor_name, actor_role, action, target_entity, target_id, details, timestamp
  ) VALUES (
    auth.uid(), v_caller.full_name, v_caller.role, 'TICKET_SUPERSEDED', 'Ticket', v_old.id::TEXT,
    'Ticket ' || v_old.ticket_number || ' remplacé par ' || v_new.ticket_number || ' (Raison: ' || p_reason || ')', NOW()
  );

  RETURN jsonb_build_object('success', true, 'old_ticket_id', v_old.id, 'new_ticket_id', v_new.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

GRANT EXECUTE ON FUNCTION public.supersede_ticket_secure(UUID, UUID, TEXT) TO authenticated;

-- 6. GESTION AUTORITAIRE DU VERROUILLAGE DE COMPTE (15 MINUTES APRÈS 5 ÉCHECS)
CREATE OR REPLACE FUNCTION public.get_account_lockout_status(p_identifier TEXT)
RETURNS JSONB AS $$
DECLARE
  v_locked_until TIMESTAMPTZ;
  v_failed_attempts INT;
  v_remaining_seconds INT := 0;
BEGIN
  IF p_identifier IS NULL OR TRIM(p_identifier) = '' THEN
    RETURN jsonb_build_object('is_locked', false, 'remaining_seconds', 0);
  END IF;

  SELECT p.locked_until, p.failed_attempts
  INTO v_locked_until, v_failed_attempts
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE LOWER(p.username) = LOWER(TRIM(p_identifier))
     OR LOWER(u.email) = LOWER(TRIM(p_identifier))
  LIMIT 1;

  IF FOUND AND v_locked_until IS NOT NULL THEN
    IF v_locked_until > NOW() THEN
      v_remaining_seconds := CEIL(EXTRACT(EPOCH FROM (v_locked_until - NOW())))::INT;
      RETURN jsonb_build_object(
        'is_locked', true,
        'remaining_seconds', v_remaining_seconds,
        'failed_attempts', v_failed_attempts
      );
    ELSE
      UPDATE public.profiles
      SET locked_until = NULL, failed_attempts = 0
      WHERE LOWER(username) = LOWER(TRIM(p_identifier));
    END IF;
  END IF;

  RETURN jsonb_build_object('is_locked', false, 'remaining_seconds', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

GRANT EXECUTE ON FUNCTION public.get_account_lockout_status(TEXT) TO anon, authenticated;

-- 7. ENREGISTREMENT ET GESTION DES TENTATIVES DE CONNEXION AVEC VERROUILLAGE SERVEUR
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_identifier TEXT,
  p_is_success BOOLEAN,
  p_failure_reason TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_profile RECORD;
  v_locked_until TIMESTAMPTZ := NULL;
  v_new_attempts INT := 0;
  v_remaining_seconds INT := 0;
BEGIN
  IF p_identifier IS NULL OR TRIM(p_identifier) = '' THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  SELECT p.*, u.email
  INTO v_profile
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE LOWER(p.username) = LOWER(TRIM(p_identifier))
     OR LOWER(u.email) = LOWER(TRIM(p_identifier))
  LIMIT 1;

  INSERT INTO public.login_attempts (
    username, profile_id, ip_address, user_agent, is_successful, failure_reason, attempted_at
  ) VALUES (
    TRIM(p_identifier),
    v_profile.id,
    p_ip,
    p_user_agent,
    p_is_success,
    p_failure_reason,
    NOW()
  );

  IF v_profile.id IS NOT NULL THEN
    IF p_is_success THEN
      UPDATE public.profiles
      SET failed_attempts = 0,
          locked_until = NULL,
          last_login_at = NOW()
      WHERE id = v_profile.id;

      RETURN jsonb_build_object('is_locked', false, 'remaining_seconds', 0, 'failed_attempts', 0);
    ELSE
      v_new_attempts := COALESCE(v_profile.failed_attempts, 0) + 1;
      IF v_new_attempts >= 5 THEN
        v_locked_until := NOW() + INTERVAL '15 minutes';
        v_remaining_seconds := 900;
        
        UPDATE public.profiles
        SET failed_attempts = v_new_attempts,
            locked_until = v_locked_until
        WHERE id = v_profile.id;

        INSERT INTO public.audit_logs (
          actor_id, actor_name, actor_role, action, target_entity, target_id, details, timestamp
        ) VALUES (
          v_profile.id, v_profile.full_name, v_profile.role, 'LOGIN_LOCKOUT', 'Profile', v_profile.id::TEXT,
          'Compte temporairement verrouillé pour 15 minutes suite à 5 tentatives de mot de passe erronées.', NOW()
        );

        RETURN jsonb_build_object(
          'is_locked', true,
          'remaining_seconds', v_remaining_seconds,
          'failed_attempts', v_new_attempts
        );
      ELSE
        UPDATE public.profiles
        SET failed_attempts = v_new_attempts
        WHERE id = v_profile.id;

        RETURN jsonb_build_object(
          'is_locked', false,
          'remaining_seconds', 0,
          'failed_attempts', v_new_attempts,
          'attempts_left', 5 - v_new_attempts
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('is_locked', false, 'remaining_seconds', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

GRANT EXECUTE ON FUNCTION public.record_login_attempt(TEXT, BOOLEAN, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 8. RÉSOLUTION SÉCURISÉE DU NOM D'UTILISATEUR SANS FUITE D'ANNUAIRE
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
