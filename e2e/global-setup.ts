import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const AUTH_FILE = path.join(__dirname, ".auth.json");

export default async function globalSetup() {
  if (!SERVICE_ROLE_KEY) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY not set -- writing empty test credentials (local Supabase may not be running)");
    writeFileSync(AUTH_FILE, JSON.stringify({ email: "", password: "", userId: "" }));
    return;
  }
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const email = `e2e-${Date.now()}@test.example`;
    const password = "test-password-e2e-123";
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`Failed to create test user: ${error.message}`);
    writeFileSync(AUTH_FILE, JSON.stringify({ email, password, userId: data.user.id }));
  } catch (e) {
    console.warn(`Global setup failed (local Supabase may not be running): ${e}`);
    writeFileSync(AUTH_FILE, JSON.stringify({ email: "", password: "", userId: "" }));
  }
}
