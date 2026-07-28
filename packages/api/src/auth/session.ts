import { prisma, type Family, type FamilyRole } from "@warden/db";
import { TRPCError } from "@trpc/server";
import {
  generateRefreshToken,
  generateTokenFamilyId,
  hashToken,
  refreshExpiresAt,
  signAccessToken,
  verifyPassword,
  hashPassword,
} from "./tokens";

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  familyId: string;
  role: FamilyRole;
};

export type SessionMeta = {
  userAgent?: string | null;
  ip?: string | null;
};

async function pickDefaultMembership(userId: string) {
  const admin = await prisma.familyMember.findFirst({
    where: { userId, role: "Admin" },
    orderBy: { createdAt: "asc" },
  });
  if (admin) return admin;

  return prisma.familyMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

async function issueSession(opts: {
  userId: string;
  familyId: string;
  role: FamilyRole;
  tokenFamilyId?: string;
  meta?: SessionMeta;
}): Promise<SessionTokens> {
  const tokenFamilyId = opts.tokenFamilyId ?? generateTokenFamilyId();
  const rawRefresh = generateRefreshToken();
  const accessToken = await signAccessToken({
    sub: opts.userId,
    fid: opts.familyId,
    role: opts.role,
  });

  await prisma.refreshToken.create({
    data: {
      userId: opts.userId,
      familyId: opts.familyId,
      tokenFamilyId,
      tokenHash: hashToken(rawRefresh),
      expiresAt: refreshExpiresAt(),
      userAgent: opts.meta?.userAgent ?? null,
      ip: opts.meta?.ip ?? null,
    },
  });

  return {
    accessToken,
    refreshToken: rawRefresh,
    userId: opts.userId,
    familyId: opts.familyId,
    role: opts.role,
  };
}

export async function signUp(opts: {
  email: string;
  password: string;
  name: string;
  familyName?: string;
  meta?: SessionMeta;
}): Promise<SessionTokens> {
  const email = opts.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "An account with this email already exists",
    });
  }

  if (opts.password.length < 8) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Password must be at least 8 characters",
    });
  }

  const passwordHash = await hashPassword(opts.password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        name: opts.name.trim(),
      },
    });

    const family = await tx.family.create({
      data: {
        name: (opts.familyName?.trim() || `${opts.name.trim()}'s Family`).slice(
          0,
          100
        ),
      },
    });

    const membership = await tx.familyMember.create({
      data: {
        userId: user.id,
        familyId: family.id,
        role: "Admin",
      },
    });

    return { user, family, membership };
  });

  return issueSession({
    userId: result.user.id,
    familyId: result.family.id,
    role: result.membership.role,
    meta: opts.meta,
  });
}

export async function signIn(opts: {
  email: string;
  password: string;
  meta?: SessionMeta;
}): Promise<SessionTokens> {
  const email = opts.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-ish failure message to avoid account enumeration
  const invalid = () => {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });
  };

  if (!user) {
    await hashPassword(opts.password);
    invalid();
  }

  const ok = await verifyPassword(user!.passwordHash, opts.password);
  if (!ok) invalid();

  const membership = await pickDefaultMembership(user!.id);
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No family membership found for this account",
    });
  }

  return issueSession({
    userId: user!.id,
    familyId: membership.familyId,
    role: membership.role,
    meta: opts.meta,
  });
}

async function revokeTokenFamily(tokenFamilyId: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenFamilyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoke all refresh sessions for a user except the current token family (if provided). */
export async function revokeOtherUserSessions(
  userId: string,
  keepTokenFamilyId?: string | null
) {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(keepTokenFamilyId ? { tokenFamilyId: { not: keepTokenFamilyId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

export async function refreshSession(
  rawRefresh: string,
  meta?: SessionMeta
): Promise<SessionTokens> {
  const tokenHash = hashToken(rawRefresh);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!existing) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid refresh token",
    });
  }

  if (existing.revokedAt || existing.expiresAt <= new Date()) {
    await revokeTokenFamily(existing.tokenFamilyId);
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Refresh token expired or revoked",
    });
  }

  // Reuse of a used token
  if (existing.usedAt) {
    if (existing.replacedById) {
      const replacement = await prisma.refreshToken.findUnique({
        where: { id: existing.replacedById },
      });

      // Lost-response recovery: tip still unused → revoke tip, mint new tip
      if (
        replacement &&
        !replacement.usedAt &&
        !replacement.revokedAt &&
        replacement.expiresAt > new Date()
      ) {
        await prisma.refreshToken.update({
          where: { id: replacement.id },
          data: { revokedAt: new Date(), usedAt: new Date() },
        });

        const membership = await prisma.familyMember.findUnique({
          where: {
            userId_familyId: {
              userId: existing.userId,
              familyId: existing.familyId,
            },
          },
        });
        if (!membership) {
          await revokeTokenFamily(existing.tokenFamilyId);
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        return issueSession({
          userId: existing.userId,
          familyId: existing.familyId,
          role: membership.role,
          tokenFamilyId: existing.tokenFamilyId,
          meta,
        });
      }
    }

    // Theft / older ancestor reuse → revoke whole family
    await revokeTokenFamily(existing.tokenFamilyId);
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Refresh token reuse detected",
    });
  }

  const membership = await prisma.familyMember.findUnique({
    where: {
      userId_familyId: {
        userId: existing.userId,
        familyId: existing.familyId,
      },
    },
  });

  if (!membership) {
    await revokeTokenFamily(existing.tokenFamilyId);
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  const rawNext = generateRefreshToken();
  const next = await prisma.refreshToken.create({
    data: {
      userId: existing.userId,
      familyId: existing.familyId,
      tokenFamilyId: existing.tokenFamilyId,
      tokenHash: hashToken(rawNext),
      expiresAt: refreshExpiresAt(),
      userAgent: meta?.userAgent ?? existing.userAgent,
      ip: meta?.ip ?? existing.ip,
    },
  });

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: {
      usedAt: new Date(),
      replacedById: next.id,
    },
  });

  const accessToken = await signAccessToken({
    sub: existing.userId,
    fid: existing.familyId,
    role: membership.role,
  });

  return {
    accessToken,
    refreshToken: rawNext,
    userId: existing.userId,
    familyId: existing.familyId,
    role: membership.role,
  };
}

export async function logoutSession(rawRefresh: string | null | undefined) {
  if (!rawRefresh) return;
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawRefresh) },
  });
  if (!existing) return;
  await revokeTokenFamily(existing.tokenFamilyId);
}

export async function switchFamilySession(opts: {
  userId: string;
  familyId: string;
  rawRefresh: string;
  meta?: SessionMeta;
}): Promise<SessionTokens> {
  const membership = await prisma.familyMember.findUnique({
    where: {
      userId_familyId: {
        userId: opts.userId,
        familyId: opts.familyId,
      },
    },
  });

  // Anti-enumeration: missing membership looks like not found
  if (!membership) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  await logoutSession(opts.rawRefresh);

  return issueSession({
    userId: opts.userId,
    familyId: membership.familyId,
    role: membership.role,
    meta: opts.meta,
  });
}

export async function requireFamilyAccess(
  userId: string,
  familyId: string
): Promise<Family & { role: FamilyRole }> {
  const membership = await prisma.familyMember.findUnique({
    where: {
      userId_familyId: { userId, familyId },
    },
    include: { family: true },
  });

  if (!membership) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  return { ...membership.family, role: membership.role };
}

export async function ensureDevBypassIdentity(opts?: {
  userId?: string;
  familyId?: string;
}): Promise<{ userId: string; familyId: string; role: FamilyRole }> {
  const userId = opts?.userId ?? process.env.DEV_BYPASS_USER_ID ?? "dev-parent";
  const familyId =
    opts?.familyId ?? process.env.DEV_BYPASS_FAMILY_ID ?? "dev-family";

  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email: `${userId}@localhost.dev`,
      name: "Dev Parent",
      passwordHash: await hashPassword("dev-password-not-for-production"),
    },
    update: {},
  });

  await prisma.family.upsert({
    where: { id: familyId },
    create: {
      id: familyId,
      name: "Dev Family",
    },
    update: {},
  });

  await prisma.familyMember.upsert({
    where: {
      userId_familyId: { userId, familyId },
    },
    create: {
      userId,
      familyId,
      role: "Admin",
    },
    update: { role: "Admin" },
  });

  return { userId, familyId, role: "Admin" };
}
