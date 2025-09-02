-- Fix the fiscal year calculation to properly determine which fiscal year the earnings belong to
-- The issue is determining the correct fiscal year end dates for the quarters

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
  base_fiscal_year INTEGER;
  q4_end_date DATE;
  q3_end_date DATE;
  q2_end_date DATE;
  q1_end_date DATE;
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
  
  -- Determine which fiscal year the earnings date falls into
  -- If the earnings date is after the fiscal year end, it's in the next fiscal year
  -- If before, it's in the current fiscal year
  
  -- Create a fiscal year end date for the earnings year
  q4_end_date := make_date(earnings_year, fiscal_month, fiscal_day);
  
  -- If the earnings date is before this fiscal year end, 
  -- then the fiscal year end we want is this year
  -- If after, then we want next year's fiscal year end
  IF p_earnings_date <= q4_end_date THEN
    -- Earnings are in the same calendar year as fiscal year end
    base_fiscal_year := earnings_year;
  ELSE
    -- Earnings are after fiscal year end, so they're in next fiscal year
    base_fiscal_year := earnings_year + 1;
    q4_end_date := make_date(base_fiscal_year, fiscal_month, fiscal_day);
  END IF;
  
  -- Calculate Q1, Q2, Q3 end dates (3, 6, 9 months before fiscal year end)
  q3_end_date := q4_end_date - INTERVAL '3 months';
  q2_end_date := q4_end_date - INTERVAL '6 months';
  q1_end_date := q4_end_date - INTERVAL '9 months';
  
  -- Find which quarter end is most recent but still before the earnings date
  -- Earnings are reported AFTER the quarter ends
  
  IF p_earnings_date > q4_end_date THEN
    -- Earnings are after Q4 end, so they must be for Q4
    RETURN q4_end_date;
  ELSIF p_earnings_date > q3_end_date THEN
    -- Earnings are after Q3 end but before/on Q4 end, so they're for Q3
    RETURN q3_end_date;
  ELSIF p_earnings_date > q2_end_date THEN
    -- Earnings are after Q2 end but before/on Q3 end, so they're for Q2
    RETURN q2_end_date;
  ELSIF p_earnings_date > q1_end_date THEN
    -- Earnings are after Q1 end but before/on Q2 end, so they're for Q1
    RETURN q1_end_date;
  ELSE
    -- Earnings are before all quarters of this fiscal year
    -- So they must be for the previous fiscal year's Q4
    RETURN q4_end_date - INTERVAL '12 months';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.calculate_quarter_end_date(DATE, VARCHAR) TO authenticated;

COMMENT ON FUNCTION public.calculate_quarter_end_date IS 'Calculate quarter end date based on earnings date and company fiscal year end. Earnings dates are matched to the most recent preceding quarter end.';



