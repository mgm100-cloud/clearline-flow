-- Adds a traffic-light state to todo_tasks: red / yellow / green.
-- New tasks default to red; the UI text underneath stays as the free-form
-- status description (which now defaults to empty so a placeholder shows).

ALTER TABLE public.todo_tasks
ADD COLUMN IF NOT EXISTS light TEXT;

-- Backfill existing rows from their status text so the visible color
-- matches what users had before.
UPDATE public.todo_tasks
SET light = CASE
  WHEN status = 'Done' THEN 'green'
  WHEN status IN ('In progress', 'Waiting', 'On hold') THEN 'yellow'
  ELSE 'red'
END
WHERE light IS NULL;

ALTER TABLE public.todo_tasks ALTER COLUMN light SET DEFAULT 'red';
ALTER TABLE public.todo_tasks ALTER COLUMN light SET NOT NULL;

-- Enforce valid values at the DB level.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'todo_tasks_light_check'
  ) THEN
    ALTER TABLE public.todo_tasks
      ADD CONSTRAINT todo_tasks_light_check CHECK (light IN ('red', 'yellow', 'green'));
  END IF;
END $$;

-- New tasks should start with an empty status description so the UI
-- placeholder ("Status description...") shows. Existing rows keep
-- whatever they have.
ALTER TABLE public.todo_tasks ALTER COLUMN status DROP DEFAULT;
