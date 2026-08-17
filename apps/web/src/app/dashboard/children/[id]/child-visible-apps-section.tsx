"use client";

import { trpc } from "@/lib/trpc";
import {
  VisibleAppsCard,
  type VisibleAppsDevice,
} from "@/components/visible-apps-card";

type ChildVisibleAppsSectionProps = {
  childId: string;
  blockedProcessNames: string[];
  devices: VisibleAppsDevice[];
};

export function ChildVisibleAppsSection({
  childId,
  blockedProcessNames,
  devices,
}: ChildVisibleAppsSectionProps) {
  const utils = trpc.useUtils();

  const invalidate = () => {
    void utils.children.get.invalidate({ childId });
    void utils.dashboard.activity.invalidate();
  };

  const blockApp = trpc.policy.blockApp.useMutation({
    onSuccess: invalidate,
  });

  const unblockApp = trpc.policy.unblockApp.useMutation({
    onSuccess: invalidate,
  });

  return (
    <VisibleAppsCard
      devices={devices}
      blockedProcessNames={blockedProcessNames}
      onBlock={(processName) => blockApp.mutate({ childId, processName })}
      onUnblock={(processName) => unblockApp.mutate({ childId, processName })}
      blockBusy={blockApp.isPending}
      unblockBusy={unblockApp.isPending}
    />
  );
}
