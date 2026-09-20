/**
 * Suavizado REAL de mallas — Catmull-Clark generalizado vía Loop.
 *
 * ## Lo que había (auditoría del 19-sep)
 *
 * MESHSMOOTH, MESHSMOOTHMORE, MESHREFINE y MESHUNCREASE llamaban los cuatro a
 * `subdivideMesh` (`mesh-operations.ts`): parte cada cara por el PUNTO MEDIO de
 * sus aristas y no mueve ni un vértice. El volumen y la caja envolvente salían
 * IDÉNTICOS — relleno con nombre de AutoCAD, no suavizado.
 *
 * ## Por qué Loop y no Catmull-Clark literal
 *
 * El kernel de este producto (`lib/brep`) valida cada cara de un sólido como
 * PLANA (`invariants.ts`, `requirePlanarFaces`): es la hipótesis de la que vive
 * un B-rep de caras planas, y las booleanas y el redondeo la dan por hecha. Una
 * superficie de subdivisión Catmull-Clark de verdad NO produce cuadriláteros
 * planos — se comprobó a mano sobre un cubo unidad: el cuadrilátero nuevo de una
 * esquina se desvía ~0,04 de su plano medio, muy por encima de cualquier
 * tolerancia numérica — así que guardar sus caras como cuadriláteros haría que
 * `attachPlanarSurfaces`/`validateBody` RECHAZARAN la malla en cuanto alguien
 * pidiera su volumen.
 *
 * Un TRIÁNGULO, en cambio, es plano por definición: tres puntos siempre
 * determinan un plano. Loop subdivision (Charles Loop, 1987) es exactamente
 * Catmull-Clark restringido a mallas triangulares, y produce SIEMPRE triángulos.
 * Por eso: la malla base se TRIANGULA una vez (abanico desde el primer vértice
 * de cada cara — no cambia el volumen ni el área de una cara convexa, sólo su
 * topología) y cada nivel de suavizado es un paso de Loop sobre esa
 * triangulación. El nivel 0 sigue siendo la malla ORIGINAL sin triangular — la
 * triangulación sólo se aplica a partir del nivel 1, así que MESHSMOOTHLESS
 * hasta el fondo devuelve exactamente los cuadriláteros de siempre.
 *
 * ## Pliegues (creases)
 *
 * Un pliegue es BINARIO en esta implementación: una arista está plegada o no
 * lo está (a diferencia del valor 0..«Siempre» de AutoCAD, que decae un nivel
 * por cada suavizado). Una arista plegada — y toda arista de BORDE, siempre —
 * usa la regla de curva 1D de Hoppe et al. 1994 («Piecewise Smooth Surface
 * Reconstruction»): el punto de arista es su punto medio sin más, y el vértice
 * que sólo toca DOS aristas plegadas se mueve a lo largo de esa curva
 * (1/8, 3/4, 1/8) en vez de redondearse hacia sus vecinos. Un vértice con 1 o
 * ≥3 aristas plegadas es una ESQUINA y no se mueve. El resultado medible: una
 * arista plegada conserva su ángulo diedro exacto en cada nivel; sin el
 * pliegue, la misma arista se redondea.
 *
 * ## Ida y vuelta exacta
 *
 * No hay «deshacer» matemático de un suavizado — no es invertible. Lo que se
 * persiste (`meshSubdivision` en `cad-entities-v5.ts`) es la malla BASE más la
 * lista de pliegues y el nivel actual; bajar el nivel vuelve a subdividir la
 * MISMA base desde cero. Como `subdivideLoop` es una función pura, visitar el
 * mismo nivel dos veces da bit a bit el mismo resultado — ahí vive la
 * exactitud de la ida y vuelta, no en deshacer nada.
 */

export interface MeshPoint {
  x: number;
  y: number;
  z: number;
}

export interface MeshFace {
  outer: readonly number[];
}

export interface MeshGeometry {
  points: readonly MeshPoint[];
  faces: readonly MeshFace[];
}

/** Arista sin dirección, como par de índices en la malla BASE. */
export interface MeshCrease {
  a: number;
  b: number;
}

function mid(a: MeshPoint, b: MeshPoint): MeshPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/** Clave canónica (no dirigida) de una arista por índice de vértice. */
export function meshEdgeKey(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Triangula cada cara por abanico desde su primer vértice.
 *
 * No añade puntos — sólo parte cada `outer` de n vértices en n-2 triángulos que
 * comparten `outer[0]`. Para una cara CONVEXA (todas las que produce este
 * producto: cajas, tapas, uniones de mallas) el área y el volumen que encierra
 * no cambian: sólo cambia la topología, que es justo lo que se necesita para
 * que cada cara sea plana por construcción antes de suavizar.
 */
export function triangulateFan(mesh: MeshGeometry): MeshGeometry {
  const faces: MeshFace[] = [];
  for (const face of mesh.faces) {
    const outer = face.outer;
    if (outer.length < 3) continue;
    if (outer.length === 3) {
      faces.push({ outer: [...outer] });
      continue;
    }
    for (let i = 1; i < outer.length - 1; i++) {
      faces.push({ outer: [outer[0], outer[i], outer[i + 1]] });
    }
  }
  return { points: mesh.points.map((p) => ({ ...p })), faces };
}

interface EdgeInfo {
  a: number;
  b: number;
  /** Vértices opuestos: 1 en una arista de borde, 2 en una interior. */
  opp: number[];
  faces: number[];
}

function buildEdgeInfo(mesh: MeshGeometry): Map<string, EdgeInfo> {
  const edges = new Map<string, EdgeInfo>();
  mesh.faces.forEach((face, fi) => {
    const [v0, v1, v2] = face.outer;
    const sides: [number, number, number][] = [
      [v0, v1, v2],
      [v1, v2, v0],
      [v2, v0, v1],
    ];
    for (const [a, b, c] of sides) {
      const key = meshEdgeKey(a, b);
      let info = edges.get(key);
      if (!info) {
        info = { a: Math.min(a, b), b: Math.max(a, b), opp: [], faces: [] };
        edges.set(key, info);
      }
      info.opp.push(c);
      info.faces.push(fi);
    }
  });
  return edges;
}

/** ¿Es esta arista un pliegue (borde de la malla, o marcada explícitamente)? */
function isSharpEdge(info: EdgeInfo, creaseKeys: ReadonlySet<string>): boolean {
  if (info.faces.length === 1) return true;
  return creaseKeys.has(meshEdgeKey(info.a, info.b));
}

export interface LoopStepResult {
  mesh: MeshGeometry;
  /** Pliegues, re-expresados en los índices de la malla NUEVA. */
  creaseKeys: ReadonlySet<string>;
}

/**
 * Un paso de subdivisión de Loop sobre una malla TRIANGULAR.
 *
 * `creaseKeys` son claves de `meshEdgeKey` sobre los índices de `mesh` de
 * ENTRADA. Cada cara produce 4 triángulos nuevos (regla conocida de Loop): la
 * caja del punto de esta función queda O(F) en aristas y vértices, y el
 * resultado tiene exactamente `4 * mesh.faces.length` caras.
 */
export function loopSubdivideStep(
  mesh: MeshGeometry,
  creaseKeys: ReadonlySet<string> = new Set(),
): LoopStepResult {
  const points = mesh.points;
  const edgeInfo = buildEdgeInfo(mesh);

  // 1) Posición de cada nuevo «punto de arista», y su índice (se numeran a
  //    partir de `points.length`, en el orden de iteración del mapa).
  const edgePointIndex = new Map<string, number>();
  const newPoints: MeshPoint[] = points.map((p) => ({ ...p }));
  for (const info of edgeInfo.values()) {
    const A = points[info.a];
    const B = points[info.b];
    const sharp = isSharpEdge(info, creaseKeys);
    const pos = sharp
      ? mid(A, B)
      : (() => {
          const [c1, c2] = info.opp;
          const C = points[c1];
          const D = points[c2];
          return {
            x: (3 / 8) * (A.x + B.x) + (1 / 8) * (C.x + D.x),
            y: (3 / 8) * (A.y + B.y) + (1 / 8) * (C.y + D.y),
            z: (3 / 8) * (A.z + B.z) + (1 / 8) * (C.z + D.z),
          };
        })();
    edgePointIndex.set(meshEdgeKey(info.a, info.b), newPoints.length);
    newPoints.push(pos);
  }

  // 2) Adyacencia por vértice, para la regla de vértice PAR.
  const vertexEdges = new Map<number, EdgeInfo[]>();
  for (const info of edgeInfo.values()) {
    for (const v of [info.a, info.b]) {
      const list = vertexEdges.get(v);
      if (list) list.push(info);
      else vertexEdges.set(v, [info]);
    }
  }

  // 3) Nueva posición de cada vértice PAR (el mismo índice, otra posición).
  for (let vi = 0; vi < points.length; vi++) {
    const incident = vertexEdges.get(vi) ?? [];
    const sharpIncident = incident.filter((e) => isSharpEdge(e, creaseKeys));
    const old = points[vi];
    if (sharpIncident.length === 2) {
      // Vértice sobre una curva de pliegue/borde: regla 1D de Hoppe et al.
      const [e1, e2] = sharpIncident;
      const n1 = points[e1.a === vi ? e1.b : e1.a];
      const n2 = points[e2.a === vi ? e2.b : e2.a];
      newPoints[vi] = {
        x: 0.125 * n1.x + 0.75 * old.x + 0.125 * n2.x,
        y: 0.125 * n1.y + 0.75 * old.y + 0.125 * n2.y,
        z: 0.125 * n1.z + 0.75 * old.z + 0.125 * n2.z,
      };
    } else if (sharpIncident.length === 0 && incident.length >= 3) {
      // Vértice interior liso: regla clásica de Loop (Warren).
      const n = incident.length;
      const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      let sx = 0, sy = 0, sz = 0;
      for (const e of incident) {
        const nb = points[e.a === vi ? e.b : e.a];
        sx += nb.x; sy += nb.y; sz += nb.z;
      }
      newPoints[vi] = {
        x: (1 - n * beta) * old.x + beta * sx,
        y: (1 - n * beta) * old.y + beta * sy,
        z: (1 - n * beta) * old.z + beta * sz,
      };
    }
    // Si no: esquina (1 ó ≥3 pliegues) o vértice aislado — se queda quieto.
  }

  // 4) Caras nuevas: cada triángulo produce 4, con los 3 puntos de arista.
  const newFaces: MeshFace[] = [];
  const newCreaseKeys = new Set<string>();
  for (const face of mesh.faces) {
    const [v0, v1, v2] = face.outer;
    const e01 = edgePointIndex.get(meshEdgeKey(v0, v1))!;
    const e12 = edgePointIndex.get(meshEdgeKey(v1, v2))!;
    const e20 = edgePointIndex.get(meshEdgeKey(v2, v0))!;
    newFaces.push({ outer: [v0, e01, e20] });
    newFaces.push({ outer: [v1, e12, e01] });
    newFaces.push({ outer: [v2, e20, e12] });
    newFaces.push({ outer: [e01, e12, e20] });
  }

  // 5) Pliegues explícitos (no de borde — el borde se re-detecta solo, por
  //    tener una sola cara) heredados por las DOS mitades de cada arista vieja.
  for (const info of edgeInfo.values()) {
    if (info.faces.length > 1 && creaseKeys.has(meshEdgeKey(info.a, info.b))) {
      const em = edgePointIndex.get(meshEdgeKey(info.a, info.b))!;
      newCreaseKeys.add(meshEdgeKey(info.a, em));
      newCreaseKeys.add(meshEdgeKey(em, info.b));
    }
  }

  return { mesh: { points: newPoints, faces: newFaces }, creaseKeys: newCreaseKeys };
}

/**
 * La malla BASE suavizada `level` veces.
 *
 * `level <= 0` devuelve la base TAL CUAL —sin triangular—, que es lo que hace
 * posible la ida y vuelta exacta hasta la malla original. `level >= 1`
 * triangula una vez y aplica `level` pasos de Loop.
 */
export function subdivideLoop(
  base: MeshGeometry,
  creases: readonly MeshCrease[],
  level: number,
): MeshGeometry {
  if (level <= 0) return { points: base.points.map((p) => ({ ...p })), faces: base.faces.map((f) => ({ outer: [...f.outer] })) };
  let mesh = triangulateFan(base);
  let creaseKeys: ReadonlySet<string> = new Set(creases.map((c) => meshEdgeKey(c.a, c.b)));
  for (let i = 0; i < level; i++) {
    const step = loopSubdivideStep(mesh, creaseKeys);
    mesh = step.mesh;
    creaseKeys = step.creaseKeys;
  }
  return mesh;
}

// --- Medidas, por descomposición en abanico de cada cara --------------------
// (válidas para caras convexas de cualquier tamaño, no sólo triángulos: se
// usan tanto en el nivel 0 — cuadriláteros — como tras suavizar.)

/** Volumen firmado por el teorema de la divergencia, sumado cara a cara. */
export function meshSignedVolume(mesh: MeshGeometry): number {
  let sum = 0;
  for (const face of mesh.faces) {
    const outer = face.outer;
    if (outer.length < 3) continue;
    const p0 = mesh.points[outer[0]];
    for (let i = 1; i < outer.length - 1; i++) {
      const p1 = mesh.points[outer[i]];
      const p2 = mesh.points[outer[i + 1]];
      sum +=
        p0.x * (p1.y * p2.z - p1.z * p2.y) -
        p0.y * (p1.x * p2.z - p1.z * p2.x) +
        p0.z * (p1.x * p2.y - p1.y * p2.x);
    }
  }
  return sum / 6;
}

/** Área total, por descomposición en abanico de cada cara. */
export function meshSurfaceArea(mesh: MeshGeometry): number {
  let sum = 0;
  for (const face of mesh.faces) {
    const outer = face.outer;
    if (outer.length < 3) continue;
    const p0 = mesh.points[outer[0]];
    for (let i = 1; i < outer.length - 1; i++) {
      const p1 = mesh.points[outer[i]];
      const p2 = mesh.points[outer[i + 1]];
      const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
      const vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z;
      const cx = uy * vz - uz * vy;
      const cy = uz * vx - ux * vz;
      const cz = ux * vy - uy * vx;
      sum += Math.hypot(cx, cy, cz) / 2;
    }
  }
  return sum;
}

export interface MeshBounds {
  min: MeshPoint;
  max: MeshPoint;
}

export function meshBounds(points: readonly MeshPoint[]): MeshBounds {
  if (points.length === 0) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  const min = { ...points[0] };
  const max = { ...points[0] };
  for (const p of points) {
    if (p.x < min.x) min.x = p.x; if (p.y < min.y) min.y = p.y; if (p.z < min.z) min.z = p.z;
    if (p.x > max.x) max.x = p.x; if (p.y > max.y) max.y = p.y; if (p.z > max.z) max.z = p.z;
  }
  return { min, max };
}
