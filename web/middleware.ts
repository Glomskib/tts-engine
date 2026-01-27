import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Minimal middleware - just pass through
  // Auth protection will be handled by individual pages/API routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Only match paths that need middleware processing
    // Skip all static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
