// Contrato de EXTENSIONES DE ANÁLISIS del núcleo CAD.
//
// El kernel CAD ofrece comandos cuya analítica pertenece a ingeniería
// industrial (flujo de línea, balanceo, ruta de material). El algoritmo NO
// vive aquí: el host lo inyecta con `registerCadAnalysisExtensions` (hoy lo
// hace el workbench de line-engineering; una edición Design sin el paquete
// industrial simplemente no registra nada y los comandos degradan con un
// aviso). Los TIPOS sí viven aquí porque son el contrato entre ambos lados.

export interface CadFlowNode {
  id: string;
  label?: string;
  x: number;
  y: number;
}

export interface CadFlowSegment {
  from: CadFlowNode;
  to: CadFlowNode;
  distance: number;
}

export interface CadFlowScoreSummary {
  totalDistance: number;
  crossingCount: number;
  backtrackingCount: number;
  score: number;
}

export interface CadFlowReorderMove {
  id: string;
  label?: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface CadFlowReorderPreview {
  axis: "x" | "y";
  before: CadFlowScoreSummary;
  after: CadFlowScoreSummary;
  deltas: {
    score: number;
    totalDistance: number;
    crossingCount: number;
    backtrackingCount: number;
  };
  moves: CadFlowReorderMove[];
  improves: boolean;
}

export interface CadFlowScore extends CadFlowScoreSummary {
  suggestions: string[];
  reorderPreview?: CadFlowReorderPreview;
}

export interface CadLineBalanceStation {
  id: string;
  label: string;
  cycleTimeSec?: number;
}

export interface CadLineBalanceStationResult extends CadLineBalanceStation {
  cycleTimeSec?: number;
  loadPercent?: number;
  slackSec?: number;
  overTakt: boolean;
  missingCycleTime: boolean;
}

export interface CadLineBalanceReport {
  stationCount: number;
  measuredStationCount: number;
  missingStationIds: string[];
  taktTimeSec?: number;
  effectiveTaktSec?: number;
  bottleneck?: CadLineBalanceStationResult;
  totalCycleTimeSec: number;
  averageCycleTimeSec?: number;
  maxLoadPercent?: number;
  overloadedStationIds: string[];
  balanceEfficiencyPercent?: number;
  balanceScore: number;
  stations: CadLineBalanceStationResult[];
  recommendations: string[];
}

export interface CadLineBalanceInput {
  stations: CadLineBalanceStation[];
  taktTimeSec?: number;
}

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

export interface CadMaterialRouteInput {
  nodes: CadFlowNode[];
  connectors?: CadMaterialRouteConnector[];
  selectedIds?: string[];
}

/** Analítica industrial que el host puede inyectar al kernel CAD. */
export interface CadAnalysisExtensions {
  scoreFlowLayout(nodes: CadFlowNode[]): CadFlowScore;
  buildLineBalanceReport(input: CadLineBalanceInput): CadLineBalanceReport;
  buildMaterialRouteReport(input: CadMaterialRouteInput): CadMaterialRouteReport;
}

let registered: CadAnalysisExtensions | undefined;

/** Registra (o retira, con undefined) la analítica industrial del host. */
export function registerCadAnalysisExtensions(
  extensions: CadAnalysisExtensions | undefined,
): void {
  registered = extensions;
}

/** Analítica registrada, o undefined si esta edición no la trae. */
export function getCadAnalysisExtensions(): CadAnalysisExtensions | undefined {
  return registered;
}
