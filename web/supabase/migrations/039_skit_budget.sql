-- Skit intensity budget tracking
-- Token bucket style: capacity 300 points, refills at 0.5 points/sec (300 per 10 min)

CREATE TABLE skit_budget (
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  points numeric NOT NULL DEFAULT 300,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

-- Indexes for lookups
CREATE INDEX idx_skit_budget_org ON skit_budget (org_id);
CREATE INDEX idx_skit_budget_user ON skit_budget (user_id);

-- Enable RLS
ALTER TABLE skit_budget ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own budget row
CREATE POLICY skit_budget_owner_select ON skit_budget
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY skit_budget_owner_insert ON skit_budget
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY skit_budget_owner_update ON skit_budget
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role bypasses RLS for admin/debugging

-- Atomic budget application function
-- Returns: points_before, points_after, allowed, refilled_points
-- If not allowed, points are still refilled but not deducted
CREATE OR REPLACE FUNCTION apply_skit_budget(
  p_org_id uuid,
  p_user_id uuid,
  p_cost numeric,
  p_capacity numeric DEFAULT 300,
  p_refill_per_sec numeric DEFAULT 0.5
)
RETURNS TABLE (
  points_before numeric,
  points_after numeric,
  allowed boolean,
  refilled_points numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_points numeric;
  v_current_updated_at timestamptz;
  v_elapsed_secs numeric;
  v_refilled numeric;
  v_new_points numeric;
  v_allowed boolean;
  v_final_points numeric;
BEGIN
  -- Try to get existing row with lock
  SELECT points, updated_at
  INTO v_current_points, v_current_updated_at
  FROM skit_budget
  WHERE org_id = p_org_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Insert new row with full capacity
    INSERT INTO skit_budget (org_id, user_id, points, updated_at)
    VALUES (p_org_id, p_user_id, p_capacity, now())
    ON CONFLICT (org_id, user_id) DO NOTHING;

    -- Re-select in case of race condition
    SELECT points, updated_at
    INTO v_current_points, v_current_updated_at
    FROM skit_budget
    WHERE org_id = p_org_id AND user_id = p_user_id
    FOR UPDATE;

    -- If still not found (shouldn't happen), use defaults
    IF NOT FOUND THEN
      v_current_points := p_capacity;
      v_current_updated_at := now();
    END IF;
  END IF;

  -- Calculate refill based on elapsed time
  v_elapsed_secs := EXTRACT(EPOCH FROM (now() - v_current_updated_at));
  v_refilled := LEAST(p_capacity - v_current_points, v_elapsed_secs * p_refill_per_sec);
  v_refilled := GREATEST(0, v_refilled); -- Ensure non-negative

  -- Apply refill (capped at capacity)
  v_new_points := LEAST(p_capacity, v_current_points + v_refilled);

  -- Check if we have enough budget
  v_allowed := (v_new_points >= p_cost);

  -- Calculate final points
  IF v_allowed THEN
    v_final_points := v_new_points - p_cost;
  ELSE
    v_final_points := v_new_points; -- Keep refilled points but don't deduct
  END IF;

  -- Update the row
  UPDATE skit_budget
  SET points = v_final_points,
      updated_at = now()
  WHERE org_id = p_org_id AND user_id = p_user_id;

  -- Return results
  RETURN QUERY SELECT
    v_current_points AS points_before,
    v_final_points AS points_after,
    v_allowed AS allowed,
    v_refilled AS refilled_points;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION apply_skit_budget(uuid, uuid, numeric, numeric, numeric) TO authenticated;
