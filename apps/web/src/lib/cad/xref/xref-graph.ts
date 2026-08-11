/**
 * El grafo de referencias externas, y sus ciclos.
 *
 * Vive en su propio módulo HOJA porque lo necesitan los dos lados: el
 * constructor de lotes (`xref-workflow.ts`) para negarse ANTES de escribir, y
 * el camino de compatibilidad (`cad-xrefs.ts`) para su API de siempre.
 * Dejándolo en cualquiera de los dos, el otro cerraría un ciclo de importación
 * —que `tsc --noEmit` no ve y que revienta al cargar.
 *
 * ## Por qué el ciclo se busca antes y no durante
 *
 * Resolver un xref cíclico no da un error: se cuelga. Y quien resuelve es el
 * render, en el hilo de la interfaz. Un editor colgado no se puede ni cerrar
 * bien, así que la comprobación es una precondición, no una excepción.
 */
import type { CadDocument } from "../cad-document";

export const CAD_XREF_MAX_DEPTH = 8;

export interface CadXrefGraphIssue {
  code: "cycle" | "depth_exceeded" | "missing_asset_id";
  severity: "error" | "warning";
  path: string[];
  detail: string;
}

export interface CadXrefGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string; mode: "attachment" | "overlay" }>;
  issues: CadXrefGraphIssue[];
  maxDepth: number;
}

export function analyzeCadXrefGraph(
  document: Pick<CadDocument, "externalReferences">,
  hostAssetId = "host",
  maxDepth = CAD_XREF_MAX_DEPTH,
): CadXrefGraph {
  const edges: CadXrefGraph["edges"] = [];
  const adjacency = new Map<string, string[]>();
  const addEdge = (from: string, to: string, mode: "attachment" | "overlay") => {
    edges.push({ from, to, mode });
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  };
  const issues: CadXrefGraphIssue[] = [];
  document.externalReferences.forEach((reference) => {
    const assetId = reference.assetId?.trim();
    if (!assetId) {
      issues.push({
        code: "missing_asset_id",
        severity: "warning",
        path: [reference.id],
        detail: `${reference.name} has no tenant asset id.`,
      });
      return;
    }
    addEdge(hostAssetId, assetId, reference.mode ?? "attachment");
    (reference.dependencyAssetIds ?? []).forEach((dependency) =>
      addEdge(assetId, dependency, reference.mode ?? "attachment"),
    );
    (reference.dependencyEdges ?? []).forEach((edge) => addEdge(edge.from, edge.to, edge.mode));
  });
  let observedDepth = 0;
  const visit = (node: string, path: string[]) => {
    observedDepth = Math.max(observedDepth, path.length - 1);
    if (path.length - 1 > maxDepth) {
      issues.push({
        code: "depth_exceeded",
        severity: "error",
        path,
        detail: `Xref depth exceeds ${maxDepth}: ${path.join(" -> ")}`,
      });
      return;
    }
    for (const next of adjacency.get(node) ?? []) {
      const cycleAt = path.indexOf(next);
      if (cycleAt >= 0) {
        const cycle = [...path.slice(cycleAt), next];
        if (!issues.some((issue) => issue.code === "cycle" && issue.path.join("|") === cycle.join("|")))
          issues.push({
            code: "cycle",
            severity: "error",
            path: cycle,
            detail: `Xref cycle: ${cycle.join(" -> ")}`,
          });
        continue;
      }
      visit(next, [...path, next]);
    }
  };
  visit(hostAssetId, [hostAssetId]);
  return {
    nodes: [...new Set([hostAssetId, ...edges.flatMap((edge) => [edge.from, edge.to])])].sort(),
    edges,
    issues,
    maxDepth: observedDepth,
  };
}
