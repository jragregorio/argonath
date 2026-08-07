import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const ACCESS_COOKIE = "warden_access";
const REFRESH_COOKIE = "warden_refresh";

const devAuthBypassEnabled =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

const publicPaths = [
  "/",
  "/demo",
  "/sign-in",
  "/sign-up",
  "/api/agent",
  "/api/cron",
  "/api/auth/sign-in",
  "/api/auth/sign-up",
  "/api/auth/refresh",
];

function isPublicPath(pathname: string) {
  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function safeRedirectPath(next: string | null, defaultPath = "/dashboard"): string {
  if (!next || !next.startsWith("/")) {
    return defaultPath;
  }
  return next;
}

function forwardSetCookieHeaders(from: Response, to: NextResponse) {
  if (typeof from.headers.getSetCookie === "function") {
    for (const cookie of from.headers.getSetCookie()) {
      to.headers.append("set-cookie", cookie);
    }
    return;
  }

  const raw = from.headers.get("set-cookie");
  if (raw) {
    to.headers.append("set-cookie", raw);
  }
}

async function tryInPlaceRefresh(req: NextRequest): Promise<NextResponse | null> {
  const refreshUrl = new URL("/api/auth/refresh", req.url);
  const refreshResponse = await fetch(refreshUrl, {
    method: "POST",
    headers: {
      cookie: req.headers.get("cookie") ?? "",
    },
  });

  if (!refreshResponse.ok) {
    return null;
  }

  const response = NextResponse.next();
  forwardSetCookieHeaders(refreshResponse, response);
  return response;
}

async function redirectIfAuthenticated(
  req: NextRequest,
  defaultNext: string
): Promise<NextResponse | null> {
  if (await hasValidAccess(req)) {
    return NextResponse.redirect(new URL(defaultNext, req.url));
  }

  if (req.cookies.get(REFRESH_COOKIE)?.value) {
    const refreshUrl = new URL("/api/auth/refresh", req.url);
    refreshUrl.searchParams.set("next", defaultNext);
    return NextResponse.redirect(refreshUrl);
  }

  return null;
}

async function hasValidAccess(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return false;

  const secret = process.env.AUTH_JWT_SECRET?.trim();
  if (!secret || secret.length < 32) return false;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] }
    );
    return Boolean(
      payload.sub &&
        typeof payload.fid === "string" &&
        (payload.role === "Admin" ||
          payload.role === "Parent" ||
          payload.role === "Child")
    );
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/sign-in" || pathname === "/sign-up") {
    if (!devAuthBypassEnabled) {
      const destination = safeRedirectPath(
        req.nextUrl.searchParams.get("next")
      );
      const authRedirect = await redirectIfAuthenticated(req, destination);
      if (authRedirect) {
        return authRedirect;
      }
    }
    return NextResponse.next();
  }

  if (devAuthBypassEnabled || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Logout always allowed so cookies can be cleared
  if (pathname.startsWith("/api/auth/logout")) {
    return NextResponse.next();
  }

  if (await hasValidAccess(req)) {
    return NextResponse.next();
  }

  // For page navigations, refresh in place so the dashboard does not sit
  // in client-side skeletons waiting for a 401 -> refresh -> retry cycle.
  if (req.cookies.get(REFRESH_COOKIE)?.value) {
    if (!pathname.startsWith("/api/")) {
      const refreshed = await tryInPlaceRefresh(req);
      if (refreshed) {
        return refreshed;
      }
    } else {
      return NextResponse.next();
    }
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signIn = new URL("/sign-in", req.url);
  signIn.searchParams.set("next", pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
