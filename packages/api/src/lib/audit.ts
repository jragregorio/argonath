import { prisma } from "@warden/db";
import type { Prisma } from "@warden/db";

export async function logAudit(
  familyId: string,
  userId: string,
  action: string,
  metadata?: Prisma.InputJsonValue
) {
  await prisma.auditLog.create({
    data: { familyId, userId, action, metadata: metadata ?? {} },
  });
}
