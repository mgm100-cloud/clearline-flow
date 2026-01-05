-- ============================================================================
-- CLEARLINE CRM - CLIENT DATA & REPORTS SCHEMA
-- Tables: client_data_capital, client_data_subs, client_data_reds, report_row_orders
-- ============================================================================

-- ============================================================================
-- CLIENT DATA - CAPITAL (Current capital by month)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_data_capital (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    
    -- Data
    date DATE NOT NULL,
    current_capital NUMERIC NOT NULL,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(firm_id, date)
);

-- ============================================================================
-- CLIENT DATA - SUBSCRIPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_data_subs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    
    -- Data
    date_submitted DATE,
    date_subscribed DATE NOT NULL,
    capital NUMERIC NOT NULL,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CLIENT DATA - REDEMPTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_data_reds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    
    -- Data
    date_submitted DATE,
    date_redeemed DATE NOT NULL,
    capital NUMERIC NOT NULL,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- REPORT ROW ORDERS (Per-user custom ordering in reports)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.report_row_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id TEXT NOT NULL, -- e.g., 'pipeline', 'active_diligence'
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    order_rank INTEGER NOT NULL,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(report_id, user_id, firm_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Client data capital
CREATE INDEX IF NOT EXISTS idx_client_data_capital_firm_id ON public.client_data_capital(firm_id);
CREATE INDEX IF NOT EXISTS idx_client_data_capital_date ON public.client_data_capital(date);
CREATE INDEX IF NOT EXISTS idx_client_data_capital_firm_date ON public.client_data_capital(firm_id, date);

-- Client data subs
CREATE INDEX IF NOT EXISTS idx_client_data_subs_firm_id ON public.client_data_subs(firm_id);
CREATE INDEX IF NOT EXISTS idx_client_data_subs_date_subscribed ON public.client_data_subs(date_subscribed);
CREATE INDEX IF NOT EXISTS idx_client_data_subs_firm_date ON public.client_data_subs(firm_id, date_subscribed);

-- Client data reds
CREATE INDEX IF NOT EXISTS idx_client_data_reds_firm_id ON public.client_data_reds(firm_id);
CREATE INDEX IF NOT EXISTS idx_client_data_reds_date_redeemed ON public.client_data_reds(date_redeemed);
CREATE INDEX IF NOT EXISTS idx_client_data_reds_firm_date ON public.client_data_reds(firm_id, date_redeemed);

-- Report row orders
CREATE INDEX IF NOT EXISTS idx_report_row_orders_report_user ON public.report_row_orders(report_id, user_id);
CREATE INDEX IF NOT EXISTS idx_report_row_orders_firm_id ON public.report_row_orders(firm_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS update_client_data_capital_updated_at ON public.client_data_capital;
CREATE TRIGGER update_client_data_capital_updated_at
    BEFORE UPDATE ON public.client_data_capital
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_data_subs_updated_at ON public.client_data_subs;
CREATE TRIGGER update_client_data_subs_updated_at
    BEFORE UPDATE ON public.client_data_subs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_data_reds_updated_at ON public.client_data_reds;
CREATE TRIGGER update_client_data_reds_updated_at
    BEFORE UPDATE ON public.client_data_reds
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_report_row_orders_updated_at ON public.report_row_orders;
CREATE TRIGGER update_report_row_orders_updated_at
    BEFORE UPDATE ON public.report_row_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.client_data_capital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_data_subs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_data_reds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_row_orders ENABLE ROW LEVEL SECURITY;

-- Client data capital policies
CREATE POLICY "CRM users can view client_data_capital" ON public.client_data_capital
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can insert client_data_capital" ON public.client_data_capital
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can update client_data_capital" ON public.client_data_capital
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can delete client_data_capital" ON public.client_data_capital
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Client data subs policies
CREATE POLICY "CRM users can view client_data_subs" ON public.client_data_subs
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can insert client_data_subs" ON public.client_data_subs
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can update client_data_subs" ON public.client_data_subs
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can delete client_data_subs" ON public.client_data_subs
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Client data reds policies
CREATE POLICY "CRM users can view client_data_reds" ON public.client_data_reds
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can insert client_data_reds" ON public.client_data_reds
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can update client_data_reds" ON public.client_data_reds
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can delete client_data_reds" ON public.client_data_reds
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Report row orders policies (users can only manage their own orders)
CREATE POLICY "Users can view own report_row_orders" ON public.report_row_orders
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        user_id = auth.uid()
    );

CREATE POLICY "Users can insert own report_row_orders" ON public.report_row_orders
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        user_id = auth.uid()
    );

CREATE POLICY "Users can update own report_row_orders" ON public.report_row_orders
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        user_id = auth.uid()
    );

CREATE POLICY "Users can delete own report_row_orders" ON public.report_row_orders
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        user_id = auth.uid()
    );

-- ============================================================================
-- HELPER FUNCTIONS FOR CLIENT DATA CALCULATIONS
-- ============================================================================

-- Function to calculate total invested for a firm
CREATE OR REPLACE FUNCTION public.get_firm_total_invested(p_firm_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    total NUMERIC;
BEGIN
    SELECT COALESCE(SUM(capital), 0) INTO total
    FROM public.client_data_subs
    WHERE firm_id = p_firm_id;
    
    RETURN total;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_firm_total_invested(UUID) TO authenticated;

-- Function to calculate total redeemed for a firm
CREATE OR REPLACE FUNCTION public.get_firm_total_redeemed(p_firm_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    total NUMERIC;
BEGIN
    SELECT COALESCE(SUM(capital), 0) INTO total
    FROM public.client_data_reds
    WHERE firm_id = p_firm_id;
    
    RETURN total;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_firm_total_redeemed(UUID) TO authenticated;

-- Function to calculate net invested for a firm
CREATE OR REPLACE FUNCTION public.get_firm_net_invested(p_firm_id UUID)
RETURNS NUMERIC AS $$
BEGIN
    RETURN public.get_firm_total_invested(p_firm_id) - public.get_firm_total_redeemed(p_firm_id);
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_firm_net_invested(UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.client_data_capital IS 'Monthly current capital data for client firms';
COMMENT ON TABLE public.client_data_subs IS 'Subscription (investment) transactions for client firms';
COMMENT ON TABLE public.client_data_reds IS 'Redemption transactions for client firms';
COMMENT ON TABLE public.report_row_orders IS 'User-specific custom ordering for report rows (drag-drop persistence)';
COMMENT ON FUNCTION public.get_firm_total_invested IS 'Calculate total invested capital for a firm';
COMMENT ON FUNCTION public.get_firm_total_redeemed IS 'Calculate total redeemed capital for a firm';
COMMENT ON FUNCTION public.get_firm_net_invested IS 'Calculate net invested capital (invested - redeemed) for a firm';

