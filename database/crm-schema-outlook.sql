-- ============================================================================
-- CLEARLINE CRM - OUTLOOK SYNC SCHEMA
-- Tables: mailboxes, emails, email_recipients, mailbox_sync_state
-- ============================================================================

-- ============================================================================
-- MAILBOXES (Outlook accounts being synced)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mailboxes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Provider information
    provider TEXT NOT NULL CHECK (provider IN ('outlook')),
    email_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'disconnected')),
    
    -- Sync information
    last_synced_at TIMESTAMPTZ,
    
    -- OAuth credentials (encrypted at application level)
    oauth_access_token TEXT,
    oauth_refresh_token TEXT,
    oauth_token_expires_at TIMESTAMPTZ,
    oauth_scope TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, email_address)
);

-- ============================================================================
-- EMAILS (Synced from Outlook)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mailbox_id UUID NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
    
    -- Microsoft Graph identifiers
    message_id TEXT NOT NULL, -- Graph API message ID
    conversation_id TEXT, -- Graph conversation ID for threading
    
    -- Email metadata
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    subject TEXT,
    preview TEXT, -- First ~200 chars of body
    from_address TEXT,
    sent_at TIMESTAMPTZ,
    
    -- CRM relationship (auto-linked)
    related_type TEXT CHECK (related_type IN ('account', 'contact')),
    related_id UUID, -- Can reference either accounts.id or contacts.id
    
    -- Storage
    storage_path TEXT, -- Path to full MIME message in Supabase Storage (optional)
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(mailbox_id, message_id)
);

-- ============================================================================
-- EMAIL RECIPIENTS (To/Cc/Bcc for synced emails)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_recipients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
    
    -- Recipient information
    kind TEXT NOT NULL CHECK (kind IN ('to', 'cc', 'bcc')),
    address TEXT NOT NULL,
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- MAILBOX SYNC STATE (Delta tokens for incremental sync)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mailbox_sync_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mailbox_id UUID NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
    
    -- Folder being synced
    folder TEXT NOT NULL, -- e.g., 'inbox', 'sentitems'
    
    -- Delta token for incremental sync
    last_delta_token TEXT,
    
    -- Audit fields
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(mailbox_id, folder)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Mailboxes
CREATE INDEX IF NOT EXISTS idx_mailboxes_user_id ON public.mailboxes(user_id);
CREATE INDEX IF NOT EXISTS idx_mailboxes_email_address ON public.mailboxes(LOWER(email_address));
CREATE INDEX IF NOT EXISTS idx_mailboxes_status ON public.mailboxes(status);

-- Emails
CREATE INDEX IF NOT EXISTS idx_emails_mailbox_id ON public.emails(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON public.emails(message_id);
CREATE INDEX IF NOT EXISTS idx_emails_conversation_id ON public.emails(conversation_id);
CREATE INDEX IF NOT EXISTS idx_emails_direction ON public.emails(direction);
CREATE INDEX IF NOT EXISTS idx_emails_sent_at ON public.emails(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_from_address ON public.emails(LOWER(from_address));
CREATE INDEX IF NOT EXISTS idx_emails_related ON public.emails(related_type, related_id) WHERE related_type IS NOT NULL;

-- Full-text search on emails
CREATE INDEX IF NOT EXISTS idx_emails_fulltext ON public.emails 
    USING GIN (to_tsvector('english', COALESCE(subject, '') || ' ' || COALESCE(preview, '')));

-- Email recipients
CREATE INDEX IF NOT EXISTS idx_email_recipients_email_id ON public.email_recipients(email_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_address ON public.email_recipients(LOWER(address));

-- Mailbox sync state
CREATE INDEX IF NOT EXISTS idx_mailbox_sync_state_mailbox_id ON public.mailbox_sync_state(mailbox_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS update_mailboxes_updated_at ON public.mailboxes;
CREATE TRIGGER update_mailboxes_updated_at
    BEFORE UPDATE ON public.mailboxes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_emails_updated_at ON public.emails;
CREATE TRIGGER update_emails_updated_at
    BEFORE UPDATE ON public.emails
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_mailbox_sync_state_updated_at ON public.mailbox_sync_state;
CREATE TRIGGER update_mailbox_sync_state_updated_at
    BEFORE UPDATE ON public.mailbox_sync_state
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- AUTO-LINK EMAILS TO CRM RECORDS
-- ============================================================================

-- Function to auto-link emails to contacts/accounts based on email address
CREATE OR REPLACE FUNCTION public.auto_link_email_to_crm()
RETURNS TRIGGER AS $$
DECLARE
    matched_contact_id UUID;
    matched_account_id UUID;
BEGIN
    -- Try to match by from_address for inbound emails
    IF NEW.direction = 'inbound' AND NEW.from_address IS NOT NULL THEN
        -- Find contact by email
        SELECT id, account_id INTO matched_contact_id, matched_account_id
        FROM public.contacts
        WHERE LOWER(email) = LOWER(NEW.from_address)
            AND deleted_at IS NULL
        LIMIT 1;
        
        IF matched_contact_id IS NOT NULL THEN
            NEW.related_type = 'contact';
            NEW.related_id = matched_contact_id;
        ELSIF matched_account_id IS NOT NULL THEN
            NEW.related_type = 'account';
            NEW.related_id = matched_account_id;
        END IF;
    END IF;
    
    -- For outbound emails, try to match recipients
    IF NEW.direction = 'outbound' THEN
        -- Will be handled by checking email_recipients after insert
        -- This is done in a separate function triggered after recipients are inserted
        NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_link_email_to_crm_trigger ON public.emails;
CREATE TRIGGER auto_link_email_to_crm_trigger
    BEFORE INSERT ON public.emails
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_link_email_to_crm();

-- Function to create task from synced email
CREATE OR REPLACE FUNCTION public.create_task_from_synced_email()
RETURNS TRIGGER AS $$
DECLARE
    task_account_id UUID;
    task_contact_id UUID;
    task_interaction_type TEXT;
BEGIN
    -- Only create tasks for emails that are linked to CRM records
    IF NEW.related_type IS NULL OR NEW.related_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Determine account and contact IDs
    IF NEW.related_type = 'contact' THEN
        SELECT account_id INTO task_account_id
        FROM public.contacts
        WHERE id = NEW.related_id;
        task_contact_id = NEW.related_id;
    ELSIF NEW.related_type = 'account' THEN
        task_account_id = NEW.related_id;
        task_contact_id = NULL;
    END IF;
    
    -- Determine interaction type
    IF NEW.direction = 'inbound' THEN
        task_interaction_type = 'ReceivedEmail';
    ELSE
        task_interaction_type = 'SentEmail';
    END IF;
    
    -- Create task
    INSERT INTO public.tasks (
        account_id,
        contact_id,
        subject,
        activity_date,
        description,
        interaction_type,
        created_at,
        updated_at
    ) VALUES (
        task_account_id,
        task_contact_id,
        NEW.subject,
        NEW.sent_at::DATE,
        NEW.preview,
        task_interaction_type,
        NOW(),
        NOW()
    );
    
    -- Update account last_activity if not SentEmail or OutgoingCall
    IF task_interaction_type NOT IN ('SentEmail', 'OutgoingCall') AND task_account_id IS NOT NULL THEN
        UPDATE public.accounts
        SET last_activity = NEW.sent_at::DATE
        WHERE id = task_account_id
            AND (last_activity IS NULL OR last_activity < NEW.sent_at::DATE);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_task_from_synced_email_trigger ON public.emails;
CREATE TRIGGER create_task_from_synced_email_trigger
    AFTER INSERT ON public.emails
    FOR EACH ROW
    EXECUTE FUNCTION public.create_task_from_synced_email();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailbox_sync_state ENABLE ROW LEVEL SECURITY;

-- Mailboxes policies (users can only see their own mailboxes)
CREATE POLICY "Users can view own mailboxes" ON public.mailboxes
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        user_id = auth.uid()
    );

CREATE POLICY "Users can insert own mailboxes" ON public.mailboxes
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        user_id = auth.uid()
    );

CREATE POLICY "Users can update own mailboxes" ON public.mailboxes
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        user_id = auth.uid()
    );

CREATE POLICY "Users can delete own mailboxes" ON public.mailboxes
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        user_id = auth.uid()
    );

-- Service role can manage all mailboxes (for sync functions)
CREATE POLICY "Service role can manage mailboxes" ON public.mailboxes
    FOR ALL USING (auth.role() = 'service_role');

-- Emails policies (CRM users can view emails from any mailbox)
CREATE POLICY "CRM users can view emails" ON public.emails
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

-- Service role can insert/update emails (for sync functions)
CREATE POLICY "Service role can manage emails" ON public.emails
    FOR ALL USING (auth.role() = 'service_role');

-- Email recipients policies
CREATE POLICY "CRM users can view email_recipients" ON public.email_recipients
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        public.has_crm_access()
    );

CREATE POLICY "Service role can manage email_recipients" ON public.email_recipients
    FOR ALL USING (auth.role() = 'service_role');

-- Mailbox sync state policies
CREATE POLICY "Users can view own sync state" ON public.mailbox_sync_state
    FOR SELECT USING (
        auth.role() = 'authenticated' AND 
        EXISTS (
            SELECT 1 FROM public.mailboxes 
            WHERE id = mailbox_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage sync state" ON public.mailbox_sync_state
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.mailboxes IS 'Outlook mailboxes being synced for CRM users';
COMMENT ON TABLE public.emails IS 'Emails synced from Outlook, auto-linked to CRM records';
COMMENT ON TABLE public.email_recipients IS 'Recipients of synced emails';
COMMENT ON TABLE public.mailbox_sync_state IS 'Delta tokens for incremental Outlook sync';
COMMENT ON FUNCTION public.auto_link_email_to_crm IS 'Automatically link synced emails to contacts/accounts by matching email addresses';
COMMENT ON FUNCTION public.create_task_from_synced_email IS 'Automatically create CRM task from synced email';

