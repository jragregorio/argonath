import { prisma } from "@warden/db";
import type { Prisma } from "@warden/db";
import {
  CAPTURE_RATE_LIMIT_PER_HOUR,
  evaluatePolicy,
  generateDeviceToken,
  generatePairingCode,
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
  protectedProcedure,
  parentProcedure,
  adminProcedure,
  agentProcedure,
  publicProcedure,
  router,
} from "../trpc";
import { requireFamilyAccess } from "../auth/session";

async function getFamilyForUser(ctx: { userId: string; familyId: string }) {
  return requireFamilyAccess(ctx.userId, ctx.familyId);
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

  return child;
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

const allowedWindowSchema = z.object({
  day: z.number().min(1).max(7),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const familyRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return getFamilyForUser(ctx);
  }),

  /** @deprecated Use `get` — kept for existing clients during the auth migration */
  getOrCreate: protectedProcedure.query(async ({ ctx }) => {
    return getFamilyForUser(ctx);
  }),

  updatePin: adminProcedure
    .input(z.object({ pin: z.string().min(4).max(8) }))
    .mutation(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      await logAudit(family.id, ctx.userId, "pin_updated");
      return prisma.family.update({
        where: { id: family.id },
        data: { parentPin: input.pin },
      });
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
});

export const childrenRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const family = await getFamilyForUser(ctx);
    return prisma.child.findMany({
      where: { familyId: family.id },
      include: {
        devices: true,
        policies: { where: { isActive: true }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
    });
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
    return prisma.device.findMany({
      where: { child: { familyId: family.id } },
      include: { child: { select: { id: true, displayName: true } } },
      orderBy: { lastSeenAt: "desc" },
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
        device: { select: { id: true, machineName: true } },
      },
      orderBy: { createdAt: "desc" },
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

export const snapshotRouter = router({
  list: protectedProcedure
    .input(z.object({ childId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const family = await getFamilyForUser(ctx);
      const snapshots = await prisma.snapshot.findMany({
        where: {
          child: { familyId: family.id },
          ...(input.childId ? { childId: input.childId } : {}),
          status: "ready",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: {
          child: { select: { displayName: true } },
          device: { select: { machineName: true } },
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
          const { data } = await supabase.storage
            .from("snapshots")
            .createSignedUrl(snapshot.storageKey, 3600);
          return { ...snapshot, url: data?.signedUrl ?? null };
        })
      );

      return withUrls;
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

      if (!device.isOnline) {
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

      // #region agent log
      fetch("http://127.0.0.1:7764/ingest/6998f640-5197-44a4-94e8-0f0d80575bef", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "8f2974",
        },
        body: JSON.stringify({
          sessionId: "8f2974",
          runId: "pre-fix",
          hypothesisId: "E",
          location: "routers/index.ts:requestCapture",
          message: "requestCapture created pending snapshot",
          data: { snapshotId: snapshot.id, deviceId: device.id, type: input.type },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

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
        // #region agent log
        fetch("http://127.0.0.1:7764/ingest/6998f640-5197-44a4-94e8-0f0d80575bef", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "8f2974",
          },
          body: JSON.stringify({
            sessionId: "8f2974",
            runId: "pre-fix",
            hypothesisId: "D",
            location: "routers/index.ts:confirmSnapshot",
            message: "confirmSnapshot not found",
            data: { snapshotId: input.snapshotId, deviceId: ctx.device.id },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (!input.success) {
        await prisma.snapshot.update({
          where: { id: snapshot.id },
          data: { status: "failed" },
        });

        // #region agent log
        fetch("http://127.0.0.1:7764/ingest/6998f640-5197-44a4-94e8-0f0d80575bef", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "8f2974",
          },
          body: JSON.stringify({
            sessionId: "8f2974",
            runId: "pre-fix",
            hypothesisId: "D",
            location: "routers/index.ts:confirmSnapshot",
            message: "confirmSnapshot marked failed",
            data: {
              snapshotId: snapshot.id,
              errorMessage: input.errorMessage ?? null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

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

      // #region agent log
      fetch("http://127.0.0.1:7764/ingest/6998f640-5197-44a4-94e8-0f0d80575bef", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "8f2974",
        },
        body: JSON.stringify({
          sessionId: "8f2974",
          runId: "pre-fix",
          hypothesisId: "D",
          location: "routers/index.ts:confirmSnapshot",
          message: "confirmSnapshot marked ready",
          data: { snapshotId: snapshot.id },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

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
      // #region agent log
      fetch("http://127.0.0.1:7764/ingest/6998f640-5197-44a4-94e8-0f0d80575bef", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "8f2974",
        },
        body: JSON.stringify({
          sessionId: "8f2974",
          runId: "pre-fix",
          hypothesisId: "A",
          location: "routers/index.ts:pendingCaptures",
          message: "No pending captures returned",
          data: {
            deviceId: ctx.device.id,
            pendingCount: pending.length,
            supabaseConfigured: isSupabaseConfigured(),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return [];
    }

    const supabase = getSupabaseAdmin();
    const results = [];
    const signErrors: string[] = [];

    for (const snapshot of pending) {
      const { data: uploadData, error } = await supabase.storage
        .from("snapshots")
        .createSignedUploadUrl(snapshot.storageKey);

      if (error || !uploadData) {
        signErrors.push(`${snapshot.id}:${error?.message ?? "no upload data"}`);
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

    // #region agent log
    fetch("http://127.0.0.1:7764/ingest/6998f640-5197-44a4-94e8-0f0d80575bef", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "8f2974",
      },
      body: JSON.stringify({
        sessionId: "8f2974",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "routers/index.ts:pendingCaptures",
        message: "pendingCaptures result",
        data: {
          deviceId: ctx.device.id,
          pendingCount: pending.length,
          returnedCount: results.length,
          signErrors,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return results;
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
  snapshot: snapshotRouter,
  agent: agentRouter,
});

export type AppRouter = typeof appRouter;
