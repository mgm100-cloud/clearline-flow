-- Add Retatrutide theme columns to the tickers table
-- Run this in the Supabase SQL Editor for existing deployments.

ALTER TABLE public.tickers
ADD COLUMN IF NOT EXISTS retatrutide_winner BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS retatrutide_loser BOOLEAN DEFAULT FALSE;

UPDATE public.tickers
SET
  retatrutide_winner = COALESCE(retatrutide_winner, FALSE),
  retatrutide_loser = COALESCE(retatrutide_loser, FALSE);

COMMENT ON COLUMN public.tickers.retatrutide_winner IS 'Theme flag for Retatrutide Winner ideas';
COMMENT ON COLUMN public.tickers.retatrutide_loser IS 'Theme flag for Retatrutide Loser ideas';
