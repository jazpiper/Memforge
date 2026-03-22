import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
const packageName = packageJson.name;
const packageVersion = packageJson.version;
const requestedTarballPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(rootDir, `${packageName}-${packageVersion}.tgz`);

const workingDir = mkdtempSync(path.join(tmpdir(), "memforge-cli-verify-"));
const homeDir = path.join(workingDir, "home");
const installDir = path.join(workingDir, "install");
const packDir = path.join(workingDir, "pack");

try {
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(installDir, { recursive: true });
  mkdirSync(packDir, { recursive: true });

  const tarballPath = resolveTarballPath();
  run("npm", ["init", "-y"], { cwd: installDir });
  run("npm", ["install", tarballPath], { cwd: installDir });

  runBinary(installDir, "memforge", ["--help"]);
  runBinary(installDir, "pnw", ["help"]);
  runBinary(installDir, "memforge-mcp", ["--help"]);
  runBinary(installDir, "pnw", ["mcp", "install"], {
    env: {
      ...process.env,
      HOME: homeDir
    }
  });

  const launcherPath = path.join(homeDir, ".memforge", "bin", "memforge-mcp");
  if (!existsSync(launcherPath)) {
    throw new Error(`Expected MCP launcher to be created at ${launcherPath}`);
  }

  const launcherContents = readFileSync(launcherPath, "utf8");
  if (!launcherContents.includes("memforge-mcp.js")) {
    throw new Error("Installed MCP launcher is missing the memforge-mcp.js entrypoint.");
  }
  if (!launcherContents.includes("--api")) {
    throw new Error("Installed MCP launcher is missing the API argument.");
  }
  if (launcherContents.includes("--token")) {
    throw new Error("Installed MCP launcher must not persist bearer tokens.");
  }
  if (launcherContents.includes("MEMFORGE_API_TOKEN")) {
    throw new Error("Installed MCP launcher must not inline MEMFORGE_API_TOKEN values.");
  }
} finally {
  rmSync(workingDir, { force: true, recursive: true });
}

function resolveTarballPath() {
  if (existsSync(requestedTarballPath)) {
    return requestedTarballPath;
  }

  if (process.argv[2]) {
    throw new Error(`Missing packed CLI tarball: ${requestedTarballPath}`);
  }

  const packOutput = runAndCapture("npm", ["pack", "./release/npm-cli", "--json", "--pack-destination", packDir], {
    cwd: rootDir
  });
  const parsed = JSON.parse(packOutput);
  const filename = Array.isArray(parsed) ? parsed[0]?.filename : null;
  if (typeof filename !== "string" || !filename.trim()) {
    throw new Error("Failed to determine packed CLI tarball filename from npm pack output.");
  }

  const generatedTarballPath = path.join(packDir, filename);
  if (!existsSync(generatedTarballPath)) {
    throw new Error(`Expected generated CLI tarball at ${generatedTarballPath}`);
  }

  return generatedTarballPath;
}

function resolveBinaryPath(installRoot, binaryName) {
  return path.join(installRoot, "node_modules", ".bin", process.platform === "win32" ? `${binaryName}.cmd` : binaryName);
}

function runBinary(installRoot, binaryName, args, options = {}) {
  const binaryPath = resolveBinaryPath(installRoot, binaryName);
  if (!existsSync(binaryPath)) {
    throw new Error(`Missing installed binary: ${binaryPath}`);
  }

  run(binaryPath, args, {
    cwd: installRoot,
    ...options
  });
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    ...options
  });
}

function runAndCapture(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options
  });
}
