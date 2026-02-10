-- Fix todos division check constraint to include Marketing
-- The original constraint only allowed 'Investment' and 'Ops', but Marketing users
-- now need to create todos with division = 'Marketing'

-- Drop the existing check constraint
ALTER TABLE public.todos DROP CONSTRAINT IF EXISTS todos_division_check;

-- Add the updated check constraint that includes Marketing
ALTER TABLE public.todos ADD CONSTRAINT todos_division_check CHECK (division IN ('Investment', 'Ops', 'Marketing'));
