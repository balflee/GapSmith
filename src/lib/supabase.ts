import { createBrowserClient } from "@supabase/ssr";

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
  // Demo seed data: 3 generic rows for populated UI in demo mode.
  // Pages render real-looking data instead of empty states.
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
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
      },
      {
        get: (target, prop) =>
          prop in target
            ? target[prop as keyof typeof target]
            : () => Promise.resolve({ data: {}, error: null }),
      }
    ),
    rpc: () => chainable({ data: null, error: null }),
  } as unknown as ReturnType<typeof createBrowserClient>;
}

export function createClient() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return createDemoClient();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key"
  );
}
