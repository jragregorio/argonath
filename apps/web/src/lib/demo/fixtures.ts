import type { AllowedWindow, PolicyEvaluation } from "@warden/shared";
import type { RecentActivityItem } from "@/components/recent-activity-card";
import type {
  DemoChild,
  DemoExtensionRequest,
  DemoOverview,
  DemoState,
} from "./types";

export const DEMO_IDS = {
  alex: "demo-child-alex",
  sam: "demo-child-sam",
  alexDevice: "demo-device-alex-pc",
  samDevice: "demo-device-sam-pc",
  extensionRequest: "demo-ext-req-1",
} as const;

/**
 * Stable default "now" so SSR and the client's first paint share identical
 * fixture timestamps (avoids hydration mismatches on `<time dateTime>`).
 * DemoProvider refreshes from `Date.now()` after mount for fresh relative labels.
 */
export const DEMO_FIXTURE_ANCHOR_MS = Date.parse("2026-08-06T16:00:00.000Z");

function hoursAgo(nowMs: number, hours: number) {
  return new Date(nowMs - hours * 60 * 60 * 1000);
}

function alexEvaluation(): PolicyEvaluation {
  return {
    status: "allowed",
    remainingMinutes: 42,
    dailyRemainingMinutes: 42,
    windowRemainingMinutes: 180,
    windowCapacityMinutes: 300,
    inWindow: true,
    limitingFactor: "daily_limit",
    reachableMinutesToday: 120,
    usedMinutes: 78,
    dailyLimitMinutes: 120,
    bonusMinutes: 0,
  };
}

const alexAllowedWindows: AllowedWindow[] = [1, 2, 3, 4, 5].map((day) => ({
  day,
  start: "15:00",
  end: "20:00",
}));

function samEvaluation(): PolicyEvaluation {
  return {
    status: "allowed",
    remainingMinutes: 70,
    dailyRemainingMinutes: 70,
    windowRemainingMinutes: 240,
    windowCapacityMinutes: 300,
    inWindow: true,
    limitingFactor: "daily_limit",
    reachableMinutesToday: 90,
    usedMinutes: 20,
    dailyLimitMinutes: 90,
    bonusMinutes: 0,
  };
}

export const demoChildren: DemoChild[] = [
  {
    id: DEMO_IDS.alex,
    displayName: "Alex",
    dailyLimitMinutes: 120,
    allowedWindows: alexAllowedWindows,
    policyActive: true,
    evaluation: alexEvaluation(),
    devices: [
      {
        id: DEMO_IDS.alexDevice,
        displayName: "Alex's PC",
        machineName: "ALEX-DESKTOP",
        isOnline: true,
        isLocked: false,
        adminLock: false,
        isPaired: true,
        agentVersion: "0.6.8",
      },
    ],
  },
  {
    id: DEMO_IDS.sam,
    displayName: "Sam",
    dailyLimitMinutes: 90,
    allowedWindows: [],
    policyActive: true,
    evaluation: samEvaluation(),
    devices: [
      {
        id: DEMO_IDS.samDevice,
        displayName: null,
        machineName: "SAM-LAPTOP",
        isOnline: true,
        isLocked: false,
        adminLock: false,
        isPaired: true,
        agentVersion: "0.6.8",
      },
    ],
  },
];

function buildPendingExtensions(nowMs: number): DemoExtensionRequest[] {
  return [
    {
      id: DEMO_IDS.extensionRequest,
      requestedMinutes: 15,
      createdAt: hoursAgo(nowMs, 0.25),
      child: { id: DEMO_IDS.alex, displayName: "Alex" },
      device: {
        id: DEMO_IDS.alexDevice,
        machineName: "ALEX-DESKTOP",
        displayName: "Alex's PC",
      },
    },
  ];
}

function buildActivitySeed(nowMs: number): RecentActivityItem[] {
  return [
    {
      id: "demo-act-1",
      action: "extension_requested",
      createdAt: hoursAgo(nowMs, 0.25),
      childName: "Alex",
      deviceName: "Alex's PC",
      metadata: { minutes: 15 },
    },
    {
      id: "demo-act-2",
      action: "device_online",
      createdAt: hoursAgo(nowMs, 1.5),
      childName: "Alex",
      deviceName: "Alex's PC",
    },
    {
      id: "demo-act-3",
      action: "nudge_sent",
      createdAt: hoursAgo(nowMs, 3),
      childName: "Sam",
      deviceName: "SAM-LAPTOP",
      metadata: { message: "Dinner time" },
    },
    {
      id: "demo-act-4",
      action: "policy_updated",
      createdAt: hoursAgo(nowMs, 26),
      childName: "Sam",
      metadata: { dailyLimitMinutes: 90 },
    },
    {
      id: "demo-act-5",
      action: "child_created",
      createdAt: hoursAgo(nowMs, 72),
      childName: "Alex",
    },
    {
      id: "demo-act-6",
      action: "device_online",
      createdAt: hoursAgo(nowMs, 0.5),
      childName: "Sam",
      deviceName: "SAM-LAPTOP",
    },
  ];
}

function buildOverview(children: DemoChild[], pendingCount: number): DemoOverview {
  return {
    pendingRequests: pendingCount,
    children,
  };
}

export function createInitialDemoState(
  nowMs: number = DEMO_FIXTURE_ANCHOR_MS
): DemoState {
  const pendingExtensions = buildPendingExtensions(nowMs);
  return {
    overview: buildOverview(structuredClone(demoChildren), pendingExtensions.length),
    pendingExtensions,
    activity: buildActivitySeed(nowMs),
    nudgeByDevice: {},
    pendingLocks: {},
    signupPromptOpen: false,
    feedback: null,
  };
}

/** @deprecated Prefer dismiss-count keys; still honored as "done for session". */
export const SIGNUP_PROMPT_DISMISSED_KEY = "warden-demo-signup-dismissed";

export const SIGNUP_PROMPT_DISMISS_COUNT_KEY =
  "warden-demo-signup-dismiss-count";
export const SIGNUP_PROMPT_ACTION_COUNT_KEY =
  "warden-demo-signup-action-count";
export const SIGNUP_PROMPT_FIRST_DISMISS_AT_KEY =
  "warden-demo-signup-first-dismiss-at";

/** Second prompt: after this many interactive actions (whichever comes first with delay). */
export const SIGNUP_PROMPT_SECOND_MIN_ACTIONS = 5;
/** Second prompt: ms after first dismiss (2.5 min). */
export const SIGNUP_PROMPT_SECOND_DELAY_MS = 150_000;
