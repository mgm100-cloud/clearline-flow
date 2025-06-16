-- Add unique constraint to ticker field in tickers table
ALTER TABLE public.tickers
ADD CONSTRAINT tickers_ticker_unique UNIQUE (ticker);

-- Verify the constraint was added
SELECT conname, conrelid::regclass, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.tickers'::regclass
AND conname = 'tickers_ticker_unique'; 