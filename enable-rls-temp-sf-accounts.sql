-- Enable RLS on public.temp_sf_accounts to clear the Supabase security
-- advisor "RLS Disabled in Public" finding. The table has no policies
-- so it'll be accessible only to the service_role and via the Supabase
-- dashboard — appropriate for what looks like a one-off Salesforce
-- import staging table that isn't referenced by application code.
ALTER TABLE public.temp_sf_accounts ENABLE ROW LEVEL SECURITY;
