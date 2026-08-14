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
    createdAt: o.createdAt,
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
      createdAt: o.createdAt,
      outsideGrantBaselineUsedMinutes: effective,
    };
  });
}

/**
 * Baseline for a newly approved override.
 * - In-window: null (set on first outside observe — in-window usage must not
 *   pre-consume the after-hours pool).
 * - Outside: reuse lowest active baseline when stacking a live pool; pierce at
 *   current used when the previous pool is spent or none exists.
 */
export async function resolveBaselineForNewOverride(args: {
  childId: string;
  timeZone: string;
  now: Date;
}): Promise<number | null> {
  const { childId, timeZone, now } = args;
  const today = getCalendarDateInTimeZone(now, timeZone);

  const [usageLogs, activeOverrides, policyRow] = await Promise.all([
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
    prisma.screenTimePolicy.findFirst({
      where: { childId, isActive: true },
      select: {
        dailyLimitMinutes: true,
        allowedWindows: true,
        isActive: true,
      },
    }),
  ]);

  const usedMinutes = usageLogs.reduce(
    (sum: number, log: { activeMinutes: number }) => sum + log.activeMinutes,
    0
  );

  if (policyRow) {
    const windows = Array.isArray(policyRow.allowedWindows)
      ? (policyRow.allowedWindows as ScreenTimePolicyInput["allowedWindows"])
      : [];
    const probe = evaluatePolicy(
      {
        dailyLimitMinutes: policyRow.dailyLimitMinutes,
        allowedWindows: windows,
        isActive: policyRow.isActive,
      },
      usedMinutes,
      [],
      now,
      timeZone
    );
    if (probe.inWindow) {
      return null;
    }
  }

  const activeBaselines = activeOverrides
    .map(
      (row: {
        extraMinutes: number;
        outsideGrantBaselineUsedMinutes: number | null;
      }) => row.outsideGrantBaselineUsedMinutes
    )
    .filter(
      (value: number | null): value is number =>
        value != null && Number.isFinite(value)
    );

  if (activeBaselines.length > 0) {
    const minBaseline = Math.min(...activeBaselines);
    const activeBonusMinutes = activeOverrides.reduce(
      (
        sum: number,
        row: {
          extraMinutes: number;
          outsideGrantBaselineUsedMinutes: number | null;
        }
      ) => sum + row.extraMinutes,
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

/** Create an override; set after-hours baseline only when currently outside. */
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

  if (baseline != null) {
    await prisma.$executeRaw`
      UPDATE "ExtensionOverride"
      SET "outsideGrantBaselineUsedMinutes" = ${baseline}
      WHERE id = ${created.id}
    `;
  }

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
