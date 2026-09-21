-- PORTUS authentication RPC hardening.
-- Deploy this migration to the production Supabase project.

CREATE OR REPLACE FUNCTION public.get_account_lockout_status(p_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_locked_until timestamptz;
  v_failed_attempts integer;
  v_remaining_seconds integer := 0;
BEGIN
  IF p_identifier IS NULL OR btrim(p_identifier) = '' THEN
    RETURN jsonb_build_object('is_locked', false, 'remaining_seconds', 0);
  END IF;

  SELECT p.locked_until, p.failed_attempts
  INTO v_locked_until, v_failed_attempts
  FROM public.profiles AS p
  LEFT JOIN auth.users AS u ON u.id = p.id
  WHERE lower(p.username) = lower(btrim(p_identifier))
     OR lower(u.email) = lower(btrim(p_identifier))
  LIMIT 1;

  IF FOUND AND v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    v_remaining_seconds := ceil(extract(epoch FROM (v_locked_until - now())))::integer;
    RETURN jsonb_build_object(
      'is_locked', true,
      'remaining_seconds', v_remaining_seconds,
      'failed_attempts', coalesce(v_failed_attempts, 0)
    );
  END IF;

  IF FOUND AND v_locked_until IS NOT NULL THEN
    UPDATE public.profiles
    SET locked_until = NULL, failed_attempts = 0
    WHERE lower(username) = lower(btrim(p_identifier));
  END IF;

  RETURN jsonb_build_object('is_locked', false, 'remaining_seconds', 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_identifier text,
  p_is_success boolean,
  p_failure_reason text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_profile record;
  v_new_attempts integer;
  v_locked_until timestamptz;
BEGIN
  IF p_identifier IS NULL OR btrim(p_identifier) = '' THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  SELECT p.*, u.email
  INTO v_profile
  FROM public.profiles AS p
  LEFT JOIN auth.users AS u ON u.id = p.id
  WHERE lower(p.username) = lower(btrim(p_identifier))
     OR lower(u.email) = lower(btrim(p_identifier))
  LIMIT 1;

  INSERT INTO public.login_attempts (
    username, profile_id, ip_address, user_agent, is_successful, failure_reason, attempted_at
  ) VALUES (
    btrim(p_identifier), v_profile.id, p_ip, p_user_agent, p_is_success, p_failure_reason, now()
  );

  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('is_locked', false, 'remaining_seconds', 0);
  END IF;

  IF p_is_success THEN
    UPDATE public.profiles
    SET failed_attempts = 0, locked_until = NULL, last_login_at = now()
    WHERE id = v_profile.id;
    RETURN jsonb_build_object('is_locked', false, 'remaining_seconds', 0, 'attempts_left', 5);
  END IF;

  v_new_attempts := coalesce(v_profile.failed_attempts, 0) + 1;
  IF v_new_attempts >= 5 THEN
    v_locked_until := now() + interval '15 minutes';
    UPDATE public.profiles
    SET failed_attempts = v_new_attempts, locked_until = v_locked_until
    WHERE id = v_profile.id;
    RETURN jsonb_build_object('is_locked', true, 'remaining_seconds', 900, 'attempts_left', 0);
  END IF;

  UPDATE public.profiles
  SET failed_attempts = v_new_attempts
  WHERE id = v_profile.id;

  RETURN jsonb_build_object(
    'is_locked', false,
    'remaining_seconds', 0,
    'attempts_left', 5 - v_new_attempts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_username_for_auth(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email text;
  v_locked_until timestamptz;
  v_is_active boolean;
BEGIN
  IF p_username IS NULL OR btrim(p_username) = '' THEN
    RETURN NULL;
  END IF;

  SELECT u.email, p.locked_until, p.is_active
  INTO v_email, v_locked_until, v_is_active
  FROM auth.users AS u
  JOIN public.profiles AS p ON p.id = u.id
  WHERE lower(p.username) = lower(btrim(p_username))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT v_is_active THEN
    RAISE EXCEPTION 'Compte désactivé. Veuillez contacter l’administrateur.';
  END IF;

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RAISE EXCEPTION 'COMPTE_VERROUILLE: Compte temporairement bloqué pendant 15 minutes suite à 5 tentatives infructueuses.';
  END IF;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_account_lockout_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_login_attempt(text, boolean, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_username_for_auth(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account_lockout_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, boolean, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_username_for_auth(text) TO anon, authenticated;
