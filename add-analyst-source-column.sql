-- Add analyst_source column to tickers table
-- This records who entered the ticker into the database

ALTER TABLE public.tickers 
ADD COLUMN IF NOT EXISTS analyst_source VARCHAR(50);

-- Create index for querying by source analyst
CREATE INDEX IF NOT EXISTS idx_tickers_analyst_source ON public.tickers(analyst_source);

COMMENT ON COLUMN public.tickers.analyst_source 
IS 'The analyst_code of the user who originally entered this ticker into the database';
