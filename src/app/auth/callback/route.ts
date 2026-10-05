import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const redirectUrl = new URL('/', url.origin)

  if (!code) {
    redirectUrl.searchParams.set('error', 'confirmation_failed')
    return NextResponse.redirect(redirectUrl)
  }

  const cookieStore = await cookies()
  let response = NextResponse.redirect(redirectUrl)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    redirectUrl.searchParams.set('error', 'confirmation_failed')
    redirectUrl.searchParams.set('message', error.message)
    response = NextResponse.redirect(redirectUrl)
  }

  return response
}