-- Add sort_order column to todos table for drag-and-drop ranking
-- Each analyst will have their own ranking (sort_order is per-analyst)
-- Lower sort_order = higher priority (appears first in list)

-- Add the sort_order column
ALTER TABLE public.todos 
ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Create index for better performance on sorting
CREATE INDEX IF NOT EXISTS idx_todos_analyst_sort_order ON public.todos(analyst, sort_order);

-- Initialize sort_order for existing todos: NEWEST first (newest gets sort_order 1)
-- This ensures existing todos have a starting order with newest at the top
WITH ranked_todos AS (
  SELECT id, analyst, 
         ROW_NUMBER() OVER (PARTITION BY analyst ORDER BY date_entered DESC) as rn
  FROM public.todos
  WHERE is_open = true
)
UPDATE public.todos t
SET sort_order = r.rn
FROM ranked_todos r
WHERE t.id = r.id;

-- For closed todos, set sort_order to a high number
UPDATE public.todos
SET sort_order = 999999
WHERE is_open = false;

COMMENT ON COLUMN public.todos.sort_order 
IS 'Custom sort order for todos when filtered by analyst. Lower numbers appear first (highest rank). Used for drag-and-drop reordering.';
