import { strict as assert } from "node:assert";
import {
  layoutToCadDocument,
  serializeCadDocument,
  type CadDocument,
} from "@/lib/cad/cad-document";
import { createDebouncedAutosave } from "./autosave";
import {
  CAD_DOCUMENT_ARCHIVE_THRESHOLD_BYTES,
  CadCasConflictError,
  DocumentLifecycleController,
  type DocumentLifecycleMetric,
} from "./controller";
import { CanonicalHistory, cancelActiveCommand } from "./history-controller";

const wait = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

async function lifecycleContract() {
  const original = layoutToCadDocument(
    {
      assets: [
        {
          id: "box",
          kind: "machine",
          label: "Cortadora",
          x: 1,
          y: 2,
          w: 3,
          h: 4,
          rotation: 0,
        },
      ],
    },
    { unit: "mm" },
  );
  const metricNames: DocumentLifecycleMetric[] = [];
  const calls: Array<{
    kind: "open" | "content" | "archive";
    documentId: string;
    expectedVersion?: number;
    document?: CadDocument;
    archive?: Blob;
  }> = [];
  let serverVersion = 3;
  let serverDocument = original;
  class FakeVersionConflict extends Error {
    constructor(readonly current: number) {
      super("version conflict");
    }
  }
  const persist = (nextDocument: CadDocument, expectedVersion: number) => {
    if (expectedVersion !== serverVersion)
      throw new FakeVersionConflict(serverVersion);
    serverDocument = nextDocument;
    serverVersion += 1;
    return { cadDocumentVersion: serverVersion };
  };
  const controller = new DocumentLifecycleController(
    {
      async open(documentId) {
        calls.push({ kind: "open", documentId });
        return documentId === "empty"
          ? { id: "empty", cadDocumentVersion: 0, cadDocument: null }
          : {
              id: "doc-1",
              cadDocumentVersion: serverVersion,
              cadDocument: serverDocument,
            };
      },
      async saveContent(documentId, document, expectedVersion) {
        calls.push({
          kind: "content",
          documentId,
          document,
          expectedVersion,
        });
        return persist(document, expectedVersion);
      },
      async saveArchive(documentId, archive, expectedVersion) {
        const document = JSON.parse(await archive.text()) as CadDocument;
        calls.push({
          kind: "archive",
          documentId,
          document,
          archive,
          expectedVersion,
        });
        return persist(document, expectedVersion);
      },
      versionConflict(error) {
        return error instanceof FakeVersionConflict
          ? { current: error.current }
          : null;
      },
    },
    {
      record(name) {
        metricNames.push(name);
      },
    },
    async (json) => new Blob([json], { type: "application/gzip" }),
  );

  let indexed = false;
  let synced = false;
  let rendered = false;
  const opened = await controller.open("doc-1", {
    index: () => {
      indexed = true;
    },
    syncScene: () => {
      synced = true;
    },
    render: () => {
      rendered = true;
    },
  });
  assert.deepEqual(calls[0], { kind: "open", documentId: "doc-1" });
  assert.equal(opened.version, 3);
  assert.ok(indexed && synced && rendered);
  // JSON parsing is owned by the generated client, so the lifecycle reports
  // only phases it can actually measure.
  assert.deepEqual(metricNames.slice(0, 5), [
    "transport",
    "migration",
    "indexing",
    "scene-sync",
    "render",
  ]);

  const empty = await controller.open("empty");
  assert.equal(empty.version, 0);
  assert.deepEqual(empty.document, layoutToCadDocument({}, { unit: "mm" }));

  const saved = await controller.createVersion(
    "doc-1",
    opened.document,
    opened.version,
  );
  assert.equal(saved.version, 4);
  assert.equal(calls.at(-1)?.kind, "content");
  assert.equal(calls.at(-1)?.expectedVersion, 3);
  assert.equal(metricNames.at(-1), "serialization");

  await assert.rejects(
    () => controller.save("doc-1", opened.document, 3),
    (error: unknown) =>
      error instanceof CadCasConflictError && error.serverVersion === 4,
  );
  const reopened = await controller.open("doc-1");
  assert.equal(
    serializeCadDocument(reopened.document),
    serializeCadDocument(original),
  );

  const large = layoutToCadDocument(
    {
      assets: [
        {
          id: "large",
          kind: "machine",
          label: "x".repeat(CAD_DOCUMENT_ARCHIVE_THRESHOLD_BYTES + 32),
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          rotation: 0,
        },
      ],
    },
    { unit: "mm" },
  );
  const archived = await controller.save("doc-1", large, 4);
  assert.equal(archived.version, 5);
  const archiveCall = calls.at(-1);
  assert.equal(archiveCall?.kind, "archive");
  assert.equal(archiveCall?.expectedVersion, 4);
  assert.equal(archiveCall?.archive?.type, "application/gzip");
  assert.equal(
    (archiveCall?.document?.entities[0] as { label?: string } | undefined)
      ?.label?.length,
    CAD_DOCUMENT_ARCHIVE_THRESHOLD_BYTES + 32,
  );
}

async function autosaveContract() {
  const autosave = createDebouncedAutosave(10);
  const recovery: number[] = [];
  autosave.schedule(async () => {
    recovery.push(1);
  });
  autosave.schedule(async () => {
    recovery.push(2);
  });
  autosave.schedule(async () => {
    recovery.push(3);
  });
  await autosave.flush();
  assert.deepEqual(recovery, [3]);

  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let active = 0;
  let maxActive = 0;
  const order: string[] = [];
  const first = autosave.run(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push("first:start");
    await firstGate;
    order.push("first:end");
    active -= 1;
  });
  await wait(0);
  const second = autosave.run(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push("second");
    active -= 1;
  });
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(maxActive, 1);
  assert.deepEqual(order, ["first:start", "first:end", "second"]);

  let casVersion = 0;
  const observedCasVersions: number[] = [];
  const casSave = () =>
    autosave.run(async () => {
      const expectedVersion = casVersion;
      observedCasVersions.push(expectedVersion);
      await wait(1);
      casVersion = expectedVersion + 1;
    });
  await Promise.all([casSave(), casSave()]);
  assert.deepEqual(observedCasVersions, [0, 1]);

  autosave.schedule(async () => {
    order.push("superseded-autosave");
  });
  await autosave.run(async () => {
    order.push("manual");
  });
  await wait(15);
  await autosave.flush();
  assert.equal(order.includes("superseded-autosave"), false);
  assert.equal(order.at(-1), "manual");

  await assert.rejects(
    () =>
      autosave.run(async () => {
        throw new Error("offline");
      }),
    /offline/,
  );
  assert.equal(autosave.getState().status, "error");
  await autosave.run(async () => undefined);
  assert.equal(autosave.getState().status, "saved");
}

function historyContract() {
  type State = {
    version: number;
    shared: readonly number[];
    payload: string;
  };
  const shared = Object.freeze([1, 2, 3]);
  const first: State = { version: 1, shared, payload: "a" };
  const second: State = { ...first, version: 2 };
  const third: State = { ...second, version: 3 };
  let now = 0;
  const metrics: string[] = [];
  const history = new CanonicalHistory(first, {
    maxEntries: 5,
    maxRetainedBytes: 500,
    estimateBytes: () => 100,
    groupWindowMs: 250,
    now: () => now,
    onMetric: (metric) => {
      metrics.push(
        `${metric.event}:${metric.undoDepth}:${metric.retainedBytes}:${metric.sharedTopLevelReferences}`,
      );
    },
  });

  history.checkpoint(second, { groupKey: "nudge:asset-1" });
  now = 100;
  history.checkpoint(third, { groupKey: "nudge:asset-1" });
  assert.deepEqual(history.depths(), { undo: 1, redo: 0 });
  assert.strictEqual(history.undo(third), first);
  assert.strictEqual(history.redo(first), third);
  assert.ok(metrics.some((metric) => metric.startsWith("group:")));
  assert.ok(metrics.some((metric) => Number(metric.split(":").at(-1)) > 0));

  const recovery = history.createRecoveryPoint();
  history.undo(third);
  history.restoreRecoveryPoint(recovery);
  assert.deepEqual(history.depths(), { undo: 1, redo: 0 });
  assert.strictEqual(history.value(), third);
  now = 1_000;
  const fourth: State = { ...third, version: 4 };
  history.checkpoint(fourth);
  assert.strictEqual(history.cancelLastCheckpoint(), third);
  history.restoreRecoveryPoint(recovery);
  assert.strictEqual(history.value(), third);

  for (let version = 4; version <= 9; version += 1) {
    now += 1_000;
    history.checkpoint({ ...third, version });
  }
  assert.ok(history.stats().retainedBytes <= 500);
  assert.ok(history.depths().undo <= 5);

  let cancelled = false;
  assert.equal(
    cancelActiveCommand({
      cancel() {
        cancelled = true;
      },
    }),
    true,
  );
  assert.equal(cancelled, true);
}

async function main() {
  await lifecycleContract();
  await autosaveContract();
  historyContract();
  console.log(
    "ok document lifecycle: archive/CAS/serialized autosave/flush/bounded grouped history/recovery",
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
