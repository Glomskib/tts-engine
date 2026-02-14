import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
  }

  // Add CORS headers to API responses
  if (isApiRoute) {
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value)
    }
    return response
  }

  // Redirect authenticated users from landing page to their role-appropriate dashboard
  if (user && path === '/') {
    const adminEmails = (process.env.ADMIN_USERS || '').split(',').map(e => e.trim().toLowerCase())
    if (user.email && adminEmails.includes(user.email.toLowerCase())) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }
    return NextResponse.redirect(new URL('/my-tasks', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
