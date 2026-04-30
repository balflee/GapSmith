import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function createDemoClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chainable = (terminal: unknown): any =>
    new Proxy(() => terminal, {
      get: (_, prop) => {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(terminal);
        if (prop === "single") return () => chainable({ data: null, error: null });
        return chainable(terminal);
      },
      apply: () => chainable(terminal),
    });
  const DEMO_SEED_DATA = [
    { id: "demo-1", name: "Sample Item 1", status: "active", created_at: new Date(Date.now() - 86400000 * 3).toISOString(), user_id: "demo-user-id" },
    { id: "demo-2", name: "Sample Item 2", status: "active", created_at: new Date(Date.now() - 86400000 * 1).toISOString(), user_id: "demo-user-id" },
    { id: "demo-3", name: "Sample Item 3", status: "pending", created_at: new Date().toISOString(), user_id: "demo-user-id" },
  ];
  const query = () => chainable({ data: DEMO_SEED_DATA, error: null });
  const demoUser = {
    id: "demo-user-id",
    email: "demo@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
  return {
    from: () => ({
      select: query,
      insert: query,
      update: query,
      delete: query,
      upsert: query,
    }),
    auth: new Proxy(
      {
        getUser: () =>
          Promise.resolve({ data: { user: demoUser }, error: null }),
        getSession: () =>
          Promise.resolve({
            data: { session: { user: demoUser, access_token: "demo-token", refresh_token: "demo-refresh", expires_at: Date.now() + 3600 } },
            error: null,
          }),
        signUp: () =>
          Promise.resolve({
            data: { user: demoUser, session: { access_token: "demo-token", refresh_token: "demo-refresh" } },
            error: null,
          }),
        signInWithPassword: () =>
          Promise.resolve({ data: { user: demoUser, session: { access_token: "demo-token", refresh_token: "demo-refresh" } }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
        resetPasswordForEmail: () => Promise.resolve({ data: {}, error: null }),
      },
      {
        get: (target, prop) =>
          prop in target
            ? target[prop as keyof typeof target]
            : () => Promise.resolve({ data: {}, error: null }),
      }
    ),
    rpc: () => chainable({ data: null, error: null }),
  } as unknown as ReturnType<typeof createServerClient>;
}

export async function createServerSupabaseClient() {
  if (process.env.DEMO_MODE === "true" && !!process.env.RAILWAY_ENVIRONMENT) {
    throw new Error("DEMO_MODE is not allowed in production");
  }
  if (process.env.DEMO_MODE === "true") return createDemoClient();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

export function createServiceRoleClient() {
  if (process.env.DEMO_MODE === "true" && !!process.env.RAILWAY_ENVIRONMENT) {
    throw new Error("DEMO_MODE is not allowed in production");
  }
  if (process.env.DEMO_MODE === "true") return createDemoClient();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    serviceRoleKey
  );
}
