import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const rootPackage = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
const releaseVersion = rootPackage.version;

if (typeof releaseVersion !== "string" || !releaseVersion.trim()) {
  throw new Error("Root package version is missing.");
}

const releaseTargets = [
  {
    packageName: "memforge",
    packageDir: "./release/npm-memforge",
  },
  {
    packageName: "memforge-headless",
    packageDir: "./release/npm-headless",
  },
];

const missingTargets = releaseTargets.filter((target) => !isPublished(target.packageName, releaseVersion));

if (missingTargets.length === 0) {
  console.log(`All release packages are already published at ${releaseVersion}. Skipping publish.`);
  process.exit(0);
}

console.log(`Preparing release ${releaseVersion} for: ${missingTargets.map((target) => target.packageName).join(", ")}`);
run("npm", ["run", "release:verify"]);

for (const target of missingTargets) {
  run("npm", ["publish", target.packageDir, "--provenance"]);
}

function isPublished(packageName, version) {
  try {
    const output = execFileSync("npm", ["view", `${packageName}@${version}`, "version", "--json"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

    if (!output) {
      return false;
    }

    const parsed = JSON.parse(output);
    return parsed === version;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "stderr" in error &&
      typeof error.stderr === "string" &&
      error.stderr.includes("E404")
    ) {
      return false;
    }

    throw error;
  }
}

function run(command, args) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  });
}
