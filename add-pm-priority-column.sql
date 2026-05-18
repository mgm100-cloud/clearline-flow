-- Add PM Priority flag to the tickers table
-- Run this in the Supabase SQL Editor for existing deployments.

ALTER TABLE public.tickers
ADD COLUMN IF NOT EXISTS pm_priority BOOLEAN DEFAULT FALSE;

UPDATE public.tickers
SET pm_priority = COALESCE(pm_priority, FALSE);

COMMENT ON COLUMN public.tickers.pm_priority IS 'Flag for ideas marked as PM Priority';
