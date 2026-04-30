-- Done-For-You premium order intake. Each row is one $39/$99/$149 order
-- created from /order/[service]: form submission first, then payment, then
-- delivery by our reviewer over a 24-72hr window.
--
-- Distinct from purchases (lifetime SKUs) and agent_jobs (x402 API calls).

CREATE TABLE IF NOT EXISTS dfy_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Which service was ordered + price snapshot
  service text NOT NULL CHECK (service IN ('scout', 'forge', 'prove')),
  amount_cents integer NOT NULL,                  -- 3900 / 9900 / 14900

  -- Contact + brief (collected on the form)
  contact_email text NOT NULL,
  contact_name text,
  brief_sectors text,
  brief_idea text,
  brief_target_market text,
  brief_constraints text,
  brief_what_you_want text,

  -- Payment
  payment_method text CHECK (payment_method IN ('stripe', 'usdc')),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  stripe_session_id text,
  x402_tx_hash text,
  x402_pending_payment_id uuid REFERENCES x402_pending_payments(id),

  -- Workflow status (tracked by us, not the buyer)
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment', 'in_queue', 'in_progress', 'delivered', 'cancelled')),
  internal_notes text,

  -- Optional auth link — anon orders allowed
  user_id uuid REFERENCES auth.users(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_dfy_orders_status        ON dfy_orders(payment_status, status);
CREATE INDEX IF NOT EXISTS idx_dfy_orders_user          ON dfy_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_dfy_orders_stripe        ON dfy_orders(stripe_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dfy_orders_tx_hash ON dfy_orders(x402_tx_hash) WHERE x402_tx_hash IS NOT NULL;

ALTER TABLE dfy_orders ENABLE ROW LEVEL SECURITY;

-- Buyers can read their own orders (when authenticated).
DROP POLICY IF EXISTS "dfy_orders_select_own" ON dfy_orders;
CREATE POLICY "dfy_orders_select_own" ON dfy_orders
  FOR SELECT USING (auth.uid() = user_id);

-- Anon order creation goes through service-role API routes only — no
-- direct INSERT/UPDATE policies for authenticated/anon roles. Service
-- role bypasses RLS automatically.

COMMENT ON TABLE dfy_orders IS
  'Done-For-You premium service orders. Form-collected brief + payment + delivery workflow.';
