-- Add division column to user_profiles table
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS division TEXT CHECK (division IN ('Investment', 'Ops', 'Admin', 'Marketing', 'Super'));

-- Update the create_user_profile function to include division
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, analyst_code, role, division)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'analyst_code', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'readonly'),
    COALESCE(NEW.raw_user_meta_data ->> 'division', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    analyst_code = EXCLUDED.analyst_code,
    role = EXCLUDED.role,
    division = EXCLUDED.division,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get user division from profiles table
CREATE OR REPLACE FUNCTION public.get_user_division(user_id UUID DEFAULT auth.uid())
RETURNS TEXT AS $$
DECLARE
  user_division TEXT;
BEGIN
  SELECT division INTO user_division
  FROM public.user_profiles 
  WHERE id = user_id;
  RETURN COALESCE(user_division, '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_user_division(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_user_division IS 'Get the division of the current user from user_profiles table';

-- Create function to sync user metadata with user_profiles
CREATE OR REPLACE FUNCTION public.sync_user_metadata_to_profile()
RETURNS trigger AS $$
BEGIN
  -- Update user_profiles when user metadata changes
  UPDATE public.user_profiles SET
    full_name = COALESCE(NEW.raw_user_meta_data ->> 'full_name', full_name),
    analyst_code = COALESCE(NEW.raw_user_meta_data ->> 'analyst_code', analyst_code),
    role = COALESCE(NEW.raw_user_meta_data ->> 'role', role),
    division = COALESCE(NEW.raw_user_meta_data ->> 'division', division),
    updated_at = NOW()
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to sync metadata changes to profile
DROP TRIGGER IF EXISTS on_auth_user_updated_sync_profile ON auth.users;
CREATE TRIGGER on_auth_user_updated_sync_profile
  AFTER UPDATE ON auth.users
  FOR EACH ROW 
  WHEN (OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data)
  EXECUTE FUNCTION public.sync_user_metadata_to_profile();
