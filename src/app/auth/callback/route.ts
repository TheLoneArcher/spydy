import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function sanitizeRedirectPath(path: string | null): string {
  if (!path) return '/feed';
  // Allow only relative paths starting with a single '/' and not '//'
  if (path.startsWith('/') && !path.startsWith('//')) {
    return path;
  }
  return '/feed';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const errorParam = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');
  const rawNext = url.searchParams.get('next');
  const next = sanitizeRedirectPath(rawNext);

  if (errorParam || errorDescription) {
    const errorUrl = new URL('/', url.origin);
    errorUrl.searchParams.set('error', errorDescription || errorParam || 'Auth verification error');
    return NextResponse.redirect(errorUrl);
  }

  if (!code) {
    const fallbackUrl = new URL('/', url.origin);
    fallbackUrl.searchParams.set('error', 'Missing verification code.');
    return NextResponse.redirect(fallbackUrl);
  }

  const cookieStore = await cookies();
  const redirectTarget = new URL(next, url.origin);
  let response = NextResponse.redirect(redirectTarget);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const errorUrl = new URL('/', url.origin);
    errorUrl.searchParams.set('error', error.message);
    return NextResponse.redirect(errorUrl);
  }

  // Ensure user profile exists
  try {
    await supabase.rpc('ensure_profile');
  } catch {
    // Non-fatal if DB handles via trigger
  }

  return response;
}