// Tests for the Todo List live updates (src/todoLiveSync.js). No network: Supabase is a small in-memory fake.
import { useRef } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import {
  todoSignature,
  isTypingIn,
  isModalOpen,
  createBusyCounter,
  trackSave,
  useBusyHold,
  useTodoLiveSync,
} from './todoLiveSync';

// ---- A tiny in-memory stand-in for the two PostgREST reads todoSignature makes ------------------------------------

function makeDb() {
  let clock = Date.parse('2026-10-28T09:00:00.000Z');
  let nextId = 100;
  const now = () => new Date((clock += 1000)).toISOString(); // every write is one second after the last
  const db = { todos: [], todo_tasks: [], calls: [] };

  db.addTodo = (division, extra = {}) => {
    const row = { id: nextId++, division, is_open: true, is_deleted: false, sort_order: 1, created_at: now(), ...extra };
    row.updated_at = row.created_at; // column default now()
    db.todos.push(row);
    return row;
  };
  db.updateTodo = (id, changes) => Object.assign(db.todos.find((t) => t.id === id), changes, { updated_at: now() });
  db.hardDeleteTodo = (id) => {
    db.todos = db.todos.filter((t) => t.id !== id);
    db.todo_tasks = db.todo_tasks.filter((t) => t.todo_id !== id); // ON DELETE CASCADE
  };
  db.addTask = (todoId, extra = {}) => {
    const row = { id: nextId++, todo_id: todoId, description: 'x', created_at: now(), ...extra };
    row.updated_at = row.created_at;
    db.todo_tasks.push(row);
    return row;
  };
  db.updateTask = (id, changes) => Object.assign(db.todo_tasks.find((t) => t.id === id), changes, { updated_at: now() });
  db.deleteTask = (id) => {
    db.todo_tasks = db.todo_tasks.filter((t) => t.id !== id);
  };

  // supabase-js shaped: from(table).select(cols, opts).eq(col, v).order(col, opts)....limit(n), awaited.
  db.client = {
    from(table) {
      const q = { table, filters: [], orders: [], limit: Infinity };
      const builder = {
        select(cols, opts) { q.cols = cols; q.opts = opts; return builder; },
        eq(col, value) { q.filters.push([col, value]); return builder; },
        order(col, opts) { q.orders.push([col, opts]); return builder; },
        limit(n) { q.limit = n; return builder; },
        then(resolve, reject) {
          db.calls.push(q);
          if (db.failWith) return Promise.resolve({ data: null, count: null, error: db.failWith }).then(resolve, reject);
          let rows = db[table].slice();
          for (const [col, value] of q.filters) {
            if (col === 'todos.division') {
              rows = rows.filter((r) => (db.todos.find((t) => t.id === r.todo_id) || {}).division === value);
            } else {
              rows = rows.filter((r) => r[col] === value);
            }
          }
          const count = rows.length;
          rows.sort((a, b) => {
            for (const [col, { ascending }] of q.orders) {
              if (a[col] === b[col]) continue;
              return (a[col] < b[col] ? -1 : 1) * (ascending ? 1 : -1);
            }
            return 0;
          });
          const data = rows.slice(0, q.limit).map((r) => ({ id: r.id, updated_at: r.updated_at }));
          return Promise.resolve({ data, count: q.opts && q.opts.count === 'exact' ? count : null, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return db;
}

describe('todoSignature', () => {
  test('asks for exactly two small reads: todos and tasks of one division, count + newest 20 rows', async () => {
    const db = makeDb();
    db.addTodo('Ops');
    await todoSignature(db.client, 'Ops');
    expect(db.calls).toHaveLength(2);
    const [todos, tasks] = db.calls;
    expect(todos).toMatchObject({ table: 'todos', opts: { count: 'exact' }, filters: [['division', 'Ops']], limit: 20 });
    expect(todos.orders[0]).toEqual(['updated_at', { ascending: false, nullsFirst: false }]);
    expect(tasks).toMatchObject({ table: 'todo_tasks', opts: { count: 'exact' }, filters: [['todos.division', 'Ops']], limit: 20 });
    expect(tasks.cols).toContain('todos!inner(division)');
  });

  test("an edit stamped behind the newest row (another PC's clock) still changes the answer", async () => {
    const db = makeDb();
    const a = db.addTodo('Ops'); // stamped 09:00:01
    const b = db.addTodo('Ops'); // stamped 09:00:02
    const t1 = db.addTask(a.id);
    const t2 = db.addTask(a.id);
    // Saved from a PC whose clock runs 2 minutes fast: these are now the newest rows by far.
    a.updated_at = '2026-10-28T09:02:00.000Z';
    t1.updated_at = '2026-10-28T09:02:00.000Z';
    let before = await todoSignature(db.client, 'Ops');

    b.updated_at = '2026-10-28T09:00:05.000Z'; // then Prism, whose clock is right, edits todo b
    let after = await todoSignature(db.client, 'Ops');
    expect(after).not.toBe(before);

    before = after;
    t2.updated_at = '2026-10-28T09:00:06.000Z'; // ...and task t2
    after = await todoSignature(db.client, 'Ops');
    expect(after).not.toBe(before);
  });

  test('changes on every kind of todo and task change, and only then', async () => {
    const db = makeDb();
    const a = db.addTodo('Investment');
    const b = db.addTodo('Investment');
    const t1 = db.addTask(a.id);
    const t2 = db.addTask(a.id);
    db.addTask(b.id);

    const seen = new Set();
    let last = await todoSignature(db.client, 'Investment');
    seen.add(last);
    expect(await todoSignature(db.client, 'Investment')).toBe(last); // nothing changed: same answer

    const changes = {
      'add a todo': () => db.addTodo('Investment'),
      'edit a todo': () => db.updateTodo(a.id, { ticker: 'AAPL' }),
      'close a todo': () => db.updateTodo(a.id, { is_open: false }),
      'reopen a todo': () => db.updateTodo(a.id, { is_open: true }),
      'reorder todos': () => db.updateTodo(b.id, { sort_order: 0 }),
      'soft-delete a todo': () => db.updateTodo(b.id, { is_deleted: true }),
      'restore a todo': () => db.updateTodo(b.id, { is_deleted: false }),
      'add a task': () => db.addTask(b.id),
      'edit a task': () => db.updateTask(t1.id, { status: 'waiting on IR' }),
      'reorder tasks': () => db.updateTask(t2.id, { sort_order: 0 }),
      'delete a task (hard)': () => db.deleteTask(t2.id),
      'delete a todo for good': () => db.hardDeleteTodo(a.id),
    };
    for (const [name, change] of Object.entries(changes)) {
      change();
      const next = await todoSignature(db.client, 'Investment');
      expect({ name, changed: next !== last }).toEqual({ name, changed: true });
      expect({ name, fresh: !seen.has(next) }).toEqual({ name, fresh: true });
      seen.add(next);
      last = next;
    }
  });

  test('a change in another division does not move this one', async () => {
    const db = makeDb();
    db.addTodo('Ops');
    const eng = db.addTodo('Engineering');
    const before = await todoSignature(db.client, 'Ops');
    db.updateTodo(eng.id, { ticker: 'X' });
    db.addTask(eng.id);
    db.addTodo('Engineering');
    expect(await todoSignature(db.client, 'Ops')).toBe(before);
  });

  test('a delete and an add in the same moment still show (count alone would not)', async () => {
    const db = makeDb();
    const a = db.addTodo('Ops');
    const before = await todoSignature(db.client, 'Ops');
    db.hardDeleteTodo(a.id);
    db.addTodo('Ops');
    expect(await todoSignature(db.client, 'Ops')).not.toBe(before);
  });

  test('a database error is thrown, not hidden in the signature', async () => {
    const db = makeDb();
    db.failWith = new Error('JWT expired');
    await expect(todoSignature(db.client, 'Ops')).rejects.toThrow('JWT expired');
  });
});

// ---- Busy detection ------------------------------------------------------------------------------------------------

// These helpers read the DOM themselves, so their tests build and focus plain DOM nodes directly.
/* eslint-disable testing-library/no-node-access */
describe('isTypingIn / isModalOpen', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('counts text boxes, text areas, drop-downs and editable text inside the page only', () => {
    document.body.innerHTML = `
      <div id="page">
        <input id="text" type="text"><input id="plain"><input id="box" type="checkbox">
        <textarea id="area"></textarea><select id="pick"><option>a</option></select>
        <div id="rich" contenteditable="true" tabindex="0"></div>
        <span data-live-sync-ignore><select id="filter"><option>a</option></select></span>
        <button id="btn">Refresh</button>
      </div>
      <input id="outside" type="text">`;
    const page = document.getElementById('page');
    const focused = (id) => {
      document.getElementById(id).focus();
      return isTypingIn(page);
    };
    expect(focused('text')).toBe(true);
    expect(focused('plain')).toBe(true);
    expect(focused('area')).toBe(true);
    expect(focused('pick')).toBe(true);
    expect(focused('rich')).toBe(true);
    expect(focused('box')).toBe(false); // ticking a checkbox is not typing
    expect(focused('btn')).toBe(false);
    expect(focused('filter')).toBe(false); // the analyst filter keeps focus after a pick
    expect(focused('outside')).toBe(false);
    document.activeElement.blur();
    expect(isTypingIn(page)).toBe(false);
    expect(isTypingIn(null)).toBe(false);
  });

  test('sees a pop-up overlay or dialog', () => {
    expect(isModalOpen()).toBe(false);
    document.body.innerHTML = '<div class="fixed inset-0 bg-gray-600"></div>';
    expect(isModalOpen()).toBe(true);
    document.body.innerHTML = '<div role="dialog"></div>';
    expect(isModalOpen()).toBe(true);
  });
});
/* eslint-enable testing-library/no-node-access */

describe('busy counter, trackSave, useBusyHold', () => {
  test('a hold ends once, even if released twice', () => {
    const c = createBusyCounter();
    const r1 = c.hold();
    const r2 = c.hold();
    r1();
    r1();
    expect(c.isBusy()).toBe(true);
    r2();
    expect(c.isBusy()).toBe(false);
  });

  test('generation counts every hold ever started; ending a hold does not move it', () => {
    const c = createBusyCounter();
    expect(c.generation()).toBe(0);
    const release = c.hold();
    expect(c.generation()).toBe(1);
    release();
    expect(c.generation()).toBe(1);
    c.hold();
    expect(c.generation()).toBe(2);
  });

  test('trackSave holds while the save is on its way, and lets go on success or failure', async () => {
    const c = createBusyCounter();
    let finish;
    const save = trackSave(c, () => new Promise((resolve) => { finish = resolve; }));
    const p = save('id-1');
    expect(c.isBusy()).toBe(true);
    finish('saved');
    await expect(p).resolves.toBe('saved');
    expect(c.isBusy()).toBe(false);

    const failing = trackSave(c, async () => { throw new Error('offline'); });
    await expect(failing()).rejects.toThrow('offline');
    expect(c.isBusy()).toBe(false);
    expect(trackSave(c, undefined)).toBeUndefined(); // a missing handler stays missing
  });

  test('useBusyHold holds while active and lets go when inactive or unmounted', () => {
    const c = createBusyCounter();
    const { rerender, unmount } = renderHook(({ active }) => useBusyHold(c, active), { initialProps: { active: false } });
    expect(c.isBusy()).toBe(false);
    rerender({ active: true });
    expect(c.isBusy()).toBe(true);
    rerender({ active: false });
    expect(c.isBusy()).toBe(false);
    rerender({ active: true });
    unmount();
    expect(c.isBusy()).toBe(false);
  });
});

// ---- The 5-second loop ---------------------------------------------------------------------------------------------

// Let pending promise callbacks run (the check awaits the signature, then the reload).
async function settle() {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}
async function advance(ms) {
  await act(async () => { jest.advanceTimersByTime(ms); });
  await settle();
}

const CLIENT = {}; // stands in for supabase: one object for the life of the page, like the real one
let visibility = 'visible';
function setVisibility(state) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useTodoLiveSync', () => {
  let signature;
  let getSignature;
  let refresh;
  let busy;

  beforeAll(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });
  beforeEach(() => {
    jest.useFakeTimers();
    visibility = 'visible';
    signature = 'v1';
    busy = false;
    getSignature = jest.fn(async () => signature);
    refresh = jest.fn(async () => {});
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const start = (props = {}) =>
    renderHook((p) => useTodoLiveSync(p), {
      initialProps: { enabled: true, division: 'Ops', client: CLIENT, refresh, isBusy: () => busy, getSignature, ...props },
    });

  test('first answer is only a baseline; a change reloads within 5 s; no change, no reload', async () => {
    start();
    await settle();
    expect(getSignature).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();

    await advance(5000); // the one catch-up reload after the baseline (next test)
    await advance(5000);
    await advance(5000);
    expect(getSignature).toHaveBeenCalledTimes(4);
    expect(refresh).toHaveBeenCalledTimes(1);

    signature = 'v2';
    await advance(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenLastCalledWith('Ops', expect.any(Function));

    await advance(5000); // same answer again: nothing more
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test('a change saved while the page loaded its own list (so already in the baseline) shows at the next check', async () => {
    // The page's first load and the first answer run side by side; a change saved between the two is in the answer
    // but not on screen. The check after the baseline reloads once for that reason, even with the same answer.
    start();
    await settle();
    expect(refresh).not.toHaveBeenCalled();
    await advance(5000);
    expect(getSignature).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("a reload is thrown away if the user saves, opens an edit or drags while it loads; the next check loads again", async () => {
    const counter = createBusyCounter();
    start({ generation: counter.generation, isBusy: () => counter.isBusy() });
    await settle();
    await advance(5000); // the catch-up reload lands with nothing in between
    expect(refresh).toHaveBeenCalledTimes(1);

    let land;
    refresh.mockImplementation((division, canApply) => new Promise((resolve) => {
      land = () => resolve(canApply() ? undefined : false); // what refreshTodos does when the rows arrive
    }));
    signature = 'v2';
    await advance(5000); // reload starts loading
    expect(refresh).toHaveBeenCalledTimes(2);
    const release = counter.hold(); // a save starts...
    release(); // ...and finishes before the reload's rows arrive
    await act(async () => land());
    await settle();

    await advance(5000); // same answer as before, but the last reload was thrown away: load again
    expect(refresh).toHaveBeenCalledTimes(3);
    await act(async () => land()); // nothing in between this time: it is used
    await settle();
    await advance(5000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  test('a reload is also thrown away if the user is busy when its rows arrive', async () => {
    start(); // no generation passed: canApply only asks isBusy
    await settle();
    await advance(5000); // catch-up reload
    let canApplyAtLanding;
    refresh.mockImplementation(async (division, canApply) => {
      busy = true; // the user opened a pop-up while the rows loaded
      canApplyAtLanding = canApply();
      return canApplyAtLanding ? undefined : false;
    });
    signature = 'v2';
    await advance(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(canApplyAtLanding).toBe(false);

    busy = false;
    refresh.mockImplementation(async () => {});
    await advance(5000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  test('waits while the user is busy, then reloads on the next tick after', async () => {
    start();
    await settle();
    busy = true;
    signature = 'v2';
    await advance(5000);
    await advance(5000);
    await advance(5000);
    expect(getSignature).toHaveBeenCalledTimes(4);
    expect(refresh).not.toHaveBeenCalled();

    busy = false;
    await advance(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('reads the newest isBusy on each check (no restart needed)', async () => {
    const { rerender } = start();
    await settle();
    rerender({ enabled: true, division: 'Ops', client: CLIENT, refresh, isBusy: () => true, getSignature });
    signature = 'v2';
    await advance(5000);
    expect(refresh).not.toHaveBeenCalled();
    rerender({ enabled: true, division: 'Ops', client: CLIENT, refresh, isBusy: () => false, getSignature });
    await advance(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(getSignature).toHaveBeenCalledTimes(3); // the rerenders did not restart the loop or retake the baseline
  });

  test('stops while the browser tab is hidden; checks at once when it comes back', async () => {
    start();
    await settle();
    setVisibility('hidden');
    await advance(60000);
    expect(getSignature).toHaveBeenCalledTimes(1);

    signature = 'v2'; // someone changed a todo while this tab was hidden
    await act(async () => setVisibility('visible'));
    await settle();
    expect(getSignature).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('checks at once when the window gets focus', async () => {
    start();
    await settle();
    signature = 'v2';
    await act(async () => window.dispatchEvent(new Event('focus')));
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('does nothing on another tab or signed out (disabled); starts with a fresh baseline when enabled', async () => {
    const { rerender } = start({ enabled: false });
    await advance(30000);
    expect(getSignature).not.toHaveBeenCalled();

    signature = 'v2';
    rerender({ enabled: true, division: 'Ops', client: CLIENT, refresh, isBusy: () => busy, getSignature });
    await settle();
    expect(getSignature).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled(); // first answer after entering is only a baseline

    rerender({ enabled: false, division: 'Ops', client: CLIENT, refresh, isBusy: () => busy, getSignature });
    signature = 'v3';
    await advance(30000);
    expect(getSignature).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  test('a division switch starts over: new baseline, then reloads that division', async () => {
    const { rerender } = start();
    await settle();
    signature = 'eng-1';
    rerender({ enabled: true, division: 'Engineering', client: CLIENT, refresh, isBusy: () => busy, getSignature });
    await settle();
    expect(getSignature).toHaveBeenLastCalledWith(CLIENT, 'Engineering');
    expect(refresh).not.toHaveBeenCalled();
    signature = 'eng-2';
    await advance(5000);
    expect(refresh).toHaveBeenCalledWith('Engineering', expect.any(Function));
  });

  test('backs off to 30 s after 3 failed checks in a row, and recovers on success', async () => {
    getSignature.mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    start();
    await settle(); // failure 1
    await advance(5000); // failure 2
    await advance(5000); // failure 3
    expect(getSignature).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);

    await advance(5000);
    await advance(20000);
    expect(getSignature).toHaveBeenCalledTimes(3); // still waiting: 25 s of 30
    await advance(5000);
    expect(getSignature).toHaveBeenCalledTimes(4);

    getSignature.mockImplementation(async () => signature); // back online
    await advance(30000);
    expect(getSignature).toHaveBeenCalledTimes(5);
    await advance(5000);
    expect(getSignature).toHaveBeenCalledTimes(6); // back to every 5 s
    warn.mockRestore();
  });

  test('a failed reload is retried on the next tick', async () => {
    start();
    await settle();
    signature = 'v2';
    refresh.mockRejectedValueOnce(new Error('timeout'));
    await advance(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
    await advance(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test('never runs two checks at once', async () => {
    let answer;
    getSignature.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    start();
    await settle();
    await advance(60000);
    await act(async () => window.dispatchEvent(new Event('focus')));
    await settle();
    expect(getSignature).toHaveBeenCalledTimes(1);
    await act(async () => answer('v1'));
    await settle();
    await advance(5000);
    expect(getSignature).toHaveBeenCalledTimes(2);
  });

  test('still reloads every 90 s as a safety net (never while busy)', async () => {
    start();
    await settle();
    busy = true;
    await advance(90000);
    expect(refresh).not.toHaveBeenCalled();
    busy = false;
    await advance(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(85000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test('cleans up on unmount: no reload from a check still on its way, no more checks, no listeners', async () => {
    let answer;
    const { unmount } = start();
    await settle();
    signature = 'v2';
    getSignature.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    await advance(5000);
    expect(getSignature).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => answer('v2'));
    await settle();
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => setVisibility('visible'));
    await advance(60000);
    expect(getSignature).toHaveBeenCalledTimes(2);
  });
});

// ---- The pieces together, as the Todo List page wires them -------------------------------------------------------

describe('typing in the page pauses the live update', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function Page({ getSignature, refresh }) {
    const pageRef = useRef(null);
    const counter = useRef(createBusyCounter()).current;
    useTodoLiveSync({
      enabled: true,
      division: 'Ops',
      client: CLIENT,
      getSignature,
      refresh,
      isBusy: () => counter.isBusy() || isTypingIn(pageRef.current) || isModalOpen(),
    });
    return (
      <div ref={pageRef}>
        <textarea data-testid="status" />
      </div>
    );
  }

  test('no reload while a box has focus; reload once it is left', async () => {
    let signature = 'v1';
    const getSignature = jest.fn(async () => signature);
    const refresh = jest.fn(async () => {});
    render(<Page getSignature={getSignature} refresh={refresh} />);
    await settle();
    act(() => screen.getByTestId('status').focus());
    signature = 'v2';
    await advance(5000);
    await advance(5000);
    expect(refresh).not.toHaveBeenCalled();
    act(() => screen.getByTestId('status').blur());
    await advance(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
