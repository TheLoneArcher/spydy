import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseBrowserClient } from './client/supabase';

// Proxy getter for supabase client so it doesn't break SSR at module import time
export const supabase: ReturnType<typeof createBrowserClient> = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_target, prop) {
    const client = getSupabaseBrowserClient();
    const value = (client as unknown as Record<string, unknown>)[prop as string];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export { getSupabaseBrowserClient };
