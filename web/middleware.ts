import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdmin, getAdminRoleSource } from '@/lib/isAdmin'

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
    request: {
      headers: request.headers,
    },
  })

  // Only refresh Supabase session for routes that need it
  let user = null
  if (!skipSession) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => {
              request.cookies.set(name, value)
            })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    // Refresh session if needed
    const { data } = await supabase.auth.getUser()
    user = data.user

    // Debug logging for admin routes — expires 2026-02-25
    if (path.startsWith('/admin/')) {
      const hasSbCookie = request.cookies.getAll().some((c) => c.name.startsWith('sb-'))
      const roleSource = getAdminRoleSource(user as Parameters<typeof getAdminRoleSource>[0])
      console.log(
        `[FF-AUTH] route=${path} hasSession=${!!user} ` +
        `userId=${user?.id ?? 'none'} email=${user?.email ?? 'none'} ` +
        `roleSource=${roleSource} isAdmin=${isAdmin(user as Parameters<typeof isAdmin>[0])} hasSbCookie=${hasSbCookie}`
      )
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

    // Fire-and-forget click tracking
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const referrer = request.headers.get('referer') || null
    const origin = request.nextUrl.origin
    fetch(`${origin}/api/affiliates/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: refCode, ip, userAgent, referrer }),
    }).catch(() => {}) // fire-and-forget
  }

  // Add CORS headers to API responses
  if (isApiRoute) {
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value)
    }
    return response
  }

  // Redirect authenticated users from landing page to dashboard
  if (user && path === '/') {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
