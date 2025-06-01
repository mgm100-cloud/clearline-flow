-- Enable Row Level Security (RLS) for auth.users table access
-- This setup ensures proper user management for Clearline Flow

-- Create a function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Set default role if not provided
  IF NEW.raw_user_meta_data ->> 'role' IS NULL THEN
    NEW.raw_user_meta_data = NEW.raw_user_meta_data || '{"role": "readonly"}'::jsonb;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user handling
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create user profiles table (optional - for extended user info)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  analyst_code TEXT,
  role TEXT DEFAULT 'readonly' CHECK (role IN ('readonly', 'readwrite', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS on user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policy for user_profiles - users can only see their own profile
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Create function to create user profile on signup
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, analyst_code, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'analyst_code', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'readonly')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to create profile on user creation
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_user_profile();

-- Update existing table RLS policies to use user roles
-- Update tickers table policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.tickers;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.tickers;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.tickers;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.tickers;

-- Recreate policies with role-based access
CREATE POLICY "Enable read access for authenticated users" ON public.tickers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for readwrite users" ON public.tickers
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND (
      (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' IN ('readwrite', 'admin')
    )
  );

CREATE POLICY "Enable update for readwrite users" ON public.tickers
  FOR UPDATE USING (
    auth.role() = 'authenticated' AND (
      (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' IN ('readwrite', 'admin')
    )
  );

CREATE POLICY "Enable delete for readwrite users" ON public.tickers
  FOR DELETE USING (
    auth.role() = 'authenticated' AND (
      (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' IN ('readwrite', 'admin')
    )
  );

-- Update earnings_data table policies if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'earnings_data') THEN
    DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.earnings_data;
    DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.earnings_data;
    DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.earnings_data;
    DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.earnings_data;

    CREATE POLICY "Enable read access for authenticated users" ON public.earnings_data
      FOR SELECT USING (auth.role() = 'authenticated');

    CREATE POLICY "Enable insert for readwrite users" ON public.earnings_data
      FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND (
          (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' IN ('readwrite', 'admin')
        )
      );

    CREATE POLICY "Enable update for readwrite users" ON public.earnings_data
      FOR UPDATE USING (
        auth.role() = 'authenticated' AND (
          (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' IN ('readwrite', 'admin')
        )
      );

    CREATE POLICY "Enable delete for readwrite users" ON public.earnings_data
      FOR DELETE USING (
        auth.role() = 'authenticated' AND (
          (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' IN ('readwrite', 'admin')
        )
      );
  END IF;
END $$;

-- Update todos table policies if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'todos') THEN
    DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.todos;
    DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.todos;
    DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.todos;
    DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.todos;

    CREATE POLICY "Enable read access for authenticated users" ON public.todos
      FOR SELECT USING (auth.role() = 'authenticated');

    CREATE POLICY "Enable insert for readwrite users" ON public.todos
      FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND (
          (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' IN ('readwrite', 'admin')
        )
      );

    CREATE POLICY "Enable update for readwrite users" ON public.todos
      FOR UPDATE USING (
        auth.role() = 'authenticated' AND (
          (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' IN ('readwrite', 'admin')
        )
      );

    CREATE POLICY "Enable delete for readwrite users" ON public.todos
      FOR DELETE USING (
        auth.role() = 'authenticated' AND (
          (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' IN ('readwrite', 'admin')
        )
      );
  END IF;
END $$;

-- Create function to check user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID DEFAULT auth.uid())
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' INTO user_role;
  RETURN COALESCE(user_role, 'readonly');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_user_role IS 'Get the role of the current user or specified user';

-- Insert initial admin user (update with your email)
-- This should be run after creating your first user account
-- UPDATE auth.users 
-- SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin", "full_name": "Admin User"}'::jsonb
-- WHERE email = 'your-admin-email@example.com'; 