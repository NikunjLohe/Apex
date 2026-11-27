-- ============================================================================
-- APEX Performance Portal — Secure Agent ID Login Email Resolution RPC
-- Date: 2026-11-27
-- Purpose:
--   Allows unauthenticated (`anon`) login attempts using an Agent ID / Code
--   (e.g., KB00018, SM00001) to resolve ONLY the account's login email safely
--   without exposing `public.profiles` rows or PII columns to anonymous users.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_agent_login_email(p_agent_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT := UPPER(REGEXP_REPLACE(TRIM(COALESCE(p_agent_code, '')), '\s+', '', 'g'));
    v_email TEXT;
BEGIN
    IF v_code = '' OR POSITION('@' IN v_code) > 0 THEN
        RETURN NULL;
    END IF;

    SELECT email
    INTO v_email
    FROM public.profiles
    WHERE UPPER(TRIM(COALESCE(sponsor_code, ''))) = v_code
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;

    RETURN NULLIF(TRIM(COALESCE(v_email, '')), '');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_agent_login_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_agent_login_email(TEXT) TO anon, authenticated;
