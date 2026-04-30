-- x402 USDC support + atomic counter increment
-- Adds payment_token, amount_usdc_atomic, network columns to x402_pending_payments
-- and an atomic RPC for purchase_counts updates (fixes race in webhook + verify routes).

ALTER TABLE x402_pending_payments
  ADD COLUMN IF NOT EXISTS payment_token text NOT NULL DEFAULT 'sol'
    CHECK (payment_token IN ('sol', 'usdc'));

ALTER TABLE x402_pending_payments
  ADD COLUMN IF NOT EXISTS amount_usdc_atomic bigint;

ALTER TABLE x402_pending_payments
  ADD COLUMN IF NOT EXISTS network text NOT NULL DEFAULT 'mainnet'
    CHECK (network IN ('devnet', 'mainnet'));

COMMENT ON COLUMN x402_pending_payments.payment_token IS
  'sol = native SOL transfer (legacy), usdc = SPL USDC transferChecked';
COMMENT ON COLUMN x402_pending_payments.amount_usdc_atomic IS
  'Amount in USDC atomic units (6 decimals: 4_900_000n = 4.90 USDC). NULL for legacy SOL rows.';
COMMENT ON COLUMN x402_pending_payments.network IS
  'Solana network the payment was quoted/settled on.';

-- Atomic increment for purchase_counts (replaces read-modify-write race)
-- Returns the new count so callers can use it for analytics/UI.
CREATE OR REPLACE FUNCTION increment_purchase_count(sku_input text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO purchase_counts (sku, count) VALUES (sku_input, 1)
  ON CONFLICT (sku) DO UPDATE SET count = purchase_counts.count + 1
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;

COMMENT ON FUNCTION increment_purchase_count IS
  'Atomically increment purchase_counts.count for the given SKU (creates row if missing). Returns new count.';

-- Allow service role to call this RPC (RLS doesn't apply to RPCs, but explicit grant is clearer)
GRANT EXECUTE ON FUNCTION increment_purchase_count(text) TO service_role, authenticated;
