-- Create earnings tracking display view with dynamically calculated QP_Start
-- QP_Start is calculated as quarter_end_date + QP_Drift days (no physical column added)

-- Create a view for display with reordered columns and dynamic QP_Start calculation
CREATE OR REPLACE VIEW public.earnings_tracking_display AS
SELECT 
    et.ticker,
    et.cyq,
    -- Dynamically calculate QP_Start as quarter_end_date + QP_Drift days
    CASE 
        WHEN et.quarter_end_date IS NOT NULL AND t.QP_Drift IS NOT NULL 
        THEN et.quarter_end_date + INTERVAL '1 day' * t.QP_Drift
        ELSE NULL 
    END AS "QP Start",
    et.quarter_end_date AS "Qrtr End", 
    et.earnings_date AS "Earnings",
    -- Calculate days between earnings and quarter end (2-line display)
    CASE 
        WHEN et.earnings_date IS NOT NULL AND et.quarter_end_date IS NOT NULL 
        THEN et.earnings_date - et.quarter_end_date
        ELSE NULL 
    END AS "Ern<br/>Days",
    et.qp_call_date AS "QP Call",
    et.preview_date AS "Preview",
    et.callback_date AS "Callback",
    et.trade_rec AS "Trade Rec",
    et.trade_level AS "Trade Level",
    et.created_at,
    et.updated_at,
    et.id
FROM public.earnings_tracking et
LEFT JOIN public.tickers t ON et.ticker = t.ticker
ORDER BY et.ticker, et.cyq;

-- Grant select permission on the view to authenticated users
GRANT SELECT ON public.earnings_tracking_display TO authenticated;

-- Add comment to the view
COMMENT ON VIEW public.earnings_tracking_display IS 'Display view for earnings tracking with dynamically calculated QP Start (quarter_end_date + QP_Drift days). Column order: QP Start, Qrtr End, Earnings, Ern Days (2 lines).';

-- Verify the view was created successfully
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_name = 'earnings_tracking_display';

-- Show sample data from the new view
SELECT ticker, cyq, "QP Start", "Qrtr End", "Earnings", "Ern<br/>Days"
FROM public.earnings_tracking_display 
LIMIT 5;
