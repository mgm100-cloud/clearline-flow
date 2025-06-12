-- Create tickers_extra_info table for additional ticker information
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.tickers_extra_info (
    id BIGSERIAL PRIMARY KEY,
    ticker_id UUID REFERENCES public.tickers(id) ON DELETE CASCADE,
    ticker VARCHAR(20) NOT NULL,
    cik VARCHAR(20),
    fiscal_year_end VARCHAR(5), -- Format: MM/DD
    cyq1_date VARCHAR(5), -- Format: MM/DD (Q1 end date)
    cyq2_date VARCHAR(5), -- Format: MM/DD (Q2 end date)
    cyq3_date VARCHAR(5), -- Format: MM/DD (Q3 end date)
    cyq4_date VARCHAR(5), -- Format: MM/DD (Q4 end date, same as fiscal_year_end)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(ticker_id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.tickers_extra_info ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON public.tickers_extra_info
    FOR ALL USING (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tickers_extra_info_ticker_id ON public.tickers_extra_info(ticker_id);
CREATE INDEX IF NOT EXISTS idx_tickers_extra_info_ticker ON public.tickers_extra_info(ticker);
CREATE INDEX IF NOT EXISTS idx_tickers_extra_info_cik ON public.tickers_extra_info(cik);

-- Verify the table was created
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickers_extra_info' 
ORDER BY ordinal_position; 