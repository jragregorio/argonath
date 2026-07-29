import { prisma } from "@warden/db";
import type { Device, Family, FamilyRole } from "@warden/db";
import { TRPCError } from "@trpc/server";
import { hashToken, verifyAccessToken } from "./auth/tokens";
import { ensureDevBypassIdentity, requireFamilyAccess } from "./auth/session";

export type Context = {
  userId: string | null;
  familyId: string | null;
  role: FamilyRole | null;
  /** Resolves the active refresh-token family for this request (lazy, memoized). */
  resolveRefreshTokenFamilyId: () => Promise<string | null>;
  /** Membership + family row for this request (lazy, memoized; one query per HTTP request). */
  loadFamily: () => Promise<Family & { role: FamilyRole }>;
  device: (Device & { child: { familyId: string } }) | null;
};

function createRefreshTokenFamilyResolver(
  refreshToken: string | null | undefined
): () => Promise<string | null> {
  let cached: Promise<string | null> | null = null;
  return () => {
    if (!cached) {
      cached = (async () => {
        if (!refreshToken) return null;
        const existing = await prisma.refreshToken.findUnique({
          where: { tokenHash: hashToken(refreshToken) },
          select: { tokenFamilyId: true, revokedAt: true, expiresAt: true },
        });
        if (
          existing &&
          !existing.revokedAt &&
          existing.expiresAt > new Date()
        ) {
          return existing.tokenFamilyId;
        }
        return null;
      })();
    }
    return cached;
  };
}

function createFamilyLoader(
  userId: string | null,
  familyId: string | null
): () => Promise<Family & { role: FamilyRole }> {
  // Cache the promise (not the value) so concurrent batched procedures share one in-flight query.
  let cached: Promise<Family & { role: FamilyRole }> | null = null;
  return () => {
    if (!cached) {
      if (!userId || !familyId) {
        cached = Promise.reject(new TRPCError({ code: "NOT_FOUND" }));
      } else {
        cached = requireFamilyAccess(userId, familyId);
      }
    }
    return cached;
  };
}

export async function createContext(opts: {
  userId?: string | null;
  familyId?: string | null;
  role?: FamilyRole | null;
  deviceToken?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  devBypass?: boolean;
}): Promise<Context> {
  let device: Context["device"] = null;

  if (opts.deviceToken) {
    device = await prisma.device.findUnique({
      where: { deviceToken: opts.deviceToken },
      include: { child: { select: { familyId: true } } },
    });
  }

  const resolveRefreshTokenFamilyId = createRefreshTokenFamilyResolver(
    opts.refreshToken
  );

  if (opts.devBypass) {
    const identity = await ensureDevBypassIdentity({
      userId: opts.userId ?? undefined,
      familyId: opts.familyId ?? undefined,
    });
    return {
      userId: identity.userId,
      familyId: identity.familyId,
      role: identity.role,
      resolveRefreshTokenFamilyId,
      loadFamily: createFamilyLoader(identity.userId, identity.familyId),
      device,
    };
  }

  if (opts.accessToken) {
    const claims = await verifyAccessToken(opts.accessToken);
    if (claims) {
      return {
        userId: claims.sub,
        familyId: claims.fid,
        role: claims.role,
        resolveRefreshTokenFamilyId,
        loadFamily: createFamilyLoader(claims.sub, claims.fid),
        device,
      };
    }
  }

  const userId = opts.userId ?? null;
  const familyId = opts.familyId ?? null;
  return {
    userId,
    familyId,
    role: opts.role ?? null,
    resolveRefreshTokenFamilyId,
    loadFamily: createFamilyLoader(userId, familyId),
    device,
  };
}
