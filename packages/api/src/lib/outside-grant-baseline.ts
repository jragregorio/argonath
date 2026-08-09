import { Prisma, prisma } from "@warden/db";
import {
  evaluatePolicy,
  getCalendarDateInTimeZone,
  getMinutesSinceTodayWindowEnded,
  getOutsideGrantBaselineUsedMinutes,
  isGrantCreatedAfterTodayWindowEnd,
  resolveOutsideGrantBaselineToPersist,
  type ExtensionOverrideInput,
  type ScreenTimePolicyInput,
} from "@warden/shared";

type OverrideRow = {
  id: string;
  extraMinutes: number;
  expiresAt: Date;
  createdAt: Date;
};

/**
 * When the child is outside allowed hours with an active bonus, persist a usage
 * baseline on overrides (server-authoritative after-hours countdown).
 *
 * Uses {@link resolveOutsideGrantBaselineToPersist}: pierce at first observe for
 * post-window approvals; ideal wall-clock backfill when late for pre-window
 * grants; downward repair when stored &gt; target. Post-window stored baselines
 * are immutable once set. Raw SQL keeps this working if the Prisma client is stale.
 */
export async function ensureOutsideGrantBaselines(args: {
  policy: ScreenTimePolicyInput;
  usedMinutes: number;
  overrides: OverrideRow[];
  now: Date;
  timeZone: string;
}): Promise<ExtensionOverrideInput[]> {
  const { policy, usedMinutes, overrides, now, timeZone } = args;

  if (overrides.length === 0) return [];

  const baselineById = await loadBaselines(overrides.map((o) => o.id));

  const mapped: ExtensionOverrideInput[] = overrides.map((o) => ({
    extraMinutes: o.extraMinutes,
    expiresAt: o.expiresAt,
    outsideGrantBaselineUsedMinutes: baselineById.get(o.id) ?? null,
  }));

  const probe = evaluatePolicy(policy, usedMinutes, mapped, now, timeZone);
  if (probe.inWindow !== false || probe.bonusMinutes <= 0) {
    return mapped;
  }

  const minutesSinceWindowEnded = getMinutesSinceTodayWindowEnded(
    policy.allowedWindows,
    now,
    timeZone
  );
  const existingMin = getOutsideGrantBaselineUsedMinutes(mapped, now);
  const activeOverrides = overrides.filter((o) => o.expiresAt > now);
  const newestCreatedAt =
    activeOverrides.length === 0
      ? now
      : activeOverrides.reduce(
          (max, o) => (o.createdAt > max ? o.createdAt : max),
          activeOverrides[0].createdAt
        );
  const grantCreatedAfterWindowEnd = isGrantCreatedAfterTodayWindowEnd(
    policy.allowedWindows,
    newestCreatedAt,
    now,
    timeZone
  );
  const targetBaseline = resolveOutsideGrantBaselineToPersist({
    usedMinutes,
    bonusMinutes: probe.bonusMinutes,
    dailyLimitMinutes: policy.dailyLimitMinutes,
    minutesSinceWindowEnded,
    storedBaseline: existingMin,
    grantCreatedAfterWindowEnd,
  });

  const updateIds = overrides
    .filter((o) => {
      const stored = baselineById.get(o.id);
      return stored == null || stored !== targetBaseline;
    })
    .map((o) => o.id);

  if (updateIds.length > 0) {
    await prisma.$executeRaw`
      UPDATE "ExtensionOverride"
      SET "outsideGrantBaselineUsedMinutes" = ${targetBaseline}
      WHERE id IN (${Prisma.join(updateIds)})
    `;
  }

  return overrides.map((o) => {
    const stored = baselineById.get(o.id);
    const effective = stored !== targetBaseline ? targetBaseline : stored;
    return {
      extraMinutes: o.extraMinutes,
      expiresAt: o.expiresAt,
      outsideGrantBaselineUsedMinutes: effective,
    };
  });
}

/**
 * Baseline for a newly approved override: reuse the lowest active baseline when
 * stacking after-hours bonus, else pierce at today's used minutes (family TZ).
 */
export async function resolveBaselineForNewOverride(args: {
  childId: string;
  timeZone: string;
  now: Date;
}): Promise<number> {
  const { childId, timeZone, now } = args;
  const today = getCalendarDateInTimeZone(now, timeZone);

  const [usageLogs, activeOverrides] = await Promise.all([
    prisma.usageLog.findMany({
      where: {
        device: { childId },
        date: today,
      },
      select: { activeMinutes: true },
    }),
    prisma.$queryRaw<
      { extraMinutes: number; outsideGrantBaselineUsedMinutes: number | null }[]
    >`
      SELECT "extraMinutes", "outsideGrantBaselineUsedMinutes"
      FROM "ExtensionOverride"
      WHERE "childId" = ${childId}
        AND "expiresAt" > ${now}
    `,
  ]);

  const usedMinutes = usageLogs.reduce(
    (sum, log) => sum + log.activeMinutes,
    0
  );

  const activeBaselines = activeOverrides
    .map((row) => row.outsideGrantBaselineUsedMinutes)
    .filter(
      (value): value is number => value != null && Number.isFinite(value)
    );

  if (activeBaselines.length > 0) {
    const minBaseline = Math.min(...activeBaselines);
    const activeBonusMinutes = activeOverrides.reduce(
      (sum, row) => sum + row.extraMinutes,
      0
    );
    // Previous after-hours pool already spent — pierce at current used so a new
    // parent grant unlocks again instead of stacking onto a dead baseline.
    if (usedMinutes - minBaseline >= activeBonusMinutes) {
      return usedMinutes;
    }
    return minBaseline;
  }

  return usedMinutes;
}

/** Create an override and set {@link outsideGrantBaselineUsedMinutes} via raw SQL. */
export async function createExtensionOverrideWithBaseline(args: {
  childId: string;
  extraMinutes: number;
  expiresAt: Date;
  sourceRequestId?: string;
  timeZone: string;
  now: Date;
}): Promise<{ id: string }> {
  const baseline = await resolveBaselineForNewOverride({
    childId: args.childId,
    timeZone: args.timeZone,
    now: args.now,
  });

  const created = await prisma.extensionOverride.create({
    data: {
      childId: args.childId,
      extraMinutes: args.extraMinutes,
      expiresAt: args.expiresAt,
      ...(args.sourceRequestId
        ? { sourceRequestId: args.sourceRequestId }
        : {}),
    },
    select: { id: true },
  });

  await prisma.$executeRaw`
    UPDATE "ExtensionOverride"
    SET "outsideGrantBaselineUsedMinutes" = ${baseline}
    WHERE id = ${created.id}
  `;

  return created;
}

async function loadBaselines(
  ids: string[]
): Promise<Map<string, number | null>> {
  const rows = await prisma.$queryRaw<
    { id: string; outsideGrantBaselineUsedMinutes: number | null }[]
  >`
    SELECT id, "outsideGrantBaselineUsedMinutes"
    FROM "ExtensionOverride"
    WHERE id IN (${Prisma.join(ids)})
  `;

  return new Map(
    rows.map((row) => [row.id, row.outsideGrantBaselineUsedMinutes])
  );
}
