import { cookies } from "next/headers";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_DAYS,
  type SessionTokens,
} from "@warden/api";

const isProd = process.env.NODE_ENV === "production";

function cookieBase(maxAge: number) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function setSessionCookies(tokens: SessionTokens) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, cookieBase(ACCESS_TOKEN_TTL_SECONDS));
  jar.set(
    REFRESH_COOKIE,
    tokens.refreshToken,
    cookieBase(REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60)
  );
}

export async function clearSessionCookies() {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, "", { ...cookieBase(0), maxAge: 0 });
  jar.set(REFRESH_COOKIE, "", { ...cookieBase(0), maxAge: 0 });
}

export async function readSessionCookies() {
  const jar = await cookies();
  return {
    accessToken: jar.get(ACCESS_COOKIE)?.value ?? null,
    refreshToken: jar.get(REFRESH_COOKIE)?.value ?? null,
  };
}

export function sessionMetaFromRequest(req: Request) {
  return {
    userAgent: req.headers.get("user-agent"),
    ip:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip"),
  };
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
