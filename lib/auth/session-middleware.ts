/**
 * Edge-safe session refresh for middleware.ts. No DB/Riot calls, no server-only import.
 * Uses getUser() (verifies the JWT with Supabase), never getSession().
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPrivatePath } from "./next-path";

const LOGIN_PATH = "/entrar";

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const redirectToLogin = () => {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  };

  if (process.env.AUTH_MOCK?.trim() === "1") {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_MOCK=1 is forbidden when NODE_ENV=production");
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return isPrivatePath(pathname) ? redirectToLogin() : NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user && isPrivatePath(pathname)) {
    const redirect = redirectToLogin();
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}
