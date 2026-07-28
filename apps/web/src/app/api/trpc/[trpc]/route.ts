import { createContext } from "@warden/api";
import { appRouter } from "@warden/api";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { ACCESS_COOKIE } from "@warden/api";

const devAuthBypassEnabled =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      const deviceToken = req.headers.get("x-device-token");

      if (devAuthBypassEnabled) {
        return createContext({
          devBypass: true,
          userId: process.env.DEV_BYPASS_USER_ID ?? "dev-parent",
          familyId: process.env.DEV_BYPASS_FAMILY_ID ?? "dev-family",
          deviceToken,
        });
      }

      const cookieHeader = req.headers.get("cookie") ?? "";
      const accessToken =
        cookieHeader
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith(`${ACCESS_COOKIE}=`))
          ?.slice(ACCESS_COOKIE.length + 1) ?? null;

      return createContext({
        accessToken: accessToken ? decodeURIComponent(accessToken) : null,
        deviceToken,
      });
    },
  });

export { handler as GET, handler as POST };
