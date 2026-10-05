import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options })
            response.cookies.set({ name, value, ...options })
          })
        }
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Allow public routes
  if (pathname === '/') {
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!profile) {
        await supabase.auth.signOut()
        return response
      }
      return NextResponse.redirect(new URL(profile.role === 'admin' || profile.role === 'dispatcher' ? '/map' : '/submit-report', request.url))
    }
    return response
  }

  // Require auth for everything else
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/', request.url))
  }
  const role = profile.role

  // Admin-only routes
  const dispatcherRoutes = ['/map', '/tasks', '/volunteers', '/analytics', '/reports', '/resources']
  if (dispatcherRoutes.some(r => pathname === r || pathname.startsWith(`${r}/`)) && role !== 'dispatcher') {
    return NextResponse.redirect(new URL('/submit-report', request.url))
  }

  // Volunteer-only routes
  const volunteerRoutes = ['/my-tasks', '/nearby']
  if (volunteerRoutes.some(r => pathname === r || pathname.startsWith(`${r}/`)) && role !== 'civilian') {
    return NextResponse.redirect(new URL('/map', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
