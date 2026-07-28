import { prisma } from "@warden/db";
import type { Device, FamilyRole } from "@warden/db";
import { verifyAccessToken } from "./auth/tokens";
import { ensureDevBypassIdentity } from "./auth/session";

export type Context = {
  userId: string | null;
  familyId: string | null;
  role: FamilyRole | null;
  device: (Device & { child: { familyId: string } }) | null;
};

export async function createContext(opts: {
  userId?: string | null;
  familyId?: string | null;
  role?: FamilyRole | null;
  deviceToken?: string | null;
  accessToken?: string | null;
  devBypass?: boolean;
}): Promise<Context> {
  let device: Context["device"] = null;

  if (opts.deviceToken) {
    device = await prisma.device.findUnique({
      where: { deviceToken: opts.deviceToken },
      include: { child: { select: { familyId: true } } },
    });
  }

  if (opts.devBypass) {
    const identity = await ensureDevBypassIdentity({
      userId: opts.userId ?? undefined,
      familyId: opts.familyId ?? undefined,
    });
    return {
      userId: identity.userId,
      familyId: identity.familyId,
      role: identity.role,
      device,
    };
  }

  if (opts.accessToken) {
    const claims = await verifyAccessToken(opts.accessToken);
    if (claims) {
      return {
        userId: claims.sub,
        familyId: claims.fid,
        role: claims.role,
        device,
      };
    }
  }

  return {
    userId: opts.userId ?? null,
    familyId: opts.familyId ?? null,
    role: opts.role ?? null,
    device,
  };
}
