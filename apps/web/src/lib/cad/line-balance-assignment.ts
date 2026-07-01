export type CadLineBalanceAssignmentMethod =
  | "ranked-positional-weight"
  | "largest-candidate-rule";

export interface CadLineBalanceTask {
  id: string;
  label?: string;
  timeSec: number;
  predecessors?: string[];
}

export interface CadLineBalanceAssignedTask extends CadLineBalanceTask {
  positionalWeightSec: number;
}

export interface CadLineBalanceAssignedStation {
  id: string;
  sequence: number;
  tasks: CadLineBalanceAssignedTask[];
  workloadSec: number;
  idleSec: number;
  utilizationPercent: number;
}

export interface CadLineBalanceAssignmentWarning {
  code:
    | "duplicate_task_id"
    | "invalid_cycle_time"
    | "invalid_task_time"
    | "missing_predecessor"
    | "precedence_cycle"
    | "task_exceeds_cycle_time"
    | "unassigned_tasks";
  message: string;
  taskIds: string[];
}

export interface CadLineBalanceAssignmentResult {
  method: CadLineBalanceAssignmentMethod;
  cycleTimeSec: number;
  taskCount: number;
  assignedTaskCount: number;
  stationCount: number;
  totalWorkSec: number;
  totalIdleSec: number;
  lineEfficiencyPercent: number;
  stations: CadLineBalanceAssignedStation[];
  unassignedTaskIds: string[];
  infeasibleTaskIds: string[];
  positionalWeights: Record<string, number>;
  warnings: CadLineBalanceAssignmentWarning[];
}

interface NormalizedTask extends Required<CadLineBalanceTask> {}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function taskLabel(task: CadLineBalanceTask): string {
  return task.label ? `${task.label} (${task.id})` : task.id;
}

function addWarning(
  warnings: CadLineBalanceAssignmentWarning[],
  code: CadLineBalanceAssignmentWarning["code"],
  message: string,
  taskIds: string[],
): void {
  warnings.push({ code, message, taskIds: [...new Set(taskIds)].sort() });
}

function normalizeTasks(
  tasks: CadLineBalanceTask[],
  warnings: CadLineBalanceAssignmentWarning[],
): NormalizedTask[] {
  const seen = new Set<string>();
  const normalized: NormalizedTask[] = [];

  for (const task of tasks) {
    if (seen.has(task.id)) {
      addWarning(
        warnings,
        "duplicate_task_id",
        `Duplicate task id ${task.id} was ignored.`,
        [task.id],
      );
      continue;
    }
    seen.add(task.id);

    if (!Number.isFinite(task.timeSec) || task.timeSec <= 0) {
      addWarning(
        warnings,
        "invalid_task_time",
        `${taskLabel(task)} has an invalid task time.`,
        [task.id],
      );
      continue;
    }

    normalized.push({
      id: task.id,
      label: task.label ?? task.id,
      timeSec: task.timeSec,
      predecessors: [...new Set(task.predecessors ?? [])].sort(),
    });
  }

  return normalized;
}

function buildSuccessors(
  tasks: NormalizedTask[],
  warnings: CadLineBalanceAssignmentWarning[],
): Map<string, string[]> {
  const ids = new Set(tasks.map((task) => task.id));
  const successors = new Map(tasks.map((task) => [task.id, [] as string[]]));

  for (const task of tasks) {
    const existingPredecessors = task.predecessors.filter((id) => ids.has(id));
    const missingPredecessors = task.predecessors.filter((id) => !ids.has(id));

    if (missingPredecessors.length) {
      addWarning(
        warnings,
        "missing_predecessor",
        `${taskLabel(task)} references missing predecessor(s): ${missingPredecessors.join(", ")}.`,
        [task.id, ...missingPredecessors],
      );
    }

    for (const predecessorId of existingPredecessors) {
      successors.get(predecessorId)?.push(task.id);
    }
  }

  for (const next of successors.values()) next.sort();
  return successors;
}

function collectSuccessors(
  id: string,
  successors: Map<string, string[]>,
  visited: Set<string>,
): Set<string> {
  for (const successorId of successors.get(id) ?? []) {
    if (visited.has(successorId)) continue;
    visited.add(successorId);
    collectSuccessors(successorId, successors, visited);
  }
  return visited;
}

function calculatePositionalWeights(
  tasks: NormalizedTask[],
  successors: Map<string, string[]>,
): Record<string, number> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return Object.fromEntries(
    tasks.map((task) => {
      const successorTime = [
        ...collectSuccessors(task.id, successors, new Set<string>()),
      ].reduce(
        (sum, successorId) => sum + (byId.get(successorId)?.timeSec ?? 0),
        0,
      );
      return [task.id, round(task.timeSec + successorTime)];
    }),
  );
}

function detectCycleTaskIds(tasks: NormalizedTask[]): string[] {
  const ids = new Set(tasks.map((task) => task.id));
  const remainingPredecessors = new Map(
    tasks.map((task) => [
      task.id,
      task.predecessors.filter((id) => ids.has(id)).length,
    ]),
  );
  const successors = buildSuccessors(tasks, []);
  const ready = tasks
    .filter((task) => remainingPredecessors.get(task.id) === 0)
    .map((task) => task.id)
    .sort();
  const visited: string[] = [];

  while (ready.length) {
    const id = ready.shift();
    if (!id) break;
    visited.push(id);
    for (const successorId of successors.get(id) ?? []) {
      const nextCount = (remainingPredecessors.get(successorId) ?? 0) - 1;
      remainingPredecessors.set(successorId, nextCount);
      if (nextCount === 0) ready.push(successorId);
    }
    ready.sort();
  }

  if (visited.length === tasks.length) return [];
  const visitedSet = new Set(visited);
  return tasks
    .filter((task) => !visitedSet.has(task.id))
    .map((task) => task.id)
    .sort();
}

function compareCandidates(
  method: CadLineBalanceAssignmentMethod,
  positionalWeights: Record<string, number>,
): (a: NormalizedTask, b: NormalizedTask) => number {
  return (a, b) => {
    if (method === "ranked-positional-weight") {
      const weightDelta =
        (positionalWeights[b.id] ?? 0) - (positionalWeights[a.id] ?? 0);
      if (weightDelta !== 0) return weightDelta;
    }
    const timeDelta = b.timeSec - a.timeSec;
    if (timeDelta !== 0) return timeDelta;
    return a.id.localeCompare(b.id);
  };
}

function eligibleTasks(
  tasks: NormalizedTask[],
  assigned: Set<string>,
  infeasible: Set<string>,
): NormalizedTask[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  return tasks.filter(
    (task) =>
      !assigned.has(task.id) &&
      !infeasible.has(task.id) &&
      task.predecessors.every(
        (predecessorId) =>
          assigned.has(predecessorId) || !taskIds.has(predecessorId),
      ),
  );
}

export function assignCadLineBalanceTasks(input: {
  tasks: CadLineBalanceTask[];
  cycleTimeSec: number;
  method?: CadLineBalanceAssignmentMethod;
}): CadLineBalanceAssignmentResult {
  const method = input.method ?? "ranked-positional-weight";
  const cycleTimeSec =
    Number.isFinite(input.cycleTimeSec) && input.cycleTimeSec > 0
      ? input.cycleTimeSec
      : 0;
  const warnings: CadLineBalanceAssignmentWarning[] = [];
  const tasks = normalizeTasks(input.tasks, warnings);
  const successors = buildSuccessors(tasks, warnings);
  const positionalWeights = calculatePositionalWeights(tasks, successors);
  const cycleTaskIds = detectCycleTaskIds(tasks);

  if (cycleTimeSec === 0) {
    addWarning(
      warnings,
      "invalid_cycle_time",
      "Cycle time must be greater than zero.",
      [],
    );
  }

  if (cycleTaskIds.length) {
    addWarning(
      warnings,
      "precedence_cycle",
      `Precedence cycle detected for task(s): ${cycleTaskIds.join(", ")}.`,
      cycleTaskIds,
    );
  }

  const infeasibleTaskIds = tasks
    .filter((task) => cycleTimeSec > 0 && task.timeSec > cycleTimeSec)
    .map((task) => task.id)
    .sort();
  if (infeasibleTaskIds.length) {
    addWarning(
      warnings,
      "task_exceeds_cycle_time",
      `Task(s) exceed the target cycle time: ${infeasibleTaskIds.join(", ")}.`,
      infeasibleTaskIds,
    );
  }

  const blocked = new Set([...cycleTaskIds, ...infeasibleTaskIds]);
  const assigned = new Set<string>();
  const stations: CadLineBalanceAssignedStation[] = [];
  const compare = compareCandidates(method, positionalWeights);

  while (cycleTimeSec > 0 && assigned.size + blocked.size < tasks.length) {
    const stationTasks: CadLineBalanceAssignedTask[] = [];
    let remainingSec = cycleTimeSec;
    let madeProgress = false;

    while (true) {
      const candidate = eligibleTasks(tasks, assigned, blocked)
        .filter((task) => task.timeSec <= remainingSec)
        .sort(compare)[0];
      if (!candidate) break;

      stationTasks.push({
        ...candidate,
        positionalWeightSec: positionalWeights[candidate.id] ?? candidate.timeSec,
      });
      assigned.add(candidate.id);
      remainingSec = round(remainingSec - candidate.timeSec);
      madeProgress = true;
    }

    if (!madeProgress) break;

    const workloadSec = round(
      stationTasks.reduce((sum, task) => sum + task.timeSec, 0),
    );
    stations.push({
      id: `station-${stations.length + 1}`,
      sequence: stations.length + 1,
      tasks: stationTasks,
      workloadSec,
      idleSec: round(cycleTimeSec - workloadSec),
      utilizationPercent: round((workloadSec / cycleTimeSec) * 100),
    });
  }

  const unassignedTaskIds = tasks
    .filter((task) => !assigned.has(task.id))
    .map((task) => task.id)
    .sort();
  if (unassignedTaskIds.length) {
    addWarning(
      warnings,
      "unassigned_tasks",
      `Task(s) could not be assigned: ${unassignedTaskIds.join(", ")}.`,
      unassignedTaskIds,
    );
  }

  const totalWorkSec = round(
    stations.reduce((sum, station) => sum + station.workloadSec, 0),
  );
  const totalIdleSec = round(
    stations.reduce((sum, station) => sum + station.idleSec, 0),
  );
  const lineEfficiencyPercent =
    stations.length && cycleTimeSec > 0
      ? round((totalWorkSec / (stations.length * cycleTimeSec)) * 100)
      : 0;

  return {
    method,
    cycleTimeSec,
    taskCount: tasks.length,
    assignedTaskCount: assigned.size,
    stationCount: stations.length,
    totalWorkSec,
    totalIdleSec,
    lineEfficiencyPercent,
    stations,
    unassignedTaskIds,
    infeasibleTaskIds,
    positionalWeights,
    warnings,
  };
}
