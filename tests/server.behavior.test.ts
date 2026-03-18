import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMemforgeApp } from "../app/server/app.js";
import { openDatabase } from "../app/server/db.js";
import { applyReviewDecision } from "../app/server/governance.js";
import { MemforgeRepository } from "../app/server/repositories.js";
import { ensureWorkspace } from "../app/server/workspace.js";

const tempRoots: string[] = [];

function createRepository() {
  const root = mkdtempSync(path.join(tmpdir(), "memforge-test-"));
  tempRoots.push(root);
  const workspace = ensureWorkspace(root);
  const db = openDatabase(workspace);
  const repository = new MemforgeRepository(db, root);
  repository.upsertBaseSettings({
    "workspace.name": "Memforge Test"
  });
  return repository;
}

afterEach(() => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("search punctuation handling", () => {
  it("falls back cleanly for punctuation-heavy queries", () => {
    const repository = createRepository();
    repository.createNode({
      type: "note",
      title: "C++ retrieval note",
      body: "foo: bar",
      tags: ["search"],
      source: {
        actorType: "human",
        actorLabel: "juhwan",
        toolName: "memforge-test"
      },
      metadata: {},
      resolvedCanonicality: "canonical",
      resolvedStatus: "active"
    });

    const cppResults = repository.searchNodes({
      query: "C++",
      filters: {},
      limit: 10,
      offset: 0,
      sort: "relevance"
    });
    const colonResults = repository.searchNodes({
      query: "foo:",
      filters: {},
      limit: 10,
      offset: 0,
      sort: "relevance"
    });

    expect(cppResults.total).toBe(1);
    expect(cppResults.items[0]?.title).toBe("C++ retrieval note");
    expect(colonResults.total).toBe(1);
    expect(colonResults.items[0]?.title).toBe("C++ retrieval note");
  });
});

describe("review provenance", () => {
  it("records provenance on the node when a review approval mutates it", () => {
    const repository = createRepository();
    const node = repository.createNode({
      type: "note",
      title: "Suggested memory note",
      body: "Original suggested content",
      tags: ["memory"],
      source: {
        actorType: "agent",
        actorLabel: "Codex",
        toolName: "codex"
      },
      metadata: {},
      resolvedCanonicality: "suggested",
      resolvedStatus: "review"
    });
    const review = repository.createReviewItem({
      entityType: "node",
      entityId: node.id,
      reviewType: "node_promotion",
      proposedBy: "Codex",
      notes: "Needs approval"
    });

    applyReviewDecision(repository, review.id, "edit-and-approve", {
      source: {
        actorType: "human",
        actorLabel: "juhwan",
        toolName: "memforge-test"
      },
      patch: {
        body: "Edited canonical content"
      }
    });

    const provenance = repository.listProvenance("node", node.id).map((item) => item.operationType);
    expect(provenance).toContain("update");
    expect(provenance).toContain("promote");
  });
});

describe("review queue filtering", () => {
  it("filters review items by review type", () => {
    const repository = createRepository();
    repository.createReviewItem({
      entityType: "node",
      entityId: "node_one",
      reviewType: "node_promotion",
      proposedBy: "Codex",
      notes: "Promote note"
    });
    repository.createReviewItem({
      entityType: "relation",
      entityId: "rel_one",
      reviewType: "relation_suggestion",
      proposedBy: "Codex",
      notes: "Review relation"
    });

    const filtered = repository.listReviewItems("pending", 20, "node_promotion");

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.reviewType).toBe("node_promotion");
  });
});

describe("bootstrap auth metadata", () => {
  it("keeps bootstrap public without leaking the bearer token", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "memforge-test-"));
    tempRoots.push(root);
    const workspace = ensureWorkspace(root);
    const db = openDatabase(workspace);
    const repository = new MemforgeRepository(db, root);
    repository.upsertBaseSettings({
      "workspace.name": "Memforge Test"
    });

    const app = createMemforgeApp({
      repository,
      workspaceInfo: {
        rootPath: root,
        workspaceName: "Memforge Test",
        schemaVersion: 1,
        bindAddress: "127.0.0.1:0",
        enabledIntegrationModes: ["read-only", "append-only"],
        authMode: "bearer"
      },
      apiToken: "secret-token",
      workspaceRoot: root
    });

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Failed to resolve test server address");
      }

      const bootstrapResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/bootstrap`);
      const bootstrapBody = await bootstrapResponse.json();
      const searchResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/nodes/search`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          query: "",
          filters: {},
          limit: 10,
          offset: 0,
          sort: "updated_at"
        })
      });

      expect(bootstrapResponse.status).toBe(200);
      expect(bootstrapBody.data.authMode).toBe("bearer");
      expect(bootstrapBody.data.apiToken).toBeUndefined();
      expect(searchResponse.status).toBe(401);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
