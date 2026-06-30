import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Typed as SupabaseClient<any> so .from() and .rpc() accept our custom tables/functions
// without needing Supabase-generated types (which require running `supabase gen types`).
let _client: SupabaseClient<any> | null = null;

export function getAdminSupabase(): SupabaseClient<any> {
  if (_client) return _client;

  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      '[Aris] PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono obbligatorie.',
    );
  }

  _client = createClient<any>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _client;
}
