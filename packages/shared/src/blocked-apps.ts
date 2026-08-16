const MAX_BLOCKED_PROCESS_NAMES = 40;
const MAX_PROCESS_NAME_LEN = 128;

/** Process names that must never be blocked or killed (case-insensitive). */
export const NEVER_BLOCK_PROCESS_NAMES = [
  "Warden.Tray",
  "Warden.LockUI",
  "dwm",
  "csrss",
  "winlogon",
  "SearchHost",
  "StartMenuExperienceHost",
  "ShellExperienceHost",
  "RuntimeBroker",
  "TextInputHost",
  "LockApp",
  "explorer",
  "ApplicationFrameHost",
] as const;

const neverBlockLower = new Set(
  NEVER_BLOCK_PROCESS_NAMES.map((name) => name.toLowerCase())
);

export function isNeverBlockProcessName(processName: string): boolean {
  return neverBlockLower.has(processName.trim().toLowerCase());
}

/** Trim, drop empty, cap length/count, case-insensitive dedupe (keep first casing). */
export function sanitizeBlockedProcessNames(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (typeof item !== "string") continue;
    const name = item.trim().slice(0, MAX_PROCESS_NAME_LEN);
    if (!name) continue;
    const lower = name.toLowerCase();
    if (neverBlockLower.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(name);
    if (result.length >= MAX_BLOCKED_PROCESS_NAMES) break;
  }

  return result;
}
