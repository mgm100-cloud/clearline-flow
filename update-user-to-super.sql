-- Update your user's division to Super in the user_profiles table
-- Replace 'your-email@clearlinecap.com' with your actual email
UPDATE public.user_profiles 
SET division = 'Super', updated_at = NOW()
WHERE email = 'your-email@clearlinecap.com';

-- Alternatively, if you know your user ID, you can use:
-- UPDATE public.user_profiles 
-- SET division = 'Super', updated_at = NOW()
-- WHERE id = 'your-user-uuid-here';
