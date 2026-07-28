import { logoutSession } from "@warden/api";
import {
  clearSessionCookies,
  readSessionCookies,
} from "@/lib/auth-cookies";

export async function POST() {
  const { refreshToken } = await readSessionCookies();
  await logoutSession(refreshToken);
  await clearSessionCookies();
  return Response.json({ ok: true });
}
