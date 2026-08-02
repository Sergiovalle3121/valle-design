import { strict as assert } from "node:assert";
import {
  layoutToCadDocument,
  serializeCadDocument,
} from "@/lib/cad/cad-document";
import { createDebouncedAutosave } from "./autosave";
import {
  CadCasConflictError,
  DocumentLifecycleController,
  type DocumentLifecycleMetric,
} from "./controller";
import { CanonicalHistory, cancelActiveCommand } from "./history-controller";

async function main() {
  const original = layoutToCadDocument(
    {
      assets: [
        { id: "box", kind: "machine", x: 1, y: 2, w: 3, h: 4, rotation: 0 },
      ],
    },
    { unit: "mm" },
  );
  const metricNames: DocumentLifecycleMetric[] = [];
  const requests: { path: string; init?: RequestInit }[] = [];
  let serverVersion = 3;
  let serverDocument = original;
  const controller = new DocumentLifecycleController(
    {
      async request(path, init) {
        requests.push({ path, init });
        if (!init && path.endsWith("/empty"))
          return new Response(
            JSON.stringify({
              id: "empty",
              cadDocumentVersion: 0,
              cadDocument: null,
            }),
            { status: 200 },
          );
        if (!init)
          return new Response(
            JSON.stringify({
              id: "doc-1",
              cadDocumentVersion: serverVersion,
              cadDocument: serverDocument,
            }),
            { status: 200 },
          );
        const payload = JSON.parse(String(init.body));
        if (payload.expectedCadDocumentVersion !== serverVersion)
          return new Response(
            JSON.stringify({ cadDocumentVersion: serverVersion }),
            { status: 409 },
          );
        serverDocument = payload.cadDocument;
        serverVersion += 1;
        return new Response(
          JSON.stringify({ cadDocumentVersion: serverVersion }),
          { status: 200 },
        );
      },
    },
    {
      record(name) {
        metricNames.push(name);
      },
    },
  );

  // Apertura por documentId, fases observables e identidad semántica al reabrir.
  let indexed = false,
    synced = false,
    rendered = false;
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
  assert.equal(requests[0].path, "/v1/cad/documents/doc-1");
  assert.equal(opened.version, 3);
  assert.ok(indexed && synced && rendered);
  assert.deepEqual(metricNames.slice(0, 6), [
    "download",
    "parse",
    "migration",
    "indexing",
    "scene-sync",
    "render",
  ]);

  // A newly created document has no persisted content yet. Open it as an
  // empty canonical document instead of falling back to legacy sentinels.
  const empty = await controller.open("empty");
  assert.equal(empty.version, 0);
  assert.deepEqual(empty.document, layoutToCadDocument({}, { unit: "mm" }));

  // Save CAS exitoso crea la versión inmutable siguiente.
  const saved = await controller.createVersion(
    "doc-1",
    opened.document,
    opened.version,
  );
  assert.equal(saved.version, 4);
  assert.equal(metricNames.at(-1), "serialization");

  // Un escritor atrasado recibe conflicto explícito y nunca pisa el canónico.
  await assert.rejects(
    () => controller.save("doc-1", opened.document, 3),
    CadCasConflictError,
  );
  const reopened = await controller.open("doc-1");
  assert.equal(
    serializeCadDocument(reopened.document),
    serializeCadDocument(original),
  );

  // Autosave/recovery debounced: una ráfaga sólo persiste el último checkpoint.
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
  await new Promise((resolve) => setTimeout(resolve, 25));
  await autosave.flush();
  assert.deepEqual(recovery, [3]);

  // Caracterización previa a extraer routing: cancelación y undo/redo conservan
  // snapshots del documento canónico, no un modelo geométrico paralelo.
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
  const history = new CanonicalHistory(original);
  history.checkpoint({ ...original, meta: { ...original.meta, version: 2 } });
  assert.equal(history.undo().meta.version, original.meta.version);
  assert.equal(history.redo().meta.version, 2);

  console.log(
    "ok document lifecycle: open/save/CAS/autosave/recovery/cancel/undo/redo/reopen",
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
