import { appRouter, createContext } from "@argonath/api";
import { NextRequest, NextResponse } from "next/server";

type AgentProcedure =
  | "pair"
  | "heartbeat"
  | "getPolicy"
  | "requestExtension"
  | "parentUnlock"
  | "confirmSnapshot"
  | "setLocked"
  | "clearAdminLock";

async function callAgentProcedure(
  procedure: AgentProcedure,
  input: unknown,
  deviceToken?: string | null
) {
  const ctx = await createContext({ deviceToken });
  const caller = appRouter.createCaller(ctx);

  switch (procedure) {
    case "pair":
      return caller.agent.pair(input as Parameters<typeof caller.agent.pair>[0]);
    case "heartbeat":
      return caller.agent.heartbeat(input as Parameters<typeof caller.agent.heartbeat>[0]);
    case "getPolicy":
      return caller.agent.getPolicy();
    case "requestExtension":
      return caller.agent.requestExtension(
        input as Parameters<typeof caller.agent.requestExtension>[0]
      );
    case "parentUnlock":
      return caller.agent.parentUnlock(
        input as Parameters<typeof caller.agent.parentUnlock>[0]
      );
    case "confirmSnapshot":
      return caller.agent.confirmSnapshot(
        input as Parameters<typeof caller.agent.confirmSnapshot>[0]
      );
    case "setLocked":
      return caller.agent.setLocked(
        input as Parameters<typeof caller.agent.setLocked>[0]
      );
    case "clearAdminLock":
      return caller.agent.clearAdminLock();
  }
}

export async function POST(request: NextRequest) {
  try {
    const deviceToken = request.headers.get("x-device-token");
    const body = await request.json();
    const { action, ...input } = body;

    switch (action) {
      case "pair": {
        const result = await callAgentProcedure("pair", input);
        return NextResponse.json(result);
      }
      case "heartbeat": {
        const result = await callAgentProcedure("heartbeat", input, deviceToken);
        return NextResponse.json(result);
      }
      case "requestExtension": {
        const result = await callAgentProcedure(
          "requestExtension",
          input,
          deviceToken
        );
        return NextResponse.json(result);
      }
      case "parentUnlock": {
        const result = await callAgentProcedure(
          "parentUnlock",
          input,
          deviceToken
        );
        return NextResponse.json(result);
      }
      case "confirmSnapshot": {
        const result = await callAgentProcedure(
          "confirmSnapshot",
          input,
          deviceToken
        );
        return NextResponse.json(result);
      }
      case "setLocked": {
        const result = await callAgentProcedure("setLocked", input, deviceToken);
        return NextResponse.json(result);
      }
      case "clearAdminLock": {
        const result = await callAgentProcedure(
          "clearAdminLock",
          {},
          deviceToken
        );
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const deviceToken = request.headers.get("x-device-token");
    if (!deviceToken) {
      return NextResponse.json({ error: "Missing device token" }, { status: 401 });
    }

    const action = request.nextUrl.searchParams.get("action");
    if (action === "policy") {
      const result = await callAgentProcedure("getPolicy", {}, deviceToken);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
