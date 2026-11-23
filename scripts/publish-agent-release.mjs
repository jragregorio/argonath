/**
 * Publish a Warden agent MSI to GitHub Releases (jragregorio/warden-releases) + AgentRelease row.
 *
 * Usage:
 *   node scripts/publish-agent-release.mjs --msi apps/agent/artifacts/Warden-0.5.11-x64.msi --channel stable
 *   node scripts/publish-agent-release.mjs --msi path/to/file.msi --channel test --mandatory --version 0.5.12
 *
 *   node scripts/publish-agent-release.mjs --msi apps/agent/artifacts/Warden-0.6.29-x64.msi --dry-run
 *
 * Loads env from apps/web/.env.local and packages/db/.env (without printing values).
 * Requires: DATABASE_URL, and the GitHub CLI (`gh auth login`) with push access to the repo.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
// Keep in sync with packages/shared/src/agent-version.ts (AGENT_RELEASE_REPO and helpers).
const RELEASE_REPO = "jragregorio/warden-releases";
const STRICT_VERSION = /^\d+\.\d+\.\d+$/;
const releaseTag = (version) => `agent-v${version}`;
const assetName = (version) => `Warden-${version}-x64.msi`;
const downloadUrlFor = (version) =>
  `https://github.com/${RELEASE_REPO}/releases/download/${releaseTag(version)}/${assetName(version)}`;

function gh(args, { allowFail = false } = {}) {
  const result = spawnSync("gh", args, { encoding: "utf8", shell: false });
  if (result.error) {
    throw new Error(`Could not run gh (GitHub CLI): ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFail) {
    throw new Error(`gh ${args[0]} ${args[1] ?? ""} failed: ${(result.stderr || "").trim()}`);
  }
  return result;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const out = {
    msi: null,
    channel: "stable",
    mandatory: false,
    version: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--msi") {
      out.msi = argv[++i];
    } else if (arg.startsWith("--msi=")) {
      out.msi = arg.slice("--msi=".length);
    } else if (arg === "--channel") {
      out.channel = argv[++i];
    } else if (arg.startsWith("--channel=")) {
      out.channel = arg.slice("--channel=".length);
    } else if (arg === "--version") {
      out.version = argv[++i];
    } else if (arg.startsWith("--version=")) {
      out.version = arg.slice("--version=".length);
    } else if (arg === "--mandatory") {
      out.mandatory = true;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function readVersionFromDirectoryBuildProps() {
  const propsPath = join(ROOT, "apps/agent/Directory.Build.props");
  if (!existsSync(propsPath)) return null;
  const text = readFileSync(propsPath, "utf8");
  const match = /<Version>\s*([^<]+?)\s*<\/Version>/i.exec(text);
  return match?.[1]?.trim() || null;
}

function parseVersionFromFilename(fileName) {
  const match = /^Warden-(.+)-x64\.msi$/i.exec(fileName);
  return match?.[1] || null;
}

function sha256File(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  loadEnvFile(join(ROOT, "apps/web/.env.local"));
  loadEnvFile(join(ROOT, "packages/db/.env"));

  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node scripts/publish-agent-release.mjs --msi <path> [--channel stable|test] [--version X.Y.Z] [--mandatory] [--dry-run]

Uploads the MSI to GitHub release ${releaseTag("<version>")} on ${RELEASE_REPO}
as ${assetName("<version>")}, then records the AgentRelease row.`);
    process.exit(0);
  }

  if (!args.msi) {
    throw new Error("--msi <path> is required");
  }

  if (args.channel !== "stable" && args.channel !== "test") {
    throw new Error('--channel must be "stable" or "test"');
  }

  const msiPath = resolve(ROOT, args.msi);
  if (!existsSync(msiPath)) {
    throw new Error(`MSI not found: ${msiPath}`);
  }

  const fileName = basename(msiPath);
  const version =
    args.version ||
    parseVersionFromFilename(fileName) ||
    readVersionFromDirectoryBuildProps();

  if (!version) {
    throw new Error(
      "Could not determine version. Pass --version or name file Warden-<version>-x64.msi"
    );
  }

  if (!STRICT_VERSION.test(version)) {
    throw new Error(`Version must be X.Y.Z, got: ${version}`);
  }

  const sizeBytes = statSync(msiPath).size;
  const sha256 = await sha256File(msiPath);
  const tag = releaseTag(version);
  const asset = assetName(version);
  const downloadUrl = downloadUrlFor(version);

  console.log(args.dryRun ? "Dry run — nothing will be published." : "Publishing agent release…");
  console.log(`  version:     ${version}`);
  console.log(`  channel:     ${args.channel}`);
  console.log(`  mandatory:   ${args.mandatory}`);
  console.log(`  size:        ${sizeBytes} (${formatBytes(sizeBytes)})`);
  console.log(`  sha256:      ${sha256}`);
  console.log(`  repo/tag:    ${RELEASE_REPO} ${tag}`);
  console.log(`  asset:       ${asset}`);
  console.log(`  downloadUrl: ${downloadUrl}`);
  console.log(`  msi:         ${msiPath}`);

  if (args.dryRun) {
    return;
  }

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("Missing DATABASE_URL");
  }

  // The asset name must be exactly Warden-<version>-x64.msi.
  let uploadPath = msiPath;
  let tempDir = null;
  if (basename(msiPath) !== asset) {
    tempDir = mkdtempSync(join(tmpdir(), "warden-release-"));
    uploadPath = join(tempDir, asset);
    copyFileSync(msiPath, uploadPath);
  }

  try {
    const existing = gh(["release", "view", tag, "--repo", RELEASE_REPO], {
      allowFail: true,
    });
    if (existing.status === 0) {
      gh(["release", "upload", tag, uploadPath, "--repo", RELEASE_REPO, "--clobber"]);
    } else {
      gh([
        "release",
        "create",
        tag,
        uploadPath,
        "--repo",
        RELEASE_REPO,
        "--title",
        `Warden agent ${version}`,
        "--notes",
        `Windows agent MSI.\n\nSHA-256: ${sha256}\nSize: ${sizeBytes} bytes`,
      ]);
    }
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }

  const prisma = new PrismaClient();
  try {
    const fields = {
      storageKey: null,
      downloadUrl,
      sha256,
      sizeBytes,
      mandatory: args.mandatory,
      publishedAt: new Date(),
    };
    const row = await prisma.agentRelease.upsert({
      where: { channel_version: { channel: args.channel, version } },
      create: { version, channel: args.channel, ...fields },
      update: fields,
    });

    console.log("\nPublished OK");
    console.log(`  id:          ${row.id}`);
    console.log(`  version:     ${row.version}`);
    console.log(`  channel:     ${row.channel}`);
    console.log(`  downloadUrl: ${row.downloadUrl}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
