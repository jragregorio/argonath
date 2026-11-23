import { describe, it, expect } from "vitest";
import {
  agentReleaseAssetName,
  agentReleaseTag,
  buildAgentReleaseDownloadUrl,
  compareAgentVersions,
} from "./agent-version";

describe("compareAgentVersions", () => {
  it("compares Major.Minor.Build numerically", () => {
    expect(compareAgentVersions("0.5.11", "0.5.10")).toBeGreaterThan(0);
    expect(compareAgentVersions("0.5.10", "0.5.11")).toBeLessThan(0);
    expect(compareAgentVersions("0.5.11", "0.5.11")).toBe(0);
  });

  it("tolerates leading v and optional 4th segment", () => {
    expect(compareAgentVersions("v0.5.11", "0.5.11")).toBe(0);
    expect(compareAgentVersions("0.5.11.0", "0.5.11")).toBe(0);
    expect(compareAgentVersions("0.5.11.1", "0.5.11")).toBeGreaterThan(0);
  });

  it("treats missing segments as zero", () => {
    expect(compareAgentVersions("1", "1.0.0")).toBe(0);
    expect(compareAgentVersions("1.2", "1.2.0")).toBe(0);
    expect(compareAgentVersions("1.2", "1.2.1")).toBeLessThan(0);
  });

  it("ignores non-numeric suffix noise per segment", () => {
    expect(compareAgentVersions("0.5.11-beta", "0.5.11")).toBe(0);
  });
});

describe("agent release urls", () => {
  it("builds tag and asset name", () => {
    expect(agentReleaseTag("0.6.29")).toBe("agent-v0.6.29");
    expect(agentReleaseAssetName("0.6.29")).toBe("Warden-0.6.29-x64.msi");
  });

  it("builds direct download url", () => {
    expect(buildAgentReleaseDownloadUrl("0.6.29")).toBe(
      "https://github.com/jragregorio/argonath/releases/download/agent-v0.6.29/Warden-0.6.29-x64.msi"
    );
  });

  it("rejects non-semver input", () => {
    expect(() => buildAgentReleaseDownloadUrl("0.6.29/../x")).toThrow();
  });
});
