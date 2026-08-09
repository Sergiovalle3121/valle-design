import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  DEFAULT_DWG_LIMITS,
  probeDwg,
  type DwgErrorCode,
} from "../src/index.js";

interface BenchmarkInput {
  readonly bytes: Uint8Array;
  readonly expectedError: DwgErrorCode;
}

interface BenchmarkProfile {
  readonly inputs: readonly BenchmarkInput[];
  readonly name: "tiny" | "mixed" | "max-snapshot";
  readonly operations: number;
}

interface MemorySnapshot {
  readonly arrayBuffers: number;
  readonly external: number;
  readonly heapUsed: number;
  readonly rss: number;
}

function ascii(value: string, length = value.length): Uint8Array {
  const bytes = new Uint8Array(length);
  for (
    let index = 0;
    index < value.length && index < bytes.length;
    index += 1
  ) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function patterned(length: number, signature?: string): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < bytes.length; index += 1)
    bytes[index] = (index * 131 + 17) & 0xff;
  if (signature !== undefined) bytes.set(ascii(signature), 0);
  return bytes;
}

function memorySnapshot(): MemorySnapshot {
  const usage = process.memoryUsage();
  return {
    arrayBuffers: usage.arrayBuffers,
    external: usage.external,
    heapUsed: usage.heapUsed,
    rss: usage.rss,
  };
}

function memoryDelta(
  before: MemorySnapshot,
  after: MemorySnapshot,
): MemorySnapshot {
  return {
    arrayBuffers: after.arrayBuffers - before.arrayBuffers,
    external: after.external - before.external,
    heapUsed: after.heapUsed - before.heapUsed,
    rss: after.rss - before.rss,
  };
}

function digestCorpus(inputs: readonly BenchmarkInput[]): string {
  const hash = createHash("sha256");
  for (const input of inputs) {
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64LE(BigInt(input.bytes.byteLength));
    hash.update(length);
    hash.update(input.bytes);
    hash.update(Uint8Array.of(0));
    hash.update(input.expectedError, "ascii");
  }
  return hash.digest("hex");
}

function runProfile(profile: BenchmarkProfile): object {
  const corpusBytes = profile.inputs.reduce(
    (total, input) => total + input.bytes.byteLength,
    0,
  );
  const resultHash = createHash("sha256");
  const outcomeHistogram: Partial<Record<DwgErrorCode, number>> = {};
  const before = memorySnapshot();
  let processedBytes = 0;
  let workUnits = 0;
  const started = performance.now();
  for (let operation = 0; operation < profile.operations; operation += 1) {
    const input = profile.inputs[operation % profile.inputs.length]!;
    const result = probeDwg(input.bytes);
    if (result.ok)
      throw new Error(
        `${profile.name} unexpectedly decoded a DWG during DWG-0`,
      );
    if (result.error.code === "DWG_INTERNAL_ERROR") {
      throw new Error(`${profile.name} escaped through DWG_INTERNAL_ERROR`);
    }
    if (result.error.code !== input.expectedError) {
      throw new Error(
        `${profile.name} expected ${input.expectedError} but received ${result.error.code}`,
      );
    }
    if (!Number.isSafeInteger(result.workUnits) || result.workUnits < 0) {
      throw new Error(`${profile.name} returned invalid work evidence`);
    }
    workUnits += result.workUnits;
    processedBytes += input.bytes.byteLength;
    resultHash.update(
      `${result.error.code}:${result.error.offset}:${result.workUnits};`,
    );
    outcomeHistogram[result.error.code] =
      (outcomeHistogram[result.error.code] ?? 0) + 1;
  }
  const wallMs = performance.now() - started;
  const after = memorySnapshot();
  return {
    corpus: {
      bytes: corpusBytes,
      expectedErrors: profile.inputs.map((input) => input.expectedError),
      inputs: profile.inputs.length,
      sha256: digestCorpus(profile.inputs),
    },
    memoryBytes: { after, before, delta: memoryDelta(before, after) },
    name: profile.name,
    operations: profile.operations,
    outcomeHistogram,
    processedBytes,
    resultSha256: resultHash.digest("hex"),
    throughputMiBPerSecond:
      wallMs === 0
        ? null
        : Number((processedBytes / (1024 * 1024) / (wallMs / 1000)).toFixed(3)),
    wallMs: Number(wallMs.toFixed(3)),
    workUnits,
  };
}

function outputPath(argv: readonly string[]): string | undefined {
  if (argv.length === 0) return undefined;
  if (
    argv.length !== 2 ||
    argv[0] !== "--output" ||
    argv[1] === undefined ||
    argv[1].length === 0
  ) {
    throw new Error(
      "usage: tsx benchmarks/smoke.ts [--output <evidence.json>]",
    );
  }
  return resolve(process.cwd(), argv[1]);
}

const maxSnapshot = ascii("AC1015", DEFAULT_DWG_LIMITS.maxFileBytes);
if (maxSnapshot.byteLength !== DEFAULT_DWG_LIMITS.maxFileBytes) {
  throw new Error(
    "max-snapshot profile must exercise the exact public file-size limit",
  );
}

const profiles: readonly BenchmarkProfile[] = [
  {
    inputs: [
      {
        bytes: ascii("AC1015"),
        expectedError: "DWG_VERSION_DECODER_UNSUPPORTED",
      },
    ],
    name: "tiny",
    operations: 10_000,
  },
  {
    inputs: [
      { bytes: new Uint8Array(), expectedError: "DWG_SIGNATURE_TRUNCATED" },
      { bytes: patterned(1_024), expectedError: "DWG_SIGNATURE_INVALID" },
      {
        bytes: patterned(4_096, "AC1015"),
        expectedError: "DWG_VERSION_DECODER_UNSUPPORTED",
      },
      {
        bytes: patterned(65_536, "AC1099"),
        expectedError: "DWG_VERSION_UNKNOWN",
      },
      {
        bytes: patterned(1_048_576, "AC1032"),
        expectedError: "DWG_VERSION_DECODER_UNSUPPORTED",
      },
    ],
    name: "mixed",
    operations: 64,
  },
  {
    inputs: [
      { bytes: maxSnapshot, expectedError: "DWG_VERSION_DECODER_UNSUPPORTED" },
    ],
    name: "max-snapshot",
    operations: 1,
  },
];

const cpuList = cpus();
const evidence = {
  benchmark: "dwg-probe-snapshot-smoke-v1",
  gitSha: process.env.GITHUB_SHA ?? "local-unrecorded",
  limits: { maxFileBytes: DEFAULT_DWG_LIMITS.maxFileBytes },
  profiles: profiles.map(runProfile),
  runtime: {
    arch: arch(),
    cpu: {
      logicalCores: cpuList.length,
      model: cpuList[0]?.model ?? "unknown",
      nominalMHz: cpuList[0]?.speed ?? null,
    },
    node: process.version,
    platform: platform(),
    release: release(),
    totalMemoryBytes: totalmem(),
    v8: process.versions.v8,
  },
  status: "measured-no-threshold",
} as const;

const destination = outputPath(process.argv.slice(2));
const json = `${JSON.stringify(evidence, null, 2)}\n`;
if (destination !== undefined)
  await writeFile(destination, json, { encoding: "utf8", flag: "w" });
process.stdout.write(json);
