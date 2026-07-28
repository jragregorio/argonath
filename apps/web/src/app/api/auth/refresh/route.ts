import { refreshSession } from "@warden/api";
import {
  clearSessionCookies,
  jsonError,
  readSessionCookies,
  sessionMetaFromRequest,
  setSessionCookies,
} from "@/lib/auth-cookies";

export async function POST(req: Request) {
  try {
    const { refreshToken } = await readSessionCookies();
    if (!refreshToken) {
      return jsonError("No refresh token", 401);
    }

    const tokens = await refreshSession(
      refreshToken,
      sessionMetaFromRequest(req)
    );
    await setSessionCookies(tokens);

    return Response.json({
      userId: tokens.userId,
      familyId: tokens.familyId,
      role: tokens.role,
    });
  } catch (err) {
    await clearSessionCookies();
    const message = err instanceof Error ? err.message : "Refresh failed";
    return jsonError(message, 401);
  }
}
