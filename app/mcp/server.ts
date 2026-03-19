import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  activityTypes,
  bundleModes,
  bundlePresets,
  canonicalities,
  governanceStates,
  inferredRelationStatuses,
  nodeStatuses,
  nodeTypes,
  relationSources,
  relationStatuses,
  relationTypes,
  relationUsageEventTypes,
  searchFeedbackResultTypes,
  searchFeedbackVerdicts,
  sourceTypes
} from "../shared/contracts.js";
import type { Source } from "../shared/contracts.js";
import { MemforgeApiClient } from "./api-client.js";

const jsonRecordSchema = z.record(z.string(), z.any()).default({});

function formatStructuredContent(content: unknown) {
  return JSON.stringify(content, null, 2);
}

function toolResult<T>(structuredContent: T) {
  return {
    content: [
      {
        type: "text" as const,
        text: formatStructuredContent(structuredContent)
      }
    ],
    structuredContent
  };
}

function buildSourceSchema(defaultSource: Source) {
  const sourceDefault = {
    actorType: defaultSource.actorType,
    actorLabel: defaultSource.actorLabel,
    toolName: defaultSource.toolName,
    toolVersion: defaultSource.toolVersion
  };

  return z
    .object({
      actorType: z.enum(sourceTypes).default(defaultSource.actorType),
      actorLabel: z.string().min(1).default(defaultSource.actorLabel),
      toolName: z.string().min(1).default(defaultSource.toolName),
      toolVersion: defaultSource.toolVersion
        ? z.string().min(1).optional().default(defaultSource.toolVersion)
        : z.string().min(1).optional()
    })
    .default(sourceDefault);
}

const workspaceInfoSchema = z.object({
  rootPath: z.string(),
  workspaceName: z.string(),
  schemaVersion: z.number(),
  bindAddress: z.string(),
  enabledIntegrationModes: z.array(z.string()),
  authMode: z.string()
});

const sourceDescription =
  "Optional provenance override. If omitted, Memforge MCP uses its own agent identity so durable writes still keep attribution.";
const readOnlyToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true
} as const;

function createGetToolHandler(apiClient: Pick<MemforgeApiClient, "get">, path: string) {
  return async () => toolResult(await apiClient.get<Record<string, unknown>>(path));
}

function createPostToolHandler(apiClient: Pick<MemforgeApiClient, "post">, path: string) {
  return async (input: Record<string, unknown>) => toolResult(await apiClient.post<Record<string, unknown>>(path, input));
}

function withReadOnlyAnnotations(config: any) {
  return {
    ...config,
    annotations: {
      ...readOnlyToolAnnotations,
      ...(config.annotations ?? {})
    }
  };
}

function registerReadOnlyTool(
  server: McpServer,
  name: string,
  config: any,
  handler: (...args: any[]) => any
) {
  server.registerTool(name, withReadOnlyAnnotations(config), handler);
}

export function createMemforgeMcpServer(params?: {
  apiClient?: Pick<MemforgeApiClient, "get" | "post" | "patch">;
  defaultSource?: Source;
  serverVersion?: string;
}) {
  const apiClient =
    params?.apiClient ??
    new MemforgeApiClient(process.env.MEMFORGE_API_URL ?? "http://127.0.0.1:8787/api/v1", process.env.MEMFORGE_API_TOKEN);
  const defaultSource: Source = params?.defaultSource ?? {
    actorType: "agent",
    actorLabel: process.env.MEMFORGE_MCP_SOURCE_LABEL ?? "Memforge MCP",
    toolName: process.env.MEMFORGE_MCP_TOOL_NAME ?? "memforge-mcp",
    toolVersion: params?.serverVersion ?? "0.1.0"
  };
  const sourceSchema = buildSourceSchema(defaultSource).describe(sourceDescription);

  const server = new McpServer(
    {
      name: "memforge-mcp",
      version: params?.serverVersion ?? "0.1.0"
    },
    {
      instructions:
        "Use Memforge as a local knowledge backend. Prefer read tools first to inspect workspace state, and include source details on durable writes when you want caller-specific provenance.",
      capabilities: {
        logging: {}
      }
    }
  );

  registerReadOnlyTool(
    server,
    "memforge_health",
    {
      title: "Memforge Health",
      description: "Check whether the running local Memforge API is healthy and which workspace is loaded.",
      outputSchema: z.object({
        status: z.string(),
        workspaceLoaded: z.boolean(),
        workspaceRoot: z.string(),
        schemaVersion: z.number()
      })
    },
    createGetToolHandler(apiClient, "/health")
  );

  registerReadOnlyTool(
    server,
    "memforge_workspace_current",
    {
      title: "Current Workspace",
      description: "Read the currently active Memforge workspace and auth mode.",
      outputSchema: workspaceInfoSchema
    },
    createGetToolHandler(apiClient, "/workspace")
  );

  registerReadOnlyTool(
    server,
    "memforge_workspace_list",
    {
      title: "List Workspaces",
      description: "List known Memforge workspaces and identify the currently active one.",
      outputSchema: z.object({
        current: workspaceInfoSchema,
        items: z.array(workspaceInfoSchema.extend({ isCurrent: z.boolean(), lastOpenedAt: z.string() }))
      })
    },
    createGetToolHandler(apiClient, "/workspaces")
  );

  server.registerTool(
    "memforge_workspace_create",
    {
      title: "Create Workspace",
      description: "Create a Memforge workspace on disk and switch the running service to it without restarting.",
      inputSchema: {
        rootPath: z.string().min(1).describe("Absolute or user-resolved path for the new workspace root."),
        workspaceName: z.string().min(1).optional().describe("Human-friendly workspace name.")
      }
    },
    createPostToolHandler(apiClient, "/workspaces")
  );

  server.registerTool(
    "memforge_workspace_open",
    {
      title: "Open Workspace",
      description: "Switch the running Memforge service to another existing workspace.",
      inputSchema: {
        rootPath: z.string().min(1).describe("Existing workspace root path to open.")
      }
    },
    createPostToolHandler(apiClient, "/workspaces/open")
  );

  registerReadOnlyTool(
    server,
    "memforge_semantic_status",
    {
      title: "Semantic Index Status",
      description: "Read the current semantic indexing status, provider configuration, and queued item counts.",
      outputSchema: z.object({
        enabled: z.boolean(),
        provider: z.string().nullable(),
        model: z.string().nullable(),
        chunkEnabled: z.boolean(),
        lastBackfillAt: z.string().nullable(),
        counts: z.object({
          pending: z.number(),
          processing: z.number(),
          stale: z.number(),
          ready: z.number(),
          failed: z.number()
        })
      })
    },
    createGetToolHandler(apiClient, "/semantic/status")
  );

  registerReadOnlyTool(
    server,
    "memforge_semantic_issues",
    {
      title: "Semantic Index Issues",
      description: "Read semantic indexing issues with optional status filters and cursor pagination.",
      inputSchema: {
        limit: z.number().int().min(1).max(25).default(5).describe("Maximum number of semantic issue items to return."),
        cursor: z.string().min(1).optional().describe("Opaque cursor from a previous semantic issues call."),
        statuses: z.array(z.enum(["pending", "stale", "failed"])).max(3).optional().describe("Optional issue statuses to include.")
      },
      outputSchema: z.object({
        items: z.array(
          z.object({
            nodeId: z.string(),
            title: z.string().nullable(),
            embeddingStatus: z.enum(["pending", "processing", "stale", "ready", "failed"]),
            staleReason: z.string().nullable(),
            updatedAt: z.string()
          })
        ),
        nextCursor: z.string().nullable()
      })
    },
    async ({ limit, cursor, statuses }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (cursor) {
        params.set("cursor", cursor);
      }
      if (statuses?.length) {
        params.set("statuses", statuses.join(","));
      }
      return toolResult(await apiClient.get(`/semantic/issues?${params.toString()}`));
    }
  );

  registerReadOnlyTool(
    server,
    "memforge_search_nodes",
    {
      title: "Search Nodes",
      description: "Search Memforge nodes by keyword and optional structured filters.",
      inputSchema: {
        query: z.string().default("").describe("Keyword or phrase query."),
        filters: z
          .object({
            types: z.array(z.enum(nodeTypes)).optional(),
            status: z.array(z.enum(nodeStatuses)).optional(),
            sourceLabels: z.array(z.string()).optional(),
            tags: z.array(z.string()).optional()
          })
          .default({}),
        limit: z.number().int().min(1).max(100).default(10),
        offset: z.number().int().min(0).default(0),
        sort: z.enum(["relevance", "updated_at"]).default("relevance")
      }
    },
    createPostToolHandler(apiClient, "/nodes/search")
  );

  registerReadOnlyTool(
    server,
    "memforge_search_activities",
    {
      title: "Search Activities",
      description: "Search Memforge activity timelines by keyword and optional structured filters.",
      inputSchema: {
        query: z.string().default("").describe("Keyword or phrase query."),
        filters: z
          .object({
            targetNodeIds: z.array(z.string()).optional(),
            activityTypes: z.array(z.enum(activityTypes)).optional(),
            sourceLabels: z.array(z.string()).optional(),
            createdAfter: z.string().optional(),
            createdBefore: z.string().optional()
          })
          .default({}),
        limit: z.number().int().min(1).max(100).default(10),
        offset: z.number().int().min(0).default(0),
        sort: z.enum(["relevance", "updated_at"]).default("relevance")
      }
    },
    createPostToolHandler(apiClient, "/activities/search")
  );

  registerReadOnlyTool(
    server,
    "memforge_search_workspace",
    {
      title: "Search Workspace",
      description: "Search nodes, activities, or both through a single workspace-wide endpoint.",
      inputSchema: {
        query: z.string().default("").describe("Keyword or phrase query."),
        scopes: z.array(z.enum(["nodes", "activities"])).min(1).default(["nodes", "activities"]),
        nodeFilters: z
          .object({
            types: z.array(z.enum(nodeTypes)).optional(),
            status: z.array(z.enum(nodeStatuses)).optional(),
            sourceLabels: z.array(z.string()).optional(),
            tags: z.array(z.string()).optional()
          })
          .optional(),
        activityFilters: z
          .object({
            targetNodeIds: z.array(z.string()).optional(),
            activityTypes: z.array(z.enum(activityTypes)).optional(),
            sourceLabels: z.array(z.string()).optional(),
            createdAfter: z.string().optional(),
            createdBefore: z.string().optional()
          })
          .optional(),
        limit: z.number().int().min(1).max(100).default(10),
        offset: z.number().int().min(0).default(0),
        sort: z.enum(["relevance", "updated_at"]).default("relevance")
      }
    },
    createPostToolHandler(apiClient, "/search")
  );

  registerReadOnlyTool(
    server,
    "memforge_get_node",
    {
      title: "Get Node",
      description: "Fetch a node together with its related nodes, activities, artifacts, and provenance.",
      inputSchema: {
        nodeId: z.string().min(1).describe("Target node id.")
      }
    },
    async ({ nodeId }) => toolResult(await apiClient.get(`/nodes/${encodeURIComponent(nodeId)}`))
  );

  registerReadOnlyTool(
    server,
    "memforge_get_related",
    {
      title: "Get Node Neighborhood",
      description: "Fetch the canonical Memforge node neighborhood with optional inferred relations.",
      inputSchema: {
        nodeId: z.string().min(1).describe("Target node id."),
        depth: z.number().int().min(1).max(1).default(1),
        relationTypes: z.array(z.enum(relationTypes)).default([]),
        includeInferred: z.boolean().default(true),
        maxInferred: z.number().int().min(0).max(10).default(4)
      }
    },
    async ({ nodeId, depth, relationTypes: relationTypeFilter, includeInferred, maxInferred }) => {
      const query = new URLSearchParams({
        depth: String(depth),
        include_inferred: includeInferred ? "1" : "0",
        max_inferred: String(maxInferred)
      });
      if (relationTypeFilter.length) {
        query.set("types", relationTypeFilter.join(","));
      }
      return toolResult(await apiClient.get(`/nodes/${encodeURIComponent(nodeId)}/neighborhood?${query.toString()}`));
    }
  );

  server.registerTool(
    "memforge_upsert_inferred_relation",
    {
      title: "Upsert Inferred Relation",
      description: "Upsert a lightweight inferred relation for retrieval, graph expansion, and later weight adjustment.",
      inputSchema: {
        fromNodeId: z.string().min(1),
        toNodeId: z.string().min(1),
        relationType: z.enum(relationTypes),
        baseScore: z.number(),
        usageScore: z.number().default(0),
        finalScore: z.number(),
        status: z.enum(inferredRelationStatuses).default("active"),
        generator: z.string().min(1).describe("Short generator label such as deterministic-linker or coaccess-pass."),
        evidence: jsonRecordSchema,
        expiresAt: z.string().optional(),
        metadata: jsonRecordSchema
      }
    },
    createPostToolHandler(apiClient, "/inferred-relations")
  );

  server.registerTool(
    "memforge_append_relation_usage_event",
    {
      title: "Append Relation Usage Event",
      description: "Append a lightweight usage signal after a relation actually helped retrieval or final output.",
      inputSchema: {
        relationId: z.string().min(1),
        relationSource: z.enum(relationSources),
        eventType: z.enum(relationUsageEventTypes),
        sessionId: z.string().optional(),
        runId: z.string().optional(),
        source: sourceSchema.optional(),
        delta: z.number(),
        metadata: jsonRecordSchema
      }
    },
    createPostToolHandler(apiClient, "/relation-usage-events")
  );

  server.registerTool(
    "memforge_append_search_feedback",
    {
      title: "Append Search Feedback",
      description: "Append a usefulness signal for a node or activity search result after it helped or failed a task.",
      inputSchema: {
        resultType: z.enum(searchFeedbackResultTypes),
        resultId: z.string().min(1),
        verdict: z.enum(searchFeedbackVerdicts),
        query: z.string().optional(),
        sessionId: z.string().optional(),
        runId: z.string().optional(),
        source: sourceSchema.optional(),
        confidence: z.number().min(0).max(1).default(1),
        metadata: jsonRecordSchema
      }
    },
    createPostToolHandler(apiClient, "/search-feedback-events")
  );

  server.registerTool(
    "memforge_recompute_inferred_relations",
    {
      title: "Recompute Inferred Relations",
      description: "Run an explicit maintenance pass that refreshes inferred relation usage_score and final_score from usage events.",
      inputSchema: {
        relationIds: z.array(z.string().min(1)).max(200).optional(),
        generator: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(500).default(100)
      }
    },
    createPostToolHandler(apiClient, "/inferred-relations/recompute")
  );

  server.registerTool(
    "memforge_append_activity",
    {
      title: "Append Activity",
      description: "Append an activity entry to a Memforge node timeline with provenance.",
      inputSchema: {
        targetNodeId: z.string().min(1).describe("Target node id."),
        activityType: z.enum(activityTypes),
        body: z.string().default(""),
        source: sourceSchema,
        metadata: jsonRecordSchema
      }
    },
    createPostToolHandler(apiClient, "/activities")
  );

  server.registerTool(
    "memforge_create_node",
    {
      title: "Create Node",
      description: "Create a durable Memforge node with provenance.",
      inputSchema: {
        type: z.enum(nodeTypes),
        title: z.string().min(1),
        body: z.string().default(""),
        summary: z.string().optional(),
        tags: z.array(z.string()).default([]),
        canonicality: z.enum(canonicalities).optional(),
        status: z.enum(nodeStatuses).optional(),
        source: sourceSchema,
        metadata: jsonRecordSchema
      }
    },
    createPostToolHandler(apiClient, "/nodes")
  );

  server.registerTool(
    "memforge_create_relation",
    {
      title: "Create Relation",
      description: "Create a relation between two nodes. Agent-created relations typically start suggested and are promoted automatically when confidence improves.",
      inputSchema: {
        fromNodeId: z.string().min(1),
        toNodeId: z.string().min(1),
        relationType: z.enum(relationTypes),
        status: z.enum(relationStatuses).optional(),
        source: sourceSchema,
        metadata: jsonRecordSchema
      }
    },
    createPostToolHandler(apiClient, "/relations")
  );

  registerReadOnlyTool(
    server,
    "memforge_list_governance_issues",
    {
      title: "List Governance Issues",
      description: "List contested or low-confidence governance items that may need inspection.",
      inputSchema: {
        states: z.array(z.enum(governanceStates)).default(["contested", "low_confidence"]),
        limit: z.number().int().min(1).max(100).default(20)
      }
    },
    async ({ states, limit }) => {
      const query = new URLSearchParams({
        states: states.join(","),
        limit: String(limit)
      });
      return toolResult(await apiClient.get(`/governance/issues?${query.toString()}`));
    }
  );

  registerReadOnlyTool(
    server,
    "memforge_get_governance_state",
    {
      title: "Get Governance State",
      description: "Read the current automatic governance state and recent events for a node or relation.",
      inputSchema: {
        entityType: z.enum(["node", "relation"]),
        entityId: z.string().min(1)
      }
    },
    async ({ entityType, entityId }) =>
      toolResult(await apiClient.get(`/governance/state/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`))
  );

  server.registerTool(
    "memforge_recompute_governance",
    {
      title: "Recompute Governance",
      description: "Run a bounded automatic governance recompute pass for nodes, relations, or both.",
      inputSchema: {
        entityType: z.enum(["node", "relation"]).optional(),
        entityIds: z.array(z.string().min(1)).max(200).optional(),
        limit: z.number().int().min(1).max(500).default(100)
      }
    },
    createPostToolHandler(apiClient, "/governance/recompute")
  );

  registerReadOnlyTool(
    server,
    "memforge_context_bundle",
    {
      title: "Build Context Bundle",
      description: "Build a compact Memforge context bundle for coding, research, writing, or decision support.",
      inputSchema: {
        targetId: z.string().min(1),
        mode: z.enum(bundleModes).default("compact"),
        preset: z.enum(bundlePresets).default("for-assistant"),
        options: z
          .object({
            includeRelated: z.boolean().default(true),
            includeInferred: z.boolean().default(true),
            includeRecentActivities: z.boolean().default(true),
            includeDecisions: z.boolean().default(true),
            includeOpenQuestions: z.boolean().default(true),
            maxInferred: z.number().int().min(0).max(10).default(4),
            maxItems: z.number().int().min(1).max(30).default(10)
          })
          .default({
            includeRelated: true,
            includeInferred: true,
            includeRecentActivities: true,
            includeDecisions: true,
            includeOpenQuestions: true,
            maxInferred: 4,
            maxItems: 10
          })
      }
    },
    async ({ targetId, ...input }) =>
      toolResult(
        await apiClient.post("/context/bundles", {
          ...input,
          target: {
            id: targetId
          }
        })
      )
  );

  server.registerTool(
    "memforge_semantic_reindex",
    {
      title: "Queue Semantic Reindex",
      description: "Queue semantic reindexing for a bounded set of recent active workspace nodes.",
      inputSchema: {
        limit: z.number().int().min(1).max(1000).default(250)
      }
    },
    createPostToolHandler(apiClient, "/semantic/reindex")
  );

  server.registerTool(
    "memforge_semantic_reindex_node",
    {
      title: "Queue Node Semantic Reindex",
      description: "Queue semantic reindexing for a specific node id.",
      inputSchema: {
        nodeId: z.string().min(1)
      }
    },
    async ({ nodeId }) => toolResult(await apiClient.post(`/semantic/reindex/${encodeURIComponent(nodeId)}`, {}))
  );

  registerReadOnlyTool(
    server,
    "memforge_rank_candidates",
    {
      title: "Rank Candidate Nodes",
      description: "Rank a bounded set of candidate node ids for a target using Memforge request-time retrieval scoring.",
      inputSchema: {
        query: z.string().default(""),
        candidateNodeIds: z.array(z.string().min(1)).min(1).max(100),
        preset: z.enum(bundlePresets).default("for-assistant"),
        targetNodeId: z.string().optional()
      }
    },
    createPostToolHandler(apiClient, "/retrieval/rank-candidates")
  );

  return server;
}
