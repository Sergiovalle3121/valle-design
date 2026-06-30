import {
  scoreFlowLayout,
  type CadFlowNode,
  type CadFlowScore,
} from "./flow-optimization";

export interface CadMaterialRouteConnector {
  from: string;
  to: string;
  kind?: string;
}

export interface CadMaterialRouteLeg {
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  distance: number;
}

export interface CadMaterialRouteReport {
  nodeCount: number;
  legCount: number;
  connectorCount: number;
  totalDistance: number;
  routeNodeIds: string[];
  legs: CadMaterialRouteLeg[];
  missingConnectorRefs: string[];
  longestLeg?: CadMaterialRouteLeg;
  flow: CadFlowScore;
  warnings: string[];
}

function distance(a: CadFlowNode, b: CadFlowNode): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function connectorIsRouteLike(connector: CadMaterialRouteConnector): boolean {
  const kind = (connector.kind ?? "flow").toLowerCase();
  return (
    kind === "flow" ||
    kind === "material" ||
    kind === "route" ||
    kind === "connector"
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function routeOrderFromConnectors(
  connectors: CadMaterialRouteConnector[],
): string[] {
  if (!connectors.length) return [];

  const outbound = new Map<string, string[]>();
  const inbound = new Map<string, number>();
  const ids = new Set<string>();

  for (const connector of connectors) {
    ids.add(connector.from);
    ids.add(connector.to);
    outbound.set(connector.from, [
      ...(outbound.get(connector.from) ?? []),
      connector.to,
    ]);
    inbound.set(connector.to, (inbound.get(connector.to) ?? 0) + 1);
    inbound.set(connector.from, inbound.get(connector.from) ?? 0);
  }

  const firstStart =
    [...ids].find((id) => (inbound.get(id) ?? 0) === 0) ?? connectors[0].from;
  const order: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = firstStart;

  while (current && !visited.has(current)) {
    order.push(current);
    visited.add(current);
    current = (outbound.get(current) ?? []).find((id) => !visited.has(id));
  }

  for (const connector of connectors) {
    if (!visited.has(connector.from)) {
      order.push(connector.from);
      visited.add(connector.from);
    }
    if (!visited.has(connector.to)) {
      order.push(connector.to);
      visited.add(connector.to);
    }
  }

  return order;
}

function orderedNodes(input: {
  nodes: CadFlowNode[];
  connectors?: CadMaterialRouteConnector[];
  selectedIds?: string[];
}): {
  nodes: CadFlowNode[];
  connectorCount: number;
  missingConnectorRefs: string[];
  usedConnectorRoute: boolean;
} {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const selected = input.selectedIds?.length ? new Set(input.selectedIds) : null;
  const scopedNodes = selected
    ? input.nodes.filter((node) => selected.has(node.id))
    : input.nodes;
  const scopedIds = new Set(scopedNodes.map((node) => node.id));
  const routeConnectors = (input.connectors ?? []).filter((connector) => {
    if (!connectorIsRouteLike(connector)) return false;
    if (!selected) return true;
    return scopedIds.has(connector.from) && scopedIds.has(connector.to);
  });
  const missingConnectorRefs = unique(
    routeConnectors
      .flatMap((connector) => [connector.from, connector.to])
      .filter((id) => !nodeById.has(id)),
  );
  const validConnectors = routeConnectors.filter(
    (connector) => nodeById.has(connector.from) && nodeById.has(connector.to),
  );
  const connectorOrder = routeOrderFromConnectors(validConnectors)
    .map((id) => nodeById.get(id))
    .filter((node): node is CadFlowNode => !!node);

  if (connectorOrder.length >= 2) {
    return {
      nodes: connectorOrder,
      connectorCount: validConnectors.length,
      missingConnectorRefs,
      usedConnectorRoute: true,
    };
  }

  return {
    nodes: scopedNodes.length ? scopedNodes : input.nodes,
    connectorCount: validConnectors.length,
    missingConnectorRefs,
    usedConnectorRoute: false,
  };
}

export function buildCadMaterialRouteReport(input: {
  nodes: CadFlowNode[];
  connectors?: CadMaterialRouteConnector[];
  selectedIds?: string[];
}): CadMaterialRouteReport {
  const ordered = orderedNodes(input);
  const legs: CadMaterialRouteLeg[] = [];

  for (let index = 0; index < ordered.nodes.length - 1; index += 1) {
    const from = ordered.nodes[index];
    const to = ordered.nodes[index + 1];
    legs.push({
      fromId: from.id,
      toId: to.id,
      fromLabel: from.label ?? from.id,
      toLabel: to.label ?? to.id,
      distance: distance(from, to),
    });
  }

  const totalDistance = legs.reduce((sum, leg) => sum + leg.distance, 0);
  const longestLeg = legs.reduce<CadMaterialRouteLeg | undefined>(
    (current, leg) =>
      !current || leg.distance > current.distance ? leg : current,
    undefined,
  );
  const flow = scoreFlowLayout(ordered.nodes);
  const warnings: string[] = [];

  if (!ordered.usedConnectorRoute)
    warnings.push("No flow/material connectors found; using object sequence.");
  if (ordered.missingConnectorRefs.length)
    warnings.push(
      `${ordered.missingConnectorRefs.length} connector endpoint(s) are missing from the current layout.`,
    );
  if (flow.crossingCount)
    warnings.push(`${flow.crossingCount} route crossing(s) detected.`);
  if (flow.backtrackingCount)
    warnings.push(`${flow.backtrackingCount} backtracking segment(s) detected.`);
  if (totalDistance > 25000)
    warnings.push("Material route distance is high for a compact factory cell.");

  return {
    nodeCount: ordered.nodes.length,
    legCount: legs.length,
    connectorCount: ordered.connectorCount,
    totalDistance,
    routeNodeIds: ordered.nodes.map((node) => node.id),
    legs,
    missingConnectorRefs: ordered.missingConnectorRefs,
    longestLeg,
    flow,
    warnings,
  };
}
