/**
 * El PARSER de PDF, cargado cuando el plano trae de verdad un sustrato.
 *
 * ## La segunda puerta
 *
 * Las diez órdenes de PDF (PDFATTACH, PDFIMPORT, PDFCLIP…) ya no viajan en la
 * primera carga: sus implementaciones llegan por `engine/lazy-commands.ts` como
 * las otras 281. Pero eso NO sacaba el parser del primer chunk, y ésa es la
 * medida que corrigió el diagnóstico: `Layout3DEditor.tsx` importaba
 * `pdf-attach-payload`, `pdf-underlay` y `pdf-snap-geometry` POR SU CUENTA, para
 * un único uso —que el sustrato imante como cualquier polilínea—. Con esa puerta
 * abierta, el parser entero entraba en el primer chunk hicieras lo que hicieras
 * con el registro; el diagnóstico de partida lo pesó en 56,3 KB con mapas de
 * fuente sobre el build de producción.
 *
 * ## El molde es el de siempre
 *
 * Mismo par de funciones que `lib/cad/commands/lazy.ts`: una carga memoizada con
 * `pending ??=` y un camino síncrono que devuelve `null` cuando todavía no está.
 * Quien pregunta por el camino síncrono es el resolvedor de captura, que corre
 * en cada `pointermove` y no puede esperar; mientras el parser no llega, el
 * sustrato no imanta y el resto del dibujo sí — y quien lo consulta dispara la
 * carga en vez de fingir que miró.
 *
 * La pregunta BARATA —¿lleva esta entidad ficha de sustrato?— vive en
 * `underlay-key.ts`, que no arrastra nada.
 */
export type CadPdfSnapModule = typeof import("./pdf-attach-payload") &
  typeof import("./pdf-underlay") &
  typeof import("./pdf-snap-geometry");

let loaded: CadPdfSnapModule | null = null;
let pending: Promise<CadPdfSnapModule> | null = null;

export function loadCadPdfSnap(): Promise<CadPdfSnapModule> {
  pending ??= Promise.all([
    import("./pdf-attach-payload"),
    import("./pdf-underlay"),
    import("./pdf-snap-geometry"),
  ]).then(([payload, underlay, snap]) => {
    loaded = { ...payload, ...underlay, ...snap };
    return loaded;
  });
  return pending;
}

/** El parser ya cargado, o `null`. Camino síncrono del resolvedor de captura. */
export function cadPdfSnapIfLoaded(): CadPdfSnapModule | null {
  return loaded;
}
