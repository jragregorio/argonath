/**
 * Verifies core mechanics API flow (pairing, usage, extension approval).
 * Requires: Postgres running, schema pushed, web app at BASE_URL (optional for agent endpoints only).
 *
 * Usage: node scripts/verify-core-flow.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DEV_FAMILY_ID = process.env.DEV_BYPASS_FAMILY_ID ?? "dev-family";

async function agentPost(body, deviceToken) {
  const headers = { "Content-Type": "application/json" };
  if (deviceToken) headers["x-device-token"] = deviceToken;

  const res = await fetch(`${BASE_URL}/api/agent`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

async function agentGetPolicy(deviceToken) {
  const res = await fetch(`${BASE_URL}/api/agent?action=policy`, {
    headers: { "x-device-token": deviceToken },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

async function main() {
  console.log("Warden core flow verification\n");

  let family = await prisma.family.findUnique({
    where: { id: DEV_FAMILY_ID },
  });
  if (!family) {
    family = await prisma.family.create({
      data: { id: DEV_FAMILY_ID, name: "Dev Family" },
    });
    console.log("Created dev family");
  }

  const child = await prisma.child.create({
    data: {
      familyId: family.id,
      displayName: `TestChild-${Date.now()}`,
      policies: {
        create: {
          dailyLimitMinutes: 2,
          allowedWindows: [],
          isActive: true,
        },
      },
    },
    include: { policies: true },
  });
  console.log(`Created child: ${child.displayName} (2 min limit)`);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const device = await prisma.device.create({
    data: {
      childId: child.id,
      pairingCode: code,
      pairingExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      platform: "windows",
    },
  });
  console.log(`Pairing code: ${code}`);

  const paired = await agentPost({
    action: "pair",
    code,
    machineName: "VERIFY-PC",
    agentVersion: "1.0.0",
  });
  console.log(`Paired device: ${paired.deviceId}`);

  await agentPost(
    {
      action: "heartbeat",
      activeMinutesToday: 3,
      idleMinutesToday: 0,
      isLocked: true,
      agentVersion: "1.0.0",
      machineName: "VERIFY-PC",
    },
    paired.deviceToken
  );
  console.log("Sent heartbeat: 3 active minutes (over 2 min limit)");

  const policyBefore = await agentGetPolicy(paired.deviceToken);
  const effectiveLimit =
    policyBefore.policy.dailyLimitMinutes + policyBefore.bonusMinutes;
  const shouldBeBlocked = policyBefore.usedMinutesToday >= effectiveLimit;
  console.log(
    `Policy check: used=${policyBefore.usedMinutesToday}, limit=${effectiveLimit}, blocked=${shouldBeBlocked}`
  );
  if (!shouldBeBlocked) {
    throw new Error("Expected device to be over daily limit");
  }

  const ext = await agentPost(
    { action: "requestExtension", requestedMinutes: 15 },
    paired.deviceToken
  );
  console.log(`Extension request created: ${ext.id}`);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  await prisma.extensionRequest.update({
    where: { id: ext.id },
    data: {
      status: "approved",
      resolvedAt: new Date(),
      resolvedBy: "dev-parent",
    },
  });
  await prisma.extensionOverride.create({
    data: {
      childId: child.id,
      extraMinutes: 15,
      expiresAt: endOfDay,
      sourceRequestId: ext.id,
    },
  });
  await prisma.device.update({
    where: { id: paired.deviceId },
    data: { isLocked: false },
  });
  console.log("Approved extension (+15 min)");

  const policyAfter = await agentGetPolicy(paired.deviceToken);
  if (policyAfter.bonusMinutes < 15) {
    throw new Error(`Expected bonusMinutes >= 15, got ${policyAfter.bonusMinutes}`);
  }
  const newEffective =
    policyAfter.policy.dailyLimitMinutes + policyAfter.bonusMinutes;
  const shouldAllow =
    policyAfter.usedMinutesToday < newEffective;
  console.log(
    `After approval: bonus=${policyAfter.bonusMinutes}, effective limit=${newEffective}, allowed=${shouldAllow}`
  );
  if (!shouldAllow) {
    throw new Error("Expected child to be allowed after extension approval");
  }

  console.log("\nAll core flow checks passed.");
  console.log("Next: run Warden.Tray and verify full-screen lock UI manually.");
}

main()
  .catch((err) => {
    console.error("\nVerification failed:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
