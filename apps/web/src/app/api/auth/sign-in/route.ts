import { signIn } from "@warden/api";
import { z } from "zod";
import {
  jsonError,
  sessionMetaFromRequest,
  setSessionCookies,
} from "@/lib/auth-cookies";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonError("Invalid sign-in payload", 400);
    }

    const tokens = await signIn({
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
    const message = err instanceof Error ? err.message : "Sign-in failed";
    const code =
      typeof err === "object" &&
      err &&
      "code" in err &&
      typeof (err as { code: unknown }).code === "string"
        ? (err as { code: string }).code
        : null;

    if (code === "UNAUTHORIZED") return jsonError(message, 401);
    if (code === "FORBIDDEN") return jsonError(message, 403);
    return jsonError(message, 500);
  }
}
