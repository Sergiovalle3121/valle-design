/**
 * Anfitrión del enganche 3D: donde el índice de `view/solid-snap.ts` se
 * enchufa a la cámara viva.
 *
 * ## El reparto
 *
 * El módulo puro sabe indexar aristas y resolver un enganche dada una
 * proyección. Lo que no sabe —ni debe— es CUÁNDO la proyección ha caducado ni
 * qué sólidos hay en el documento. Eso es esta clase: mira el contador de
 * cambios del controlador de vista y reproyecta sólo cuando la cámara se ha
 * movido de verdad.
 *
 * ## Una capa aparte, y apagable
 *
 * El presupuesto del repositorio es explícito: si el 3D cuesta caro, se paga en
 * una capa que se pueda apagar. Ésta lo es en tres sentidos, y los tres importan:
 *
 *  · **Sin sólidos no existe.** Un dibujo 2D no construye índice ninguno y cada
 *    consulta sale por un `if` con una comparación de tamaño.
 *  · **Se puede apagar a mano** con `enabled`, sin tocar el enrutado del
 *    puntero.
 *  · **Se apaga SOLA** por encima del tope del índice, y lo dice. Fallo cerrado:
 *    una escena con más aristas de las que se pueden indexar no se engancha «a
 *    medias»; se deja de enganchar y `disabledReason` explica por qué.
 */
import type { CadDocument } from "@/lib/cad/cad-document";
import type { CadSolid3dEntity } from "@/lib/cad/cad-entities-v5";
import { cadUnsnappableLayerIds } from "@/lib/cad/cad-layer-visibility";
import { solid3dBody } from "@/lib/cad/solid3d-build";
import type { BrepBody } from "@/lib/brep";
import {
  buildCadSolidSnapIndex,
  type CadSolidSnapIndex,
  type CadSolidSnapProjector,
  type CadSolidSnapQuery,
  type CadSolidSnapResult,
  type CadSolidSnapSource,
} from "@/lib/cad/view/solid-snap";

/**
 * Lo que el enganche necesita de la vista. Estructural y mínimo: se monta en las
 * pruebas con un objeto de cuatro campos, sin THREE de por medio.
 */
export interface CadSolidViewBridge {
  /** Proyector de la cámara actual, o `null` si todavía no hay vista. */
  projector(): CadSolidSnapProjector | null;
  /** Contador de cambios de vista. Cambia ⇒ la proyección caducó. */
  revision(): number;
  viewportPx(): { widthPx: number; heightPx: number };
  /** Ojo en coordenadas de DIBUJO, para la eliminación de líneas ocultas. */
  eye(): { x: number; y: number; z: number } | null;
  /**
   * Dirección de MIRADA, unitaria y en coordenadas de dibujo.
   *
   * Va aparte del ojo porque mide otra cosa: el ojo dice desde dónde, y la
   * dirección dice cuánto ha girado la vista. El umbral de recálculo se mide
   * sobre la dirección — el ángulo entre dos posiciones de ojo tomadas desde el
   * ORIGEN del dibujo no es el ángulo que ha girado la cámara, y con el modelo
   * lejos del origen ese error puede ser de decenas de grados.
   */
  direction(): { x: number; y: number; z: number } | null;
  /** Apaga la capa entera sin tocar nada más. Ausente = encendida. */
  enabled?(): boolean;
}

export class CadSolidSnapHost {
  private index: CadSolidSnapIndex | null = null;
  private reason: string | null = null;
  /** Revisión de vista con la que se hizo la proyección vigente. */
  private projectedAt = -1;
  /** Ids indexados, en orden, para saber si el documento cambió de sólidos. */
  private signature = "";

  constructor(private readonly bridge: CadSolidViewBridge) {}

  get enabled(): boolean {
    return this.bridge.enabled?.() ?? true;
  }

  /** Por qué está apagado el enganche 3D, o `null` si funciona. */
  get disabledReason(): string | null {
    return this.reason;
  }

  get indexedEdges(): number {
    return this.index?.edgeCount ?? 0;
  }

  /**
   * Reconcilia contra el documento.
   *
   * La firma es la lista de ids MÁS la huella del árbol de cada sólido, porque
   * mover un sólido sin añadir ni quitar ninguno también cambia sus aristas y
   * un índice que no lo note engancharía a donde la pieza ESTABA. Se recalcula
   * el índice entero cuando cambia: reconstruirlo cuesta milisegundos y ocurre
   * al editar, no al mover el ratón.
   */
  sync(document: CadDocument | null): void {
    if (!document) {
      this.clear();
      return;
    }
    // Lo que no se ve no puede ser un imán: un sólido en capa apagada o
    // congelada no entra al índice. La firma se calcula DESPUÉS de filtrar,
    // así que apagar/encender una capa cambia la firma (el sólido aparece o
    // desaparece de la lista) y fuerza la reconstrucción del índice aunque el
    // propio sólido no haya cambiado — no hace falta meter el estado de capa
    // en la firma por separado.
    const hiddenLayers = cadUnsnappableLayerIds(document.layers);
    const solids = document.entities.filter(
      (entity): entity is CadSolid3dEntity =>
        entity.type === "solid3d" && !hiddenLayers.has(entity.layer),
    );
    if (solids.length === 0) {
      this.clear();
      return;
    }
    const signature = solids
      .map((entity) => `${entity.id}:${entity.nodes.length}:${JSON.stringify(entity.placement ?? {})}`)
      .join("|");
    if (signature === this.signature && this.index) return;
    this.signature = signature;

    const sources: CadSolidSnapSource[] = [];
    for (const entity of solids) {
      let body: BrepBody;
      try {
        body = solid3dBody(entity);
      } catch {
        // Un sólido que no evalúa no se engancha, y no impide enganchar a los
        // demás. El problema real se cuenta en el panel de propiedades.
        continue;
      }
      sources.push({ entityId: entity.id, body });
    }
    if (sources.length === 0) {
      this.clear();
      return;
    }
    const build = buildCadSolidSnapIndex(sources);
    if (!build.ok) {
      this.index = null;
      this.reason = build.reason;
      return;
    }
    this.index = build.index;
    this.reason = null;
    this.projectedAt = -1;
  }

  /** Olvida el índice. Lo llama `sync` cuando no hay sólidos que enganchar. */
  private clear(): void {
    this.index = null;
    this.reason = null;
    this.signature = "";
    this.projectedAt = -1;
  }

  /**
   * Enganche bajo un píxel del lienzo.
   *
   * Reproyecta si la cámara se movió desde la última vez. Es el único sitio
   * donde eso puede decidirse sin suscripciones: quien consulta sabe que va a
   * necesitar la proyección, y quien orbita no paga nada porque no consulta.
   */
  query(
    cursorX: number,
    cursorY: number,
    options: CadSolidSnapQuery,
  ): CadSolidSnapResult | null {
    if (!this.index || !this.enabled) return null;
    const revision = this.bridge.revision();
    if (revision !== this.projectedAt) {
      const projector = this.bridge.projector();
      if (!projector) return null;
      this.index.project(projector, this.bridge.viewportPx());
      this.projectedAt = revision;
    }
    return this.index.query(cursorX, cursorY, options);
  }

  /** Fuerza una reproyección en la siguiente consulta. Para pruebas y remontajes. */
  invalidate(): void {
    this.projectedAt = -1;
  }
}
