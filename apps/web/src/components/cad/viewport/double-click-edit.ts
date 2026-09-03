/**
 * EL DOBLE CLIC ABRE EL EDITOR DEL OBJETO.
 *
 * El gesto entero, en veinte líneas: qué hay bajo el cursor, qué verbo le toca
 * (`lib/cad/double-click-verb.ts`, tabla pura y probada) y arrancarlo con el
 * objeto ya designado. Vive fuera del monolito por la misma razón que el
 * enrutador del puntero: nace y muere con el lienzo, no aporta un `useState` y
 * así se puede leer entero.
 *
 * ## El objeto se designa, no se pregunta
 *
 * `invoke(orden)` deja la orden pidiendo «Designe...» y acto seguido
 * `pickEntity` le entrega el objeto que había bajo los dos clics. Es
 * exactamente lo que hace AutoCAD: el doble clic ES la designación. Sin ese
 * segundo paso, dos clics dejarían un prompt abierto pidiendo lo que el usuario
 * acaba de señalar.
 */
import { cadDoubleClickVerb } from "@/lib/cad/double-click-verb";

export interface CadDoubleClickEditPort {
  /** Punto de dibujo bajo el evento; `null` si el clic no cae en el plano. */
  drawingPoint(event: MouseEvent): { x: number; y: number } | null;
  /** Id del objeto bajo ese punto, tal como lo da el índice de designación. */
  entityId(point: { x: number; y: number }): string | null | undefined;
  /** El documento vivo, para resolver el TIPO de ese id. */
  document(): { entities: readonly { id: string; type: string }[] } | null;
  /** Abre el editor de párrafo del estudio sobre ese MTEXT. */
  openMTextEditor(entityId: string): void;
  /** El motor de comandos, o `null` si esta sesión no lo tiene montado. */
  engine(): {
    invoke(command: string): void;
    pickEntity(entityId: string, point: { x: number; y: number }): void;
  } | null;
}

/** El id que devuelve el índice de designación, resuelto a `{id, type}`. */
export function cadDoubleClickTarget(
  entityId: string | null | undefined,
  document: { entities: readonly { id: string; type: string }[] } | null,
): { id: string; type: string } | null {
  if (!entityId || !document) return null;
  const entity = document.entities.find((candidate) => candidate.id === entityId);
  return entity ? { id: entity.id, type: entity.type } : null;
}

export function attachCadDoubleClickEdit(
  element: HTMLElement,
  port: CadDoubleClickEditPort,
): () => void {
  const onDoubleClick = (event: MouseEvent) => {
    const point = port.drawingPoint(event);
    if (!point) return;
    const target = cadDoubleClickTarget(port.entityId(point), port.document());
    if (!target) return;
    const verb = cadDoubleClickVerb(target.type);
    if (!verb) return;
    // El doble clic no debe además seleccionar-y-arrastrar ni abrir el menú del
    // navegador: si hay verbo, el gesto es nuestro entero.
    event.preventDefault();
    if (verb.kind === "mtext-editor") {
      port.openMTextEditor(target.id);
      return;
    }
    // Arrancar la orden y ENTREGARLE el objeto, en ese orden: el doble clic ES
    // la designación, y sin el segundo paso quedaría un prompt pidiendo lo que
    // el usuario acaba de señalar.
    const engine = port.engine();
    if (!engine) return;
    engine.invoke(verb.command);
    engine.pickEntity(target.id, point);
  };
  element.addEventListener("dblclick", onDoubleClick);
  return () => element.removeEventListener("dblclick", onDoubleClick);
}
