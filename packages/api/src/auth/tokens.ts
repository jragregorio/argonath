import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { FamilyRole } from "@warden/db";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const ACCESS_COOKIE = "warden_access";
export const REFRESH_COOKIE = "warden_refresh";

export type AccessTokenClaims = {
  sub: string;
  fid: string;
  role: FamilyRole;
  jti: string;
};

function getJwtSecret(): Uint8Array {
  const secret = process.env.AUTH_JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_JWT_SECRET must be set to a string at least 32 characters long"
    );
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateTokenFamilyId(): string {
  return randomBytes(16).toString("hex");
}

export function refreshExpiresAt(from = new Date()): Date {
  const expires = new Date(from);
  expires.setDate(expires.getDate() + REFRESH_TOKEN_TTL_DAYS);
  return expires;
}

export async function signAccessToken(
  claims: Omit<AccessTokenClaims, "jti"> & { jti?: string }
): Promise<string> {
  const jti = claims.jti ?? randomBytes(16).toString("hex");
  return new SignJWT({
    fid: claims.fid,
    role: claims.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    });
    return parseAccessClaims(payload);
  } catch {
    return null;
  }
}

export function parseAccessClaims(
  payload: JWTPayload
): AccessTokenClaims | null {
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  const fid = typeof payload.fid === "string" ? payload.fid : null;
  const role = payload.role;
  const jti = typeof payload.jti === "string" ? payload.jti : null;

  if (
    !sub ||
    !fid ||
    !jti ||
    (role !== "Admin" && role !== "Parent" && role !== "Child")
  ) {
    return null;
  }

  return { sub, fid, role, jti };
}
