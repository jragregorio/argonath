import { appRouter, createContext } from "@argonath/api";
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
      const deviceToken = req.headers.get("x-device-token");
      return createContext({
        userId: authState.userId,
        orgId: authState.orgId,
        deviceToken,
      });
    },
  });

export { handler as GET, handler as POST };
