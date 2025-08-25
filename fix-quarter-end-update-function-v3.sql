-- Fix the quarter end calculation function with proper PostgreSQL date arithmetic
-- This version fixes the interval comparison issue

CREATE OR REPLACE FUNCTION public.calculate_quarter_end_date(
  p_earnings_date DATE,
  p_fiscal_year_end VARCHAR(5)
) 
RETURNS DATE AS $$
DECLARE
  fiscal_month INTEGER;
  fiscal_day INTEGER;
  earnings_year INTEGER;
  q4_end_date DATE;
  q3_end_date DATE;
  q2_end_date DATE;
  q1_end_date DATE;
  days_from_q1 INTEGER;
  days_from_q2 INTEGER;
  days_from_q3 INTEGER;
  days_from_q4 INTEGER;
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
  
  -- Get earnings year
  earnings_year := EXTRACT(YEAR FROM p_earnings_date);
  
  -- Calculate the fiscal year end date for the year containing the earnings date
  q4_end_date := make_date(earnings_year, fiscal_month, fiscal_day);
  
  -- If earnings date is after the fiscal year end, use next year's fiscal year end
  IF p_earnings_date > q4_end_date THEN
    q4_end_date := make_date(earnings_year + 1, fiscal_month, fiscal_day);
  END IF;
  
  -- Calculate Q1, Q2, Q3 end dates (3, 6, 9 months before fiscal year end)
  q3_end_date := q4_end_date - INTERVAL '3 months';
  q2_end_date := q4_end_date - INTERVAL '6 months';
  q1_end_date := q4_end_date - INTERVAL '9 months';
  
  -- Determine which quarter the earnings date falls into
  -- Earnings typically happen 1-3 months after quarter end
  IF p_earnings_date >= q1_end_date AND p_earnings_date <= q1_end_date + INTERVAL '3 months' THEN
    RETURN q1_end_date;
  ELSIF p_earnings_date >= q2_end_date AND p_earnings_date <= q2_end_date + INTERVAL '3 months' THEN
    RETURN q2_end_date;
  ELSIF p_earnings_date >= q3_end_date AND p_earnings_date <= q3_end_date + INTERVAL '3 months' THEN
    RETURN q3_end_date;
  ELSIF p_earnings_date >= q4_end_date AND p_earnings_date <= q4_end_date + INTERVAL '3 months' THEN
    RETURN q4_end_date;
  ELSE
    -- If outside normal ranges, find the closest quarter end by calculating days difference
    days_from_q1 := ABS(p_earnings_date - q1_end_date);
    days_from_q2 := ABS(p_earnings_date - q2_end_date);
    days_from_q3 := ABS(p_earnings_date - q3_end_date);
    days_from_q4 := ABS(p_earnings_date - q4_end_date);
    
    -- Return the quarter end with minimum distance
    IF days_from_q1 <= days_from_q2 AND days_from_q1 <= days_from_q3 AND days_from_q1 <= days_from_q4 THEN
      RETURN q1_end_date;
    ELSIF days_from_q2 <= days_from_q3 AND days_from_q2 <= days_from_q4 THEN
      RETURN q2_end_date;
    ELSIF days_from_q3 <= days_from_q4 THEN
      RETURN q3_end_date;
    ELSE
      RETURN q4_end_date;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.calculate_quarter_end_date(DATE, VARCHAR) TO authenticated;

COMMENT ON FUNCTION public.calculate_quarter_end_date IS 'Calculate quarter end date based on earnings date and company fiscal year end';

