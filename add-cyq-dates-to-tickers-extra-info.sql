-- Migration script to add CYQ date columns to existing tickers_extra_info table
-- Run this in your Supabase SQL Editor if you already have the tickers_extra_info table

-- Add the new CYQ date columns
ALTER TABLE public.tickers_extra_info 
ADD COLUMN IF NOT EXISTS cyq1_date VARCHAR(5), -- Format: MM/DD (Q1 end date)
ADD COLUMN IF NOT EXISTS cyq2_date VARCHAR(5), -- Format: MM/DD (Q2 end date)
ADD COLUMN IF NOT EXISTS cyq3_date VARCHAR(5), -- Format: MM/DD (Q3 end date)
ADD COLUMN IF NOT EXISTS cyq4_date VARCHAR(5); -- Format: MM/DD (Q4 end date, same as fiscal_year_end)

-- Verify the columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickers_extra_info' 
AND column_name IN ('cyq1_date', 'cyq2_date', 'cyq3_date', 'cyq4_date')
ORDER BY column_name; 