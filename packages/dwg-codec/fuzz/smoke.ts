import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { DEFAULT_DWG_LIMITS, probeDwg } from "../src/index.js";

const SEED = "valle-dwg0-fuzz-2026-08-09-v1";
const CASES_PER_PASS = 10_000;
const PASSES = 2;
const MAX_BYTES_PER_CASE = 1_024;

interface PassEvidence {
  readonly durationMs: number;
  readonly executions: number;
  readonly histogram: Readonly<Record<string, number>>;
  readonly inputDigest: string;
  readonly resultDigest: string;
  readonly totalBytes: number;
}

function asciiOrder(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deterministicBlock(caseIndex: number, blockIndex: number): Buffer {
  return createHash("sha256")
    .update(SEED, "utf8")
    .update(Uint8Array.of(0))
    .update(String(caseIndex), "ascii")
    .update(Uint8Array.of(0))
    .update(String(blockIndex), "ascii")
    .digest();
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => asciiOrder(left, right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function setAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (
    let index = 0;
    index < value.length && offset + index < bytes.length;
    index += 1
  ) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function generateCase(index: number): Uint8Array {
  const forcedLength = index < 7 ? index : undefined;
  const header = deterministicBlock(index, 0);
  const length =
    forcedLength ?? header.readUInt16LE(0) % (MAX_BYTES_PER_CASE + 1);
  const bytes = new Uint8Array(length);
  for (let offset = 0, blockIndex = 1; offset < bytes.length; blockIndex += 1) {
    const block = deterministicBlock(index, blockIndex);
    const count = Math.min(block.byteLength, bytes.length - offset);
    bytes.set(block.subarray(0, count), offset);
    offset += count;
  }

  if (index % 16 === 0) {
    setAscii(bytes, 0, "AC1015");
  } else if (index % 8 === 0) {
    setAscii(bytes, 0, `AC10${header[2]! % 10}${header[3]! % 10}`);
  } else if (index % 32 === 1) {
    setAscii(bytes, 0, "XAC1015");
  }
  return bytes;
}

function outcomeKey(result: ReturnType<typeof probeDwg>): string {
  if (result.ok) return "ok";
  return `error:${result.error.code}`;
}

function runPass(): PassEvidence {
  const inputHash = createHash("sha256");
  const resultHash = createHash("sha256");
  const histogram: Record<string, number> = {};
  let totalBytes = 0;
  const started = performance.now();

  for (let index = 0; index < CASES_PER_PASS; index += 1) {
    const bytes = generateCase(index);
    totalBytes += bytes.byteLength;
    inputHash.update(
      Uint8Array.of(bytes.byteLength & 0xff, (bytes.byteLength >>> 8) & 0xff),
    );
    inputHash.update(bytes);
    let result: ReturnType<typeof probeDwg>;
    try {
      result = probeDwg(bytes);
    } catch (error) {
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      throw new Error(
        `probeDwg threw for deterministic fuzz case ${index}: ${detail}`,
      );
    }
    if (result.ok)
      throw new Error(`DWG-0 fuzz case ${index} unexpectedly decoded a file`);
    if (
      !Number.isSafeInteger(result.workUnits) ||
      result.workUnits > DEFAULT_DWG_LIMITS.maxWorkUnits
    ) {
      throw new Error(`fuzz case ${index} exceeded the immutable work budget`);
    }
    if (result.error.code === "DWG_INTERNAL_ERROR") {
      throw new Error(`fuzz case ${index} escaped through DWG_INTERNAL_ERROR`);
    }
    const serialized = stableJson(result);
    resultHash.update(`${serialized.length}:`);
    resultHash.update(serialized);
    const key = outcomeKey(result);
    histogram[key] = (histogram[key] ?? 0) + 1;
  }

  return {
    durationMs: Number((performance.now() - started).toFixed(3)),
    executions: CASES_PER_PASS,
    histogram: Object.fromEntries(
      Object.entries(histogram).sort(([a], [b]) => asciiOrder(a, b)),
    ),
    inputDigest: inputHash.digest("hex"),
    resultDigest: resultHash.digest("hex"),
    totalBytes,
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
    throw new Error("usage: tsx fuzz/smoke.ts [--output <evidence.json>]");
  }
  return resolve(process.cwd(), argv[1]);
}

const passes = Array.from({ length: PASSES }, runPass);
const [first, second] = passes;
if (first === undefined || second === undefined)
  throw new Error("two fuzz passes are required");
if (
  first.inputDigest !== second.inputDigest ||
  first.resultDigest !== second.resultDigest ||
  stableJson(first.histogram) !== stableJson(second.histogram) ||
  first.totalBytes !== second.totalBytes
) {
  throw new Error(
    "deterministic fuzz replay diverged between the two fixed-seed passes",
  );
}

const evidence = {
  caseGenerator: "sha256-seed-index-counter-v1",
  casesPerPass: CASES_PER_PASS,
  digests: { inputSha256: first.inputDigest, resultSha256: first.resultDigest },
  executions: CASES_PER_PASS * PASSES,
  histogram: first.histogram,
  maxBytesPerCase: MAX_BYTES_PER_CASE,
  passDurationsMs: passes.map((pass) => pass.durationMs),
  passes: PASSES,
  seed: SEED,
  status: "ok",
  totalBytesPerPass: first.totalBytes,
} as const;

const destination = outputPath(process.argv.slice(2));
const json = `${JSON.stringify(evidence, null, 2)}\n`;
if (destination !== undefined)
  await writeFile(destination, json, { encoding: "utf8", flag: "w" });
process.stdout.write(json);
