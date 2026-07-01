export interface CadLineBalanceMetricStationInput {
  id: string;
  label?: string;
  workloadSec: number;
}

export interface CadLineBalanceStationMetric {
  id: string;
  label: string;
  workloadSec: number;
  idleSec: number;
  utilizationPercent: number;
  workloadDeltaFromAverageSec: number;
  workloadDeltaFromCycleSec: number;
  rank: number;
  isBottleneck: boolean;
  isOverCycle: boolean;
}

export interface CadLineBalanceMetricRecommendation {
  code:
    | "reduce_bottleneck"
    | "redistribute_idle_time"
    | "add_capacity_or_split_work"
    | "protect_balanced_line"
    | "invalid_input";
  severity: "info" | "warning" | "critical";
  message: string;
  stationIds: string[];
}

export interface CadLineBalanceMetricsReport {
  stationCount: number;
  cycleTimeSec: number;
  totalWorkSec: number;
  totalIdleSec: number;
  averageWorkloadSec: number;
  bottleneckWorkloadSec: number;
  bottleneckStationIds: string[];
  overCycleStationIds: string[];
  lineEfficiencyPercent: number;
  balanceDelayPercent: number;
  smoothnessIndexSec: number;
  workloadRangeSec: number;
  averageUtilizationPercent: number;
  coefficientOfVariationPercent: number;
  stations: CadLineBalanceStationMetric[];
  recommendations: CadLineBalanceMetricRecommendation[];
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function stationName(station: CadLineBalanceMetricStationInput): string {
  return station.label?.trim() || station.id;
}

function buildInvalidReport(
  stations: CadLineBalanceMetricStationInput[],
  cycleTimeSec: number,
  message: string,
): CadLineBalanceMetricsReport {
  return {
    stationCount: stations.length,
    cycleTimeSec: validPositive(cycleTimeSec) ? cycleTimeSec : 0,
    totalWorkSec: 0,
    totalIdleSec: 0,
    averageWorkloadSec: 0,
    bottleneckWorkloadSec: 0,
    bottleneckStationIds: [],
    overCycleStationIds: [],
    lineEfficiencyPercent: 0,
    balanceDelayPercent: 0,
    smoothnessIndexSec: 0,
    workloadRangeSec: 0,
    averageUtilizationPercent: 0,
    coefficientOfVariationPercent: 0,
    stations: [],
    recommendations: [
      {
        code: "invalid_input",
        severity: "critical",
        message,
        stationIds: stations.map((station) => station.id),
      },
    ],
  };
}

function standardDeviation(values: number[], mean: number): number {
  if (!values.length) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function rankStationsByWorkload(
  stations: CadLineBalanceMetricStationInput[],
): Map<string, number> {
  return new Map(
    [...stations]
      .sort((a, b) => b.workloadSec - a.workloadSec || a.id.localeCompare(b.id))
      .map((station, index) => [station.id, index + 1]),
  );
}

function buildRecommendations(input: {
  stations: CadLineBalanceStationMetric[];
  bottleneckStationIds: string[];
  overCycleStationIds: string[];
  balanceDelayPercent: number;
  smoothnessIndexSec: number;
  workloadRangeSec: number;
  cycleTimeSec: number;
}): CadLineBalanceMetricRecommendation[] {
  const recommendations: CadLineBalanceMetricRecommendation[] = [];

  if (input.overCycleStationIds.length) {
    recommendations.push({
      code: "add_capacity_or_split_work",
      severity: "critical",
      message: `${input.overCycleStationIds.length} station(s) exceed cycle/takt; split work, add parallel capacity, or move tasks before releasing the line design.`,
      stationIds: input.overCycleStationIds,
    });
  }

  if (input.smoothnessIndexSec > input.cycleTimeSec * 0.25) {
    recommendations.push({
      code: "reduce_bottleneck",
      severity: input.overCycleStationIds.length ? "critical" : "warning",
      message: `Smoothness index is ${round(input.smoothnessIndexSec)}s; reduce bottleneck work content or move tasks toward underloaded stations.`,
      stationIds: input.bottleneckStationIds,
    });
  }

  const underloaded = input.stations
    .filter((station) => station.utilizationPercent < 70)
    .map((station) => station.id);
  if (underloaded.length && input.balanceDelayPercent > 15) {
    recommendations.push({
      code: "redistribute_idle_time",
      severity: "warning",
      message: `${underloaded.length} station(s) are below 70% utilization while balance delay is ${round(input.balanceDelayPercent)}%; move eligible work from high-load stations into this idle capacity.`,
      stationIds: underloaded,
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      code: "protect_balanced_line",
      severity: "info",
      message: "Line balance is stable; protect the current standard work split and monitor cycle-time drift.",
      stationIds: input.bottleneckStationIds,
    });
  }

  return recommendations;
}

export function buildCadLineBalanceMetrics(input: {
  stations: CadLineBalanceMetricStationInput[];
  cycleTimeSec?: number;
}): CadLineBalanceMetricsReport {
  const validStations = input.stations.filter((station) =>
    validPositive(station.workloadSec),
  );
  const cycleTimeSec = input.cycleTimeSec ?? Math.max(
    0,
    ...validStations.map((station) => station.workloadSec),
  );

  if (!validStations.length) {
    return buildInvalidReport(input.stations, cycleTimeSec, "At least one station workload is required.");
  }
  if (!validPositive(cycleTimeSec)) {
    return buildInvalidReport(input.stations, cycleTimeSec, "Cycle time must be greater than zero.");
  }

  const workloads = validStations.map((station) => station.workloadSec);
  const totalWorkSec = round(workloads.reduce((sum, workload) => sum + workload, 0));
  const stationCount = validStations.length;
  const averageWorkloadSec = totalWorkSec / stationCount;
  const bottleneckWorkloadSec = Math.max(...workloads);
  const minWorkloadSec = Math.min(...workloads);
  const ranks = rankStationsByWorkload(validStations);
  const bottleneckStationIds = validStations
    .filter((station) => station.workloadSec === bottleneckWorkloadSec)
    .map((station) => station.id)
    .sort();
  const overCycleStationIds = validStations
    .filter((station) => station.workloadSec > cycleTimeSec)
    .map((station) => station.id)
    .sort();

  const stations = validStations.map<CadLineBalanceStationMetric>((station) => ({
    id: station.id,
    label: stationName(station),
    workloadSec: round(station.workloadSec),
    idleSec: round(cycleTimeSec - station.workloadSec),
    utilizationPercent: round((station.workloadSec / cycleTimeSec) * 100),
    workloadDeltaFromAverageSec: round(station.workloadSec - averageWorkloadSec),
    workloadDeltaFromCycleSec: round(cycleTimeSec - station.workloadSec),
    rank: ranks.get(station.id) ?? stationCount,
    isBottleneck: bottleneckStationIds.includes(station.id),
    isOverCycle: station.workloadSec > cycleTimeSec,
  }));

  const totalAvailableSec = stationCount * cycleTimeSec;
  const totalIdleSec = round(totalAvailableSec - totalWorkSec);
  const lineEfficiencyPercent = round((totalWorkSec / totalAvailableSec) * 100);
  const balanceDelayPercent = round(100 - lineEfficiencyPercent);
  const smoothnessIndexSec = round(
    Math.sqrt(
      validStations.reduce(
        (sum, station) => sum + (cycleTimeSec - station.workloadSec) ** 2,
        0,
      ),
    ),
  );
  const averageUtilizationPercent = round(
    stations.reduce((sum, station) => sum + station.utilizationPercent, 0) /
      stationCount,
  );
  const coefficientOfVariationPercent = round(
    averageWorkloadSec > 0
      ? (standardDeviation(workloads, averageWorkloadSec) / averageWorkloadSec) * 100
      : 0,
  );

  return {
    stationCount,
    cycleTimeSec: round(cycleTimeSec),
    totalWorkSec,
    totalIdleSec,
    averageWorkloadSec: round(averageWorkloadSec),
    bottleneckWorkloadSec: round(bottleneckWorkloadSec),
    bottleneckStationIds,
    overCycleStationIds,
    lineEfficiencyPercent,
    balanceDelayPercent,
    smoothnessIndexSec,
    workloadRangeSec: round(bottleneckWorkloadSec - minWorkloadSec),
    averageUtilizationPercent,
    coefficientOfVariationPercent,
    stations,
    recommendations: buildRecommendations({
      stations,
      bottleneckStationIds,
      overCycleStationIds,
      balanceDelayPercent,
      smoothnessIndexSec,
      workloadRangeSec: bottleneckWorkloadSec - minWorkloadSec,
      cycleTimeSec,
    }),
  };
}
