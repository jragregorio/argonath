import type { PolicyEvaluation } from "@warden/shared";
import type { RecentActivityItem } from "@/components/recent-activity-card";

export type DemoDevice = {
  id: string;
  displayName: string | null;
  machineName: string;
  isOnline: boolean;
  isLocked: boolean;
  adminLock: boolean;
  isPaired: boolean;
  agentVersion: string | null;
};

export type DemoChild = {
  id: string;
  displayName: string;
  evaluation: PolicyEvaluation;
  devices: DemoDevice[];
  dailyLimitMinutes: number;
};

export type DemoExtensionRequest = {
  id: string;
  requestedMinutes: number;
  createdAt: Date;
  child: { id: string; displayName: string };
  device: {
    id: string;
    machineName: string;
    displayName: string | null;
  };
};

export type DemoOverview = {
  pendingRequests: number;
  children: DemoChild[];
};

export type DemoNudgeState = {
  nudgeId: string;
  label: string;
};

export type DemoFeedback = {
  id: string;
  message: string;
  tone?: "success" | "default";
};

export type DemoState = {
  overview: DemoOverview;
  pendingExtensions: DemoExtensionRequest[];
  activity: RecentActivityItem[];
  nudgeByDevice: Record<string, DemoNudgeState>;
  pendingLocks: Record<string, boolean | undefined>;
  signupPromptOpen: boolean;
  feedback: DemoFeedback | null;
};
