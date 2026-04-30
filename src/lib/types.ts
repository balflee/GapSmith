// TypeScript types for GapSmith database tables and API contracts
// Generated from supabase/migrations/001_initial.sql and API route schemas

import { z } from "zod";
import type { saveApiKeySchema } from "@/app/api/settings/api-key/route";
import type { startScoutSchema } from "@/app/api/scout/start/route";
import type { startForgeSchema } from "@/app/api/forge/start/route";
import type { startProveSchema } from "@/app/api/prove/start/route";
import type { checkoutSchema } from "@/app/api/checkout/route";
import type { welcomeSchema } from "@/app/api/email/welcome/route";

// --- Database Row Types ---

export interface ApiKeyRow {
  id: string;
  user_id: string;
  provider: string;
  encrypted_key: string;
  model: string | null;
  validated_at: string | null;
  created_at: string;
}

export interface ScoutReportRow {
  id: string;
  user_id: string;
  sectors: unknown; // jsonb -- array of sector strings
  gaps: unknown; // jsonb -- array of gap objects
  pain_clusters: unknown; // jsonb -- array of pain cluster objects
  trends: unknown; // jsonb -- array of trend objects
  daily_brief: string; // markdown -- AI-generated daily brief
  topics: string; // markdown -- AI-generated startup topics
  keywords: unknown; // jsonb -- array of {keyword, count}
  status: string; // "pending" | "running" | "complete" | "error"
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  model: string;
  created_at: string;
}

export interface ForgeSessionRow {
  id: string;
  user_id: string;
  scout_report_id: string | null;
  rounds: unknown; // jsonb -- array of round objects (proposer + defender outputs)
  top_ideas: unknown; // jsonb -- array of top 3 idea objects with Kill/RICE scores
  status: string; // "pending" | "running" | "complete" | "error"
  created_at: string;
}

export interface ProveSessionRow {
  id: string;
  user_id: string;
  idea: string;
  rounds: unknown; // jsonb -- array of debate round objects (agent outputs per phase)
  votes: unknown; // jsonb -- agent voting results
  verdict: string | null; // "APPROVED" | "CONDITIONAL_APPROVED" | "REJECTED"
  report: unknown; // jsonb -- { output: markdown, verdict, vote_summary, model }
  status: string; // "pending" | "running" | "complete" | "error"
  progress: number;
  progress_message: string;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  model: string;
  label: string;
  created_at: string;
}

export interface PurchaseRow {
  id: string;
  user_id: string;
  sku: string; // "scout" | "forge" | "prove" | "bundle" | "cli"
  amount_cents: number;
  stripe_session_id: string | null;
  payment_method: string; // "stripe" | "x402"
  tx_hash: string | null;
  created_at: string;
}

export interface X402PendingPaymentRow {
  id: string;
  user_id: string;
  sku: string;
  amount_sol: number;
  amount_usd_cents: number;
  merchant_wallet: string;
  memo: string;
  status: string; // "pending" | "verified"
  created_at: string;
  tx_hash: string | null;
}

export interface PurchaseCountRow {
  sku: string; // primary key -- matches PurchaseRow.sku values
  count: number;
}

export interface UserStatusRow {
  user_id: string; // uuid references auth.users(id) -- primary key
  email: string;
  name: string;
  created_at: string;
  activated_at: string | null;
  nudge_sent_at: string | null;
}

// --- Backward-compatible aliases (used by scaffold-pages) ---

export type ApiKey = ApiKeyRow;
export type ScoutReport = ScoutReportRow;
export type ForgeSession = ForgeSessionRow;
export type ProveSession = ProveSessionRow;
export type Purchase = PurchaseRow;
export type PurchaseCount = PurchaseCountRow;
export type UserStatus = UserStatusRow;
export type X402PendingPayment = X402PendingPaymentRow;

// --- API Request Types (from route Zod schemas) ---

export type SaveApiKeyRequest = z.infer<typeof saveApiKeySchema>;
export type StartScoutRequest = z.infer<typeof startScoutSchema>;
export type StartForgeRequest = z.infer<typeof startForgeSchema>;
export type StartProveRequest = z.infer<typeof startProveSchema>;
export type CheckoutRequest = z.infer<typeof checkoutSchema>;
export type WelcomeEmailRequest = z.infer<typeof welcomeSchema>;

// --- API Response Types (re-exported from route files) ---

export type { SaveApiKeyResponse, GetApiKeyResponse } from "@/app/api/settings/api-key/route";
export type { StartScoutResponse } from "@/app/api/scout/start/route";
export type { GetScoutReportResponse } from "@/app/api/scout/[id]/route";
export type { StartForgeResponse } from "@/app/api/forge/start/route";
export type { GetForgeSessionResponse } from "@/app/api/forge/[id]/route";
export type { StartProveResponse } from "@/app/api/prove/start/route";
export type { GetProveSessionResponse } from "@/app/api/prove/[id]/route";
export type { CheckoutResponse } from "@/app/api/checkout/route";
export type { WelcomeEmailResponse } from "@/app/api/email/welcome/route";
export type { PricingResponse } from "@/app/api/pricing/route";
