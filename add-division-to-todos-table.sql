-- Add division column to todos table
-- This field will store the division that the todo belongs to (Investment, Ops)
-- The division is determined by the creator's user_profiles.division at creation time

ALTER TABLE public.todos 
ADD COLUMN IF NOT EXISTS division TEXT CHECK (division IN ('Investment', 'Ops'));

-- Create index for better performance on division filtering
CREATE INDEX IF NOT EXISTS idx_todos_division ON public.todos(division);

-- Update existing todos to set division based on the creator's division
-- First, let's add a helper function to determine division
CREATE OR REPLACE FUNCTION public.determine_todo_division(p_analyst_code TEXT)
RETURNS TEXT AS $$
DECLARE
  user_division TEXT;
BEGIN
  -- Find the user's division based on their analyst_code
  SELECT up.division INTO user_division
  FROM public.user_profiles up
  WHERE up.analyst_code = p_analyst_code
  LIMIT 1;
  
  -- If user division is Super, default to Investment for existing todos
  -- (they can create both types, but we'll default existing ones to Investment)
  IF user_division = 'Super' THEN
    RETURN 'Investment';
  ELSIF user_division = 'Ops' THEN
    RETURN 'Ops';
  ELSE
    -- Default to Investment for any other case (Investment, Admin, Marketing, etc.)
    RETURN 'Investment';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing todos with their appropriate division
UPDATE public.todos 
SET division = public.determine_todo_division(analyst)
WHERE division IS NULL;

-- Make division NOT NULL after updating existing records
ALTER TABLE public.todos 
ALTER COLUMN division SET NOT NULL;

-- Set default value for new todos (will be overridden by application logic)
ALTER TABLE public.todos 
ALTER COLUMN division SET DEFAULT 'Investment';

-- Drop the helper function as it's no longer needed
DROP FUNCTION IF EXISTS public.determine_todo_division(TEXT);

COMMENT ON COLUMN public.todos.division IS 'Todo division: Investment or Ops - determined by creator''s division';
