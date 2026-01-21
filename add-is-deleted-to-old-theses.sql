-- Add is_deleted column to old_theses table (for existing installations)
ALTER TABLE public.old_theses
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- Create index for faster filtering of non-deleted theses
CREATE INDEX IF NOT EXISTS idx_old_theses_is_deleted ON public.old_theses(is_deleted);
