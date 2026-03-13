import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;
let _serviceClient: SupabaseClient | null = null;

// Client-side Supabase client (uses anon key)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_client) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error('Supabase env vars not configured');
      _client = createClient(url, key);
    }
    return (_client as unknown as Record<string, unknown>)[prop as string];
  },
});

// Server-side Supabase client (uses service role key for elevated access)
export function getServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase service env vars not configured');
    _serviceClient = createClient(url, key);
  }
  return _serviceClient;
}
