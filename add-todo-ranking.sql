-- Add sort_order column to todos table for drag-and-drop ranking
-- Each analyst will have their own ranking (sort_order is per-analyst)

-- Add the sort_order column
ALTER TABLE public.todos 
ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Create index for better performance on sorting
CREATE INDEX IF NOT EXISTS idx_todos_analyst_sort_order ON public.todos(analyst, sort_order);

-- Initialize sort_order for existing todos based on date_entered (oldest first gets lowest sort_order)
-- This ensures existing todos have a starting order
WITH ranked_todos AS (
  SELECT id, analyst, 
         ROW_NUMBER() OVER (PARTITION BY analyst ORDER BY date_entered ASC) as rn
  FROM public.todos
  WHERE is_open = true
)
UPDATE public.todos t
SET sort_order = r.rn
FROM ranked_todos r
WHERE t.id = r.id AND t.sort_order IS NULL;

-- For closed todos, set sort_order to a high number or leave null
UPDATE public.todos
SET sort_order = 999999
WHERE is_open = false AND sort_order IS NULL;

COMMENT ON COLUMN public.todos.sort_order 
IS 'Custom sort order for todos when filtered by analyst. Lower numbers appear first. Used for drag-and-drop reordering.';
