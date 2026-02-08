-- ============================================================================
-- CLEARLINE CRM - CSV IMPORT FUNCTIONS
-- Functions to process staging tables and import into main tables
-- ============================================================================

-- ============================================================================
-- IMPORT ACCOUNTS FROM STAGING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.import_accounts_from_staging()
RETURNS TABLE(
    total_rows BIGINT,
    successful_rows BIGINT,
    failed_rows BIGINT,
    error_details TEXT
) AS $$
DECLARE
    v_total_rows BIGINT := 0;
    v_successful_rows BIGINT := 0;
    v_failed_rows BIGINT := 0;
    v_error_details TEXT := '';
    v_staging_record RECORD;
    v_new_account_id UUID;
    v_investment_min NUMERIC;
    v_investment_max NUMERIC;
    v_merged_description TEXT;
BEGIN
    -- Count total unprocessed rows
    SELECT COUNT(*) INTO v_total_rows
    FROM public.staging_accounts
    WHERE processed = FALSE;
    
    -- Process each staging record
    FOR v_staging_record IN 
        SELECT * FROM public.staging_accounts 
        WHERE processed = FALSE
        ORDER BY row_number
    LOOP
        BEGIN
            -- Parse investment size range
            SELECT * INTO v_investment_min, v_investment_max
            FROM public.parse_investment_size_range(v_staging_record.investment_size);
            
            -- Merge description fields
            v_merged_description := public.merge_text_fields(
                v_staging_record.description,
                v_staging_record.firm_background,
                v_staging_record.investment_notes,
                v_staging_record.brief_overview
            );
            
            -- Insert into accounts table
            INSERT INTO public.accounts (
                sf_ext_id,
                firm_name,
                type,
                address,
                city,
                state,
                country,
                zip_code,
                phone_number,
                website,
                description,
                created_date,
                updated_date,
                last_activity,
                aum,
                tier,
                investment_size_min,
                investment_size_max,
                hf_investments,
                category,
                pb_introduction,
                consultant,
                third_party_marketer,
                focus_list,
                probability_of_investment,
                pm_meeting
            ) VALUES (
                v_staging_record.sf_id,
                v_staging_record.name,
                NULLIF(TRIM(v_staging_record.type), ''),
                NULLIF(TRIM(v_staging_record.billing_street), ''),
                NULLIF(TRIM(v_staging_record.billing_city), ''),
                NULLIF(TRIM(v_staging_record.billing_state), ''),
                NULLIF(TRIM(v_staging_record.billing_country), ''),
                NULLIF(TRIM(v_staging_record.billing_postal_code), ''),
                NULLIF(TRIM(v_staging_record.phone), ''),
                NULLIF(TRIM(v_staging_record.website), ''),
                v_merged_description,
                public.parse_date(v_staging_record.created_date),
                public.parse_date(v_staging_record.last_modified_date),
                public.parse_date(v_staging_record.last_activity_date),
                public.parse_numeric(v_staging_record.aum),
                NULLIF(TRIM(v_staging_record.tier), ''),
                v_investment_min,
                v_investment_max,
                public.parse_numeric(v_staging_record.number_of_hf_investments)::INTEGER,
                NULLIF(TRIM(v_staging_record.category), ''),
                NULLIF(TRIM(v_staging_record.pb_introduction), ''),
                NULLIF(TRIM(v_staging_record.consultant), ''),
                NULLIF(TRIM(v_staging_record.third_party_marketer), ''),
                public.normalize_boolean(v_staging_record.focus_list),
                public.parse_numeric(v_staging_record.probability_of_investment),
                public.normalize_boolean(v_staging_record.pm_meeting)
            )
            RETURNING id INTO v_new_account_id;
            
            -- Insert into crosswalk table
            IF v_staging_record.sf_id IS NOT NULL THEN
                INSERT INTO public.x_sf_account (sf_id, account_id)
                VALUES (v_staging_record.sf_id, v_new_account_id)
                ON CONFLICT (sf_id) DO UPDATE SET account_id = v_new_account_id;
            END IF;
            
            -- Mark as processed
            UPDATE public.staging_accounts
            SET processed = TRUE, error_message = NULL
            WHERE id = v_staging_record.id;
            
            v_successful_rows := v_successful_rows + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Log error and continue
            UPDATE public.staging_accounts
            SET processed = TRUE, 
                error_message = SQLERRM
            WHERE id = v_staging_record.id;
            
            v_failed_rows := v_failed_rows + 1;
            v_error_details := v_error_details || 
                'Row ' || v_staging_record.row_number || ': ' || SQLERRM || E'\n';
        END;
    END LOOP;
    
    RETURN QUERY SELECT v_total_rows, v_successful_rows, v_failed_rows, v_error_details;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.import_accounts_from_staging() TO authenticated;

-- ============================================================================
-- IMPORT CONTACTS FROM STAGING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.import_contacts_from_staging()
RETURNS TABLE(
    total_rows BIGINT,
    successful_rows BIGINT,
    failed_rows BIGINT,
    error_details TEXT
) AS $$
DECLARE
    v_total_rows BIGINT := 0;
    v_successful_rows BIGINT := 0;
    v_failed_rows BIGINT := 0;
    v_error_details TEXT := '';
    v_staging_record RECORD;
    v_new_contact_id UUID;
    v_account_id UUID;
    v_reports_to_contact_id UUID;
    v_merged_description TEXT;
    v_which_fund TEXT;
BEGIN
    -- Count total unprocessed rows
    SELECT COUNT(*) INTO v_total_rows
    FROM public.staging_contacts
    WHERE processed = FALSE;
    
    -- Process each staging record
    FOR v_staging_record IN 
        SELECT * FROM public.staging_contacts 
        WHERE processed = FALSE
        ORDER BY row_number
    LOOP
        BEGIN
            -- Resolve account_id via crosswalk
            v_account_id := NULL;
            IF v_staging_record.account_id IS NOT NULL THEN
                SELECT account_id INTO v_account_id
                FROM public.x_sf_account
                WHERE sf_id = v_staging_record.account_id;
            END IF;
            
            -- Resolve reports_to_contact_id via crosswalk (may be NULL if not found)
            v_reports_to_contact_id := NULL;
            IF v_staging_record.reports_to_id IS NOT NULL THEN
                SELECT contact_id INTO v_reports_to_contact_id
                FROM public.x_sf_contact
                WHERE sf_id = v_staging_record.reports_to_id;
            END IF;
            
            -- Merge description fields
            v_merged_description := public.merge_text_fields(
                v_staging_record.description,
                v_staging_record.background
            );
            
            -- Normalize which_fund field
            v_which_fund := CASE TRIM(UPPER(COALESCE(v_staging_record.onshore_offshore, '')))
                WHEN 'ONSHORE' THEN 'Onshore'
                WHEN 'OFFSHORE' THEN 'Offshore'
                WHEN 'TBD' THEN 'TBD'
                ELSE NULL
            END;
            
            -- Insert into contacts table
            INSERT INTO public.contacts (
                sf_ext_id,
                account_id,
                salutation,
                first_name,
                last_name,
                mailing_street,
                mailing_city,
                mailing_state,
                mailing_postal_code,
                mailing_country,
                phone,
                mobile_phone,
                email,
                assistant_name,
                assistant_phone,
                reports_to_contact_id,
                title,
                lead_source,
                description,
                created_date,
                updated_date,
                last_activity,
                distribution_list,
                main_contact,
                which_fund
            ) VALUES (
                v_staging_record.sf_id,
                v_account_id,
                NULLIF(TRIM(v_staging_record.salutation), ''),
                NULLIF(TRIM(v_staging_record.first_name), ''),
                NULLIF(TRIM(v_staging_record.last_name), ''),
                NULLIF(TRIM(v_staging_record.mailing_street), ''),
                NULLIF(TRIM(v_staging_record.mailing_city), ''),
                NULLIF(TRIM(v_staging_record.mailing_state), ''),
                NULLIF(TRIM(v_staging_record.mailing_postal_code), ''),
                NULLIF(TRIM(v_staging_record.mailing_country), ''),
                NULLIF(TRIM(v_staging_record.phone), ''),
                NULLIF(TRIM(v_staging_record.mobile_phone), ''),
                NULLIF(TRIM(LOWER(v_staging_record.email)), ''),
                NULLIF(TRIM(v_staging_record.assistant_name), ''),
                NULLIF(TRIM(v_staging_record.assistant_phone), ''),
                v_reports_to_contact_id,
                NULLIF(TRIM(v_staging_record.title), ''),
                NULLIF(TRIM(v_staging_record.lead_source), ''),
                v_merged_description,
                public.parse_date(v_staging_record.created_date),
                public.parse_date(v_staging_record.last_modified_date),
                public.parse_date(v_staging_record.last_activity_date),
                public.normalize_boolean(v_staging_record.clearline_distribution_list),
                public.normalize_boolean(v_staging_record.key_contact),
                v_which_fund
            )
            RETURNING id INTO v_new_contact_id;
            
            -- Insert into crosswalk table
            IF v_staging_record.sf_id IS NOT NULL THEN
                INSERT INTO public.x_sf_contact (sf_id, contact_id)
                VALUES (v_staging_record.sf_id, v_new_contact_id)
                ON CONFLICT (sf_id) DO UPDATE SET contact_id = v_new_contact_id;
            END IF;
            
            -- Mark as processed
            UPDATE public.staging_contacts
            SET processed = TRUE, error_message = NULL
            WHERE id = v_staging_record.id;
            
            v_successful_rows := v_successful_rows + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Log error and continue
            UPDATE public.staging_contacts
            SET processed = TRUE, 
                error_message = SQLERRM
            WHERE id = v_staging_record.id;
            
            v_failed_rows := v_failed_rows + 1;
            v_error_details := v_error_details || 
                'Row ' || v_staging_record.row_number || ': ' || SQLERRM || E'\n';
        END;
    END LOOP;
    
    RETURN QUERY SELECT v_total_rows, v_successful_rows, v_failed_rows, v_error_details;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.import_contacts_from_staging() TO authenticated;

-- ============================================================================
-- IMPORT TASKS FROM STAGING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.import_tasks_from_staging()
RETURNS TABLE(
    total_rows BIGINT,
    successful_rows BIGINT,
    failed_rows BIGINT,
    error_details TEXT
) AS $$
DECLARE
    v_total_rows BIGINT := 0;
    v_successful_rows BIGINT := 0;
    v_failed_rows BIGINT := 0;
    v_error_details TEXT := '';
    v_staging_record RECORD;
    v_new_task_id UUID;
    v_account_id UUID;
    v_contact_id UUID;
    v_interaction_type TEXT;
    v_subject_lower TEXT;
BEGIN
    -- Count total unprocessed rows
    SELECT COUNT(*) INTO v_total_rows
    FROM public.staging_tasks
    WHERE processed = FALSE;
    
    -- Process each staging record
    FOR v_staging_record IN 
        SELECT * FROM public.staging_tasks 
        WHERE processed = FALSE
        ORDER BY row_number
    LOOP
        BEGIN
            -- Resolve account_id via crosswalk
            v_account_id := NULL;
            IF v_staging_record.account_id IS NOT NULL THEN
                SELECT account_id INTO v_account_id
                FROM public.x_sf_account
                WHERE sf_id = v_staging_record.account_id;
            END IF;
            
            -- Resolve contact_id via crosswalk
            -- Rule: Use WhoId unless WhoId='003000000000000AAA'. 
            -- Else if WhatId starts with '003', map WhatId to contact; else leave NULL.
            v_contact_id := NULL;
            
            IF v_staging_record.who_id IS NOT NULL AND 
               v_staging_record.who_id != '003000000000000AAA' THEN
                SELECT contact_id INTO v_contact_id
                FROM public.x_sf_contact
                WHERE sf_id = v_staging_record.who_id;
            ELSIF v_staging_record.what_id IS NOT NULL AND 
                  v_staging_record.what_id LIKE '003%' THEN
                SELECT contact_id INTO v_contact_id
                FROM public.x_sf_contact
                WHERE sf_id = v_staging_record.what_id;
            END IF;
            
            -- Infer interaction_type from subject if possible
            v_interaction_type := 'UpdatedInfo'; -- Default
            v_subject_lower := LOWER(COALESCE(v_staging_record.subject, ''));
            
            IF v_subject_lower LIKE '%email%' OR v_subject_lower LIKE '%sent%' THEN
                v_interaction_type := 'SentEmail';
            ELSIF v_subject_lower LIKE '%call%' OR v_subject_lower LIKE '%phone%' THEN
                IF v_subject_lower LIKE '%connected%' THEN
                    v_interaction_type := 'ConnectedCall';
                ELSE
                    v_interaction_type := 'OutgoingCall';
                END IF;
            ELSIF v_subject_lower LIKE '%meeting%' OR v_subject_lower LIKE '%met%' THEN
                IF v_subject_lower LIKE '%video%' OR v_subject_lower LIKE '%zoom%' OR v_subject_lower LIKE '%teams%' THEN
                    v_interaction_type := 'VideoCall';
                ELSIF v_subject_lower LIKE '%conference%' THEN
                    v_interaction_type := 'ConferenceMeeting';
                ELSIF v_subject_lower LIKE '%visit%' THEN
                    v_interaction_type := 'InPersonVisit';
                ELSE
                    v_interaction_type := 'InPersonOffice';
                END IF;
            END IF;
            
            -- Insert into tasks table
            INSERT INTO public.tasks (
                sf_ext_id,
                account_id,
                contact_id,
                subject,
                activity_date,
                description,
                extra_info,
                interaction_type,
                created_date,
                updated_date
            ) VALUES (
                v_staging_record.sf_id,
                v_account_id,
                v_contact_id,
                NULLIF(TRIM(v_staging_record.subject), ''),
                public.parse_date(v_staging_record.activity_date),
                NULLIF(TRIM(v_staging_record.description), ''),
                NULLIF(TRIM(v_staging_record.summary), ''),
                v_interaction_type,
                public.parse_date(v_staging_record.created_date),
                public.parse_date(v_staging_record.last_modified_date)
            )
            RETURNING id INTO v_new_task_id;
            
            -- Insert into crosswalk table
            IF v_staging_record.sf_id IS NOT NULL THEN
                INSERT INTO public.x_sf_task (sf_id, task_id)
                VALUES (v_staging_record.sf_id, v_new_task_id)
                ON CONFLICT (sf_id) DO UPDATE SET task_id = v_new_task_id;
            END IF;
            
            -- Update account last_activity (exception for SentEmail/OutgoingCall)
            IF v_account_id IS NOT NULL AND 
               v_interaction_type NOT IN ('SentEmail', 'OutgoingCall') AND
               public.parse_date(v_staging_record.activity_date) IS NOT NULL THEN
                UPDATE public.accounts
                SET last_activity = public.parse_date(v_staging_record.activity_date)
                WHERE id = v_account_id
                    AND (last_activity IS NULL OR 
                         last_activity < public.parse_date(v_staging_record.activity_date));
            END IF;
            
            -- Mark as processed
            UPDATE public.staging_tasks
            SET processed = TRUE, error_message = NULL
            WHERE id = v_staging_record.id;
            
            v_successful_rows := v_successful_rows + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Log error and continue
            UPDATE public.staging_tasks
            SET processed = TRUE, 
                error_message = SQLERRM
            WHERE id = v_staging_record.id;
            
            v_failed_rows := v_failed_rows + 1;
            v_error_details := v_error_details || 
                'Row ' || v_staging_record.row_number || ': ' || SQLERRM || E'\n';
        END;
    END LOOP;
    
    RETURN QUERY SELECT v_total_rows, v_successful_rows, v_failed_rows, v_error_details;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.import_tasks_from_staging() TO authenticated;

-- ============================================================================
-- CLEAR STAGING TABLES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clear_staging_tables()
RETURNS void AS $$
BEGIN
    DELETE FROM public.staging_accounts;
    DELETE FROM public.staging_contacts;
    DELETE FROM public.staging_tasks;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.clear_staging_tables() TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.import_accounts_from_staging IS 'Process staging_accounts and import into accounts table with field mapping and error handling';
COMMENT ON FUNCTION public.import_contacts_from_staging IS 'Process staging_contacts and import into contacts table with field mapping and error handling';
COMMENT ON FUNCTION public.import_tasks_from_staging IS 'Process staging_tasks and import into tasks table with field mapping, contact resolution, and interaction type inference';
COMMENT ON FUNCTION public.clear_staging_tables IS 'Clear all staging tables after successful import';

