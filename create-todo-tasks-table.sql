-- Create todo_tasks table to support multiple tasks per todo
-- Each task has its own description, status, and completion state
CREATE TABLE IF NOT EXISTS public.todo_tasks (
    id BIGSERIAL PRIMARY KEY,
    todo_id BIGINT NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'Not started',
    status_updated_at TIMESTAMP WITH TIME ZONE,
    is_complete BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.todo_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users" ON public.todo_tasks
    FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_todo_tasks_todo_id ON public.todo_tasks(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_tasks_sort_order ON public.todo_tasks(todo_id, sort_order);

-- Migrate existing todos: create one task per existing todo carrying over item + status.
-- Skips todos that already have tasks (idempotent).
INSERT INTO public.todo_tasks (
    todo_id, description, status, status_updated_at,
    is_complete, completed_at, sort_order, created_at, updated_at
)
SELECT
    t.id,
    COALESCE(NULLIF(t.item, ''), '(no description)'),
    COALESCE(NULLIF(t.status, ''), 'Not started'),
    t.status_updated_at,
    NOT COALESCE(t.is_open, TRUE),
    CASE WHEN NOT COALESCE(t.is_open, TRUE) THEN COALESCE(t.date_closed, t.updated_at) ELSE NULL END,
    0,
    t.created_at,
    t.updated_at
FROM public.todos t
WHERE NOT EXISTS (
    SELECT 1 FROM public.todo_tasks tt WHERE tt.todo_id = t.id
);
