import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const rootDir = process.cwd()
const releaseDir = path.join(rootDir, "release")
const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"))
const version = packageJson.version
const appPath = path.join(releaseDir, "mac-arm64", "Memforge.app")
const dmgPath = path.join(releaseDir, `Memforge-${version}-arm64.dmg`)
const zipPath = path.join(releaseDir, `Memforge-${version}-arm64-mac.zip`)
const latestYamlPath = path.join(releaseDir, "latest-mac.yml")

if (process.platform !== "darwin") {
  process.exit(0)
}

for (const candidate of [appPath, dmgPath, zipPath, latestYamlPath]) {
  if (!existsSync(candidate)) {
    throw new Error(`Missing macOS release artifact: ${candidate}`)
  }
}

run("codesign", ["--verify", "--deep", "--strict", appPath])
run("xcrun", ["stapler", "validate", appPath])
verifyReleasedArchives()

const latestYaml = readFileSync(latestYamlPath, "utf8")
const expectedFiles = [
  { filename: path.basename(zipPath), size: statSync(zipPath).size, sha512: sha512Base64(zipPath) },
  { filename: path.basename(dmgPath), size: statSync(dmgPath).size, sha512: sha512Base64(dmgPath) }
]

for (const artifact of expectedFiles) {
  verifyLatestYamlEntry(latestYaml, artifact)
}

if (!latestYaml.includes(`path: ${path.basename(zipPath)}`)) {
  throw new Error("latest-mac.yml primary path does not match the ZIP artifact")
}

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" })
}

function sha512Base64(filePath) {
  return createHash("sha512").update(readFileSync(filePath)).digest("base64")
}

function verifyReleasedArchives() {
  const workingDir = mkdtempSync(path.join(tmpdir(), "memforge-release-verify-"))
  const zipExtractDir = path.join(workingDir, "zip")
  const dmgMountDir = path.join(workingDir, "dmg")

  try {
    run("ditto", ["-x", "-k", zipPath, zipExtractDir])
    verifyAppBundle(path.join(zipExtractDir, "Memforge.app"))

    run("xcrun", ["stapler", "validate", dmgPath])
    run("spctl", ["-a", "-vv", "-t", "open", dmgPath])
    run("hdiutil", ["attach", dmgPath, "-nobrowse", "-readonly", "-mountpoint", dmgMountDir])
    try {
      verifyAppBundle(path.join(dmgMountDir, "Memforge.app"))
      const applicationsLink = path.join(dmgMountDir, "Applications")
      if (!existsSync(applicationsLink) || !lstatSync(applicationsLink).isSymbolicLink()) {
        throw new Error("DMG is missing the Applications symlink")
      }
    } finally {
      run("hdiutil", ["detach", dmgMountDir])
    }
  } finally {
    rmSync(workingDir, { force: true, recursive: true })
  }
}

function verifyAppBundle(appBundlePath) {
  if (!existsSync(appBundlePath)) {
    throw new Error(`Missing app bundle: ${appBundlePath}`)
  }
  run("codesign", ["--verify", "--deep", "--strict", appBundlePath])
  run("xcrun", ["stapler", "validate", appBundlePath])
}

function verifyLatestYamlEntry(latestYaml, artifact) {
  const escapedFilename = artifact.filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const entryMatch = latestYaml.match(
    new RegExp(`- url: ${escapedFilename}\\n\\s+sha512: ([^\\n]+)\\n\\s+size: (\\d+)`)
  )

  if (!entryMatch) {
    throw new Error(`latest-mac.yml is missing the ${artifact.filename} entry`)
  }

  const [, sha512, size] = entryMatch
  if (sha512 !== artifact.sha512) {
    throw new Error(`latest-mac.yml does not match sha512 for ${artifact.filename}`)
  }
  if (Number(size) !== artifact.size) {
    throw new Error(`latest-mac.yml does not match size for ${artifact.filename}`)
  }
}
