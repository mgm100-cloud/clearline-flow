-- ============================================================================
-- CLEARLINE CRM - CSV IMPORT SCHEMA
-- Tables: staging tables, crosswalk tables, import logs
-- ============================================================================

-- ============================================================================
-- STAGING TABLES (for CSV import)
-- ============================================================================

-- Staging table for Account CSV
CREATE TABLE IF NOT EXISTS public.staging_accounts (
    id BIGSERIAL PRIMARY KEY,
    
    -- Raw CSV columns (all TEXT to handle any format)
    sf_id TEXT,
    name TEXT,
    type TEXT,
    billing_street TEXT,
    billing_city TEXT,
    billing_state TEXT,
    billing_country TEXT,
    billing_postal_code TEXT,
    phone TEXT,
    website TEXT,
    description TEXT,
    firm_background TEXT,
    investment_notes TEXT,
    brief_overview TEXT,
    created_date TEXT,
    last_modified_date TEXT,
    last_activity_date TEXT,
    aum TEXT,
    tier TEXT,
    investment_size TEXT,
    number_of_hf_investments TEXT,
    category TEXT,
    pb_introduction TEXT,
    consultant TEXT,
    third_party_marketer TEXT,
    focus_list TEXT,
    probability_of_investment TEXT,
    pm_meeting TEXT,
    
    -- Processing metadata
    row_number INTEGER,
    processed BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staging table for Contact CSV
CREATE TABLE IF NOT EXISTS public.staging_contacts (
    id BIGSERIAL PRIMARY KEY,
    
    -- Raw CSV columns (all TEXT)
    sf_id TEXT,
    account_id TEXT, -- Salesforce Account ID (will be resolved via crosswalk)
    salutation TEXT,
    first_name TEXT,
    last_name TEXT,
    mailing_street TEXT,
    mailing_city TEXT,
    mailing_state TEXT,
    mailing_postal_code TEXT,
    mailing_country TEXT,
    phone TEXT,
    mobile_phone TEXT,
    email TEXT,
    assistant_name TEXT,
    assistant_phone TEXT,
    reports_to_id TEXT, -- Salesforce Contact ID (will be resolved via crosswalk)
    title TEXT,
    lead_source TEXT,
    description TEXT,
    background TEXT,
    created_date TEXT,
    last_modified_date TEXT,
    last_activity_date TEXT,
    clearline_distribution_list TEXT,
    key_contact TEXT,
    onshore_offshore TEXT,
    
    -- Processing metadata
    row_number INTEGER,
    processed BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staging table for Task CSV
CREATE TABLE IF NOT EXISTS public.staging_tasks (
    id BIGSERIAL PRIMARY KEY,
    
    -- Raw CSV columns (all TEXT)
    sf_id TEXT,
    account_id TEXT, -- Salesforce Account ID
    who_id TEXT, -- Salesforce Contact/Lead ID
    what_id TEXT, -- Salesforce Account/Opportunity ID
    subject TEXT,
    activity_date TEXT,
    description TEXT,
    summary TEXT,
    created_date TEXT,
    last_modified_date TEXT,
    
    -- Processing metadata
    row_number INTEGER,
    processed BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CROSSWALK TABLES (map Salesforce IDs to internal UUIDs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.x_sf_account (
    sf_id TEXT PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.x_sf_contact (
    sf_id TEXT PRIMARY KEY,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.x_sf_task (
    sf_id TEXT PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- IMPORT LOGS (track import runs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.import_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_type TEXT NOT NULL CHECK (import_type IN ('accounts', 'contacts', 'tasks')),
    started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial')),
    
    -- Statistics
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    successful_rows INTEGER DEFAULT 0,
    failed_rows INTEGER DEFAULT 0,
    
    -- Error summary
    error_summary TEXT,
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Staging accounts
CREATE INDEX IF NOT EXISTS idx_staging_accounts_sf_id ON public.staging_accounts(sf_id);
CREATE INDEX IF NOT EXISTS idx_staging_accounts_processed ON public.staging_accounts(processed);

-- Staging contacts
CREATE INDEX IF NOT EXISTS idx_staging_contacts_sf_id ON public.staging_contacts(sf_id);
CREATE INDEX IF NOT EXISTS idx_staging_contacts_account_id ON public.staging_contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_staging_contacts_processed ON public.staging_contacts(processed);

-- Staging tasks
CREATE INDEX IF NOT EXISTS idx_staging_tasks_sf_id ON public.staging_tasks(sf_id);
CREATE INDEX IF NOT EXISTS idx_staging_tasks_account_id ON public.staging_tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_staging_tasks_processed ON public.staging_tasks(processed);

-- Crosswalk tables
CREATE INDEX IF NOT EXISTS idx_x_sf_account_account_id ON public.x_sf_account(account_id);
CREATE INDEX IF NOT EXISTS idx_x_sf_contact_contact_id ON public.x_sf_contact(contact_id);
CREATE INDEX IF NOT EXISTS idx_x_sf_task_task_id ON public.x_sf_task(task_id);

-- Import logs
CREATE INDEX IF NOT EXISTS idx_import_logs_import_type ON public.import_logs(import_type);
CREATE INDEX IF NOT EXISTS idx_import_logs_started_at ON public.import_logs(started_at DESC);

-- ============================================================================
-- HELPER FUNCTIONS FOR BOOLEAN NORMALIZATION
-- ============================================================================

-- Function to normalize boolean values from CSV
CREATE OR REPLACE FUNCTION public.normalize_boolean(value TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF value IS NULL OR TRIM(value) = '' THEN
        RETURN NULL;
    END IF;
    
    -- Normalize to lowercase and trim
    value = LOWER(TRIM(value));
    
    -- Check for true values
    IF value IN ('true', 'yes', 'y', '1', 't') THEN
        RETURN TRUE;
    END IF;
    
    -- Check for false values
    IF value IN ('false', 'no', 'n', '0', 'f') THEN
        RETURN FALSE;
    END IF;
    
    -- Invalid value
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION public.normalize_boolean(TEXT) TO authenticated;

-- Function to parse numeric values from CSV
CREATE OR REPLACE FUNCTION public.parse_numeric(value TEXT)
RETURNS NUMERIC AS $$
BEGIN
    IF value IS NULL OR TRIM(value) = '' THEN
        RETURN NULL;
    END IF;
    
    -- Remove common formatting characters
    value = REPLACE(REPLACE(REPLACE(TRIM(value), ',', ''), '$', ''), '%', '');
    
    -- Try to cast to numeric
    BEGIN
        RETURN value::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION public.parse_numeric(TEXT) TO authenticated;

-- Function to parse date values from CSV
CREATE OR REPLACE FUNCTION public.parse_date(value TEXT)
RETURNS DATE AS $$
BEGIN
    IF value IS NULL OR TRIM(value) = '' THEN
        RETURN NULL;
    END IF;
    
    -- Try to cast to date
    BEGIN
        RETURN value::DATE;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION public.parse_date(TEXT) TO authenticated;

-- Function to merge text fields (skip empty values)
CREATE OR REPLACE FUNCTION public.merge_text_fields(VARIADIC fields TEXT[])
RETURNS TEXT AS $$
DECLARE
    result TEXT := '';
    field TEXT;
    first BOOLEAN := TRUE;
BEGIN
    FOREACH field IN ARRAY fields
    LOOP
        IF field IS NOT NULL AND TRIM(field) != '' THEN
            IF first THEN
                result = field;
                first = FALSE;
            ELSE
                result = result || E'\n\n---\n' || field;
            END IF;
        END IF;
    END LOOP;
    
    IF result = '' THEN
        RETURN NULL;
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION public.merge_text_fields(VARIADIC TEXT[]) TO authenticated;

-- Function to parse investment size range (e.g., "5M-10M" or "5000000-10000000")
CREATE OR REPLACE FUNCTION public.parse_investment_size_range(value TEXT, OUT min_value NUMERIC, OUT max_value NUMERIC)
AS $$
DECLARE
    parts TEXT[];
    clean_value TEXT;
BEGIN
    IF value IS NULL OR TRIM(value) = '' THEN
        min_value = NULL;
        max_value = NULL;
        RETURN;
    END IF;
    
    -- Clean the value
    clean_value = UPPER(TRIM(value));
    clean_value = REPLACE(REPLACE(REPLACE(clean_value, ',', ''), '$', ''), ' ', '');
    
    -- Check if it contains a range separator
    IF clean_value LIKE '%-%' OR clean_value LIKE '%TO%' THEN
        -- Split by separator
        IF clean_value LIKE '%-%' THEN
            parts = STRING_TO_ARRAY(clean_value, '-');
        ELSE
            parts = STRING_TO_ARRAY(clean_value, 'TO');
        END IF;
        
        IF ARRAY_LENGTH(parts, 1) = 2 THEN
            -- Parse min
            parts[1] = REPLACE(parts[1], 'M', '000000');
            parts[1] = REPLACE(parts[1], 'K', '000');
            min_value = public.parse_numeric(parts[1]);
            
            -- Parse max
            parts[2] = REPLACE(parts[2], 'M', '000000');
            parts[2] = REPLACE(parts[2], 'K', '000');
            max_value = public.parse_numeric(parts[2]);
        END IF;
    ELSE
        -- Single value - use as both min and max
        clean_value = REPLACE(clean_value, 'M', '000000');
        clean_value = REPLACE(clean_value, 'K', '000');
        min_value = public.parse_numeric(clean_value);
        max_value = min_value;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION public.parse_investment_size_range(TEXT, OUT NUMERIC, OUT NUMERIC) TO authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.staging_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_sf_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_sf_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_sf_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

-- Staging tables - CRM users can manage
CREATE POLICY "CRM users can manage staging_accounts" ON public.staging_accounts
    FOR ALL USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can manage staging_contacts" ON public.staging_contacts
    FOR ALL USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can manage staging_tasks" ON public.staging_tasks
    FOR ALL USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Crosswalk tables - CRM users can view
CREATE POLICY "CRM users can view x_sf_account" ON public.x_sf_account
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can view x_sf_contact" ON public.x_sf_contact
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can view x_sf_task" ON public.x_sf_task
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Service role can manage crosswalk tables (for import functions)
CREATE POLICY "Service role can manage x_sf_account" ON public.x_sf_account
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage x_sf_contact" ON public.x_sf_contact
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage x_sf_task" ON public.x_sf_task
    FOR ALL USING (auth.role() = 'service_role');

-- Import logs - CRM users can view
CREATE POLICY "CRM users can view import_logs" ON public.import_logs
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "Service role can manage import_logs" ON public.import_logs
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.staging_accounts IS 'Staging table for Account CSV imports';
COMMENT ON TABLE public.staging_contacts IS 'Staging table for Contact CSV imports';
COMMENT ON TABLE public.staging_tasks IS 'Staging table for Task CSV imports';
COMMENT ON TABLE public.x_sf_account IS 'Crosswalk table mapping Salesforce Account IDs to internal UUIDs';
COMMENT ON TABLE public.x_sf_contact IS 'Crosswalk table mapping Salesforce Contact IDs to internal UUIDs';
COMMENT ON TABLE public.x_sf_task IS 'Crosswalk table mapping Salesforce Task IDs to internal UUIDs';
COMMENT ON TABLE public.import_logs IS 'Log of CSV import runs with statistics';
COMMENT ON FUNCTION public.normalize_boolean IS 'Normalize boolean values from CSV (true/false, yes/no, y/n, 1/0)';
COMMENT ON FUNCTION public.parse_numeric IS 'Parse numeric values from CSV, handling common formatting';
COMMENT ON FUNCTION public.parse_date IS 'Parse date values from CSV';
COMMENT ON FUNCTION public.merge_text_fields IS 'Merge multiple text fields with separator, skipping empty values';
COMMENT ON FUNCTION public.parse_investment_size_range IS 'Parse investment size range from CSV (e.g., "5M-10M")';

