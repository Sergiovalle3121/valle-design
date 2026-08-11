/**
 * Adaptadores de SOLID3D y REGION para `CAD_ENTITY_REGISTRY`.
 *
 * Con esto un sólido deja de ser un objeto que sólo entiende el kernel y pasa a
 * ser una entidad del dibujo como cualquier otra: se dibuja, se pincha, se
 * designa con una ventana, tiene grips y snaps, sale en el panel de propiedades
 * y responde a MOVE, ROTATE, SCALE, MIRROR y COPY sin que ninguno de esos
 * comandos sepa que existe el 3D.
 *
 * ## Qué se dibuja de un sólido en una vista 2D
 *
 * La PROYECCIÓN de los contornos de sus caras sobre el plano del papel. No es un
 * render con caras ocultas —eso vive en el visor 3D, con su propio z-buffer—
 * sino la silueta alámbrica que un CAD 2D enseña cuando miras una pieza desde
 * arriba. Es lo honesto: el documento canónico es 2D y esta vista es una
 * proyección suya, no una segunda fuente de verdad.
 *
 * ## Reflexión
 *
 * · SOLID3D: la reflexión se compone en `placement` y `solid3d-build.ts` deriva
 *   del signo del determinante que hay que **invertir las caras**. Aquí no se
 *   toca la geometría, sólo la matriz — y ése es justo el punto: mover, girar y
 *   espejar un sólido no reevalúa el árbol.
 * · REGION: sus contornos SÍ se transforman punto a punto, y bajo reflexión hay
 *   que **invertir el orden** de cada anillo. El sentido de recorrido es lo que
 *   distingue el exterior de un agujero; una región espejada sin invertir extruye
 *   un sólido con las normales hacia dentro. La comprobación que lo fija no es
 *   una ida y vuelta —espejar dos veces devuelve el original tanto si se invierte
 *   como si no— sino el ANCLA de que el área con signo sigue siendo positiva.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
import type { CadSolidPlacement } from "./cad-entities-v5";
import { cloneContext } from "./entity-context";
import {
  boundsContained,
  boundsIntersect,
  pathHit,
  pointInPolygon,
  pointsBounds,
} from "./entity-hit-geometry";
import {
  solid3dBody,
  solid3dMassProperties,
  resolveSolidPlacement,
  validateSolidTree,
} from "./solid3d-build";
import {
  cadAffineCompose,
  cadAffineFromTransform,
  cadTransformIsReflecting,
  cadTransformPoint3,
} from "./transform2d";
import type {
  CadBounds,
  CadEntityAdapter,
  CadGrip,
  CadHitTester,
  CadNativeEntity,
  CadPropertyValue,
  CadRenderPath,
  CadSnapPoint,
} from "./entity-runtime";

type SolidEntity = Extract<CadNativeEntity, { type: "solid3d" }>;
type RegionEntity = Extract<CadNativeEntity, { type: "region" }>;

const finite = (value: CadPropertyValue | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const flat = (points: readonly CadPoint3[]): CadPoint2[] =>
  points.map((point) => ({ x: point.x, y: point.y }));

/** Área con signo: positiva si el anillo va en sentido antihorario. */
export function ringSignedArea(points: readonly CadPoint2[]): number {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

// ---------------------------------------------------------------------------
// SOLID3D
// ---------------------------------------------------------------------------

/**
 * Contornos de las caras del sólido, proyectados a XY.
 *
 * Un árbol roto NO revienta el dibujo: devuelve una cruz en el punto de
 * colocación, igual que hace un INSERT que no encuentra su bloque. Que el
 * editor se caiga entero por una entidad corrupta es peor que enseñar un
 * marcador, y el problema real se cuenta en el panel de propiedades y lo rechaza
 * el servidor al guardar.
 */
function solidPaths(entity: SolidEntity): CadRenderPath[] {
  try {
    const body = solid3dBody(entity);
    const paths: CadRenderPath[] = [];
    for (const face of body.faces) {
      for (const loop of face.loops) {
        const points: CadPoint2[] = [];
        let halfEdge = body.loops[loop].first;
        do {
          const vertex = body.vertices[body.halfEdges[halfEdge].origin].point;
          points.push({ x: vertex.x, y: vertex.y });
          halfEdge = body.halfEdges[halfEdge].next;
        } while (halfEdge !== body.loops[loop].first);
        if (points.length >= 2) paths.push({ points, closed: true });
      }
    }
    return paths;
  } catch {
    return brokenSolidMarker(entity);
  }
}

/** Cruz de 100 unidades en el punto de colocación: «aquí hay un sólido roto». */
function brokenSolidMarker(entity: SolidEntity): CadRenderPath[] {
  const placement = resolveSolidPlacement(entity.placement);
  const reach = 50;
  return [
    { points: [{ x: placement.e - reach, y: placement.f }, { x: placement.e + reach, y: placement.f }], closed: false },
    { points: [{ x: placement.e, y: placement.f - reach }, { x: placement.e, y: placement.f + reach }], closed: false },
  ];
}

/**
 * Caja envolvente 2D del sólido: su caja 3D proyectada al plano.
 *
 * Nunca infinita y nunca vacía. `CadSpatialIndex` divide `bounds` entre el
 * tamaño de celda y con un infinito el conteo sale `NaN`, la guarda `NaN >
 * máximo` es FALSA y el bucle siguiente itera de `−Infinity` a `+Infinity`: no
 * es que el índice devuelva de más, es que se cuelga el hilo y con él el editor.
 * De ahí que un sólido irrecuperable devuelva la caja de su marcador.
 */
function solidBounds(entity: SolidEntity): CadBounds {
  const points = solidPaths(entity).flatMap((path) => path.points);
  if (points.length === 0) return pointsBounds(brokenSolidMarker(entity).flatMap((path) => path.points));
  const bounds = pointsBounds(points);
  if (
    !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxY)
  )
    return pointsBounds(brokenSolidMarker(entity).flatMap((path) => path.points));
  return bounds;
}

const solidHitTester: CadHitTester<SolidEntity> = {
  // Un sólido se pincha por su silueta O por dentro: es un cuerpo, no un trazo.
  hitTest: (entity, point, tolerance) => {
    const paths = solidPaths(entity);
    if (pathHit(paths, point, tolerance)) return true;
    return paths.some((path) => path.closed && pointInPolygon(point, path.points));
  },
  intersectsWindow: (entity, window, crossing) => {
    const bounds = solidBounds(entity);
    return crossing ? boundsIntersect(bounds, window) : boundsContained(bounds, window);
  },
};

/** Punto base del sólido: la traslación de su colocación. */
function solidBasePoint(entity: SolidEntity): CadPoint2 {
  const placement = resolveSolidPlacement(entity.placement);
  return { x: placement.e, y: placement.f };
}

function withPlacement(entity: SolidEntity, placement: CadSolidPlacement): SolidEntity {
  return { ...entity, placement, context: cloneContext(entity.context) };
}

const solid3dAdapter: CadEntityAdapter<SolidEntity> = {
  type: "solid3d",
  renderer: { paths: (entity) => solidPaths(entity) },
  bounds: { bounds: (entity) => solidBounds(entity) },
  hitTester: solidHitTester,
  grips: {
    /**
     * Base y esquinas. La base MUEVE el sólido —es la traslación de la
     * colocación— y las esquinas lo escalan respecto de la esquina opuesta, que
     * es lo que un dibujante espera de un grip de caja.
     */
    grips: (entity) => {
      const bounds = solidBounds(entity);
      const base = solidBasePoint(entity);
      const corners: CadGrip[] = [
        { id: "corner:sw", point: { x: bounds.minX, y: bounds.minY } },
        { id: "corner:se", point: { x: bounds.maxX, y: bounds.minY } },
        { id: "corner:ne", point: { x: bounds.maxX, y: bounds.maxY } },
        { id: "corner:nw", point: { x: bounds.minX, y: bounds.maxY } },
      ].map((corner) => ({ ...corner, kind: "control" as const, label: "Esquina del sólido" }));
      return [{ id: "base", kind: "center" as const, point: base, label: "Punto base del sólido" }, ...corners];
    },
    moveGrip: (entity, gripId, point) => {
      const placement = resolveSolidPlacement(entity.placement);
      if (gripId === "base")
        return withPlacement(entity, { ...placement, e: point.x, f: point.y });
      if (!gripId.startsWith("corner:")) return entity;
      const bounds = solidBounds(entity);
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      if (!(width > 1e-9) || !(height > 1e-9)) return entity;
      // La esquina OPUESTA se queda quieta, así que es el origen del escalado.
      const anchor = {
        x: gripId.endsWith("e") ? bounds.minX : bounds.maxX,
        y: gripId.includes("n") ? bounds.minY : bounds.maxY,
      };
      const scaleX = (point.x - anchor.x) / (gripId.endsWith("e") ? width : -width);
      const scaleY = (point.y - anchor.y) / (gripId.includes("n") ? height : -height);
      if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return entity;
      if (Math.abs(scaleX) < 1e-9 || Math.abs(scaleY) < 1e-9) return entity;
      return solid3dAdapter.commands.transform(entity, {
        scaleXY: { x: scaleX, y: scaleY },
        origin: anchor,
      });
    },
  },
  snaps: {
    snaps: (entity) => {
      const points: CadSnapPoint[] = [
        { kind: "center", point: solidBasePoint(entity), label: "Punto base del sólido" },
      ];
      // Los vértices proyectados del cuerpo son los puntos a los que un
      // dibujante quiere engancharse; se deduplican porque cada vértice
      // pertenece a tres caras y aparecería tres veces en la lista de snaps.
      const seen = new Set<string>();
      for (const path of solidPaths(entity)) {
        for (const point of path.points) {
          const key = `${point.x.toFixed(6)}:${point.y.toFixed(6)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          points.push({ kind: "endpoint", point, label: "Vértice del sólido" });
        }
      }
      return points;
    },
  },
  properties: {
    read: (entity) => {
      const placement = resolveSolidPlacement(entity.placement);
      const issues = validateSolidTree(entity);
      const base: Record<string, CadPropertyValue> = {
        name: entity.name ?? "",
        baseX: placement.e,
        baseY: placement.f,
        elevation: placement.dz,
        nodes: entity.nodes.length,
        root: entity.root,
        layer: entity.layer,
        valid: issues.length === 0,
      };
      if (issues.length > 0) {
        base.issue = issues[0].message;
        return base;
      }
      try {
        const mass = solid3dMassProperties(entity);
        base.volume = mass.volume;
        base.area = mass.area;
        base.centroidX = mass.centroid.x;
        base.centroidY = mass.centroid.y;
        base.centroidZ = mass.centroid.z;
      } catch (error) {
        base.valid = false;
        base.issue = error instanceof Error ? error.message : String(error);
      }
      return base;
    },
    /**
     * Sólo se escriben la capa, el nombre y la COLOCACIÓN. El árbol de
     * construcción no se edita desde el bolsillo de propiedades: sus nodos son
     * geometría con invariantes, y un `Partial<CadPropertyBag>` de números
     * sueltos no puede expresar «cambia el perfil de la extrusión» sin abrir la
     * puerta a escribir un árbol que no evalúa.
     */
    write: (entity, patch) => {
      const placement = resolveSolidPlacement(entity.placement);
      return {
        ...entity,
        name: typeof patch.name === "string" ? patch.name.slice(0, 128) : entity.name,
        layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
        placement: {
          ...placement,
          e: finite(patch.baseX, placement.e),
          f: finite(patch.baseY, placement.f),
          dz: finite(patch.elevation, placement.dz),
        },
      };
    },
  },
  commands: {
    /**
     * La transformada se COMPONE en la colocación; el árbol no se toca.
     *
     * `A ∘ M`: primero la colocación que ya tenía el sólido y después la
     * transformada nueva, que es el orden en que ocurren los gestos del usuario.
     * La reflexión no necesita caso especial aquí porque el determinante de la
     * matriz compuesta ya la lleva dentro, y `placeBody` invierte las caras
     * cuando ese determinante es negativo. Guardar además un booleano
     * «reflejado» sería un segundo sitio del que la verdad puede divergir.
     *
     * `dz` va por `cadTransformPoint3`, que —por decisión del producto— NO
     * escala la elevación: escalar una planta al doble no sube los objetos al
     * doble de altura.
     */
    transform: (entity, transform) => {
      const current = resolveSolidPlacement(entity.placement);
      const composed = cadAffineCompose(cadAffineFromTransform(transform), {
        a: current.a,
        b: current.b,
        c: current.c,
        d: current.d,
        e: current.e,
        f: current.f,
      });
      return withPlacement(entity, { ...composed, dz: current.dz });
    },
  },
};

// ---------------------------------------------------------------------------
// REGION
// ---------------------------------------------------------------------------

function regionRings(entity: RegionEntity): CadPoint3[][] {
  return [entity.outer, ...(entity.inners ?? [])];
}

function regionPaths(entity: RegionEntity): CadRenderPath[] {
  return regionRings(entity)
    .filter((ring) => ring.length >= 2)
    .map((ring) => ({ points: flat(ring), closed: true }));
}

const regionBounds = (entity: RegionEntity): CadBounds =>
  pointsBounds(regionRings(entity).flatMap(flat));

/** Área NETA: exterior menos agujeros, en valor absoluto. */
export function regionArea(entity: RegionEntity): number {
  const outer = Math.abs(ringSignedArea(flat(entity.outer)));
  const holes = (entity.inners ?? []).reduce(
    (total, ring) => total + Math.abs(ringSignedArea(flat(ring))),
    0,
  );
  return Math.max(0, outer - holes);
}

/** Perímetro de TODOS los contornos: el exterior y los agujeros. */
export function regionPerimeter(entity: RegionEntity): number {
  let total = 0;
  for (const ring of regionRings(entity)) {
    const points = flat(ring);
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return total;
}

const regionAdapter: CadEntityAdapter<RegionEntity> = {
  type: "region",
  renderer: { paths: (entity) => regionPaths(entity) },
  bounds: { bounds: (entity) => regionBounds(entity) },
  hitTester: {
    // Igual que HATCH y SOLID: una región se pincha por dentro, no acertándole
    // al borde. Los agujeros NO cuentan como interior.
    hitTest: (entity, point, tolerance) => {
      if (pathHit(regionPaths(entity), point, tolerance)) return true;
      if (!pointInPolygon(point, flat(entity.outer))) return false;
      return !(entity.inners ?? []).some((ring) => pointInPolygon(point, flat(ring)));
    },
    intersectsWindow: (entity, window, crossing) => {
      const bounds = regionBounds(entity);
      return crossing ? boundsIntersect(bounds, window) : boundsContained(bounds, window);
    },
  },
  grips: {
    grips: (entity) =>
      entity.outer.map((vertex, index) => ({
        id: `outer:${index}`,
        kind: "endpoint" as const,
        point: { x: vertex.x, y: vertex.y },
        label: `Vértice ${index + 1}`,
      })),
    moveGrip: (entity, gripId, point) => {
      const match = /^outer:(\d+)$/.exec(gripId);
      if (!match) return entity;
      const index = Number(match[1]);
      if (!Number.isInteger(index) || index < 0 || index >= entity.outer.length) return entity;
      const outer = entity.outer.map((vertex, at) =>
        at === index ? { x: point.x, y: point.y, z: vertex.z } : vertex,
      );
      return { ...entity, outer };
    },
  },
  snaps: {
    snaps: (entity) =>
      regionRings(entity).flatMap((ring) =>
        ring.map((vertex) => ({
          kind: "endpoint" as const,
          point: { x: vertex.x, y: vertex.y },
          label: "Vértice de región",
        })),
      ),
  },
  properties: {
    read: (entity) => ({
      area: regionArea(entity),
      perimeter: regionPerimeter(entity),
      vertices: entity.outer.length,
      holes: (entity.inners ?? []).length,
      elevation: entity.outer[0]?.z ?? 0,
      layer: entity.layer,
    }),
    /**
     * Sólo la capa y la elevación. El área y el perímetro son DERIVADOS: se leen
     * y no se escriben, porque no hay una forma única de deformar un contorno
     * para que mida lo que se le pida.
     */
    write: (entity, patch) => {
      const elevation = finite(patch.elevation, entity.outer[0]?.z ?? 0);
      const lift = (ring: CadPoint3[]) => ring.map((vertex) => ({ ...vertex, z: elevation }));
      return {
        ...entity,
        outer: lift(entity.outer),
        ...(entity.inners ? { inners: entity.inners.map(lift) } : {}),
        layer: typeof patch.layer === "string" ? patch.layer : entity.layer,
      };
    },
  },
  commands: {
    /**
     * Bajo reflexión, cada anillo se INVIERTE además de transformarse.
     *
     * Sin eso el contorno exterior queda horario, su área con signo sale
     * negativa y todo lo que consuma la región después —EXTRUDE, REVOLVE, el
     * cálculo de área— la interpreta como un agujero. El síntoma es un sólido
     * con las normales hacia dentro, que es exactamente el defecto que esta
     * línea existe para impedir.
     */
    transform: (entity, transform) => {
      const reflecting = cadTransformIsReflecting(transform);
      const map = (ring: CadPoint3[]): CadPoint3[] => {
        const moved = ring.map((vertex) => cadTransformPoint3(vertex, transform));
        return reflecting ? moved.reverse() : moved;
      };
      return {
        ...entity,
        outer: map(entity.outer),
        ...(entity.inners ? { inners: entity.inners.map(map) } : {}),
        context: cloneContext(entity.context),
      };
    },
  },
};

export { regionAdapter, solid3dAdapter };
export type { RegionEntity, SolidEntity };
