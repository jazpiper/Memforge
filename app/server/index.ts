import { createServer } from "node:http";
import { createServerConfig, ensureApiToken, workspaceInfo } from "./config.js";
import { openDatabase } from "./db.js";
import { MemforgeRepository } from "./repositories.js";
import { createMemforgeApp } from "./app.js";
import { ensureWorkspace, resolveWorkspaceRoot } from "./workspace.js";

const workspaceRoot = resolveWorkspaceRoot();
const workspacePaths = ensureWorkspace(workspaceRoot);
const config = createServerConfig(workspaceRoot);
const apiToken = ensureApiToken(config);
const database = openDatabase(workspacePaths);
const repository = new MemforgeRepository(database, workspaceRoot);

repository.upsertBaseSettings({
  "workspace.name": config.workspaceName,
  "workspace.version": "0.1.0",
  "api.bind": `${config.bindAddress}:${config.port}`,
  "api.auth.mode": config.apiToken ? "bearer" : "optional",
  "search.semantic.enabled": false,
  "review.autoApproveLowRisk": false,
  "export.defaultFormat": "markdown"
});

const info = workspaceInfo(workspaceRoot, config, config.apiToken ? "bearer" : "optional");
const app = createMemforgeApp({
  repository,
  workspaceInfo: info,
  apiToken: config.apiToken ? apiToken : null,
  workspaceRoot
});

createServer(app).listen(config.port, config.bindAddress, () => {
  console.log(`Memforge API listening on http://${config.bindAddress}:${config.port}`);
  console.log(`Workspace root: ${workspaceRoot}`);
  if (!config.apiToken) {
    console.log("Auth mode: optional (set MEMFORGE_API_TOKEN to enforce bearer auth)");
  }
});

