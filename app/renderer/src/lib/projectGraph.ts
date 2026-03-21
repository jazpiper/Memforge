import type { ProjectGraphEdge, ProjectGraphPayload, RelationType } from './types.js';

export type ProjectGraphSourceFilters = {
  canonical: boolean;
  inferred: boolean;
};

export type ProjectGraphView = {
  nodes: ProjectGraphPayload['nodes'];
  edges: ProjectGraphPayload['edges'];
  emphasizedNodeIds: string[];
  emphasizedEdgeIds: string[];
  activeAt: string | null;
};

export type FilteredProjectGraphView = Pick<ProjectGraphView, 'nodes' | 'edges'>;
export type ProjectGraphEmphasis = Pick<ProjectGraphView, 'emphasizedNodeIds' | 'emphasizedEdgeIds' | 'activeAt'>;

export function listProjectGraphRelationTypes(graph: ProjectGraphPayload | null): RelationType[] {
  if (!graph) {
    return [];
  }

  return Array.from(new Set(graph.edges.map((edge: ProjectGraphEdge) => edge.relationType))).sort((left: RelationType, right: RelationType) =>
    left.localeCompare(right),
  );
}

export function buildProjectGraphView(
  graph: ProjectGraphPayload | null,
  filters: {
    relationTypes: RelationType[];
    sources: ProjectGraphSourceFilters;
    timelineIndex: number;
  }
): ProjectGraphView {
  if (!graph) {
    return {
      nodes: [],
      edges: [],
      emphasizedNodeIds: [],
      emphasizedEdgeIds: [],
      activeAt: null,
    };
  }

  const visible = filterProjectGraphView(graph, {
    relationTypes: filters.relationTypes,
    sources: filters.sources,
  });
  const emphasis = buildProjectGraphEmphasis(graph, visible, filters.timelineIndex);

  return {
    ...visible,
    ...emphasis,
  };
}

export function filterProjectGraphView(
  graph: ProjectGraphPayload | null,
  filters: {
    relationTypes: RelationType[];
    sources: ProjectGraphSourceFilters;
  }
): FilteredProjectGraphView {
  if (!graph) {
    return {
      nodes: [],
      edges: [],
    };
  }

  const allowedRelationTypes = new Set(filters.relationTypes);
  const visibleEdges = graph.edges.filter((edge: ProjectGraphEdge) => {
    if (!allowedRelationTypes.has(edge.relationType)) {
      return false;
    }

    if (edge.relationSource === 'canonical' && !filters.sources.canonical) {
      return false;
    }

    if (edge.relationSource === 'inferred' && !filters.sources.inferred) {
      return false;
    }

    return true;
  });
  const visibleNodeIds = new Set<string>(graph.nodes.filter((node: ProjectGraphPayload['nodes'][number]) => node.isFocus).map((node: ProjectGraphPayload['nodes'][number]) => node.id));
  for (const edge of visibleEdges) {
    visibleNodeIds.add(edge.source);
    visibleNodeIds.add(edge.target);
  }

  const nodes = graph.nodes.filter((node: ProjectGraphPayload['nodes'][number]) => visibleNodeIds.has(node.id));

  return {
    nodes,
    edges: visibleEdges,
  };
}

export function buildProjectGraphEmphasis(
  graph: ProjectGraphPayload | null,
  visible: FilteredProjectGraphView,
  timelineIndex: number,
): ProjectGraphEmphasis {
  if (!graph) {
    return {
      emphasizedNodeIds: [],
      emphasizedEdgeIds: [],
      activeAt: null,
    };
  }

  const nodes = visible.nodes;
  const visibleEdges = visible.edges;
  const activeEvent = graph.timeline[Math.min(Math.max(timelineIndex, 0), Math.max(graph.timeline.length - 1, 0))];
  const activeAt = activeEvent?.at ?? null;
  const emphasizedNodeIds = activeAt
    ? nodes.filter((node: ProjectGraphPayload['nodes'][number]) => node.createdAt <= activeAt).map((node: ProjectGraphPayload['nodes'][number]) => node.id)
    : nodes.map((node: ProjectGraphPayload['nodes'][number]) => node.id);
  const emphasizedEdgeIds = activeAt
    ? visibleEdges.filter((edge: ProjectGraphEdge) => edge.createdAt <= activeAt).map((edge: ProjectGraphEdge) => edge.id)
    : visibleEdges.map((edge: ProjectGraphEdge) => edge.id);

  return {
    emphasizedNodeIds,
    emphasizedEdgeIds,
    activeAt,
  };
}

export function projectGraphEdgeTone(edge: Pick<ProjectGraphEdge, 'relationSource' | 'relationType'>) {
  if (edge.relationSource === 'inferred') {
    return '#7c8aa5';
  }

  switch (edge.relationType) {
    case 'supports':
      return '#0f766e';
    case 'depends_on':
      return '#9a3412';
    case 'contradicts':
      return '#b91c1c';
    case 'elaborates':
      return '#1d4ed8';
    case 'derived_from':
      return '#6d28d9';
    case 'produced_by':
      return '#92400e';
    case 'relevant_to':
      return '#2563eb';
    default:
      return '#475569';
  }
}
