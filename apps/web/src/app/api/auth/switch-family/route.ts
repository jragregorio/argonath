import { switchFamilySession, verifyAccessToken } from "@warden/api";
import { z } from "zod";
import {
  jsonError,
  readSessionCookies,
  sessionMetaFromRequest,
  setSessionCookies,
} from "@/lib/auth-cookies";

const bodySchema = z.object({
  familyId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const { accessToken, refreshToken } = await readSessionCookies();
    if (!accessToken || !refreshToken) {
      return jsonError("Unauthorized", 401);
    }

    const claims = await verifyAccessToken(accessToken);
    if (!claims) {
      return jsonError("Unauthorized", 401);
    }

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonError("Invalid payload", 400);
    }

    const tokens = await switchFamilySession({
      userId: claims.sub,
      familyId: parsed.data.familyId,
      rawRefresh: refreshToken,
      meta: sessionMetaFromRequest(req),
    });
    await setSessionCookies(tokens);

    return Response.json({
      userId: tokens.userId,
      familyId: tokens.familyId,
      role: tokens.role,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Switch failed";
    const code =
      typeof err === "object" &&
      err &&
      "code" in err &&
      typeof (err as { code: unknown }).code === "string"
        ? (err as { code: string }).code
        : null;

    if (code === "NOT_FOUND") return jsonError("Not found", 404);
    if (code === "UNAUTHORIZED") return jsonError(message, 401);
    return jsonError(message, 500);
  }
}
