import { prisma } from "@warden/db";
import type { Prisma } from "@warden/db";
import {
  CAPTURE_RATE_LIMIT_PER_HOUR,
  evaluatePolicy,
  generateDeviceToken,
  generatePairingCode,
  isDeviceRecentlySeen,
  PAIRING_CODE_EXPIRY_MINUTES,
  SNAPSHOT_RETENTION_DAYS,
  type AllowedWindow,
} from "@warden/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getSupabaseAdmin,
  broadcastToDevice,
  isSupabaseConfigured,
} from "../lib/supabase";
import {
  getCachedSignedSnapshotUrl,
  invalidateSignedSnapshotUrl,
} from "../lib/signed-url-cache";
import {
  protectedProcedure,
  parentProcedure,
  adminProcedure,
  agentProcedure,
  publicProcedure,
  router,
} from "../trpc";
import { requireFamilyAccess, revokeOtherUserSessions } from "../auth/session";
import { hashPassword, verifyPassword } from "../auth/tokens";

async function getFamilyForUser(ctx: { userId: string; familyId: string }) {
  return requireFamilyAccess(ctx.userId, ctx.familyId);
}

type DeviceOnlineFields = {
  id: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
};

async function withLiveOnlineStatus<T extends DeviceOnlineFields>(
  devices: T[]
): Promise<T[]> {
  const now = new Date();
  const staleIds = devices
    .filter((device) => device.isOnline && !isDeviceRecentlySeen(device.lastSeenAt, now))
    .map((device) => device.id);

  if (staleIds.length > 0) {
    await prisma.device.updateMany({
      where: { id: { in: staleIds } },
      data: { isOnline: false },
    });
  }

  return devices.map((device) => ({
    ...device,
    isOnline: isDeviceRecentlySeen(device.lastSeenAt, now),
  }));
}

async function getChildForFamily(childId: string, familyId: string) {
  const child = await prisma.child.findFirst({
    where: { id: childId, familyId },
    include: {
      devices: true,
      policies: { where: { isActive: true }, take: 1 },
      extensionOverrides: {
        where: { expiresAt: { gt: new Date() } },
      },
    },
  });

  if (!child) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Child not found" });
  }

  return {
    ...child,
    devices: await withLiveOnlineStatus(child.devices),
  };
}

async function logAudit(
  familyId: string,
  userId: string,
  action: string,
  metadata?: Prisma.InputJsonValue
) {
  await prisma.auditLog.create({
    data: { familyId, userId, action, metadata: metadata ?? {} },
  });
}

function getCanonicalAppUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  return configured?.trim().replace(/\/+$/, "") ?? null;
}

function getAgentBootstrapConfig() {
  return {
    apiBaseUrl: getCanonicalAppUrl(),
    supabaseUrl:
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || null,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null,
  };
}

function toFamilyClientView<T extends { parentPin?: string | null }>(family: T) {
  const { parentPin, ...rest } = family;
  return {
    ...rest,
    hasParentPin: Boolean(parentPin && parentPin.length > 0),
  };
}

const allowedWindowSchema = z.object({
  day: z.number().min(1).max(7),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const familyRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return toFamilyClientView(await getFamilyForUser(ctx));
  }),

  /** @deprecated Use `get` — kept for existing clients during the auth migration */
  getOrCreate: protectedProcedure.query(async ({ ctx }) => {
    return toFamilyClientView(await getFamilyForUser(ctx));
  }),

  rename: adminProcedure
    .input(z.object({ name: z.string().trim().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const updated = await prisma.family.update({
        where: { id: family.id },
        data: { name: input.name },
      });
      await logAudit(family.id, ctx.userId, "family_renamed", {
        name: input.name,
      });
      return toFamilyClientView(updated);
    }),

  updatePin: adminProcedure
    .input(z.object({ pin: z.string().min(4).max(8) }))
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      await logAudit(family.id, ctx.userId, "pin_updated");
      const updated = await prisma.family.update({
        where: { id: family.id },
        data: { parentPin: input.pin },
      });
      return toFamilyClientView(updated);
    }),
});

export const authRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const memberships = await prisma.familyMember.findMany({
      where: { userId: ctx.userId },
      include: { family: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    return {
      user,
      role: ctx.role,
      familyId: ctx.familyId,
      memberships: memberships.map((m) => ({
        familyId: m.familyId,
        role: m.role,
        family: m.family,
      })),
    };
  }),

  updateName: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.update({
        where: { id: ctx.userId },
        data: { name: input.name },
        select: { id: true, email: true, name: true, createdAt: true },
      });
      return user;
    }),

  updateEmail: protectedProcedure
    .input(
      z.object({
        email: z.string().trim().email().max(255),
        currentPassword: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { passwordHash: true, email: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const ok = await verifyPassword(existing.passwordHash, input.currentPassword);
      if (!ok) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect",
        });
      }

      const email = input.email.toLowerCase();
      if (email !== existing.email.toLowerCase()) {
        const taken = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (taken) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That email is already in use",
          });
        }
      }

      return prisma.user.update({
        where: { id: ctx.userId },
        data: { email },
        select: { id: true, email: true, name: true, createdAt: true },
      });
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(128),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.currentPassword === input.newPassword) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "New password must be different from the current password",
        });
      }

      const existing = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { passwordHash: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const ok = await verifyPassword(existing.passwordHash, input.currentPassword);
      if (!ok) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect",
        });
      }

      const passwordHash = await hashPassword(input.newPassword);
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { passwordHash },
      });

      await revokeOtherUserSessions(ctx.userId, ctx.refreshTokenFamilyId);

      return { ok: true };
    }),
});

export const childrenRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const family = await getFamilyForUser(ctx);
    const children = await prisma.child.findMany({
      where: { familyId: family.id },
      include: {
        devices: true,
        policies: { where: { isActive: true }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
    });

    return Promise.all(
      children.map(async (child) => ({
        ...child,
        devices: await withLiveOnlineStatus(child.devices),
      }))
    );
  }),

  create: parentProcedure
    .input(z.object({ displayName: z.string().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const child = await prisma.child.create({
        data: {
          familyId: family.id,
          displayName: input.displayName,
          policies: {
            create: {
              dailyLimitMinutes: 120,
              allowedWindows: [],
              isActive: true,
            },
          },
        },
        include: { policies: true, devices: true },
      });
      await logAudit(family.id, ctx.userId, "child_created", {
        childId: child.id,
      });
      return child;
    }),

  get: protectedProcedure
    .input(z.object({ childId: z.string() }))
    .query(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      return getChildForFamily(input.childId, family.id);
    }),

  rename: parentProcedure
    .input(
      z.object({
        childId: z.string(),
        displayName: z.string().min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      await getChildForFamily(input.childId, family.id);

      const updated = await prisma.child.update({
        where: { id: input.childId },
        data: { displayName: input.displayName.trim() },
      });

      await logAudit(family.id, ctx.userId, "child_renamed", {
        childId: input.childId,
        displayName: updated.displayName,
      });

      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ childId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      await getChildForFamily(input.childId, family.id);
      await logAudit(family.id, ctx.userId, "child_deleted", {
        childId: input.childId,
      });
      return prisma.child.delete({ where: { id: input.childId } });
    }),
});

export const policyRouter = router({
  update: parentProcedure
    .input(
      z.object({
        childId: z.string(),
        dailyLimitMinutes: z.number().min(0).max(1440),
        allowedWindows: z.array(allowedWindowSchema),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const child = await getChildForFamily(input.childId, family.id);

      const existing = child.policies[0];
      const policy = existing
        ? await prisma.screenTimePolicy.update({
            where: { id: existing.id },
            data: {
              dailyLimitMinutes: input.dailyLimitMinutes,
              allowedWindows: input.allowedWindows,
              isActive: input.isActive,
            },
          })
        : await prisma.screenTimePolicy.create({
            data: {
              childId: child.id,
              dailyLimitMinutes: input.dailyLimitMinutes,
              allowedWindows: input.allowedWindows,
              isActive: input.isActive,
            },
          });

      await logAudit(family.id, ctx.userId, "policy_updated", {
        childId: child.id,
        policy,
      });

      for (const device of child.devices) {
        await broadcastToDevice(device.id, {
          type: "policy:updated",
          deviceId: device.id,
          timestamp: new Date().toISOString(),
        });
      }

      return policy;
    }),

  getEvaluation: protectedProcedure
    .input(z.object({ childId: z.string() }))
    .query(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const child = await getChildForFamily(input.childId, family.id);
      const policy = child.policies[0];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const usageLogs = await prisma.usageLog.findMany({
        where: {
          device: { childId: child.id },
          date: today,
        },
      });

      const usedMinutes = usageLogs.reduce((sum, log) => sum + log.activeMinutes, 0);

      if (!policy) {
        return evaluatePolicy(
          { dailyLimitMinutes: 120, allowedWindows: [], isActive: true },
          usedMinutes,
          child.extensionOverrides.map((o) => ({
            extraMinutes: o.extraMinutes,
            expiresAt: o.expiresAt,
          }))
        );
      }

      return evaluatePolicy(
        {
          dailyLimitMinutes: policy.dailyLimitMinutes,
          allowedWindows: policy.allowedWindows as AllowedWindow[],
          isActive: policy.isActive,
        },
        usedMinutes,
        child.extensionOverrides.map((o) => ({
          extraMinutes: o.extraMinutes,
          expiresAt: o.expiresAt,
        }))
      );
    }),
});

export const deviceRouter = router({
  generatePairingCode: parentProcedure
    .input(z.object({ childId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const child = await getChildForFamily(input.childId, family.id);

      const code = generatePairingCode();
      const expiresAt = new Date(
        Date.now() + PAIRING_CODE_EXPIRY_MINUTES * 60 * 1000
      );

      const device = await prisma.device.create({
        data: {
          childId: child.id,
          pairingCode: code,
          pairingExpiresAt: expiresAt,
          platform: "windows",
        },
      });

      await logAudit(family.id, ctx.userId, "pairing_code_generated", {
        deviceId: device.id,
        childId: child.id,
      });

      return { code, expiresAt, deviceId: device.id };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const family = await getFamilyForUser(ctx);
    const devices = await prisma.device.findMany({
      where: { child: { familyId: family.id } },
      include: { child: { select: { id: true, displayName: true } } },
      orderBy: { lastSeenAt: "desc" },
    });
    return withLiveOnlineStatus(devices);
  }),

  rename: parentProcedure
    .input(
      z.object({
        deviceId: z.string(),
        displayName: z.string().min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const device = await prisma.device.findFirst({
        where: {
          id: input.deviceId,
          child: { familyId: family.id },
        },
      });

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const updated = await prisma.device.update({
        where: { id: device.id },
        data: { displayName: input.displayName.trim() },
      });

      await logAudit(family.id, ctx.userId, "device_renamed", {
        deviceId: device.id,
        displayName: updated.displayName,
      });

      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const device = await prisma.device.findFirst({
        where: {
          id: input.deviceId,
          child: { familyId: family.id },
        },
      });

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await logAudit(family.id, ctx.userId, "device_deleted", {
        deviceId: device.id,
        childId: device.childId,
      });

      return prisma.device.delete({ where: { id: device.id } });
    }),

  setAdminLock: parentProcedure
    .input(
      z.object({
        deviceId: z.string(),
        locked: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const device = await prisma.device.findFirst({
        where: {
          id: input.deviceId,
          child: { familyId: family.id },
        },
      });

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const updated = await prisma.device.update({
        where: { id: device.id },
        data: {
          adminLock: input.locked,
          isLocked: input.locked ? true : device.isLocked,
        },
      });

      await logAudit(family.id, ctx.userId, input.locked ? "admin_lock" : "admin_unlock", {
        deviceId: device.id,
      });

      void broadcastToDevice(device.id, {
        type: input.locked ? "device:locked" : "device:unlocked",
        deviceId: device.id,
        payload: { adminLock: input.locked },
        timestamp: new Date().toISOString(),
      }).catch(() => {});

      return updated;
    }),

  sendNudge: parentProcedure
    .input(
      z.object({
        deviceId: z.string(),
        message: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const device = await prisma.device.findFirst({
        where: {
          id: input.deviceId,
          child: { familyId: family.id },
        },
      });

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (!device.deviceToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Device must be paired first",
        });
      }

      if (!isDeviceRecentlySeen(device.lastSeenAt)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Device is offline",
        });
      }

      const now = new Date();
      const active = await prisma.nudge.findFirst({
        where: {
          deviceId: device.id,
          status: { in: ["pending", "delivered"] },
          expiresAt: { gt: now },
        },
      });

      if (active) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A nudge is already in progress on this device",
        });
      }

      // UI auto-dismiss is 45s from show; server TTL is longer so late poll/realtime
      // delivery can still present the nudge and accept a Seen ack.
      const autoDismissSeconds = 45;
      const expiresAt = new Date(now.getTime() + 3 * 60 * 1000);
      const message =
        input.message?.trim() || "Your parent wants your attention";

      const nudge = await prisma.nudge.create({
        data: {
          familyId: family.id,
          childId: device.childId,
          deviceId: device.id,
          message,
          status: "pending",
          requestedBy: ctx.userId,
          expiresAt,
        },
      });

      await logAudit(family.id, ctx.userId, "nudge_sent", {
        deviceId: device.id,
        childId: device.childId,
        nudgeId: nudge.id,
      });

      void broadcastToDevice(device.id, {
        type: "nudge:show",
        deviceId: device.id,
        payload: {
          nudgeId: nudge.id,
          message,
          autoDismissSeconds,
        },
        timestamp: now.toISOString(),
      }).catch(() => {});

      return {
        id: nudge.id,
        status: nudge.status,
        message: nudge.message,
        expiresAt: nudge.expiresAt,
        autoDismissSeconds,
      };
    }),

  getNudge: parentProcedure
    .input(z.object({ nudgeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const nudge = await prisma.nudge.findFirst({
        where: {
          id: input.nudgeId,
          familyId: family.id,
        },
        select: {
          id: true,
          deviceId: true,
          childId: true,
          message: true,
          status: true,
          response: true,
          createdAt: true,
          seenAt: true,
          expiresAt: true,
        },
      });

      if (!nudge) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (
        (nudge.status === "pending" || nudge.status === "delivered") &&
        nudge.expiresAt.getTime() <= Date.now()
      ) {
        const expired = await prisma.nudge.update({
          where: { id: nudge.id },
          data: { status: "expired" },
          select: {
            id: true,
            deviceId: true,
            childId: true,
            message: true,
            status: true,
            response: true,
            createdAt: true,
            seenAt: true,
            expiresAt: true,
          },
        });
        return expired;
      }

      return nudge;
    }),
});

export const extensionRouter = router({
  listPending: protectedProcedure.query(async ({ ctx }) => {
    const family = await getFamilyForUser(ctx);
    return prisma.extensionRequest.findMany({
      where: {
        child: { familyId: family.id },
        status: "pending",
      },
      include: {
        child: { select: { id: true, displayName: true } },
        device: {
          select: { id: true, machineName: true, displayName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  listHistory: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const limit = input?.limit ?? 50;

      const requests = await prisma.extensionRequest.findMany({
        where: {
          child: { familyId: family.id },
          status: { in: ["approved", "denied"] },
        },
        include: {
          child: { select: { id: true, displayName: true } },
          device: {
            select: { id: true, machineName: true, displayName: true },
          },
        },
        orderBy: [{ resolvedAt: "desc" }, { createdAt: "desc" }],
        take: limit,
      });

      const resolverIds = [
        ...new Set(
          requests
            .map((request) => request.resolvedBy)
            .filter((id): id is string => Boolean(id))
        ),
      ];

      const resolvers =
        resolverIds.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: resolverIds } },
              select: { id: true, name: true, email: true },
            })
          : [];

      const resolverById = new Map(
        resolvers.map((user) => [user.id, user] as const)
      );

      return requests.map((request) => {
        const resolver = request.resolvedBy
          ? resolverById.get(request.resolvedBy)
          : undefined;

        return {
          ...request,
          resolvedByUser: resolver
            ? {
                id: resolver.id,
                name: resolver.name,
                email: resolver.email,
              }
            : null,
        };
      });
    }),

  resolve: parentProcedure
    .input(
      z.object({
        requestId: z.string(),
        approved: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const request = await prisma.extensionRequest.findFirst({
        where: {
          id: input.requestId,
          child: { familyId: family.id },
          status: "pending",
        },
        include: { device: true },
      });

      if (!request) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const status = input.approved ? "approved" : "denied";

      await prisma.extensionRequest.update({
        where: { id: request.id },
        data: {
          status,
          resolvedAt: new Date(),
          resolvedBy: ctx.userId,
        },
      });

      if (input.approved) {
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        await prisma.extensionOverride.create({
          data: {
            childId: request.childId,
            extraMinutes: request.requestedMinutes,
            expiresAt: endOfDay,
            sourceRequestId: request.id,
          },
        });

        await prisma.device.update({
          where: { id: request.deviceId },
          data: { isLocked: false },
        });

        await broadcastToDevice(request.deviceId, {
          type: "extension:approved",
          deviceId: request.deviceId,
          payload: { extraMinutes: request.requestedMinutes },
          timestamp: new Date().toISOString(),
        });
      } else {
        await broadcastToDevice(request.deviceId, {
          type: "extension:denied",
          deviceId: request.deviceId,
          timestamp: new Date().toISOString(),
        });
      }

      await logAudit(family.id, ctx.userId, `extension_${status}`, {
        requestId: request.id,
        minutes: request.requestedMinutes,
      });

      return { status };
    }),
});

export const dashboardRouter = router({
  navBadges: protectedProcedure.query(async ({ ctx }) => {
    const family = await getFamilyForUser(ctx);
    const now = new Date();

    const [pendingRequests, unviewedSnapshots] = await Promise.all([
      prisma.extensionRequest.count({
        where: {
          child: { familyId: family.id },
          status: "pending",
        },
      }),
      prisma.snapshot.count({
        where: {
          child: { familyId: family.id },
          status: "ready",
          viewedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
    ]);

    return { pendingRequests, unviewedSnapshots };
  }),

  /** Family overview: children with today's usage, policy status, and devices. */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const family = await getFamilyForUser(ctx);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    const [children, pendingRequests, usageLogs] = await Promise.all([
      prisma.child.findMany({
        where: { familyId: family.id },
        include: {
          devices: true,
          policies: { where: { isActive: true }, take: 1 },
          extensionOverrides: {
            where: { expiresAt: { gt: now } },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.extensionRequest.count({
        where: {
          child: { familyId: family.id },
          status: "pending",
        },
      }),
      prisma.usageLog.findMany({
        where: {
          date: today,
          device: { child: { familyId: family.id } },
        },
        select: {
          activeMinutes: true,
          device: { select: { childId: true } },
        },
      }),
    ]);

    const usedByChild = new Map<string, number>();
    for (const log of usageLogs) {
      const childId = log.device.childId;
      usedByChild.set(
        childId,
        (usedByChild.get(childId) ?? 0) + log.activeMinutes
      );
    }

    const liveDevices = await withLiveOnlineStatus(
      children.flatMap((child) => child.devices)
    );
    const devicesByChild = new Map<string, typeof liveDevices>();
    for (const device of liveDevices) {
      const list = devicesByChild.get(device.childId) ?? [];
      list.push(device);
      devicesByChild.set(device.childId, list);
    }

    return {
      pendingRequests,
      children: children.map((child) => {
        const policy = child.policies[0];
        const usedMinutes = usedByChild.get(child.id) ?? 0;
        const evaluation = evaluatePolicy(
          policy
            ? {
                dailyLimitMinutes: policy.dailyLimitMinutes,
                allowedWindows: policy.allowedWindows as AllowedWindow[],
                isActive: policy.isActive,
              }
            : {
                dailyLimitMinutes: 120,
                allowedWindows: [],
                isActive: true,
              },
          usedMinutes,
          child.extensionOverrides.map((o) => ({
            extraMinutes: o.extraMinutes,
            expiresAt: o.expiresAt,
          }))
        );

        const devices = devicesByChild.get(child.id) ?? [];

        return {
          id: child.id,
          displayName: child.displayName,
          evaluation,
          devices: devices.map((device) => ({
            id: device.id,
            displayName: device.displayName,
            machineName: device.machineName,
            isOnline: device.isOnline,
            isLocked: device.isLocked,
            adminLock: device.adminLock,
            deviceToken: device.deviceToken,
            agentVersion: device.agentVersion,
          })),
        };
      }),
    };
  }),

  /** Recent family audit events for the Overview activity feed. */
  activity: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(30),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const limit = input?.limit ?? 30;

      const logs = await prisma.auditLog.findMany({
        where: { familyId: family.id },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      const actorIds = [
        ...new Set(
          logs
            .map((log) => log.userId)
            .filter((id) => id !== "agent" && Boolean(id))
        ),
      ];

      const actors =
        actorIds.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: actorIds } },
              select: { id: true, name: true, email: true },
            })
          : [];
      const actorById = new Map(actors.map((user) => [user.id, user] as const));

      const childIds = new Set<string>();
      const deviceIds = new Set<string>();
      for (const log of logs) {
        const meta = asAuditMetadata(log.metadata);
        if (typeof meta.childId === "string") childIds.add(meta.childId);
        if (typeof meta.deviceId === "string") deviceIds.add(meta.deviceId);
      }

      const [children, devices] = await Promise.all([
        childIds.size > 0
          ? prisma.child.findMany({
              where: { familyId: family.id, id: { in: [...childIds] } },
              select: { id: true, displayName: true },
            })
          : Promise.resolve([]),
        deviceIds.size > 0
          ? prisma.device.findMany({
              where: {
                id: { in: [...deviceIds] },
                child: { familyId: family.id },
              },
              select: {
                id: true,
                displayName: true,
                machineName: true,
                childId: true,
              },
            })
          : Promise.resolve([]),
      ]);

      const childById = new Map(
        children.map((child) => [child.id, child] as const)
      );
      const deviceById = new Map(
        devices.map((device) => [device.id, device] as const)
      );

      return logs.map((log) => {
        const meta = asAuditMetadata(log.metadata);
        const device =
          typeof meta.deviceId === "string"
            ? deviceById.get(meta.deviceId)
            : undefined;
        const childId =
          typeof meta.childId === "string"
            ? meta.childId
            : device?.childId;
        const child = childId ? childById.get(childId) : undefined;
        const actor =
          log.userId === "agent"
            ? null
            : actorById.get(log.userId) ?? null;

        return {
          id: log.id,
          action: log.action,
          createdAt: log.createdAt,
          metadata: meta,
          actor: actor
            ? { id: actor.id, name: actor.name, email: actor.email }
            : null,
          childName: child?.displayName ?? null,
          deviceName: device
            ? device.displayName?.trim() ||
              device.machineName?.trim() ||
              null
            : null,
        };
      });
    }),
});

function asAuditMetadata(
  value: Prisma.JsonValue | null | undefined
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export const snapshotRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        childId: z.string().optional(),
        status: z
          .enum(["ready", "pending", "failed", "all"])
          .default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const statusFilter =
        input.status === "all"
          ? { in: ["ready", "pending", "failed"] }
          : input.status;

      const snapshots = await prisma.snapshot.findMany({
        where: {
          child: { familyId: family.id },
          ...(input.childId ? { childId: input.childId } : {}),
          status: statusFilter,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: {
          child: { select: { id: true, displayName: true } },
          device: {
            select: { id: true, machineName: true, displayName: true },
          },
        },
        orderBy: { capturedAt: "desc" },
        take: 50,
      });

      if (!isSupabaseConfigured()) {
        return snapshots.map((snapshot) => ({ ...snapshot, url: null }));
      }

      const supabase = getSupabaseAdmin();
      const withUrls = await Promise.all(
        snapshots.map(async (snapshot) => {
          if (snapshot.status !== "ready") {
            return { ...snapshot, url: null };
          }
          const url = await getCachedSignedSnapshotUrl(
            snapshot.storageKey,
            async () => {
              const { data } = await supabase.storage
                .from("snapshots")
                .createSignedUrl(snapshot.storageKey, 3600);
              return data?.signedUrl ?? null;
            }
          );
          return { ...snapshot, url };
        })
      );

      return withUrls;
    }),

  markAllViewed: parentProcedure.mutation(async ({ ctx }) => {
    const family = await getFamilyForUser(ctx);
    const result = await prisma.snapshot.updateMany({
      where: {
        child: { familyId: family.id },
        status: "ready",
        viewedAt: null,
      },
      data: { viewedAt: new Date() },
    });
    return { updated: result.count };
  }),

  delete: parentProcedure
    .input(z.object({ snapshotId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const snapshot = await prisma.snapshot.findFirst({
        where: {
          id: input.snapshotId,
          child: { familyId: family.id },
        },
      });

      if (!snapshot) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (isSupabaseConfigured() && snapshot.storageKey) {
        const supabase = getSupabaseAdmin();
        await supabase.storage
          .from("snapshots")
          .remove([snapshot.storageKey])
          .catch(() => {});
        invalidateSignedSnapshotUrl(snapshot.storageKey);
      }

      await prisma.snapshot.delete({ where: { id: snapshot.id } });

      await logAudit(family.id, ctx.userId, "snapshot_deleted", {
        snapshotId: snapshot.id,
        childId: snapshot.childId,
        deviceId: snapshot.deviceId,
        type: snapshot.type,
      });

      return { ok: true };
    }),

  getStatus: protectedProcedure
    .input(z.object({ snapshotId: z.string() }))
    .query(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const snapshot = await prisma.snapshot.findFirst({
        where: {
          id: input.snapshotId,
          child: { familyId: family.id },
        },
        select: {
          id: true,
          status: true,
          deviceId: true,
          type: true,
        },
      });

      if (!snapshot) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return snapshot;
    }),

  requestCapture: parentProcedure
    .input(
      z.object({
        deviceId: z.string(),
        type: z.enum(["screen", "webcam"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isSupabaseConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Supabase storage/realtime is not configured yet. You can still test time limits and extension approvals.",
        });
      }

      const family = await getFamilyForUser(ctx);
      const device = await prisma.device.findFirst({
        where: {
          id: input.deviceId,
          child: { familyId: family.id },
        },
        include: { child: true },
      });

      if (!device) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (!isDeviceRecentlySeen(device.lastSeenAt)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Device is offline",
        });
      }

      const hourStart = new Date();
      hourStart.setMinutes(0, 0, 0);

      const rateLimit = await prisma.captureRateLimit.upsert({
        where: {
          deviceId_hourStart: {
            deviceId: device.id,
            hourStart,
          },
        },
        create: { deviceId: device.id, hourStart, count: 1 },
        update: { count: { increment: 1 } },
      });

      if (rateLimit.count > CAPTURE_RATE_LIMIT_PER_HOUR) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Capture limit of ${CAPTURE_RATE_LIMIT_PER_HOUR}/hour exceeded`,
        });
      }

      const supabase = getSupabaseAdmin();
      const storageKey = `${family.id}/${device.childId}/${device.id}/${Date.now()}_${input.type}.jpg`;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + SNAPSHOT_RETENTION_DAYS);

      const snapshot = await prisma.snapshot.create({
        data: {
          childId: device.childId,
          deviceId: device.id,
          type: input.type,
          storageKey,
          status: "pending",
          requestedBy: ctx.userId,
          expiresAt,
        },
      });

      const { data: uploadData, error } = await supabase.storage
        .from("snapshots")
        .createSignedUploadUrl(storageKey);

      if (error || !uploadData) {
        await prisma.snapshot.update({
          where: { id: snapshot.id },
          data: { status: "failed" },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create upload URL",
        });
      }

      // Fire-and-forget: parent mutation returns as soon as the pending row + upload URL exist.
      // Tray also polls pendingCaptures every 1s as a reliable fallback.
      void broadcastToDevice(device.id, {
        type: input.type === "screen" ? "capture:screen" : "capture:webcam",
        deviceId: device.id,
        payload: {
          snapshotId: snapshot.id,
          uploadUrl: uploadData.signedUrl,
          token: uploadData.token,
          storageKey,
        },
        timestamp: new Date().toISOString(),
      }).catch(() => {});

      await logAudit(family.id, ctx.userId, "capture_requested", {
        deviceId: device.id,
        type: input.type,
        snapshotId: snapshot.id,
      });

      return snapshot;
    }),
});

export const agentRouter = router({
  pair: publicProcedure
    .input(
      z.object({
        code: z.string().length(6),
        machineName: z.string(),
        agentVersion: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const device = await prisma.device.findFirst({
        where: {
          pairingCode: input.code,
          pairingExpiresAt: { gt: new Date() },
          deviceToken: null,
        },
        include: { child: true },
      });

      if (!device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid or expired pairing code",
        });
      }

      const token = generateDeviceToken();

      const updated = await prisma.device.update({
        where: { id: device.id },
        data: {
          deviceToken: token,
          pairingCode: null,
          pairingExpiresAt: null,
          machineName: input.machineName,
          agentVersion: input.agentVersion,
          isOnline: true,
          lastSeenAt: new Date(),
        },
      });

      return {
        deviceToken: token,
        deviceId: updated.id,
        childName: device.child.displayName,
        ...getAgentBootstrapConfig(),
      };
    }),

  heartbeat: agentProcedure
    .input(
      z.object({
        activeMinutesToday: z.number(),
        idleMinutesToday: z.number(),
        isLocked: z.boolean(),
        agentVersion: z.string(),
        machineName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const device = ctx.device;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.usageLog.upsert({
        where: {
          deviceId_date: {
            deviceId: device.id,
            date: today,
          },
        },
        create: {
          deviceId: device.id,
          date: today,
          activeMinutes: input.activeMinutesToday,
          idleMinutes: input.idleMinutesToday,
        },
        update: {
          activeMinutes: input.activeMinutesToday,
          idleMinutes: input.idleMinutesToday,
        },
      });

      const wasOnline = device.isOnline;

      await prisma.device.update({
        where: { id: device.id },
        data: {
          isOnline: true,
          isLocked: input.isLocked,
          lastSeenAt: new Date(),
          agentVersion: input.agentVersion,
          machineName: input.machineName,
        },
      });

      if (!wasOnline) {
        await broadcastToDevice(device.id, {
          type: "device:online",
          deviceId: device.id,
          timestamp: new Date().toISOString(),
        });
      }

      return { ok: true };
    }),

  getPolicy: agentProcedure.query(async ({ ctx }) => {
    const device = await prisma.device.findUnique({
      where: { id: ctx.device.id },
      include: {
        child: {
          include: {
            family: true,
            policies: { where: { isActive: true }, take: 1 },
            extensionOverrides: {
              where: { expiresAt: { gt: new Date() } },
            },
          },
        },
      },
    });

    if (!device) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    const policy = device.child.policies[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const usageLogs = await prisma.usageLog.findMany({
      where: {
        device: { childId: device.childId },
        date: today,
      },
    });

    const thisDeviceLog = usageLogs.find((log) => log.deviceId === device.id);
    const usedMinutesToday = usageLogs.reduce(
      (sum, log) => sum + log.activeMinutes,
      0
    );

    const bonusMinutes = device.child.extensionOverrides.reduce(
      (sum, o) => sum + o.extraMinutes,
      0
    );

    return {
      policy: policy
        ? {
            dailyLimitMinutes: policy.dailyLimitMinutes,
            allowedWindows: policy.allowedWindows as AllowedWindow[],
            isActive: policy.isActive,
          }
        : { dailyLimitMinutes: 120, allowedWindows: [], isActive: true },
      usedMinutesToday,
      thisDeviceMinutes: thisDeviceLog?.activeMinutes ?? 0,
      bonusMinutes,
      parentPin: device.child.family.parentPin ?? null,
      adminLock: device.adminLock,
    };
  }),

  requestExtension: agentProcedure
    .input(z.object({ requestedMinutes: z.number().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const request = await prisma.extensionRequest.create({
        data: {
          childId: ctx.device.childId,
          deviceId: ctx.device.id,
          requestedMinutes: input.requestedMinutes,
          status: "pending",
        },
      });

      return request;
    }),

  parentUnlock: agentProcedure
    .input(z.object({ extraMinutes: z.number().min(1).max(480) }))
    .mutation(async ({ ctx, input }) => {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      await prisma.extensionOverride.create({
        data: {
          childId: ctx.device.childId,
          extraMinutes: input.extraMinutes,
          expiresAt: endOfDay,
        },
      });

      await prisma.device.update({
        where: { id: ctx.device.id },
        data: { isLocked: false },
      });

      await broadcastToDevice(ctx.device.id, {
        type: "extension:approved",
        deviceId: ctx.device.id,
        payload: { extraMinutes: input.extraMinutes },
        timestamp: new Date().toISOString(),
      });

      return { ok: true, extraMinutes: input.extraMinutes };
    }),

  confirmSnapshot: agentProcedure
    .input(
      z.object({
        snapshotId: z.string(),
        success: z.boolean(),
        errorMessage: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const snapshot = await prisma.snapshot.findFirst({
        where: {
          id: input.snapshotId,
          deviceId: ctx.device.id,
        },
      });

      if (!snapshot) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (!input.success) {
        await prisma.snapshot.update({
          where: { id: snapshot.id },
          data: { status: "failed" },
        });

        void broadcastToDevice(ctx.device.id, {
          type: "snapshot:failed",
          deviceId: ctx.device.id,
          payload: {
            snapshotId: snapshot.id,
            errorMessage: input.errorMessage ?? "Capture failed",
          },
          timestamp: new Date().toISOString(),
        }).catch(() => {});

        return { ok: false, error: input.errorMessage };
      }

      await prisma.snapshot.update({
        where: { id: snapshot.id },
        data: { status: "ready" },
      });

      void broadcastToDevice(ctx.device.id, {
        type: "snapshot:ready",
        deviceId: ctx.device.id,
        payload: { snapshotId: snapshot.id },
        timestamp: new Date().toISOString(),
      }).catch(() => {});

      return { ok: true };
    }),

  pendingCaptures: agentProcedure.query(async ({ ctx }) => {
    const pending = await prisma.snapshot.findMany({
      where: {
        deviceId: ctx.device.id,
        status: "pending",
        capturedAt: { gt: new Date(Date.now() - 15 * 60 * 1000) },
      },
      orderBy: { capturedAt: "asc" },
      take: 5,
    });

    if (pending.length === 0 || !isSupabaseConfigured()) {
      return [];
    }

    const supabase = getSupabaseAdmin();
    const results = [];

    for (const snapshot of pending) {
      const { data: uploadData, error } = await supabase.storage
        .from("snapshots")
        .createSignedUploadUrl(snapshot.storageKey);

      if (error || !uploadData) {
        continue;
      }

      results.push({
        snapshotId: snapshot.id,
        type: snapshot.type === "webcam" ? "capture:webcam" : "capture:screen",
        uploadUrl: uploadData.signedUrl,
        token: uploadData.token,
        storageKey: snapshot.storageKey,
      });
    }

    return results;
  }),

  pendingNudges: agentProcedure.query(async ({ ctx }) => {
    const now = new Date();
    // Read-only: do not updateMany on every poll (was exhausting the Prisma pool
    // when polled every ~1s alongside captures/heartbeats).
    const pending = await prisma.nudge.findMany({
      where: {
        deviceId: ctx.device.id,
        status: { in: ["pending", "delivered"] },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "asc" },
      take: 3,
      select: {
        id: true,
        message: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return pending.map((nudge) => ({
      nudgeId: nudge.id,
      message: nudge.message,
      // Always give the full gentle window from the moment the tray shows it.
      autoDismissSeconds: 45,
    }));
  }),

  ackNudge: agentProcedure
    .input(
      z.object({
        nudgeId: z.string(),
        status: z.enum(["delivered", "seen", "expired"]),
        response: z.enum(["ok", "on_my_way"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const nudge = await prisma.nudge.findFirst({
        where: {
          id: input.nudgeId,
          deviceId: ctx.device.id,
        },
      });

      if (!nudge) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Seen from the child always wins (even if parent/getNudge already expired it).
      if (input.status === "seen") {
        if (nudge.status === "seen") {
          return { ok: true, status: "seen", response: nudge.response };
        }

        const updated = await prisma.nudge.update({
          where: { id: nudge.id },
          data: {
            status: "seen",
            response: input.response ?? "ok",
            seenAt: new Date(),
          },
        });

        void broadcastToDevice(ctx.device.id, {
          type: "nudge:seen",
          deviceId: ctx.device.id,
          payload: {
            nudgeId: updated.id,
            response: updated.response,
          },
          timestamp: new Date().toISOString(),
        }).catch(() => {});

        return { ok: true, status: "seen", response: updated.response };
      }

      if (nudge.status === "seen" || nudge.status === "expired") {
        return { ok: true, status: nudge.status };
      }

      if (input.status === "delivered") {
        if (nudge.status === "pending") {
          await prisma.nudge.update({
            where: { id: nudge.id },
            data: { status: "delivered" },
          });
        }
        return { ok: true, status: "delivered" };
      }

      await prisma.nudge.update({
        where: { id: nudge.id },
        data: { status: "expired" },
      });
      return { ok: true, status: "expired" };
    }),

  setLocked: agentProcedure
    .input(z.object({ isLocked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.device.update({
        where: { id: ctx.device.id },
        data: { isLocked: input.isLocked },
      });

      await broadcastToDevice(ctx.device.id, {
        type: input.isLocked ? "device:locked" : "device:unlocked",
        deviceId: ctx.device.id,
        timestamp: new Date().toISOString(),
      });

      return { ok: true };
    }),

  clearAdminLock: agentProcedure.mutation(async ({ ctx }) => {
    await prisma.device.update({
      where: { id: ctx.device.id },
      data: {
        adminLock: false,
        isLocked: false,
      },
    });

    const family = await prisma.child.findUnique({
      where: { id: ctx.device.childId },
      select: { familyId: true },
    });

    if (family) {
      await logAudit(family.familyId, "agent", "admin_unlock", {
        deviceId: ctx.device.id,
        source: "parent_pin",
      });
    }

    await broadcastToDevice(ctx.device.id, {
      type: "device:unlocked",
      deviceId: ctx.device.id,
      payload: { adminLock: false },
      timestamp: new Date().toISOString(),
    });

    return { ok: true };
  }),
});

export const appRouter = router({
  auth: authRouter,
  family: familyRouter,
  children: childrenRouter,
  policy: policyRouter,
  device: deviceRouter,
  extension: extensionRouter,
  dashboard: dashboardRouter,
  snapshot: snapshotRouter,
  agent: agentRouter,
});

export type AppRouter = typeof appRouter;
