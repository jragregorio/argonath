/**
 * Publish a Warden agent MSI to Supabase Storage + AgentRelease row.
 *
 * Usage:
 *   node scripts/publish-agent-release.mjs --msi apps/agent/artifacts/Warden-0.5.11-x64.msi --channel stable
 *   node scripts/publish-agent-release.mjs --msi path/to/file.msi --channel test --mandatory --version 0.5.12
 *
 * Loads env from apps/web/.env.local and packages/db/.env (without printing values).
 * Requires: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL, DATABASE_URL
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BUCKET = "agent-releases";

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
  node scripts/publish-agent-release.mjs --msi <path> [--channel stable|test] [--version X.Y.Z] [--mandatory]`);
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

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)"
    );
  }
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL");
  }

  const sizeBytes = statSync(msiPath).size;
  const sha256 = await sha256File(msiPath);
  const storageKey = `releases/${args.channel}/Warden-${version}-x64.msi`;

  console.log("Publishing agent release…");
  console.log(`  version:    ${version}`);
  console.log(`  channel:    ${args.channel}`);
  console.log(`  mandatory:  ${args.mandatory}`);
  console.log(`  size:       ${sizeBytes} (${formatBytes(sizeBytes)})`);
  console.log(`  sha256:     ${sha256}`);
  console.log(`  storageKey: ${storageKey}`);
  console.log(`  msi:        ${msiPath}`);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const fileBuffer = readFileSync(msiPath);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storageKey, fileBuffer, {
      contentType: "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const prisma = new PrismaClient();
  try {
    const row = await prisma.agentRelease.upsert({
      where: {
        channel_version: {
          channel: args.channel,
          version,
        },
      },
      create: {
        version,
        channel: args.channel,
        storageKey,
        sha256,
        sizeBytes,
        mandatory: args.mandatory,
        publishedAt: new Date(),
      },
      update: {
        storageKey,
        sha256,
        sizeBytes,
        mandatory: args.mandatory,
        publishedAt: new Date(),
      },
    });

    console.log("\nPublished OK");
    console.log(`  id:         ${row.id}`);
    console.log(`  version:    ${row.version}`);
    console.log(`  channel:    ${row.channel}`);
    console.log(`  sizeBytes:  ${row.sizeBytes}`);
    console.log(`  sha256:     ${row.sha256}`);
    console.log(`  storageKey: ${row.storageKey}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
