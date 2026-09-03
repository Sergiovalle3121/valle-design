/**
 * EL CONJUNTO DE PLANOS, TRAÍDO DE VERDAD.
 *
 * ## Qué estaba roto, medido
 *
 * `lib/cad/sheet-set/` lleva campañas escrito y probado: numeración
 * automática, campos que se resuelven solos, publicación por lotes a un único
 * PDF paginado con portada. `plot-host.ts` sabía atender `{kind:"publish"}` y
 * `{kind:"sheet-set-command"}`, y su spec lo probaba contra bytes de PDF
 * reales. Los comandos `PUBLISH` y `SHEETSET` llegan al registro real. Y aun
 * así, teclearlos en el estudio respondía SIEMPRE lo mismo:
 *
 *     El conjunto de planos set:nave no está cargado en este estudio.
 *
 * Porque el puente `sheetSet()` de `plot-host.ts` no lo aportaba NADIE:
 * `grep -rn sheetSet src/` sólo lo encontraba en su propia interfaz y en su
 * propio spec. Es el `P1-8` del BACKLOG, y es el mismo defecto que la ola
 * anterior cerró en `XATTACH`: la orden entera, el trabajo entero, y ningún
 * cable entre los dos.
 *
 * ## Por qué el cable vive AQUÍ y no en el monolito
 *
 * Cuando se escribieron los comandos, `Layout3DEditor.tsx` estaba en su techo
 * exacto y una línea más era un rojo — eso lo dejó dicho
 * `sheet-set-commands.ts` en su cabecera. El presupuesto sólo puede encoger,
 * así que el cable no puede subir allí ni ahora ni nunca: vive en su propio
 * módulo, sin React, con el puerto de red INYECTADO. Se prueba en Node.
 *
 * ## Traer es asíncrono; el puente de trazado es síncrono
 *
 * `sheetSet(id)` devuelve lo que YA está en la mano y `null` si no lo está —su
 * contrato no cambia—. Lo nuevo es `loadSheetSet(id)`, que sí puede tardar:
 * `plot-host.ts` responde «Trayendo…» y escribe el veredicto cuando llega. Es
 * el mismo reparto que `xref-host.ts`: el comando decide, el anfitrión ejecuta,
 * y nadie finge que la red no existe.
 *
 * ## Guardar: CAS y nunca a ciegas
 *
 * `saveSheetSet` manda `expectedVersion`. Un 409 NO se reintenta con la versión
 * nueva —eso es sobrescribir a quien llegó antes con un paso de más—: se dice,
 * se olvida lo que había en la mano y se pide volver a intentarlo sobre lo que
 * hay. La caché se invalida en ese mismo momento, para que el siguiente
 * `SHEETSET` lea del servidor y no de una copia que ya sabemos vieja.
 */
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadSheetSet } from "@/lib/cad/sheet-set/sheet-set";

/** Un conjunto con los dibujos que sus hojas necesitan. */
export interface CadLoadedSheetSet {
  set: CadSheetSet;
  documents: ReadonlyMap<string, CadDocument>;
}

/**
 * La red, inyectada. Tres operaciones y ninguna más: este módulo no sabe de
 * `fetch`, de rutas ni de códigos de estado — sólo de qué hacer con lo que
 * devuelvan.
 */
export interface CadStudioSheetSetPort {
  /** El conjunto por su id. */
  sheetSet(sheetSetId: string): Promise<CadSheetSet>;
  /** El dibujo de una hoja, ya migrado al esquema vigente. */
  document(documentId: string): Promise<CadDocument>;
  /** Persiste el conjunto con su `expectedVersion`; devuelve el guardado. */
  save(set: CadSheetSet): Promise<CadSheetSet>;
  /** ¿Este error es un conflicto de versión? Lo sabe quien habla con la API. */
  versionConflict?(error: unknown): boolean;
}

/**
 * Adónde va lo que hay que contar. Se pasa POR OPERACIÓN y no se guarda en el
 * puente: el renglón vivo del estudio se lee de una `ref` y un puente que se
 * quedase con esa lectura la haría en el render, que es justo lo que
 * `react-hooks/refs` señala. Así el puente no sabe de React en absoluto.
 */
export type CadSheetSetNote = (text: string, level: "info" | "error") => void;

export interface CadStudioSheetSetBridge {
  sheetSet(sheetSetId: string): CadLoadedSheetSet | null;
  loadSheetSet(sheetSetId: string, note: CadSheetSetNote): Promise<CadLoadedSheetSet | null>;
  saveSheetSet(set: CadSheetSet, note: CadSheetSetNote): void;
}

/** Mensaje de un error, sin dejar que un `[object Object]` llegue al usuario. */
function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function cadStudioSheetSetBridge(
  port: CadStudioSheetSetPort,
): CadStudioSheetSetBridge {
  const cache = new Map<string, CadLoadedSheetSet>();
  /** Cargas en vuelo: dos PUBLISH seguidos no piden el conjunto dos veces. */
  const inFlight = new Map<string, Promise<CadLoadedSheetSet | null>>();

  const fetchSet = async (
    sheetSetId: string,
    note: CadSheetSetNote,
  ): Promise<CadLoadedSheetSet | null> => {
    const set = await port.sheetSet(sheetSetId);
    // Los dibujos ENTRAN, no se buscan de uno en uno mientras se pagina: se
    // piden todos y se espera a todos, porque un PDF con diecinueve de veinte
    // hojas presentado como completo es peor que un error.
    const ids = [...new Set(set.sheets.map((sheet) => sheet.documentId))];
    const documents = new Map<string, CadDocument>();
    const faltan: string[] = [];
    await Promise.all(
      ids.map(async (documentId) => {
        try {
          documents.set(documentId, await port.document(documentId));
        } catch (error) {
          faltan.push(`${documentId} (${reason(error)})`);
        }
      }),
    );
    // Un dibujo que no llega se DICE y no se calla: `publishCadSheetSet` ya
    // omite la hoja y lo cuenta en su resultado, pero para entonces el PDF ya
    // salió y el aviso llega tarde para decidir.
    if (faltan.length > 0)
      note(
        `No se pudo traer ${faltan.length} dibujo(s) del conjunto «${set.name}»: ${faltan.join(", ")}. ` +
          "Sus hojas se omitirán y el resultado lo dirá.",
        "error",
      );
    const loaded: CadLoadedSheetSet = { set, documents };
    cache.set(sheetSetId, loaded);
    return loaded;
  };

  return {
    sheetSet: (sheetSetId) => cache.get(sheetSetId) ?? null,
    loadSheetSet: (sheetSetId, note) => {
      const cached = cache.get(sheetSetId);
      if (cached) return Promise.resolve(cached);
      const running = inFlight.get(sheetSetId);
      if (running) return running;
      const promise = fetchSet(sheetSetId, note)
        .catch((error: unknown) => {
          note(`No se pudo traer el conjunto de planos ${sheetSetId}: ${reason(error)}`, "error");
          return null;
        })
        .finally(() => inFlight.delete(sheetSetId));
      inFlight.set(sheetSetId, promise);
      return promise;
    },
    saveSheetSet: (set, note) => {
      // La caché se actualiza YA con lo calculado —el renglón que el usuario
      // acaba de leer dice que se renumeró— y se corrige si el servidor no lo
      // acepta. Lo contrario, esperar al PUT para reflejarlo, haría que un
      // `SHEETSET Listar` inmediato enseñase los números viejos.
      const previo = cache.get(set.id);
      if (previo) cache.set(set.id, { ...previo, set });
      void port
        .save(set)
        .then((saved) => {
          const actual = cache.get(set.id);
          if (actual) cache.set(set.id, { ...actual, set: saved });
        })
        .catch((error: unknown) => {
          // Un 409 NO se reintenta: se olvida lo que hay en la mano para que la
          // próxima orden lea del servidor, y se dice qué pasó.
          cache.delete(set.id);
          note(
            port.versionConflict?.(error)
              ? `El conjunto «${set.name}» cambió mientras se editaba: no se guardó nada. Vuelva a intentarlo y se leerá lo que hay.`
              : `No se pudo guardar el conjunto «${set.name}»: ${reason(error)}`,
            "error",
          );
        });
    },
  };
}
