import { signUp } from "@warden/api";
import { z } from "zod";
import {
  jsonError,
  sessionMetaFromRequest,
  setSessionCookies,
} from "@/lib/auth-cookies";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  familyName: z.string().min(1).max(100).optional(),
  timezone: z.string().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonError("Invalid sign-up payload", 400);
    }

    const tokens = await signUp({
      ...parsed.data,
      meta: sessionMetaFromRequest(req),
    });
    await setSessionCookies(tokens);

    return Response.json({
      userId: tokens.userId,
      familyId: tokens.familyId,
      role: tokens.role,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-up failed";
    const code =
      typeof err === "object" &&
      err &&
      "code" in err &&
      typeof (err as { code: unknown }).code === "string"
        ? (err as { code: string }).code
        : null;

    if (code === "CONFLICT") return jsonError(message, 409);
    if (code === "BAD_REQUEST") return jsonError(message, 400);
    return jsonError(message, 500);
  }
}
