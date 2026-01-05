-- ============================================================================
-- CLEARLINE CRM - MASTER SCHEMA
-- Run this file to create all CRM tables, functions, and policies
-- ============================================================================

-- This file orchestrates the creation of all CRM database objects
-- Run the individual schema files in order:

\i database/crm-schema-core.sql
\i database/crm-schema-email.sql
\i database/crm-schema-outlook.sql
\i database/crm-schema-client-data.sql
\i database/crm-schema-import.sql
\i database/crm-import-functions.sql

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- List all CRM tables
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
    AND tablename IN (
        'accounts', 'contacts', 'tasks', 'task_participants',
        'distribution_lists', 'distribution_list_members',
        'email_outbound', 'email_outbound_recipients', 'email_events',
        'mailboxes', 'emails', 'email_recipients', 'mailbox_sync_state',
        'client_data_capital', 'client_data_subs', 'client_data_reds',
        'report_row_orders',
        'staging_accounts', 'staging_contacts', 'staging_tasks',
        'x_sf_account', 'x_sf_contact', 'x_sf_task',
        'import_logs'
    )
ORDER BY tablename;

-- List all CRM functions
SELECT 
    n.nspname as schema,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.proname IN (
        'has_crm_access',
        'normalize_boolean',
        'parse_numeric',
        'parse_date',
        'merge_text_fields',
        'parse_investment_size_range',
        'import_accounts_from_staging',
        'import_contacts_from_staging',
        'import_tasks_from_staging',
        'clear_staging_tables',
        'get_firm_total_invested',
        'get_firm_total_redeemed',
        'get_firm_net_invested',
        'auto_link_email_to_crm',
        'create_task_from_synced_email'
    )
ORDER BY function_name;

-- ============================================================================
-- SAMPLE QUERIES
-- ============================================================================

-- Check CRM access for current user
-- SELECT public.has_crm_access();

-- Get all accounts
-- SELECT * FROM public.accounts WHERE deleted_at IS NULL ORDER BY firm_name;

-- Get all contacts for an account
-- SELECT * FROM public.contacts WHERE account_id = '<uuid>' AND deleted_at IS NULL;

-- Get all tasks for an account
-- SELECT * FROM public.tasks WHERE account_id = '<uuid>' AND deleted_at IS NULL ORDER BY activity_date DESC;

-- Get firm capital summary
-- SELECT 
--     a.firm_name,
--     public.get_firm_total_invested(a.id) as total_invested,
--     public.get_firm_total_redeemed(a.id) as total_redeemed,
--     public.get_firm_net_invested(a.id) as net_invested
-- FROM public.accounts a
-- WHERE a.status = '1 Investor' AND a.deleted_at IS NULL;

