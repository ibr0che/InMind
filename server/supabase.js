import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Resolve .env relative to THIS file, not the folder you launched node from.
// This file is server/supabase.js, so the project .env is one level up.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export function requireEnvironment() {
  const required = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

export function createUserClient(accessToken) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

// One shared client for verifying access tokens; it holds no user session.
requireEnvironment();
export const authClient = createUserClient();
