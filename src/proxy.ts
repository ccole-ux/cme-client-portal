import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const PUBLIC_PREFIXES = ["/login", "/auth", "/invite"];

// Legacy → canonical project slug redirects. 308 preserves method and is
// permanently cacheable by browsers/CDNs — old bookmarks keep working.
const SLUG_REDIRECTS: Record<string, string> = {
  "actc-pcs": "a26-0057",
};

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function legacyProjectSlugRedirect(
  request: NextRequest,
): NextResponse | null {
  const { pathname } = request.nextUrl;
  const match = pathname.match(/^\/p\/([^/]+)(\/.*)?$/);
  if (!match) return null;
  const canonical = SLUG_REDIRECTS[match[1]];
  if (!canonical) return null;
  const rest = match[2] ?? "";
  const target = new URL(
    `/p/${canonical}${rest}${request.nextUrl.search}`,
    request.url,
  );
  return NextResponse.redirect(target, 308);
}

export async function proxy(request: NextRequest) {
  const legacy = legacyProjectSlugRedirect(request);
  if (legacy) return legacy;

  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Run on every path except static assets and image optimizer.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
