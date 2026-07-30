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
