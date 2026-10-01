import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Check auth user
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  } catch {
    user = null;
  }

  // Check custom/fallback session cookie
  const devAuthCookie = request.cookies.get('sb-access-token')?.value;
  const isAuthenticated = Boolean(user || devAuthCookie);

  // Route protection
  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup');
  const isWorkspaceRoute = !isAuthRoute && pathname !== '/';

  const isConfigured = !supabaseUrl.includes('placeholder.supabase.co');

  // If unauthenticated and attempting to visit workspace route, redirect to login
  if (isConfigured && !isAuthenticated && isWorkspaceRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If already authenticated and visiting auth route, redirect to workspace
  if (isConfigured && isAuthenticated && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/acme/eng/issues';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
