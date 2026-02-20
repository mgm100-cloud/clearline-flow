-- Create tickers table
CREATE TABLE IF NOT EXISTS public.tickers (
    id BIGSERIAL PRIMARY KEY,
    ticker VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    date_in VARCHAR(10),
    poke_date VARCHAR(10),
    ls_position VARCHAR(10) DEFAULT 'Long',
    priority VARCHAR(5) DEFAULT 'A',
    status VARCHAR(20) DEFAULT 'New',
    analyst VARCHAR(10),
    source VARCHAR(255),
    thesis TEXT,
    input_price DECIMAL(10,2),
    current_price DECIMAL(10,2),
    market_cap BIGINT,
    adv_3_month BIGINT,
    pt_bear DECIMAL(10,2),
    pt_base DECIMAL(10,2),
    pt_bull DECIMAL(10,2),
    catalyst_date DATE,
    value_or_growth VARCHAR(20),
    ma_target_buyer BOOLEAN DEFAULT FALSE,
    ma_target_valuation BOOLEAN DEFAULT FALSE,
    ma_target_seller BOOLEAN DEFAULT FALSE,
    big_move_revert BOOLEAN DEFAULT FALSE,
    activist BOOLEAN DEFAULT FALSE,
    activist_potential BOOLEAN DEFAULT FALSE,
    insider_trade_signal BOOLEAN DEFAULT FALSE,
    new_mgmt BOOLEAN DEFAULT FALSE,
    spin BOOLEAN DEFAULT FALSE,
    big_acq BOOLEAN DEFAULT FALSE,
    fraud_risk BOOLEAN DEFAULT FALSE,
    regulatory_risk BOOLEAN DEFAULT FALSE,
    cyclical BOOLEAN DEFAULT FALSE,
    non_cyclical BOOLEAN DEFAULT FALSE,
    high_beta BOOLEAN DEFAULT FALSE,
    momo BOOLEAN DEFAULT FALSE,
    self_help BOOLEAN DEFAULT FALSE,
    rate_exposure BOOLEAN DEFAULT FALSE,
    strong_dollar BOOLEAN DEFAULT FALSE,
    extreme_valuation BOOLEAN DEFAULT FALSE,
    terminal_short BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create earnings_tracking table
CREATE TABLE IF NOT EXISTS public.earnings_tracking (
    id BIGSERIAL PRIMARY KEY,
    ticker VARCHAR(20) NOT NULL,
    cyq VARCHAR(10) NOT NULL,
    earnings_date DATE,
    qp_call_date DATE,
    preview_date DATE,
    callback_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(ticker, cyq)
);

-- Create todos table
CREATE TABLE IF NOT EXISTS public.todos (
    id BIGSERIAL PRIMARY KEY,
    ticker VARCHAR(20) NOT NULL,
    analyst VARCHAR(50) NOT NULL,
    date_entered TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_closed TIMESTAMP WITH TIME ZONE,
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    item TEXT NOT NULL,
    is_open BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.tickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON public.tickers
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON public.earnings_tracking
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON public.todos
    FOR ALL USING (auth.role() = 'authenticated');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tickers_ticker ON public.tickers(ticker);
CREATE INDEX IF NOT EXISTS idx_tickers_status ON public.tickers(status);
CREATE INDEX IF NOT EXISTS idx_tickers_analyst ON public.tickers(analyst);
CREATE INDEX IF NOT EXISTS idx_tickers_created_at ON public.tickers(created_at);
CREATE INDEX IF NOT EXISTS idx_earnings_ticker_cyq ON public.earnings_tracking(ticker, cyq);
CREATE INDEX IF NOT EXISTS idx_todos_analyst ON public.todos(analyst);
CREATE INDEX IF NOT EXISTS idx_todos_is_open ON public.todos(is_open);
CREATE INDEX IF NOT EXISTS idx_todos_date_entered ON public.todos(date_entered);
CREATE INDEX IF NOT EXISTS idx_todos_date_closed ON public.todos(date_closed); 