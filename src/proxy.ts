import { createServerClient } from '@supabase/ssr';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

const ROLE_COOKIE_NAME = 'rs_role_cache';
const COOKIE_TTL_SECONDS = 30;

function signingSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to sign the role cache');
  }
  return secret;
}

function signRoleToken(userId: string, role: string, isVolunteer: boolean, expiresAt: number): string {
  const secret = signingSecret();
  const payload = `${userId}:${role}:${isVolunteer ? '1' : '0'}:${expiresAt}`;
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

function verifyRoleToken(token: string, expectedUserId: string): { role: string; isVolunteer: boolean } | null {
  try {
    const secret = signingSecret();
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payload, hmac] = parts;
    const expectedHmac = createHmac('sha256', secret).update(payload).digest('hex');

    const hmacBuf = Buffer.from(hmac);
    const expBuf = Buffer.from(expectedHmac);
    if (hmacBuf.length !== expBuf.length || !timingSafeEqual(hmacBuf, expBuf)) {
      return null;
    }

    const [userId, role, volFlag, expiresAtStr] = payload.split(':');
    if (userId !== expectedUserId) return null;

    const expiresAt = Number(expiresAtStr);
    if (Date.now() > expiresAt) return null;

    return {
      role,
      isVolunteer: volFlag === '1',
    };
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options });
            response.cookies.set({ name, value, ...options });
          });
        },
      },
    }
  );

  const { pathname } = request.nextUrl;

  // Allow completely public routes
  if (pathname === '/api/health' || pathname === '/privacy' || pathname === '/manifest.webmanifest') {
    return response;
  }

  if (pathname.startsWith('/auth/')) {
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Handle landing / login page
  if (pathname === '/') {
    if (user) {
      return NextResponse.redirect(new URL('/feed', request.url));
    }
    return response;
  }

  // Handle set-password page for invited users
  if (pathname === '/set-password') {
    return response;
  }

  // Require auth for everything else
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Determine user role and volunteer status (from signed cookie cache or Supabase)
  let role = 'civilian';
  let isVolunteer = false;

  const roleCookie = request.cookies.get(ROLE_COOKIE_NAME)?.value;
  const verifiedCache = roleCookie ? verifyRoleToken(roleCookie, user.id) : null;

  if (verifiedCache) {
    role = verifiedCache.role;
    isVolunteer = verifiedCache.isVolunteer;
  } else {
    // Read profile with ensure_profile fallback
    let { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', user.id).single();

    if (!profile) {
      // Missing profile row: call ensure_profile RPC
      const { data: createdProfile, error: ensureErr } = await supabase.rpc('ensure_profile');
      if (ensureErr || !createdProfile) {
        await supabase.auth.signOut();
        const errUrl = new URL('/', request.url);
        errUrl.searchParams.set('error', 'Profile initialization failed. Please contact administrator.');
        return NextResponse.redirect(errUrl);
      }
      profile = createdProfile;
    }

    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      const deactUrl = new URL('/', request.url);
      deactUrl.searchParams.set('error', 'Your account has been deactivated. Please contact administrator.');
      return NextResponse.redirect(deactUrl);
    }

    role = profile?.role || 'civilian';

    // Check volunteer status
    const { data: volRow } = await supabase
      .from('volunteer_profiles')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    isVolunteer = Boolean(volRow);

    // Cache in signed short-lived httpOnly cookie
    const expiresAt = Date.now() + COOKIE_TTL_SECONDS * 1000;
    const signedToken = signRoleToken(user.id, role, isVolunteer, expiresAt);
    response.cookies.set(ROLE_COOKIE_NAME, signedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_TTL_SECONDS,
      path: '/',
    });
  }

  // Handle route access rules
  const isAdmin = role === 'admin';
  const isDispatcher = role === 'dispatcher' || isAdmin;

  // 1. Admin-only routes: /admin/*
  if (pathname.startsWith('/admin')) {
    if (!isAdmin) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/feed', request.url));
    }
  }

  // 2. Dispatcher & Admin routes: /dispatch/*
  if (pathname.startsWith('/dispatch')) {
    if (!isDispatcher) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Dispatcher access required' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/feed', request.url));
    }
  }

  // 3. Legacy staff routes redirection (/map, /tasks, /volunteers, /analytics, /resources, /reports)
  const legacyStaffRoutes = ['/map', '/tasks', '/volunteers', '/analytics', '/resources', '/reports'];
  for (const legacy of legacyStaffRoutes) {
    if (pathname === legacy || pathname.startsWith(`${legacy}/`)) {
      if (isDispatcher) {
        const targetPath = `/dispatch${pathname}`;
        return NextResponse.redirect(new URL(targetPath, request.url));
      }
      return NextResponse.redirect(new URL('/feed', request.url));
    }
  }

  // 4. Approved volunteer only routes: /my-tasks
  if (pathname === '/my-tasks' || pathname.startsWith('/my-tasks/')) {
    if (!isVolunteer && !isDispatcher) {
      return NextResponse.redirect(new URL('/volunteer/apply', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
