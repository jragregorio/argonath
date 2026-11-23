/**
 * Compare agent version strings (Major.Minor.Build, optional 4th segment).
 * Tolerates a leading `v`/`V`. Missing segments are treated as 0.
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareAgentVersions(a: string, b: string): number {
  const left = parseAgentVersion(a);
  const right = parseAgentVersion(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function parseAgentVersion(raw: string): number[] {
  const trimmed = raw.trim().replace(/^[vV]/, "");
  if (!trimmed) return [0];
  return trimmed.split(".").map((part) => {
    const match = /^(\d+)/.exec(part);
    return match ? Number.parseInt(match[1], 10) : 0;
  });
}

/** Public GitHub repo whose Releases host the agent MSI. */
export const AGENT_RELEASE_REPO = "jragregorio/argonath";

const STRICT_AGENT_VERSION = /^\d+\.\d+\.\d+$/;

function assertStrictAgentVersion(version: string): string {
  if (!STRICT_AGENT_VERSION.test(version)) {
    throw new Error(`Invalid agent version: ${version}`);
  }
  return version;
}

export function agentReleaseTag(version: string): string {
  return `agent-v${assertStrictAgentVersion(version)}`;
}

export function agentReleaseAssetName(version: string): string {
  return `Warden-${assertStrictAgentVersion(version)}-x64.msi`;
}

/** Direct asset URL (GitHub answers with an attachment download). */
export function buildAgentReleaseDownloadUrl(version: string): string {
  return `https://github.com/${AGENT_RELEASE_REPO}/releases/download/${agentReleaseTag(
    version
  )}/${agentReleaseAssetName(version)}`;
}
