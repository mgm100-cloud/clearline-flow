-- Add division field to user_profiles table
-- This field will store the user's division (Investment, Ops, Admin, Marketing)

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS division TEXT;

-- Update the create_user_profile function to include division
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, analyst_code, division, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'analyst_code', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'division', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'readonly')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the get_analyst_emails function to include division
CREATE OR REPLACE FUNCTION public.get_analyst_emails()
RETURNS TABLE(name TEXT, email TEXT, analyst_code TEXT, division TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    up.full_name as name,
    up.email,
    up.analyst_code,
    up.division
  FROM public.user_profiles up
  WHERE up.email IS NOT NULL
    AND up.email != ''
    AND up.full_name IS NOT NULL
    AND up.full_name != ''
  ORDER BY up.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN public.user_profiles.division IS 'User division: Investment, Ops, Admin, Marketing';
COMMENT ON FUNCTION public.get_analyst_emails IS 'Get all user names, emails, analyst codes, and divisions from user profiles, bypassing RLS';
