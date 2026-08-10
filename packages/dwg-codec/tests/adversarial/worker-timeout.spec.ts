import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import {
  createDwgWorkerRequest,
  superviseDwgWorker,
  type DwgWorkerValueParser,
} from "../../src/worker/protocol.js";
import {
  DWG_FIRST_PARTY_WORKER_TRANSPORT,
  MAX_DWG_WORKER_TRANSFER_BUFFERS,
  superviseWorker,
  type WorkerLike,
  type WorkerScheduler,
  type WorkerTransferList,
} from "../../src/security/worker-supervisor.js";
import { assertDwgError } from "../support/assert.js";

type WorkerEventType = "message" | "error";
type WorkerListener = (event: unknown) => void;

class ManualScheduler implements WorkerScheduler {
  private readonly callbacks = new Map<object, () => void>();
  public setTimeout(callback: () => void, _delayMs: number): unknown {
    const handle = {};
    this.callbacks.set(handle, callback);
    return handle;
  }
  public clearTimeout(handle: unknown): void {
    this.callbacks.delete(handle as object);
  }
  public fireAll(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback();
  }
  public get pending(): number {
    return this.callbacks.size;
  }
}

class FakeWorker implements WorkerLike {
  public readonly dwgTransportContract = DWG_FIRST_PARTY_WORKER_TRANSPORT;
  private readonly listeners: Record<WorkerEventType, Set<WorkerListener>> = {
    error: new Set(),
    message: new Set(),
  };
  public readonly posted: unknown[] = [];
  public terminateCalls = 0;
  private retainedMessageListener: WorkerListener | undefined;
  public postMessage(
    message: unknown,
    _transferList: WorkerTransferList,
  ): void {
    this.posted.push(message);
  }
  public terminate(): void {
    this.terminateCalls += 1;
  }
  public addEventListener(
    type: WorkerEventType,
    listener: WorkerListener,
  ): void {
    this.listeners[type].add(listener);
    if (type === "message") this.retainedMessageListener = listener;
  }
  public removeEventListener(
    type: WorkerEventType,
    listener: WorkerListener,
  ): void {
    this.listeners[type].delete(listener);
  }
  public emitMessage(data: unknown): void {
    for (const listener of this.listeners.message) listener({ data });
  }
  public emitError(error: unknown): void {
    for (const listener of this.listeners.error) listener(error);
  }
  public listenerCount(): number {
    return this.listeners.message.size + this.listeners.error.size;
  }

  public invokeRetainedMessage(data: unknown): void {
    this.retainedMessageListener?.({ data });
  }
}

class SynchronousDeadlineScheduler implements WorkerScheduler {
  public clearCalls = 0;
  public setTimeout(callback: () => void, _delayMs: number): unknown {
    callback();
    return { kind: "already-fired" };
  }
  public clearTimeout(_handle: unknown): void {
    this.clearCalls += 1;
  }
}

function acceptWorkerMessage(message: unknown): unknown {
  return message;
}

interface ProbePayload {
  readonly bytes: Uint8Array;
}

interface ProbeAck {
  readonly accepted: boolean;
}

interface ByteAck {
  readonly bytes: Uint8Array;
}

function parseProbePayload(
  value: unknown,
  operation: "probe",
): value is ProbePayload {
  return (
    operation === "probe" &&
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    "bytes" in value &&
    value.bytes instanceof Uint8Array
  );
}

function parseProbeAck(value: unknown, operation: "probe"): value is ProbeAck {
  return (
    operation === "probe" &&
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    "accepted" in value &&
    typeof value.accepted === "boolean"
  );
}

function parseByteAck(value: unknown, operation: "probe"): value is ByteAck {
  return (
    operation === "probe" &&
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    "bytes" in value &&
    value.bytes instanceof Uint8Array
  );
}

class ProtocolWorker implements WorkerLike {
  public readonly dwgTransportContract = DWG_FIRST_PARTY_WORKER_TRANSPORT;
  private readonly listeners: Record<WorkerEventType, Set<WorkerListener>> = {
    error: new Set(),
    message: new Set(),
  };
  public readonly posted: unknown[] = [];
  public readonly postedTransferLists: WorkerTransferList[] = [];
  public terminateCalls = 0;

  public constructor(
    private readonly terminateImplementation: () => void | Promise<void> = () =>
      undefined,
  ) {}

  public postMessage(message: unknown, transferList: WorkerTransferList): void {
    this.posted.push(message);
    this.postedTransferLists.push(transferList);
  }

  public terminate(): void | Promise<void> {
    this.terminateCalls += 1;
    return this.terminateImplementation();
  }

  public addEventListener(
    type: WorkerEventType,
    listener: WorkerListener,
  ): void {
    this.listeners[type].add(listener);
  }

  public removeEventListener(
    type: WorkerEventType,
    listener: WorkerListener,
  ): void {
    this.listeners[type].delete(listener);
  }

  public emitMessage(data: unknown): void {
    for (const listener of this.listeners.message) listener({ data });
  }
}

function protocolResponse(requestId: string, value: unknown): unknown {
  return {
    protocolVersion: 1,
    requestId,
    ok: true,
    value,
  };
}

function runProtocolResponse<Result>(
  requestId: string,
  responseValue: unknown,
  parseSuccess: DwgWorkerValueParser<Result, "probe">,
) {
  const request = createDwgWorkerRequest(
    requestId,
    "probe",
    { bytes: Uint8Array.of(1) },
    parseProbePayload,
  );
  const worker = new ProtocolWorker();
  const pending = superviseDwgWorker(worker, request, parseSuccess, {
    scheduler: new ManualScheduler(),
    timeoutMs: 1_000,
  });
  worker.emitMessage(responseValue);
  return pending;
}

test("a scheduler that fires synchronously never posts after the selected timeout", async () => {
  const scheduler = new SynchronousDeadlineScheduler();
  const worker = new FakeWorker();
  const result = await superviseWorker(
    worker,
    { mustNotRun: true },
    acceptWorkerMessage,
    { scheduler, timeoutMs: 1 },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "DWG_DEADLINE_EXCEEDED");
  assert.deepEqual(worker.posted, []);
  assert.equal(worker.terminateCalls, 1);
  assert.equal(worker.listenerCount(), 0);
  assert.equal(scheduler.clearCalls, 1);
});

test("manual deadline terminates a worker and removes listeners deterministically", async () => {
  const scheduler = new ManualScheduler();
  const worker = new FakeWorker();
  const pending = superviseWorker(
    worker,
    { operation: "probe" },
    acceptWorkerMessage,
    { scheduler, timeoutMs: 25 },
  );
  assert.deepEqual(worker.posted, [{ operation: "probe" }]);
  assert.equal(worker.listenerCount(), 2);
  assert.equal(scheduler.pending, 1);

  scheduler.fireAll();
  const result = await pending;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "DWG_DEADLINE_EXCEEDED");
  assert.equal(worker.terminateCalls, 1);
  assert.equal(worker.listenerCount(), 0);
  assert.equal(scheduler.pending, 0);
});

test("message success clears the hard deadline and terminates the worker", async () => {
  const scheduler = new ManualScheduler();
  const worker = new FakeWorker();
  const pending = superviseWorker(worker, "request", acceptWorkerMessage, {
    scheduler,
    timeoutMs: 25,
  });
  worker.emitMessage({ value: 42 });
  assert.deepEqual(await pending, { ok: true, value: { value: 42 } });
  assert.equal(worker.terminateCalls, 1);
  assert.equal(worker.listenerCount(), 0);
  assert.equal(scheduler.pending, 0);
  scheduler.fireAll();
  assert.equal(worker.terminateCalls, 1);
});

test("selected and in-progress supervision ignores retained or reentrant messages", async () => {
  const scheduler = new ManualScheduler();
  const worker = new FakeWorker();
  let parserCalls = 0;
  const pending = superviseWorker(
    worker,
    "request",
    (message: unknown): unknown => {
      parserCalls += 1;
      worker.invokeRetainedMessage("reentrant");
      return message;
    },
    { scheduler, timeoutMs: 25 },
  );

  worker.emitMessage("first");
  assert.deepEqual(await pending, { ok: true, value: "first" });
  worker.invokeRetainedMessage("late");
  assert.equal(parserCalls, 1);
  assert.equal(worker.terminateCalls, 1);
});

test("settlement uses the captured Promise intrinsic after prototype poisoning", async () => {
  const scheduler = new ManualScheduler();
  const worker = new FakeWorker();
  const pending = superviseWorker(
    worker,
    "request",
    (message: unknown): unknown => message,
    { scheduler, timeoutMs: 25 },
  );
  const thenDescriptor = Object.getOwnPropertyDescriptor(
    Promise.prototype,
    "then",
  );
  assert.notEqual(thenDescriptor, undefined);
  try {
    Object.defineProperty(Promise.prototype, "then", {
      ...thenDescriptor,
      value(): never {
        throw new Error("poisoned Promise.prototype.then");
      },
    });
    worker.emitMessage("accepted");
  } finally {
    if (thenDescriptor !== undefined) {
      Object.defineProperty(Promise.prototype, "then", thenDescriptor);
    }
  }
  assert.deepEqual(await pending, { ok: true, value: "accepted" });
  assert.equal(worker.terminateCalls, 1);
});

test("worker error fails typed, clears listeners and terminates once", async () => {
  const scheduler = new ManualScheduler();
  const worker = new FakeWorker();
  const pending = superviseWorker(worker, "request", acceptWorkerMessage, {
    scheduler,
    timeoutMs: 25,
  });
  worker.emitError(new Error("synthetic worker failure"));
  const result = await pending;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "DWG_INTERNAL_ERROR");
  assert.equal(worker.terminateCalls, 1);
  assert.equal(worker.listenerCount(), 0);
  assert.equal(scheduler.pending, 0);
});

class NodeWorkerAdapter implements WorkerLike {
  public readonly dwgTransportContract = DWG_FIRST_PARTY_WORKER_TRANSPORT;
  private readonly wrappers: Record<
    WorkerEventType,
    Map<WorkerListener, (value: unknown) => void>
  > = {
    error: new Map(),
    message: new Map(),
  };

  public constructor(private readonly worker: Worker) {}

  public postMessage(message: unknown, transferList: WorkerTransferList): void {
    this.worker.postMessage(message, transferList);
  }

  public async terminate(): Promise<void> {
    await this.worker.terminate();
  }

  public addEventListener(
    type: WorkerEventType,
    listener: WorkerListener,
  ): void {
    const wrapper =
      type === "message"
        ? (data: unknown): void => listener({ data })
        : listener;
    this.wrappers[type].set(listener, wrapper);
    this.worker.on(type, wrapper);
  }

  public removeEventListener(
    type: WorkerEventType,
    listener: WorkerListener,
  ): void {
    const wrapper = this.wrappers[type].get(listener);
    if (wrapper !== undefined) {
      this.worker.off(type, wrapper);
      this.wrappers[type].delete(listener);
    }
  }
}

const realScheduler: WorkerScheduler = {
  clearTimeout(handle: unknown): void {
    clearTimeout(handle as NodeJS.Timeout);
  },
  setTimeout(callback: () => void, delayMs: number): unknown {
    return setTimeout(callback, delayMs);
  },
};

function waitForReady(worker: Worker): Promise<void> {
  return new Promise((resolveReady, rejectReady) => {
    const readinessDeadline = setTimeout(
      () => rejectReady(new Error("worker did not become ready")),
      2_000,
    );
    worker.once("error", (error) => {
      clearTimeout(readinessDeadline);
      rejectReady(error);
    });
    worker.once("message", (message) => {
      clearTimeout(readinessDeadline);
      if (message !== "ready")
        rejectReady(
          new Error(`unexpected readiness message: ${String(message)}`),
        );
      else resolveReady();
    });
  });
}

test(
  "a real outer worker deadline terminates non-cooperative synchronous work",
  { timeout: 5_000 },
  async () => {
    const worker = new Worker(
      `
      const { parentPort } = require('node:worker_threads');
      parentPort.postMessage('ready');
      parentPort.once('message', () => {
        let state = 0;
        while (true) state = (state + 1) >>> 0;
      });
    `,
      { eval: true },
    );
    try {
      await waitForReady(worker);
      const result = await superviseWorker(
        new NodeWorkerAdapter(worker),
        "start",
        acceptWorkerMessage,
        {
          scheduler: realScheduler,
          timeoutMs: 50,
        },
      );
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "DWG_DEADLINE_EXCEEDED");
    } finally {
      await worker.terminate();
    }
  },
);

test("request bytes are copied privately before caller mutation", async () => {
  const source = Uint8Array.of(1, 2, 3);
  const request = createDwgWorkerRequest(
    "owned-request",
    "probe",
    { bytes: source },
    parseProbePayload,
  );
  source.fill(9);
  assert.deepEqual(request.payload.bytes, Uint8Array.of(1, 2, 3));
  request.payload.bytes.fill(8);

  const worker = new ProtocolWorker();
  const pending = superviseDwgWorker(worker, request, parseProbeAck, {
    scheduler: new ManualScheduler(),
    timeoutMs: 1_000,
  });
  assert.equal(worker.posted.length, 1);
  const posted = worker.posted[0];
  assert.equal(typeof posted, "object");
  assert.notEqual(posted, null);
  if (typeof posted === "object" && posted !== null && "payload" in posted) {
    const payload = posted.payload;
    assert.equal(typeof payload, "object");
    assert.notEqual(payload, null);
    if (typeof payload === "object" && payload !== null && "bytes" in payload) {
      assert.deepEqual(payload.bytes, Uint8Array.of(1, 2, 3));
      const [transferList] = worker.postedTransferLists;
      assert.notEqual(transferList, undefined);
      assert.equal(transferList?.length, 1);
      assert.equal(transferList?.[0], payload.bytes.buffer);
      assert.equal(new Set(transferList).size, transferList?.length);
    }
  }
  worker.emitMessage(protocolResponse("owned-request", { accepted: true }));
  const result = await pending;
  assert.equal(result.ok, true);
});

test("request copies share one cumulative portable snapshot budget", async () => {
  const source = new Uint8Array(22 * 1024 * 1024);
  const request = createDwgWorkerRequest(
    "cumulative-budget",
    "probe",
    { bytes: source },
    parseProbePayload,
  );
  const worker = new ProtocolWorker();
  const result = await superviseDwgWorker(worker, request, parseProbeAck, {
    scheduler: new ManualScheduler(),
    timeoutMs: 1_000,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "DWG_INPUT_INVALID");
  assert.deepEqual(worker.posted, []);
  assert.equal(worker.terminateCalls, 0);
});

test("request byte-view cardinality is cumulative before worker transfer", () => {
  const bytes = new Array<Uint8Array>(
    Math.floor(MAX_DWG_WORKER_TRANSFER_BUFFERS / 2) + 1,
  ).fill(new Uint8Array());
  assertDwgError(
    () =>
      createDwgWorkerRequest(
        "byte-view-cardinality",
        "probe",
        { bytes },
        (value: unknown): value is { readonly bytes: readonly Uint8Array[] } =>
          typeof value === "object" && value !== null && "bytes" in value,
      ),
    "DWG_INPUT_INVALID",
  );
});

test("the independent final response snapshot shares the cumulative budget", async () => {
  const source = new Uint8Array(32 * 1024 * 1024);
  const parsed = await runProtocolResponse(
    "response-cumulative-budget",
    protocolResponse("response-cumulative-budget", { bytes: source }),
    parseByteAck,
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.error.code, "DWG_INPUT_INVALID");
});

test(
  "request snapshots reject SharedArrayBuffer at any structured payload field",
  { skip: typeof SharedArrayBuffer === "undefined" },
  () => {
    const shared = new SharedArrayBuffer(3);
    const bytes = new Uint8Array(shared);
    assertDwgError(
      () =>
        createDwgWorkerRequest(
          "shared-request",
          "probe",
          { bytes },
          parseProbePayload,
        ),
      "DWG_SHARED_BUFFER_REJECTED",
    );
  },
);

test("hostile request proxies and accessors fail typed without escaping", () => {
  const hostile = new Proxy(
    {},
    {
      ownKeys(): never {
        throw new Error("must not escape");
      },
    },
  );
  assertDwgError(
    () =>
      createDwgWorkerRequest(
        "proxy-request",
        "probe",
        hostile,
        parseProbePayload,
      ),
    "DWG_INPUT_INVALID",
  );

  let getterReads = 0;
  const accessor = Object.defineProperty({}, "bytes", {
    enumerable: true,
    get(): Uint8Array {
      getterReads += 1;
      return Uint8Array.of(1);
    },
  });
  assertDwgError(
    () =>
      createDwgWorkerRequest(
        "accessor-request",
        "probe",
        accessor,
        parseProbePayload,
      ),
    "DWG_INPUT_INVALID",
  );
  assert.equal(getterReads, 0);
});

test("hostile response proxies become typed parse failures", async () => {
  const hostile = new Proxy(
    {},
    {
      ownKeys(): never {
        throw new Error("must not escape");
      },
    },
  );
  const parsed = await runProtocolResponse(
    "response-proxy",
    hostile,
    parseProbeAck,
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.error.code, "DWG_INPUT_INVALID");
});

test("a success parser rejects partial and extra response values", async () => {
  const prototypeKeyExtra = { accepted: true };
  Object.defineProperty(prototypeKeyExtra, "__proto__", {
    enumerable: true,
    value: { injected: true },
  });
  for (const value of [
    {},
    { accepted: true, partial: true },
    prototypeKeyExtra,
  ]) {
    const parsed = await runProtocolResponse(
      "strict-response",
      protocolResponse("strict-response", value),
      parseProbeAck,
    );
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.error.code, "DWG_INPUT_INVALID");
    assert.equal(Object.hasOwn(parsed, "value"), false);
  }
});

test("response correlation is enforced inside supervised termination", async () => {
  const parsed = await runProtocolResponse(
    "expected-response",
    protocolResponse("wrong-response", { accepted: true }),
    parseProbeAck,
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.error.code, "DWG_INPUT_INVALID");
});

test("a parsed success owns bytes before the worker source can mutate", async () => {
  const source = Uint8Array.of(4, 5, 6);
  const pending = runProtocolResponse(
    "copied-response",
    protocolResponse("copied-response", { bytes: source }),
    parseByteAck,
  );
  source.fill(9);
  const parsed = await pending;
  assert.equal(parsed.ok, true);
  if (parsed.ok && parsed.value.ok) {
    assert.deepEqual(parsed.value.value.bytes, Uint8Array.of(4, 5, 6));
  }
});

test("a success parser cannot retain and mutate the returned snapshot", async () => {
  let retained: ByteAck | undefined;
  const retainingParser: DwgWorkerValueParser<ByteAck, "probe"> = (
    value,
    operation,
  ): value is ByteAck => {
    if (!parseByteAck(value, operation)) return false;
    retained = value;
    return true;
  };
  const parsed = await runProtocolResponse(
    "isolated-parser-snapshot",
    protocolResponse("isolated-parser-snapshot", {
      bytes: Uint8Array.of(4, 5, 6),
    }),
    retainingParser,
  );
  assert.equal(parsed.ok, true);
  assert.notEqual(retained, undefined);
  retained?.bytes.fill(9);
  if (parsed.ok && parsed.value.ok) {
    assert.deepEqual(parsed.value.value.bytes, Uint8Array.of(4, 5, 6));
    assert.notEqual(parsed.value.value.bytes, retained?.bytes);
  }
});

test("supervision parses a response before awaiting async termination", async () => {
  let confirmTermination: (() => void) | undefined;
  const termination = new Promise<void>((resolve) => {
    confirmTermination = resolve;
  });
  const source = Uint8Array.of(7, 8);
  const request = createDwgWorkerRequest(
    "async-response",
    "probe",
    { bytes: Uint8Array.of(1) },
    parseProbePayload,
  );
  const worker = new ProtocolWorker(() => termination);
  const pending = superviseDwgWorker(worker, request, parseByteAck, {
    scheduler: new ManualScheduler(),
    timeoutMs: 1_000,
  });
  worker.emitMessage(protocolResponse("async-response", { bytes: source }));
  source.fill(0);
  confirmTermination?.();

  const result = await pending;
  assert.equal(result.ok, true);
  if (result.ok && result.value.ok) {
    assert.deepEqual(result.value.value.bytes, Uint8Array.of(7, 8));
  }
});

test("a manually forged request is never posted or accepted", async () => {
  const worker = new ProtocolWorker();
  const forged = {
    protocolVersion: 1,
    requestId: "forged",
    operation: "probe",
    payload: { bytes: Uint8Array.of(1) },
  } as const;
  const result = await superviseDwgWorker(worker, forged, parseProbeAck, {
    scheduler: new ManualScheduler(),
    timeoutMs: 1_000,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "DWG_INPUT_INVALID");
  assert.deepEqual(worker.posted, []);
  assert.equal(worker.terminateCalls, 0);
});
