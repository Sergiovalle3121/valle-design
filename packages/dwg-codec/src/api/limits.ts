import { throwDwgError } from "../security/parse-error.js";

export interface DwgLimits {
  /** Input byte length only. This is not a process-memory allowance. */
  readonly maxFileBytes: number;
  /** Concurrent owned allocations charged by the codec. */
  readonly maxMemoryBytes: number;
  readonly maxSections: number;
  readonly maxObjects: number;
  readonly maxHandles: number;
  readonly maxReferences: number;
  readonly maxDepth: number;
  readonly maxStringBytes: number;
  readonly maxArrayLength: number;
  /** Deterministic CPU-work allowance, independent of bytes or memory. */
  readonly maxWorkUnits: number;
  readonly workPollInterval: number;
  readonly maxWallTimeMs: number;
  /** Aggregate decoded/retained payload bytes, independent of input size. */
  readonly maxExpandedBytes: number;
}

export type DwgLimitOverrides = Readonly<Partial<DwgLimits>>;
export type DwgLimitProfile = "browser" | "api";

const MEBIBYTE = 1024 * 1024;

export const API_DWG_HARD_TIMEOUT_MS = 5 * 60_000;

export const BROWSER_DWG_LIMITS: DwgLimits = Object.freeze({
  maxFileBytes: 16 * MEBIBYTE,
  maxMemoryBytes: 128 * MEBIBYTE,
  maxSections: 8_192,
  maxObjects: 250_000,
  maxHandles: 250_000,
  maxReferences: 1_000_000,
  maxDepth: 128,
  maxStringBytes: 16 * MEBIBYTE,
  maxArrayLength: 250_000,
  maxWorkUnits: 2 * 16 * MEBIBYTE + 1,
  workPollInterval: 1_024,
  maxWallTimeMs: 45_000,
  maxExpandedBytes: 64 * MEBIBYTE,
});

export const API_DWG_LIMITS: DwgLimits = Object.freeze({
  maxFileBytes: 16 * MEBIBYTE,
  maxMemoryBytes: 512 * MEBIBYTE,
  maxSections: 8_192,
  maxObjects: 1_000_000,
  maxHandles: 1_000_000,
  maxReferences: 4_000_000,
  maxDepth: 128,
  maxStringBytes: 16 * MEBIBYTE,
  maxArrayLength: 1_000_000,
  maxWorkUnits: 256 * MEBIBYTE,
  workPollInterval: 1_024,
  maxWallTimeMs: 120_000,
  maxExpandedBytes: 256 * MEBIBYTE,
});

export const DWG_LIMIT_PROFILES: Readonly<Record<DwgLimitProfile, DwgLimits>> =
  Object.freeze({
    browser: BROWSER_DWG_LIMITS,
    api: API_DWG_LIMITS,
  });

export const DEFAULT_DWG_LIMITS = BROWSER_DWG_LIMITS;

type DwgLimitName = keyof DwgLimits;

const LIMIT_NAMES = Object.freeze([
  "maxFileBytes",
  "maxMemoryBytes",
  "maxSections",
  "maxObjects",
  "maxHandles",
  "maxReferences",
  "maxDepth",
  "maxStringBytes",
  "maxArrayLength",
  "maxWorkUnits",
  "workPollInterval",
  "maxWallTimeMs",
  "maxExpandedBytes",
] as const satisfies readonly DwgLimitName[]);

export const DWG_LIMIT_BOUNDS: Readonly<
  Record<DwgLimitName, Readonly<{ min: number; max: number }>>
> = Object.freeze({
  maxFileBytes: Object.freeze({ min: 1, max: API_DWG_LIMITS.maxFileBytes }),
  maxMemoryBytes: Object.freeze({
    min: 1,
    max: API_DWG_LIMITS.maxMemoryBytes,
  }),
  maxSections: Object.freeze({ min: 1, max: API_DWG_LIMITS.maxSections }),
  maxObjects: Object.freeze({ min: 1, max: API_DWG_LIMITS.maxObjects }),
  maxHandles: Object.freeze({ min: 1, max: API_DWG_LIMITS.maxHandles }),
  maxReferences: Object.freeze({ min: 1, max: API_DWG_LIMITS.maxReferences }),
  maxDepth: Object.freeze({ min: 1, max: API_DWG_LIMITS.maxDepth }),
  maxStringBytes: Object.freeze({
    min: 1,
    max: API_DWG_LIMITS.maxStringBytes,
  }),
  maxArrayLength: Object.freeze({
    min: 1,
    max: API_DWG_LIMITS.maxArrayLength,
  }),
  maxWorkUnits: Object.freeze({
    min: 1,
    max: API_DWG_LIMITS.maxWorkUnits,
  }),
  workPollInterval: Object.freeze({
    min: 1,
    max: API_DWG_LIMITS.workPollInterval,
  }),
  maxWallTimeMs: Object.freeze({ min: 1, max: API_DWG_HARD_TIMEOUT_MS }),
  maxExpandedBytes: Object.freeze({
    min: 1,
    max: API_DWG_LIMITS.maxExpandedBytes,
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function profileMaximum(profile: DwgLimitProfile, name: DwgLimitName): number {
  if (profile === "api" && name === "maxWallTimeMs") {
    return API_DWG_HARD_TIMEOUT_MS;
  }
  return DWG_LIMIT_PROFILES[profile][name];
}

export function createDwgLimits(
  overrides?: DwgLimitOverrides,
  profile: DwgLimitProfile = "browser",
): DwgLimits {
  if (profile !== "browser" && profile !== "api") {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The DWG resource profile is invalid.",
    );
  }
  const defaults = DWG_LIMIT_PROFILES[profile];
  if (overrides === undefined) return defaults;
  if (!isRecord(overrides)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "DWG limits must be an object.",
    );
  }

  const knownNames = new Set<string>(LIMIT_NAMES);
  for (const name of Object.keys(overrides)) {
    if (!knownNames.has(name)) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "DWG limits contain an unknown field.",
      );
    }
  }

  const normalized = {} as Record<DwgLimitName, number>;
  for (const name of LIMIT_NAMES) {
    const supplied = overrides[name];
    const candidate = supplied === undefined ? defaults[name] : supplied;
    if (
      !Number.isSafeInteger(candidate) ||
      candidate < 1 ||
      candidate > profileMaximum(profile, name)
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A DWG limit is outside its profile's supported integer range.",
      );
    }
    normalized[name] = candidate;
  }

  return Object.freeze(normalized);
}
