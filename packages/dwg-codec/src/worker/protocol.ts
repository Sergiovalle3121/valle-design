import {
  copyInspectedByteView,
  inspectOrdinaryByteView,
} from "../security/byte-view.js";
import {
  DWG_ERROR_CODES,
  DwgParseError,
  normalizeDwgError,
  throwDwgError,
  type DwgError,
  type DwgErrorCategory,
  type DwgErrorCode,
} from "../security/parse-error.js";
import {
  MAX_DWG_WORKER_TRANSFER_BUFFERS,
  superviseWorker,
  type WorkerLike,
  type WorkerSupervisionResult,
  type WorkerSupervisorOptions,
} from "../security/worker-supervisor.js";

export const DWG_WORKER_PROTOCOL_VERSION = 1 as const;

export type DwgWorkerOperation = "probe" | "read" | "write";

export type DwgWorkerValueParser<
  Value,
  Operation extends DwgWorkerOperation = DwgWorkerOperation,
> = (value: unknown, operation: Operation) => value is Value;

export interface DwgWorkerRequest<
  Payload = unknown,
  Operation extends DwgWorkerOperation = DwgWorkerOperation,
> {
  readonly protocolVersion: typeof DWG_WORKER_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly operation: Operation;
  readonly payload: Payload;
}

export type DwgWorkerResponse<Result = unknown> =
  | Readonly<{
      protocolVersion: typeof DWG_WORKER_PROTOCOL_VERSION;
      requestId: string;
      ok: true;
      value: Result;
    }>
  | Readonly<{
      protocolVersion: typeof DWG_WORKER_PROTOCOL_VERSION;
      requestId: string;
      ok: false;
      error: DwgError;
    }>;

type DwgWorkerResponseParseResult<Result> = WorkerSupervisionResult<
  DwgWorkerResponse<Result>
>;

const MAX_PORTABLE_DEPTH = 128;
const MAX_PORTABLE_NODES = 1_000_000;
const MAX_PORTABLE_ARRAY_LENGTH = 1_000_000;
const MAX_PORTABLE_BYTES = 64 * 1024 * 1024;
const PORTABLE_BYTE_VIEW_OVERHEAD_BYTES = 64;
const PORTABLE_TRANSFER_ENTRY_BYTES = 128;
const OWNED_PROMISE = Promise;

interface PortableSnapshotState {
  bytes: number;
  byteViews: number;
  nodes: number;
  readonly seen: WeakSet<object>;
}

interface WireRequest {
  readonly protocolVersion: typeof DWG_WORKER_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly operation: DwgWorkerOperation;
  readonly payload: unknown;
}

interface OwnedRequest extends WireRequest {
  readonly snapshotState: PortableSnapshotState;
}

const OWNED_REQUESTS = new WeakMap<object, OwnedRequest>();

function createPortableSnapshotState(): PortableSnapshotState {
  return { bytes: 0, byteViews: 0, nodes: 0, seen: new WeakSet<object>() };
}

function validRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function validOperation(value: unknown): value is DwgWorkerOperation {
  return value === "probe" || value === "read" || value === "write";
}

function invalid(message: string): never {
  throwDwgError("DWG_INPUT_INVALID", "input", 0, message);
}

function failed<Result>(error: DwgError): WorkerSupervisionResult<Result> {
  return Object.freeze({ ok: false, error });
}

function resolvedPromise<Value>(value: Value): Promise<Value> {
  return new OWNED_PROMISE<Value>((resolve) => resolve(value));
}

function chargePortable(state: PortableSnapshotState, bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    invalid("The DWG worker payload size is invalid.");
  }
  state.nodes += 1;
  state.bytes += bytes;
  if (
    !Number.isSafeInteger(state.nodes) ||
    !Number.isSafeInteger(state.bytes) ||
    state.nodes > MAX_PORTABLE_NODES ||
    state.bytes > MAX_PORTABLE_BYTES
  ) {
    invalid("The DWG worker payload exceeds its structured-clone budget.");
  }
}

function inspectDataRecord(
  value: unknown,
  state?: PortableSnapshotState,
  maxKeys = MAX_PORTABLE_ARRAY_LENGTH,
): Readonly<Record<string, unknown>> {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      ArrayBuffer.isView(value)
    ) {
      invalid("The DWG worker structured value must be a data object.");
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      invalid("The DWG worker structured value has an invalid prototype.");
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > maxKeys) {
      invalid("The DWG worker structured value contains too many fields.");
    }
    if (state !== undefined) {
      let allocationBytes = keys.length * 16;
      for (const key of keys) {
        if (typeof key !== "string") {
          invalid("The DWG worker structured value contains a symbol key.");
        }
        allocationBytes += key.length * 2;
        if (!Number.isSafeInteger(allocationBytes)) {
          invalid("The DWG worker payload size is invalid.");
        }
      }
      chargePortable(state, allocationBytes);
    }
    const record = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") {
        invalid("The DWG worker structured value contains a symbol key.");
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        invalid(
          "The DWG worker structured value must use enumerable data fields.",
        );
      }
      Object.defineProperty(record, key, {
        configurable: false,
        enumerable: true,
        value: descriptor.value,
        writable: false,
      });
    }
    return Object.freeze(record);
  } catch (error: unknown) {
    const normalized = normalizeDwgError(error);
    if (normalized.code === "DWG_INPUT_INVALID") {
      throw new DwgParseError(normalized);
    }
    invalid("The DWG worker structured value cannot be inspected safely.");
  }
}

function exactKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(record);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(record, key))
  );
}

function snapshotArray(
  value: object,
  state: PortableSnapshotState,
  depth: number,
  transferBuffers?: ArrayBuffer[],
): readonly unknown[] {
  let length: number;
  let keys: readonly PropertyKey[];
  try {
    if (Reflect.getPrototypeOf(value) !== Array.prototype) {
      invalid("The DWG worker payload array has an invalid prototype.");
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined ||
      !("value" in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value > MAX_PORTABLE_ARRAY_LENGTH
    ) {
      invalid("The DWG worker payload array length is invalid.");
    }
    length = lengthDescriptor.value;
    keys = Reflect.ownKeys(value);
  } catch (error: unknown) {
    const normalized = normalizeDwgError(error);
    if (normalized.code === "DWG_INPUT_INVALID") {
      throw new DwgParseError(normalized);
    }
    invalid("The DWG worker payload array cannot be inspected safely.");
  }
  if (keys.length !== length + 1 || !keys.includes("length")) {
    invalid("Sparse or extended DWG worker payload arrays are not accepted.");
  }
  chargePortable(state, length * 16);
  const copy = new Array<unknown>(length);
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    } catch {
      invalid("The DWG worker payload array cannot be inspected safely.");
    }
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      invalid("Sparse or accessor DWG worker payload arrays are not accepted.");
    }
    copy[index] = snapshotPortableValue(
      descriptor.value,
      state,
      depth + 1,
      transferBuffers,
    );
  }
  return Object.freeze(copy);
}

function snapshotPortableValue(
  value: unknown,
  state: PortableSnapshotState,
  depth = 0,
  transferBuffers?: ArrayBuffer[],
): unknown {
  if (depth > MAX_PORTABLE_DEPTH) {
    invalid("The DWG worker payload exceeds its maximum nesting depth.");
  }
  if (value === null || typeof value === "boolean") {
    chargePortable(state, 1);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      invalid("The DWG worker payload contains a non-finite number.");
    }
    chargePortable(state, 8);
    return value;
  }
  if (typeof value === "string") {
    chargePortable(state, value.length * 2);
    return value;
  }
  if (typeof value !== "object" || value === null) {
    invalid("The DWG worker payload contains a non-portable value.");
  }

  let isView: boolean;
  let isArray: boolean;
  try {
    isView = ArrayBuffer.isView(value);
    isArray = Array.isArray(value);
  } catch {
    invalid("The DWG worker payload cannot be inspected safely.");
  }
  if (isView) {
    const inspected = inspectOrdinaryByteView(value);
    state.byteViews += 1;
    if (
      !Number.isSafeInteger(state.byteViews) ||
      state.byteViews > MAX_DWG_WORKER_TRANSFER_BUFFERS
    ) {
      invalid("The DWG worker payload contains too many byte views.");
    }
    chargePortable(
      state,
      inspected.byteLength +
        PORTABLE_BYTE_VIEW_OVERHEAD_BYTES +
        (transferBuffers === undefined ? 0 : PORTABLE_TRANSFER_ENTRY_BYTES),
    );
    const copy = copyInspectedByteView(inspected);
    if (transferBuffers !== undefined) {
      if (transferBuffers.length >= MAX_DWG_WORKER_TRANSFER_BUFFERS) {
        invalid("The DWG worker transfer list exceeds its structural limit.");
      }
      transferBuffers.push(copy.buffer);
    }
    return copy;
  }
  if (state.seen.has(value)) {
    invalid("Cyclic or aliased DWG worker payload objects are not accepted.");
  }
  state.seen.add(value);
  chargePortable(state, 1);
  if (isArray) return snapshotArray(value, state, depth, transferBuffers);

  const record = inspectDataRecord(value, state);
  const keys = Object.keys(record);
  if (keys.length > MAX_PORTABLE_ARRAY_LENGTH) {
    invalid("The DWG worker payload contains too many object fields.");
  }
  chargePortable(state, keys.length * 16);
  const copy = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    Object.defineProperty(copy, key, {
      configurable: false,
      enumerable: true,
      value: snapshotPortableValue(
        record[key],
        state,
        depth + 1,
        transferBuffers,
      ),
      writable: false,
    });
  }
  return Object.freeze(copy);
}

function snapshotValidatedPortableValue<Value>(
  value: Value,
  state: PortableSnapshotState,
): Value {
  // The generic type comes only from a successful operation-specific parser.
  // The recursive copier preserves portable value kinds while severing every
  // mutable byte-view reference held by that parser.
  return snapshotPortableValue(value, state) as Value;
}

function isDwgErrorCode(value: unknown): value is DwgErrorCode {
  return DWG_ERROR_CODES.some((candidate) => candidate === value);
}

function isDwgErrorCategory(value: unknown): value is DwgErrorCategory {
  return (
    value === "input" ||
    value === "resource" ||
    value === "unsupported" ||
    value === "cancelled" ||
    value === "internal"
  );
}

function parseError(value: unknown, state: PortableSnapshotState): DwgError {
  const record = inspectDataRecord(value, state, 4);
  if (!exactKeys(record, ["code", "category", "offset", "message"])) {
    invalid("The DWG worker error envelope is invalid.");
  }
  const code = record.code;
  const category = record.category;
  const offset = record.offset;
  const message = record.message;
  if (
    !isDwgErrorCode(code) ||
    !isDwgErrorCategory(category) ||
    !Number.isSafeInteger(offset) ||
    (offset as number) < 0 ||
    typeof message !== "string" ||
    message.length < 1 ||
    message.length > 1_024
  ) {
    invalid("The DWG worker error envelope is invalid.");
  }
  return Object.freeze({ code, category, offset: offset as number, message });
}

export function createDwgWorkerRequest<
  Operation extends DwgWorkerOperation,
  Payload,
>(
  requestId: string,
  operation: Operation,
  payload: unknown,
  parsePayload: DwgWorkerValueParser<Payload, Operation>,
): DwgWorkerRequest<Payload, Operation> {
  if (!validRequestId(requestId)) {
    invalid("The DWG worker request id is invalid.");
  }
  if (!validOperation(operation)) {
    invalid("The DWG worker operation is invalid.");
  }
  if (typeof parsePayload !== "function") {
    invalid("A DWG worker request payload parser is required.");
  }

  const snapshotState = createPortableSnapshotState();
  const visiblePayload = snapshotPortableValue(payload, snapshotState);
  try {
    if (parsePayload(visiblePayload, operation) !== true) {
      invalid("The DWG worker request payload is invalid for its operation.");
    }
  } catch (error: unknown) {
    throw new DwgParseError(normalizeDwgError(error));
  }
  const ownedPayload = snapshotPortableValue(visiblePayload, snapshotState);
  const request: DwgWorkerRequest<Payload, Operation> = Object.freeze({
    protocolVersion: DWG_WORKER_PROTOCOL_VERSION,
    requestId,
    operation,
    payload: visiblePayload,
  });
  OWNED_REQUESTS.set(
    request,
    Object.freeze({
      protocolVersion: DWG_WORKER_PROTOCOL_VERSION,
      requestId,
      operation,
      payload: ownedPayload,
      snapshotState,
    }),
  );
  return request;
}

function parseDwgWorkerResponse<Operation extends DwgWorkerOperation, Result>(
  value: unknown,
  expectedRequestId: string,
  expectedOperation: Operation,
  parseSuccess: DwgWorkerValueParser<Result, Operation>,
  snapshotState: PortableSnapshotState,
): DwgWorkerResponseParseResult<Result> {
  try {
    if (!validRequestId(expectedRequestId)) {
      invalid("The expected DWG worker request id is invalid.");
    }
    if (!validOperation(expectedOperation)) {
      invalid("The expected DWG worker operation is invalid.");
    }
    if (typeof parseSuccess !== "function") {
      invalid("A DWG worker success parser is required.");
    }
    const record = inspectDataRecord(value, snapshotState, 4);
    if (
      record.protocolVersion !== DWG_WORKER_PROTOCOL_VERSION ||
      record.requestId !== expectedRequestId ||
      typeof record.ok !== "boolean"
    ) {
      invalid("The DWG worker response envelope or correlation id is invalid.");
    }
    if (record.ok === true) {
      if (!exactKeys(record, ["protocolVersion", "requestId", "ok", "value"])) {
        invalid("The successful DWG worker response is invalid.");
      }
      const validationSnapshot = snapshotPortableValue(
        record.value,
        snapshotState,
      );
      if (parseSuccess(validationSnapshot, expectedOperation) !== true) {
        invalid("The DWG worker success value is invalid for its operation.");
      }
      // The validator never receives the value returned to the caller. A
      // second, cumulatively budgeted snapshot prevents a retained validation
      // reference from mutating an accepted result after this call returns.
      const resultSnapshot = snapshotValidatedPortableValue(
        validationSnapshot,
        snapshotState,
      );
      const envelope: DwgWorkerResponse<Result> = Object.freeze({
        protocolVersion: DWG_WORKER_PROTOCOL_VERSION,
        requestId: expectedRequestId,
        ok: true,
        value: resultSnapshot,
      });
      return Object.freeze({
        ok: true,
        value: envelope,
      });
    }
    if (!exactKeys(record, ["protocolVersion", "requestId", "ok", "error"])) {
      invalid("The failed DWG worker response is invalid.");
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        protocolVersion: DWG_WORKER_PROTOCOL_VERSION,
        requestId: expectedRequestId,
        ok: false,
        error: parseError(record.error, snapshotState),
      }),
    });
  } catch (error: unknown) {
    return failed(normalizeDwgError(error));
  }
}

export function superviseDwgWorker<
  Operation extends DwgWorkerOperation,
  Payload,
  Result,
>(
  worker: WorkerLike,
  request: DwgWorkerRequest<Payload, Operation>,
  parseSuccess: DwgWorkerValueParser<Result, Operation>,
  options: WorkerSupervisorOptions,
): Promise<WorkerSupervisionResult<DwgWorkerResponse<Result>>> {
  if (
    (typeof request !== "object" && typeof request !== "function") ||
    request === null
  ) {
    return resolvedPromise(
      failed(
        normalizeDwgError(
          new DwgParseError(
            Object.freeze({
              code: "DWG_INPUT_INVALID",
              category: "input",
              offset: 0,
              message:
                "The DWG worker request was not created by this protocol.",
            }),
          ),
        ),
      ),
    );
  }
  const owned = OWNED_REQUESTS.get(request);
  if (owned === undefined || typeof parseSuccess !== "function") {
    return resolvedPromise(
      Object.freeze({
        ok: false,
        error: Object.freeze({
          code: "DWG_INPUT_INVALID",
          category: "input",
          offset: 0,
          message:
            owned === undefined
              ? "The DWG worker request was not created by this protocol."
              : "A DWG worker success parser is required.",
        }),
      }),
    );
  }
  OWNED_REQUESTS.delete(request);

  let wirePayload: unknown;
  const wireTransferBuffers: ArrayBuffer[] = [];
  try {
    wirePayload = snapshotPortableValue(
      owned.payload,
      owned.snapshotState,
      0,
      wireTransferBuffers,
    );
  } catch (error: unknown) {
    return resolvedPromise(failed(normalizeDwgError(error)));
  }
  const wireRequest: WireRequest = Object.freeze({
    protocolVersion: owned.protocolVersion,
    requestId: owned.requestId,
    operation: owned.operation,
    payload: wirePayload,
  });
  const wireTransferList = Object.freeze(wireTransferBuffers);
  // The factory brand binds the erased WeakMap entry to this generic request.
  const ownedOperation = owned.operation as Operation;

  return superviseWorker(
    worker,
    wireRequest,
    (response: unknown): DwgWorkerResponse<Result> => {
      const parsed = parseDwgWorkerResponse(
        response,
        owned.requestId,
        ownedOperation,
        parseSuccess,
        owned.snapshotState,
      );
      if (!parsed.ok) throw new DwgParseError(parsed.error);
      return parsed.value;
    },
    options,
    wireTransferList,
  );
}
