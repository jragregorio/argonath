import { appRouter, createContext } from "@warden/api";
import { auth } from "@clerk/nextjs/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

const devAuthBypassEnabled =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      const authState = devAuthBypassEnabled
        ? {
            userId: process.env.DEV_BYPASS_USER_ID ?? "dev-parent",
            orgId: process.env.DEV_BYPASS_ORG_ID ?? "dev-family",
          }
        : await auth();
      // Clerk orgId is only set with an active Organization. For solo parents,
      // fall back to a stable per-user family key so the dashboard works without orgs.
      const userId = authState.userId ?? null;
      const orgId = authState.orgId ?? (userId ? `user_${userId}` : null);
      const deviceToken = req.headers.get("x-device-token");
      return createContext({
        userId,
        orgId,
        deviceToken,
      });
    },
  });

export { handler as GET, handler as POST };
