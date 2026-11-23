import { appRouter, createContext } from "@warden/api";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Public latest-release lookup used by the SYSTEM updater (Warden.Updater.exe).
 * GET /api/agent/release/latest?channel=stable
 */
export async function GET(request: NextRequest) {
  const channelParam = request.nextUrl.searchParams.get("channel") ?? "stable";
  if (channelParam !== "stable" && channelParam !== "test") {
    return NextResponse.json(
      { error: "invalid_channel" },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const caller = appRouter.createCaller(await createContext({}));
    const latest = await caller.agentRelease.publicLatest({ channel: channelParam });
    if (!latest) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: NO_STORE }
      );
    }
    return NextResponse.json(latest, { headers: NO_STORE });
  } catch (error) {
    console.error("[agentRelease] public latest failed", error);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: NO_STORE }
    );
  }
}
