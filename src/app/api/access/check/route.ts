import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { userOwnedSkuMap } from "@/lib/access";

/**
 * GET /api/access/check
 * Returns the authenticated user's ownership map for all SKUs.
 * Used by /pricing UI to render "Open" vs "Get" CTA per card.
 *
 * Response: { owned: { scout: bool, forge: bool, prove: bool, bundle: bool, cli: bool } }
 * For unauthenticated users: { owned: { ... all false } } (200, not 401, so the pricing
 * page can render without auth).
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      owned: { scout: false, forge: false, prove: false, bundle: false, cli: false },
    });
  }

  const owned = await userOwnedSkuMap(supabase, user.id);
  return NextResponse.json({ owned });
}
