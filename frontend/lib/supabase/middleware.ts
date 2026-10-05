import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Public routes: always pass through instantly
  const isLoginRoute = pathname.startsWith('/login');
  const isSignupRoute = pathname.startsWith('/signup');
  const isAcceptInviteRoute = pathname.startsWith('/accept-invite');
  if (isLoginRoute || isSignupRoute || isAcceptInviteRoute) {
    return NextResponse.next({ request });
  }

  // Quick check for session cookies
  const cookies = request.cookies.getAll();
  const hasSupabaseCookie = cookies.some(
    (c) =>
      (c.name.startsWith('sb-') && c.name.includes('-auth-token')) ||
      c.name === 'sb-access-token'
  );
  const hasManualToken = request.cookies.get('sb-access-token')?.value;

  // Root '/' redirection
  if (pathname === '/') {
    if (!hasSupabaseCookie && !hasManualToken) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  // For all other routes, pass through with zero overhead.
  // The pages handle auth validation client-side without edge runtime stalls.
  return NextResponse.next({ request });
}
