-- Fix the update_quarter_end_dates function to properly join with tickers table
-- The original function was trying to access et.ticker which doesn't exist

CREATE OR REPLACE FUNCTION public.update_quarter_end_dates()
RETURNS INTEGER AS $$
DECLARE
  record_count INTEGER := 0;
  earnings_record RECORD;
  fiscal_year_end VARCHAR(5);
  calculated_date DATE;
BEGIN
  -- Update records that don't have quarter_end_date set
  FOR earnings_record IN 
    SELECT et.id, t.ticker, et.earnings_date
    FROM public.earnings_tracking et
    JOIN public.tickers t ON et.ticker_id = t.id
    WHERE et.quarter_end_date IS NULL
    AND et.earnings_date IS NOT NULL
  LOOP
    -- Get fiscal year end for this ticker
    SELECT tei.fiscal_year_end INTO fiscal_year_end
    FROM public.tickers_extra_info tei
    WHERE tei.ticker = earnings_record.ticker
    LIMIT 1;
    
    -- Calculate quarter end date
    calculated_date := public.calculate_quarter_end_date(earnings_record.earnings_date, fiscal_year_end);
    
    -- Update the record
    UPDATE public.earnings_tracking
    SET quarter_end_date = calculated_date,
        updated_at = NOW()
    WHERE id = earnings_record.id;
    
    record_count := record_count + 1;
  END LOOP;
  
  RETURN record_count;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on the update function
GRANT EXECUTE ON FUNCTION public.update_quarter_end_dates() TO authenticated;

COMMENT ON FUNCTION public.update_quarter_end_dates IS 'Update quarter_end_date for existing earnings_tracking records that do not have it set';
