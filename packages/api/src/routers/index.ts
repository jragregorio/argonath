import { prisma } from "@warden/db";
import type { Prisma } from "@warden/db";
import {
  CAPTURE_RATE_LIMIT_PER_HOUR,
  DEFAULT_TIME_ZONE,
  DEFAULT_NUDGE_MESSAGE,
  compareAgentVersions,
  evaluatePolicy,
  generateDeviceToken,
  generatePairingCode,
  getCalendarDateInTimeZone,
  getDeviceDisplayName,
  isDeviceRecentlySeen,
  isValidTimeZone,
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
import { notifyFamilyParents } from "../lib/fcm";
import {
  getCachedSignedSnapshotUrl,
  invalidateSignedSnapshotUrl,
  isMissingStorageObjectError,
  markSignedSnapshotUrlMissing,
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

async function getFamilyForUser(ctx: {
  userId: string;
  familyId: string;
  loadFamily: () => Promise<
    Awaited<ReturnType<typeof requireFamilyAccess>>
  >;
}) {
  return ctx.loadFamily();
}

/** Fields safe to expose to the parent dashboard (no deviceToken). */
const deviceClientSelect = {
  id: true,
  childId: true,
  displayName: true,
  machineName: true,
  platform: true,
  agentVersion: true,
  lastSeenAt: true,
  isOnline: true,
  isLocked: true,
  adminLock: true,
  lastUncleanExitAt: true,
  pairingCode: true,
  pairingExpiresAt: true,
  createdAt: true,
  updatedAt: true,
  // Selected only to derive isPaired; stripped before return.
  deviceToken: true,
} satisfies Prisma.DeviceSelect;

type DeviceClientSource = {
  id: string;
  childId: string;
  displayName: string | null;
  machineName: string | null;
  platform: string;
  agentVersion: string | null;
  lastSeenAt: Date | null;
  isOnline: boolean;
  isLocked: boolean;
  adminLock: boolean;
  lastUncleanExitAt: Date | null;
  pairingCode: string | null;
  pairingExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deviceToken: string | null;
};

function toDeviceClientViews(devices: DeviceClientSource[]) {
  const now = new Date();
  return devices.map((device) => {
    const { deviceToken, ...rest } = device;
    return {
      ...rest,
      isOnline: isDeviceRecentlySeen(device.lastSeenAt, now),
      isPaired: Boolean(deviceToken),
    };
  });
}

async function getChildForFamily(childId: string, familyId: string) {
  const child = await prisma.child.findFirst({
    where: { id: childId, familyId },
    include: {
      devices: { select: deviceClientSelect },
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
    devices: toDeviceClientViews(child.devices),
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

const AGENT_RELEASES_BUCKET = "agent-releases";
const agentReleaseChannelSchema = z.enum(["stable", "test"]);

type AgentReleaseRow = {
  version: string;
  sha256: string;
  sizeBytes: number;
  mandatory: boolean;
  publishedAt: Date;
  storageKey: string;
};

async function findLatestAgentRelease(
  channel: "stable" | "test"
): Promise<AgentReleaseRow | null> {
  return prisma.agentRelease.findFirst({
    where: { channel },
    orderBy: { publishedAt: "desc" },
    select: {
      version: true,
      sha256: true,
      sizeBytes: true,
      mandatory: true,
      publishedAt: true,
      storageKey: true,
    },
  });
}

async function createAgentReleaseSignedUrl(
  storageKey: string,
  expiresInSeconds: number
): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(AGENT_RELEASES_BUCKET)
    .createSignedUrl(storageKey, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

/** Best-effort update hint for agents; never throws. */
async function getHeartbeatUpdateHint(
  agentVersion: string
): Promise<{
  version: string;
  sha256: string;
  sizeBytes: number;
  mandatory: boolean;
  downloadUrl: string;
} | null> {
  try {
    if (!isSupabaseConfigured()) {
      return null;
    }

    const latest = await findLatestAgentRelease("stable");
    if (!latest) {
      return null;
    }

    if (compareAgentVersions(latest.version, agentVersion) <= 0) {
      return null;
    }

    const downloadUrl = await createAgentReleaseSignedUrl(
      latest.storageKey,
      30 * 60
    );
    if (!downloadUrl) {
      return null;
    }

    return {
      version: latest.version,
      sha256: latest.sha256,
      sizeBytes: latest.sizeBytes,
      mandatory: latest.mandatory,
      downloadUrl,
    };
  } catch (error) {
    console.error("[agentRelease] heartbeat update lookup failed", error);
    return null;
  }
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

  updateTimezone: adminProcedure
    .input(
      z.object({
        timezone: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .refine(isValidTimeZone, "Invalid IANA time zone"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const updated = await prisma.family.update({
        where: { id: family.id },
        data: { timezone: input.timezone },
      });
      await logAudit(family.id, ctx.userId, "timezone_updated", {
        timezone: input.timezone,
      });
      return toFamilyClientView(updated);
    }),
});

export const authRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const [user, memberships] = await Promise.all([
      prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      prisma.familyMember.findMany({
        where: { userId: ctx.userId },
        include: { family: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    if (!user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

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

      await revokeOtherUserSessions(
        ctx.userId,
        await ctx.resolveRefreshTokenFamilyId()
      );

      return { ok: true };
    }),
});

export const childrenRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const [, children] = await Promise.all([
      getFamilyForUser(ctx),
      prisma.child.findMany({
        where: { familyId: ctx.familyId },
        include: {
          devices: { select: deviceClientSelect },
          policies: { where: { isActive: true }, take: 1 },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return children.map((child) => ({
      ...child,
      devices: toDeviceClientViews(child.devices),
    }));
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
        include: {
          policies: true,
          devices: { select: deviceClientSelect },
        },
      });
      await logAudit(family.id, ctx.userId, "child_created", {
        childId: child.id,
      });
      return {
        ...child,
        devices: toDeviceClientViews(child.devices),
      };
    }),

  get: protectedProcedure
    .input(z.object({ childId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [, child] = await Promise.all([
        getFamilyForUser(ctx),
        getChildForFamily(input.childId, ctx.familyId),
      ]);
      return child;
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

      // Best-effort: tray also polls agent.getPolicy for the updated policy.
      for (const device of child.devices) {
        void broadcastToDevice(device.id, {
          type: "policy:updated",
          deviceId: device.id,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }

      return policy;
    }),

  getEvaluation: protectedProcedure
    .input(z.object({ childId: z.string() }))
    .query(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const timeZone = family.timezone || DEFAULT_TIME_ZONE;
      const today = getCalendarDateInTimeZone(new Date(), timeZone);

      const [child, usageLogs] = await Promise.all([
        getChildForFamily(input.childId, ctx.familyId),
        prisma.usageLog.findMany({
          where: {
            device: { childId: input.childId },
            date: today,
          },
        }),
      ]);
      const policy = child.policies[0];

      const usedMinutes = usageLogs.reduce((sum, log) => sum + log.activeMinutes, 0);
      const overrides = child.extensionOverrides.map((o) => ({
        extraMinutes: o.extraMinutes,
        expiresAt: o.expiresAt,
      }));

      if (!policy) {
        return evaluatePolicy(
          { dailyLimitMinutes: 120, allowedWindows: [], isActive: true },
          usedMinutes,
          overrides,
          new Date(),
          timeZone
        );
      }

      return evaluatePolicy(
        {
          dailyLimitMinutes: policy.dailyLimitMinutes,
          allowedWindows: policy.allowedWindows as AllowedWindow[],
          isActive: policy.isActive,
        },
        usedMinutes,
        overrides,
        new Date(),
        timeZone
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
    const [, devices] = await Promise.all([
      getFamilyForUser(ctx),
      prisma.device.findMany({
        where: { child: { familyId: ctx.familyId } },
        select: {
          ...deviceClientSelect,
          child: { select: { id: true, displayName: true } },
        },
        orderBy: { lastSeenAt: "desc" },
      }),
    ]);
    return devices.map((device) => {
      const { child, deviceToken, ...rest } = device;
      return {
        ...rest,
        isOnline: isDeviceRecentlySeen(device.lastSeenAt),
        isPaired: Boolean(deviceToken),
        child,
      };
    });
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

  dismissUncleanExit: parentProcedure
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

      return prisma.device.update({
        where: { id: device.id },
        data: { lastUncleanExitAt: null },
        select: { id: true, lastUncleanExitAt: true },
      });
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
      const now = new Date();
      const [family, device, active] = await Promise.all([
        getFamilyForUser(ctx),
        prisma.device.findFirst({
          where: {
            id: input.deviceId,
            child: { familyId: ctx.familyId },
          },
        }),
        prisma.nudge.findFirst({
          where: {
            deviceId: input.deviceId,
            status: { in: ["pending", "delivered"] },
            expiresAt: { gt: now },
          },
        }),
      ]);

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
        input.message?.trim() || DEFAULT_NUDGE_MESSAGE;
      const custom = message !== DEFAULT_NUDGE_MESSAGE;

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
        message,
        custom,
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
    const [, requests] = await Promise.all([
      getFamilyForUser(ctx),
      prisma.extensionRequest.findMany({
        where: {
          child: { familyId: ctx.familyId },
          status: "pending",
        },
        include: {
          child: { select: { id: true, displayName: true } },
          device: {
            select: { id: true, machineName: true, displayName: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return requests;
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
      const [family, request] = await Promise.all([
        getFamilyForUser(ctx),
        prisma.extensionRequest.findFirst({
          where: {
            id: input.requestId,
            child: { familyId: ctx.familyId },
            status: "pending",
          },
          include: { device: true },
        }),
      ]);

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

        await Promise.all([
          prisma.extensionOverride.create({
            data: {
              childId: request.childId,
              extraMinutes: request.requestedMinutes,
              expiresAt: endOfDay,
              sourceRequestId: request.id,
            },
          }),
          prisma.device.update({
            where: { id: request.deviceId },
            data: { isLocked: false },
          }),
          logAudit(family.id, ctx.userId, `extension_${status}`, {
            requestId: request.id,
            minutes: request.requestedMinutes,
          }),
        ]);

        // Best-effort: tray also polls agent.getPolicy (bonusMinutes / lock state).
        void broadcastToDevice(request.deviceId, {
          type: "extension:approved",
          deviceId: request.deviceId,
          payload: { extraMinutes: request.requestedMinutes },
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      } else {
        await logAudit(family.id, ctx.userId, `extension_${status}`, {
          requestId: request.id,
          minutes: request.requestedMinutes,
        });

        // Best-effort: tray also polls agent.getPolicy (bonusMinutes / lock state).
        void broadcastToDevice(request.deviceId, {
          type: "extension:denied",
          deviceId: request.deviceId,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }

      return { status };
    }),

  clearBonus: parentProcedure
    .input(z.object({ childId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const child = await getChildForFamily(input.childId, family.id);
      const now = new Date();

      const activeOverrides = child.extensionOverrides;
      const clearedMinutes = activeOverrides.reduce(
        (sum, o) => sum + o.extraMinutes,
        0
      );

      if (activeOverrides.length === 0) {
        return { ok: true, clearedMinutes: 0, clearedCount: 0 };
      }

      await prisma.extensionOverride.updateMany({
        where: {
          childId: child.id,
          expiresAt: { gt: now },
        },
        data: { expiresAt: now },
      });

      await logAudit(family.id, ctx.userId, "bonus_cleared", {
        childId: child.id,
        minutes: clearedMinutes,
        count: activeOverrides.length,
      });

      // Best-effort: tray polls agent.getPolicy and also handles policy:updated.
      for (const device of child.devices) {
        void broadcastToDevice(device.id, {
          type: "policy:updated",
          deviceId: device.id,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }

      return {
        ok: true,
        clearedMinutes,
        clearedCount: activeOverrides.length,
      };
    }),
});

export const dashboardRouter = router({
  navBadges: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();

    const [, pendingRequests, unviewedSnapshots] = await Promise.all([
      getFamilyForUser(ctx),
      prisma.extensionRequest.count({
        where: {
          child: { familyId: ctx.familyId },
          status: "pending",
        },
      }),
      prisma.snapshot.count({
        where: {
          child: { familyId: ctx.familyId },
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
    const timeZone = family.timezone || DEFAULT_TIME_ZONE;
    const today = getCalendarDateInTimeZone(new Date(), timeZone);
    const now = new Date();

    const [children, pendingRequests, usageLogs] = await Promise.all([
      prisma.child.findMany({
        where: { familyId: ctx.familyId },
        include: {
          devices: { select: deviceClientSelect },
          policies: { where: { isActive: true }, take: 1 },
          extensionOverrides: {
            where: { expiresAt: { gt: now } },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.extensionRequest.count({
        where: {
          child: { familyId: ctx.familyId },
          status: "pending",
        },
      }),
      prisma.usageLog.findMany({
        where: {
          date: today,
          device: { child: { familyId: ctx.familyId } },
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
          })),
          now,
          timeZone
        );

        const devices = toDeviceClientViews(child.devices);

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
            isPaired: device.isPaired,
            agentVersion: device.agentVersion,
          })),
        };
      }),
    };
  }),

  /** Recent family audit events for Overview / child activity feeds. */
  activity: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(30),
          childId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const limit = input?.limit ?? 30;
      const filterChildId = input?.childId;

      let where: Prisma.AuditLogWhereInput = { familyId: family.id };

      if (filterChildId) {
        const child = await prisma.child.findFirst({
          where: { id: filterChildId, familyId: family.id },
          select: { id: true, devices: { select: { id: true } } },
        });
        if (!child) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const deviceIds = child.devices.map((device) => device.id);
        where = {
          familyId: family.id,
          OR: [
            {
              metadata: {
                path: ["childId"],
                equals: filterChildId,
              },
            },
            ...deviceIds.map((deviceId) => ({
              metadata: {
                path: ["deviceId"],
                equals: deviceId,
              },
            })),
          ],
        };
      }

      const logs = await prisma.auditLog.findMany({
        where,
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
      const nudgeIds = new Set<string>();
      for (const log of logs) {
        const meta = asAuditMetadata(log.metadata);
        if (typeof meta.childId === "string") childIds.add(meta.childId);
        if (typeof meta.deviceId === "string") deviceIds.add(meta.deviceId);
        if (
          log.action === "nudge_sent" &&
          typeof meta.nudgeId === "string" &&
          typeof meta.message !== "string"
        ) {
          nudgeIds.add(meta.nudgeId);
        }
      }

      const [children, devices, nudges] = await Promise.all([
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
        nudgeIds.size > 0
          ? prisma.nudge.findMany({
              where: { familyId: family.id, id: { in: [...nudgeIds] } },
              select: { id: true, message: true },
            })
          : Promise.resolve([]),
      ]);

      const childById = new Map(
        children.map((child) => [child.id, child] as const)
      );
      const deviceById = new Map(
        devices.map((device) => [device.id, device] as const)
      );
      const nudgeById = new Map(
        nudges.map((nudge) => [nudge.id, nudge] as const)
      );

      return logs.map((log) => {
        let meta = asAuditMetadata(log.metadata);
        if (
          log.action === "nudge_sent" &&
          typeof meta.message !== "string" &&
          typeof meta.nudgeId === "string"
        ) {
          const nudge = nudgeById.get(meta.nudgeId);
          if (nudge) {
            meta = {
              ...meta,
              message: nudge.message,
              custom: nudge.message !== DEFAULT_NUDGE_MESSAGE,
            };
          }
        }

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

          let markedFailed = false;
          const url = await getCachedSignedSnapshotUrl(
            snapshot.storageKey,
            async () => {
              const { data, error } = await supabase.storage
                .from("snapshots")
                .createSignedUrl(snapshot.storageKey, 3600);

              if (data?.signedUrl) {
                return data.signedUrl;
              }

              // Orphan ready row: DB says ready but the object is gone from Storage.
              // Mark failed so we stop re-signing every poll (stops 400 spam).
              if (isMissingStorageObjectError(error)) {
                markSignedSnapshotUrlMissing(snapshot.storageKey);
                markedFailed = true;
                await prisma.snapshot
                  .update({
                    where: { id: snapshot.id },
                    data: { status: "failed" },
                  })
                  .catch(() => {});
              }
              return null;
            }
          );

          return {
            ...snapshot,
            ...(markedFailed ? { status: "failed" as const } : {}),
            url,
          };
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

  deleteMany: parentProcedure
    .input(
      z.object({
        snapshotIds: z.array(z.string()).min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const uniqueIds = [...new Set(input.snapshotIds)];
      const snapshots = await prisma.snapshot.findMany({
        where: {
          id: { in: uniqueIds },
          child: { familyId: family.id },
        },
      });

      if (snapshots.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const storageKeys = snapshots
        .map((snapshot) => snapshot.storageKey)
        .filter((key): key is string => Boolean(key));

      if (isSupabaseConfigured() && storageKeys.length > 0) {
        const supabase = getSupabaseAdmin();
        await supabase.storage
          .from("snapshots")
          .remove(storageKeys)
          .catch(() => {});
        for (const key of storageKeys) {
          invalidateSignedSnapshotUrl(key);
        }
      }

      await prisma.snapshot.deleteMany({
        where: {
          id: { in: snapshots.map((snapshot) => snapshot.id) },
          child: { familyId: family.id },
        },
      });

      await logAudit(family.id, ctx.userId, "snapshots_bulk_deleted", {
        count: snapshots.length,
        snapshotIds: snapshots.map((snapshot) => snapshot.id),
      });

      return { ok: true, deleted: snapshots.length };
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

      const [family, device] = await Promise.all([
        getFamilyForUser(ctx),
        prisma.device.findFirst({
          where: {
            id: input.deviceId,
            child: { familyId: ctx.familyId },
          },
          include: { child: true },
        }),
      ]);

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
        previousSessionUnclean: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const device = ctx.device;

      const child = await prisma.child.findUnique({
        where: { id: device.childId },
        select: {
          displayName: true,
          familyId: true,
          family: { select: { timezone: true } },
        },
      });
      const timeZone = child?.family.timezone || DEFAULT_TIME_ZONE;
      const today = getCalendarDateInTimeZone(new Date(), timeZone);

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

      const wasRecentlySeen = isDeviceRecentlySeen(device.lastSeenAt);

      await prisma.device.update({
        where: { id: device.id },
        data: {
          isOnline: true,
          isLocked: input.isLocked,
          lastSeenAt: new Date(),
          offlineNotifiedAt: null,
          agentVersion: input.agentVersion,
          machineName: input.machineName,
          ...(input.previousSessionUnclean
            ? { lastUncleanExitAt: new Date() }
            : {}),
        },
      });

      // DB isOnline is sticky (never cleared); detect reconnect from lastSeen window.
      if (!wasRecentlySeen) {
        void broadcastToDevice(device.id, {
          type: "device:online",
          deviceId: device.id,
          timestamp: new Date().toISOString(),
        }).catch(() => {});

        if (child) {
          const now = new Date();
          const timeLabel = new Intl.DateTimeFormat("en-US", {
            timeZone: timeZone,
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }).format(now);
          const deviceLabel = getDeviceDisplayName({
            displayName: device.displayName,
            machineName: input.machineName,
          });
          void notifyFamilyParents(child.familyId, {
            title: "Device online",
            body: `${child.displayName}'s ${deviceLabel} came online at ${timeLabel}`,
            data: {
              type: "device:online",
              deviceId: device.id,
              childId: device.childId,
              path: `/dashboard/children/${device.childId}`,
            },
          }).catch((error) => {
            console.error("[fcm] device online notify failed", error);
          });
        }
      }

      const update = await getHeartbeatUpdateHint(input.agentVersion);
      return update ? { ok: true as const, update } : { ok: true as const };
    }),

  getPolicy: agentProcedure.query(async ({ ctx }) => {
    const now = new Date();

    const child = await prisma.child.findUnique({
      where: { id: ctx.device.childId },
      include: {
        family: { select: { parentPin: true, timezone: true } },
        policies: { where: { isActive: true }, take: 1 },
        extensionOverrides: {
          where: { expiresAt: { gt: now } },
        },
      },
    });

    if (!child) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    const timeZone = child.family.timezone || DEFAULT_TIME_ZONE;
    const today = getCalendarDateInTimeZone(now, timeZone);

    const usageLogs = await prisma.usageLog.findMany({
      where: {
        device: { childId: ctx.device.childId },
        date: today,
      },
    });

    const policy = child.policies[0];

    const thisDeviceLog = usageLogs.find((log) => log.deviceId === ctx.device.id);
    const usedMinutesToday = usageLogs.reduce(
      (sum, log) => sum + log.activeMinutes,
      0
    );

    const bonusMinutes = child.extensionOverrides.reduce(
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
      parentPin: child.family.parentPin ?? null,
      adminLock: ctx.device.adminLock,
      timezone: timeZone,
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

      void broadcastToDevice(ctx.device.id, {
        type: "extension:requested",
        deviceId: ctx.device.id,
        payload: {
          requestId: request.id,
          childId: ctx.device.childId,
          requestedMinutes: input.requestedMinutes,
        },
        timestamp: new Date().toISOString(),
      }).catch(() => {});

      const child = await prisma.child.findUnique({
        where: { id: ctx.device.childId },
        select: { displayName: true, familyId: true },
      });
      if (child) {
        void notifyFamilyParents(child.familyId, {
          title: "More time requested",
          body: `${child.displayName} asked for ${input.requestedMinutes} more minutes`,
          data: {
            type: "extension:requested",
            requestId: request.id,
            childId: ctx.device.childId,
            path: "/dashboard/activity",
          },
        }).catch((error) => {
          console.error("[fcm] extension notify failed", error);
        });
      }

      return request;
    }),

  parentUnlock: agentProcedure
    .input(z.object({ extraMinutes: z.number().min(1).max(480) }))
    .mutation(async ({ ctx, input }) => {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      await Promise.all([
        prisma.extensionOverride.create({
          data: {
            childId: ctx.device.childId,
            extraMinutes: input.extraMinutes,
            expiresAt: endOfDay,
          },
        }),
        prisma.device.update({
          where: { id: ctx.device.id },
          data: { isLocked: false },
        }),
      ]);

      void broadcastToDevice(ctx.device.id, {
        type: "extension:approved",
        deviceId: ctx.device.id,
        payload: { extraMinutes: input.extraMinutes },
        timestamp: new Date().toISOString(),
      }).catch(() => {});

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
      // upsert: true so a re-poll after a successful PUT does not 400 with
      // "already exists" when createSignedUploadUrl tries to reserve the key again.
      const { data: uploadData, error } = await supabase.storage
        .from("snapshots")
        .createSignedUploadUrl(snapshot.storageKey, { upsert: true });

      if (uploadData && !error) {
        results.push({
          snapshotId: snapshot.id,
          type: snapshot.type === "webcam" ? "capture:webcam" : "capture:screen",
          uploadUrl: uploadData.signedUrl,
          token: uploadData.token,
          storageKey: snapshot.storageKey,
        });
        continue;
      }

      // Fallback: object may already be in the bucket (upload done, confirm pending).
      // Promote to ready instead of leaving it pending forever.
      const { data: existing } = await supabase.storage
        .from("snapshots")
        .createSignedUrl(snapshot.storageKey, 60);

      if (existing?.signedUrl) {
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
      }
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

      void broadcastToDevice(ctx.device.id, {
        type: input.isLocked ? "device:locked" : "device:unlocked",
        deviceId: ctx.device.id,
        timestamp: new Date().toISOString(),
      }).catch(() => {});

      return { ok: true };
    }),

  clearAdminLock: agentProcedure.mutation(async ({ ctx }) => {
    const [, family] = await Promise.all([
      prisma.device.update({
        where: { id: ctx.device.id },
        data: {
          adminLock: false,
          isLocked: false,
        },
      }),
      prisma.child.findUnique({
        where: { id: ctx.device.childId },
        select: { familyId: true },
      }),
    ]);

    if (family) {
      await logAudit(family.familyId, "agent", "admin_unlock", {
        deviceId: ctx.device.id,
        source: "parent_pin",
      });
    }

    void broadcastToDevice(ctx.device.id, {
      type: "device:unlocked",
      deviceId: ctx.device.id,
      payload: { adminLock: false },
      timestamp: new Date().toISOString(),
    }).catch(() => {});

    return { ok: true };
  }),
});

export const agentReleaseRouter = router({
  /** Version metadata only — no Storage signed URL (works without Supabase). */
  latestMeta: parentProcedure
    .input(
      z
        .object({
          channel: agentReleaseChannelSchema.default("stable"),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const channel = input?.channel ?? "stable";

      try {
        const latest = await findLatestAgentRelease(channel);
        if (!latest) {
          return null;
        }

        return {
          version: latest.version,
          mandatory: latest.mandatory,
          publishedAt: latest.publishedAt,
        };
      } catch (error) {
        console.error("[agentRelease] latestMeta lookup failed", error);
        return null;
      }
    }),

  latest: parentProcedure
    .input(
      z
        .object({
          channel: agentReleaseChannelSchema.default("stable"),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const channel = input?.channel ?? "stable";

      try {
        if (!isSupabaseConfigured()) {
          return null;
        }

        const latest = await findLatestAgentRelease(channel);
        if (!latest) {
          return null;
        }

        const downloadUrl = await createAgentReleaseSignedUrl(
          latest.storageKey,
          3600
        );
        if (!downloadUrl) {
          return null;
        }

        return {
          version: latest.version,
          sha256: latest.sha256,
          sizeBytes: latest.sizeBytes,
          mandatory: latest.mandatory,
          publishedAt: latest.publishedAt,
          downloadUrl,
        };
      } catch (error) {
        console.error("[agentRelease] latest lookup failed", error);
        return null;
      }
    }),
});

export const pushRouter = router({
  registerToken: parentProcedure
    .input(
      z.object({
        token: z.string().min(10).max(4096),
        platform: z.enum(["android"]).default("android"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser({
        userId: ctx.userId!,
        familyId: ctx.familyId!,
        loadFamily: ctx.loadFamily,
      });

      await prisma.pushToken.upsert({
        where: { token: input.token },
        create: {
          token: input.token,
          userId: ctx.userId!,
          familyId: family.id,
          platform: input.platform,
        },
        update: {
          userId: ctx.userId!,
          familyId: family.id,
          platform: input.platform,
        },
      });

      return { ok: true as const };
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
  agentRelease: agentReleaseRouter,
  push: pushRouter,
});

export type AppRouter = typeof appRouter;
