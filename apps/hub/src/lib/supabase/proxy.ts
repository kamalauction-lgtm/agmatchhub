import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/verification", "/requests", "/submissions", "/notifications", "/profile", "/invite"];
const AUTH_PAGES = ["/login", "/register"];
/** Pages an agent with a temporary password may still open (00132). */
const ALLOWED_WITH_TEMP_PASSWORD = ["/reset-password", "/auth/", "/login", "/activate", "/verify-email", "/api/"];

/**
 * Session refresh + route protection, invoked from src/proxy.ts.
 * Never remove the getUser() call — it revalidates the auth token.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // An account an admin opened carries a temporary password (00132). The flag
  // lives in app_metadata, which only the server can set, and getUser() above
  // reads it fresh from Supabase — so no extra query. Page loads only (GET):
  // form posts such as sign-out still work.
  if (
    user?.app_metadata?.must_change_password === true &&
    request.method === "GET" &&
    !ALLOWED_WITH_TEMP_PASSWORD.some((p) => path.startsWith(p))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/reset-password";
    url.search = "?welcome=1&first=1";
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PAGES.includes(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
