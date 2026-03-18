import { describe, expect, it } from "vitest";
import { resolveNodeGovernance, resolveRelationStatus } from "../app/server/governance.js";

describe("resolveNodeGovernance", () => {
  it("keeps human nodes canonical", () => {
    const decision = resolveNodeGovernance({
      type: "note",
      title: "Human note",
      body: "This is durable.",
      tags: [],
      source: {
        actorType: "human",
        actorLabel: "juhwan",
        toolName: "memforge"
      },
      metadata: {}
    });

    expect(decision.canonicality).toBe("canonical");
    expect(decision.createReview).toBe(false);
  });

  it("forces agent decisions into review", () => {
    const decision = resolveNodeGovernance({
      type: "decision",
      title: "Use SQLite",
      body: "Adopt SQLite as the canonical store.",
      tags: [],
      source: {
        actorType: "agent",
        actorLabel: "Codex",
        toolName: "codex"
      },
      metadata: {}
    });

    expect(decision.canonicality).toBe("suggested");
    expect(decision.createReview).toBe(true);
  });
});

describe("resolveRelationStatus", () => {
  it("forces agent relations to suggested", () => {
    const status = resolveRelationStatus({
      fromNodeId: "node_a",
      toNodeId: "node_b",
      relationType: "supports",
      source: {
        actorType: "agent",
        actorLabel: "Claude Code",
        toolName: "claude-code"
      },
      metadata: {}
    });

    expect(status.status).toBe("suggested");
    expect(status.createReview).toBe(true);
  });
});
