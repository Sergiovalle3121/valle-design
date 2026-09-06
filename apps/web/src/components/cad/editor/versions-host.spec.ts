/**
 * EL HISTORIAL DEL SERVIDOR DESDE EL CUADRO «VERSIONES» (T-12·1).
 *
 * Antes el cuadro pedía `layout/snapshots…` —una ruta que el adaptador
 * declaraba «404 limpio»—, así que la lista salía vacía y todo botón fallaba.
 * Estas comprobaciones fijan la regla nueva sin red: la lista es el historial
 * CAS ordenado de más nuevo a más viejo; «restaurar» guarda la versión antigua
 * como nueva con el CAS de la cabeza que el editor conoce; y se niega —con la
 * frase que ve el arquitecto— cuando no hay identidad, cuando hay cambios sin
 * mandar, cuando la versión llega como puntero o cuando el servidor avanzó.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  CadDocumentInline,
  CadDocumentVersionDetail,
  CadDocumentVersionSummary,
} from "@valle/design-sdk";
import {
  CadVersionsHost,
  createCadVersionsActions,
  type CadVersionsApi,
} from "./versions-host";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const igual = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const documento = (entidades: number): CadDocumentInline =>
  ({
    meta: { version: 1, schema: 10, unit: "mm" },
    layers: [],
    entities: Array.from({ length: entidades }, (_, i) => ({
      id: `e${i}`,
      type: "line",
    })),
  }) as unknown as CadDocumentInline;

function resumen(version: number): CadDocumentVersionSummary {
  return {
    documentId: "00000000-0000-4000-8000-000000000001",
    version,
    createdAt: `2026-09-06T10:0${version}:00.000Z`,
    createdBy: "arquitecta@despacho.mx",
    sha256: null,
  } as CadDocumentVersionSummary;
}

interface Escenario {
  items?: CadDocumentVersionSummary[];
  detalle?: (version: number) => CadDocumentVersionDetail;
  restoreAs?: CadVersionsApi["restoreAs"];
  documentId?: string | null;
  cabeza?: number | null;
  sucio?: boolean;
  soloLectura?: boolean;
}

function montar(escenario: Escenario) {
  const host = new CadVersionsHost<Record<string, never>>();
  const avisos: string[] = [];
  const llamadas: { restoreAs: unknown[][]; reloads: number } = {
    restoreAs: [],
    reloads: 0,
  };
  const api: CadVersionsApi = {
    list: async () => ({ items: escenario.items ?? [] }),
    get: async (_id, version) =>
      escenario.detalle
        ? escenario.detalle(version)
        : ({ ...resumen(version), cadDocument: documento(version) } as CadDocumentVersionDetail),
    restoreAs:
      escenario.restoreAs ??
      (async (...args) => {
        llamadas.restoreAs.push(args);
        return { cadDocumentVersion: (escenario.cabeza ?? 0) + 1 };
      }),
  };
  const actions = createCadVersionsActions(host, {
    model: "AXOS-CAD-STUDIO",
    revision: "UNIVERSAL",
    documentId: escenario.documentId ?? undefined,
    refs: {
      documentId: { current: escenario.documentId ?? undefined },
      data: {
        current:
          escenario.cabeza === null
            ? null
            : { cadDocumentVersion: escenario.cabeza ?? 2 },
      },
      dirty: { current: escenario.sucio ?? false },
    },
    drawingReadOnly: escenario.soloLectura ?? false,
    versionsState: host.getSnapshot(),
    setReloadTick: () => {
      llamadas.reloads += 1;
    },
    api,
    snapshot: () => ({}),
    restore: () => undefined,
    pushHistory: () => undefined,
    recordLocalSnapshot: () => "snap",
    toast: {
      success: (message) => avisos.push(`ok: ${message}`),
      error: (message) => avisos.push(`error: ${message}`),
    },
  });
  return { host, actions, avisos, llamadas };
}

const ID = "00000000-0000-4000-8000-000000000001";
const espera = () => new Promise((resolve) => setTimeout(resolve, 0));

async function principal() {
  /* ── 1. La lista es el historial, de más nuevo a más viejo ─────────────── */
  {
    const { host, actions } = montar({
      documentId: ID,
      items: [resumen(1), resumen(3), resumen(2)],
    });
    actions.openVersions();
    await espera();
    igual(
      host.getSnapshot().versions.map((v) => v.version),
      [3, 2, 1],
      "el historial se lista de la versión más nueva a la más vieja",
    );
    ok(host.getSnapshot().showVersions, "abrir el cuadro lo deja abierto");
    igual(
      host.getSnapshot().versions[0].createdBy,
      "arquitecta@despacho.mx",
      "cada fila lleva quién guardó",
    );
  }

  /* ── 2. Sin identidad no hay historial, y se dice ──────────────────────── */
  {
    const { host, actions, avisos, llamadas } = montar({ documentId: null });
    ok(!actions.servidorConocido, "sin UUID ni caché el cuadro sabe que no hay servidor");
    actions.openVersions();
    await espera();
    igual(host.getSnapshot().versions, [], "sin identidad la lista queda vacía sin pedir nada");
    await actions.restoreVersion(1);
    ok(
      avisos.some((a) => a.startsWith("error:") && a.includes("identidad en el servidor")),
      "restaurar sin identidad lo dice, no falla en silencio",
    );
    igual(llamadas.restoreAs.length, 0, "y no manda nada al servidor");
  }

  /* ── 3. Restaurar guarda la versión antigua como nueva con el CAS de la cabeza ── */
  {
    const { host, actions, avisos, llamadas } = montar({
      documentId: ID,
      cabeza: 4,
    });
    host.setShowVersions(true);
    await actions.restoreVersion(2);
    igual(llamadas.restoreAs.length, 1, "una sola escritura");
    const [id, doc, expected] = llamadas.restoreAs[0] as [string, CadDocumentInline, number];
    igual(id, ID, "sobre el documento con identidad");
    igual((doc as { entities: unknown[] }).entities.length, 2, "con el documento de la versión pedida");
    igual(expected, 4, "y con el CAS de la cabeza que el editor conoce, no con la versión antigua");
    igual(llamadas.reloads, 1, "después recarga el editor");
    ok(!host.getSnapshot().showVersions, "y cierra el cuadro");
    ok(!host.getSnapshot().versBusy, "el ocupado vuelve a false");
    ok(
      avisos.some((a) => a.startsWith("ok:") && a.includes("versión 2")),
      "el aviso nombra la versión a la que volvió",
    );
  }

  /* ── 4. Con cambios sin mandar se niega: restaurar pisaría lo no guardado ── */
  {
    const { actions, avisos, llamadas } = montar({ documentId: ID, sucio: true });
    await actions.restoreVersion(1);
    igual(llamadas.restoreAs.length, 0, "no escribe");
    ok(
      avisos.some((a) => a.includes("cambios sin guardar")),
      "y explica que espere al guardado automático o pulse Ctrl+S",
    );
  }

  /* ── 5. Un puntero a blob no se restaura desde aquí ────────────────────── */
  {
    const { actions, avisos, llamadas } = montar({
      documentId: ID,
      detalle: (version) =>
        ({
          ...resumen(version),
          cadDocument: { _storage: { kind: "document_blob", blobKey: "x" }, summary: {} },
        }) as unknown as CadDocumentVersionDetail,
    });
    await actions.restoreVersion(1);
    igual(llamadas.restoreAs.length, 0, "no escribe un puntero como documento");
    ok(avisos.some((a) => a.includes("puntero a blob")), "y lo dice con esas palabras");
  }

  /* ── 6. Si el servidor avanzó, el 409 se cuenta como conflicto ─────────── */
  {
    class Conflicto extends Error {
      isVersionConflict() {
        return true;
      }
    }
    const { actions, avisos, llamadas } = montar({
      documentId: ID,
      restoreAs: async () => {
        throw new Conflicto("409");
      },
    });
    await actions.restoreVersion(1);
    igual(llamadas.reloads, 0, "sin recarga cuando falla");
    ok(
      avisos.some((a) => a.includes("cambió en el servidor")),
      "el conflicto CAS se explica como tal",
    );
  }

  /* ── 7. Sólo lectura: no se restaura ───────────────────────────────────── */
  {
    const { actions, llamadas } = montar({ documentId: ID, soloLectura: true });
    await actions.restoreVersion(1);
    igual(llamadas.restoreAs.length, 0, "el invitado o el vencido no restauran");
  }

  /* ── 8. Cableado: el monolito ya no habla con `layout/snapshots` ───────── */
  {
    const monolito = readFileSync(
      new URL("./Layout3DEditor.tsx", import.meta.url),
      "utf8",
    );
    const host = readFileSync(new URL("./versions-host.ts", import.meta.url), "utf8");
    const cuadro = readFileSync(
      new URL("../dialogs/CadVersionsDialog.tsx", import.meta.url),
      "utf8",
    );
    ok(
      !host.includes("legacyCadFetch") && !host.includes("layout/snapshots?"),
      "el anfitrión ya no pide la ruta que daba 404",
    );
    ok(!monolito.includes("layout/snapshots"), "ni el monolito");
    ok(
      monolito.includes("refs: { documentId: currentDocumentIdRef, data: dataRef, dirty: dirtyRef }"),
      "el monolito pasa sus refs al anfitrión (lectura en el evento, no en render)",
    );
    ok(!cuadro.includes("onSaveVersion"), "el cuadro no promete guardar versiones con nombre");
    ok(!cuadro.includes("onDeleteVersion"), "ni borrar el historial, que es inmutable");
    ok(cuadro.includes('data-testid={`cad-version-restore-${v.version}`}'), "cada fila tiene su botón de restaurar identificable");
  }


  console.log(`ok versions-host: ${checks} comprobaciones`);
}

principal().catch((error) => {
  console.error(error);
  process.exit(1);
});
