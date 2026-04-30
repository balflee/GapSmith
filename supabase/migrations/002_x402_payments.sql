-- Add payment method tracking to purchases
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'stripe';
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS tx_hash text;

-- x402 pending payments
CREATE TABLE IF NOT EXISTS x402_pending_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  sku text NOT NULL,
  amount_sol numeric NOT NULL,
  amount_usd_cents integer NOT NULL,
  merchant_wallet text NOT NULL,
  memo text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  tx_hash text
);

-- Comment
COMMENT ON TABLE x402_pending_payments IS 'Tracks pending x402 Solana micropayments before on-chain verification';

ALTER TABLE x402_pending_payments ENABLE ROW LEVEL SECURITY;

-- RLS: users can read their own pending payments
DROP POLICY IF EXISTS "Users can view own pending payments" ON x402_pending_payments;
CREATE POLICY "Users can view own pending payments" ON x402_pending_payments
  FOR SELECT USING (auth.uid() = user_id);

-- RLS: service role can insert/update (API routes use service role for payment operations)
DROP POLICY IF EXISTS "Service role manages payments" ON x402_pending_payments;
CREATE POLICY "Service role manages payments" ON x402_pending_payments
  FOR ALL USING (auth.role() = 'service_role');
