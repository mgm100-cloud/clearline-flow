-- Add quarter_end_date column to earnings_tracking table
-- This column will cache the calculated quarter end date based on earnings date and fiscal year end

ALTER TABLE public.earnings_tracking 
ADD COLUMN IF NOT EXISTS quarter_end_date DATE;

-- Create index for better performance on quarter_end_date queries
CREATE INDEX IF NOT EXISTS idx_earnings_quarter_end_date ON public.earnings_tracking(quarter_end_date);

-- Create a function to calculate quarter end date based on earnings date and fiscal year end
CREATE OR REPLACE FUNCTION public.calculate_quarter_end_date(
  p_earnings_date DATE,
  p_fiscal_year_end VARCHAR(5)
) 
RETURNS DATE AS $$
DECLARE
  fiscal_month INTEGER;
  fiscal_day INTEGER;
  earnings_year INTEGER;
  earnings_month INTEGER;
  earnings_day INTEGER;
  q1_end_date DATE;
  q2_end_date DATE;
  q3_end_date DATE;
  q4_end_date DATE;
  result_date DATE;
BEGIN
  -- Return NULL if earnings date is not provided
  IF p_earnings_date IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Use default fiscal year end if not provided (December 31st)
  IF p_fiscal_year_end IS NULL OR p_fiscal_year_end = '' THEN
    fiscal_month := 12;
    fiscal_day := 31;
  ELSE
    -- Parse fiscal year end (format: MM/DD)
    fiscal_month := CAST(SPLIT_PART(p_fiscal_year_end, '/', 1) AS INTEGER);
    fiscal_day := CAST(SPLIT_PART(p_fiscal_year_end, '/', 2) AS INTEGER);
  END IF;
  
  -- Get earnings date components
  earnings_year := EXTRACT(YEAR FROM p_earnings_date);
  earnings_month := EXTRACT(MONTH FROM p_earnings_date);
  earnings_day := EXTRACT(DAY FROM p_earnings_date);
  
  -- Calculate the four quarter end dates for the fiscal year
  -- Start with the fiscal year end date for the year containing the earnings date
  q4_end_date := DATE(earnings_year || '-' || LPAD(fiscal_month::TEXT, 2, '0') || '-' || LPAD(fiscal_day::TEXT, 2, '0'));
  
  -- If earnings date is after the fiscal year end, use next year's fiscal year end
  IF p_earnings_date > q4_end_date THEN
    q4_end_date := DATE((earnings_year + 1) || '-' || LPAD(fiscal_month::TEXT, 2, '0') || '-' || LPAD(fiscal_day::TEXT, 2, '0'));
  END IF;
  
  -- Calculate Q1, Q2, Q3 end dates (3, 6, 9 months before fiscal year end)
  q3_end_date := q4_end_date - INTERVAL '3 months';
  q2_end_date := q4_end_date - INTERVAL '6 months';
  q1_end_date := q4_end_date - INTERVAL '9 months';
  
  -- Determine which quarter the earnings date falls into
  -- Earnings typically happen 1-3 months after quarter end
  IF p_earnings_date >= q1_end_date AND p_earnings_date <= q1_end_date + INTERVAL '3 months' THEN
    result_date := q1_end_date;
  ELSIF p_earnings_date >= q2_end_date AND p_earnings_date <= q2_end_date + INTERVAL '3 months' THEN
    result_date := q2_end_date;
  ELSIF p_earnings_date >= q3_end_date AND p_earnings_date <= q3_end_date + INTERVAL '3 months' THEN
    result_date := q3_end_date;
  ELSIF p_earnings_date >= q4_end_date AND p_earnings_date <= q4_end_date + INTERVAL '3 months' THEN
    result_date := q4_end_date;
  ELSE
    -- If outside normal ranges, find the closest quarter end
    IF ABS(EXTRACT(DAYS FROM p_earnings_date - q1_end_date)) <= ABS(EXTRACT(DAYS FROM p_earnings_date - q2_end_date)) THEN
      IF ABS(EXTRACT(DAYS FROM p_earnings_date - q1_end_date)) <= ABS(EXTRACT(DAYS FROM p_earnings_date - q3_end_date)) THEN
        IF ABS(EXTRACT(DAYS FROM p_earnings_date - q1_end_date)) <= ABS(EXTRACT(DAYS FROM p_earnings_date - q4_end_date)) THEN
          result_date := q1_end_date;
        ELSE
          result_date := q4_end_date;
        END IF;
      ELSE
        IF ABS(EXTRACT(DAYS FROM p_earnings_date - q3_end_date)) <= ABS(EXTRACT(DAYS FROM p_earnings_date - q4_end_date)) THEN
          result_date := q3_end_date;
        ELSE
          result_date := q4_end_date;
        END IF;
      END IF;
    ELSE
      IF ABS(EXTRACT(DAYS FROM p_earnings_date - q2_end_date)) <= ABS(EXTRACT(DAYS FROM p_earnings_date - q3_end_date)) THEN
        IF ABS(EXTRACT(DAYS FROM p_earnings_date - q2_end_date)) <= ABS(EXTRACT(DAYS FROM p_earnings_date - q4_end_date)) THEN
          result_date := q2_end_date;
        ELSE
          result_date := q4_end_date;
        END IF;
      ELSE
        IF ABS(EXTRACT(DAYS FROM p_earnings_date - q3_end_date)) <= ABS(EXTRACT(DAYS FROM p_earnings_date - q4_end_date)) THEN
          result_date := q3_end_date;
        ELSE
          result_date := q4_end_date;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN result_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.calculate_quarter_end_date(DATE, VARCHAR) TO authenticated;

COMMENT ON FUNCTION public.calculate_quarter_end_date IS 'Calculate quarter end date based on earnings date and company fiscal year end';
COMMENT ON COLUMN public.earnings_tracking.quarter_end_date IS 'Cached quarter end date calculated from earnings date and fiscal year end';

-- Create a function to update quarter end dates for existing records
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
    SELECT et.id, et.ticker, et.earnings_date
    FROM public.earnings_tracking et
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

-- Run the update function to populate existing records
-- (Comment out if you want to run this manually later)
-- SELECT public.update_quarter_end_dates();
