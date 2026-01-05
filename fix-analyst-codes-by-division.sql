-- Fix get_all_analyst_codes function to only return Investment and Super division users
-- This ensures the analyst dropdown only shows relevant analysts

CREATE OR REPLACE FUNCTION public.get_all_analyst_codes()
RETURNS TABLE(analyst_code TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT up.analyst_code
  FROM public.user_profiles up
  WHERE up.analyst_code IS NOT NULL
    AND up.analyst_code != ''
    AND up.division IN ('Investment', 'Super')
  ORDER BY up.analyst_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_all_analyst_codes() TO authenticated;

COMMENT ON FUNCTION public.get_all_analyst_codes IS 'Get all unique analyst codes from Investment/Super division users, bypassing RLS';
