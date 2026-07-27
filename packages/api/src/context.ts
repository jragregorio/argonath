import { prisma } from "@argonath/db";
import type { Device } from "@argonath/db";

export type Context = {
  userId: string | null;
  orgId: string | null;
  device: (Device & { child: { familyId: string } }) | null;
};

export async function createContext(opts: {
  userId?: string | null;
  orgId?: string | null;
  deviceToken?: string | null;
}): Promise<Context> {
  let device: Context["device"] = null;

  if (opts.deviceToken) {
    device = await prisma.device.findUnique({
      where: { deviceToken: opts.deviceToken },
      include: { child: { select: { familyId: true } } },
    });
  }

  return {
    userId: opts.userId ?? null,
    orgId: opts.orgId ?? null,
    device,
  };
}
