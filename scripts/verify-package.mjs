import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const packageKind = process.argv[2];
const packageConfigs = {
  full: {
    packageDir: "release/npm-memforge",
    expectRenderer: true,
    tarballPrefix: "memforge",
  },
  headless: {
    packageDir: "release/npm-headless",
    expectRenderer: false,
    tarballPrefix: "memforge-headless",
  },
};

const selectedConfig = packageConfigs[packageKind];
if (!selectedConfig) {
  throw new Error(`Unknown package kind "${packageKind}". Expected one of: ${Object.keys(packageConfigs).join(", ")}.`);
}

const rootDir = process.cwd();
const requestedTarballPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
const workingDir = mkdtempSync(path.join(tmpdir(), `memforge-${packageKind}-verify-`));
const homeDir = path.join(workingDir, "home");
const installDir = path.join(workingDir, "install");
const packDir = path.join(workingDir, "pack");
const workspaceRoot = path.join(workingDir, "workspace");
const port = selectedConfig.expectRenderer ? 8877 : 8878;

try {
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(installDir, { recursive: true });
  mkdirSync(packDir, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });

  const tarballPath = resolveTarballPath();
  run("npm", ["init", "-y"], { cwd: installDir });
  run("npm", ["install", tarballPath], { cwd: installDir });

  runBinary(installDir, "memforge", ["--help"]);
  runBinary(installDir, "pnw", ["help"]);
  runBinary(installDir, "memforge-mcp", ["--help"]);

  const serverProcess = spawnInstalledBinary(installDir, "memforge", [
    "serve",
    "--port",
    String(port),
    "--workspace-root",
    workspaceRoot,
  ]);

  try {
    await waitForHttpOk(`http://127.0.0.1:${port}/api/v1/health`);
    runBinary(installDir, "pnw", ["health", "--api", `http://127.0.0.1:${port}/api/v1`]);

    const rootResponse = await fetch(`http://127.0.0.1:${port}/`);
    const rootText = await rootResponse.text();
    if (selectedConfig.expectRenderer) {
      if (!rootResponse.ok || !rootText.includes("<title>Memforge</title>")) {
        throw new Error("Expected full package to serve the renderer index at /.");
      }
    } else if (!rootText.includes("headless runtime")) {
      throw new Error("Expected headless package to expose a root runtime notice.");
    }
  } finally {
    await stopProcess(serverProcess);
  }

  runBinary(installDir, "pnw", ["mcp", "install"], {
    env: {
      ...process.env,
      HOME: homeDir,
    },
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
  if (requestedTarballPath && existsSync(requestedTarballPath)) {
    return requestedTarballPath;
  }

  if (requestedTarballPath) {
    throw new Error(`Missing packed tarball: ${requestedTarballPath}`);
  }

  const packageDir = path.join(rootDir, selectedConfig.packageDir);
  const packOutput = runAndCapture("npm", ["pack", packageDir, "--json", "--pack-destination", packDir], {
    cwd: rootDir,
  });
  const parsed = JSON.parse(packOutput);
  const filename = Array.isArray(parsed) ? parsed[0]?.filename : null;
  if (typeof filename !== "string" || !filename.trim()) {
    throw new Error("Failed to determine packed tarball filename from npm pack output.");
  }

  const generatedTarballPath = path.join(packDir, filename);
  if (!existsSync(generatedTarballPath)) {
    throw new Error(`Expected generated tarball at ${generatedTarballPath}`);
  }
  if (!filename.startsWith(selectedConfig.tarballPrefix)) {
    throw new Error(`Packed tarball ${filename} does not match expected prefix ${selectedConfig.tarballPrefix}.`);
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
    ...options,
  });
}

function spawnInstalledBinary(installRoot, binaryName, args) {
  const binaryPath = resolveBinaryPath(installRoot, binaryName);
  if (!existsSync(binaryPath)) {
    throw new Error(`Missing installed binary: ${binaryPath}`);
  }

  return spawn(binaryPath, args, {
    cwd: installRoot,
    env: process.env,
    stdio: "pipe",
  });
}

async function waitForHttpOk(url, timeoutMs = 10_000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Received ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`);
}

function stopProcess(child) {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }, 1_000);
  });
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    ...options,
  });
}

function runAndCapture(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  });
}
