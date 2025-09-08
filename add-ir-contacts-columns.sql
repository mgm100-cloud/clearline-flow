-- Add additional IR contact columns to tickers table
-- This allows storing up to 4 IR contacts per ticker for earnings tracking

-- Add the base IR columns if they don't exist
ALTER TABLE public.tickers 
ADD COLUMN IF NOT EXISTS ir_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS ir_email VARCHAR(255);

-- Add additional IR contact columns (2-4)
ALTER TABLE public.tickers 
ADD COLUMN IF NOT EXISTS ir_name2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ir_email2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ir_name3 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ir_email3 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ir_name4 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ir_email4 VARCHAR(255);

-- Add comments for clarity
COMMENT ON COLUMN public.tickers.ir_name IS 'Primary IR contact name';
COMMENT ON COLUMN public.tickers.ir_email IS 'Primary IR contact email';
COMMENT ON COLUMN public.tickers.ir_name2 IS 'Secondary IR contact name';
COMMENT ON COLUMN public.tickers.ir_email2 IS 'Secondary IR contact email';
COMMENT ON COLUMN public.tickers.ir_name3 IS 'Third IR contact name';
COMMENT ON COLUMN public.tickers.ir_email3 IS 'Third IR contact email';
COMMENT ON COLUMN public.tickers.ir_name4 IS 'Fourth IR contact name';
COMMENT ON COLUMN public.tickers.ir_email4 IS 'Fourth IR contact email';

-- Verify the columns were added successfully
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns 
WHERE table_name = 'tickers' 
AND column_name LIKE 'ir_%'
ORDER BY column_name;
