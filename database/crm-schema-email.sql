-- ============================================================================
-- CLEARLINE CRM - EMAIL & DISTRIBUTION SCHEMA
-- Tables: distribution_lists, email_outbound, email_events
-- ============================================================================

-- ============================================================================
-- DISTRIBUTION LISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.distribution_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.distribution_list_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    list_id UUID NOT NULL REFERENCES public.distribution_lists(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(list_id, contact_id)
);

-- ============================================================================
-- OUTBOUND EMAIL (User-composed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_outbound (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Email content
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    storage_path TEXT, -- Path to attachments in Supabase Storage
    
    -- Sending information
    sent_via TEXT CHECK (sent_via IN ('graph', 'resend')),
    sent_at TIMESTAMPTZ,
    
    -- External IDs for tracking
    outlook_message_id TEXT, -- Microsoft Graph message ID
    internet_message_id TEXT, -- Internet Message-ID header
    
    -- Related CRM records
    related_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    related_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_outbound_recipients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_outbound_id UUID NOT NULL REFERENCES public.email_outbound(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    
    -- Recipient information
    address TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('to', 'cc', 'bcc')),
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- EMAIL ENGAGEMENT EVENTS (for Resend webhooks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_outbound_id UUID NOT NULL REFERENCES public.email_outbound(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES public.email_outbound_recipients(id) ON DELETE SET NULL,
    
    -- Event information
    type TEXT NOT NULL CHECK (type IN ('opened', 'clicked', 'delivered', 'bounced', 'complained')),
    occurred_at TIMESTAMPTZ NOT NULL,
    meta_json JSONB, -- Additional metadata from webhook
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Distribution lists
CREATE INDEX IF NOT EXISTS idx_distribution_lists_created_by ON public.distribution_lists(created_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_distribution_lists_deleted_at ON public.distribution_lists(deleted_at);

-- Distribution list members
CREATE INDEX IF NOT EXISTS idx_distribution_list_members_list_id ON public.distribution_list_members(list_id);
CREATE INDEX IF NOT EXISTS idx_distribution_list_members_contact_id ON public.distribution_list_members(contact_id);

-- Email outbound
CREATE INDEX IF NOT EXISTS idx_email_outbound_created_by ON public.email_outbound(created_by);
CREATE INDEX IF NOT EXISTS idx_email_outbound_sent_at ON public.email_outbound(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_outbound_related_account ON public.email_outbound(related_account_id);
CREATE INDEX IF NOT EXISTS idx_email_outbound_related_contact ON public.email_outbound(related_contact_id);
CREATE INDEX IF NOT EXISTS idx_email_outbound_internet_message_id ON public.email_outbound(internet_message_id);

-- Email outbound recipients
CREATE INDEX IF NOT EXISTS idx_email_outbound_recipients_email_id ON public.email_outbound_recipients(email_outbound_id);
CREATE INDEX IF NOT EXISTS idx_email_outbound_recipients_contact_id ON public.email_outbound_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_outbound_recipients_address ON public.email_outbound_recipients(LOWER(address));

-- Email events
CREATE INDEX IF NOT EXISTS idx_email_events_email_outbound_id ON public.email_events(email_outbound_id);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient_id ON public.email_events(recipient_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON public.email_events(type);
CREATE INDEX IF NOT EXISTS idx_email_events_occurred_at ON public.email_events(occurred_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS update_distribution_lists_updated_at ON public.distribution_lists;
CREATE TRIGGER update_distribution_lists_updated_at
    BEFORE UPDATE ON public.distribution_lists
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_outbound_updated_at ON public.email_outbound;
CREATE TRIGGER update_email_outbound_updated_at
    BEFORE UPDATE ON public.email_outbound
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.distribution_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbound_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- Distribution lists policies
CREATE POLICY "CRM users can view distribution_lists" ON public.distribution_lists
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access() AND 
        deleted_at IS NULL
    );

CREATE POLICY "CRM users can insert distribution_lists" ON public.distribution_lists
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can update distribution_lists" ON public.distribution_lists
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access() AND 
        deleted_at IS NULL
    );

CREATE POLICY "CRM users can delete distribution_lists" ON public.distribution_lists
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Distribution list members policies
CREATE POLICY "CRM users can view distribution_list_members" ON public.distribution_list_members
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can insert distribution_list_members" ON public.distribution_list_members
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can delete distribution_list_members" ON public.distribution_list_members
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Email outbound policies
CREATE POLICY "CRM users can view email_outbound" ON public.email_outbound
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can insert email_outbound" ON public.email_outbound
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can update email_outbound" ON public.email_outbound
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Email outbound recipients policies
CREATE POLICY "CRM users can view email_outbound_recipients" ON public.email_outbound_recipients
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "CRM users can insert email_outbound_recipients" ON public.email_outbound_recipients
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Email events policies (read-only for users, written by webhooks)
CREATE POLICY "CRM users can view email_events" ON public.email_events
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Service role can insert email events (for webhooks)
CREATE POLICY "Service role can insert email_events" ON public.email_events
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.distribution_lists IS 'Email distribution lists for bulk communications';
COMMENT ON TABLE public.distribution_list_members IS 'Contacts belonging to distribution lists';
COMMENT ON TABLE public.email_outbound IS 'User-composed outbound emails sent via Graph or Resend';
COMMENT ON TABLE public.email_outbound_recipients IS 'Recipients of outbound emails';
COMMENT ON TABLE public.email_events IS 'Email engagement events from Resend webhooks (opens, clicks, etc.)';

