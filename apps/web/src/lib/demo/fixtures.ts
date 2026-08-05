import type { PolicyEvaluation } from "@warden/shared";
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

const now = new Date();
const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 60 * 60 * 1000);

function alexEvaluation(): PolicyEvaluation {
  return {
    status: "allowed",
    remainingMinutes: 42,
    dailyRemainingMinutes: 42,
    windowRemainingMinutes: 180,
    limitingFactor: "daily_limit",
    reachableMinutesToday: 120,
    usedMinutes: 78,
    dailyLimitMinutes: 120,
    bonusMinutes: 0,
  };
}

function samEvaluation(): PolicyEvaluation {
  return {
    status: "allowed",
    remainingMinutes: 70,
    dailyRemainingMinutes: 70,
    windowRemainingMinutes: 240,
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

export const demoPendingExtensions: DemoExtensionRequest[] = [
  {
    id: DEMO_IDS.extensionRequest,
    requestedMinutes: 15,
    createdAt: hoursAgo(0.25),
    child: { id: DEMO_IDS.alex, displayName: "Alex" },
    device: {
      id: DEMO_IDS.alexDevice,
      machineName: "ALEX-DESKTOP",
      displayName: "Alex's PC",
    },
  },
];

export const demoActivitySeed: RecentActivityItem[] = [
  {
    id: "demo-act-1",
    action: "extension_requested",
    createdAt: hoursAgo(0.25),
    childName: "Alex",
    deviceName: "Alex's PC",
    metadata: { minutes: 15 },
  },
  {
    id: "demo-act-2",
    action: "device_online",
    createdAt: hoursAgo(1.5),
    childName: "Alex",
    deviceName: "Alex's PC",
  },
  {
    id: "demo-act-3",
    action: "nudge_sent",
    createdAt: hoursAgo(3),
    childName: "Sam",
    deviceName: "SAM-LAPTOP",
    metadata: { message: "Dinner time" },
  },
  {
    id: "demo-act-4",
    action: "policy_updated",
    createdAt: hoursAgo(26),
    childName: "Sam",
    metadata: { dailyLimitMinutes: 90 },
  },
  {
    id: "demo-act-5",
    action: "child_created",
    createdAt: hoursAgo(72),
    childName: "Alex",
  },
  {
    id: "demo-act-6",
    action: "device_online",
    createdAt: hoursAgo(0.5),
    childName: "Sam",
    deviceName: "SAM-LAPTOP",
  },
];

function buildOverview(children: DemoChild[], pendingCount: number): DemoOverview {
  return {
    pendingRequests: pendingCount,
    children,
  };
}

export function createInitialDemoState(): DemoState {
  const pendingCount = demoPendingExtensions.length;
  return {
    overview: buildOverview(structuredClone(demoChildren), pendingCount),
    pendingExtensions: structuredClone(demoPendingExtensions),
    activity: structuredClone(demoActivitySeed),
    nudgeByDevice: {},
    pendingLocks: {},
    signupPromptOpen: false,
    feedback: null,
  };
}

export const SIGNUP_PROMPT_DISMISSED_KEY = "warden-demo-signup-dismissed";
