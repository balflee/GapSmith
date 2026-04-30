import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { encrypt } from "@/lib/crypto";
import { trackServerEvent } from "@/lib/analytics-server";

export const saveApiKeySchema = z.object({
  provider: z.string().max(200),
  apiKey: z.string().max(5000),
  model: z.string().max(200).optional(),
});

const deleteApiKeySchema = z.object({
  id: z.string().min(1),
});

export type SaveApiKeyResponse = { ok: true };
export type ApiKeyEntry = {
  id: string;
  provider: string;
  model: string | null;
  created_at: string;
  key_preview: string;
};
export type GetApiKeysResponse = { keys: ApiKeyEntry[] };
export type GetApiKeyResponse = { hasKey: boolean; provider: string | null; model: string | null };

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ENCRYPTION_SECRET) {
    console.error("[503] Encryption not configured -- run /deploy to provision credentials");
    return NextResponse.json({ error: "Service not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { provider, apiKey, model } = saveApiKeySchema.parse(body);

    const encryptedKey = await encrypt(apiKey);

    // One row per (user, provider). Migration 013 enforces this with a
    // UNIQUE constraint, so onConflict("user_id,provider") replaces only the
    // matching provider's key and leaves keys for other providers untouched.
    const { error } = await supabase
      .from("api_keys")
      .upsert(
        {
          user_id: user.id,
          provider,
          encrypted_key: encryptedKey,
          model: model ?? null,
          validated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" }
      );

    if (error) {
      // Fallback for envs that haven't applied migration 013 yet — scope the
      // existing-row check to (user_id, provider) so we never wipe other keys.
      const { data: existing } = await supabase
        .from("api_keys")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider", provider)
        .limit(1);

      if (existing && existing.length > 0) {
        const { error: updateError } = await supabase
          .from("api_keys")
          .update({
            encrypted_key: encryptedKey,
            model: model ?? null,
            validated_at: new Date().toISOString(),
          })
          .eq("id", existing[0].id);
        if (updateError) {
          console.error("API key update error:", updateError.message);
          return NextResponse.json({ error: "Failed to save API key" }, { status: 500 });
        }
      } else {
        const { error: insertError } = await supabase
          .from("api_keys")
          .insert({
            user_id: user.id,
            provider,
            encrypted_key: encryptedKey,
            model: model ?? null,
            validated_at: new Date().toISOString(),
          });
        if (insertError) {
          console.error("API key insert error:", insertError.message);
          return NextResponse.json({ error: "Failed to save API key" }, { status: 500 });
        }
      }
    }

    await trackServerEvent("api_key_saved", user.id, { provider, model: model ?? undefined });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("API key save error:", error);
    return NextResponse.json({ error: "Failed to save API key" }, { status: 500 });
  }
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, provider, model, created_at, encrypted_key")
      .eq("user_id", user.id);

    if (error) {
      console.error("API key fetch error:", error.message);
      return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
    }

    const keys: ApiKeyEntry[] = (data ?? []).map((row: { id: string; provider: string; model: string | null; created_at: string; encrypted_key: string }) => ({
      id: row.id,
      provider: row.provider,
      model: row.model,
      created_at: row.created_at,
      key_preview: row.encrypted_key.slice(-6),
    }));

    return NextResponse.json({ keys });
  } catch (error) {
    console.error("API key fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { id } = deleteApiKeySchema.parse(body);

    const { error } = await supabase
      .from("api_keys")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("API key delete error:", error.message);
      return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("API key delete error:", error);
    return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
  }
}
