-- Add rank column to tickers table
-- Rank can be 1, 2, 3, or NULL
-- Each analyst can only have one ticker at each rank (enforced by application logic)

ALTER TABLE public.tickers 
ADD COLUMN IF NOT EXISTS rank INTEGER CHECK (rank IS NULL OR rank IN (1, 2, 3));

COMMENT ON COLUMN public.tickers.rank 
IS 'Analyst priority rank (1-3). Each analyst can have at most one ticker per rank.';

-- Create an index on analyst and rank for quick lookups when changing ranks
CREATE INDEX IF NOT EXISTS idx_tickers_analyst_rank ON public.tickers(analyst, rank) WHERE rank IS NOT NULL;
