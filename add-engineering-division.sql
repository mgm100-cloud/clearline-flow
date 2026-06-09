-- Add Engineering division
-- (1) Allow 'Engineering' as a division on user_profiles
-- (2) Allow 'Engineering' as a division on todos so Engineering todos can be created
-- (3) Grant Engineering users CRM access (they have access to all tabs)

-- Update user_profiles division check constraint to include Engineering
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_division_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_division_check
  CHECK (division IN ('Investment', 'Ops', 'Admin', 'Marketing', 'Engineering', 'Super'));

COMMENT ON COLUMN public.user_profiles.division IS 'User division: Investment, Ops, Admin, Marketing, Engineering, Super';

-- Update todos division check constraint to include Engineering
ALTER TABLE public.todos DROP CONSTRAINT IF EXISTS todos_division_check;
ALTER TABLE public.todos ADD CONSTRAINT todos_division_check
  CHECK (division IN ('Investment', 'Ops', 'Marketing', 'Engineering'));

-- Update CRM access helper so Engineering users can use the CRM tab
CREATE OR REPLACE FUNCTION public.has_crm_access()
RETURNS BOOLEAN AS $$
DECLARE
    user_division TEXT;
BEGIN
    SELECT division INTO user_division
    FROM public.user_profiles
    WHERE id = auth.uid();

    RETURN user_division IN ('Marketing', 'Engineering', 'Super');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
