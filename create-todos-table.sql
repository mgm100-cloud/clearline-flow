-- Create todos table
CREATE TABLE IF NOT EXISTS public.todos (
    id BIGSERIAL PRIMARY KEY,
    ticker VARCHAR(20) NOT NULL,
    analyst VARCHAR(50) NOT NULL,
    date_entered TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_closed TIMESTAMP WITH TIME ZONE,
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    item TEXT NOT NULL,
    is_open BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON public.todos
    FOR ALL USING (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_todos_analyst ON public.todos(analyst);
CREATE INDEX IF NOT EXISTS idx_todos_is_open ON public.todos(is_open);
CREATE INDEX IF NOT EXISTS idx_todos_date_entered ON public.todos(date_entered);
CREATE INDEX IF NOT EXISTS idx_todos_date_closed ON public.todos(date_closed); 