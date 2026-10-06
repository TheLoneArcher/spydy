import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

let browserClient: any = null;

export function getSupabaseBrowserClient<T = any>() {
  if (typeof window === 'undefined') {
    return createBrowserClient<T>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient<any>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  return browserClient as ReturnType<typeof createBrowserClient<T>>;
}

export type { Database };
