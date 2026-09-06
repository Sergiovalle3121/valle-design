/**
 * T-72(h): el editor es el único del estudio sin `ErrorBoundary`, y cuando se
 * cae no hay ninguna garantía de que el último documento que pasó por la RED
 * quede en el diario de recuperación (IndexedDB) antes de que aparezca la
 * pantalla de "esto se rompió".
 *
 * El documento vivo (el que el usuario está editando en este instante) sólo
 * existe dentro del estado de `Layout3DEditor`, y ese fichero no se toca
 * desde aquí (§5.3 de la campaña). Lo que SÍ es alcanzable desde fuera es
 * `documentPort`: la única puerta de red del editor
 * (`design-port.ts`/`demo-port.ts`). Este envoltorio observa cada
 * `saveContent` que pasa por ella —el mismo camino que ya usa el guardado
 * manual y el automático— y guarda una copia en memoria del último documento
 * y versión que se intentó guardar, sin cambiar su comportamiento en nada.
 *
 * Con esa copia, la frontera de error puede escribir un checkpoint de
 * emergencia en el diario de recuperación (`saveCadRecovery`) en el momento
 * exacto del fallo — no el teclazo más reciente sin guardar, que sigue sin
 * ser alcanzable desde aquí, pero sí el último estado que de verdad viajó
 * hacia el servidor, que es mejor que lo que había antes: nada.
 */
import type { DocumentLifecyclePort } from "./controller";
import type { CadDocument } from "@/lib/cad/cad-document";

export interface LastSavedSnapshot {
  documentId: string;
  document: CadDocument;
  version: number;
  savedAtMs: number;
}

/**
 * Envuelve un `DocumentLifecyclePort` para que cada `saveContent` (el camino
 * de los documentos pequeños; `saveArchive` viaja como Blob gzip ya
 * codificado y no se puede leer aquí sin decodificarlo en cada guardado, así
 * que se deja pasar tal cual) llame a `onSaveContent` ANTES de delegar en el
 * puerto real. Un fallo al capturar nunca puede impedir el guardado: el
 * guardado es lo importante, el snapshot es un extra.
 *
 * Recibe un CALLBACK, no una `ref` de React: este módulo es puro y no sabe
 * de React (se prueba sin DOM), y en el llamador —`CadStudioHost.tsx`— pasar
 * el objeto `ref` en sí a una función durante el render dispara
 * `react-hooks/refs` («Passing a ref to a function may read its value
 * during render»), aunque esta función nunca LEE el valor, sólo lo escribe
 * más tarde. Un cierre sobre `ref.current = snapshot` evita la señal falsa.
 */
export function wrapDocumentPortForCrashRecovery(
  port: DocumentLifecyclePort,
  onSaveContent: (snapshot: LastSavedSnapshot) => void,
): DocumentLifecyclePort {
  return {
    ...port,
    saveContent(documentId, document, expectedVersion) {
      try {
        onSaveContent({
          documentId,
          document,
          version: expectedVersion,
          savedAtMs: Date.now(),
        });
      } catch {
        // Ver arriba: nunca a costa del guardado real.
      }
      return port.saveContent(documentId, document, expectedVersion);
    },
  };
}
