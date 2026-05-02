import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdmin, getAdminRoleSource } from '@/lib/isAdmin'
import { SUPABASE_COOKIE_OPTIONS } from '@/lib/supabase/cookie-options'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-correlation-id, x-api-key',
  'Access-Control-Max-Age': '86400',
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const isApiRoute = path.startsWith('/api/')

  // Handle CORS preflight for API routes (no session needed)
  if (isApiRoute && request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
  }

  // Skip session refresh for public pages and API routes that use API keys (not cookies)
  const skipSession =
    path.startsWith('/api/cron/') ||
    path.startsWith('/api/webhooks/') ||
    path.startsWith('/api/internal/') ||
    path === '/pricing' ||
    path === '/features' ||
    path === '/about' ||
    path === '/transcribe' ||
    path === '/tools'

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Only refresh Supabase session for routes that need it
  let user = null
  if (!skipSession) {
    // Uses the same SUPABASE_COOKIE_OPTIONS as lib/supabase/server.ts so that
    // cookies produced here and in route handlers have identical attributes.
    // Middleware must create its own client (not use createServerSupabaseClient)
    // because it works with request/response cookies, not next/headers cookies().
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: SUPABASE_COOKIE_OPTIONS,
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => {
              request.cookies.set(name, value)
            })
            response = NextResponse.next({
              request: { headers: request.headers },
            })
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    // getUser() verifies the JWT with Supabase (not just local decode)
    const { data } = await supabase.auth.getUser()
    user = data.user

    // Protect /admin/* and /mission-control/* — require authentication server-side
    if (path.startsWith('/admin/') || path.startsWith('/mission-control/') || path === '/admin') {
      const hasSbCookie = request.cookies.getAll().some((c) => c.name.startsWith('sb-'))
      console.log('[AUTH-MW]', {
        path,
        hasSession: !!user,
        userId: user?.id ?? null,
        email: user?.email ?? null,
        roleSource: getAdminRoleSource(user),
        isAdmin: isAdmin(user),
        hasCookie: hasSbCookie,
      })

      // Block unauthenticated users — redirect to /login
      if (!user) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('redirect', path)
        return NextResponse.redirect(loginUrl)
      }
    }
  }

  // Affiliate tracking: capture ?ref= param → 30-day cookie + fire click
  const refCode = request.nextUrl.searchParams.get('ref')
  if (refCode) {
    response.cookies.set('ff_ref', refCode, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const referrer = request.headers.get('referer') || null
    const origin = request.nextUrl.origin
    fetch(`${origin}/api/affiliates/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: refCode, ip, userAgent, referrer }),
    }).catch(() => {})
  }

  // Add CORS headers to API responses
  if (isApiRoute) {
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value)
    }
    return response
  }

  // Redirect authenticated users from landing page to the Create flow (V1)
  if (user && path === '/') {
    return NextResponse.redirect(new URL('/create', request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Covers /admin/:path*, /mission-control/:path*, all pages, API routes.
    // Excludes static assets.
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
// TODO(2026-05-01): wrap responses for /admin/* with cache-control: no-store, no-cache, must-revalidate
