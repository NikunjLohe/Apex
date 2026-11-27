-- ============================================================================
-- APEX Cascading MFA — Historical Integrity & Closed-Month Remediation Migration
-- Date: 2026-11-27
-- Purpose:
--   1. Add `agent_status_snapshot` and `status_snapshot_uncertain` to `public.agent_mfa_records`.
--   2. Backfill `agent_status_snapshot` safely without mutating historical or open Nov 2026 metrics.
--   3. Seal any closed past-month records (`< current IST YYYYMM`) with `is_locked = true`.
--   4. Safely align/refresh only genuinely empty, untouched December 2026 (`2026-12`) snapshots
--      in-place (zero contributions, allocations, issues, or rewards) and log before/after audit.
--   5. Enforce closed-month lock & future-month auto-creation guards across SQL helpers,
--      calculation engine, policy sync, triggers, and `sync_monthly_mfa_cycle`.
-- Safe & Idempotent: May be re-run without duplicating rows or altering finalized totals.
-- ============================================================================

-- 1. Schema Extensions on public.agent_mfa_records
ALTER TABLE public.agent_mfa_records
    ADD COLUMN IF NOT EXISTS agent_status_snapshot TEXT,
    ADD COLUMN IF NOT EXISTS status_snapshot_uncertain BOOLEAN NOT NULL DEFAULT false;

-- 2. IST Calendar & Period Lock Helpers
CREATE OR REPLACE FUNCTION public.get_ist_ym()
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT (EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER * 100)
         + EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
$$;

CREATE OR REPLACE FUNCTION public.is_mfa_period_closed_or_locked(
    p_month INTEGER,
    p_year INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now_ym INTEGER := public.get_ist_ym();
    v_rec_ym INTEGER;
BEGIN
    IF p_month IS NULL OR p_year IS NULL THEN
        RETURN false;
    END IF;

    v_rec_ym := (p_year * 100) + p_month;
    IF v_rec_ym < v_now_ym THEN
        RETURN true;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.agent_mfa_records r
        WHERE r.month = p_month
          AND r.year = p_year
          AND r.is_locked = true
    );
END;
$$;

-- 3. Historical Protection Triggers on MFA Tables
-- Prevents unlocking sealed records or mutating/deleting records, contributions, or allocations
-- inside closed/locked periods unless inside controlled migration backfill.
CREATE OR REPLACE FUNCTION public.trg_protect_locked_agent_mfa_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now_ym INTEGER := public.get_ist_ym();
    v_old_ym INTEGER;
BEGIN
    IF current_setting('apex.allow_mfa_migration_backfill', true) = '1' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    v_old_ym := (OLD.year * 100) + OLD.month;

    IF TG_OP = 'DELETE' THEN
        IF COALESCE(OLD.is_locked, false) = true OR v_old_ym < v_now_ym THEN
            RAISE EXCEPTION 'Closed/locked MFA record (%/% for agent %) cannot be deleted',
                OLD.month, OLD.year, OLD.agent_id;
        END IF;
        RETURN OLD;
    END IF;

    IF COALESCE(OLD.is_locked, false) = true THEN
        IF COALESCE(NEW.is_locked, false) = false THEN
            RAISE EXCEPTION 'Locked MFA historical record (%/% for agent %) cannot be unlocked',
                OLD.month, OLD.year, OLD.agent_id;
        END IF;

        IF (OLD.rank_snapshot IS DISTINCT FROM NEW.rank_snapshot)
           OR (OLD.rank_code_snapshot IS DISTINCT FROM NEW.rank_code_snapshot)
           OR (OLD.mfa_target_snapshot IS DISTINCT FROM NEW.mfa_target_snapshot)
           OR (OLD.mfa_reward_snapshot IS DISTINCT FROM NEW.mfa_reward_snapshot)
           OR (OLD.sponsor_id_snapshot IS DISTINCT FROM NEW.sponsor_id_snapshot)
           OR (OLD.agent_status_snapshot IS DISTINCT FROM NEW.agent_status_snapshot)
           OR (OLD.raw_business_total IS DISTINCT FROM NEW.raw_business_total)
           OR (OLD.own_business_total IS DISTINCT FROM NEW.own_business_total)
           OR (OLD.own_mfa_credit_generated IS DISTINCT FROM NEW.own_mfa_credit_generated)
           OR (OLD.own_mfa_credit_applied IS DISTINCT FROM NEW.own_mfa_credit_applied)
           OR (OLD.cascading_mfa_credit_received IS DISTINCT FROM NEW.cascading_mfa_credit_received)
           OR (OLD.total_mfa_credit IS DISTINCT FROM NEW.total_mfa_credit)
           OR (OLD.excess_credit_passed_up IS DISTINCT FROM NEW.excess_credit_passed_up)
           OR (OLD.excess_unallocated_credit IS DISTINCT FROM NEW.excess_unallocated_credit)
           OR (OLD.remaining_amount IS DISTINCT FROM NEW.remaining_amount)
           OR (OLD.achievement_pct IS DISTINCT FROM NEW.achievement_pct)
           OR (OLD.is_qualified IS DISTINCT FROM NEW.is_qualified)
           OR (OLD.reward_earned IS DISTINCT FROM NEW.reward_earned)
           OR (OLD.status IS DISTINCT FROM NEW.status) THEN
            RAISE EXCEPTION 'Closed/locked MFA record (%/% for agent %) is read-only',
                OLD.month, OLD.year, OLD.agent_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_mfa_records_protect_locked ON public.agent_mfa_records;
CREATE TRIGGER trg_agent_mfa_records_protect_locked
BEFORE UPDATE OR DELETE ON public.agent_mfa_records
FOR EACH ROW
EXECUTE FUNCTION public.trg_protect_locked_agent_mfa_record();

CREATE OR REPLACE FUNCTION public.trg_protect_locked_mfa_child_rows()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month INTEGER;
    v_year INTEGER;
BEGIN
    IF current_setting('apex.allow_mfa_migration_backfill', true) = '1' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF public.is_mfa_period_closed_or_locked(OLD.month, OLD.year) THEN
            RAISE EXCEPTION 'Closed/locked MFA period (%/% ) cannot be deleted in %',
                OLD.month, OLD.year, TG_TABLE_NAME;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.month IS NOT NULL AND OLD.year IS NOT NULL THEN
        IF public.is_mfa_period_closed_or_locked(OLD.month, OLD.year) THEN
            RAISE EXCEPTION 'Closed/locked MFA period (%/% ) cannot be modified in %',
                OLD.month, OLD.year, TG_TABLE_NAME;
        END IF;
    END IF;

    v_month := NEW.month;
    v_year := NEW.year;

    IF public.is_mfa_period_closed_or_locked(v_month, v_year) THEN
        RAISE EXCEPTION 'Closed/locked MFA period (%/% ) cannot be modified in %',
            v_month, v_year, TG_TABLE_NAME;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mfa_contrib_protect_locked ON public.agent_mfa_contributions;
CREATE TRIGGER trg_mfa_contrib_protect_locked
BEFORE INSERT OR UPDATE OR DELETE ON public.agent_mfa_contributions
FOR EACH ROW
EXECUTE FUNCTION public.trg_protect_locked_mfa_child_rows();

DROP TRIGGER IF EXISTS trg_mfa_alloc_protect_locked ON public.agent_mfa_cascading_allocations;
CREATE TRIGGER trg_mfa_alloc_protect_locked
BEFORE INSERT OR UPDATE OR DELETE ON public.agent_mfa_cascading_allocations
FOR EACH ROW
EXECUTE FUNCTION public.trg_protect_locked_mfa_child_rows();

-- 4. One-Time Historical Backfill, Lock Sealing & Empty Dec 2026 Snapshot Alignment
DO $$
DECLARE
    v_now_ym INTEGER := public.get_ist_ym();
    v_hist_known_active_cnt INTEGER := 0;
    v_hist_uncertain_cnt INTEGER := 0;
    v_hist_locked_cnt INTEGER := 0;
    v_open_backfilled_cnt INTEGER := 0;

    v_dec_total_before INTEGER := 0;
    v_dec_empty_before INTEGER := 0;
    v_dec_nonempty_before INTEGER := 0;
    v_dec_diff_before INTEGER := 0;
    v_dec_refreshed_cnt INTEGER := 0;
    v_dec_diff_after INTEGER := 0;
    v_dec_total_after INTEGER := 0;
    v_dec_sample_diffs JSONB := '[]'::jsonb;
BEGIN
    PERFORM set_config('apex.allow_mfa_migration_backfill', '1', true);

    -- A. Backfill agent_status_snapshot for open/current/future rows without changing credits/rewards
    UPDATE public.agent_mfa_records r
    SET
        agent_status_snapshot = LOWER(COALESCE(p.status::TEXT, 'active')),
        status_snapshot_uncertain = false
    FROM public.profiles p
    WHERE r.agent_id = p.id
      AND ((r.year * 100) + r.month) >= v_now_ym
      AND r.agent_status_snapshot IS NULL;
    GET DIAGNOSTICS v_open_backfilled_cnt = ROW_COUNT;

    -- B. Conservative backfill + seal is_locked = true for any closed historical rows (< current IST YYYYMM)
    -- B1: Historical rows with documented applied/cascaded MFA credit or qualification must have been active
    UPDATE public.agent_mfa_records r
    SET
        agent_status_snapshot = 'active',
        status_snapshot_uncertain = false
    WHERE ((r.year * 100) + r.month) < v_now_ym
      AND r.agent_status_snapshot IS NULL
      AND (
          COALESCE(r.own_mfa_credit_applied, 0) > 0
          OR COALESCE(r.cascading_mfa_credit_received, 0) > 0
          OR COALESCE(r.total_mfa_credit, 0) > 0
          OR COALESCE(r.is_qualified, false) = true
      );
    GET DIAGNOSTICS v_hist_known_active_cnt = ROW_COUNT;

    -- B2: Historical rows without applied credit cannot reliably reconstruct past status -> mark 'unknown' + uncertain
    UPDATE public.agent_mfa_records r
    SET
        agent_status_snapshot = 'unknown',
        status_snapshot_uncertain = true
    WHERE ((r.year * 100) + r.month) < v_now_ym
      AND r.agent_status_snapshot IS NULL;
    GET DIAGNOSTICS v_hist_uncertain_cnt = ROW_COUNT;

    IF v_hist_uncertain_cnt > 0 THEN
        INSERT INTO public.audit_logs (
            type, action, target_uid, target_agent_code, reason, new_values, success
        )
        SELECT
            'MFA_STATUS_SNAPSHOT_UNCERTAIN',
            'HISTORICAL_STATUS_RECONSTRUCTION_CONSERVATIVE',
            LEFT(r.agent_id::TEXT, 128),
            COALESCE(p.sponsor_code, ''),
            format('Historical MFA status could not be reliably reconstructed for %s/%s; marked unknown conservatively.',
                r.month, r.year),
            jsonb_build_object(
                'record_id', r.id,
                'agent_id', r.agent_id,
                'month', r.month,
                'year', r.year,
                'current_profile_status', LOWER(COALESCE(p.status::TEXT, 'unknown')),
                'assigned_snapshot', 'unknown'
            ),
            true
        FROM public.agent_mfa_records r
        LEFT JOIN public.profiles p ON p.id = r.agent_id
        WHERE ((r.year * 100) + r.month) < v_now_ym
          AND r.status_snapshot_uncertain = true
          AND NOT EXISTS (
              SELECT 1 FROM public.audit_logs a
              WHERE a.type = 'MFA_STATUS_SNAPSHOT_UNCERTAIN'
                AND a.target_uid = LEFT(r.agent_id::TEXT, 128)
                AND (a.new_values->>'month')::INTEGER = r.month
                AND (a.new_values->>'year')::INTEGER = r.year
          );
    END IF;

    -- B3: Seal all closed past-month rows as locked without altering any financial column
    UPDATE public.agent_mfa_records r
    SET is_locked = true
    WHERE ((r.year * 100) + r.month) < v_now_ym
      AND COALESCE(r.is_locked, false) = false;
    GET DIAGNOSTICS v_hist_locked_cnt = ROW_COUNT;

    -- C. Audit & safely refresh ONLY genuinely empty, untouched December 2026 (`2026-12`) rows in-place
    -- Never touches non-empty Dec rows or any Nov 2026 rows.
    SELECT
        COUNT(*),
        COUNT(*) FILTER (
            WHERE NOT COALESCE(r.is_locked, false)
              AND COALESCE(r.raw_business_total, 0) = 0
              AND COALESCE(r.own_business_total, 0) = 0
              AND COALESCE(r.own_mfa_credit_generated, 0) = 0
              AND COALESCE(r.own_mfa_credit_applied, 0) = 0
              AND COALESCE(r.cascading_mfa_credit_received, 0) = 0
              AND COALESCE(r.total_mfa_credit, 0) = 0
              AND COALESCE(r.excess_credit_passed_up, 0) = 0
              AND COALESCE(r.excess_unallocated_credit, 0) = 0
              AND COALESCE(r.reward_earned, 0) = 0
              AND COALESCE(r.is_qualified, false) = false
              AND COALESCE(r.contributions_count, 0) = 0
              AND COALESCE(r.cascading_in_count, 0) = 0
              AND NOT EXISTS (
                  SELECT 1 FROM public.agent_mfa_contributions c
                  WHERE c.mfa_record_id = r.id
                     OR (c.agent_id = r.agent_id AND c.month = 12 AND c.year = 2026)
              )
              AND NOT EXISTS (
                  SELECT 1 FROM public.agent_mfa_cascading_allocations a
                  WHERE a.month = 12 AND a.year = 2026
                    AND (a.originating_agent_id = r.agent_id
                         OR a.source_agent_id = r.agent_id
                         OR a.recipient_agent_id = r.agent_id
                         OR a.recipient_mfa_record_id = r.id)
              )
              AND NOT EXISTS (
                  SELECT 1 FROM public.mfa_hierarchy_issues hi
                  WHERE hi.month = 12 AND hi.year = 2026
                    AND (hi.originating_agent_id = r.agent_id
                         OR hi.agent_id = r.agent_id
                         OR hi.sponsor_id = r.agent_id)
              )
        )
    INTO v_dec_total_before, v_dec_empty_before
    FROM public.agent_mfa_records r
    WHERE r.year = 2026 AND r.month = 12;

    v_dec_nonempty_before := v_dec_total_before - v_dec_empty_before;

    SELECT
        COUNT(*),
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'agent_id', r.agent_id,
                    'sponsor_code', p.sponsor_code,
                    'old_rank', r.rank_snapshot,
                    'new_rank', s.rank,
                    'old_sponsor', r.sponsor_id_snapshot,
                    'new_sponsor', p.sponsor_id,
                    'old_status_snapshot', r.agent_status_snapshot,
                    'new_status_snapshot', LOWER(COALESCE(p.status::TEXT, 'active'))
                )
            ) FILTER (WHERE (
                r.rank_snapshot IS DISTINCT FROM s.rank
                OR r.rank_code_snapshot IS DISTINCT FROM s.rank_code
                OR r.mfa_target_snapshot IS DISTINCT FROM s.mfa_target
                OR r.mfa_reward_snapshot IS DISTINCT FROM s.mfa_reward
                OR r.sponsor_id_snapshot IS DISTINCT FROM p.sponsor_id
                OR r.agent_status_snapshot IS DISTINCT FROM LOWER(COALESCE(p.status::TEXT, 'active'))
            )),
            '[]'::jsonb
        )
    INTO v_dec_diff_before, v_dec_sample_diffs
    FROM public.agent_mfa_records r
    JOIN public.profiles p ON p.id = r.agent_id
    CROSS JOIN LATERAL public.get_mfa_slab_for_rank(COALESCE(p.rank, 1)) s
    WHERE r.year = 2026 AND r.month = 12
      AND (
          r.rank_snapshot IS DISTINCT FROM s.rank
          OR r.rank_code_snapshot IS DISTINCT FROM s.rank_code
          OR r.mfa_target_snapshot IS DISTINCT FROM s.mfa_target
          OR r.mfa_reward_snapshot IS DISTINCT FROM s.mfa_reward
          OR r.sponsor_id_snapshot IS DISTINCT FROM p.sponsor_id
          OR r.agent_status_snapshot IS DISTINCT FROM LOWER(COALESCE(p.status::TEXT, 'active'))
      );

    -- Only refresh Dec 2026 rows while 2026-12 is still strictly a future month (v_now_ym < 202612)
    IF v_now_ym < 202612 AND v_dec_empty_before > 0 THEN
        UPDATE public.agent_mfa_records r
        SET
            rank_snapshot = s.rank,
            rank_code_snapshot = s.rank_code,
            mfa_target_snapshot = s.mfa_target,
            mfa_reward_snapshot = s.mfa_reward,
            sponsor_id_snapshot = p.sponsor_id,
            agent_status_snapshot = LOWER(COALESCE(p.status::TEXT, 'active')),
            status_snapshot_uncertain = false,
            status = CASE
                WHEN COALESCE(s.mfa_target, 0) <= 0 OR COALESCE(s.mfa_reward, 0) <= 0 THEN 'not_applicable'
                ELSE 'in_progress'
            END,
            updated_at = now()
        FROM public.profiles p
        CROSS JOIN LATERAL public.get_mfa_slab_for_rank(COALESCE(p.rank, 1)) s
        WHERE r.agent_id = p.id
          AND r.year = 2026
          AND r.month = 12
          AND NOT COALESCE(r.is_locked, false)
          AND COALESCE(r.raw_business_total, 0) = 0
          AND COALESCE(r.own_business_total, 0) = 0
          AND COALESCE(r.own_mfa_credit_generated, 0) = 0
          AND COALESCE(r.own_mfa_credit_applied, 0) = 0
          AND COALESCE(r.cascading_mfa_credit_received, 0) = 0
          AND COALESCE(r.total_mfa_credit, 0) = 0
          AND COALESCE(r.excess_credit_passed_up, 0) = 0
          AND COALESCE(r.excess_unallocated_credit, 0) = 0
          AND COALESCE(r.reward_earned, 0) = 0
          AND COALESCE(r.is_qualified, false) = false
          AND COALESCE(r.contributions_count, 0) = 0
          AND COALESCE(r.cascading_in_count, 0) = 0
          AND NOT EXISTS (
              SELECT 1 FROM public.agent_mfa_contributions c
              WHERE c.mfa_record_id = r.id
                 OR (c.agent_id = r.agent_id AND c.month = 12 AND c.year = 2026)
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.agent_mfa_cascading_allocations a
              WHERE a.month = 12 AND a.year = 2026
                AND (a.originating_agent_id = r.agent_id
                     OR a.source_agent_id = r.agent_id
                     OR a.recipient_agent_id = r.agent_id
                     OR a.recipient_mfa_record_id = r.id)
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.mfa_hierarchy_issues hi
              WHERE hi.month = 12 AND hi.year = 2026
                AND (hi.originating_agent_id = r.agent_id
                     OR hi.agent_id = r.agent_id
                     OR hi.sponsor_id = r.agent_id)
          );
        GET DIAGNOSTICS v_dec_refreshed_cnt = ROW_COUNT;
    END IF;

    SELECT COUNT(*) INTO v_dec_total_after
    FROM public.agent_mfa_records
    WHERE year = 2026 AND month = 12;

    SELECT COUNT(*) INTO v_dec_diff_after
    FROM public.agent_mfa_records r
    JOIN public.profiles p ON p.id = r.agent_id
    CROSS JOIN LATERAL public.get_mfa_slab_for_rank(COALESCE(p.rank, 1)) s
    WHERE r.year = 2026 AND r.month = 12
      AND (
          r.rank_snapshot IS DISTINCT FROM s.rank
          OR r.rank_code_snapshot IS DISTINCT FROM s.rank_code
          OR r.mfa_target_snapshot IS DISTINCT FROM s.mfa_target
          OR r.mfa_reward_snapshot IS DISTINCT FROM s.mfa_reward
          OR r.sponsor_id_snapshot IS DISTINCT FROM p.sponsor_id
          OR r.agent_status_snapshot IS DISTINCT FROM LOWER(COALESCE(p.status::TEXT, 'active'))
      );

    INSERT INTO public.audit_logs (
        type, action, reason, new_values, success
    )
    VALUES (
        'MFA_HISTORICAL_INTEGRITY_MIGRATION',
        'BACKFILL_STATUS_SNAPSHOTS_AND_ALIGN_DEC2026',
        format('Migration 20261127: open_backfilled=%s, hist_active=%s, hist_uncertain=%s, hist_locked=%s, dec_before=%s (empty=%s, nonempty=%s, diffs=%s), dec_refreshed=%s, dec_after=%s (diffs=%s)',
            v_open_backfilled_cnt, v_hist_known_active_cnt, v_hist_uncertain_cnt, v_hist_locked_cnt,
            v_dec_total_before, v_dec_empty_before, v_dec_nonempty_before, v_dec_diff_before,
            v_dec_refreshed_cnt, v_dec_total_after, v_dec_diff_after),
        jsonb_build_object(
            'current_ist_ym', v_now_ym,
            'open_status_backfilled', v_open_backfilled_cnt,
            'historical_known_active', v_hist_known_active_cnt,
            'historical_status_uncertain', v_hist_uncertain_cnt,
            'historical_records_locked', v_hist_locked_cnt,
            'dec_2026_before_total', v_dec_total_before,
            'dec_2026_before_empty', v_dec_empty_before,
            'dec_2026_before_nonempty', v_dec_nonempty_before,
            'dec_2026_before_snapshot_diffs', v_dec_diff_before,
            'dec_2026_refreshed_in_place', v_dec_refreshed_cnt,
            'dec_2026_after_total', v_dec_total_after,
            'dec_2026_after_snapshot_diffs', v_dec_diff_after,
            'dec_2026_sample_diffs', v_dec_sample_diffs
        ),
        true
    );

    RAISE NOTICE '20261127 Migration Summary -> IST_YM=%, open_backfilled=%, hist_active=%, hist_uncertain=%, hist_locked=%, dec_before=% (empty=%, nonempty=%, diffs=%), dec_refreshed=%, dec_after=% (diffs=%)',
        v_now_ym, v_open_backfilled_cnt, v_hist_known_active_cnt, v_hist_uncertain_cnt, v_hist_locked_cnt,
        v_dec_total_before, v_dec_empty_before, v_dec_nonempty_before, v_dec_diff_before,
        v_dec_refreshed_cnt, v_dec_total_after, v_dec_diff_after;

    PERFORM set_config('apex.allow_mfa_migration_backfill', '0', true);
END $$;

-- 5. Update ensure_agent_mfa_record with agent_status_snapshot + Lock + Future Snapshot Alignment
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
    v_prof_status TEXT;
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

    v_now_ym := public.get_ist_ym();
    v_rec_ym := (p_year * 100) + p_month;
    v_prof_status := LOWER(COALESCE(v_profile.status::TEXT, 'active'));

    SELECT *
    INTO v_existing_rec
    FROM public.agent_mfa_records
    WHERE agent_id = p_agent_id AND month = p_month AND year = p_year;

    IF v_existing_rec.id IS NOT NULL THEN
        -- Closed past months or explicitly locked rows remain strictly immutable.
        IF v_rec_ym < v_now_ym OR COALESCE(v_existing_rec.is_locked, false) THEN
            RETURN v_existing_rec.id;
        END IF;

        -- Untouched zero-activity future-month row: keep full snapshots aligned until month begins.
        IF v_rec_ym > v_now_ym
           AND COALESCE(v_existing_rec.raw_business_total, 0) = 0
           AND COALESCE(v_existing_rec.own_mfa_credit_generated, 0) = 0
           AND COALESCE(v_existing_rec.total_mfa_credit, 0) = 0
           AND COALESCE(v_existing_rec.contributions_count, 0) = 0 THEN
            SELECT * INTO v_slab FROM public.get_mfa_slab_for_rank(COALESCE(v_profile.rank, 1));
            UPDATE public.agent_mfa_records
            SET
                rank_snapshot = v_slab.rank,
                rank_code_snapshot = v_slab.rank_code,
                mfa_target_snapshot = v_slab.mfa_target,
                mfa_reward_snapshot = v_slab.mfa_reward,
                sponsor_id_snapshot = v_profile.sponsor_id,
                agent_status_snapshot = v_prof_status,
                status_snapshot_uncertain = false,
                status = CASE
                    WHEN COALESCE(v_slab.mfa_target, 0) <= 0 OR COALESCE(v_slab.mfa_reward, 0) <= 0 THEN 'not_applicable'
                    ELSE 'in_progress'
                END,
                updated_at = now()
            WHERE id = v_existing_rec.id
              AND (
                  rank_snapshot IS DISTINCT FROM v_slab.rank
                  OR mfa_target_snapshot IS DISTINCT FROM v_slab.mfa_target
                  OR mfa_reward_snapshot IS DISTINCT FROM v_slab.mfa_reward
                  OR sponsor_id_snapshot IS DISTINCT FROM v_profile.sponsor_id
                  OR agent_status_snapshot IS DISTINCT FROM v_prof_status
              );
            RETURN v_existing_rec.id;
        END IF;

        -- Open current month: keep rank/target/reward snapshots immutable;
        -- refresh sponsor_id_snapshot & agent_status_snapshot while unlocked.
        IF v_existing_rec.sponsor_id_snapshot IS DISTINCT FROM v_profile.sponsor_id
           OR v_existing_rec.agent_status_snapshot IS DISTINCT FROM v_prof_status
           OR v_existing_rec.status_snapshot_uncertain = true THEN
            UPDATE public.agent_mfa_records
            SET
                sponsor_id_snapshot = v_profile.sponsor_id,
                agent_status_snapshot = v_prof_status,
                status_snapshot_uncertain = false,
                updated_at = now()
            WHERE id = v_existing_rec.id;
        END IF;

        RETURN v_existing_rec.id;
    END IF;

    -- Do not auto-create records inside closed or locked historical periods
    IF public.is_mfa_period_closed_or_locked(p_month, p_year) THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_slab FROM public.get_mfa_slab_for_rank(COALESCE(v_profile.rank, 1));

    IF COALESCE(v_slab.mfa_target, 0) <= 0 OR COALESCE(v_slab.mfa_reward, 0) <= 0 THEN
        v_initial_status := 'not_applicable';
    ELSE
        v_initial_status := 'in_progress';
    END IF;

    INSERT INTO public.agent_mfa_records (
        agent_id, month, year,
        rank_snapshot, rank_code_snapshot,
        mfa_target_snapshot, mfa_reward_snapshot,
        sponsor_id_snapshot, agent_status_snapshot, status_snapshot_uncertain,
        status
    )
    VALUES (
        p_agent_id, p_month, p_year,
        v_slab.rank, v_slab.rank_code,
        v_slab.mfa_target, v_slab.mfa_reward,
        v_profile.sponsor_id, v_prof_status, false,
        v_initial_status
    )
    ON CONFLICT (agent_id, month, year) DO NOTHING;

    SELECT id INTO v_record_id
    FROM public.agent_mfa_records
    WHERE agent_id = p_agent_id AND month = p_month AND year = p_year;

    RETURN v_record_id;
END;
$$;

-- 6. Upgrade Core Cascading Recalculation Engine with Closed-Month Lock & Status Snapshot Enforcement
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
    v_locked_count INTEGER := 0;

    v_c RECORD;
    v_origin_prof RECORD;
    v_origin_rec RECORD;
    v_origin_rec_id UUID;
    v_origin_status TEXT;

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

    -- Serialize concurrent modifications per (year, month)
    PERFORM pg_advisory_xact_lock(91827364, (p_year * 100) + p_month);

    v_now_ym := public.get_ist_ym();
    v_rec_ym := (p_year * 100) + p_month;

    -- Seal any lingering unlocked historical rows & refuse recalculation for closed past months
    IF v_rec_ym < v_now_ym THEN
        UPDATE public.agent_mfa_records
        SET is_locked = true
        WHERE month = p_month
          AND year = p_year
          AND COALESCE(is_locked, false) = false;

        RETURN jsonb_build_object(
            'success', false,
            'locked', true,
            'read_only', true,
            'reason', 'closed_month_locked',
            'month', p_month,
            'year', p_year
        );
    END IF;

    -- Refuse recalculation if period is explicitly locked
    SELECT COUNT(*) FILTER (WHERE COALESCE(is_locked, false) = true)
    INTO v_locked_count
    FROM public.agent_mfa_records
    WHERE month = p_month AND year = p_year;

    IF v_locked_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'locked', true,
            'read_only', true,
            'reason', 'period_is_locked',
            'month', p_month,
            'year', p_year
        );
    END IF;

    PERFORM set_config('apex.in_mfa_cascade', '1', true);

    -- Sync open current/future month sponsor & agent status snapshots before traversal
    UPDATE public.agent_mfa_records r
    SET
        sponsor_id_snapshot = p.sponsor_id,
        agent_status_snapshot = LOWER(COALESCE(p.status::TEXT, 'active')),
        status_snapshot_uncertain = false
    FROM public.profiles p
    WHERE r.agent_id = p.id
      AND r.month = p_month
      AND r.year = p_year
      AND NOT COALESCE(r.is_locked, false)
      AND (
          r.sponsor_id_snapshot IS DISTINCT FROM p.sponsor_id
          OR r.agent_status_snapshot IS DISTINCT FROM LOWER(COALESCE(p.status::TEXT, 'active'))
          OR r.status_snapshot_uncertain = true
      );

    -- Clear prior period trace & issues safely inside locked transaction
    DELETE FROM public.agent_mfa_cascading_allocations
    WHERE month = p_month AND year = p_year;

    DELETE FROM public.mfa_hierarchy_issues
    WHERE month = p_month AND year = p_year;

    -- Reset all period accumulators cleanly while preserving rank/target/reward/sponsor/status snapshots
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

        -- Resolve snapshotted status strictly first
        v_origin_status := LOWER(COALESCE(
            v_origin_rec.agent_status_snapshot,
            v_origin_prof.status_txt,
            'active'
        ));

        -- Step 1: Originating Agent Self Allocation
        v_remaining := COALESCE(v_c.mfa_credit, 0);

        IF v_origin_rec.mfa_target_snapshot > 0
           AND v_origin_status = 'active' THEN
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

        v_curr_sponsor_id := v_origin_rec.sponsor_id_snapshot;

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
                'status', v_origin_status,
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

                IF v_curr_rec_id IS NOT NULL THEN
                    UPDATE public.agent_mfa_records
                    SET excess_unallocated_credit = excess_unallocated_credit + v_remaining
                    WHERE id = v_curr_rec_id;
                END IF;

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

                IF v_curr_rec_id IS NOT NULL THEN
                    UPDATE public.agent_mfa_records
                    SET excess_unallocated_credit = excess_unallocated_credit + v_remaining
                    WHERE id = v_curr_rec_id;
                END IF;

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

            -- Case D: Missing / Deleted Superior
            IF v_sup_prof.id IS NULL THEN
                v_issues_count := v_issues_count + 1;

                IF v_curr_rec_id IS NOT NULL THEN
                    UPDATE public.agent_mfa_records
                    SET excess_unallocated_credit = excess_unallocated_credit + v_remaining
                    WHERE id = v_curr_rec_id;
                END IF;

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

                IF v_curr_rec_id IS NOT NULL THEN
                    UPDATE public.agent_mfa_records
                    SET excess_unallocated_credit = excess_unallocated_credit + v_remaining
                    WHERE id = v_curr_rec_id;
                END IF;

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

            -- Prefer snapshotted status strictly over live profile status
            v_sup_status := LOWER(COALESCE(
                v_sup_rec.agent_status_snapshot,
                v_sup_prof.status_txt,
                'active'
            ));

            -- Case F: Non-active Superior (inactive / suspended / unknown) -> skip upward
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
                    v_sup_prof.id, v_sup_rec.sponsor_id_snapshot, v_issue_type, v_remaining,
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
                    v_sup_rec.sponsor_id_snapshot, v_path, v_batch_id
                );

                v_curr_id := v_sup_prof.id;
                v_curr_name := v_sup_prof.name;
                v_curr_code := v_sup_prof.sponsor_code;
                v_curr_rec_id := NULL;
                v_curr_sponsor_id := v_sup_rec.sponsor_id_snapshot;
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

            v_curr_sponsor_id := v_sup_rec.sponsor_id_snapshot;

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
                    'status', v_sup_status,
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
                    AND (a.new_values->>'policy_id') = i.policy_id::TEXT
              );
            GET DIAGNOSTICS v_audit_count = ROW_COUNT;
        EXCEPTION WHEN OTHERS THEN
            v_audit_count := 0;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'locked', false,
        'batch_id', v_batch_id,
        'month', p_month,
        'year', p_year,
        'policies_processed', v_policies_processed,
        'issues_detected', v_issues_count,
        'audit_logs_created', v_audit_count
    );
END;
$$;

-- 7. Enforce Closed-Month Lock inside sync_policy_mfa_contribution_ex & Delete Trigger
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
    v_old_locked BOOLEAN := false;
BEGIN
    SELECT * INTO v_old_contrib
    FROM public.agent_mfa_contributions
    WHERE policy_id = p_policy_id;

    v_old_locked := (
        v_old_contrib.id IS NOT NULL
        AND public.is_mfa_period_closed_or_locked(v_old_contrib.month, v_old_contrib.year)
    );

    SELECT * INTO v_pol
    FROM public.policies
    WHERE id = p_policy_id;

    -- Policy deleted or absent -> cleanup open contribution & recalculate cascade only if unlocked
    IF v_pol.id IS NULL THEN
        IF v_old_contrib.id IS NOT NULL AND NOT v_old_locked THEN
            DELETE FROM public.agent_mfa_contributions WHERE id = v_old_contrib.id;
            IF p_recalculate_cascade THEN
                PERFORM public.recalculate_cascading_mfa_month(v_old_contrib.month, v_old_contrib.year);
            END IF;
        END IF;
        RETURN;
    END IF;

    -- Policy status ineligible -> remove open contribution only if period unlocked
    IF LOWER(COALESCE(v_pol.status::TEXT, 'active')) NOT IN ('active', 'matured')
       OR v_pol.agent_id IS NULL THEN
        IF v_old_contrib.id IS NOT NULL AND NOT v_old_locked THEN
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
        IF v_old_contrib.id IS NOT NULL AND NOT v_old_locked THEN
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
        IF v_old_contrib.id IS NOT NULL AND NOT v_old_locked THEN
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
        IF v_old_contrib.id IS NOT NULL AND NOT v_old_locked THEN
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

    -- Never write or overwrite contributions inside a closed/locked historical month
    IF public.is_mfa_period_closed_or_locked(v_month, v_year) THEN
        RETURN;
    END IF;

    -- If the policy previously belonged to a now-locked period, do not move it out of that locked period
    IF v_old_locked THEN
        RETURN;
    END IF;

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
           AND NOT v_old_locked
           AND (v_old_contrib.month <> v_month OR v_old_contrib.year <> v_year) THEN
            PERFORM public.recalculate_cascading_mfa_month(v_old_contrib.month, v_old_contrib.year);
        END IF;
        PERFORM public.recalculate_cascading_mfa_month(v_month, v_year);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_contrib_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF current_setting('apex.in_mfa_cascade', true) <> '1'
       AND NOT public.is_mfa_period_closed_or_locked(OLD.month, OLD.year) THEN
        PERFORM public.recalculate_cascading_mfa_month(OLD.month, OLD.year);
    END IF;
    RETURN OLD;
END;
$$;

-- 8. Update Profile Trigger to Sync Status/Sponsor in Current Open Month & Align Empty Future Rows
CREATE OR REPLACE FUNCTION public.trg_profiles_cascade_mfa_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cur_m INTEGER := EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
    v_cur_y INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')::DATE)::INTEGER;
    v_now_ym INTEGER := (v_cur_y * 100) + v_cur_m;
    v_prof_status TEXT := LOWER(COALESCE(NEW.status::TEXT, 'active'));
    v_slab RECORD;
BEGIN
    -- Refresh untouched empty unlocked future rows on rank/sponsor/status changes
    IF (OLD.sponsor_id IS DISTINCT FROM NEW.sponsor_id)
       OR (OLD.status IS DISTINCT FROM NEW.status)
       OR (OLD.rank IS DISTINCT FROM NEW.rank) THEN
        SELECT * INTO v_slab FROM public.get_mfa_slab_for_rank(COALESCE(NEW.rank, 1));
        UPDATE public.agent_mfa_records
        SET
            rank_snapshot = v_slab.rank,
            rank_code_snapshot = v_slab.rank_code,
            mfa_target_snapshot = v_slab.mfa_target,
            mfa_reward_snapshot = v_slab.mfa_reward,
            sponsor_id_snapshot = NEW.sponsor_id,
            agent_status_snapshot = v_prof_status,
            status_snapshot_uncertain = false,
            status = CASE
                WHEN COALESCE(v_slab.mfa_target, 0) <= 0 OR COALESCE(v_slab.mfa_reward, 0) <= 0 THEN 'not_applicable'
                ELSE 'in_progress'
            END,
            updated_at = now()
        WHERE agent_id = NEW.id
          AND ((year * 100) + month) > v_now_ym
          AND NOT COALESCE(is_locked, false)
          AND COALESCE(raw_business_total, 0) = 0
          AND COALESCE(own_mfa_credit_generated, 0) = 0
          AND COALESCE(total_mfa_credit, 0) = 0
          AND COALESCE(contributions_count, 0) = 0;
    END IF;

    -- For open current month only: keep sponsor & status snapshot updated while unlocked,
    -- and recalculate cascades if contributions exist (rank/target/reward stay locked for current month).
    IF (OLD.sponsor_id IS DISTINCT FROM NEW.sponsor_id)
       OR (OLD.status IS DISTINCT FROM NEW.status) THEN
        UPDATE public.agent_mfa_records
        SET
            sponsor_id_snapshot = NEW.sponsor_id,
            agent_status_snapshot = v_prof_status,
            status_snapshot_uncertain = false,
            updated_at = now()
        WHERE agent_id = NEW.id
          AND month = v_cur_m
          AND year = v_cur_y
          AND NOT COALESCE(is_locked, false);

        IF NOT public.is_mfa_period_closed_or_locked(v_cur_m, v_cur_y)
           AND EXISTS (
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
AFTER UPDATE OF sponsor_id, status, rank ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_profiles_cascade_mfa_sync();

-- 9. Enforce Closed-Month Lock & Future-Month Pre-Creation Guard in sync_monthly_mfa_cycle
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
    v_now_ym INTEGER;
    v_rec_ym INTEGER;
    v_agent RECORD;
    v_pol RECORD;
    v_count INTEGER := 0;
    v_cascade_res JSONB;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_month IS NULL OR p_year IS NULL THEN
        RAISE EXCEPTION 'Valid month and year are required';
    END IF;

    v_now_ym := public.get_ist_ym();
    v_rec_ym := (p_year * 100) + p_month;

    -- Seal any lingering unlocked historical rows & refuse mutations on closed months
    IF v_rec_ym < v_now_ym THEN
        UPDATE public.agent_mfa_records
        SET is_locked = true
        WHERE month = p_month
          AND year = p_year
          AND COALESCE(is_locked, false) = false;

        RETURN jsonb_build_object(
            'success', false,
            'locked', true,
            'read_only', true,
            'reason', 'closed_month_locked',
            'month', p_month,
            'year', p_year,
            'records_synced', 0,
            'policies_processed', 0,
            'issues_detected', 0
        );
    END IF;

    -- Refuse mutations on explicitly locked periods
    IF public.is_mfa_period_closed_or_locked(p_month, p_year) THEN
        RETURN jsonb_build_object(
            'success', false,
            'locked', true,
            'read_only', true,
            'reason', 'period_is_locked',
            'month', p_month,
            'year', p_year,
            'records_synced', 0,
            'policies_processed', 0,
            'issues_detected', 0
        );
    END IF;

    -- Prevent premature bulk creation of empty records for future months (> current IST YYYYMM)
    IF v_rec_ym > v_now_ym THEN
        RETURN jsonb_build_object(
            'success', false,
            'future_period', true,
            'read_only', true,
            'reason', 'future_month_not_started',
            'month', p_month,
            'year', p_year,
            'records_synced', 0,
            'policies_processed', 0,
            'issues_detected', 0
        );
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
        'success', COALESCE((v_cascade_res->>'success')::BOOLEAN, true),
        'locked', COALESCE((v_cascade_res->>'locked')::BOOLEAN, false),
        'cascading_enabled', true,
        'month', p_month,
        'year', p_year,
        'records_synced', v_count,
        'policies_processed', COALESCE((v_cascade_res->>'policies_processed')::INTEGER, 0),
        'issues_detected', COALESCE((v_cascade_res->>'issues_detected')::INTEGER, 0)
    );
END;
$$;

-- 10. Function Execution Permissions
REVOKE ALL ON FUNCTION public.get_ist_ym() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ist_ym() TO authenticated;

REVOKE ALL ON FUNCTION public.is_mfa_period_closed_or_locked(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_mfa_period_closed_or_locked(INTEGER, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_agent_mfa_record(UUID, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_cascading_mfa_month(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_policy_mfa_contribution_ex(UUID, BOOLEAN) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_monthly_mfa_cycle(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_monthly_mfa_cycle(INTEGER, INTEGER) TO authenticated;
