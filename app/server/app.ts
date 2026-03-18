import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import mime from "mime-types";
import {
  appendActivitySchema,
  attachArtifactSchema,
  buildContextBundleSchema,
  createNodeSchema,
  createRelationSchema,
  nodeSearchSchema,
  registerIntegrationSchema,
  reviewActionSchema,
  updateIntegrationSchema,
  updateNodeSchema,
  updateRelationSchema,
  updateSettingsSchema
} from "../shared/contracts.js";
import type { ApiEnvelope, ApiErrorEnvelope, NodeRecord } from "../shared/types.js";
import { AppError } from "./errors.js";
import {
  applyReviewDecision,
  maybeCreatePromotionCandidate,
  resolveNodeGovernance,
  resolveRelationStatus,
  shouldPromoteActivitySummary
} from "./governance.js";
import type { MemforgeRepository } from "./repositories.js";
import { buildContextBundle, bundleAsMarkdown } from "./retrieval.js";
import { createId } from "./utils.js";

function envelope<T>(requestId: string, data: T): ApiEnvelope<T> {
  return {
    ok: true,
    data,
    meta: {
      requestId,
      apiVersion: "v1"
    }
  };
}

function errorEnvelope(requestId: string, error: AppError): ApiErrorEnvelope {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details
    },
    meta: {
      requestId,
      apiVersion: "v1"
    }
  };
}

export function createMemforgeApp(params: {
  repository: MemforgeRepository;
  workspaceInfo: {
    rootPath: string;
    workspaceName: string;
    schemaVersion: number;
    bindAddress: string;
    enabledIntegrationModes: string[];
    authMode: string;
  };
  apiToken: string | null;
  workspaceRoot: string;
}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.use((request, response, next) => {
    const requestId = createId("req");
    response.locals.requestId = requestId;
    next();
  });

  app.use("/api/v1", (request, response, next) => {
    if (!params.apiToken) {
      next();
      return;
    }

    if (request.path === "/health" || request.path === "/workspace" || request.path === "/bootstrap") {
      next();
      return;
    }

    const header = request.header("authorization");
    if (!header || header !== `Bearer ${params.apiToken}`) {
      next(new AppError(401, "UNAUTHORIZED", "Missing or invalid bearer token."));
      return;
    }

    next();
  });

  app.get("/api/v1/health", (_request, response) => {
    response.json(
      envelope(response.locals.requestId, {
        status: "ok",
        workspaceLoaded: true,
        workspaceRoot: params.workspaceRoot,
        schemaVersion: params.workspaceInfo.schemaVersion
      })
    );
  });

  app.get("/api/v1/workspace", (_request, response) => {
    response.json(envelope(response.locals.requestId, params.workspaceInfo));
  });

  app.get("/api/v1/bootstrap", (_request, response) => {
    response.json(
      envelope(response.locals.requestId, {
        workspace: params.workspaceInfo,
        authMode: params.workspaceInfo.authMode
      })
    );
  });

  app.post("/api/v1/nodes/search", (request, response) => {
    const input = nodeSearchSchema.parse(request.body ?? {});
    response.json(envelope(response.locals.requestId, params.repository.searchNodes(input)));
  });

  app.get("/api/v1/nodes/:id", (request, response) => {
    const node = params.repository.getNode(request.params.id);
    response.json(
      envelope(response.locals.requestId, {
        node,
        related: params.repository.listRelatedNodes(node.id),
        activities: params.repository.listNodeActivities(node.id, 10),
        artifacts: params.repository.listArtifacts(node.id),
        provenance: params.repository.listProvenance("node", node.id)
      })
    );
  });

  app.post("/api/v1/nodes", (request, response) => {
    const input = createNodeSchema.parse(request.body ?? {});
    const governance = resolveNodeGovernance(input);
    const node = params.repository.createNode({
      ...input,
      resolvedCanonicality: governance.canonicality,
      resolvedStatus: governance.status
    });
    params.repository.recordProvenance({
      entityType: "node",
      entityId: node.id,
      operationType: "create",
      source: input.source,
      metadata: {
        reason: governance.reason
      }
    });
    let reviewItem = null;
    if (governance.createReview) {
      reviewItem = params.repository.createReviewItem({
        entityType: "node",
        entityId: node.id,
        reviewType: governance.reviewType ?? "node_promotion",
        proposedBy: input.source.actorLabel,
        notes: governance.reason,
        metadata: {
          nodeType: node.type
        }
      });
    }
    response.status(201).json(envelope(response.locals.requestId, { node, reviewItem }));
  });

  app.patch("/api/v1/nodes/:id", (request, response) => {
    const input = updateNodeSchema.parse(request.body ?? {});
    const node = params.repository.updateNode(request.params.id, input);
    response.json(envelope(response.locals.requestId, { node }));
  });

  app.post("/api/v1/nodes/:id/archive", (request, response) => {
    const body = reviewActionSchema.pick({ source: true }).parse(request.body ?? {});
    const node = params.repository.archiveNode(request.params.id);
    params.repository.recordProvenance({
      entityType: "node",
      entityId: node.id,
      operationType: "archive",
      source: body.source
    });
    response.json(envelope(response.locals.requestId, { node }));
  });

  app.get("/api/v1/nodes/:id/related", (request, response) => {
    const depth = Number(request.query.depth ?? 1);
    const types = typeof request.query.types === "string" ? request.query.types.split(",") : undefined;
    const items = params.repository.listRelatedNodes(request.params.id, depth, types);
    response.json(envelope(response.locals.requestId, { items }));
  });

  app.post("/api/v1/relations", (request, response) => {
    const input = createRelationSchema.parse(request.body ?? {});
    const governance = resolveRelationStatus(input);
    const relation = params.repository.createRelation({
      ...input,
      resolvedStatus: governance.status
    });
    params.repository.recordProvenance({
      entityType: "relation",
      entityId: relation.id,
      operationType: "create",
      source: input.source
    });
    let reviewItem = null;
    if (governance.createReview) {
      reviewItem = params.repository.createReviewItem({
        entityType: "relation",
        entityId: relation.id,
        reviewType: "relation_suggestion",
        proposedBy: input.source.actorLabel,
        notes: "Agent-created relations stay suggested until approved."
      });
    }
    response.status(201).json(envelope(response.locals.requestId, { relation, reviewItem }));
  });

  app.patch("/api/v1/relations/:id", (request, response) => {
    const input = updateRelationSchema.parse(request.body ?? {});
    const relation = params.repository.updateRelationStatus(request.params.id, input.status);
    params.repository.recordProvenance({
      entityType: "relation",
      entityId: relation.id,
      operationType: input.status === "active" ? "approve" : input.status,
      source: input.source,
      metadata: input.metadata
    });
    response.json(envelope(response.locals.requestId, { relation }));
  });

  app.get("/api/v1/nodes/:id/activities", (request, response) => {
    const limit = Number(request.query.limit ?? 20);
    response.json(
      envelope(response.locals.requestId, {
        items: params.repository.listNodeActivities(request.params.id, limit)
      })
    );
  });

  app.post("/api/v1/activities", (request, response) => {
    const input = appendActivitySchema.parse(request.body ?? {});
    const promotion = shouldPromoteActivitySummary(input) ? maybeCreatePromotionCandidate(params.repository, input) : {};
    const activity = params.repository.appendActivity(
      promotion.suggestedNodeId
        ? {
            ...input,
            body: `Durable agent summary promoted to suggested node ${promotion.suggestedNodeId} for review.`,
            metadata: {
              ...input.metadata,
              promotedToSuggested: true,
              promotedNodeId: promotion.suggestedNodeId,
              rawBodyStoredInActivity: false
            }
          }
        : input
    );
    params.repository.recordProvenance({
      entityType: "activity",
      entityId: activity.id,
      operationType: "append",
      source: input.source,
      metadata: {
        promotedToSuggested: Boolean(promotion.suggestedNodeId)
      }
    });
    response.status(201).json(
      envelope(response.locals.requestId, {
        activity,
        promotion
      })
    );
  });

  app.post("/api/v1/artifacts", (request, response) => {
    const input = attachArtifactSchema.parse(request.body ?? {});
    const artifact = params.repository.attachArtifact({
      ...input,
      metadata: input.metadata
    });
    params.repository.recordProvenance({
      entityType: "artifact",
      entityId: artifact.id,
      operationType: "attach",
      source: input.source
    });
    response.status(201).json(envelope(response.locals.requestId, { artifact }));
  });

  app.get("/api/v1/nodes/:id/artifacts", (request, response) => {
    response.json(
      envelope(response.locals.requestId, {
        items: params.repository.listArtifacts(request.params.id)
      })
    );
  });

  app.post("/api/v1/retrieval/node-summaries", (request, response) => {
    const nodeIds = Array.isArray(request.body?.nodeIds) ? request.body.nodeIds : [];
    const nodes: NodeRecord[] = nodeIds.map((nodeId: string) => params.repository.getNode(nodeId));
    const items = nodes.map((node) => ({
      id: node.id,
      title: node.title,
      summary: node.summary,
      type: node.type,
      updatedAt: node.updatedAt
    }));
    response.json(envelope(response.locals.requestId, { items }));
  });

  app.get("/api/v1/retrieval/activity-digest/:targetId", (request, response) => {
    const items = params.repository
      .listNodeActivities(request.params.targetId, 5)
      .map((activity) => `${activity.activityType}: ${activity.body ?? "No details"}`);
    response.json(envelope(response.locals.requestId, { items }));
  });

  app.get("/api/v1/retrieval/decisions/:targetId", (request, response) => {
    const target = params.repository.getNode(request.params.targetId);
    const related = params.repository.listRelatedNodes(target.id).map((item) => item.node.id);
    const items = params.repository
      .searchNodes({
        query: "",
        filters: { types: ["decision"], status: ["active", "review"] },
        limit: 20,
        offset: 0,
        sort: "updated_at"
      })
      .items.filter((item) => item.id === target.id || related.includes(item.id));
    response.json(envelope(response.locals.requestId, { items }));
  });

  app.get("/api/v1/retrieval/open-questions/:targetId", (request, response) => {
    const target = params.repository.getNode(request.params.targetId);
    const related = params.repository.listRelatedNodes(target.id).map((item) => item.node.id);
    const items = params.repository
      .searchNodes({
        query: "",
        filters: { types: ["question"], status: ["active", "draft", "review"] },
        limit: 20,
        offset: 0,
        sort: "updated_at"
      })
      .items.filter((item) => item.id === target.id || related.includes(item.id));
    response.json(envelope(response.locals.requestId, { items }));
  });

  app.post("/api/v1/retrieval/rank-candidates", (request, response) => {
    const query = typeof request.body?.query === "string" ? request.body.query : "";
    const candidateNodeIds: string[] = Array.isArray(request.body?.candidateNodeIds) ? request.body.candidateNodeIds : [];
    const preset = typeof request.body?.preset === "string" ? request.body.preset : "for-assistant";
    const ranked = candidateNodeIds
      .map((id: string) => params.repository.getNode(id))
      .map((node) => ({
        nodeId: node.id,
        score:
          (node.title?.toLowerCase().includes(query.toLowerCase()) ? 50 : 0) +
          (node.summary?.toLowerCase().includes(query.toLowerCase()) ? 20 : 0) +
          (preset === "for-coding" && node.type === "decision" ? 15 : 0) +
          (node.canonicality === "canonical" ? 10 : 0),
        title: node.title
      }))
      .sort((left: { score: number }, right: { score: number }) => right.score - left.score);
    response.json(envelope(response.locals.requestId, { items: ranked }));
  });

  app.post("/api/v1/context/bundles", (request, response) => {
    const input = buildContextBundleSchema.parse(request.body ?? {});
    const bundle = buildContextBundle(params.repository, input);
    response.json(envelope(response.locals.requestId, { bundle }));
  });

  app.post("/api/v1/context/bundles/preview", (request, response) => {
    const input = buildContextBundleSchema.parse(request.body ?? {});
    const bundle = buildContextBundle(params.repository, input);
    response.json(
      envelope(response.locals.requestId, {
        bundle,
        preview: bundleAsMarkdown(bundle)
      })
    );
  });

  app.post("/api/v1/context/bundles/export", (request, response) => {
    const input = buildContextBundleSchema.parse(request.body ?? {});
    const format = request.body?.format === "json" ? "json" : request.body?.format === "text" ? "text" : "markdown";
    const bundle = buildContextBundle(params.repository, input);
    const output =
      format === "json"
        ? JSON.stringify(bundle, null, 2)
        : format === "text"
          ? bundle.items.map((item) => `${item.title ?? item.nodeId}: ${item.summary ?? "No summary"}`).join("\n")
          : bundleAsMarkdown(bundle);
    response.json(envelope(response.locals.requestId, { format, output, bundle }));
  });

  app.get("/api/v1/review-queue", (request, response) => {
    const status = typeof request.query.status === "string" ? request.query.status : "pending";
    const limit = Number(request.query.limit ?? 20);
    const reviewType = typeof request.query.review_type === "string" ? request.query.review_type : undefined;
    response.json(
      envelope(response.locals.requestId, {
        items: params.repository.listReviewItems(status, limit, reviewType)
      })
    );
  });

  app.get("/api/v1/review-queue/:id", (request, response) => {
    const review = params.repository.getReviewItem(request.params.id);
    let entity: unknown = null;
    if (review.entityType === "node") {
      entity = params.repository.getNode(review.entityId);
    } else if (review.entityType === "relation") {
      entity = params.repository.getRelation(review.entityId);
    }
    response.json(envelope(response.locals.requestId, { review, entity }));
  });

  app.post("/api/v1/review-queue/:id/approve", (request, response) => {
    const input = reviewActionSchema.parse(request.body ?? {});
    response.json(envelope(response.locals.requestId, applyReviewDecision(params.repository, request.params.id, "approve", input)));
  });

  app.post("/api/v1/review-queue/:id/reject", (request, response) => {
    const input = reviewActionSchema.parse(request.body ?? {});
    response.json(envelope(response.locals.requestId, applyReviewDecision(params.repository, request.params.id, "reject", input)));
  });

  app.post("/api/v1/review-queue/:id/edit-and-approve", (request, response) => {
    const input = reviewActionSchema.parse(request.body ?? {});
    response.json(
      envelope(response.locals.requestId, applyReviewDecision(params.repository, request.params.id, "edit-and-approve", input))
    );
  });

  app.get("/api/v1/integrations", (_request, response) => {
    response.json(envelope(response.locals.requestId, { items: params.repository.listIntegrations() }));
  });

  app.post("/api/v1/integrations", (request, response) => {
    const input = registerIntegrationSchema.parse(request.body ?? {});
    const integration = params.repository.registerIntegration(input);
    response.status(201).json(envelope(response.locals.requestId, { integration }));
  });

  app.patch("/api/v1/integrations/:id", (request, response) => {
    const input = updateIntegrationSchema.parse(request.body ?? {});
    const integration = params.repository.updateIntegration(request.params.id, input);
    response.json(envelope(response.locals.requestId, { integration }));
  });

  app.get("/api/v1/settings", (request, response) => {
    const keys =
      typeof request.query.keys === "string"
        ? request.query.keys
            .split(",")
            .map((key) => key.trim())
            .filter(Boolean)
        : undefined;
    response.json(envelope(response.locals.requestId, { values: params.repository.getSettings(keys) }));
  });

  app.patch("/api/v1/settings", (request, response) => {
    const input = updateSettingsSchema.parse(request.body ?? {});
    for (const [key, value] of Object.entries(input.values)) {
      params.repository.setSetting(key, value);
    }
    response.json(envelope(response.locals.requestId, { values: params.repository.getSettings(Object.keys(input.values)) }));
  });

  app.use("/artifacts", (request, response, next) => {
    const artifactPath = path.resolve(params.workspaceRoot, request.path.replace(/^\//, ""));
    if (!artifactPath.startsWith(path.resolve(params.workspaceRoot))) {
      next(new AppError(403, "FORBIDDEN", "Artifact path escapes workspace root."));
      return;
    }
    if (!existsSync(artifactPath)) {
      next(new AppError(404, "NOT_FOUND", "Artifact not found."));
      return;
    }
    response.type(mime.lookup(artifactPath) || "application/octet-stream");
    response.sendFile(artifactPath);
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      response.status(error.statusCode).json(errorEnvelope(response.locals.requestId, error));
      return;
    }

    if (error instanceof Error && "issues" in error) {
      response
        .status(400)
        .json(errorEnvelope(response.locals.requestId, new AppError(400, "INVALID_INPUT", "Invalid input.", error)));
      return;
    }

    const unexpected = new AppError(500, "INTERNAL_ERROR", "Unexpected internal error.");
    response.status(unexpected.statusCode).json(errorEnvelope(response.locals.requestId, unexpected));
  });

  return app;
}
