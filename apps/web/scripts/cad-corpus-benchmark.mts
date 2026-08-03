#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { getHeapStatistics } from "node:v8";
import {
  CAD_BENCHMARK_MANIFEST,
  createCadBenchmarkCorpus,
  type CadBenchmarkBudgets,
  type CadBenchmarkProfile,
  type CadBenchmarkTier,
} from "../src/lib/cad/benchmark/corpus";
import {
  parseCadDocument,
  serializeCadDocument,
} from "../src/lib/cad/cad-document";
import {
  CAD_ENTITY_REGISTRY,
  CadSpatialIndex,
  type CadBounds,
  type CadNativeEntity,
} from "../src/lib/cad/entity-runtime";
import { exportCadDxf } from "../src/lib/cad/dxf-export";
import {
  importDxfPrimitives,
  type CadDxfPrimitive,
} from "../src/lib/cad/dxf-import";
import { CadNativeSelectionIndex } from "../src/lib/cad/native-selection-index";

const CANONICAL_PARSE_LIMIT_BYTES = 20_000_000;
const scriptPath = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);

type ProfileStatus = "passed" | "failed" | "skipped";

interface CliOptions {
  tier: CadBenchmarkTier | "all";
  profileIds: string[];
  output?: string;
  enforceScale: boolean;
  internalProfile?: string;
}

interface MemoryTracker {
  sample(phase: string): void;
  result(): {
    peakRssBytes: number;
    peakHeapUsedBytes: number;
    measurementMethod: {
      rss: string;
      heap: string;
    };
    samples: Array<{
      phase: string;
      rssBytes: number;
      heapUsedBytes: number;
      externalBytes: number;
    }>;
  };
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = {
    tier: "smoke",
    profileIds: [],
    enforceScale: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--tier") {
      const tier = argv[++index];
      if (tier !== "smoke" && tier !== "scale" && tier !== "all")
        throw new Error("--tier must be smoke, scale or all.");
      options.tier = tier;
    } else if (argument === "--profile") {
      const profile = argv[++index];
      if (!profile) throw new Error("--profile requires an id.");
      options.profileIds.push(profile);
    } else if (argument === "--output") {
      options.output = argv[++index];
      if (!options.output) throw new Error("--output requires a path.");
    } else if (argument === "--enforce-scale") {
      options.enforceScale = true;
    } else if (argument === "--internal-profile") {
      options.internalProfile = argv[++index];
      if (!options.internalProfile)
        throw new Error("--internal-profile requires an id.");
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function percentile(samples: readonly number[], fraction: number): number {
  assert.ok(samples.length > 0, "percentile needs at least one sample");
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return round(sorted[index]);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function createMemoryTracker(): MemoryTracker {
  const samples: Array<{
    phase: string;
    rssBytes: number;
    heapUsedBytes: number;
    externalBytes: number;
  }> = [];
  let peakRssBytes = 0;
  let peakHeapUsedBytes = 0;
  return {
    sample(phase) {
      const usage = process.memoryUsage();
      samples.push({
        phase,
        rssBytes: usage.rss,
        heapUsedBytes: usage.heapUsed,
        externalBytes: usage.external,
      });
      peakRssBytes = Math.max(
        peakRssBytes,
        usage.rss,
        // Node reports resourceUsage().maxRSS in KiB on supported platforms.
        process.resourceUsage().maxRSS * 1_024,
      );
      peakHeapUsedBytes = Math.max(peakHeapUsedBytes, usage.heapUsed);
    },
    result: () => ({
      peakRssBytes,
      peakHeapUsedBytes,
      measurementMethod: {
        rss: "maximum of process.resourceUsage().maxRSS and phase checkpoint RSS",
        heap: "maximum heapUsed sampled after every synchronous benchmark phase",
      },
      samples,
    }),
  };
}

function forceGc(): void {
  const runtime = globalThis as typeof globalThis & { gc?: () => void };
  runtime.gc?.();
}

function queryPoint(entity: CadNativeEntity): { x: number; y: number } {
  switch (entity.type) {
    case "line":
      return {
        x: (entity.start.x + entity.end.x) / 2,
        y: (entity.start.y + entity.end.y) / 2,
      };
    case "circle":
      return { x: entity.center.x + entity.radius, y: entity.center.y };
    case "arc": {
      const radians =
        ((entity.startAngle + entity.endAngle) / 2) * (Math.PI / 180);
      return {
        x: entity.center.x + Math.cos(radians) * entity.radius,
        y: entity.center.y + Math.sin(radians) * entity.radius,
      };
    }
    default:
      throw new Error(`Corpus unexpectedly contains ${entity.type}.`);
  }
}

function toDxfPrimitive(entity: CadNativeEntity): CadDxfPrimitive {
  switch (entity.type) {
    case "line":
      return {
        kind: "line",
        layer: entity.layer,
        points: [entity.start, entity.end],
      };
    case "circle":
      return {
        kind: "circle",
        layer: entity.layer,
        points: [entity.center],
        radius: entity.radius,
      };
    case "arc":
      return {
        kind: "arc",
        layer: entity.layer,
        points: [entity.center],
        radius: entity.radius,
        startAngle: entity.startAngle,
        endAngle: entity.endAngle,
      };
    default:
      throw new Error(`Corpus unexpectedly contains ${entity.type}.`);
  }
}

function budgetViolations(
  profile: CadBenchmarkProfile,
  observed: CadBenchmarkBudgets,
): Array<{
  metric: keyof CadBenchmarkBudgets;
  observed: number;
  budget: number;
}> {
  return (Object.keys(profile.budgets) as Array<keyof CadBenchmarkBudgets>)
    .filter((metric) => observed[metric] > profile.budgets[metric])
    .map((metric) => ({
      metric,
      observed: observed[metric],
      budget: profile.budgets[metric],
    }));
}

function benchmarkProfile(profile: CadBenchmarkProfile) {
  const tracker = createMemoryTracker();
  tracker.sample("start");
  const totalStarted = performance.now();

  const generateStarted = performance.now();
  const corpus = createCadBenchmarkCorpus({ entities: profile.entities });
  const generateMs = round(performance.now() - generateStarted);
  assert.equal(corpus.nativeEntities.length, profile.entities);
  assert.equal(corpus.document.entities.length, profile.entities);
  tracker.sample("corpus-generated");

  const spatialIndex = new CadSpatialIndex(
    CAD_BENCHMARK_MANIFEST.generator.cellSize,
  );
  const spatialBuildStarted = performance.now();
  for (const entity of corpus.nativeEntities) {
    spatialIndex.upsert(
      entity.id,
      CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(
        entity,
        corpus.document,
      ),
    );
  }
  const spatialIndexBuildMs = round(performance.now() - spatialBuildStarted);
  assert.equal(spatialIndex.size, profile.entities);

  const spatialQuerySamples: number[] = [];
  for (let query = 0; query < profile.queries; query += 1) {
    const entity = corpus.nativeEntities[(query * 7_919) % profile.entities];
    const bounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(
      entity,
      corpus.document,
    ) as CadBounds;
    const started = performance.now();
    const hits = spatialIndex.search(bounds);
    spatialQuerySamples.push(performance.now() - started);
    assert.ok(hits.includes(entity.id));
  }
  tracker.sample("spatial-index-queried");
  spatialIndex.clear();
  forceGc();

  const selectionIndex = new CadNativeSelectionIndex(
    CAD_BENCHMARK_MANIFEST.generator.cellSize,
  );
  const selectionBuildStarted = performance.now();
  selectionIndex.replace(corpus.nativeEntities, corpus.document);
  const selectionIndexBuildMs = round(
    performance.now() - selectionBuildStarted,
  );
  assert.equal(selectionIndex.size, profile.entities);

  const selectionQuerySamples: number[] = [];
  for (let query = 0; query < profile.queries; query += 1) {
    const entity = corpus.nativeEntities[(query * 7_919) % profile.entities];
    const started = performance.now();
    const hits = selectionIndex.hitTest(queryPoint(entity), 0.5, 8);
    selectionQuerySamples.push(performance.now() - started);
    assert.ok(
      hits.some((hit) => hit.id === entity.id),
      `selection query missed ${entity.id}`,
    );
  }
  tracker.sample("selection-index-queried");
  selectionIndex.clear();
  forceGc();

  const serializeStarted = performance.now();
  let serialized = serializeCadDocument(corpus.document);
  const serializeMs = round(performance.now() - serializeStarted);
  const serializedBytes = Buffer.byteLength(serialized);
  const corpusSha256 = sha256(serialized);
  tracker.sample("canonical-serialized");

  let canonicalParse:
    | { status: "measured"; ms: number; entities: number }
    | { status: "not-run"; reason: string };
  if (serializedBytes <= CANONICAL_PARSE_LIMIT_BYTES) {
    const parseStarted = performance.now();
    const parsed = parseCadDocument(serialized);
    canonicalParse = {
      status: "measured",
      ms: round(performance.now() - parseStarted),
      entities: parsed.entities.length,
    };
    assert.equal(parsed.entities.length, profile.entities);
    tracker.sample("canonical-parsed");
  } else {
    canonicalParse = {
      status: "not-run",
      reason: `Serialized corpus is ${serializedBytes} bytes; the product parser limit is ${CANONICAL_PARSE_LIMIT_BYTES} bytes.`,
    };
  }
  serialized = "";
  forceGc();

  const dxfSample = corpus.nativeEntities
    .slice(0, Math.min(profile.dxfSampleEntities, profile.entities))
    .map(toDxfPrimitive);
  const dxfExportStarted = performance.now();
  const exported = exportCadDxf(
    { primitives: dxfSample },
    { units: "mm", fileComment: "Valle Design deterministic benchmark corpus" },
  );
  const dxfExportMs = round(performance.now() - dxfExportStarted);
  const dxfImportStarted = performance.now();
  const imported = importDxfPrimitives(exported.content);
  const dxfImportMs = round(performance.now() - dxfImportStarted);
  assert.equal(exported.entityCount, dxfSample.length);
  assert.equal(imported.primitives.length, dxfSample.length);
  tracker.sample("dxf-round-trip");

  const totalMs = round(performance.now() - totalStarted);
  const memory = tracker.result();
  const observed: CadBenchmarkBudgets = {
    totalMs,
    generateMs,
    spatialIndexBuildMs,
    selectionIndexBuildMs,
    selectionQueryP95Ms: percentile(selectionQuerySamples, 0.95),
    serializeMs,
    dxfRoundTripMs: round(dxfExportMs + dxfImportMs),
    peakRssBytes: memory.peakRssBytes,
  };
  const violations = budgetViolations(profile, observed);
  const status: ProfileStatus =
    violations.length > 0 && profile.budgetEnforcement === "blocking"
      ? "failed"
      : "passed";

  return {
    id: profile.id,
    tier: profile.tier,
    status,
    budgetEnforcement: profile.budgetEnforcement,
    dataset: {
      generatorId: CAD_BENCHMARK_MANIFEST.generator.id,
      seed: CAD_BENCHMARK_MANIFEST.generator.seed,
      requestedEntities: profile.entities,
      generatedEntities: corpus.nativeEntities.length,
      entityMix: corpus.entityMix,
      canonicalSerializedBytes: serializedBytes,
      canonicalSha256: corpusSha256,
      dxfRoundTripSampleEntities: dxfSample.length,
    },
    timingsMs: {
      total: totalMs,
      generate: generateMs,
      spatialIndexBuild: spatialIndexBuildMs,
      spatialQueryP50: percentile(spatialQuerySamples, 0.5),
      spatialQueryP95: percentile(spatialQuerySamples, 0.95),
      selectionIndexBuild: selectionIndexBuildMs,
      selectionQueryP50: percentile(selectionQuerySamples, 0.5),
      selectionQueryP95: percentile(selectionQuerySamples, 0.95),
      serializeCanonicalDocument: serializeMs,
      dxfExport: dxfExportMs,
      dxfImport: dxfImportMs,
      dxfRoundTrip: round(dxfExportMs + dxfImportMs),
    },
    canonicalParse,
    memory,
    budget: {
      limits: profile.budgets,
      observed,
      passed: violations.length === 0,
      violations,
    },
  };
}

function environmentEvidence() {
  const cpus = os.cpus();
  return {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    osType: os.type(),
    osRelease: os.release(),
    cpuModel: cpus[0]?.model ?? "unknown",
    logicalCpuCount: cpus.length,
    nominalCpuSpeedMHz: cpus[0]?.speed ?? null,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytesAtStart: os.freemem(),
    heapLimitBytes: getHeapStatistics().heap_size_limit,
  };
}

function skippedForHardware(profile: CadBenchmarkProfile) {
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const reasons: string[] = [];
  if (totalMemoryBytes < profile.hardware.minimumTotalMemoryBytes) {
    reasons.push(
      `requires at least ${profile.hardware.minimumTotalMemoryBytes} total bytes; detected ${totalMemoryBytes}`,
    );
  }
  if (freeMemoryBytes < profile.hardware.minimumFreeMemoryBytes) {
    reasons.push(
      `requires at least ${profile.hardware.minimumFreeMemoryBytes} free bytes; detected ${freeMemoryBytes}`,
    );
  }
  if (reasons.length === 0) return null;
  return {
    id: profile.id,
    tier: profile.tier,
    status: "skipped" as const,
    budgetEnforcement: profile.budgetEnforcement,
    skipReason: `Hardware guard: ${reasons.join("; ")}.`,
    hardwareRequirement: profile.hardware,
  };
}

function runProfileInChild(profile: CadBenchmarkProfile) {
  const skipped = skippedForHardware(profile);
  if (skipped) return skipped;

  const tsxCli = require.resolve("tsx/cli");
  const child = spawnSync(
    process.execPath,
    [
      `--max-old-space-size=${profile.nodeOldSpaceMb}`,
      "--expose-gc",
      tsxCli,
      scriptPath,
      "--internal-profile",
      profile.id,
    ],
    {
      cwd: path.resolve(path.dirname(scriptPath), ".."),
      encoding: "utf8",
      maxBuffer: 16 * 1_024 * 1_024,
    },
  );
  if (child.status !== 0) {
    return {
      id: profile.id,
      tier: profile.tier,
      status: "failed" as const,
      budgetEnforcement: profile.budgetEnforcement,
      error: {
        message:
          child.stderr.trim() ||
          child.error?.message ||
          `benchmark child exited with status ${child.status}`,
      },
    };
  }
  return JSON.parse(child.stdout) as ReturnType<typeof benchmarkProfile>;
}

function selectProfiles(options: CliOptions): CadBenchmarkProfile[] {
  if (options.profileIds.length > 0) {
    return options.profileIds.map((id) => {
      const profile = CAD_BENCHMARK_MANIFEST.profiles.find(
        (candidate) => candidate.id === id,
      );
      if (!profile) throw new Error(`Unknown profile: ${id}`);
      return profile;
    });
  }
  return CAD_BENCHMARK_MANIFEST.profiles.filter(
    (profile) => options.tier === "all" || profile.tier === options.tier,
  );
}

function emitEvidence(evidence: unknown, output?: string): void {
  const json = `${JSON.stringify(evidence, null, 2)}\n`;
  const target = output ?? process.env.CAD_BENCHMARK_OUTPUT;
  if (!target) {
    process.stdout.write(json);
    return;
  }
  const resolved = path.resolve(target);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, json, "utf8");
  process.stderr.write(`CAD benchmark evidence: ${resolved}\n`);
}

function runParent(options: CliOptions): void {
  const startedAt = new Date().toISOString();
  const environment = environmentEvidence();
  const selected = selectProfiles(options);
  const profiles = selected.map(runProfileInChild);
  const finishedAt = new Date().toISOString();
  const evidence = {
    $schema: "urn:valle-design:schema:cad-benchmark-evidence:v1",
    schemaVersion: 1,
    benchmarkId: CAD_BENCHMARK_MANIFEST.benchmarkId,
    manifestSha256: sha256(canonicalJson(CAD_BENCHMARK_MANIFEST)),
    startedAt,
    finishedAt,
    environment: {
      ...environment,
      freeMemoryBytesAtFinish: os.freemem(),
    },
    run: {
      tier: options.tier,
      profileIds: selected.map((profile) => profile.id),
      scaleBudgetsEnforced: options.enforceScale,
      isolatedProcessPerProfile: true,
    },
    profiles,
    scope: {
      measured: [
        "deterministic native LINE/CIRCLE/ARC corpus generation",
        "production CAD registry bounds and CadSpatialIndex build/search",
        "CadNativeSelectionIndex build and exact hit-test",
        "canonical CadDocument serialization and SHA-256",
        "canonical parsing only when inside the product's 20 MB client limit",
        "DXF export/import round-trip for the reported sample entity count",
        "process high-water RSS and sampled heap after each synchronous phase",
      ],
      notMeasured: [
        "browser startup, browser rendering, frame rate, GPU or Three.js scene projection",
        "network, API, PostgreSQL, remote open/save, autosave or CAS latency",
        "undo/redo latency or retained history",
        "DWG compatibility",
      ],
    },
  };
  emitEvidence(evidence, options.output);

  const failed = profiles.some((profile) => profile.status === "failed");
  const enforcedScaleViolation =
    options.enforceScale &&
    profiles.some(
      (profile) =>
        profile.tier === "scale" &&
        "budget" in profile &&
        profile.budget.passed === false,
    );
  if (failed || enforcedScaleViolation) process.exitCode = 1;
}

try {
  const options = parseCli(process.argv.slice(2));
  if (options.internalProfile) {
    const profile = CAD_BENCHMARK_MANIFEST.profiles.find(
      (candidate) => candidate.id === options.internalProfile,
    );
    if (!profile)
      throw new Error(`Unknown profile: ${options.internalProfile}`);
    process.stdout.write(JSON.stringify(benchmarkProfile(profile)));
  } else {
    runParent(options);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`CAD benchmark failed: ${message}\n`);
  process.exitCode = 1;
}
