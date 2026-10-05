import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Allow public routes
  if (pathname === '/') {
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const role = profile?.role ?? 'volunteer'
      return NextResponse.redirect(new URL(role === 'admin' ? '/map' : '/my-tasks', request.url))
    }
    return response
  }

  // Require auth for everything else
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? 'volunteer'

  // Admin-only routes
  const adminRoutes = ['/map', '/tasks', '/volunteers', '/analytics', '/reports', '/resources']
  if (adminRoutes.some(r => pathname.startsWith(r)) && role !== 'admin') {
    return NextResponse.redirect(new URL('/my-tasks', request.url))
  }

  // Volunteer-only routes
  const volunteerRoutes = ['/my-tasks', '/nearby', '/submit-report', '/my-profile']
  if (volunteerRoutes.some(r => pathname.startsWith(r)) && role !== 'volunteer') {
    return NextResponse.redirect(new URL('/map', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
