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

const CYCLE_TIME_PATTERNS = [
  /\b(?:ct|cycle|ciclo|tiempo)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(s|sec|seg|segundos|min|mins|minutos)\b/i,
  /\((\d+(?:[.,]\d+)?)\s*(s|sec|seg|segundos|min|mins|minutos)\)/i,
  /\b(\d+(?:[.,]\d+)?)\s*(s|sec|seg|segundos)\b/i,
];

function parseNumber(value: string): number | undefined {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeCycleTime(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || value == null || value <= 0) return undefined;
  return Math.round(value * 10) / 10;
}

export function cycleTimeSecondsFromLabel(label: string): number | undefined {
  for (const pattern of CYCLE_TIME_PATTERNS) {
    const match = label.match(pattern);
    if (!match?.[1]) continue;
    const value = parseNumber(match[1]);
    if (value == null) continue;
    const unit = match[2]?.toLowerCase() ?? "s";
    return normalizeCycleTime(unit.startsWith("min") ? value * 60 : value);
  }
  return undefined;
}

export function buildCadLineBalanceReport(input: {
  stations: CadLineBalanceStation[];
  taktTimeSec?: number;
}): CadLineBalanceReport {
  const taktTimeSec = normalizeCycleTime(input.taktTimeSec);
  const stations = input.stations.map((station) => ({
    ...station,
    cycleTimeSec: normalizeCycleTime(
      station.cycleTimeSec ?? cycleTimeSecondsFromLabel(station.label),
    ),
  }));
  const measured = stations.filter((station) => station.cycleTimeSec != null);
  const missingStationIds = stations
    .filter((station) => station.cycleTimeSec == null)
    .map((station) => station.id);
  const totalCycleTimeSec = measured.reduce(
    (sum, station) => sum + (station.cycleTimeSec ?? 0),
    0,
  );
  const bottleneck = measured.reduce<CadLineBalanceStation | undefined>(
    (current, station) =>
      !current || (station.cycleTimeSec ?? 0) > (current.cycleTimeSec ?? 0)
        ? station
        : current,
    undefined,
  );
  const effectiveTaktSec =
    taktTimeSec ?? normalizeCycleTime(bottleneck?.cycleTimeSec);
  const averageCycleTimeSec = measured.length
    ? totalCycleTimeSec / measured.length
    : undefined;
  const stationResults: CadLineBalanceStationResult[] = stations.map(
    (station) => {
      const cycleTimeSec = station.cycleTimeSec;
      const loadPercent =
        cycleTimeSec != null && effectiveTaktSec
          ? (cycleTimeSec / effectiveTaktSec) * 100
          : undefined;
      return {
        ...station,
        cycleTimeSec,
        loadPercent,
        slackSec:
          cycleTimeSec != null && effectiveTaktSec
            ? effectiveTaktSec - cycleTimeSec
            : undefined,
        overTakt:
          cycleTimeSec != null && taktTimeSec != null
            ? cycleTimeSec > taktTimeSec
            : false,
        missingCycleTime: cycleTimeSec == null,
      };
    },
  );
  const overloadedStationIds = stationResults
    .filter((station) => station.overTakt)
    .map((station) => station.id);
  const maxLoadPercent = stationResults.reduce<number | undefined>(
    (current, station) =>
      station.loadPercent == null
        ? current
        : current == null
          ? station.loadPercent
          : Math.max(current, station.loadPercent),
    undefined,
  );
  const balanceEfficiencyPercent =
    effectiveTaktSec && measured.length
      ? (totalCycleTimeSec / (measured.length * effectiveTaktSec)) * 100
      : undefined;
  const spreadPenalty =
    measured.length >= 2 && averageCycleTimeSec
      ? Math.max(
          0,
          ((bottleneck?.cycleTimeSec ?? 0) - averageCycleTimeSec) /
            averageCycleTimeSec,
        ) * 25
      : 0;
  const overloadPenalty = overloadedStationIds.length * 18;
  const missingPenalty = missingStationIds.length * 12;
  const noTaktPenalty = taktTimeSec ? 0 : 8;
  const balanceScore = Math.max(
    0,
    Math.round(100 - spreadPenalty - overloadPenalty - missingPenalty - noTaktPenalty),
  );
  const recommendations: string[] = [];

  if (!taktTimeSec)
    recommendations.push(
      "Define takt time to classify overloads instead of using the bottleneck as reference.",
    );
  if (missingStationIds.length)
    recommendations.push(
      `Add cycle time metadata for ${missingStationIds.length} station(s).`,
    );
  if (overloadedStationIds.length)
    recommendations.push(
      `Rebalance or split ${overloadedStationIds.length} station(s) above takt.`,
    );
  if (!recommendations.length && balanceScore < 85)
    recommendations.push("Level station work content to reduce bottleneck spread.");
  if (!recommendations.length)
    recommendations.push("Line balance is ready for visual Yamazumi overlay.");

  const bottleneckResult = bottleneck
    ? stationResults.find((station) => station.id === bottleneck.id)
    : undefined;

  return {
    stationCount: stations.length,
    measuredStationCount: measured.length,
    missingStationIds,
    taktTimeSec,
    effectiveTaktSec,
    bottleneck: bottleneckResult,
    totalCycleTimeSec: Math.round(totalCycleTimeSec * 10) / 10,
    averageCycleTimeSec:
      averageCycleTimeSec == null
        ? undefined
        : Math.round(averageCycleTimeSec * 10) / 10,
    maxLoadPercent:
      maxLoadPercent == null ? undefined : Math.round(maxLoadPercent),
    overloadedStationIds,
    balanceEfficiencyPercent:
      balanceEfficiencyPercent == null
        ? undefined
        : Math.round(balanceEfficiencyPercent),
    balanceScore,
    stations: stationResults.map((station) => ({
      ...station,
      loadPercent:
        station.loadPercent == null ? undefined : Math.round(station.loadPercent),
      slackSec:
        station.slackSec == null
          ? undefined
          : Math.round(station.slackSec * 10) / 10,
    })),
    recommendations,
  };
}
