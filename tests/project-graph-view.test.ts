import { describe, expect, it } from "vitest";
import { buildProjectGraphView, listProjectGraphRelationTypes } from "../app/renderer/src/lib/projectGraph.js";
import type { ProjectGraphPayload } from "../app/renderer/src/lib/types.js";

const graph: ProjectGraphPayload = {
  nodes: [
    {
      id: "project_1",
      title: "RecallX",
      type: "project",
      status: "active",
      canonicality: "canonical",
      summary: "Project root",
      createdAt: "2026-03-20T00:00:00.000Z",
      updatedAt: "2026-03-20T00:00:00.000Z",
      degree: 2,
      isFocus: true,
      projectRole: "focus",
    },
    {
      id: "node_a",
      title: "Renderer note",
      type: "note",
      status: "active",
      canonicality: "appended",
      summary: "Renderer work",
      createdAt: "2026-03-20T00:00:00.000Z",
      updatedAt: "2026-03-20T00:00:00.000Z",
      degree: 2,
      isFocus: false,
      projectRole: "member",
    },
    {
      id: "node_b",
      title: "Inference note",
      type: "note",
      status: "active",
      canonicality: "appended",
      summary: "Inference work",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:00:00.000Z",
      degree: 1,
      isFocus: false,
      projectRole: "member",
    },
  ],
  edges: [
    {
      id: "edge_1",
      source: "node_a",
      target: "project_1",
      relationType: "relevant_to",
      relationSource: "canonical",
      status: "active",
      score: null,
      generator: null,
      createdAt: "2026-03-20T00:00:00.000Z",
      evidence: {},
    },
    {
      id: "edge_2",
      source: "node_a",
      target: "node_b",
      relationType: "supports",
      relationSource: "inferred",
      status: "active",
      score: 0.92,
      generator: "deterministic-project-membership",
      createdAt: "2026-03-21T00:00:00.000Z",
      evidence: {},
    },
  ],
  timeline: [
    {
      id: "event_1",
      kind: "node_created",
      at: "2026-03-20T00:00:00.000Z",
      nodeId: "node_a",
      label: "Renderer note created",
    },
    {
      id: "event_2",
      kind: "relation_created",
      at: "2026-03-21T00:00:00.000Z",
      edgeId: "edge_2",
      label: "Inference edge computed",
    },
  ],
  meta: {
    focusProjectId: "project_1",
    nodeCount: 3,
    edgeCount: 2,
    inferredEdgeCount: 1,
    timeRange: {
      start: "2026-03-20T00:00:00.000Z",
      end: "2026-03-21T00:00:00.000Z",
    },
  },
};

describe("project graph view helpers", () => {
  it("lists relation types in sorted order", () => {
    expect(listProjectGraphRelationTypes(graph)).toEqual(["relevant_to", "supports"]);
  });

  it("filters by source and keeps the focus project visible", () => {
    const view = buildProjectGraphView(graph, {
      relationTypes: ["relevant_to", "supports"],
      sources: {
        canonical: true,
        inferred: false,
      },
      timelineIndex: 1,
    });

    expect(view.edges.map((edge: ProjectGraphPayload["edges"][number]) => edge.id)).toEqual(["edge_1"]);
    expect(view.nodes.map((node: ProjectGraphPayload["nodes"][number]) => node.id)).toEqual(expect.arrayContaining(["project_1", "node_a"]));
    expect(view.nodes.map((node: ProjectGraphPayload["nodes"][number]) => node.id)).not.toContain("node_b");
  });

  it("emphasizes only the graph state that existed at the selected timeline event", () => {
    const view = buildProjectGraphView(graph, {
      relationTypes: ["relevant_to", "supports"],
      sources: {
        canonical: true,
        inferred: true,
      },
      timelineIndex: 0,
    });

    expect(view.activeAt).toBe("2026-03-20T00:00:00.000Z");
    expect(view.emphasizedNodeIds).toEqual(expect.arrayContaining(["project_1", "node_a"]));
    expect(view.emphasizedNodeIds).not.toContain("node_b");
    expect(view.emphasizedEdgeIds).toEqual(["edge_1"]);
  });
});
