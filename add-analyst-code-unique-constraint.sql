-- Add unique constraint and NOT NULL constraint to analyst_code field in user_profiles table
-- This ensures every user must have a unique, non-empty analyst code

-- First, update any NULL or empty analyst_codes to a placeholder (you may need to fix these manually)
-- UPDATE public.user_profiles SET analyst_code = 'UNKNOWN_' || id::text WHERE analyst_code IS NULL OR analyst_code = '';

-- Drop existing constraints if they exist (safe to run multiple times)
ALTER TABLE public.user_profiles 
DROP CONSTRAINT IF EXISTS user_profiles_analyst_code_unique;

ALTER TABLE public.user_profiles 
DROP CONSTRAINT IF EXISTS user_profiles_analyst_code_not_empty;

-- Add NOT NULL constraint (will fail if there are existing NULL values)
ALTER TABLE public.user_profiles 
ALTER COLUMN analyst_code SET NOT NULL;

-- Add CHECK constraint to prevent empty strings
ALTER TABLE public.user_profiles 
ADD CONSTRAINT user_profiles_analyst_code_not_empty 
CHECK (analyst_code <> '');

-- Add unique constraint
ALTER TABLE public.user_profiles 
ADD CONSTRAINT user_profiles_analyst_code_unique 
UNIQUE (analyst_code);

COMMENT ON COLUMN public.user_profiles.analyst_code 
IS 'Unique analyst code identifier - required and must be non-empty';

-- ============================================================================
-- Create function to check if analyst_code exists (bypasses RLS for signup)
-- This function is needed because unauthenticated users cannot query user_profiles
-- due to Row Level Security policies
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_analyst_code_exists(code TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Return true if the analyst_code already exists
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE analyst_code = code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anonymous users (for signup) and authenticated users
GRANT EXECUTE ON FUNCTION public.check_analyst_code_exists(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_analyst_code_exists(TEXT) TO authenticated;

COMMENT ON FUNCTION public.check_analyst_code_exists 
IS 'Check if an analyst/employee code already exists - bypasses RLS for signup validation';
