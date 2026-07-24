#!/usr/bin/env node
import { runCadPerfBaseline } from "../src/lib/cad/perf-baseline";

const requested = process.argv
  .slice(2)
  .map(Number)
  .filter((value) => Number.isInteger(value) && value > 0);
const entityCounts = requested.length ? requested : [1_000, 10_000, 100_000];

for (const entities of entityCounts) {
  const before = process.memoryUsage().heapUsed;
  const result = runCadPerfBaseline({ entities });
  const after = process.memoryUsage().heapUsed;
  process.stdout.write(
    `${JSON.stringify({
      ...result,
      approximateHeapDeltaBytes: Math.max(0, after - before),
      node: process.version,
    })}\n`,
  );
}
