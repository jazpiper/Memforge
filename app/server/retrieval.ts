import type { BuildContextBundleInput } from "../shared/contracts.js";
import type { ContextBundle, SearchResultItem } from "../shared/types.js";
import type { MemforgeRepository } from "./repositories.js";

function prioritizeItems(items: SearchResultItem[], preset: BuildContextBundleInput["preset"], maxItems: number): SearchResultItem[] {
  const weighted = [...items].sort((left, right) => {
    const leftScore = scoreItem(left, preset);
    const rightScore = scoreItem(right, preset);
    return rightScore - leftScore || right.updatedAt.localeCompare(left.updatedAt);
  });

  return weighted.slice(0, maxItems);
}

function scoreItem(item: SearchResultItem, preset: BuildContextBundleInput["preset"]): number {
  let score = 0;
  if (item.canonicality === "canonical") score += 30;
  if (item.status === "active") score += 10;

  if (preset === "for-coding") {
    if (item.type === "project") score += 40;
    if (item.type === "decision") score += 25;
    if (item.type === "reference") score += 20;
  }

  if (preset === "for-research") {
    if (item.type === "reference") score += 35;
    if (item.type === "idea") score += 20;
    if (item.type === "question") score += 20;
  }

  if (preset === "for-assistant") {
    if (item.type === "project") score += 25;
    if (item.type === "note") score += 20;
    if (item.type === "question") score += 10;
  }

  return score;
}

export function buildContextBundle(
  repository: MemforgeRepository,
  input: BuildContextBundleInput
): ContextBundle {
  const target = repository.getNode(input.target.id);
  const related = input.options.includeRelated
    ? repository.listRelatedNodes(target.id).map(({ node, relation }) => ({
        nodeId: node.id,
        type: node.type,
        title: node.title,
        summary: node.summary,
        reason: `Related via ${relation.relationType}`
      }))
    : [];

  const decisions = input.options.includeDecisions
    ? repository
        .searchNodes({
          query: "",
          filters: { types: ["decision"], status: ["active", "review"] },
          limit: Math.min(input.options.maxItems, 10),
          offset: 0,
          sort: "updated_at"
        })
        .items.filter((item) => item.id === target.id || related.some((relatedItem) => relatedItem.nodeId === item.id))
    : [];

  const openQuestions = input.options.includeOpenQuestions
    ? repository
        .searchNodes({
          query: "",
          filters: { types: ["question"], status: ["active", "draft", "review"] },
          limit: Math.min(input.options.maxItems, 10),
          offset: 0,
          sort: "updated_at"
        })
        .items.filter((item) => item.id === target.id || related.some((relatedItem) => relatedItem.nodeId === item.id))
    : [];

  const targetItem: SearchResultItem = {
    id: target.id,
    type: target.type,
    title: target.title,
    summary: target.summary,
    status: target.status,
    canonicality: target.canonicality,
    sourceLabel: target.sourceLabel,
    updatedAt: target.updatedAt,
    tags: target.tags
  };
  const relatedItems: SearchResultItem[] = related.map((item) => ({
    id: item.nodeId,
    type: item.type,
    title: item.title,
    summary: item.summary,
    status: "active",
    canonicality: "canonical",
    sourceLabel: null,
    updatedAt: target.updatedAt,
    tags: []
  }));

  const baseItems = prioritizeItems(
    [targetItem, ...relatedItems, ...decisions, ...openQuestions],
    input.preset,
    input.mode === "micro" ? Math.min(input.options.maxItems, 5) : input.options.maxItems
  );

  const itemById = new Map(related.map((item) => [item.nodeId, item.reason]));

  return {
    target: {
      type: input.target.type,
      id: target.id,
      title: target.title
    },
    mode: input.mode,
    preset: input.preset,
    summary: target.summary ?? "No target summary yet.",
    items: baseItems.map((item) => ({
      nodeId: item.id,
      type: item.type,
      title: item.title,
      summary: item.summary,
      reason: itemById.get(item.id) ?? (item.id === target.id ? "Primary target" : `Included for ${input.preset}`)
    })),
    activityDigest: input.options.includeRecentActivities
      ? repository
          .listNodeActivities(target.id, input.mode === "micro" ? 3 : 6)
          .map((activity) => `${activity.activityType}: ${activity.body ?? "No details"}`)
      : [],
    decisions,
    openQuestions,
    sources: baseItems.map((item) => ({
      nodeId: item.id,
      sourceLabel: item.sourceLabel
    }))
  };
}

export function bundleAsMarkdown(bundle: ContextBundle): string {
  const sections = [
    `# ${bundle.target.title ?? bundle.target.id}`,
    "",
    `Mode: ${bundle.mode}`,
    `Preset: ${bundle.preset}`,
    "",
    "## Summary",
    bundle.summary,
    "",
    "## Items",
    ...bundle.items.map((item) => `- ${item.title ?? item.nodeId}: ${item.summary ?? "No summary"} (${item.reason})`)
  ];

  if (bundle.decisions.length) {
    sections.push("", "## Decisions", ...bundle.decisions.map((item) => `- ${item.title ?? item.id}: ${item.summary ?? "No summary"}`));
  }

  if (bundle.openQuestions.length) {
    sections.push("", "## Open Questions", ...bundle.openQuestions.map((item) => `- ${item.title ?? item.id}`));
  }

  if (bundle.activityDigest.length) {
    sections.push("", "## Recent Activities", ...bundle.activityDigest.map((item) => `- ${item}`));
  }

  return sections.join("\n");
}
