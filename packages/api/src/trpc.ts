import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId || !ctx.orgId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      orgId: ctx.orgId,
    },
  });
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
