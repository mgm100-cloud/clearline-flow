-- Expand todo status columns to allow longer status text
-- Previous limit of VARCHAR(50) was truncating user input
ALTER TABLE public.todos ALTER COLUMN status TYPE TEXT;
ALTER TABLE public.todo_status_history ALTER COLUMN status TYPE TEXT;
