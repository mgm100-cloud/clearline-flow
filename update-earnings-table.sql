-- Update earnings_tracking table to add TradeRec and TradeLevel columns
-- Run this in your Supabase SQL Editor

-- Add TradeRec column (enum type for trade recommendations)
ALTER TABLE public.earnings_tracking 
ADD COLUMN IF NOT EXISTS trade_rec VARCHAR(10) CHECK (trade_rec IN ('SELL', 'HOLD', 'BUY', 'SHORT', 'COVER'));

-- Add TradeLevel column (decimal with 2 places for price levels)
ALTER TABLE public.earnings_tracking 
ADD COLUMN IF NOT EXISTS trade_level DECIMAL(10,2);

-- Verify the table structure
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'earnings_tracking' 
ORDER BY ordinal_position; 