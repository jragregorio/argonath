import type { trpc } from "@/lib/trpc";

type Utils = ReturnType<typeof trpc.useUtils>;

function patchDevice<T extends { id: string; adminLock: boolean; isLocked: boolean }>(
  device: T,
  deviceId: string,
  locked: boolean
): T {
  if (device.id !== deviceId) return device;
  return {
    ...device,
    adminLock: locked,
    isLocked: locked ? true : device.isLocked,
  };
}

export async function optimisticAdminLock(
  utils: Utils,
  deviceId: string,
  locked: boolean,
  childId?: string
) {
  await utils.device.list.cancel();
  await utils.children.list.cancel();
  await utils.dashboard.overview.cancel();
  if (childId) {
    await utils.children.get.cancel({ childId });
  }

  const prevDevices = utils.device.list.getData();
  const prevChildren = utils.children.list.getData();
  const prevOverview = utils.dashboard.overview.getData();
  const prevChild = childId
    ? utils.children.get.getData({ childId })
    : undefined;

  utils.device.list.setData(undefined, (old) =>
    old?.map((d) => patchDevice(d, deviceId, locked))
  );

  utils.children.list.setData(undefined, (old) =>
    old?.map((child) => ({
      ...child,
      devices: child.devices.map((d) => patchDevice(d, deviceId, locked)),
    }))
  );

  utils.dashboard.overview.setData(undefined, (old) =>
    old
      ? {
          ...old,
          children: old.children.map((child) => ({
            ...child,
            devices: child.devices.map((d) => patchDevice(d, deviceId, locked)),
          })),
        }
      : old
  );

  if (childId) {
    utils.children.get.setData({ childId }, (old) =>
      old
        ? {
            ...old,
            devices: old.devices.map((d) => patchDevice(d, deviceId, locked)),
          }
        : old
    );
  }

  return { prevDevices, prevChildren, prevOverview, prevChild, childId };
}

export function rollbackAdminLock(
  utils: Utils,
  context?: {
    prevDevices: ReturnType<Utils["device"]["list"]["getData"]>;
    prevChildren: ReturnType<Utils["children"]["list"]["getData"]>;
    prevOverview?: ReturnType<Utils["dashboard"]["overview"]["getData"]>;
    prevChild?: ReturnType<Utils["children"]["get"]["getData"]>;
    childId?: string;
  }
) {
  if (!context) return;
  utils.device.list.setData(undefined, context.prevDevices);
  utils.children.list.setData(undefined, context.prevChildren);
  if (context.prevOverview !== undefined) {
    utils.dashboard.overview.setData(undefined, context.prevOverview);
  }
  if (context.childId) {
    utils.children.get.setData({ childId: context.childId }, context.prevChild);
  }
}
