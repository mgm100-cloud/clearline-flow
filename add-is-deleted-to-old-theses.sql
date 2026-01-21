-- Add is_deleted column to old_theses table (for existing installations)
ALTER TABLE public.old_theses
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- Create index for faster filtering of non-deleted theses
CREATE INDEX IF NOT EXISTS idx_old_theses_is_deleted ON public.old_theses(is_deleted);

-- Add RLS policy to allow authenticated users to update old theses (for soft delete)
DROP POLICY IF EXISTS "Allow authenticated users to update old theses" ON public.old_theses;
CREATE POLICY "Allow authenticated users to update old theses" ON public.old_theses
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
