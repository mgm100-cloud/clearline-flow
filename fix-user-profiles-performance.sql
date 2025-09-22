-- Fix user_profiles query performance by creating optimized database function
-- This function bypasses RLS to provide fast user profile lookups

-- Create function to get user profile data efficiently
CREATE OR REPLACE FUNCTION public.get_user_profile_data(user_uuid UUID)
RETURNS TABLE(
  division TEXT,
  analyst_code TEXT,
  role TEXT,
  full_name TEXT
) AS $$
BEGIN
  -- This function runs with SECURITY DEFINER to bypass RLS
  -- but only returns data for the specific user ID passed in
  RETURN QUERY
  SELECT 
    up.division,
    up.analyst_code,
    up.role,
    up.full_name
  FROM public.user_profiles up
  WHERE up.id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_profile_data(UUID) TO authenticated;

-- Add comment explaining the function
COMMENT ON FUNCTION public.get_user_profile_data IS 'Get user profile data efficiently, bypassing RLS performance issues';

-- Create an index on user_profiles.id if it doesn't already exist (it should as PRIMARY KEY)
-- This ensures fast lookups even with many users
CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON public.user_profiles(id);

-- Optional: Create additional index on commonly queried fields for analytics
CREATE INDEX IF NOT EXISTS idx_user_profiles_division ON public.user_profiles(division) WHERE division IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_profiles_analyst_code ON public.user_profiles(analyst_code) WHERE analyst_code IS NOT NULL;
