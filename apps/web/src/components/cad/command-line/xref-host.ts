/**
 * Anfitrión de referencias externas: donde `XATTACH` deja de ser una petición y
 * el otro dibujo aparece dentro de éste.
 *
 * El motor decide QUÉ adjuntar y DÓNDE —el diálogo completo: dibujo, adjuntar o
 * superponer, punto, escala y giro—; lo único que no puede hacer es la red, y
 * eso es exactamente lo que hay aquí. Mismo reparto que PLOT y que DXFOUT.
 *
 * ## Por qué la respuesta llega por el diálogo y no por el valor de retorno
 *
 * Traer un activo del inquilino es asíncrono y el motor es síncrono: la orden
 * ya ha terminado cuando el dibujo llega. Así que el renglón inmediato dice que
 * se está trayendo, y el resultado —adjuntado, o el motivo por el que no— se
 * escribe después en el mismo diálogo, por el mismo canal que usa cualquier
 * otro aviso. Prometer «adjuntado» antes de que llegue sería el éxito falso que
 * `check:command-integrity` persigue.
 */
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";

export interface CadXrefHostBridge {
  /**
   * Trae el activo y lo proyecta en el dibujo. Es la MISMA función que usa el
   * panel de referencias externas: una sola ruta de adjuntado, no dos.
   */
  attach(draft: {
    assetId: string;
    revision: string;
    name: string;
    mode: "attachment" | "overlay";
    x: number;
    y: number;
    scale: number;
    rotation: number;
  }): Promise<void>;
  /** Escribe un renglón en el diálogo cuando la traída termina. */
  note(text: string, level?: "info" | "error"): void;
}

/**
 * Atiende `{kind:"xref-attach"}`. Devuelve `null` si la petición no es suya,
 * para que quien enruta pueda encadenar anfitriones sin conocerlos.
 */
export function handleCadXrefHostRequest(
  request: CadHostRequest,
  bridge: CadXrefHostBridge | null,
): string | null {
  if (request.kind !== "xref-attach") return null;
  if (!bridge)
    return "Este espacio de trabajo no sabe traer dibujos del inquilino: falta el anfitrión de referencias externas.";
  const { assetId, revision, mode, insertion, scale, rotation } = request;
  const etiqueta = revision === "UNIVERSAL" ? assetId : `${assetId}@${revision}`;
  void bridge
    .attach({
      assetId,
      revision,
      name: assetId,
      mode,
      x: insertion.x,
      y: insertion.y,
      scale,
      rotation,
    })
    .then(() =>
      bridge.note(
        `${etiqueta} referenciado como ${mode === "overlay" ? "superposición" : "adjunto"} en ${insertion.x}, ${insertion.y}.`,
      ),
    )
    .catch((error: unknown) =>
      bridge.note(`No se pudo referenciar ${etiqueta}: ${String((error as Error)?.message ?? error)}`, "error"),
    );
  return `Trayendo ${etiqueta} del inquilino…`;
}

/**
 * El puente del ESTUDIO, en una línea desde el monolito.
 *
 * Las dos piezas llegan por REF y no por valor porque el editor declara
 * `attachProfessionalXref` bastante DESPUÉS de montar el motor de comandos —el
 * orden de un componente de 18.000 líneas no se reordena por esto— y porque el
 * anfitrión del motor tampoco existe todavía en ese punto. Leer la ref al
 * despachar resuelve las dos cosas sin mover una sola declaración.
 */
export function cadStudioXrefBridge(
  attach: { current: CadXrefHostBridge["attach"] },
  engine: { current: { note(text: string, level?: "info" | "error"): void } | null },
): CadXrefHostBridge {
  return {
    attach: (draft) => attach.current(draft),
    note: (text, level) => engine.current?.note(text, level),
  };
}
