import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Get env var with whitespace trimming.
 * Returns null if missing or empty.
 */
function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : null;
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  // NEVER throw in middleware (Edge) - it becomes MIDDLEWARE_INVOCATION_FAILED
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase env in middleware", {
      hasUrl: !!supabaseUrl,
      hasAnon: !!supabaseAnonKey,
    });
    return response; // allow site to load so /api/health works
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Touch auth so session refresh works in Edge
  const { data: { user } } = await supabase.auth.getUser();

  // Protect /admin and /uploader routes - redirect to /login if not authenticated
  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin');
  const isUploaderRoute = request.nextUrl.pathname.startsWith('/uploader');
  const isLoginPage = request.nextUrl.pathname === '/login';
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');

  // Allow API routes (they handle their own auth)
  if (isApiRoute) {
    return response;
  }

  // If accessing protected routes without auth, redirect to login
  if ((isAdminRoute || isUploaderRoute) && !user) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // If authenticated and on login page, redirect based on stored redirect param
  if (isLoginPage && user) {
    const redirect = request.nextUrl.searchParams.get('redirect') || '/';
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and images
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
