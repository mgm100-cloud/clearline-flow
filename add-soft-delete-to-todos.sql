-- Add soft delete column to todos table
-- This allows todos to be "deleted" without losing the data

ALTER TABLE public.todos 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- Add deleted_at timestamp to track when todo was deleted
ALTER TABLE public.todos 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Create index for querying non-deleted todos efficiently
CREATE INDEX IF NOT EXISTS idx_todos_is_deleted ON public.todos(is_deleted);

COMMENT ON COLUMN public.todos.is_deleted 
IS 'Soft delete flag - when true, todo is considered deleted but data is preserved';

COMMENT ON COLUMN public.todos.deleted_at 
IS 'Timestamp when the todo was soft deleted';
