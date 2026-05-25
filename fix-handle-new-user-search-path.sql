-- Fix Supabase advisor "Function Search Path Mutable" warning on
-- public.handle_new_user. SECURITY DEFINER functions without a fixed
-- search_path can be hijacked by a user who can create objects in a
-- schema earlier in the resolver's search order. Pinning the path to
-- public, pg_temp prevents that without changing the function body.
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
