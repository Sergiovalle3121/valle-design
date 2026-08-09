import { throwDwgError } from "../security/parse-error.js";

export interface DwgLimits {
  readonly maxFileBytes: number;
  readonly maxSections: number;
  readonly maxObjects: number;
  readonly maxHandles: number;
  readonly maxReferences: number;
  readonly maxDepth: number;
  readonly maxStringBytes: number;
  readonly maxArrayLength: number;
  readonly maxWorkUnits: number;
  readonly workPollInterval: number;
  readonly maxWallTimeMs: number;
  readonly maxExpandedBytes: number;
}

export type DwgLimitOverrides = Readonly<Partial<DwgLimits>>;

export const DEFAULT_DWG_LIMITS: DwgLimits = Object.freeze({
  maxFileBytes: 16 * 1024 * 1024,
  maxSections: 8_192,
  maxObjects: 1_000_000,
  maxHandles: 1_000_000,
  maxReferences: 4_000_000,
  maxDepth: 128,
  maxStringBytes: 16 * 1024 * 1024,
  maxArrayLength: 1_000_000,
  maxWorkUnits: 2 * 16 * 1024 * 1024 + 1,
  workPollInterval: 1_024,
  maxWallTimeMs: 2_000,
  maxExpandedBytes: 64 * 1024 * 1024,
});

type DwgLimitName = keyof DwgLimits;

const LIMIT_NAMES = Object.freeze([
  "maxFileBytes",
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
  maxFileBytes: Object.freeze({ min: 1, max: DEFAULT_DWG_LIMITS.maxFileBytes }),
  maxSections: Object.freeze({ min: 1, max: DEFAULT_DWG_LIMITS.maxSections }),
  maxObjects: Object.freeze({ min: 1, max: DEFAULT_DWG_LIMITS.maxObjects }),
  maxHandles: Object.freeze({ min: 1, max: DEFAULT_DWG_LIMITS.maxHandles }),
  maxReferences: Object.freeze({
    min: 1,
    max: DEFAULT_DWG_LIMITS.maxReferences,
  }),
  maxDepth: Object.freeze({ min: 1, max: DEFAULT_DWG_LIMITS.maxDepth }),
  maxStringBytes: Object.freeze({
    min: 1,
    max: DEFAULT_DWG_LIMITS.maxStringBytes,
  }),
  maxArrayLength: Object.freeze({
    min: 1,
    max: DEFAULT_DWG_LIMITS.maxArrayLength,
  }),
  maxWorkUnits: Object.freeze({ min: 1, max: DEFAULT_DWG_LIMITS.maxWorkUnits }),
  workPollInterval: Object.freeze({
    min: 1,
    max: DEFAULT_DWG_LIMITS.workPollInterval,
  }),
  maxWallTimeMs: Object.freeze({
    min: 1,
    max: DEFAULT_DWG_LIMITS.maxWallTimeMs,
  }),
  maxExpandedBytes: Object.freeze({
    min: 1,
    max: DEFAULT_DWG_LIMITS.maxExpandedBytes,
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createDwgLimits(overrides?: DwgLimitOverrides): DwgLimits {
  if (overrides === undefined) {
    return DEFAULT_DWG_LIMITS;
  }
  if (!isRecord(overrides)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Probe limits must be an object.",
    );
  }

  const knownNames = new Set<string>(LIMIT_NAMES);
  for (const name of Object.keys(overrides)) {
    if (!knownNames.has(name)) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "Probe limits contain an unknown field.",
      );
    }
  }

  const normalized = {} as Record<DwgLimitName, number>;
  for (const name of LIMIT_NAMES) {
    const supplied = overrides[name];
    const candidate =
      supplied === undefined ? DEFAULT_DWG_LIMITS[name] : supplied;
    const bounds = DWG_LIMIT_BOUNDS[name];
    if (
      !Number.isSafeInteger(candidate) ||
      candidate < bounds.min ||
      candidate > bounds.max
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A probe limit is outside its supported integer range.",
      );
    }
    normalized[name] = candidate;
  }

  return Object.freeze(normalized);
}
