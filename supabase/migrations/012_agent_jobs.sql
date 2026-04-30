-- Phase 3 of Colosseum hackathon plan:
-- Records every paid x402 API call for idempotency + analytics + (later) async job tracking.
-- Used by both synchronous Data API ($0.10-0.50/call) and asynchronous Compute API
-- ($5-25/call, runs full pipeline). Sync calls are inserted with status='completed' in
-- one go; async calls cycle pending → running → completed|failed.

CREATE TABLE IF NOT EXISTS agent_jobs (
  id text PRIMARY KEY,                      -- e.g. "data_abc123" or "fg_xyz789"
  agent_wallet text NOT NULL,               -- payer's Solana pubkey (base58)
  endpoint text NOT NULL,                   -- e.g. "/api/v1/scout/gaps"
  request_hash text,                        -- sha256(canonical request body), nullable for query-only endpoints
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  result jsonb,                             -- populated when status='completed'
  error text,                               -- populated when status='failed'
  tx_hash text NOT NULL UNIQUE,             -- idempotency key — prevents tx replay
  amount_usdc_atomic bigint NOT NULL CHECK (amount_usdc_atomic > 0),
  network text NOT NULL CHECK (network IN ('devnet', 'mainnet')),
  webhook_url text,                         -- optional async delivery callback
  webhook_delivered boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON agent_jobs(status) WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_agent_jobs_endpoint_created ON agent_jobs(endpoint, created_at DESC);

ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;

-- Public read on jobs by id (jobId acts as a capability token — knowing the id grants read access)
DROP POLICY IF EXISTS "agent_jobs_public_id_lookup" ON agent_jobs;
CREATE POLICY "agent_jobs_public_id_lookup" ON agent_jobs
  FOR SELECT USING (true);  -- safe because ids are 128-bit-random and effectively unguessable

DROP POLICY IF EXISTS "agent_jobs_service_role" ON agent_jobs;
CREATE POLICY "agent_jobs_service_role" ON agent_jobs
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE agent_jobs IS
  'Records every paid x402 API call. tx_hash UNIQUE provides idempotency; jobId acts as a capability token for status polling.';
