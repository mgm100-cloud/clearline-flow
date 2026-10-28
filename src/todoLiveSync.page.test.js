// The real Todo List page with live updates switched on: does it reload when the data moves, and wait while the user
// is editing, dragging or saving? Supabase and the data layer are fakes; nothing leaves the test.
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TodoListPage } from './App'; // jest.mock calls below are hoisted above this import

// The page's live check reads Supabase through this fake: one todo/task row whose updated_at the test moves.
jest.mock('./supabaseClient', () => {
  const mockBuilder = () => {
    const b = {
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: () => b,
      then: (resolve, reject) =>
        Promise.resolve({ data: [{ id: 1, updated_at: global.mockStamp }], count: 1, error: null }).then(resolve, reject),
    };
    return b;
  };
  return { supabase: { from: () => mockBuilder() } };
});
// The PDF export is not under test; the real jsPDF probes a canvas jsdom does not have.
jest.mock('jspdf', () => jest.fn());
jest.mock('jspdf-autotable', () => jest.fn());
jest.mock('./databaseService', () => ({
  DatabaseService: {
    getAnalystEmails: jest.fn(async () => []),
    updateTodoSortOrders: jest.fn(async () => true),
  },
}));

async function settle() {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}
async function advance(ms) {
  await act(async () => { jest.advanceTimersByTime(ms); });
  await settle();
}

const TODOS = [
  {
    id: 1, ticker: 'Payroll', analyst: 'LT', division: 'Ops', priority: 'medium', isOpen: true, sortOrder: 1,
    dateEntered: '2026-10-20T00:00:00.000Z',
    tasks: [{ id: 11, description: 'Run payroll', status: '', light: 'red', isComplete: false, sortOrder: 0 }],
  },
  {
    id: 2, ticker: 'Audit', analyst: 'LT', division: 'Ops', priority: 'low', isOpen: true, sortOrder: 2,
    dateEntered: '2026-10-21T00:00:00.000Z',
    tasks: [{ id: 21, description: 'Send files', status: 'sent', light: 'yellow', isComplete: false, sortOrder: 0 }],
  },
];

const PAGE_PROPS = {
  deletedTodos: [],
  selectedTodoAnalyst: '',
  onSelectTodoAnalyst: () => {},
  onAddTodo: () => {},
  onDeleteTodo: () => {},
  onRestoreTodo: () => {},
  onPermanentlyDeleteTodo: () => {},
  onAddTask: () => {},
  onDeleteTask: () => {},
  onReorderTasks: () => {},
  analysts: ['LT'],
  userRole: 'readwrite',
  currentUser: { id: 'u1', email: 'ops@clearlinecap.com', user_metadata: { analyst_code: 'LT' } },
  tickers: [],
  onNavigateToIdeaDetail: () => {},
  onNavigateToInputWithData: () => {},
  userDivision: 'Ops',
  activeTodoDivision: 'Ops',
  onSetActiveTodoDivision: () => {},
};

function renderPage(props = {}) {
  const handlers = {
    onRefreshTodos: jest.fn(async () => {}),
    onUpdateTask: jest.fn(async () => ({})),
    onUpdateTodo: jest.fn(async () => ({})),
  };
  const utils = render(<TodoListPage {...PAGE_PROPS} todos={TODOS} {...handlers} {...props} />);
  const backgroundReloads = () => handlers.onRefreshTodos.mock.calls.filter((c) => c[1] && c[1].background);
  return { ...utils, handlers, backgroundReloads };
}

// The page as ClearlineFlow runs it, for the "rows arrive late" cases. The list lives in state; a task save writes
// the fake database and then the list (as App.js's updateTask does). A background reload reads the database when it
// starts and is held open until the test calls land(); it then does what refreshTodos does: asks canApply() and, on
// a no, leaves the screen alone and returns false.
function mountLivePage(props = {}) {
  let db = TODOS;
  let setList = null;
  const pending = []; // background reloads still loading, in the order they started
  const landed = []; // 'used' or 'thrown away', in the order they landed
  const onRefreshTodos = jest.fn((division, { background, canApply } = {}) => {
    if (!background) return Promise.resolve();
    const rows = db;
    return new Promise((resolve) => {
      pending.push(() => {
        if (canApply && !canApply()) {
          landed.push('thrown away');
          resolve(false);
          return;
        }
        setList(rows);
        landed.push('used');
        resolve();
      });
    });
  });
  const onUpdateTask = jest.fn(async (todoId, taskId, changes) => {
    db = db.map((t) => (t.id !== todoId ? t : { ...t, tasks: t.tasks.map((k) => (k.id === taskId ? { ...k, ...changes } : k)) }));
    setList(db);
    return {};
  });
  function LivePage() {
    const [todos, setTodos] = useState(TODOS);
    setList = setTodos;
    return <TodoListPage {...PAGE_PROPS} todos={todos} onRefreshTodos={onRefreshTodos} onUpdateTask={onUpdateTask} {...props} />;
  }
  render(<LivePage />);
  return {
    pending,
    landed,
    setDb: (rows) => { db = rows; },
    land: async (i) => {
      await act(async () => pending[i]());
      await settle();
    },
  };
}

describe('Todo List page live updates', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.mockStamp = '2026-10-28T09:00:00.000Z';
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('someone else changes a todo: the page reloads it in the background within 5 s', async () => {
    const { handlers, backgroundReloads } = renderPage();
    await settle();
    expect(handlers.onRefreshTodos).toHaveBeenCalledTimes(1); // the page's own first load
    await advance(5000); // one catch-up reload after the first check (see useTodoLiveSync)
    await advance(5000); // nothing changed: no reload
    expect(backgroundReloads()).toHaveLength(1);

    global.mockStamp = '2026-10-28T09:00:07.000Z';
    await advance(5000);
    expect(backgroundReloads()).toHaveLength(2);
    expect(backgroundReloads()[1]).toEqual(['Ops', { background: true, canApply: expect.any(Function) }]);
  });

  test('an open inline edit holds the reload until it is closed', async () => {
    const { backgroundReloads } = renderPage();
    await settle();
    fireEvent.doubleClick(screen.getByText('Status description...'));
    const box = screen.getByPlaceholderText('Status description...');
    expect(box).toHaveFocus();

    global.mockStamp = '2026-10-28T09:00:07.000Z';
    await advance(5000);
    await advance(5000);
    expect(backgroundReloads()).toHaveLength(0);

    fireEvent.keyDown(box, { key: 'Escape' });
    await advance(5000);
    expect(backgroundReloads()).toHaveLength(1);
  });

  test('a save still on its way holds the reload until it lands', async () => {
    let finishSave;
    const { handlers, backgroundReloads } = renderPage({
      onUpdateTask: jest.fn(() => new Promise((resolve) => { finishSave = resolve; })),
    });
    await settle();
    fireEvent.click(screen.getAllByTitle('In progress')[0]); // traffic light: red -> yellow
    expect(handlers.onUpdateTask).toBeDefined();

    global.mockStamp = '2026-10-28T09:00:07.000Z';
    await advance(5000);
    expect(backgroundReloads()).toHaveLength(0);

    await act(async () => finishSave({}));
    await advance(5000);
    expect(backgroundReloads()).toHaveLength(1);
  });

  test('dragging a todo holds the reload until the drag ends', async () => {
    const { backgroundReloads } = renderPage({ selectedTodoAnalyst: 'LT' });
    await settle();
    const handle = screen.getAllByTitle('Drag to reorder')[0]; // the row's grip; drag events bubble to the row
    fireEvent.dragStart(handle, { dataTransfer: { setData: () => {}, effectAllowed: '' } });

    global.mockStamp = '2026-10-28T09:00:07.000Z';
    await advance(5000);
    expect(backgroundReloads()).toHaveLength(0);

    fireEvent.dragEnd(handle);
    await advance(5000);
    expect(backgroundReloads()).toHaveLength(1);
  });

  test('the analyst filter keeping focus does not hold the reload', async () => {
    const { backgroundReloads } = renderPage();
    await settle();
    const filter = screen.getByDisplayValue('All');
    act(() => filter.focus());
    expect(filter).toHaveFocus();
    global.mockStamp = '2026-10-28T09:00:07.000Z';
    await advance(5000);
    expect(backgroundReloads()).toHaveLength(1);
  });

  test('leaving the tab (unmount) stops the checks', async () => {
    const { unmount, backgroundReloads } = renderPage();
    await settle();
    unmount();
    global.mockStamp = '2026-10-28T09:00:07.000Z';
    await advance(60000);
    expect(backgroundReloads()).toHaveLength(0);
  });

  test('a typed "+ Add task" draft holds the reload until it is added or cancelled; an empty open box does not', async () => {
    const { backgroundReloads } = renderPage();
    await settle();
    await advance(5000); // catch-up reload
    expect(backgroundReloads()).toHaveLength(1);

    fireEvent.click(screen.getAllByText('+ Add task')[0]);
    const box = screen.getByPlaceholderText('New task description');
    act(() => box.blur()); // left open and empty, user clicks elsewhere
    global.mockStamp = '2026-10-28T09:00:07.000Z';
    await advance(5000);
    expect(backgroundReloads()).toHaveLength(2);

    fireEvent.change(box, { target: { value: 'Call the auditor' } }); // typed, then clicked elsewhere
    global.mockStamp = '2026-10-28T09:00:09.000Z';
    await advance(5000);
    await advance(5000);
    expect(backgroundReloads()).toHaveLength(2);
    expect(box).toHaveValue('Call the auditor');

    fireEvent.keyDown(box, { key: 'Escape' }); // cancelled
    await advance(5000);
    expect(backgroundReloads()).toHaveLength(3);
  });
});

describe('Todo List page: a reload whose rows arrive after the user acted is thrown away', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.mockStamp = '2026-10-28T09:00:00.000Z';
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  // Start from a quiet page: the first check and the catch-up reload after it are done and used.
  async function quietLivePage(props) {
    const page = mountLivePage(props);
    await settle();
    await advance(5000);
    await page.land(0);
    expect(page.landed).toEqual(['used']);
    return page;
  }
  const greenLight = () => screen.getAllByTitle('Done / on track')[0];

  test('a save that finishes while a reload loads: the old rows are not shown; the next check loads again', async () => {
    const page = await quietLivePage();
    global.mockStamp = '2026-10-28T09:00:07.000Z'; // someone changes something elsewhere
    await advance(5000); // a reload starts; it read the database before the click below
    expect(page.pending).toHaveLength(2);

    fireEvent.click(greenLight()); // the user turns a light green; the save finishes at once
    await settle();
    expect(greenLight()).toHaveAttribute('aria-pressed', 'true');

    await page.land(1); // the older rows arrive
    expect(page.landed).toEqual(['used', 'thrown away']);
    expect(greenLight()).toHaveAttribute('aria-pressed', 'true'); // the light did not jump back

    await advance(5000); // the change elsewhere is still unseen: load again
    expect(page.pending).toHaveLength(3);
    await page.land(2);
    expect(page.landed).toEqual(['used', 'thrown away', 'used']);
    expect(greenLight()).toHaveAttribute('aria-pressed', 'true'); // the database has green now
  });

  test('an edit opened while a reload loads: the old rows are not shown and the half-typed text stays', async () => {
    const page = await quietLivePage();
    // Prism closes the Payroll todo; the next reload reads that (it would move the row to the Closed table).
    page.setDb(TODOS.map((t) => (t.id === 1 ? { ...t, isOpen: false, dateClosed: new Date().toISOString() } : t)));
    global.mockStamp = '2026-10-28T09:00:07.000Z';
    await advance(5000);
    expect(page.pending).toHaveLength(2);

    fireEvent.doubleClick(screen.getByText('Status description...')); // Payroll's task has no status yet
    const box = screen.getByPlaceholderText('Status description...');
    fireEvent.change(box, { target: { value: 'waiting on the ba' } });

    await page.land(1);
    expect(page.landed).toEqual(['used', 'thrown away']);
    expect(screen.getByPlaceholderText('Status description...')).toBe(box); // same box, not rebuilt
    expect(box).toHaveValue('waiting on the ba');

    fireEvent.keyDown(box, { key: 'Escape' }); // the user cancels: now the reload may land
    await advance(5000);
    expect(page.pending).toHaveLength(3);
    await page.land(2);
    expect(page.landed).toEqual(['used', 'thrown away', 'used']);
  });

  test('a todo drag started while a reload loads: the old rows are not shown', async () => {
    const page = await quietLivePage({ selectedTodoAnalyst: 'LT' });
    global.mockStamp = '2026-10-28T09:00:07.000Z';
    await advance(5000);
    expect(page.pending).toHaveLength(2);

    const handle = screen.getAllByTitle('Drag to reorder')[0];
    fireEvent.dragStart(handle, { dataTransfer: { setData: () => {}, effectAllowed: '' } });
    await page.land(1);
    expect(page.landed).toEqual(['used', 'thrown away']);

    fireEvent.dragEnd(handle);
    await advance(5000);
    expect(page.pending).toHaveLength(3);
  });
});
