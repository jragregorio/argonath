import { refreshSession } from "@warden/api";
import {
  clearSessionCookies,
  jsonError,
  readSessionCookies,
  sessionMetaFromRequest,
  setSessionCookies,
} from "@/lib/auth-cookies";

function safeRedirectTarget(req: Request, next: string | null) {
  if (!next || !next.startsWith("/")) {
    return new URL("/dashboard", req.url);
  }

  return new URL(next, req.url);
}

export async function POST(req: Request) {
  try {
    const { refreshToken } = await readSessionCookies();
    if (!refreshToken) {
      return jsonError("No refresh token", 401);
    }

    const tokens = await refreshSession(
      refreshToken,
      sessionMetaFromRequest(req)
    );
    await setSessionCookies(tokens);

    return Response.json({
      userId: tokens.userId,
      familyId: tokens.familyId,
      role: tokens.role,
    });
  } catch (err) {
    await clearSessionCookies();
    const message = err instanceof Error ? err.message : "Refresh failed";
    return jsonError(message, 401);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = safeRedirectTarget(req, url.searchParams.get("next"));

  try {
    const { refreshToken } = await readSessionCookies();
    if (!refreshToken) {
      await clearSessionCookies();
      return Response.redirect(new URL("/sign-in", req.url));
    }

    const tokens = await refreshSession(
      refreshToken,
      sessionMetaFromRequest(req)
    );
    await setSessionCookies(tokens);

    return Response.redirect(target);
  } catch {
    await clearSessionCookies();
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("next", target.pathname + target.search);
    return Response.redirect(signIn);
  }
}
