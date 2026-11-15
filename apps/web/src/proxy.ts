import { NextResponse, type NextRequest } from "next/server";

/**
 * Quick redirect for visitors without a session cookie. This is only for UX:
 * the API checks every request, and pages re-check through SSR.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("lc_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/inbox/:path*", "/tickets/:path*", "/dashboard/:path*", "/settings/:path*", "/admins/:path*"],
};
