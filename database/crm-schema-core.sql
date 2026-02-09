-- ============================================================================
-- CLEARLINE CRM - CORE SCHEMA
-- Tables: accounts, contacts, tasks, task_participants
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for tri-gram search indexes

-- ============================================================================
-- ACCOUNTS TABLE (Firms)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.accounts (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sf_ext_id TEXT UNIQUE, -- Salesforce external ID
    
    -- Core firm information
    firm_name TEXT NOT NULL,
    type TEXT CHECK (type IN (
        'Fund of Funds',
        'Wealth Manager',
        'Pension – Public',
        'Family Office',
        'Multi Family Office',
        'Endowment',
        'Pension – Corporate',
        'Private Bank',
        'Consultant',
        'Outsourced CIO',
        'High Net Worth',
        'Foundation',
        'Bank',
        'Prime Broker',
        'Employee',
        'Sovereign Wealth Fund',
        'Insurance Company'
    )),
    
    -- Address information
    address TEXT, -- BillingStreet
    city TEXT, -- BillingCity
    state TEXT, -- BillingState
    country TEXT, -- BillingCountry
    zip_code TEXT, -- BillingPostalCode
    
    -- Contact information
    phone_number TEXT,
    website TEXT,
    
    -- Description (merged from multiple SF fields)
    description TEXT,
    
    -- Salesforce dates
    created_date DATE,
    updated_date DATE,
    last_activity DATE,
    
    -- Financial & investment information
    aum NUMERIC,
    tier TEXT,
    investment_size_min NUMERIC,
    investment_size_max NUMERIC,
    hf_investments INTEGER,
    category TEXT,
    
    -- Relationship information
    pb_introduction TEXT,
    consultant TEXT,
    third_party_marketer TEXT,
    focus_list BOOLEAN,
    probability_of_investment NUMERIC,
    pm_meeting BOOLEAN,
    
    -- Manual/editable fields (start NULL)
    status_summary TEXT,
    status TEXT CHECK (status IN (
        '1 Investor',
        '2 Active Diligence',
        '3 Potential Investor in 6 Months',
        '4 High Focus',
        '5 Low Focus',
        '6 Dormant'
    )),
    high_quality BOOLEAN,
    structure_issues TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- CONTACTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contacts (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sf_ext_id TEXT UNIQUE, -- Salesforce external ID
    
    -- Account relationship
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
    
    -- Personal information
    salutation TEXT,
    first_name TEXT,
    last_name TEXT,
    
    -- Address information
    mailing_street TEXT,
    mailing_city TEXT,
    mailing_state TEXT,
    mailing_postal_code TEXT,
    mailing_country TEXT,
    
    -- Contact information
    phone TEXT,
    mobile_phone TEXT,
    email TEXT,
    
    -- Assistant information
    assistant_name TEXT,
    assistant_phone TEXT,
    
    -- Hierarchy
    reports_to_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    
    -- Professional information
    title TEXT,
    lead_source TEXT,
    description TEXT, -- merged from Description + Background__c
    
    -- Salesforce dates
    created_date DATE,
    updated_date DATE,
    last_activity DATE,
    
    -- Clearline-specific fields
    distribution_list BOOLEAN DEFAULT FALSE,
    main_contact BOOLEAN DEFAULT FALSE,
    which_fund TEXT CHECK (which_fund IN ('Onshore', 'Offshore', 'TBD')),
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- TASKS TABLE (Interactions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tasks (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sf_ext_id TEXT UNIQUE, -- Salesforce external ID
    
    -- Relationships
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    
    -- Task information
    subject TEXT,
    activity_date DATE,
    description TEXT,
    extra_info TEXT, -- Summary__c from Salesforce
    
    -- Interaction type
    interaction_type TEXT CHECK (interaction_type IN (
        'SentEmail',
        'ReceivedEmail',
        'OutgoingCall',
        'ConnectedCall',
        'VideoCall',
        'InPersonOffice',
        'InPersonVisit',
        'ConferenceMeeting',
        'UpdatedInfo'
    )),
    
    -- Salesforce dates
    created_date DATE,
    updated_date DATE,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- TASK PARTICIPANTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    
    -- Participant information
    side TEXT NOT NULL CHECK (side IN ('client', 'clearline')),
    name TEXT,
    email TEXT,
    is_pm BOOLEAN DEFAULT FALSE,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Accounts indexes
CREATE INDEX IF NOT EXISTS idx_accounts_firm_name_lower ON public.accounts(LOWER(firm_name));
CREATE INDEX IF NOT EXISTS idx_accounts_status ON public.accounts(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_last_activity ON public.accounts(last_activity) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_sf_ext_id ON public.accounts(sf_ext_id);
CREATE INDEX IF NOT EXISTS idx_accounts_deleted_at ON public.accounts(deleted_at);

-- Full-text search on accounts
CREATE INDEX IF NOT EXISTS idx_accounts_fulltext ON public.accounts 
    USING GIN (to_tsvector('english', COALESCE(firm_name, '') || ' ' || COALESCE(website, '') || ' ' || COALESCE(description, '')));

-- Tri-gram search on firm_name for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_accounts_firm_name_trgm ON public.accounts USING GIN (firm_name gin_trgm_ops);

-- Contacts indexes
CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON public.contacts(account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_last_name_lower ON public.contacts(LOWER(last_name));
CREATE INDEX IF NOT EXISTS idx_contacts_first_name_lower ON public.contacts(LOWER(first_name));
CREATE INDEX IF NOT EXISTS idx_contacts_email_lower ON public.contacts(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_contacts_sf_ext_id ON public.contacts(sf_ext_id);
CREATE INDEX IF NOT EXISTS idx_contacts_reports_to ON public.contacts(reports_to_contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_deleted_at ON public.contacts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_contacts_distribution_list ON public.contacts(distribution_list) WHERE distribution_list = TRUE AND deleted_at IS NULL;

-- Tri-gram search on contacts
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON public.contacts USING GIN ((COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) gin_trgm_ops);

-- Tasks indexes
CREATE INDEX IF NOT EXISTS idx_tasks_account_id ON public.tasks(account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON public.tasks(contact_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_activity_date ON public.tasks(activity_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_interaction_type ON public.tasks(interaction_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_sf_ext_id ON public.tasks(sf_ext_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON public.tasks(deleted_at);

-- Task participants indexes
CREATE INDEX IF NOT EXISTS idx_task_participants_task_id ON public.task_participants(task_id);
CREATE INDEX IF NOT EXISTS idx_task_participants_contact_id ON public.task_participants(contact_id);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Accounts trigger
DROP TRIGGER IF EXISTS update_accounts_updated_at ON public.accounts;
CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON public.accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Contacts trigger
DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON public.contacts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Tasks trigger
DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Task participants trigger
DROP TRIGGER IF EXISTS update_task_participants_updated_at ON public.task_participants;
CREATE TRIGGER update_task_participants_updated_at
    BEFORE UPDATE ON public.task_participants
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_participants ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has CRM access (Marketing or Super division)
CREATE OR REPLACE FUNCTION public.has_crm_access()
RETURNS BOOLEAN AS $$
DECLARE
    user_division TEXT;
BEGIN
    SELECT division INTO user_division
    FROM public.user_profiles
    WHERE id = auth.uid();
    
    RETURN user_division IN ('Marketing', 'Super');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.has_crm_access() TO authenticated;

-- Accounts policies
CREATE POLICY "CRM users can view accounts" ON public.accounts
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access() AND 
        deleted_at IS NULL
    );

CREATE POLICY "CRM users can insert accounts" ON public.accounts
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can update accounts" ON public.accounts
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access() AND 
        deleted_at IS NULL
    );

CREATE POLICY "CRM users can delete accounts" ON public.accounts
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Contacts policies
CREATE POLICY "CRM users can view contacts" ON public.contacts
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access() AND 
        deleted_at IS NULL
    );

CREATE POLICY "CRM users can insert contacts" ON public.contacts
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can update contacts" ON public.contacts
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access() AND 
        deleted_at IS NULL
    );

CREATE POLICY "CRM users can delete contacts" ON public.contacts
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Tasks policies
CREATE POLICY "CRM users can view tasks" ON public.tasks
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access() AND 
        deleted_at IS NULL
    );

CREATE POLICY "CRM users can insert tasks" ON public.tasks
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can update tasks" ON public.tasks
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access() AND 
        deleted_at IS NULL
    );

CREATE POLICY "CRM users can delete tasks" ON public.tasks
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Task participants policies
CREATE POLICY "CRM users can view task_participants" ON public.task_participants
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can insert task_participants" ON public.task_participants
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can update task_participants" ON public.task_participants
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can delete task_participants" ON public.task_participants
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.accounts IS 'CRM accounts (firms) - visible to Marketing and Super divisions only';
COMMENT ON TABLE public.contacts IS 'CRM contacts linked to accounts - visible to Marketing and Super divisions only';
COMMENT ON TABLE public.tasks IS 'CRM tasks/interactions - visible to Marketing and Super divisions only';
COMMENT ON TABLE public.task_participants IS 'Participants in CRM tasks/interactions';
COMMENT ON FUNCTION public.has_crm_access IS 'Check if current user has access to CRM (Marketing or Super division)';

