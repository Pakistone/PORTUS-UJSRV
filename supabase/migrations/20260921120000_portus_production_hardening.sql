-- PORTUS production hardening: applied to Supabase project wbbpaebrhobuaoherwmg on 2026-09-21.
-- This migration is intentionally idempotent.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS carnet_id uuid REFERENCES public.carnets(id) ON DELETE SET NULL;
ALTER TABLE public.controls ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.controls ADD COLUMN IF NOT EXISTS anomaly_detected boolean NOT NULL DEFAULT false;
ALTER TABLE public.controls ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.fraud_reports ADD COLUMN IF NOT EXISTS fraud_type text;
ALTER TABLE public.fraud_reports ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.fraud_reports ADD COLUMN IF NOT EXISTS processing_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.fraud_reports ADD COLUMN IF NOT EXISTS admin_decision_note text;
ALTER TABLE public.fraud_reports ADD COLUMN IF NOT EXISTS admin_decision_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.fraud_reports ADD COLUMN IF NOT EXISTS admin_decision_by_name text;
ALTER TABLE public.fraud_reports ADD COLUMN IF NOT EXISTS admin_decision_at timestamptz;
ALTER TABLE public.fraud_reports ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.fraud_reports DROP CONSTRAINT IF EXISTS fraud_reports_status_check;
UPDATE public.fraud_reports SET status=CASE status WHEN 'PENDING' THEN 'NOUVEAU' WHEN 'INVESTIGATING' THEN 'EN_COURS' WHEN 'RESOLVED' THEN 'TRAITE' WHEN 'DISMISSED' THEN 'REJETE' ELSE status END;
ALTER TABLE public.fraud_reports ADD CONSTRAINT fraud_reports_status_check CHECK(status IN ('NOUVEAU','EN_COURS','TRAITE','REJETE','CONFIRME'));

CREATE INDEX IF NOT EXISTS idx_sales_carnet_id ON public.sales(carnet_id);
CREATE INDEX IF NOT EXISTS idx_sales_agent_sold_at ON public.sales(agent_id,sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_controls_controleur_at ON public.controls(controleur_id,controlled_at DESC);
CREATE INDEX IF NOT EXISTS idx_controls_ticket_id ON public.controls(ticket_id);
CREATE INDEX IF NOT EXISTS idx_fraud_sector_status ON public.fraud_reports(status,reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_controleur ON public.fraud_reports(controleur_id,reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON public.notifications(recipient_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON public.tickets(updated_at DESC);

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='portus_qr_hmac_v1') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32),'hex'),'portus_qr_hmac_v1','PORTUS QR signing secret v1');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_server_hmac_secret() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,vault,pg_temp
AS $$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='portus_qr_hmac_v1' LIMIT 1 $$;
REVOKE ALL ON FUNCTION public.get_server_hmac_secret() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sign_ticket_canonical(p_canonical text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$ SELECT encode(hmac(p_canonical::bytea,public.get_server_hmac_secret()::bytea,'sha256'),'hex') $$;
REVOKE ALL ON FUNCTION public.sign_ticket_canonical(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.generate_secure_ticket_qr() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
AS $$
DECLARE v_ref text:='VRD'; v_canonical text; v_sig text;
BEGIN
 SELECT carnet_number INTO v_ref FROM public.carnets WHERE id=NEW.carnet_id;
 v_canonical:='PORTUS|v1|'||NEW.id::text||'|'||coalesce(v_ref,'VRD')||'|'||NEW.ticket_number||'|'||coalesce(NEW.price,5000)::text;
 v_sig:=public.sign_ticket_canonical(v_canonical);
 NEW.qr_payload:=jsonb_build_object('v',1,'tid',NEW.id,'cid',NEW.carnet_id,'ref',coalesce(v_ref,'VRD'),'num',NEW.ticket_number,'price',coalesce(NEW.price,5000),'sig',v_sig)::text;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_generate_secure_ticket_qr ON public.tickets;
CREATE TRIGGER trg_generate_secure_ticket_qr BEFORE INSERT OR UPDATE OF ticket_number,carnet_id,price ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.generate_secure_ticket_qr();
REVOKE ALL ON FUNCTION public.generate_secure_ticket_qr() FROM PUBLIC,anon,authenticated;

-- See source project for the complete function bodies; these are also applied to production.
-- verify_ticket_secure: requires a valid server HMAC signature and never treats an unsigned QR as valid.
-- record_control_secure: server-computed verdict + idempotency + audit.
-- sell_ticket_secure: row lock + role/assignment checks + server-configured price + idempotency.
-- process_sync_operation: authenticated actor binding and routing to secure SALE/CONTROL RPCs.

REVOKE ALL ON FUNCTION public.verify_ticket_secure(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_ticket_secure(text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.record_control_secure(text,text,text,text,text,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_control_secure(text,text,text,text,text,uuid,timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.sell_ticket_secure(uuid,text,text,uuid,double precision,double precision,double precision,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sell_ticket_secure(uuid,text,text,uuid,double precision,double precision,double precision,timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.process_sync_operation(uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.process_sync_operation(uuid,uuid,text,jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_current_role() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_current_role() TO authenticated;
REVOKE ALL ON FUNCTION public.get_current_sector_id() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_current_sector_id() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.is_responsable() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_responsable() TO authenticated;
