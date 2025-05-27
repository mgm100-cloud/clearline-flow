-- Create earnings_tracking table for Clearline Flow
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.earnings_tracking (
    id BIGSERIAL PRIMARY KEY,
    ticker VARCHAR(20) NOT NULL,
    cyq VARCHAR(10) NOT NULL,
    earnings_date DATE,
    qp_call_date DATE,
    preview_date DATE,
    callback_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(ticker, cyq)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.earnings_tracking ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON public.earnings_tracking
    FOR ALL USING (auth.role() = 'authenticated');

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_earnings_ticker_cyq ON public.earnings_tracking(ticker, cyq);

-- Verify the table was created
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'earnings_tracking' 
ORDER BY ordinal_position; 