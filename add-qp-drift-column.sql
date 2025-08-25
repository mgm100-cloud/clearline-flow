-- Add QP_Drift column to tickers table
-- This column stores a whole number between -30 and 30, with default value -14

-- Add the QP_Drift column with constraints
ALTER TABLE public.tickers 
ADD COLUMN QP_Drift INTEGER DEFAULT -14 
CHECK (QP_Drift >= -30 AND QP_Drift <= 30);

-- Update all existing tickers to have QP_Drift = -14
UPDATE public.tickers 
SET QP_Drift = -14 
WHERE QP_Drift IS NULL;

-- Verify the column was added successfully
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'tickers' 
AND column_name = 'qp_drift';

-- Show a sample of the updated tickers
SELECT ticker, QP_Drift 
FROM public.tickers 
LIMIT 10;
