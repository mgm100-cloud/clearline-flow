-- Create table for storing old theses (thesis version history)
CREATE TABLE IF NOT EXISTS public.old_theses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticker_id UUID NOT NULL REFERENCES public.tickers(id) ON DELETE CASCADE,
    thesis TEXT NOT NULL,
    archived_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT false
);

-- Create index for faster lookups by ticker
CREATE INDEX IF NOT EXISTS idx_old_theses_ticker_id ON public.old_theses(ticker_id);

-- Create index for ordering by archived date
CREATE INDEX IF NOT EXISTS idx_old_theses_archived_date ON public.old_theses(archived_date DESC);

-- Enable RLS
ALTER TABLE public.old_theses ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read old theses
CREATE POLICY "Allow authenticated users to read old theses" ON public.old_theses
    FOR SELECT TO authenticated USING (true);

-- Create policy to allow authenticated users to insert old theses
CREATE POLICY "Allow authenticated users to insert old theses" ON public.old_theses
    FOR INSERT TO authenticated WITH CHECK (true);

-- Create policy to allow authenticated users to delete old theses
CREATE POLICY "Allow authenticated users to delete old theses" ON public.old_theses
    FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE public.old_theses IS 'Stores historical versions of ticker theses';
COMMENT ON COLUMN public.old_theses.ticker_id IS 'Reference to the ticker this thesis belonged to';
COMMENT ON COLUMN public.old_theses.thesis IS 'The archived thesis text';
COMMENT ON COLUMN public.old_theses.archived_date IS 'Date when this thesis was replaced with a new one';
