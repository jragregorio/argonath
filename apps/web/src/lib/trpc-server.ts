import "server-only";

import { cookies } from "next/headers";
import { createServerSideHelpers } from "@trpc/react-query/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  appRouter,
  createContext,
  type AppRouter,
} from "@warden/api";
import superjson from "superjson";

const devAuthBypassEnabled =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

type DashboardHelpers = ReturnType<
  typeof createServerSideHelpers<AppRouter>
>;

export async function createTRPCServerHelpers(): Promise<DashboardHelpers> {
  const cookieStore = await cookies();

  const ctx = await createContext(
    devAuthBypassEnabled
      ? {
          devBypass: true,
          userId: process.env.DEV_BYPASS_USER_ID ?? "dev-parent",
          familyId: process.env.DEV_BYPASS_FAMILY_ID ?? "dev-family",
        }
      : {
          accessToken: cookieStore.get(ACCESS_COOKIE)?.value ?? null,
          refreshToken: cookieStore.get(REFRESH_COOKIE)?.value ?? null,
        }
  );

  return createServerSideHelpers({
    router: appRouter,
    ctx,
    transformer: superjson,
  });
}

/** Prefetch shared dashboard shell data (nav + realtime device ids). */
export async function prefetchDashboardShell() {
  try {
    const helpers = await createTRPCServerHelpers();
    await Promise.all([
      helpers.dashboard.navBadges.prefetch(),
      helpers.device.list.prefetch(),
    ]);
    return helpers.dehydrate();
  } catch {
    // Unauthenticated or transient errors — client will fetch as usual.
    return null;
  }
}

/** Prefetch Overview page queries. */
export async function prefetchDashboardOverview() {
  try {
    const helpers = await createTRPCServerHelpers();
    await Promise.all([
      helpers.dashboard.overview.prefetch(),
      helpers.dashboard.activity.prefetch({ limit: 20 }),
    ]);
    return helpers.dehydrate();
  } catch {
    return null;
  }
}
