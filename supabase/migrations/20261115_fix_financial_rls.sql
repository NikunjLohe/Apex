-- ============================================================================
-- APEX PERFORMANCE PORTAL — FIX FINANCIAL TABLES RLS POLICIES
-- Target Environment: Supabase Project (qiqjclgmetycxfjeozvm)
-- Description: Grants SELECT access on financial tables (commission_ledger,
-- payments, payouts, receipts) to authenticated users (admins & agents).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Commission Ledger SELECT Policy
-- ----------------------------------------------------------------------------
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comm_ledger_select_policy" ON public.commission_ledger;
DROP POLICY IF EXISTS "comm_ledger_admin_select" ON public.commission_ledger;
DROP POLICY IF EXISTS "comm_ledger_agent_select" ON public.commission_ledger;

CREATE POLICY "comm_ledger_select_policy" ON public.commission_ledger
FOR SELECT
TO authenticated
USING (
    public.is_admin() OR 
    public.is_super_admin() OR 
    agent_id = auth.uid()
);

-- ----------------------------------------------------------------------------
-- 2. Payments SELECT Policy
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_policy" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_select" ON public.payments;
DROP POLICY IF EXISTS "payments_agent_select" ON public.payments;

CREATE POLICY "payments_select_policy" ON public.payments
FOR SELECT
TO authenticated
USING (
    public.is_admin() OR 
    public.is_super_admin() OR 
    agent_id = auth.uid() OR 
    agent_id IN (SELECT id FROM public.get_downline(auth.uid()))
);

-- ----------------------------------------------------------------------------
-- 3. Payouts SELECT Policy
-- ----------------------------------------------------------------------------
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payouts_select_policy" ON public.payouts;
DROP POLICY IF EXISTS "payouts_admin_select" ON public.payouts;
DROP POLICY IF EXISTS "payouts_agent_select" ON public.payouts;

CREATE POLICY "payouts_select_policy" ON public.payouts
FOR SELECT
TO authenticated
USING (
    public.is_admin() OR 
    public.is_super_admin() OR 
    agent_id = auth.uid()
);

-- ----------------------------------------------------------------------------
-- 4. Receipts SELECT Policy
-- ----------------------------------------------------------------------------
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipts_select_policy" ON public.receipts;
DROP POLICY IF EXISTS "receipts_admin_select" ON public.receipts;
DROP POLICY IF EXISTS "receipts_agent_select" ON public.receipts;

CREATE POLICY "receipts_select_policy" ON public.receipts
FOR SELECT
TO authenticated
USING (
    public.is_admin() OR 
    public.is_super_admin() OR 
    customer_id IN (
        SELECT id FROM public.customers 
        WHERE enrolled_by = auth.uid() OR enrolled_by IN (SELECT id FROM public.get_downline(auth.uid()))
    )
);

COMMIT;
