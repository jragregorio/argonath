import type { RunningApp } from "./types";

const MAX_RUNNING_APPS = 40;
const MAX_PROCESS_NAME_LEN = 128;
const MAX_TITLE_LEN = 256;

/** Trim, cap, drop invalid rows; at most one foreground app. */
export function sanitizeRunningApps(input: unknown): RunningApp[] {
  if (!Array.isArray(input)) return [];

  const result: RunningApp[] = [];
  let hasForeground = false;

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;

    const processName =
      typeof raw.processName === "string"
        ? raw.processName.trim().slice(0, MAX_PROCESS_NAME_LEN)
        : "";
    const title =
      typeof raw.title === "string"
        ? raw.title.trim().slice(0, MAX_TITLE_LEN)
        : "";

    if (!processName) continue;

    let isForeground = raw.isForeground === true;
    if (isForeground && hasForeground) isForeground = false;
    if (isForeground) hasForeground = true;

    result.push({ processName, title, isForeground });
    if (result.length >= MAX_RUNNING_APPS) break;
  }

  return result;
}
