import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

export interface WorkspacePaths {
  root: string;
  dbPath: string;
  artifactsDir: string;
  exportsDir: string;
  importsDir: string;
  backupsDir: string;
  logsDir: string;
  configDir: string;
  cacheDir: string;
  embeddingsDir: string;
  searchCacheDir: string;
}

export function resolveWorkspaceRoot(): string {
  const configured = process.env.MEMFORGE_WORKSPACE_ROOT;
  if (configured) {
    return path.resolve(configured);
  }

  return path.resolve(process.cwd(), ".memforge-workspace");
}

export function ensureWorkspace(root: string): WorkspacePaths {
  const paths: WorkspacePaths = {
    root,
    dbPath: path.join(root, "workspace.db"),
    artifactsDir: path.join(root, "artifacts"),
    exportsDir: path.join(root, "exports"),
    importsDir: path.join(root, "imports"),
    backupsDir: path.join(root, "backups"),
    logsDir: path.join(root, "logs"),
    configDir: path.join(root, "config"),
    cacheDir: path.join(root, "cache"),
    embeddingsDir: path.join(root, "cache", "embeddings"),
    searchCacheDir: path.join(root, "cache", "search")
  };

  for (const directory of [
    paths.root,
    paths.artifactsDir,
    paths.exportsDir,
    paths.importsDir,
    paths.backupsDir,
    paths.logsDir,
    paths.configDir,
    paths.cacheDir,
    paths.embeddingsDir,
    paths.searchCacheDir
  ]) {
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
  }

  return paths;
}

export function defaultWorkspaceName(root: string): string {
  const resolved = path.resolve(root);
  const base = path.basename(resolved);
  if (base.startsWith(".")) {
    return path.basename(path.dirname(resolved)) || "Memforge";
  }

  return base.replace(/^\.*/, "") || "Memforge";
}
