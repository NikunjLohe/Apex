-- ============================================================================
-- APEX PERFORMANCE PORTAL — CASCADING MFA ACHIEVEMENT SYSTEM
-- Target Environment: Supabase Project (qiqjclgmetycxfjeozvm)
-- Prerequisite: 20261125_mfa_system.sql
-- Description:
--   Upgrades the standalone Monthly MFA system to support hierarchical
--   Cascading MFA Achievement:
--   1. Qualifying MFA credit (1Y=25%, 2Y=50%, 3Y+=100%) first fills the
--      originating agent's own monthly rank target (Ranks 1–10).
--   2. Once an agent reaches 100%, remaining excess flows upward step-by-step
--      through the actual DB reporting hierarchy (profiles.sponsor_id).
--   3. Intermediate seniors already at 100% pass credit upward cleanly
--      ('pass_through', applied = 0) without double-counting.
--   4. Inactive / suspended / missing / cyclic / Rank 11+ boundaries never
--      crash or loop infinitely; issues are logged in mfa_hierarchy_issues
--      (& audit_logs) and terminal unallocated credit is recorded explicitly.
--   5. Deterministic chronological processing per (month, year) serialized
--      with transaction advisory locks (pg_advisory_xact_lock).
--   6. Immutable allocation audit trail + snapshot preservation across
--      month boundaries and subsequent rank/sponsor updates.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Extend agent_mfa_records with Own vs Cascading Breakdown & Snapshots
-- ----------------------------------------------------------------------------
ALTER TABLE public.agent_mfa_records
    ADD COLUMN IF NOT EXISTS own_business_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS own_mfa_credit_generated NUMERIC(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS own_mfa_credit_applied NUMERIC(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cascading_mfa_credit_received NUMERIC(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS excess_credit_passed_up NUMERIC(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS excess_unallocated_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cascading_in_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sponsor_id_snapshot UUID,
    ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

-- Backfill own columns from existing records cleanly
UPDATE public.agent_mfa_records r
SET
    own_business_total = COALESCE(r.raw_business_total, 0),
    own_mfa_credit_generated = COALESCE((
        SELECT SUM(c.mfa_credit)
        FROM public.agent_mfa_contributions c
        WHERE c.mfa_record_id = r.id
    ), r.total_mfa_credit, 0),
    sponsor_id_snapshot = COALESCE(
        r.sponsor_id_snapshot,
        (SELECT p.sponsor_id FROM public.profiles p WHERE p.id = r.agent_id)
    )
WHERE r.own_mfa_credit_generated = 0
   OR r.own_business_total = 0
   OR r.sponsor_id_snapshot IS NULL;

-- ----------------------------------------------------------------------------
-- 2. Immutable Cascading Allocation Audit Trail Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_mfa_cascading_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2100),

    policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    source_contribution_id UUID REFERENCES public.agent_mfa_contributions(id) ON DELETE SET NULL,
    policy_number TEXT NOT NULL,
    business_date DATE NOT NULL,
    plan_code TEXT NOT NULL,
    plan_type TEXT NOT NULL,
    duration_years INTEGER NOT NULL CHECK (duration_years >= 1),

    original_business_amount NUMERIC(14,2) NOT NULL CHECK (original_business_amount >= 0),
    mfa_percentage NUMERIC(5,2) NOT NULL CHECK (mfa_percentage IN (25.00, 50.00, 100.00)),
    originating_mfa_credit NUMERIC(14,2) NOT NULL CHECK (originating_mfa_credit >= 0),

    originating_agent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    originating_agent_name TEXT,
    originating_agent_code TEXT,

    source_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    source_agent_name TEXT,
    source_agent_code TEXT,

    recipient_agent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_agent_name TEXT,
    recipient_agent_code TEXT,
    recipient_mfa_record_id UUID REFERENCES public.agent_mfa_records(id) ON DELETE CASCADE,

    allocation_sequence INTEGER NOT NULL CHECK (allocation_sequence >= 1),
    allocation_type TEXT NOT NULL CHECK (
        allocation_type IN (
            'self_own',
            'cascading_from_downline',
            'pass_through',
            'skipped_inactive',
            'unallocated_excess'
        )
    ),

    incoming_credit NUMERIC(14,2) NOT NULL CHECK (incoming_credit >= 0),
    applied_amount NUMERIC(14,2) NOT NULL CHECK (applied_amount >= 0),
    excess_passed_up NUMERIC(14,2) NOT NULL CHECK (excess_passed_up >= 0),
    unallocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unallocated_amount >= 0),
    unallocated_reason TEXT,

    -- Immutable allocation-time snapshots
    recipient_rank_snapshot INTEGER,
    recipient_rank_code_snapshot TEXT,
    recipient_target_snapshot NUMERIC(14,2) NOT NULL DEFAULT 0,
    recipient_reward_snapshot NUMERIC(14,2) NOT NULL DEFAULT 0,
    reporting_sponsor_id_snapshot UUID,
    hierarchy_path JSONB NOT NULL DEFAULT '[]'::jsonb,

    batch_run_id UUID NOT NULL,
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Guarantee zero duplicate step allocations per policy per month/year
    CONSTRAINT uq_mfa_cascade_policy_period_seq UNIQUE (policy_id, month, year, allocation_sequence)
);

CREATE INDEX IF NOT EXISTS idx_mfa_cascade_period
    ON public.agent_mfa_cascading_allocations (year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_mfa_cascade_recipient
    ON public.agent_mfa_cascading_allocations (recipient_agent_id, year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_mfa_cascade_source
    ON public.agent_mfa_cascading_allocations (source_agent_id, year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_mfa_cascade_origin
    ON public.agent_mfa_cascading_allocations (originating_agent_id, year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_mfa_cascade_policy
    ON public.agent_mfa_cascading_allocations (policy_id, allocation_sequence);

-- ----------------------------------------------------------------------------
-- 3. Hierarchy Anomaly & Audit Issue Log Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mfa_hierarchy_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2100),
    policy_id UUID REFERENCES public.policies(id) ON DELETE CASCADE,
    policy_number TEXT,
    originating_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    sponsor_id UUID,
    issue_type TEXT NOT NULL CHECK (
        issue_type IN (
            'self_referential_cycle',
            'hierarchy_cycle',
            'missing_superior',
            'inactive_superior',
            'suspended_superior',
            'admin_in_hierarchy',
            'max_depth_exceeded'
        )
    ),
    affected_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_hierarchy_issues_period
    ON public.mfa_hierarchy_issues (year DESC, month DESC);

-- ----------------------------------------------------------------------------
-- 4. Update Snapshot Initializer to Preserve Hierarchy Sponsor Snapshot
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
    v_existing_rec RECORD;
BEGIN
    SELECT id, sponsor_id, rank, role, is_super_admin, is_admin, status
    INTO v_profile
    FROM public.profiles
    WHERE id = p_agent_id;

    IF v_profile.id IS NULL THEN
        RETURN NULL;
    END IF;

    IF COALESCE(v_profile.is_super_admin, false)
       OR COALESCE(v_profile.is_admin, false)
       OR LOWER(COALESCE(v_profile.role::TEXT, 'agent')) IN ('admin', 'super_admin') THEN
        RETURN NULL;
    END IF;

    v_now_ym := (EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER * 100)
              + EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
    v_rec_ym := (p_year * 100) + p_month;

    SELECT id, sponsor_id_snapshot, is_locked
    INTO v_existing_rec
    FROM public.agent_mfa_records
    WHERE agent_id = p_agent_id AND month = p_month AND year = p_year;

    IF v_existing_rec.id IS NOT NULL THEN
        -- Preserve immutable rank/target/reward snapshots always.
        -- For open current/future months only, keep sponsor_id_snapshot synced if unlocked.
        IF v_rec_ym >= v_now_ym AND NOT COALESCE(v_existing_rec.is_locked, false)
           AND v_existing_rec.sponsor_id_snapshot IS DISTINCT FROM v_profile.sponsor_id THEN
            UPDATE public.agent_mfa_records
            SET sponsor_id_snapshot = v_profile.sponsor_id,
                updated_at = now()
            WHERE id = v_existing_rec.id;
        END IF;
        RETURN v_existing_rec.id;
    END IF;

    SELECT * INTO v_slab FROM public.get_mfa_slab_for_rank(COALESCE(v_profile.rank, 1));

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
        sponsor_id_snapshot,
        status
    )
    VALUES (
        p_agent_id, p_month, p_year,
        v_slab.rank, v_slab.rank_code,
        v_slab.mfa_target, v_slab.mfa_reward,
        v_profile.sponsor_id,
        v_initial_status
    )
    ON CONFLICT (agent_id, month, year) DO NOTHING;

    SELECT id INTO v_record_id
    FROM public.agent_mfa_records
    WHERE agent_id = p_agent_id AND month = p_month AND year = p_year;

    RETURN v_record_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Core Cascading Monthly Recalculation Engine (Deterministic & Serialized)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_cascading_mfa_month(
    p_month INTEGER,
    p_year INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_batch_id UUID := gen_random_uuid();
    v_now_ym INTEGER;
    v_rec_ym INTEGER;
    v_c RECORD;
    v_origin_prof RECORD;
    v_origin_rec RECORD;
    v_origin_rec_id UUID;

    v_curr_id UUID;
    v_curr_name TEXT;
    v_curr_code TEXT;
    v_curr_rec_id UUID;
    v_curr_sponsor_id UUID;

    v_sup_prof RECORD;
    v_sup_rec RECORD;
    v_sup_rec_id UUID;
    v_sup_status TEXT;

    v_seq INTEGER;
    v_depth INTEGER;
    v_max_depth CONSTANT INTEGER := 30;
    v_visited UUID[];
    v_path JSONB;

    v_remaining NUMERIC(14,2);
    v_rem_target NUMERIC(14,2);
    v_apply NUMERIC(14,2);
    v_excess NUMERIC(14,2);
    v_alloc_type TEXT;

    v_rec RECORD;
    v_pct NUMERIC(8,2);
    v_rem_amt NUMERIC(14,2);
    v_qualified BOOLEAN;
    v_reward NUMERIC(14,2);
    v_status TEXT;

    v_issues_count INTEGER := 0;
    v_policies_processed INTEGER := 0;
    v_issue_type TEXT;
    v_unalloc_reason TEXT;
    v_audit_count INTEGER := 0;
BEGIN
    IF p_month IS NULL OR p_year IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_period');
    END IF;

    -- Prevent nested trigger reentry while inside engine
    IF current_setting('apex.in_mfa_cascade', true) = '1' THEN
        RETURN jsonb_build_object('success', true, 'skipped_reentry', true);
    END IF;

    PERFORM set_config('apex.in_mfa_cascade', '1', true);

    -- Serialize concurrent modifications per (year, month)
    PERFORM pg_advisory_xact_lock(91827364, (p_year * 100) + p_month);

    v_now_ym := (EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER * 100)
              + EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
    v_rec_ym := (p_year * 100) + p_month;

    -- Sync open current/future month sponsor snapshots before traversal
    IF v_rec_ym >= v_now_ym THEN
        UPDATE public.agent_mfa_records r
        SET sponsor_id_snapshot = p.sponsor_id
        FROM public.profiles p
        WHERE r.agent_id = p.id
          AND r.month = p_month
          AND r.year = p_year
          AND NOT COALESCE(r.is_locked, false)
          AND r.sponsor_id_snapshot IS DISTINCT FROM p.sponsor_id;
    END IF;

    -- Clear prior period trace & issues safely inside locked transaction
    DELETE FROM public.agent_mfa_cascading_allocations
    WHERE month = p_month AND year = p_year;

    DELETE FROM public.mfa_hierarchy_issues
    WHERE month = p_month AND year = p_year;

    -- Reset all period accumulators cleanly while preserving rank/target/reward/sponsor snapshots
    UPDATE public.agent_mfa_records
    SET
        raw_business_total = 0,
        own_business_total = 0,
        own_mfa_credit_generated = 0,
        own_mfa_credit_applied = 0,
        cascading_mfa_credit_received = 0,
        total_mfa_credit = 0,
        excess_credit_passed_up = 0,
        excess_unallocated_credit = 0,
        contributions_count = 0,
        cascading_in_count = 0
    WHERE month = p_month AND year = p_year;

    -- Replay all qualifying monthly contributions in strict deterministic chronological order
    FOR v_c IN
        SELECT
            c.*,
            p.created_at AS policy_created_at
        FROM public.agent_mfa_contributions c
        JOIN public.policies p ON p.id = c.policy_id
        WHERE c.month = p_month AND c.year = p_year
        ORDER BY c.business_date ASC, p.created_at ASC, c.created_at ASC, c.policy_id ASC
    LOOP
        v_policies_processed := v_policies_processed + 1;

        SELECT id, name, sponsor_code, sponsor_id, rank, role, status::TEXT AS status_txt, is_admin, is_super_admin
        INTO v_origin_prof
        FROM public.profiles
        WHERE id = v_c.agent_id;

        IF v_origin_prof.id IS NULL THEN
            CONTINUE;
        END IF;

        v_origin_rec_id := public.ensure_agent_mfa_record(v_c.agent_id, p_month, p_year);
        IF v_origin_rec_id IS NULL THEN
            CONTINUE;
        END IF;

        SELECT * INTO v_origin_rec
        FROM public.agent_mfa_records
        WHERE id = v_origin_rec_id
        FOR UPDATE;

        -- Step 1: Originating Agent Self Allocation
        v_remaining := COALESCE(v_c.mfa_credit, 0);

        IF v_origin_rec.mfa_target_snapshot > 0
           AND LOWER(COALESCE(v_origin_prof.status_txt, 'active')) = 'active' THEN
            v_rem_target := GREATEST(0, ROUND(v_origin_rec.mfa_target_snapshot - v_origin_rec.total_mfa_credit, 2));
        ELSE
            v_rem_target := 0;
        END IF;

        v_apply := LEAST(v_remaining, v_rem_target);
        v_excess := ROUND(v_remaining - v_apply, 2);

        -- Keep contributions table pointing at latest monthly record id
        IF v_c.mfa_record_id IS DISTINCT FROM v_origin_rec.id THEN
            UPDATE public.agent_mfa_contributions
            SET mfa_record_id = v_origin_rec.id
            WHERE id = v_c.id;
        END IF;

        UPDATE public.agent_mfa_records
        SET
            raw_business_total = raw_business_total + v_c.business_amount,
            own_business_total = own_business_total + v_c.business_amount,
            own_mfa_credit_generated = own_mfa_credit_generated + v_c.mfa_credit,
            own_mfa_credit_applied = own_mfa_credit_applied + v_apply,
            total_mfa_credit = total_mfa_credit + v_apply,
            contributions_count = contributions_count + 1
        WHERE id = v_origin_rec.id;

        v_curr_sponsor_id := CASE
            WHEN v_rec_ym < v_now_ym THEN COALESCE(v_origin_rec.sponsor_id_snapshot, v_origin_prof.sponsor_id)
            ELSE v_origin_prof.sponsor_id
        END;

        v_seq := 1;
        v_depth := 0;
        v_visited := ARRAY[v_origin_prof.id];
        v_path := jsonb_build_array(
            jsonb_build_object(
                'seq', 1,
                'agent_id', v_origin_prof.id,
                'agent_code', COALESCE(v_origin_prof.sponsor_code, ''),
                'agent_name', COALESCE(v_origin_prof.name, ''),
                'rank', v_origin_rec.rank_snapshot,
                'rank_code', v_origin_rec.rank_code_snapshot,
                'target', v_origin_rec.mfa_target_snapshot,
                'allocation_type', 'self_own',
                'applied', v_apply,
                'excess_up', v_excess
            )
        );

        INSERT INTO public.agent_mfa_cascading_allocations (
            month, year, policy_id, source_contribution_id, policy_number,
            business_date, plan_code, plan_type, duration_years,
            original_business_amount, mfa_percentage, originating_mfa_credit,
            originating_agent_id, originating_agent_name, originating_agent_code,
            source_agent_id, source_agent_name, source_agent_code,
            recipient_agent_id, recipient_agent_name, recipient_agent_code,
            recipient_mfa_record_id, allocation_sequence, allocation_type,
            incoming_credit, applied_amount, excess_passed_up,
            recipient_rank_snapshot, recipient_rank_code_snapshot,
            recipient_target_snapshot, recipient_reward_snapshot,
            reporting_sponsor_id_snapshot, hierarchy_path, batch_run_id
        )
        VALUES (
            p_month, p_year, v_c.policy_id, v_c.id, v_c.policy_number,
            v_c.business_date, v_c.plan_code, v_c.plan_type, v_c.duration_years,
            v_c.business_amount, v_c.mfa_percentage, v_c.mfa_credit,
            v_origin_prof.id, v_origin_prof.name, v_origin_prof.sponsor_code,
            v_origin_prof.id, v_origin_prof.name, v_origin_prof.sponsor_code,
            v_origin_prof.id, v_origin_prof.name, v_origin_prof.sponsor_code,
            v_origin_rec.id, v_seq, 'self_own',
            v_remaining, v_apply, v_excess,
            v_origin_rec.rank_snapshot, v_origin_rec.rank_code_snapshot,
            v_origin_rec.mfa_target_snapshot, v_origin_rec.mfa_reward_snapshot,
            v_curr_sponsor_id, v_path, v_batch_id
        );

        -- Step 2+: Traverse Direct Reporting Hierarchy Upward While Excess Remains
        v_remaining := v_excess;
        v_curr_id := v_origin_prof.id;
        v_curr_name := v_origin_prof.name;
        v_curr_code := v_origin_prof.sponsor_code;
        v_curr_rec_id := v_origin_rec.id;

        WHILE v_remaining > 0 LOOP
            v_seq := v_seq + 1;
            v_depth := v_depth + 1;

            -- Case A: No superior above
            IF v_curr_sponsor_id IS NULL THEN
                UPDATE public.agent_mfa_records
                SET excess_unallocated_credit = excess_unallocated_credit + v_remaining
                WHERE id = v_curr_rec_id;

                INSERT INTO public.agent_mfa_cascading_allocations (
                    month, year, policy_id, source_contribution_id, policy_number,
                    business_date, plan_code, plan_type, duration_years,
                    original_business_amount, mfa_percentage, originating_mfa_credit,
                    originating_agent_id, originating_agent_name, originating_agent_code,
                    source_agent_id, source_agent_name, source_agent_code,
                    recipient_agent_id, recipient_agent_name, recipient_agent_code,
                    recipient_mfa_record_id, allocation_sequence, allocation_type,
                    incoming_credit, applied_amount, excess_passed_up,
                    unallocated_amount, unallocated_reason,
                    hierarchy_path, batch_run_id
                )
                VALUES (
                    p_month, p_year, v_c.policy_id, v_c.id, v_c.policy_number,
                    v_c.business_date, v_c.plan_code, v_c.plan_type, v_c.duration_years,
                    v_c.business_amount, v_c.mfa_percentage, v_c.mfa_credit,
                    v_origin_prof.id, v_origin_prof.name, v_origin_prof.sponsor_code,
                    v_curr_id, v_curr_name, v_curr_code,
                    NULL, NULL, NULL,
                    NULL, v_seq, 'unallocated_excess',
                    v_remaining, 0, 0,
                    v_remaining, 'no_superior',
                    v_path, v_batch_id
                );
                EXIT;
            END IF;

            -- Case B: Self-referential or Multi-Hop Cycle Guard
            IF v_curr_sponsor_id = ANY(v_visited) THEN
                v_issue_type := CASE WHEN v_curr_sponsor_id = v_curr_id THEN 'self_referential_cycle' ELSE 'hierarchy_cycle' END;
                v_unalloc_reason := CASE WHEN v_curr_sponsor_id = v_curr_id THEN 'self_referential_cycle' ELSE 'hierarchy_cycle_detected' END;
                v_issues_count := v_issues_count + 1;

                UPDATE public.agent_mfa_records
                SET excess_unallocated_credit = excess_unallocated_credit + v_remaining
                WHERE id = v_curr_rec_id;

                INSERT INTO public.mfa_hierarchy_issues (
                    month, year, policy_id, policy_number, originating_agent_id,
                    agent_id, sponsor_id, issue_type, affected_credit, details
                )
                VALUES (
                    p_month, p_year, v_c.policy_id, v_c.policy_number, v_origin_prof.id,
                    v_curr_id, v_curr_sponsor_id, v_issue_type, v_remaining,
                    jsonb_build_object('path', v_path, 'cycle_target', v_curr_sponsor_id)
                );

                INSERT INTO public.agent_mfa_cascading_allocations (
                    month, year, policy_id, source_contribution_id, policy_number,
                    business_date, plan_code, plan_type, duration_years,
                    original_business_amount, mfa_percentage, originating_mfa_credit,
                    originating_agent_id, originating_agent_name, originating_agent_code,
                    source_agent_id, source_agent_name, source_agent_code,
                    recipient_agent_id, recipient_mfa_record_id,
                    allocation_sequence, allocation_type,
                    incoming_credit, applied_amount, excess_passed_up,
                    unallocated_amount, unallocated_reason,
                    reporting_sponsor_id_snapshot, hierarchy_path, batch_run_id
                )
                VALUES (
                    p_month, p_year, v_c.policy_id, v_c.id, v_c.policy_number,
                    v_c.business_date, v_c.plan_code, v_c.plan_type, v_c.duration_years,
                    v_c.business_amount, v_c.mfa_percentage, v_c.mfa_credit,
                    v_origin_prof.id, v_origin_prof.name, v_origin_prof.sponsor_code,
                    v_curr_id, v_curr_name, v_curr_code,
                    NULL, NULL, v_seq, 'unallocated_excess',
                    v_remaining, 0, 0,
                    v_remaining, v_unalloc_reason,
                    v_curr_sponsor_id, v_path, v_batch_id
                );
                EXIT;
            END IF;

            -- Case C: Max Depth Safety Guard
            IF v_depth > v_max_depth THEN
                v_issues_count := v_issues_count + 1;

                UPDATE public.agent_mfa_records
                SET excess_unallocated_credit = excess_unallocated_credit + v_remaining
                WHERE id = v_curr_rec_id;

                INSERT INTO public.mfa_hierarchy_issues (
                    month, year, policy_id, policy_number, originating_agent_id,
                    agent_id, sponsor_id, issue_type, affected_credit, details
                )
                VALUES (
                    p_month, p_year, v_c.policy_id, v_c.policy_number, v_origin_prof.id,
                    v_curr_id, v_curr_sponsor_id, 'max_depth_exceeded', v_remaining,
                    jsonb_build_object('path', v_path, 'max_depth', v_max_depth)
                );

                INSERT INTO public.agent_mfa_cascading_allocations (
                    month, year, policy_id, source_contribution_id, policy_number,
                    business_date, plan_code, plan_type, duration_years,
                    original_business_amount, mfa_percentage, originating_mfa_credit,
                    originating_agent_id, originating_agent_name, originating_agent_code,
                    source_agent_id, source_agent_name, source_agent_code,
                    recipient_agent_id, recipient_mfa_record_id,
                    allocation_sequence, allocation_type,
                    incoming_credit, applied_amount, excess_passed_up,
                    unallocated_amount, unallocated_reason,
                    reporting_sponsor_id_snapshot, hierarchy_path, batch_run_id
                )
                VALUES (
                    p_month, p_year, v_c.policy_id, v_c.id, v_c.policy_number,
                    v_c.business_date, v_c.plan_code, v_c.plan_type, v_c.duration_years,
                    v_c.business_amount, v_c.mfa_percentage, v_c.mfa_credit,
                    v_origin_prof.id, v_origin_prof.name, v_origin_prof.sponsor_code,
                    v_curr_id, v_curr_name, v_curr_code,
                    NULL, NULL, v_seq, 'unallocated_excess',
                    v_remaining, 0, 0,
                    v_remaining, 'max_depth_exceeded',
                    v_curr_sponsor_id, v_path, v_batch_id
                );
                EXIT;
            END IF;

            -- Fetch Superior Profile
            SELECT id, name, sponsor_code, sponsor_id, rank, role, status::TEXT AS status_txt, is_admin, is_super_admin
            INTO v_sup_prof
            FROM public.profiles
            WHERE id = v_curr_sponsor_id;

            -- Case D: Missing / Broken Sponsor Reference
            IF v_sup_prof.id IS NULL THEN
                v_issues_count := v_issues_count + 1;

                UPDATE public.agent_mfa_records
                SET excess_unallocated_credit = excess_unallocated_credit + v_remaining
                WHERE id = v_curr_rec_id;

                INSERT INTO public.mfa_hierarchy_issues (
                    month, year, policy_id, policy_number, originating_agent_id,
                    agent_id, sponsor_id, issue_type, affected_credit, details
                )
                VALUES (
                    p_month, p_year, v_c.policy_id, v_c.policy_number, v_origin_prof.id,
                    v_curr_id, v_curr_sponsor_id, 'missing_superior', v_remaining,
                    jsonb_build_object('path', v_path, 'missing_sponsor_id', v_curr_sponsor_id)
                );

                INSERT INTO public.agent_mfa_cascading_allocations (
                    month, year, policy_id, source_contribution_id, policy_number,
                    business_date, plan_code, plan_type, duration_years,
                    original_business_amount, mfa_percentage, originating_mfa_credit,
                    originating_agent_id, originating_agent_name, originating_agent_code,
                    source_agent_id, source_agent_name, source_agent_code,
                    recipient_agent_id, recipient_mfa_record_id,
                    allocation_sequence, allocation_type,
                    incoming_credit, applied_amount, excess_passed_up,
                    unallocated_amount, unallocated_reason,
                    reporting_sponsor_id_snapshot, hierarchy_path, batch_run_id
                )
                VALUES (
                    p_month, p_year, v_c.policy_id, v_c.id, v_c.policy_number,
                    v_c.business_date, v_c.plan_code, v_c.plan_type, v_c.duration_years,
                    v_c.business_amount, v_c.mfa_percentage, v_c.mfa_credit,
                    v_origin_prof.id, v_origin_prof.name, v_origin_prof.sponsor_code,
                    v_curr_id, v_curr_name, v_curr_code,
                    NULL, NULL, v_seq, 'unallocated_excess',
                    v_remaining, 0, 0,
                    v_remaining, 'missing_superior',
                    v_curr_sponsor_id, v_path, v_batch_id
                );
                EXIT;
            END IF;

            -- Case E: Admin / Super-Admin Account Reached in Reporting Chain
            IF COALESCE(v_sup_prof.is_super_admin, false)
               OR COALESCE(v_sup_prof.is_admin, false)
               OR LOWER(COALESCE(v_sup_prof.role::TEXT, 'agent')) IN ('admin', 'super_admin') THEN
                v_issues_count := v_issues_count + 1;

                UPDATE public.agent_mfa_records
                SET excess_unallocated_credit = excess_unallocated_credit + v_remaining
                WHERE id = v_curr_rec_id;

                INSERT INTO public.mfa_hierarchy_issues (
                    month, year, policy_id, policy_number, originating_agent_id,
                    agent_id, sponsor_id, issue_type, affected_credit, details
                )
                VALUES (
                    p_month, p_year, v_c.policy_id, v_c.policy_number, v_origin_prof.id,
                    v_curr_id, v_sup_prof.id, 'admin_in_hierarchy', v_remaining,
                    jsonb_build_object('path', v_path, 'admin_code', v_sup_prof.sponsor_code)
                );

                INSERT INTO public.agent_mfa_cascading_allocations (
                    month, year, policy_id, source_contribution_id, policy_number,
                    business_date, plan_code, plan_type, duration_years,
                    original_business_amount, mfa_percentage, originating_mfa_credit,
                    originating_agent_id, originating_agent_name, originating_agent_code,
                    source_agent_id, source_agent_name, source_agent_code,
                    recipient_agent_id, recipient_mfa_record_id,
                    allocation_sequence, allocation_type,
                    incoming_credit, applied_amount, excess_passed_up,
                    unallocated_amount, unallocated_reason,
                    reporting_sponsor_id_snapshot, hierarchy_path, batch_run_id
                )
                VALUES (
                    p_month, p_year, v_c.policy_id, v_c.id, v_c.policy_number,
                    v_c.business_date, v_c.plan_code, v_c.plan_type, v_c.duration_years,
                    v_c.business_amount, v_c.mfa_percentage, v_c.mfa_credit,
                    v_origin_prof.id, v_origin_prof.name, v_origin_prof.sponsor_code,
                    v_curr_id, v_curr_name, v_curr_code,
                    NULL, NULL, v_seq, 'unallocated_excess',
                    v_remaining, 0, 0,
                    v_remaining, 'admin_in_hierarchy',
                    v_sup_prof.id, v_path, v_batch_id
                );
                EXIT;
            END IF;

            -- Ensure superior's monthly record & check snapshot
            v_sup_rec_id := public.ensure_agent_mfa_record(v_sup_prof.id, p_month, p_year);
            SELECT * INTO v_sup_rec
            FROM public.agent_mfa_records
            WHERE id = v_sup_rec_id
            FOR UPDATE;

            v_sup_status := LOWER(COALESCE(v_sup_prof.status_txt, 'active'));

            -- Case F: Inactive or Suspended Superior -> Do NOT award credit/reward, log anomaly, skip upward
            IF v_sup_status <> 'active' THEN
                v_issues_count := v_issues_count + 1;
                v_issue_type := CASE WHEN v_sup_status = 'suspended' THEN 'suspended_superior' ELSE 'inactive_superior' END;
                v_visited := array_append(v_visited, v_sup_prof.id);

                -- Credit left v_curr_id attempting upward cascade
                IF v_curr_rec_id IS NOT NULL THEN
                    UPDATE public.agent_mfa_records
                    SET excess_credit_passed_up = excess_credit_passed_up + v_remaining
                    WHERE id = v_curr_rec_id;
                END IF;

                v_path := v_path || jsonb_build_array(
                    jsonb_build_object(
                        'seq', v_seq,
                        'agent_id', v_sup_prof.id,
                        'agent_code', COALESCE(v_sup_prof.sponsor_code, ''),
                        'agent_name', COALESCE(v_sup_prof.name, ''),
                        'rank', v_sup_rec.rank_snapshot,
                        'rank_code', v_sup_rec.rank_code_snapshot,
                        'target', v_sup_rec.mfa_target_snapshot,
                        'allocation_type', 'skipped_inactive',
                        'status', v_sup_status,
                        'applied', 0,
                        'excess_up', v_remaining
                    )
                );

                INSERT INTO public.mfa_hierarchy_issues (
                    month, year, policy_id, policy_number, originating_agent_id,
                    agent_id, sponsor_id, issue_type, affected_credit, details
                )
                VALUES (
                    p_month, p_year, v_c.policy_id, v_c.policy_number, v_origin_prof.id,
                    v_sup_prof.id, v_sup_prof.sponsor_id, v_issue_type, v_remaining,
                    jsonb_build_object('path', v_path, 'superior_status', v_sup_status)
                );

                INSERT INTO public.agent_mfa_cascading_allocations (
                    month, year, policy_id, source_contribution_id, policy_number,
                    business_date, plan_code, plan_type, duration_years,
                    original_business_amount, mfa_percentage, originating_mfa_credit,
                    originating_agent_id, originating_agent_name, originating_agent_code,
                    source_agent_id, source_agent_name, source_agent_code,
                    recipient_agent_id, recipient_agent_name, recipient_agent_code,
                    recipient_mfa_record_id, allocation_sequence, allocation_type,
                    incoming_credit, applied_amount, excess_passed_up,
                    recipient_rank_snapshot, recipient_rank_code_snapshot,
                    recipient_target_snapshot, recipient_reward_snapshot,
                    reporting_sponsor_id_snapshot, hierarchy_path, batch_run_id
                )
                VALUES (
                    p_month, p_year, v_c.policy_id, v_c.id, v_c.policy_number,
                    v_c.business_date, v_c.plan_code, v_c.plan_type, v_c.duration_years,
                    v_c.business_amount, v_c.mfa_percentage, v_c.mfa_credit,
                    v_origin_prof.id, v_origin_prof.name, v_origin_prof.sponsor_code,
                    v_curr_id, v_curr_name, v_curr_code,
                    v_sup_prof.id, v_sup_prof.name, v_sup_prof.sponsor_code,
                    v_sup_rec.id, v_seq, 'skipped_inactive',
                    v_remaining, 0, v_remaining,
                    v_sup_rec.rank_snapshot, v_sup_rec.rank_code_snapshot,
                    v_sup_rec.mfa_target_snapshot, v_sup_rec.mfa_reward_snapshot,
                    v_sup_prof.sponsor_id, v_path, v_batch_id
                );

                v_curr_id := v_sup_prof.id;
                v_curr_name := v_sup_prof.name;
                v_curr_code := v_sup_prof.sponsor_code;
                v_curr_rec_id := NULL; -- Skipped node does not accumulate excess_unallocated unless next exits
                v_curr_sponsor_id := CASE
                    WHEN v_rec_ym < v_now_ym THEN COALESCE(v_sup_rec.sponsor_id_snapshot, v_sup_prof.sponsor_id)
                    ELSE v_sup_prof.sponsor_id
                END;
                CONTINUE;
            END IF;

            -- Case G: Superior is Rank 11–18 (No MFA Eligibility) -> Stop cleanly as unallocated_excess
            IF v_sup_rec.rank_snapshot NOT BETWEEN 1 AND 10 OR COALESCE(v_sup_rec.mfa_target_snapshot, 0) <= 0 THEN
                IF v_curr_rec_id IS NOT NULL THEN
                    UPDATE public.agent_mfa_records
                    SET excess_unallocated_credit = excess_unallocated_credit + v_remaining
                    WHERE id = v_curr_rec_id;
                END IF;

                INSERT INTO public.agent_mfa_cascading_allocations (
                    month, year, policy_id, source_contribution_id, policy_number,
                    business_date, plan_code, plan_type, duration_years,
                    original_business_amount, mfa_percentage, originating_mfa_credit,
                    originating_agent_id, originating_agent_name, originating_agent_code,
                    source_agent_id, source_agent_name, source_agent_code,
                    recipient_agent_id, recipient_mfa_record_id,
                    allocation_sequence, allocation_type,
                    incoming_credit, applied_amount, excess_passed_up,
                    unallocated_amount, unallocated_reason,
                    recipient_rank_snapshot, recipient_rank_code_snapshot,
                    reporting_sponsor_id_snapshot, hierarchy_path, batch_run_id
                )
                VALUES (
                    p_month, p_year, v_c.policy_id, v_c.id, v_c.policy_number,
                    v_c.business_date, v_c.plan_code, v_c.plan_type, v_c.duration_years,
                    v_c.business_amount, v_c.mfa_percentage, v_c.mfa_credit,
                    v_origin_prof.id, v_origin_prof.name, v_origin_prof.sponsor_code,
                    v_curr_id, v_curr_name, v_curr_code,
                    NULL, NULL, v_seq, 'unallocated_excess',
                    v_remaining, 0, 0,
                    v_remaining, 'no_eligible_mfa_superior',
                    v_sup_rec.rank_snapshot, v_sup_rec.rank_code_snapshot,
                    v_sup_prof.id, v_path, v_batch_id
                );
                EXIT;
            END IF;

            -- Case H: Active Eligible Rank 1–10 Superior -> Allocate up to remaining target, forward remainder
            IF v_curr_rec_id IS NOT NULL THEN
                UPDATE public.agent_mfa_records
                SET excess_credit_passed_up = excess_credit_passed_up + v_remaining
                WHERE id = v_curr_rec_id;
            END IF;

            v_visited := array_append(v_visited, v_sup_prof.id);
            v_rem_target := GREATEST(0, ROUND(v_sup_rec.mfa_target_snapshot - v_sup_rec.total_mfa_credit, 2));
            v_apply := LEAST(v_remaining, v_rem_target);
            v_excess := ROUND(v_remaining - v_apply, 2);

            IF v_apply = 0 AND v_rem_target = 0 THEN
                v_alloc_type := 'pass_through';
            ELSE
                v_alloc_type := 'cascading_from_downline';
            END IF;

            IF v_apply > 0 THEN
                UPDATE public.agent_mfa_records
                SET
                    cascading_mfa_credit_received = cascading_mfa_credit_received + v_apply,
                    total_mfa_credit = total_mfa_credit + v_apply,
                    cascading_in_count = cascading_in_count + 1
                WHERE id = v_sup_rec.id;
            END IF;

            v_curr_sponsor_id := CASE
                WHEN v_rec_ym < v_now_ym THEN COALESCE(v_sup_rec.sponsor_id_snapshot, v_sup_prof.sponsor_id)
                ELSE v_sup_prof.sponsor_id
            END;

            v_path := v_path || jsonb_build_array(
                jsonb_build_object(
                    'seq', v_seq,
                    'agent_id', v_sup_prof.id,
                    'agent_code', COALESCE(v_sup_prof.sponsor_code, ''),
                    'agent_name', COALESCE(v_sup_prof.name, ''),
                    'rank', v_sup_rec.rank_snapshot,
                    'rank_code', v_sup_rec.rank_code_snapshot,
                    'target', v_sup_rec.mfa_target_snapshot,
                    'allocation_type', v_alloc_type,
                    'applied', v_apply,
                    'excess_up', v_excess
                )
            );

            INSERT INTO public.agent_mfa_cascading_allocations (
                month, year, policy_id, source_contribution_id, policy_number,
                business_date, plan_code, plan_type, duration_years,
                original_business_amount, mfa_percentage, originating_mfa_credit,
                originating_agent_id, originating_agent_name, originating_agent_code,
                source_agent_id, source_agent_name, source_agent_code,
                recipient_agent_id, recipient_agent_name, recipient_agent_code,
                recipient_mfa_record_id, allocation_sequence, allocation_type,
                incoming_credit, applied_amount, excess_passed_up,
                recipient_rank_snapshot, recipient_rank_code_snapshot,
                recipient_target_snapshot, recipient_reward_snapshot,
                reporting_sponsor_id_snapshot, hierarchy_path, batch_run_id
            )
            VALUES (
                p_month, p_year, v_c.policy_id, v_c.id, v_c.policy_number,
                v_c.business_date, v_c.plan_code, v_c.plan_type, v_c.duration_years,
                v_c.business_amount, v_c.mfa_percentage, v_c.mfa_credit,
                v_origin_prof.id, v_origin_prof.name, v_origin_prof.sponsor_code,
                v_curr_id, v_curr_name, v_curr_code,
                v_sup_prof.id, v_sup_prof.name, v_sup_prof.sponsor_code,
                v_sup_rec.id, v_seq, v_alloc_type,
                v_remaining, v_apply, v_excess,
                v_sup_rec.rank_snapshot, v_sup_rec.rank_code_snapshot,
                v_sup_rec.mfa_target_snapshot, v_sup_rec.mfa_reward_snapshot,
                v_curr_sponsor_id, v_path, v_batch_id
            );

            v_remaining := v_excess;
            v_curr_id := v_sup_prof.id;
            v_curr_name := v_sup_prof.name;
            v_curr_code := v_sup_prof.sponsor_code;
            v_curr_rec_id := v_sup_rec.id;
        END LOOP;
    END LOOP;

    -- Final Pass: Compute remaining_amount, achievement_pct, reward_earned, status for all period records
    FOR v_rec IN
        SELECT *
        FROM public.agent_mfa_records
        WHERE month = p_month AND year = p_year
        FOR UPDATE
    LOOP
        IF v_rec.mfa_target_snapshot > 0 AND v_rec.mfa_reward_snapshot > 0 THEN
            v_rem_amt := GREATEST(0, ROUND(v_rec.mfa_target_snapshot - v_rec.total_mfa_credit, 2));
            v_pct := ROUND((v_rec.total_mfa_credit / v_rec.mfa_target_snapshot) * 100.0, 2);
            v_qualified := v_rec.total_mfa_credit >= v_rec.mfa_target_snapshot;
            v_reward := CASE WHEN v_qualified THEN v_rec.mfa_reward_snapshot ELSE 0 END;

            IF v_qualified THEN
                v_status := 'achieved';
            ELSIF v_rec_ym < v_now_ym THEN
                v_status := 'missed';
            ELSE
                v_status := 'in_progress';
            END IF;
        ELSE
            v_rem_amt := 0;
            v_pct := 0;
            v_qualified := false;
            v_reward := 0;
            v_status := 'not_applicable';
        END IF;

        UPDATE public.agent_mfa_records
        SET
            remaining_amount = v_rem_amt,
            achievement_pct = v_pct,
            is_qualified = v_qualified,
            reward_earned = v_reward,
            status = v_status,
            last_calculated_at = now(),
            updated_at = now()
        WHERE id = v_rec.id;
    END LOOP;

    -- Log distinct hierarchy anomalies into public.audit_logs safely (non-fatal)
    IF v_issues_count > 0 THEN
        BEGIN
            INSERT INTO public.audit_logs (
                type, action, target_uid, target_agent_code, reason, new_values, success
            )
            SELECT
                'MFA_HIERARCHY_ANOMALY',
                'CASCADING_MFA_' || UPPER(i.issue_type),
                LEFT(COALESCE(i.agent_id::TEXT, i.originating_agent_id::TEXT, ''), 128),
                COALESCE(p.sponsor_code, ''),
                format('Cascading MFA hierarchy issue (%s) for %s/%s: %s on policy %s',
                    i.issue_type, i.month, i.year, i.affected_credit, COALESCE(i.policy_number, '—')),
                jsonb_build_object(
                    'month', i.month,
                    'year', i.year,
                    'issue_type', i.issue_type,
                    'policy_id', i.policy_id,
                    'agent_id', i.agent_id,
                    'sponsor_id', i.sponsor_id,
                    'affected_credit', i.affected_credit
                ),
                true
            FROM public.mfa_hierarchy_issues i
            LEFT JOIN public.profiles p ON p.id = i.agent_id
            WHERE i.month = p_month
              AND i.year = p_year
              AND NOT EXISTS (
                  SELECT 1 FROM public.audit_logs a
                  WHERE a.type = 'MFA_HIERARCHY_ANOMALY'
                    AND a.action = 'CASCADING_MFA_' || UPPER(i.issue_type)
                    AND a.target_uid = LEFT(COALESCE(i.agent_id::TEXT, i.originating_agent_id::TEXT, ''), 128)
                    AND (a.new_values->>'month') = i.month::TEXT
                    AND (a.new_values->>'year') = i.year::TEXT
                    AND COALESCE(a.new_values->>'policy_id', '') = COALESCE(i.policy_id::TEXT, '')
              );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    PERFORM set_config('apex.in_mfa_cascade', '0', true);

    RETURN jsonb_build_object(
        'success', true,
        'batch_run_id', v_batch_id,
        'month', p_month,
        'year', p_year,
        'policies_processed', v_policies_processed,
        'issues_detected', v_issues_count
    );
END;
$$;

-- Keep legacy per-agent signature compatible by invoking month-wide cascade recalculation
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
BEGIN
    PERFORM public.recalculate_cascading_mfa_month(p_month, p_year);
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Policy Sync Helper with Optional Batch Cascade Deferral
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_policy_mfa_contribution_ex(
    p_policy_id UUID,
    p_recalculate_cascade BOOLEAN DEFAULT true
)
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

    -- Policy deleted or absent -> cleanup any old contribution & recalculate cascade
    IF v_pol.id IS NULL THEN
        IF v_old_contrib.id IS NOT NULL THEN
            DELETE FROM public.agent_mfa_contributions WHERE id = v_old_contrib.id;
            IF p_recalculate_cascade THEN
                PERFORM public.recalculate_cascading_mfa_month(v_old_contrib.month, v_old_contrib.year);
            END IF;
        END IF;
        RETURN;
    END IF;

    -- Policy status ineligible -> remove contribution and recalculate cascade
    IF LOWER(COALESCE(v_pol.status::TEXT, 'active')) NOT IN ('active', 'matured')
       OR v_pol.agent_id IS NULL THEN
        IF v_old_contrib.id IS NOT NULL THEN
            DELETE FROM public.agent_mfa_contributions WHERE id = v_old_contrib.id;
            IF p_recalculate_cascade THEN
                PERFORM public.recalculate_cascading_mfa_month(v_old_contrib.month, v_old_contrib.year);
            END IF;
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
            IF p_recalculate_cascade THEN
                PERFORM public.recalculate_cascading_mfa_month(v_old_contrib.month, v_old_contrib.year);
            END IF;
        END IF;
        RETURN;
    END IF;

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
            IF p_recalculate_cascade THEN
                PERFORM public.recalculate_cascading_mfa_month(v_old_contrib.month, v_old_contrib.year);
            END IF;
        END IF;
        RETURN;
    END IF;

    v_is_rd := (
        UPPER(COALESCE(v_pol.plan_type::TEXT, '')) = 'RD'
        OR UPPER(COALESCE(v_pol.plan_code::TEXT, '')) LIKE 'RD%'
    );

    IF v_is_rd THEN
        v_biz_amount := COALESCE(
            NULLIF(v_pol.monthly_amount, 0),
            v_first_payment.amount,
            NULLIF(v_pol.total_paid, 0),
            0
        );
    ELSE
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
            IF p_recalculate_cascade THEN
                PERFORM public.recalculate_cascading_mfa_month(v_old_contrib.month, v_old_contrib.year);
            END IF;
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

    IF p_recalculate_cascade THEN
        IF v_old_contrib.id IS NOT NULL
           AND (v_old_contrib.month <> v_month OR v_old_contrib.year <> v_year) THEN
            PERFORM public.recalculate_cascading_mfa_month(v_old_contrib.month, v_old_contrib.year);
        END IF;
        PERFORM public.recalculate_cascading_mfa_month(v_month, v_year);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_policy_mfa_contribution(p_policy_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.sync_policy_mfa_contribution_ex(p_policy_id, true);
END;
$$;

-- Update deletion cleanup trigger to recalculate cascading across the period
CREATE OR REPLACE FUNCTION public.trg_contrib_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_setting('apex.in_mfa_cascade', true) <> '1' THEN
        PERFORM public.recalculate_cascading_mfa_month(OLD.month, OLD.year);
    END IF;
    RETURN OLD;
END;
$$;

-- Recompute current open month cascade if a profile's reporting sponsor or status changes
CREATE OR REPLACE FUNCTION public.trg_profiles_cascade_mfa_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cur_m INTEGER := EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
    v_cur_y INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
BEGIN
    IF (OLD.sponsor_id IS DISTINCT FROM NEW.sponsor_id)
       OR (OLD.status IS DISTINCT FROM NEW.status) THEN
        IF EXISTS (
            SELECT 1 FROM public.agent_mfa_contributions
            WHERE month = v_cur_m AND year = v_cur_y
        ) THEN
            PERFORM public.recalculate_cascading_mfa_month(v_cur_m, v_cur_y);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_cascade_mfa_after ON public.profiles;
CREATE TRIGGER trg_profiles_cascade_mfa_after
AFTER UPDATE OF sponsor_id, status ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_profiles_cascade_mfa_sync();

-- ----------------------------------------------------------------------------
-- 7. Upgrade Public RPC sync_monthly_mfa_cycle(p_month, p_year)
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
    v_cascade_res JSONB;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    v_is_admin := COALESCE(public.is_admin(), false) OR COALESCE(public.is_super_admin(), false);

    IF v_is_admin THEN
        FOR v_agent IN
            SELECT id
            FROM public.profiles
            WHERE COALESCE(is_super_admin, false) = false
              AND COALESCE(is_admin, false) = false
              AND LOWER(COALESCE(role::TEXT, 'agent')) NOT IN ('admin', 'super_admin')
              AND COALESCE(rank, 1) BETWEEN 1 AND 10
              AND LOWER(COALESCE(status::TEXT, 'active')) = 'active'
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
            PERFORM public.sync_policy_mfa_contribution_ex(v_pol.id, false);
        END LOOP;
    ELSE
        -- Agents only initialize/sync their own contributions & trigger month cascade
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
            PERFORM public.sync_policy_mfa_contribution_ex(v_pol.id, false);
        END LOOP;
        v_count := 1;
    END IF;

    v_cascade_res := public.recalculate_cascading_mfa_month(p_month, p_year);

    RETURN jsonb_build_object(
        'success', true,
        'cascading_enabled', true,
        'month', p_month,
        'year', p_year,
        'records_synced', v_count,
        'policies_processed', COALESCE((v_cascade_res->>'policies_processed')::INTEGER, 0),
        'issues_detected', COALESCE((v_cascade_res->>'issues_detected')::INTEGER, 0)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Permissions & Row Level Security (Strict Isolation, Backend-Only Writes)
-- ----------------------------------------------------------------------------
ALTER TABLE public.agent_mfa_cascading_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_hierarchy_issues ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.agent_mfa_cascading_allocations FROM anon, authenticated;
REVOKE ALL ON TABLE public.mfa_hierarchy_issues FROM anon, authenticated;

GRANT SELECT ON TABLE public.agent_mfa_cascading_allocations TO authenticated;
GRANT SELECT ON TABLE public.mfa_hierarchy_issues TO authenticated;

DROP POLICY IF EXISTS "mfa_cascading_select_policy" ON public.agent_mfa_cascading_allocations;
CREATE POLICY "mfa_cascading_select_policy" ON public.agent_mfa_cascading_allocations
FOR SELECT
TO authenticated
USING (
    public.is_admin() OR
    public.is_super_admin() OR
    recipient_agent_id = auth.uid() OR
    source_agent_id = auth.uid()
);

DROP POLICY IF EXISTS "mfa_hierarchy_issues_admin_select" ON public.mfa_hierarchy_issues;
CREATE POLICY "mfa_hierarchy_issues_admin_select" ON public.mfa_hierarchy_issues
FOR SELECT
TO authenticated
USING (
    public.is_admin() OR
    public.is_super_admin()
);

REVOKE ALL ON FUNCTION public.recalculate_cascading_mfa_month(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_policy_mfa_contribution_ex(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_policy_mfa_contribution(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_monthly_mfa_cycle(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_monthly_mfa_cycle(INTEGER, INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. Backfill All Existing Periods & Current Month With Cascading Engine
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_pol RECORD;
    v_period RECORD;
    v_agent RECORD;
    v_cur_m INTEGER := EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
    v_cur_y INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
BEGIN
    -- 1. Ensure current month records exist for active eligible Rank 1–10 agents
    FOR v_agent IN
        SELECT id
        FROM public.profiles
        WHERE COALESCE(is_super_admin, false) = false
          AND COALESCE(is_admin, false) = false
          AND LOWER(COALESCE(role::TEXT, 'agent')) NOT IN ('admin', 'super_admin')
          AND COALESCE(rank, 1) BETWEEN 1 AND 10
          AND LOWER(COALESCE(status::TEXT, 'active')) = 'active'
    LOOP
        PERFORM public.ensure_agent_mfa_record(v_agent.id, v_cur_m, v_cur_y);
    END LOOP;

    -- 2. Sync all individual policies without recalculating per policy
    FOR v_pol IN SELECT id FROM public.policies LOOP
        PERFORM public.sync_policy_mfa_contribution_ex(v_pol.id, false);
    END LOOP;

    -- 3. Replay cascading allocation chronologically for every distinct (year, month)
    FOR v_period IN
        SELECT DISTINCT year, month FROM public.agent_mfa_records
        UNION
        SELECT DISTINCT year, month FROM public.agent_mfa_contributions
        UNION
        SELECT v_cur_y AS year, v_cur_m AS month
        ORDER BY year ASC, month ASC
    LOOP
        PERFORM public.recalculate_cascading_mfa_month(v_period.month, v_period.year);
    END LOOP;
END;
$$;

COMMIT;
