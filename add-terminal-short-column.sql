-- Add terminal_short boolean column to tickers table
ALTER TABLE public.tickers ADD COLUMN IF NOT EXISTS terminal_short BOOLEAN DEFAULT FALSE;
