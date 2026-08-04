#!/usr/bin/env node
/**
 * Dependency-free repository boundary checks for the Warden monorepo.
 * Exit 0 on success; print violations and exit 1 on failure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const violations = [];

const SRC_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|cs|csproj)$/i;
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "bin",
  "obj",
  ".git",
  "coverage",
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SRC_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

function rel(p) {
  return path.relative(root, p).split(path.sep).join("/");
}

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function packageJsonDeps(pkgDir) {
  const pj = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pj)) return new Set();
  const json = JSON.parse(read(pj));
  return new Set([
    ...Object.keys(json.dependencies ?? {}),
    ...Object.keys(json.devDependencies ?? {}),
    ...Object.keys(json.peerDependencies ?? {}),
  ]);
}

function collectImports(filePath, text) {
  const specs = [];
  const re =
    /(?:import|export)\s+(?:type\s+)?(?:[^'"\n]+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    specs.push(m[1] || m[2] || m[3]);
  }
  return specs;
}

// --- Rule: packages must not import apps ---
for (const file of walk(path.join(root, "packages"))) {
  if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(file)) continue;
  const text = read(file);
  for (const spec of collectImports(file, text)) {
    if (
      spec.includes("/apps/") ||
      spec.startsWith("apps/") ||
      /(^|\/)\.\.\/(\.\.\/)*apps\//.test(spec) ||
      spec.includes("\\apps\\")
    ) {
      violations.push(`${rel(file)}: packages must not import apps (${spec})`);
    }
  }
  // Relative path that resolves into apps/
  for (const spec of collectImports(file, text)) {
    if (!spec.startsWith(".")) continue;
    const resolved = path.resolve(path.dirname(file), spec);
    const r = rel(resolved);
    if (r.startsWith("apps/")) {
      violations.push(`${rel(file)}: packages must not import apps (${spec} → ${r})`);
    }
  }
}

// --- Rule: no cross-application source imports ---
const webFiles = walk(path.join(root, "apps", "web")).filter((f) =>
  /\.(ts|tsx|js|jsx)$/i.test(f),
);
const agentFiles = walk(path.join(root, "apps", "agent")).filter((f) =>
  /\.(ts|tsx|js|jsx|cs)$/i.test(f),
);
const mobileFiles = walk(path.join(root, "apps", "mobile")).filter((f) =>
  /\.(ts|tsx|js|jsx)$/i.test(f),
);

for (const file of webFiles) {
  const text = read(file);
  for (const spec of collectImports(file, text)) {
    if (spec.includes("apps/agent") || spec.includes("Warden.")) {
      violations.push(`${rel(file)}: web must not import agent (${spec})`);
    }
    if (spec.includes("apps/mobile") || spec.includes("@warden/mobile")) {
      violations.push(`${rel(file)}: web must not import mobile (${spec})`);
    }
    if (spec.startsWith(".")) {
      const resolved = rel(path.resolve(path.dirname(file), spec));
      if (resolved.startsWith("apps/agent/")) {
        violations.push(`${rel(file)}: web must not import agent (${spec})`);
      }
      if (resolved.startsWith("apps/mobile/")) {
        violations.push(`${rel(file)}: web must not import mobile (${spec})`);
      }
    }
  }
}

for (const file of agentFiles) {
  const text = read(file);
  if (/apps[\\/]+web|@warden\/web/.test(text) && /import\s+|using\s+/.test(text)) {
    // Soft check: only flag explicit path imports to apps/web
    for (const spec of collectImports(file, text)) {
      if (spec.includes("apps/web") || spec.includes("@warden/web")) {
        violations.push(`${rel(file)}: agent must not import web sources (${spec})`);
      }
      if (spec.includes("apps/mobile") || spec.includes("@warden/mobile")) {
        violations.push(`${rel(file)}: agent must not import mobile sources (${spec})`);
      }
    }
  }
}

for (const file of mobileFiles) {
  const text = read(file);
  for (const spec of collectImports(file, text)) {
    if (
      spec.includes("apps/web") ||
      spec.includes("apps/agent") ||
      spec.startsWith("@warden/")
    ) {
      violations.push(`${rel(file)}: mobile must not import web/packages (${spec})`);
    }
    if (spec.startsWith(".")) {
      const resolved = rel(path.resolve(path.dirname(file), spec));
      if (
        resolved.startsWith("apps/web/") ||
        resolved.startsWith("apps/agent/") ||
        resolved.startsWith("packages/")
      ) {
        violations.push(`${rel(file)}: mobile must not import web/packages (${spec})`);
      }
    }
  }
}

const mobileDeps = packageJsonDeps(path.join(root, "apps", "mobile"));
for (const dep of mobileDeps) {
  if (dep.startsWith("@warden/")) {
    violations.push(
      `apps/mobile/package.json: mobile shell must not depend on ${dep}`,
    );
  }
}

// --- Rule: @warden graph acyclic + declared deps ---
const packages = {
  "@warden/web": path.join(root, "apps", "web"),
  "@warden/api": path.join(root, "packages", "api"),
  "@warden/db": path.join(root, "packages", "db"),
  "@warden/shared": path.join(root, "packages", "shared"),
  "@warden/ui": path.join(root, "packages", "ui"),
};

const allowed = {
  "@warden/web": new Set(["@warden/api", "@warden/shared", "@warden/ui", "@warden/db"]),
  "@warden/api": new Set(["@warden/db", "@warden/shared"]),
  "@warden/db": new Set(),
  "@warden/shared": new Set(),
  "@warden/ui": new Set(),
};

const graph = {};
for (const [name, dir] of Object.entries(packages)) {
  graph[name] = new Set();
  const deps = packageJsonDeps(dir);
  const files = walk(path.join(dir, "src")).filter((f) =>
    /\.(ts|tsx|js|jsx)$/i.test(f),
  );
  // also scan app router outside src for web? web uses src/
  for (const file of files) {
    const text = read(file);
    for (const spec of collectImports(file, text)) {
      if (!spec.startsWith("@warden/")) continue;
      const pkgName = spec.includes("/")
        ? spec.split("/").slice(0, 2).join("/")
        : spec;
      // @warden/api/router-type → @warden/api
      const top = pkgName.startsWith("@warden/")
        ? `@warden/${spec.split("/")[1]}`
        : spec;
      graph[name].add(top);
      if (!allowed[name]?.has(top) && name !== top) {
        // web may declare @warden/db but must not import it in source
        if (name === "@warden/web" && top === "@warden/db") {
          violations.push(
            `${rel(file)}: @warden/web must not import @warden/db in source (use @warden/api)`,
          );
        } else if (!allowed[name]?.has(top)) {
          violations.push(
            `${rel(file)}: ${name} must not depend on ${top}`,
          );
        }
      }
      if (!deps.has(top) && top !== name) {
        // allow subpath if parent declared
        if (!deps.has(top)) {
          violations.push(
            `${rel(file)}: ${top} is not declared in ${rel(path.join(dir, "package.json"))}`,
          );
        }
      }
    }
  }
}

function hasCycle(node, visiting = new Set(), seen = new Set()) {
  if (visiting.has(node)) return true;
  if (seen.has(node)) return false;
  visiting.add(node);
  for (const next of graph[node] ?? []) {
    if (hasCycle(next, visiting, seen)) return true;
  }
  visiting.delete(node);
  seen.add(node);
  return false;
}

for (const name of Object.keys(graph)) {
  if (hasCycle(name)) {
    violations.push(`Circular dependency involving ${name}`);
  }
}

// --- Rule: PrismaClient only in packages/db (library) ---
for (const file of walk(root).filter((f) => /\.(ts|tsx|js|jsx|mjs)$/i.test(f))) {
  const r = rel(file);
  if (r.startsWith("packages/db/")) continue;
  // Root scripts may use @prisma/client (documented fragility) — allow scripts/
  if (r.startsWith("scripts/")) continue;
  const text = read(file);
  if (/new\s+PrismaClient\s*\(/.test(text)) {
    violations.push(`${r}: PrismaClient must only be constructed in packages/db`);
  }
  if (
    r.startsWith("apps/web/") &&
    (/from\s+['"]@prisma\/client['"]/.test(text) ||
      /from\s+['"]@warden\/db['"]/.test(text))
  ) {
    violations.push(`${r}: apps/web must not import Prisma or @warden/db`);
  }
}

// --- Rule: packages/ui free of domain/tRPC/Prisma ---
for (const file of walk(path.join(root, "packages", "ui", "src"))) {
  const text = read(file);
  if (
    /@warden\/(api|db|shared)/.test(text) ||
    /@trpc\//.test(text) ||
    /@prisma\//.test(text) ||
    /prisma/.test(text)
  ) {
    violations.push(`${rel(file)}: packages/ui must stay free of domain/tRPC/Prisma`);
  }
}

// --- Rule: .NET ProjectReferences stay under apps/agent; Core is leaf ---
const csprojFiles = walk(path.join(root, "apps", "agent")).filter((f) =>
  f.endsWith(".csproj"),
);
for (const file of csprojFiles) {
  const text = read(file);
  const refs = [...text.matchAll(/ProjectReference\s+Include="([^"]+)"/g)].map(
    (m) => m[1],
  );
  for (const ref of refs) {
    const resolved = path.resolve(path.dirname(file), ref);
    const r = rel(resolved);
    if (!r.startsWith("apps/agent/")) {
      violations.push(
        `${rel(file)}: ProjectReference escapes apps/agent (${ref} → ${r})`,
      );
    }
  }
  if (path.basename(file) === "Warden.Core.csproj" && refs.length > 0) {
    violations.push(`${rel(file)}: Warden.Core must remain a leaf (no ProjectReferences)`);
  }
}

// --- Report ---
if (violations.length) {
  console.error("Boundary check failed:\n");
  for (const v of [...new Set(violations)]) console.error(` - ${v}`);
  process.exit(1);
}

console.log("Boundary check passed.");
