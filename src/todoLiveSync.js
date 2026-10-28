// Todo List live updates (2026-10-28).
//
// What it does: while the Todo List tab is open and the browser tab is visible, every 5 seconds it asks the
// database two tiny questions about the division on screen - "how many todos and tasks are there, and which ones
// changed last?" - and reloads the list only when that answer moves. So a change made by anyone (in this app, in
// another browser, or in Prism's Flow screen, which writes the same Supabase tables) shows up within a few seconds,
// without pressing Refresh.
//
// It never reloads while the user is in the middle of something: typing in a box, an inline edit open, a row being
// dragged, a save still on its way, or a pop-up open. It skips that tick and looks again on the next one. A reload
// that was already loading when the user saved, opened an edit or started a drag is thrown away when it arrives (its
// rows may be older than the save), and the next check loads again.
//
// Why a "signature" and not Supabase Realtime: Realtime needs the tables added to a database publication (a change
// to the live database) and only sees changes made through it; two small reads every 5 s need nothing new and see
// every writer, Prism's server included.
//
// What the signature relies on (checked 2026-10-28, see the todos/todo_tasks schema): every update in this app and
// in Prism sets `updated_at`, a soft delete or restore also sets it, and a new row gets `updated_at = now()` from the
// column default. A hard delete lowers the row count. So "count + the 20 most recently changed rows (id and
// updated_at)" moves on every add, edit, close, reopen, soft delete, restore, reorder and task delete.
// Why 20 rows and not just the newest one: `updated_at` comes from the clock of the PC that saved. An edit from a PC
// whose clock is a little slow is stamped behind the newest row and would not move a one-row answer; it still lands
// in the newest 20. A PC whose clock runs fast takes only one of the 20 places. An edit stamped further back than the
// 20th row is still missed; the plain reload every 90 s, kept from before, covers that.
import { useEffect, useLayoutEffect, useRef } from 'react';

const FIVE_SECONDS = 5 * 1000;
const THIRTY_SECONDS = 30 * 1000;
const NINETY_SECONDS = 90 * 1000;
const NEWEST_ROWS = 20; // an edit stamped a little in the past (another PC's clock) still lands in this list

// "count:id@updated_at,id@updated_at,..." for one query of the form .select(..., { count: 'exact' }) ... .limit(n)
async function countAndNewest(query) {
  const { data, count, error } = await query;
  if (error) throw error;
  return `${count ?? '?'}:${(data || []).map((r) => `${r.id}@${r.updated_at || ''}`).join(',')}`;
}

// A short string that changes whenever any todo or task of `division` is added, edited or removed.
// Two cheap reads, run together: each returns the 20 newest rows (id and time only, about 1 KB) plus the total row
// count (deleted todos included).
export async function todoSignature(client, division) {
  if (!client || !division) throw new Error('todoSignature needs a Supabase client and a division');
  const newestFirst = { ascending: false, nullsFirst: false };
  const todos = client
    .from('todos')
    .select('id, updated_at', { count: 'exact' })
    .eq('division', division)
    .order('updated_at', newestFirst)
    .order('id', { ascending: false }) // same updated_at on two rows: always pick the same one
    .limit(NEWEST_ROWS);
  // Tasks have no division of their own; join to their todo and filter on its division.
  const tasks = client
    .from('todo_tasks')
    .select('id, updated_at, todos!inner(division)', { count: 'exact' })
    .eq('todos.division', division)
    .order('updated_at', newestFirst)
    .order('id', { ascending: false })
    .limit(NEWEST_ROWS);
  const [todoPart, taskPart] = await Promise.all([countAndNewest(todos), countAndNewest(tasks)]);
  return `${division}|todos ${todoPart}|tasks ${taskPart}`;
}

// ---- "Is the user busy?" -------------------------------------------------------------------------------------------

// Input types you click rather than type into: having one focused is not "typing".
const NOT_TYPING_INPUTS = /^(checkbox|radio|button|submit|reset|range|color|file|image|hidden)$/i;

// True when the focused element inside `root` is somewhere the user types or picks a value. Anything inside an
// element marked data-live-sync-ignore (the analyst filter) does not count: focus stays on that box after a pick.
export function isTypingIn(root, doc = document) {
  const el = doc.activeElement;
  if (!root || !el || el === doc.body || !root.contains(el)) return false;
  if (el.closest('[data-live-sync-ignore]')) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') return !NOT_TYPING_INPUTS.test(el.getAttribute('type') || 'text');
  return !!el.closest('[contenteditable]:not([contenteditable="false"])');
}

// True when a pop-up is open anywhere on the page (Flow's pop-ups are full-screen "fixed inset-0" overlays).
export function isModalOpen(doc = document) {
  return !!doc.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0');
}

// A shared tally of "something is going on, do not reload": open inline edits, saves on their way, drags.
// `generation` counts every hold ever started. A reload that sees it move while its rows were loading knows the user
// saved, opened an edit or started a drag meanwhile, so its rows may be out of date.
export function createBusyCounter() {
  let holds = 0;
  let gen = 0;
  return {
    // Start one hold; returns the function that ends it (safe to call twice).
    hold() {
      holds += 1;
      gen += 1;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          holds -= 1;
        }
      };
    },
    isBusy() {
      return holds > 0;
    },
    generation: () => gen,
  };
}

// While `active` is true, hold `counter` (live updates wait). Each todo row uses it for its open edit box or task drag;
// the hold also ends when the row goes away.
export function useBusyHold(counter, active) {
  useEffect(() => (counter && active ? counter.hold() : undefined), [counter, active]);
}

// Wrap a save handler so live updates wait until the save has finished (successfully or not).
export function trackSave(counter, save) {
  if (typeof save !== 'function') return save;
  return async (...args) => {
    const release = counter.hold();
    try {
      return await save(...args);
    } finally {
      release();
    }
  };
}

// ---- The 5-second check --------------------------------------------------------------------------------------------

// Runs the check while `enabled` (Todo List tab open and signed in) and the browser tab is visible.
//   division   - the division on screen; a new division starts over with a fresh baseline.
//   refresh    - reloads the list: refresh(division, canApply) -> Promise. When the rows arrive, the reload must ask
//                canApply() and, if it says no, leave the screen alone and resolve to false (it is tried again on
//                the next check).
//   isBusy     - () => true while the user is editing, dragging, saving or has a pop-up open.
//   generation - optional, () => a number that moves whenever the user starts something (busy counter's generation).
// The first answer after starting is only a baseline (the page is loading the list itself at the same moment). The
// next check reloads once anyway, in case a change was saved between the page's own load and that first answer.
// After 3 failed checks in a row it slows to one check every 30 s, and goes back to 5 s after the next success.
export function useTodoLiveSync({
  enabled,
  division,
  client,
  refresh,
  isBusy,
  generation,
  getSignature = todoSignature,
  intervalMs = FIVE_SECONDS,
  backoffMs = THIRTY_SECONDS,
  failuresBeforeBackoff = 3,
  fullRefreshMs = NINETY_SECONDS,
}) {
  // Read the newest refresh/isBusy/generation at check time, without restarting the timer on every render.
  const refreshRef = useRef(refresh);
  const isBusyRef = useRef(isBusy);
  const generationRef = useRef(generation);
  useLayoutEffect(() => {
    refreshRef.current = refresh;
    isBusyRef.current = isBusy;
    generationRef.current = generation;
  });

  useEffect(() => {
    if (!enabled || !division || !client) return undefined;

    let stopped = false;
    let running = false;
    let timer = null;
    let failures = 0;
    let lastSignature = null; // null = no baseline yet
    let lastRefreshAt = 0; // "never": the first check after the baseline reloads once (see above), then every 90 s
    const pageVisible = () => document.visibilityState === 'visible';
    const busy = () => (isBusyRef.current ? isBusyRef.current() : false);
    const currentGeneration = () => (generationRef.current ? generationRef.current() : 0);

    const schedule = () => {
      clearTimeout(timer);
      timer = null;
      if (stopped || !pageVisible()) return; // hidden: wait for the tab to come back
      timer = setTimeout(check, failures >= failuresBeforeBackoff ? backoffMs : intervalMs);
    };

    const check = async () => {
      timer = null;
      if (stopped || running || !pageVisible()) return; // never two checks at once
      running = true;
      try {
        const signature = await getSignature(client, division);
        if (stopped) return;
        if (lastSignature === null) {
          lastSignature = signature;
        } else if (signature !== lastSignature || Date.now() - lastRefreshAt >= fullRefreshMs) {
          if (!busy()) {
            // The reload's rows may go on screen only if, when they arrive, the user is still not busy and has not
            // saved, opened an edit or started a drag while they loaded (any of those moves the generation).
            const startedAt = currentGeneration();
            const canApply = () => !busy() && currentGeneration() === startedAt;
            const applied = await refreshRef.current(division, canApply);
            if (applied !== false) {
              // Remember the answer from BEFORE the reload: anything saved during it shows up on the next check.
              lastSignature = signature;
              lastRefreshAt = Date.now();
            }
            // Thrown away (false): keep the old answer, so the next check loads again.
          }
          // Busy: keep the old answer, so the next check still sees the change and reloads then.
        }
        failures = 0;
      } catch (error) {
        failures += 1;
        if (failures === failuresBeforeBackoff) {
          console.warn(`Todo live updates: ${failures} checks failed in a row, now checking every ${backoffMs / 1000} s`, error);
        }
      } finally {
        running = false;
        schedule();
      }
    };

    const checkNow = () => {
      clearTimeout(timer);
      timer = null;
      check();
    };

    // Coming back to the browser tab or window: look straight away instead of waiting for the timer. (A check that is
    // already running just carries on; going hidden needs nothing here, the next check sees it and stops.)
    const onWake = () => {
      if (pageVisible()) checkNow();
    };

    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    checkNow(); // take the baseline now

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [enabled, division, client, getSignature, intervalMs, backoffMs, failuresBeforeBackoff, fullRefreshMs]);
}
