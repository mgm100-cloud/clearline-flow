-- Add status field and status history to todos
-- Status field with default "Not started"
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Not started';

-- Status updated timestamp
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP WITH TIME ZONE;

-- Create index for status field
CREATE INDEX IF NOT EXISTS idx_todos_status ON public.todos(status);

-- Create status history table to store previous statuses
CREATE TABLE IF NOT EXISTS public.todo_status_history (
    id BIGSERIAL PRIMARY KEY,
    todo_id BIGINT NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    changed_by VARCHAR(100), -- Store who made the change (optional)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on status history
ALTER TABLE public.todo_status_history ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON public.todo_status_history
    FOR ALL USING (auth.role() = 'authenticated');

-- Create indexes for better performance on status history
CREATE INDEX IF NOT EXISTS idx_todo_status_history_todo_id ON public.todo_status_history(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_status_history_changed_at ON public.todo_status_history(changed_at);
