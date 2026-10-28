// The whole app (ClearlineFlow) on the Todo List tab, so the REAL refreshTodos and the 15-minute app-wide refresh are
// under test, not stand-ins. Sign-in, Supabase, the data layer and the price feed are fakes; nothing leaves the test.
import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './App'; // jest.mock calls below are hoisted above this import

// The live check's two small reads: one row whose updated_at the test moves.
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

// The data layer. The four listed are watched by the test (makeDb gives them their answers: Create React App's
// jest setup wipes mock answers before each test); anything else answers an empty list.
jest.mock('./databaseService', () => {
  const known = { getTodos: jest.fn(), getDeletedTodos: jest.fn(), updateTodoTask: jest.fn(), getTickers: jest.fn() };
  return { DatabaseService: new Proxy(known, { get: (t, k) => (k in t ? t[k] : async () => []) }) };
});

// Signed in, MFA done, Ops division, analyst LT.
jest.mock('./services/authService', () => {
  const user = { id: 'u1', email: 'ops@clearlinecap.com', user_metadata: { analyst_code: 'LT', division: 'Ops' } };
  return {
    AuthService: {
      getCurrentSession: async () => ({ access_token: 't', user }),
      getCurrentUser: async () => user,
      getMFAStatus: async () => 'verified',
      refreshUserData: async (u) => u,
      getUserRole: () => 'readwrite',
      getUserDivision: async () => 'Ops',
      getUserAnalystCode: () => 'LT',
      getUserFullName: () => 'Ops User',
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => {},
      addDivisionToUser: async () => {},
    },
  };
});
jest.mock('./services/twelveDataWebSocket', () => ({
  twelveDataWS: {
    init: () => {},
    connect: () => {},
    disconnect: () => {},
    updateSubscriptions: () => {},
    requestCachedPrices: () => {},
    convertBloombergToTwelveData: (t) => t,
  },
}));
// Other tabs and screens are not under test.
jest.mock('./components/LoginScreen', () => () => null);
jest.mock('./components/MFASetup', () => () => null);
jest.mock('./components/MFAChallenge', () => () => null);
jest.mock('./components/CRM', () => ({ CRM: () => null }));
jest.mock('./components/SuperLLMTab', () => () => null);
jest.mock('jspdf', () => jest.fn());
jest.mock('jspdf-autotable', () => jest.fn());

const { DatabaseService } = jest.requireMock('./databaseService');

async function settle() {
  for (let i = 0; i < 20; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}
async function advance(ms) {
  await act(async () => { jest.advanceTimersByTime(ms); });
  await settle();
}

const ROWS = [
  {
    id: 1, ticker: 'Payroll', analyst: 'LT', division: 'Ops', priority: 'medium', isOpen: true, sortOrder: 1,
    dateEntered: '2026-10-20T00:00:00.000Z',
    tasks: [{ id: 11, description: 'Run payroll', status: '', light: 'red', isComplete: false, sortOrder: 0 }],
  },
];

// A fake database for the todo list. Set holdNext and the next getTodos waits until the test calls held(); it then
// returns the rows the database had when it was asked. A task save changes the rows.
function makeDb() {
  const db = { rows: ROWS, holdNext: false, held: null };
  DatabaseService.getDeletedTodos.mockImplementation(async () => []);
  DatabaseService.getTickers.mockImplementation(async () => []);
  DatabaseService.getTodos.mockImplementation(async () => {
    const rows = db.rows;
    if (!db.holdNext) return rows;
    db.holdNext = false;
    return new Promise((resolve) => { db.held = () => resolve(rows); });
  });
  DatabaseService.updateTodoTask.mockImplementation(async (taskId, updates) => {
    db.rows = db.rows.map((t) => ({ ...t, tasks: t.tasks.map((k) => (k.id === taskId ? { ...k, ...updates } : k)) }));
    return updates;
  });
  return db;
}

describe('the whole app on the Todo List tab', () => {
  let logs;
  beforeEach(() => {
    jest.useFakeTimers();
    global.mockStamp = '2026-10-28T09:00:00.000Z';
    window.localStorage.clear();
    window.localStorage.setItem('clearlineflow_activeTab', JSON.stringify('todos'));
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' }));
    // The app logs a lot while it starts; keep the test output readable.
    logs = ['log', 'info', 'warn', 'error'].map((name) => jest.spyOn(console, name).mockImplementation(() => {}));
  });
  afterEach(() => {
    logs.forEach((spy) => spy.mockRestore());
    jest.useRealTimers();
  });

  async function openApp() {
    const db = makeDb();
    render(<App />);
    await settle();
    await advance(2000); // sign-in finishes (the app waits up to 1.5 s for the user's details)
    expect(screen.getByRole('heading', { name: 'Todo List' })).toBeInTheDocument();
    expect(screen.getByText('Run payroll')).toBeInTheDocument();
    await advance(5000); // the live update's first check and catch-up reload
    await advance(5000);
    return db;
  }
  const greenLight = () => screen.getAllByTitle('Done / on track')[0];

  test('refreshTodos throws away a background reload whose rows arrive after a save finished', async () => {
    const db = await openApp();
    const before = DatabaseService.getTodos.mock.calls.length;
    db.holdNext = true;
    global.mockStamp = '2026-10-28T09:00:07.000Z'; // someone changes something elsewhere
    await advance(5000); // the reload starts and reads the light as red
    expect(DatabaseService.getTodos.mock.calls.length).toBe(before + 1);

    fireEvent.click(greenLight()); // the user turns it green; saved
    await settle();
    expect(greenLight()).toHaveAttribute('aria-pressed', 'true');

    await act(async () => db.held()); // the older rows (red) arrive
    await settle();
    expect(greenLight()).toHaveAttribute('aria-pressed', 'true'); // not painted over

    await advance(5000); // and the next check loads again
    expect(DatabaseService.getTodos.mock.calls.length).toBe(before + 2);
    expect(greenLight()).toHaveAttribute('aria-pressed', 'true');
  });

  test('a thrown-away reload does not reach the copy the tab shows first when it is opened again', async () => {
    const db = await openApp();
    db.holdNext = true;
    global.mockStamp = '2026-10-28T09:00:07.000Z';
    await advance(5000); // a reload starts (reads red)
    fireEvent.click(greenLight()); // saved green
    await settle();
    await act(async () => db.held()); // the older rows arrive and are thrown away
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'SuperLLM' })); // leave the tab...
    await settle();
    db.holdNext = true;
    fireEvent.click(screen.getByRole('button', { name: 'Todo List' })); // ...and come back
    await settle();
    // While its own load is on the way, the tab shows the copy it kept for this division: it must hold the save.
    expect(greenLight()).toHaveAttribute('aria-pressed', 'true');
    await act(async () => db.held());
    await settle();
    expect(greenLight()).toHaveAttribute('aria-pressed', 'true');
  });

  test('the 15-minute app-wide refresh leaves the todo list alone while the Todo List tab is open', async () => {
    await openApp();
    // An open edit keeps the live update away, so any todo load from here on is the 15-minute refresh.
    fireEvent.doubleClick(screen.getByText('Status description...'));
    const box = screen.getByPlaceholderText('Status description...');
    fireEvent.change(box, { target: { value: 'waiting on the ba' } });
    const todoLoads = DatabaseService.getTodos.mock.calls.length;
    const tickerLoads = DatabaseService.getTickers.mock.calls.length;

    await advance(15 * 60 * 1000 + 1000);
    expect(DatabaseService.getTodos.mock.calls.length).toBe(todoLoads);
    expect(box).toHaveValue('waiting on the ba');
    expect(DatabaseService.getTickers.mock.calls.length).toBeGreaterThan(tickerLoads); // the 15-minute refresh did run
  });
});
