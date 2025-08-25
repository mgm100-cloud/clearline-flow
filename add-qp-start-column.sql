-- Add QP_Start column to earnings_tracking table
-- QP_Start = quarter_end_date + QP_Drift days from tickers table

-- First, add the QP_Start column
ALTER TABLE public.earnings_tracking 
ADD COLUMN IF NOT EXISTS qp_start_date DATE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_earnings_qp_start_date ON public.earnings_tracking(qp_start_date);

-- Create a function to update QP_Start dates based on quarter_end_date + QP_Drift
CREATE OR REPLACE FUNCTION public.update_qp_start_dates()
RETURNS TEXT AS $$
DECLARE
  updated_count INTEGER := 0;
  earnings_record RECORD;
  qp_drift_days INTEGER;
  calculated_qp_start DATE;
BEGIN
  -- Loop through all earnings records that have quarter_end_date
  FOR earnings_record IN 
    SELECT et.id, et.ticker, et.quarter_end_date
    FROM public.earnings_tracking et
    WHERE et.quarter_end_date IS NOT NULL
  LOOP
    -- Get QP_Drift for this ticker from tickers table
    SELECT t.QP_Drift INTO qp_drift_days
    FROM public.tickers t
    WHERE t.ticker = earnings_record.ticker
    LIMIT 1;
    
    -- If we found QP_Drift, calculate QP_Start date
    IF qp_drift_days IS NOT NULL THEN
      calculated_qp_start := earnings_record.quarter_end_date + INTERVAL '1 day' * qp_drift_days;
      
      -- Update the earnings_tracking record
      UPDATE public.earnings_tracking 
      SET qp_start_date = calculated_qp_start,
          updated_at = NOW()
      WHERE id = earnings_record.id;
      
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  
  RETURN 'Updated ' || updated_count || ' records with QP_Start dates';
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_qp_start_dates() TO authenticated;

-- Add comment to the function
COMMENT ON FUNCTION public.update_qp_start_dates IS 'Calculate and update QP_Start dates based on quarter_end_date + QP_Drift days';

-- Add comment to the new column
COMMENT ON COLUMN public.earnings_tracking.qp_start_date IS 'QP Start date calculated as quarter_end_date + QP_Drift days from tickers table';

-- Create a view for display with reordered columns and renamed headers
CREATE OR REPLACE VIEW public.earnings_tracking_display AS
SELECT 
    et.ticker,
    et.cyq,
    et.qp_start_date AS "QP Start",
    et.quarter_end_date AS "Qrtr End", 
    et.earnings_date AS "Earnings",
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
    et.updated_at
FROM public.earnings_tracking et
ORDER BY et.ticker, et.cyq;

-- Grant select permission on the view to authenticated users
GRANT SELECT ON public.earnings_tracking_display TO authenticated;

-- Add comment to the view
COMMENT ON VIEW public.earnings_tracking_display IS 'Display view for earnings tracking with reordered columns and friendly column names. Ern Days shows as two lines to keep column narrow.';

-- Execute the function to populate QP_Start dates for existing records
SELECT public.update_qp_start_dates();

-- Verify the new column and view
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'earnings_tracking' 
AND column_name = 'qp_start_date';

-- Show sample data from the new view
SELECT * FROM public.earnings_tracking_display LIMIT 5;
