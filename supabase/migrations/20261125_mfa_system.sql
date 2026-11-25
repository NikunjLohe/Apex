-- ============================================================================
-- APEX PERFORMANCE PORTAL — STANDALONE MONTHLY MFA (MONTHLY FIELD ALLOWANCE)
-- Target Environment: Supabase Project (qiqjclgmetycxfjeozvm)
-- Description:
--   Standalone rank-based Monthly Field Allowance (MFA) tables, backend
--   calculation engine, triggers, monthly snapshot protection, and RLS.
--   - Separate from commissions, TDS/admin payouts, and promotion volume.
--   - Ranks 1–10 (AO to ED) only; Ranks 11–18 have no MFA.
--   - Duration credit: 1Y = 25%, 2Y = 50%, 3Y+ = 100%.
--   - RD amount uses initial/monthly installment amount (not x12), counted once per policy.
--   - 100% or above achievement grants full rank MFA reward; below 100% earns 0.
--   - Rank, monthly target, and reward are snapshotted per (agent_id, month, year)
--     so mid-month or future rank changes never corrupt monthly or historical records.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_mfa_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2100),

    -- Immutable monthly snapshots (locked when the agent's monthly record is initialized)
    rank_snapshot INTEGER NOT NULL,
    rank_code_snapshot TEXT NOT NULL,
    mfa_target_snapshot NUMERIC(14,2) NOT NULL DEFAULT 0,
    mfa_reward_snapshot NUMERIC(14,2) NOT NULL DEFAULT 0,

    -- Backend-computed progress & qualification state
    raw_business_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_mfa_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
    remaining_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    achievement_pct NUMERIC(8,2) NOT NULL DEFAULT 0,
    is_qualified BOOLEAN NOT NULL DEFAULT false,
    reward_earned NUMERIC(14,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'achieved', 'missed', 'not_applicable')),
    contributions_count INTEGER NOT NULL DEFAULT 0,

    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_agent_mfa_records_agent_period UNIQUE (agent_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_agent_mfa_records_period
    ON public.agent_mfa_records (year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_agent_mfa_records_agent
    ON public.agent_mfa_records (agent_id, year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_agent_mfa_records_status
    ON public.agent_mfa_records (status);

CREATE TABLE IF NOT EXISTS public.agent_mfa_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mfa_record_id UUID NOT NULL REFERENCES public.agent_mfa_records(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    policy_number TEXT NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT,
    plan_code TEXT NOT NULL,
    plan_type TEXT NOT NULL,
    duration_years INTEGER NOT NULL CHECK (duration_years >= 1),
    business_date DATE NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2100),

    business_amount NUMERIC(14,2) NOT NULL CHECK (business_amount >= 0),
    mfa_percentage NUMERIC(5,2) NOT NULL CHECK (mfa_percentage IN (25.00, 50.00, 100.00)),
    mfa_credit NUMERIC(14,2) NOT NULL CHECK (mfa_credit >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Guarantee a single policy can never be counted twice toward MFA
    CONSTRAINT uq_agent_mfa_contributions_policy UNIQUE (policy_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_mfa_contributions_record
    ON public.agent_mfa_contributions (mfa_record_id);
CREATE INDEX IF NOT EXISTS idx_agent_mfa_contributions_agent_period
    ON public.agent_mfa_contributions (agent_id, year DESC, month DESC);

-- ----------------------------------------------------------------------------
-- 2. Official MFA Reference Functions (Ranks 1–10 only, 25% / 50% / 100%)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mfa_slab_for_rank(p_rank INTEGER)
RETURNS TABLE (
    rank INTEGER,
    rank_code TEXT,
    mfa_target NUMERIC(14,2),
    mfa_reward NUMERIC(14,2)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rank INTEGER := COALESCE(p_rank, 1);
    v_code TEXT;
    v_target NUMERIC(14,2) := 0;
    v_reward NUMERIC(14,2) := 0;
BEGIN
    CASE v_rank
        WHEN 1  THEN v_code := 'AO';  v_target := 50000;   v_reward := 3000;
        WHEN 2  THEN v_code := 'AM';  v_target := 350000;  v_reward := 5000;
        WHEN 3  THEN v_code := 'ADM'; v_target := 550000;  v_reward := 8000;
        WHEN 4  THEN v_code := 'DM';  v_target := 800000;  v_reward := 10000;
        WHEN 5  THEN v_code := 'SDM'; v_target := 1200000; v_reward := 12000;
        WHEN 6  THEN v_code := 'CM';  v_target := 1800000; v_reward := 15000;
        WHEN 7  THEN v_code := 'AGM'; v_target := 2500000; v_reward := 18000;
        WHEN 8  THEN v_code := 'GM';  v_target := 3200000; v_reward := 20000;
        WHEN 9  THEN v_code := 'ZM';  v_target := 4000000; v_reward := 25000;
        WHEN 10 THEN v_code := 'ED';  v_target := 5000000; v_reward := 30000;
        WHEN 11 THEN v_code := 'SED'; v_target := 0;       v_reward := 0;
        WHEN 12 THEN v_code := 'MD';  v_target := 0;       v_reward := 0;
        WHEN 13 THEN v_code := 'CMD'; v_target := 0;       v_reward := 0;
        WHEN 14 THEN v_code := 'AVP'; v_target := 0;       v_reward := 0;
        WHEN 15 THEN v_code := 'VP';  v_target := 0;       v_reward := 0;
        WHEN 16 THEN v_code := 'SVP'; v_target := 0;       v_reward := 0;
        WHEN 17 THEN v_code := 'EVP'; v_target := 0;       v_reward := 0;
        WHEN 18 THEN v_code := 'MGD'; v_target := 0;       v_reward := 0;
        ELSE         v_code := 'AO';  v_target := 0;       v_reward := 0;
    END CASE;

    RETURN QUERY SELECT v_rank, v_code, v_target, v_reward;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mfa_credit_percentage(p_duration_years INTEGER)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF COALESCE(p_duration_years, 1) <= 1 THEN
        RETURN 25.00;
    ELSIF p_duration_years = 2 THEN
        RETURN 50.00;
    ELSE
        RETURN 100.00;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_policy_duration_years(
    p_plan_code TEXT,
    p_plan_type TEXT,
    p_policy_year INTEGER,
    p_total_installments INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_match TEXT[];
    v_yrs INTEGER;
BEGIN
    v_match := regexp_match(UPPER(COALESCE(p_plan_code, '')), '([0-9]+)Y$');
    IF v_match IS NOT NULL AND array_length(v_match, 1) >= 1 THEN
        v_yrs := v_match[1]::INTEGER;
        IF v_yrs >= 1 THEN
            RETURN v_yrs;
        END IF;
    END IF;

    IF COALESCE(p_policy_year, 0) >= 1 THEN
        RETURN p_policy_year;
    END IF;

    IF (UPPER(COALESCE(p_plan_type, '')) = 'RD' OR UPPER(COALESCE(p_plan_code, '')) LIKE 'RD%')
       AND COALESCE(p_total_installments, 0) >= 12 THEN
        RETURN GREATEST(1, ROUND(p_total_installments::NUMERIC / 12.0)::INTEGER);
    END IF;

    RETURN 1;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Snapshot Initializer & Monthly Recalculator
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_agent_mfa_record(
    p_agent_id UUID,
    p_month INTEGER,
    p_year INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record_id UUID;
    v_profile RECORD;
    v_slab RECORD;
    v_initial_status TEXT := 'in_progress';
    v_now_ym INTEGER;
    v_rec_ym INTEGER;
BEGIN
    SELECT id INTO v_record_id
    FROM public.agent_mfa_records
    WHERE agent_id = p_agent_id AND month = p_month AND year = p_year;

    IF v_record_id IS NOT NULL THEN
        -- Existing record MUST retain its snapshotted rank, target, and reward.
        RETURN v_record_id;
    END IF;

    SELECT id, rank, role, is_super_admin, is_admin, status
    INTO v_profile
    FROM public.profiles
    WHERE id = p_agent_id;

    IF v_profile.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Admin / super-admin accounts are not field agents
    IF COALESCE(v_profile.is_super_admin, false)
       OR COALESCE(v_profile.is_admin, false)
       OR LOWER(COALESCE(v_profile.role::TEXT, 'agent')) IN ('admin', 'super_admin') THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_slab FROM public.get_mfa_slab_for_rank(COALESCE(v_profile.rank, 1));

    v_now_ym := (EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER * 100)
              + EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
    v_rec_ym := (p_year * 100) + p_month;

    IF COALESCE(v_slab.mfa_target, 0) <= 0 OR COALESCE(v_slab.mfa_reward, 0) <= 0 THEN
        v_initial_status := 'not_applicable';
    ELSIF v_rec_ym < v_now_ym THEN
        v_initial_status := 'missed';
    ELSE
        v_initial_status := 'in_progress';
    END IF;

    INSERT INTO public.agent_mfa_records (
        agent_id, month, year,
        rank_snapshot, rank_code_snapshot,
        mfa_target_snapshot, mfa_reward_snapshot,
        status
    )
    VALUES (
        p_agent_id, p_month, p_year,
        v_slab.rank, v_slab.rank_code,
        v_slab.mfa_target, v_slab.mfa_reward,
        v_initial_status
    )
    ON CONFLICT (agent_id, month, year) DO NOTHING;

    SELECT id INTO v_record_id
    FROM public.agent_mfa_records
    WHERE agent_id = p_agent_id AND month = p_month AND year = p_year;

    RETURN v_record_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_agent_mfa_month(
    p_agent_id UUID,
    p_month INTEGER,
    p_year INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rec RECORD;
    v_raw_total NUMERIC(14,2) := 0;
    v_credit_total NUMERIC(14,2) := 0;
    v_cnt INTEGER := 0;
    v_remaining NUMERIC(14,2) := 0;
    v_pct NUMERIC(8,2) := 0;
    v_qualified BOOLEAN := false;
    v_reward NUMERIC(14,2) := 0;
    v_status TEXT := 'in_progress';
    v_now_ym INTEGER;
    v_rec_ym INTEGER;
BEGIN
    SELECT * INTO v_rec
    FROM public.agent_mfa_records
    WHERE agent_id = p_agent_id AND month = p_month AND year = p_year
    FOR UPDATE;

    IF v_rec.id IS NULL THEN
        RETURN;
    END IF;

    SELECT
        COALESCE(SUM(business_amount), 0),
        COALESCE(SUM(mfa_credit), 0),
        COUNT(*)
    INTO v_raw_total, v_credit_total, v_cnt
    FROM public.agent_mfa_contributions
    WHERE mfa_record_id = v_rec.id;

    v_now_ym := (EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER * 100)
              + EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
    v_rec_ym := (p_year * 100) + p_month;

    IF v_rec.mfa_target_snapshot > 0 AND v_rec.mfa_reward_snapshot > 0 THEN
        v_remaining := GREATEST(0, ROUND(v_rec.mfa_target_snapshot - v_credit_total, 2));
        v_pct := ROUND((v_credit_total / v_rec.mfa_target_snapshot) * 100.0, 2);
        v_qualified := v_credit_total >= v_rec.mfa_target_snapshot;
        v_reward := CASE WHEN v_qualified THEN v_rec.mfa_reward_snapshot ELSE 0 END;

        IF v_qualified THEN
            v_status := 'achieved';
        ELSIF v_rec_ym < v_now_ym THEN
            v_status := 'missed';
        ELSE
            v_status := 'in_progress';
        END IF;
    ELSE
        v_remaining := 0;
        v_pct := 0;
        v_qualified := false;
        v_reward := 0;
        v_status := 'not_applicable';
    END IF;

    UPDATE public.agent_mfa_records
    SET
        raw_business_total = v_raw_total,
        total_mfa_credit = v_credit_total,
        remaining_amount = v_remaining,
        achievement_pct = v_pct,
        is_qualified = v_qualified,
        reward_earned = v_reward,
        status = v_status,
        contributions_count = v_cnt,
        last_calculated_at = now(),
        updated_at = now()
    WHERE id = v_rec.id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Policy -> Contribution Synchronization (Single-Policy Integrity)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_policy_mfa_contribution(p_policy_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pol RECORD;
    v_old_contrib RECORD;
    v_agent RECORD;
    v_first_payment RECORD;
    v_cust_name TEXT;
    v_is_rd BOOLEAN;
    v_biz_date DATE;
    v_month INTEGER;
    v_year INTEGER;
    v_dur INTEGER;
    v_pct NUMERIC(5,2);
    v_biz_amount NUMERIC(14,2);
    v_credit NUMERIC(14,2);
    v_rec_id UUID;
    v_has_valid_payment BOOLEAN := false;
BEGIN
    SELECT * INTO v_old_contrib
    FROM public.agent_mfa_contributions
    WHERE policy_id = p_policy_id;

    SELECT * INTO v_pol
    FROM public.policies
    WHERE id = p_policy_id;

    -- Policy deleted or absent -> cleanup any old contribution
    IF v_pol.id IS NULL THEN
        IF v_old_contrib.id IS NOT NULL THEN
            DELETE FROM public.agent_mfa_contributions WHERE id = v_old_contrib.id;
            PERFORM public.recalculate_agent_mfa_month(
                v_old_contrib.agent_id, v_old_contrib.month, v_old_contrib.year
            );
        END IF;
        RETURN;
    END IF;

    -- Policy status ineligible -> remove contribution and recalculate
    IF LOWER(COALESCE(v_pol.status::TEXT, 'active')) NOT IN ('active', 'matured')
       OR v_pol.agent_id IS NULL THEN
        IF v_old_contrib.id IS NOT NULL THEN
            DELETE FROM public.agent_mfa_contributions WHERE id = v_old_contrib.id;
            PERFORM public.recalculate_agent_mfa_month(
                v_old_contrib.agent_id, v_old_contrib.month, v_old_contrib.year
            );
        END IF;
        RETURN;
    END IF;

    SELECT id, rank, role, is_super_admin, is_admin
    INTO v_agent
    FROM public.profiles
    WHERE id = v_pol.agent_id;

    IF v_agent.id IS NULL
       OR COALESCE(v_agent.is_super_admin, false)
       OR COALESCE(v_agent.is_admin, false)
       OR LOWER(COALESCE(v_agent.role::TEXT, 'agent')) IN ('admin', 'super_admin') THEN
        IF v_old_contrib.id IS NOT NULL THEN
            DELETE FROM public.agent_mfa_contributions WHERE id = v_old_contrib.id;
            PERFORM public.recalculate_agent_mfa_month(
                v_old_contrib.agent_id, v_old_contrib.month, v_old_contrib.year
            );
        END IF;
        RETURN;
    END IF;

    -- Verify policy has a valid completed payment (prevents unpaid enrollments / reversed payments)
    SELECT id, amount, paid_date
    INTO v_first_payment
    FROM public.payments
    WHERE policy_id = v_pol.id
      AND LOWER(COALESCE(status::TEXT, 'completed')) = 'completed'
    ORDER BY installment_number ASC, paid_date ASC, created_at ASC
    LIMIT 1;

    v_has_valid_payment := (
        v_first_payment.id IS NOT NULL
        OR COALESCE(v_pol.paid_installments, 0) >= 1
        OR COALESCE(v_pol.total_paid, 0) > 0
    );

    IF NOT v_has_valid_payment THEN
        IF v_old_contrib.id IS NOT NULL THEN
            DELETE FROM public.agent_mfa_contributions WHERE id = v_old_contrib.id;
            PERFORM public.recalculate_agent_mfa_month(
                v_old_contrib.agent_id, v_old_contrib.month, v_old_contrib.year
            );
        END IF;
        RETURN;
    END IF;

    v_is_rd := (
        UPPER(COALESCE(v_pol.plan_type::TEXT, '')) = 'RD'
        OR UPPER(COALESCE(v_pol.plan_code::TEXT, '')) LIKE 'RD%'
    );

    IF v_is_rd THEN
        -- RD uses initial/monthly installment amount once per policy (not x12, not doubled on renewals)
        v_biz_amount := COALESCE(
            NULLIF(v_pol.monthly_amount, 0),
            v_first_payment.amount,
            NULLIF(v_pol.total_paid, 0),
            0
        );
    ELSE
        -- FD / Pension uses lump-sum deposit
        v_biz_amount := COALESCE(
            NULLIF(v_pol.fd_amount, 0),
            v_first_payment.amount,
            NULLIF(v_pol.total_paid, 0),
            0
        );
    END IF;

    IF v_biz_amount <= 0 THEN
        IF v_old_contrib.id IS NOT NULL THEN
            DELETE FROM public.agent_mfa_contributions WHERE id = v_old_contrib.id;
            PERFORM public.recalculate_agent_mfa_month(
                v_old_contrib.agent_id, v_old_contrib.month, v_old_contrib.year
            );
        END IF;
        RETURN;
    END IF;

    v_biz_date := COALESCE(
        (v_first_payment.paid_date AT TIME ZONE 'Asia/Kolkata')::DATE,
        v_pol.start_date,
        (v_pol.created_at AT TIME ZONE 'Asia/Kolkata')::DATE,
        (now() AT TIME ZONE 'Asia/Kolkata')::DATE
    );
    v_month := EXTRACT(MONTH FROM v_biz_date)::INTEGER;
    v_year := EXTRACT(YEAR FROM v_biz_date)::INTEGER;

    v_dur := public.get_policy_duration_years(
        v_pol.plan_code::TEXT, v_pol.plan_type::TEXT, v_pol.policy_year, v_pol.total_installments
    );
    v_pct := public.get_mfa_credit_percentage(v_dur);
    v_credit := ROUND((v_biz_amount * v_pct) / 100.0, 2);

    SELECT name INTO v_cust_name FROM public.customers WHERE id = v_pol.customer_id;

    v_rec_id := public.ensure_agent_mfa_record(v_pol.agent_id, v_month, v_year);
    IF v_rec_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO public.agent_mfa_contributions (
        mfa_record_id, agent_id, policy_id, policy_number,
        customer_id, customer_name, plan_code, plan_type,
        duration_years, business_date, month, year,
        business_amount, mfa_percentage, mfa_credit
    )
    VALUES (
        v_rec_id, v_pol.agent_id, v_pol.id, v_pol.policy_number::TEXT,
        v_pol.customer_id, v_cust_name::TEXT, UPPER(COALESCE(v_pol.plan_code::TEXT, '')),
        UPPER(COALESCE(v_pol.plan_type::TEXT, CASE WHEN v_is_rd THEN 'RD' ELSE 'FD' END)),
        v_dur, v_biz_date, v_month, v_year,
        v_biz_amount, v_pct, v_credit
    )
    ON CONFLICT (policy_id) DO UPDATE SET
        mfa_record_id = EXCLUDED.mfa_record_id,
        agent_id = EXCLUDED.agent_id,
        policy_number = EXCLUDED.policy_number,
        customer_id = EXCLUDED.customer_id,
        customer_name = EXCLUDED.customer_name,
        plan_code = EXCLUDED.plan_code,
        plan_type = EXCLUDED.plan_type,
        duration_years = EXCLUDED.duration_years,
        business_date = EXCLUDED.business_date,
        month = EXCLUDED.month,
        year = EXCLUDED.year,
        business_amount = EXCLUDED.business_amount,
        mfa_percentage = EXCLUDED.mfa_percentage,
        mfa_credit = EXCLUDED.mfa_credit,
        updated_at = now();

    -- If policy changed agent/month/year, recalculate the previous period as well
    IF v_old_contrib.id IS NOT NULL
       AND (v_old_contrib.agent_id <> v_pol.agent_id
            OR v_old_contrib.month <> v_month
            OR v_old_contrib.year <> v_year) THEN
        PERFORM public.recalculate_agent_mfa_month(
            v_old_contrib.agent_id, v_old_contrib.month, v_old_contrib.year
        );
    END IF;

    PERFORM public.recalculate_agent_mfa_month(v_pol.agent_id, v_month, v_year);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Database Triggers on policies, payments, and agent_mfa_contributions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_policies_sync_mfa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Capture old contribution & cleanup after delete
        PERFORM public.sync_policy_mfa_contribution(OLD.id);
        RETURN OLD;
    END IF;
    PERFORM public.sync_policy_mfa_contribution(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_policies_mfa_after ON public.policies;
CREATE TRIGGER trg_policies_mfa_after
AFTER INSERT OR UPDATE ON public.policies
FOR EACH ROW
EXECUTE FUNCTION public.trg_policies_sync_mfa();

-- Before delete on policies: recalculate after cascade cleanup
CREATE OR REPLACE FUNCTION public.trg_contrib_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.recalculate_agent_mfa_month(OLD.agent_id, OLD.month, OLD.year);
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_mfa_contrib_delete_recalc ON public.agent_mfa_contributions;
CREATE TRIGGER trg_mfa_contrib_delete_recalc
AFTER DELETE ON public.agent_mfa_contributions
FOR EACH ROW
EXECUTE FUNCTION public.trg_contrib_after_delete();

CREATE OR REPLACE FUNCTION public.trg_payments_sync_mfa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy_id UUID;
BEGIN
    v_policy_id := COALESCE(NEW.policy_id, OLD.policy_id);
    IF v_policy_id IS NOT NULL THEN
        PERFORM public.sync_policy_mfa_contribution(v_policy_id);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_mfa_after ON public.payments;
CREATE TRIGGER trg_payments_mfa_after
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.trg_payments_sync_mfa();

-- ----------------------------------------------------------------------------
-- 6. Public RPC: Initialize / Sync Monthly MFA Cycle (Authorized)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_monthly_mfa_cycle(
    p_month INTEGER DEFAULT EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER,
    p_year INTEGER DEFAULT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_is_admin BOOLEAN := false;
    v_agent RECORD;
    v_pol RECORD;
    v_count INTEGER := 0;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    v_is_admin := COALESCE(public.is_admin(), false) OR COALESCE(public.is_super_admin(), false);

    -- Ensure monthly records exist for active eligible agents (Ranks 1–10)
    IF v_is_admin THEN
        FOR v_agent IN
            SELECT id
            FROM public.profiles
            WHERE COALESCE(is_super_admin, false) = false
              AND COALESCE(is_admin, false) = false
              AND LOWER(COALESCE(role::TEXT, 'agent')) NOT IN ('admin', 'super_admin')
              AND COALESCE(rank, 1) BETWEEN 1 AND 10
              AND LOWER(COALESCE(status::TEXT, 'active')) <> 'suspended'
        LOOP
            IF public.ensure_agent_mfa_record(v_agent.id, p_month, p_year) IS NOT NULL THEN
                v_count := v_count + 1;
            END IF;
        END LOOP;

        FOR v_pol IN
            SELECT p.id
            FROM public.policies p
            LEFT JOIN LATERAL (
                SELECT pay.paid_date
                FROM public.payments pay
                WHERE pay.policy_id = p.id
                  AND LOWER(COALESCE(pay.status::TEXT, 'completed')) = 'completed'
                ORDER BY pay.installment_number ASC, pay.paid_date ASC
                LIMIT 1
            ) fp ON true
            WHERE EXTRACT(MONTH FROM COALESCE((fp.paid_date AT TIME ZONE 'Asia/Kolkata')::DATE, p.start_date, (p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE)) = p_month
              AND EXTRACT(YEAR FROM COALESCE((fp.paid_date AT TIME ZONE 'Asia/Kolkata')::DATE, p.start_date, (p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE)) = p_year
        LOOP
            PERFORM public.sync_policy_mfa_contribution(v_pol.id);
        END LOOP;

        -- Refresh status/totals for all existing records in (p_month, p_year)
        FOR v_agent IN
            SELECT agent_id FROM public.agent_mfa_records WHERE month = p_month AND year = p_year
        LOOP
            PERFORM public.recalculate_agent_mfa_month(v_agent.agent_id, p_month, p_year);
        END LOOP;
    ELSE
        -- Agents can only initialize/sync their own record
        PERFORM public.ensure_agent_mfa_record(v_caller, p_month, p_year);
        FOR v_pol IN
            SELECT p.id
            FROM public.policies p
            LEFT JOIN LATERAL (
                SELECT pay.paid_date
                FROM public.payments pay
                WHERE pay.policy_id = p.id
                  AND LOWER(COALESCE(pay.status::TEXT, 'completed')) = 'completed'
                ORDER BY pay.installment_number ASC, pay.paid_date ASC
                LIMIT 1
            ) fp ON true
            WHERE p.agent_id = v_caller
              AND EXTRACT(MONTH FROM COALESCE((fp.paid_date AT TIME ZONE 'Asia/Kolkata')::DATE, p.start_date, (p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE)) = p_month
              AND EXTRACT(YEAR FROM COALESCE((fp.paid_date AT TIME ZONE 'Asia/Kolkata')::DATE, p.start_date, (p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE)) = p_year
        LOOP
            PERFORM public.sync_policy_mfa_contribution(v_pol.id);
        END LOOP;
        PERFORM public.recalculate_agent_mfa_month(v_caller, p_month, p_year);
        v_count := 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'month', p_month,
        'year', p_year,
        'records_synced', v_count
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Permissions & Row Level Security (Strict Agent Isolation, Backend Writes Only)
-- ----------------------------------------------------------------------------
ALTER TABLE public.agent_mfa_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_mfa_contributions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.agent_mfa_records FROM anon, authenticated;
REVOKE ALL ON TABLE public.agent_mfa_contributions FROM anon, authenticated;
GRANT SELECT ON TABLE public.agent_mfa_records TO authenticated;
GRANT SELECT ON TABLE public.agent_mfa_contributions TO authenticated;

DROP POLICY IF EXISTS "mfa_records_select_policy" ON public.agent_mfa_records;
CREATE POLICY "mfa_records_select_policy" ON public.agent_mfa_records
FOR SELECT
TO authenticated
USING (
    public.is_admin() OR
    public.is_super_admin() OR
    agent_id = auth.uid()
);

DROP POLICY IF EXISTS "mfa_contributions_select_policy" ON public.agent_mfa_contributions;
CREATE POLICY "mfa_contributions_select_policy" ON public.agent_mfa_contributions
FOR SELECT
TO authenticated
USING (
    public.is_admin() OR
    public.is_super_admin() OR
    agent_id = auth.uid()
);

REVOKE ALL ON FUNCTION public.get_mfa_slab_for_rank(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mfa_slab_for_rank(INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.get_mfa_credit_percentage(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mfa_credit_percentage(INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.ensure_agent_mfa_record(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_agent_mfa_month(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_policy_mfa_contribution(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_monthly_mfa_cycle(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_monthly_mfa_cycle(INTEGER, INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Initial Backfill of All Existing Historical & Current Policies
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_pol RECORD;
    v_agent RECORD;
    v_cur_m INTEGER := EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
    v_cur_y INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
BEGIN
    FOR v_pol IN SELECT id FROM public.policies LOOP
        PERFORM public.sync_policy_mfa_contribution(v_pol.id);
    END LOOP;

    FOR v_agent IN
        SELECT id FROM public.profiles
        WHERE COALESCE(is_super_admin, false) = false
          AND COALESCE(is_admin, false) = false
          AND LOWER(COALESCE(role::TEXT, 'agent')) NOT IN ('admin', 'super_admin')
          AND COALESCE(rank, 1) BETWEEN 1 AND 10
          AND LOWER(COALESCE(status::TEXT, 'active')) <> 'suspended'
    LOOP
        PERFORM public.ensure_agent_mfa_record(v_agent.id, v_cur_m, v_cur_y);
        PERFORM public.recalculate_agent_mfa_month(v_agent.id, v_cur_m, v_cur_y);
    END LOOP;
END;
$$;

COMMIT;
