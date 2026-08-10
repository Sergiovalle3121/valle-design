export const DWG_ERROR_CODES = [
  "DWG_INPUT_INVALID",
  "DWG_SHARED_BUFFER_REJECTED",
  "DWG_FILE_LIMIT_EXCEEDED",
  "DWG_SIGNATURE_TRUNCATED",
  "DWG_SIGNATURE_INVALID",
  "DWG_VERSION_UNKNOWN",
  "DWG_VERSION_DECODER_UNSUPPORTED",
  "DWG_WORK_LIMIT_EXCEEDED",
  "DWG_CANCELLED",
  "DWG_DEADLINE_EXCEEDED",
  "DWG_STRUCTURE_CORRUPT",
  "DWG_INTERNAL_ERROR",
] as const;

export type DwgErrorCode = (typeof DWG_ERROR_CODES)[number];

export type DwgErrorCategory =
  "input" | "resource" | "unsupported" | "cancelled" | "internal";

export interface DwgError {
  readonly code: DwgErrorCode;
  readonly category: DwgErrorCategory;
  readonly offset: number;
  readonly message: string;
}

const OWNED_PARSE_ERRORS = new WeakMap<object, DwgError>();

export function createDwgError(
  code: DwgErrorCode,
  category: DwgErrorCategory,
  offset: number,
  message: string,
): DwgError {
  return Object.freeze({ code, category, offset, message });
}

export class DwgParseError extends Error {
  readonly detail: DwgError;

  constructor(detail: DwgError) {
    super(detail.message);
    this.name = "DwgParseError";
    this.detail = detail;
    Object.defineProperty(this, "detail", {
      configurable: false,
      enumerable: true,
      value: detail,
      writable: false,
    });
    OWNED_PARSE_ERRORS.set(this, detail);
  }
}

export function throwDwgError(
  code: DwgErrorCode,
  category: DwgErrorCategory,
  offset: number,
  message: string,
): never {
  throw new DwgParseError(createDwgError(code, category, offset, message));
}

export function normalizeDwgError(error: unknown): DwgError {
  if (typeof error === "object" && error !== null) {
    const ownedDetail = OWNED_PARSE_ERRORS.get(error);
    if (ownedDetail !== undefined) return ownedDetail;
  }

  return createDwgError(
    "DWG_INTERNAL_ERROR",
    "internal",
    0,
    "The probe failed without exposing implementation details.",
  );
}
