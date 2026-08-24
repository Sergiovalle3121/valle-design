/**
 * Worker de teselado: la aritmética pesada fuera del hilo principal.
 *
 * El planificador ya reparte el trabajo en trozos de 4 ms, así que la interfaz
 * responde aunque todo ocurra en el hilo principal. Lo que el worker añade es
 * distinto: con un lote grande —abrir un documento, cruzar una octava de zoom en
 * un dibujo denso— los 4 ms por cuadro convierten el trabajo en muchos cuadros,
 * y mientras tanto el usuario ve la escena entrar a trozos. Teselando en
 * paralelo esos mismos trozos llegan sin robarle cuadros al hilo que atiende el
 * ratón.
 *
 * Devuelve arrays tipados TRANSFERIBLES: el resultado no se copia al volver, se
 * cede. Copiar un millón de flotantes por lote anularía la ganancia entera.
 */
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../entity-runtime";
import type { CadDocument } from "../cad-document";
import { CAD_RENDER_ORIGIN_ZERO, type CadRenderOrigin } from "./tessellation-cache";
import {
  CAD_ARC_STRIDE,
  CAD_ELLIPSE_STRIDE,
  loadCadCurveKernelFromUrl,
  type CadCurveKernel,
} from "../wasm/curve-kernel";

export interface CadTessellateWorkerRequest {
  id: number;
  entities: CadNativeEntity[];
  /** Segmentos por entidad, ya resueltos por el escalón de LOD. */
  segments: number[];
  document?: CadDocument;
  /** Origen flotante de escena: ver `tessellation-cache.ts`. */
  origin?: CadRenderOrigin;
  /**
   * Bandera de activación del kernel Rust/WASM (ver ADR-0003). Por defecto
   * `undefined`/`false`: sin ella el worker tesela exactamente como antes.
   */
  curveKernel?: boolean;
}

export interface CadTessellatedEntityPayload {
  entityId: string;
  /** Un Float32Array por camino, con las coordenadas x,y intercaladas. */
  paths: Float32Array[];
  closed: boolean[];
}

export interface CadTessellateWorkerResponse {
  id: number;
  ok: boolean;
  results?: CadTessellatedEntityPayload[];
  error?: string;
}

type CadArcLikeEntity = Extract<CadNativeEntity, { type: "arc" | "circle" }>;
type CadEllipseNativeEntity = Extract<CadNativeEntity, { type: "ellipse" }>;
type CadSplineNativeEntity = Extract<CadNativeEntity, { type: "spline" }>;

/** `cx, cy, r, inicio°, fin°`: el círculo es el arco de barrido 0…360. */
function cadArcLikeParams(
  entity: CadArcLikeEntity,
): readonly [number, number, number, number, number] {
  return entity.type === "circle"
    ? [entity.center.x, entity.center.y, entity.radius, 0, 360]
    : [entity.center.x, entity.center.y, entity.radius, entity.startAngle, entity.endAngle];
}

/**
 * Réplica de `normalizedSweep(...) >= 360 − ε` de `curve-entity-adapters.ts`
 * — no exportada allí, y traerla entera pesa más que estas cuatro líneas.
 */
function cadEllipseIsFullSweep(startDeg: number, endDeg: number): boolean {
  let sweep = endDeg - startDeg;
  while (sweep <= 0) sweep += 360;
  return sweep >= 360 - 1e-7;
}

function cadStepsFor(segments: readonly number[], index: number): number {
  return Math.max(2, Math.floor(segments[index] ?? 32));
}

/**
 * Empaqueta la salida de un lote del kernel (cuentas + puntos concatenados)
 * en un payload por entidad, restando el origen flotante en el mismo punto
 * del camino —ANTES de entrar a `Float32Array`— que el camino sin kernel.
 */
function cadUnpackKernelBatch(
  group: readonly { entity: CadArcLikeEntity | CadEllipseNativeEntity; closed: boolean }[],
  counts: Uint32Array,
  points: Float64Array,
  origin: CadRenderOrigin,
  out: Map<string, CadTessellatedEntityPayload>,
): void {
  let cursor = 0;
  for (let index = 0; index < group.length; index += 1) {
    const count = counts[index];
    if (count >= 2) {
      const xy = new Float32Array(count * 2);
      for (let point = 0; point < count; point += 1) {
        xy[point * 2] = points[cursor + point * 2] - origin.x;
        xy[point * 2 + 1] = points[cursor + point * 2 + 1] - origin.y;
      }
      out.set(group[index].entity.id, {
        entityId: group[index].entity.id,
        paths: [xy],
        closed: [group[index].closed],
      });
    }
    cursor += count * 2;
  }
}

/**
 * Tesela por el kernel las familias que sabe hablar —arco/círculo, elipse,
 * spline— agrupando por `steps` porque la ABI del lote toma UN barrido para
 * toda la llamada (ver `crates/valle-cad-kernel/src/lib.rs`). Las entidades
 * que no encaja se dejan fuera del mapa y el llamador las tesela como
 * siempre: el kernel es una vía más rápida para lo que sabe hacer, no un
 * segundo camino que decide qué se dibuja.
 */
function cadKernelCurvePayloads(
  entities: readonly CadNativeEntity[],
  segments: readonly number[],
  kernel: CadCurveKernel,
  origin: CadRenderOrigin,
): Map<string, CadTessellatedEntityPayload> {
  const out = new Map<string, CadTessellatedEntityPayload>();
  const arcGroups = new Map<number, { entity: CadArcLikeEntity; closed: boolean }[]>();
  const ellipseGroups = new Map<number, { entity: CadEllipseNativeEntity; closed: boolean }[]>();
  const splines: { entity: CadSplineNativeEntity; steps: number }[] = [];

  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index];
    const steps = cadStepsFor(segments, index);
    if (entity.type === "arc" || entity.type === "circle") {
      const group = arcGroups.get(steps) ?? [];
      group.push({ entity, closed: entity.type === "circle" });
      arcGroups.set(steps, group);
    } else if (entity.type === "ellipse") {
      const group = ellipseGroups.get(steps) ?? [];
      group.push({
        entity,
        closed: cadEllipseIsFullSweep(entity.startParameter, entity.endParameter),
      });
      ellipseGroups.set(steps, group);
    } else if (entity.type === "spline") {
      splines.push({ entity, steps });
    }
  }

  for (const [steps, group] of arcGroups) {
    const input = new Float64Array(group.length * CAD_ARC_STRIDE);
    for (let index = 0; index < group.length; index += 1) {
      const [cx, cy, r, start, end] = cadArcLikeParams(group[index].entity);
      const base = index * CAD_ARC_STRIDE;
      input[base] = cx;
      input[base + 1] = cy;
      input[base + 2] = r;
      input[base + 3] = start;
      input[base + 4] = end;
    }
    const batch = kernel.tessellateArcs(input, group.length, steps);
    cadUnpackKernelBatch(group, batch.counts, batch.points, origin, out);
  }

  for (const [steps, group] of ellipseGroups) {
    const input = new Float64Array(group.length * CAD_ELLIPSE_STRIDE);
    for (let index = 0; index < group.length; index += 1) {
      const entity = group[index].entity;
      const base = index * CAD_ELLIPSE_STRIDE;
      input[base] = entity.center.x;
      input[base + 1] = entity.center.y;
      input[base + 2] = entity.majorAxis.x;
      input[base + 3] = entity.majorAxis.y;
      input[base + 4] = entity.ratio;
      input[base + 5] = entity.startParameter;
      input[base + 6] = entity.endParameter;
    }
    const batch = kernel.tessellateEllipses(input, group.length, steps);
    cadUnpackKernelBatch(group, batch.counts, batch.points, origin, out);
  }

  for (const { entity, steps } of splines) {
    const control = new Float64Array(entity.controlPoints.length * 2);
    for (let point = 0; point < entity.controlPoints.length; point += 1) {
      control[point * 2] = entity.controlPoints[point].x;
      control[point * 2 + 1] = entity.controlPoints[point].y;
    }
    // Nudos vacíos van como `null`, no como un `Float64Array` de longitud 0:
    // el kernel reserva `knotsBytes = 8` sólo para `null` y una reserva de 0
    // bytes devuelve el puntero nulo, que `WasmCurveKernel` trata como fallo.
    const knots = entity.knots.length > 0 ? new Float64Array(entity.knots) : null;
    const flat = kernel.tessellateSpline(control, entity.degree, knots, steps);
    const count = flat.length / 2;
    if (count < 2) continue;
    const xy = new Float32Array(count * 2);
    for (let point = 0; point < count; point += 1) {
      xy[point * 2] = flat[point * 2] - origin.x;
      xy[point * 2 + 1] = flat[point * 2 + 1] - origin.y;
    }
    out.set(entity.id, {
      entityId: entity.id,
      paths: [xy],
      closed: [entity.closed === true],
    });
  }

  return out;
}

/**
 * Núcleo compartido: lo llama el worker y también el camino de reserva cuando
 * `Worker` no existe (Node, navegadores sin módulos en worker). Tener UNA
 * implementación evita que el camino de reserva se desvíe en silencio del
 * principal, que es como aparecen los fallos que sólo pasan en producción.
 *
 * `kernel` es la puerta del kernel Rust/WASM (ADR-0003): `null` por defecto,
 * que es el camino de SIEMPRE —cada entidad por `renderer.paths`—. Sólo el
 * carril fuera de hilo la activa, y sólo tras el visto bueno del gate: el
 * camino síncrono principal (`tessellation-cache.ts` → `pipeline.ts`) no
 * pasa `kernel` y no cambia de comportamiento.
 */
export function tessellateCadEntityBatch(
  entities: readonly CadNativeEntity[],
  segments: readonly number[],
  document?: CadDocument,
  origin: CadRenderOrigin = CAD_RENDER_ORIGIN_ZERO,
  kernel: CadCurveKernel | null = null,
): { results: CadTessellatedEntityPayload[]; transfer: ArrayBufferLike[] } {
  const viaKernel = kernel ? cadKernelCurvePayloads(entities, segments, kernel, origin) : null;
  const results: CadTessellatedEntityPayload[] = [];
  const transfer: ArrayBufferLike[] = [];
  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index];
    if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
    const kernelPayload = viaKernel?.get(entity.id);
    if (kernelPayload) {
      results.push(kernelPayload);
      for (const path of kernelPayload.paths) transfer.push(path.buffer);
      continue;
    }
    const paths: Float32Array[] = [];
    const closed: boolean[] = [];
    for (const path of CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(
      entity,
      cadStepsFor(segments, index),
      document,
    )) {
      if (path.points.length < 2) continue;
      const xy = new Float32Array(path.points.length * 2);
      for (let point = 0; point < path.points.length; point += 1) {
        xy[point * 2] = path.points[point].x - origin.x;
        xy[point * 2 + 1] = path.points[point].y - origin.y;
      }
      paths.push(xy);
      closed.push(path.closed);
      transfer.push(xy.buffer);
    }
    results.push({ entityId: entity.id, paths, closed });
  }
  return { results, transfer };
}

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<CadTessellateWorkerRequest>) => void) | null;
  postMessage: (message: CadTessellateWorkerResponse, transfer?: Transferable[]) => void;
  // `document` sólo existe en el hilo principal; su ausencia es lo que
  // distingue a un worker de un módulo importado por una prueba en Node.
  document?: unknown;
};

/**
 * El binario se descarga UNA vez por worker y sólo si algún mensaje activó la
 * bandera; `loadCadCurveKernelFromUrl` no lanza nunca —degrada al motor
 * JavaScript con el motivo dentro—, así que cachear la promesa no puede
 * cachear un rechazo.
 */
let cadCurveKernelPromise: Promise<CadCurveKernel> | null = null;
function cadCurveKernelForWorker(useKernel: boolean | undefined): Promise<CadCurveKernel | null> {
  if (!useKernel) return Promise.resolve(null);
  if (!cadCurveKernelPromise) cadCurveKernelPromise = loadCadCurveKernelFromUrl();
  return cadCurveKernelPromise;
}

if (typeof workerScope.postMessage === "function" && workerScope.document === undefined) {
  workerScope.onmessage = (event) => {
    const request = event.data;
    cadCurveKernelForWorker(request.curveKernel).then((kernel) => {
      try {
        const { results, transfer } = tessellateCadEntityBatch(
          request.entities,
          request.segments,
          request.document,
          request.origin,
          kernel,
        );
        workerScope.postMessage(
          { id: request.id, ok: true, results },
          transfer as unknown as Transferable[],
        );
      } catch (cause) {
        workerScope.postMessage({
          id: request.id,
          ok: false,
          error: cause instanceof Error ? cause.message : "Falló el worker de teselado CAD.",
        });
      }
    });
  };
}
