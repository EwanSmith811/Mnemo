import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  return value;
}

function getSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(
      getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    );
  }

  return browserClient;
}

function getSupabaseAdminClient(): SupabaseClient {
  if (!adminClient) {
    const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    adminClient = serviceRoleKey
      ? createClient(url, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : createClient(url, getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  }

  return adminClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof SupabaseClient];
  },
});

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseAdminClient()[prop as keyof SupabaseClient];
  },
});
