import { strict as assert } from "node:assert";
import { layoutToCadDocument } from "@/lib/cad/cad-document";
import type { DocumentLifecyclePort } from "./controller";
import type { CadRecoveryRecord, saveCadRecovery } from "@/lib/cad/cad-recovery";
import {
  wrapDocumentPortForCrashRecovery,
  writeCrashRecovery,
  type LastSavedSnapshot,
} from "./crash-recovery-port";

const doc = layoutToCadDocument(
  { assets: [{ id: "a", kind: "machine", x: 0, y: 0, w: 1, h: 1, rotation: 0 }] },
  { unit: "mm" },
);

function fakePort(overrides: Partial<DocumentLifecyclePort> = {}): DocumentLifecyclePort {
  return {
    open: async () => ({ cadDocument: doc, cadDocumentVersion: 1 }),
    saveContent: async () => ({ cadDocumentVersion: 2 }),
    saveArchive: async () => ({ cadDocumentVersion: 2 }),
    versionConflict: () => null,
    ...overrides,
  };
}

/** Un `ref`-like sencillo para las pruebas: el propio módulo ya no depende de uno. */
function capturingSink() {
  const captured: LastSavedSnapshot[] = [];
  return { onSaveContent: (s: LastSavedSnapshot) => captured.push(s), captured };
}

async function main() {
  // El caso que arregla T-72(h): cada saveContent deja una copia ANTES de
  // delegar, así que si el editor se cae justo después, el snapshot ya está.
  {
    const sink = capturingSink();
    let delegatedWith: unknown = null;
    const wrapped = wrapDocumentPortForCrashRecovery(
      fakePort({
        saveContent: async (id, document, version) => {
          delegatedWith = { id, document, version };
          return { cadDocumentVersion: version + 1 };
        },
      }),
      sink.onSaveContent,
    );
    assert.equal(sink.captured.length, 0, "nada capturado antes del primer guardado");
    const receipt = await wrapped.saveContent("doc-1", doc, 5);
    assert.equal(receipt.cadDocumentVersion, 6, "el guardado real se ejecuta sin cambios");
    assert.equal(sink.captured.length, 1, "el snapshot se capturó");
    const captured = sink.captured[0];
    assert.equal(captured.documentId, "doc-1");
    assert.equal(captured.version, 5, "la versión capturada es la ESPERADA, no la devuelta");
    assert.deepEqual(captured.document, doc);
    assert.deepEqual(delegatedWith, { id: "doc-1", document: doc, version: 5 });
  }

  // Un guardado que falla no deja el snapshot en un estado peor que antes:
  // se capturó ANTES de intentar, así que sigue disponible aunque el
  // guardado real reviente después (p. ej. un 409 de CAS).
  {
    const sink = capturingSink();
    const wrapped = wrapDocumentPortForCrashRecovery(
      fakePort({
        saveContent: async () => {
          throw new Error("409");
        },
      }),
      sink.onSaveContent,
    );
    await assert.rejects(() => wrapped.saveContent("doc-2", doc, 1), /409/);
    assert.equal(sink.captured.length, 1, "el snapshot sobrevive a un guardado que falla después de capturarse");
  }

  // saveArchive no se toca: viaja como Blob ya codificado y capturarlo
  // exigiría decodificar gzip en cada guardado grande. Se documenta la
  // limitación en vez de fingir cobertura que no existe.
  {
    const sink = capturingSink();
    let archiveCalls = 0;
    const wrapped = wrapDocumentPortForCrashRecovery(
      fakePort({
        saveArchive: async () => {
          archiveCalls += 1;
          return { cadDocumentVersion: 9 };
        },
      }),
      sink.onSaveContent,
    );
    await wrapped.saveArchive("doc-3", new Blob(["x"]), 1);
    assert.equal(archiveCalls, 1, "saveArchive se delega sin cambios");
    assert.equal(sink.captured.length, 0, "saveArchive no captura snapshot (limitación documentada)");
  }

  // open/versionConflict pasan intactos: el envoltorio sólo toca saveContent.
  {
    const sink = capturingSink();
    const conflict = { current: 7 };
    const wrapped = wrapDocumentPortForCrashRecovery(
      fakePort({ versionConflict: () => conflict }),
      sink.onSaveContent,
    );
    assert.deepEqual(wrapped.versionConflict(new Error("x")), conflict);
    const opened = await wrapped.open("doc-4");
    assert.equal(opened.cadDocumentVersion, 1);
  }

  // Un callback que lanza no puede impedir el guardado real.
  {
    const wrapped = wrapDocumentPortForCrashRecovery(fakePort(), () => {
      throw new Error("el observador se rompió");
    });
    const receipt = await wrapped.saveContent("doc-5", doc, 1);
    assert.equal(receipt.cadDocumentVersion, 2, "el guardado real no se ve afectado por un callback roto");
  }

  // Revisión de T-72(h): el registro de emergencia se sella con la hora del
  // guardado capturado, NO con la de la caída. Sellado con la hora de la
  // caída era el más nuevo del carril y tapaba el checkpoint posterior con
  // las ediciones sin guardar (todo el orden del diario es por `savedAtMs`).
  // Y generación 0: no captura nada que el guardado no llevara ya.
  {
    const sink = capturingSink();
    const wrapped = wrapDocumentPortForCrashRecovery(fakePort(), sink.onSaveContent);
    await wrapped.saveContent("doc-6", doc, 3);
    const snapshot = sink.captured[0];
    const calls: Parameters<typeof saveCadRecovery>[] = [];
    const save: typeof saveCadRecovery = async (...args) => {
      calls.push(args);
      return {} as CadRecoveryRecord;
    };
    const scope = { tenantId: "t", userId: "u", projectId: "p", model: "doc-6", revision: "DOCUMENT" };
    await writeCrashRecovery(save, scope, snapshot);
    assert.equal(calls.length, 1, "un solo registro de emergencia por caída");
    const [calledScope, document, version, editGeneration, options] = calls[0];
    assert.equal(calledScope, scope, "el ámbito es el del editor, con projectId");
    assert.equal(document, doc, "el documento es el último que viajó al servidor");
    assert.equal(version, 3, "la versión base es la ESPERADA en ese guardado");
    assert.equal(editGeneration, 0, "generación 0: nada más allá de lo que el guardado ya llevaba");
    assert.deepEqual(
      options,
      { savedAtMs: snapshot.savedAtMs },
      "el sello es la hora del guardado capturado, no la de la caída",
    );
    assert.ok(Number.isFinite(snapshot.savedAtMs), "el snapshot trae un sello con el que estampar");
  }
}

main().then(() => console.log("crash-recovery-port: OK"));
