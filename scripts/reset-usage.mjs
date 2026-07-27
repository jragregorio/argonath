/**
 * Reset today's usage + pending/approved bonuses for a clean lockout test.
 *
 * Usage:
 *   node scripts/reset-usage.mjs
 *   node scripts/reset-usage.mjs --child "Alex"
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const childNameArg = process.argv.find((a) => a.startsWith("--child="))?.slice(8)
  ?? (process.argv.includes("--child")
    ? process.argv[process.argv.indexOf("--child") + 1]
    : null);

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const children = await prisma.child.findMany({
    where: childNameArg
      ? { displayName: { contains: childNameArg, mode: "insensitive" } }
      : undefined,
    include: { devices: true },
  });

  if (children.length === 0) {
    console.log("No children found.");
    return;
  }

  for (const child of children) {
    const deviceIds = child.devices.map((d) => d.id);

    const usage = await prisma.usageLog.deleteMany({
      where: { deviceId: { in: deviceIds }, date: today },
    });

    const overrides = await prisma.extensionOverride.deleteMany({
      where: { childId: child.id },
    });

    const pending = await prisma.extensionRequest.deleteMany({
      where: { childId: child.id, status: "pending" },
    });

    await prisma.device.updateMany({
      where: { childId: child.id },
      data: { isLocked: false },
    });

    console.log(
      `Reset ${child.displayName}: usage=${usage.count}, bonuses=${overrides.count}, pendingRequests=${pending.count}`
    );
  }

  console.log("\nDone. Restart Argonath.Tray, set a 1–2 min limit, and retest.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
