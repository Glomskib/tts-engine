import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-correlation-id, x-api-key',
  'Access-Control-Max-Age': '86400',
}

export async function middleware(request: NextRequest) {
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')

  // Handle CORS preflight for API routes (no session needed)
  if (isApiRoute && request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Session refresh for ALL routes (including /api/auth/me which uses cookies)
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
  const { data: { user } } = await supabase.auth.getUser()

  // Add CORS headers to API responses (after session refresh so cookies are set)
  if (isApiRoute) {
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value)
    }
    return response
  }

  // Redirect authenticated users from landing page to their role-appropriate dashboard
  if (user && request.nextUrl.pathname === '/') {
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
