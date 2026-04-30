import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { execSync } from "child_process";
import { defineConfig, devices } from "@playwright/test";

function getSupabaseConfig() {
  try {
    // execSync with hardcoded command (no user input) - safe from injection
    const output = execSync("npx supabase status -o json", {
      encoding: "utf-8",
      timeout: 15000,
    });
    const status = JSON.parse(output);
    return {
      url: status.API_URL || "http://127.0.0.1:54321",
      anonKey: status.ANON_KEY,
      serviceRoleKey: status.SERVICE_ROLE_KEY,
    };
  } catch {
    // Fallback: legacy deterministic keys (Supabase CLI <v2.76)
    return {
      url: "http://127.0.0.1:54321",
      anonKey:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
      serviceRoleKey:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
    };
  }
}

const supabase = getSupabaseConfig();
const port = process.env.E2E_PORT || "3099";

// Make keys available to global-setup/teardown (run in Playwright main process, not webServer)
process.env.NEXT_PUBLIC_SUPABASE_URL = supabase.url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabase.anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = supabase.serviceRoleKey;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "html",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL || `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    // Production auth setup -- only active when E2E_BASE_URL and PROD_TEST_EMAIL are set
    ...(process.env.E2E_BASE_URL && process.env.PROD_TEST_EMAIL
      ? [
          {
            name: "prod-auth-setup",
            testMatch: /prod-auth\.setup\.ts/,
            use: { ...devices["Desktop Chrome"] },
          },
        ]
      : []),
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: process.env.PROD_TEST_EMAIL ? ["prod-auth-setup"] : [],
    },
    { name: "Mobile Chrome", use: { ...devices["Pixel 5"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `PORT=${port} npm run dev`,
        url: `http://localhost:${port}`,
        reuseExistingServer: !process.env.CI,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: supabase.url,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anonKey,
          SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
        },
      },
});
