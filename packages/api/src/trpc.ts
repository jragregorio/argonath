import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { FamilyRole } from "@warden/db";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId || !ctx.familyId || !ctx.role) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      familyId: ctx.familyId,
      role: ctx.role,
    },
  });
});

const PARENT_ROLES: FamilyRole[] = ["Admin", "Parent"];

export const parentProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!PARENT_ROLES.includes(ctx.role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.role !== "Admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

export const agentProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.device) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid device token" });
  }
  return next({
    ctx: {
      ...ctx,
      device: ctx.device,
    },
  });
});
