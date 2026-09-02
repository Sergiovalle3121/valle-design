/**
 * PROYECCIÓN Y COMPARACIÓN de entidades para el harness de validación del
 * corpus DWG.
 *
 * Se separó de `validate-corpus.mjs` el 2026-09-02, cuando el presupuesto de
 * monolito del monorepo (800 líneas por archivo) lo alcanzó. La partición no
 * es arbitraria ni una cuota que esquivar: el harness ya tenía este mismo
 * corte hecho una vez —el ORÁCULO vive aparte, en `dxf-oracle.mjs`, porque
 * leer la verdad esperada y compararla son responsabilidades distintas—, y lo
 * que quedaba mezclado eran otras dos: CÓMO SE PROYECTA una entidad leída al
 * vocabulario del oráculo y CÓMO SE COTEJAN los dos conjuntos, frente al
 * recorrido del corpus y el informe. Aquí viven las dos primeras.
 *
 * La semántica no cambia en la mudanza: mismos campos, misma tolerancia,
 * mismas reglas de aplanado (los ATTRIB de un INSERT vuelven a la lista, los
 * SEQEND estructurales se excluyen).
 *
 * Frontera de producto: script de evidencia, sin superficie pública.
 */

/** Tolerancia de comparación, la misma que usa el resto del harness. */
export const TOLERANCE = 1e-6;

const decodeBytes = (bytes) => Buffer.from(bytes ?? []).toString("latin1");

/**
 * Proyecta un registro leído al vocabulario de comparación del oráculo: la
 * POLYLINE 2D clásica habla el mismo idioma que la LWPOLYLINE (equivalencia
 * declarada del corpus) y las demás variantes conservan su clase.
 */
export function projectRecord(record) {
  const kind =
    record.entity.kind === "polyline2d" ? "lwpolyline" : record.entity.kind;
  return { kind, fields: readFieldsFromEntity(record) };
}

function readFieldsFromEntity(record) {
  const e = record.entity;
  const vertexEntities = (record.vertices ?? []).map((v) => v.entity);
  switch (e.kind) {
    case "line":
      return { start: [e.start.x, e.start.y, e.start.z], end: [e.end.x, e.end.y, e.end.z] };
    case "point":
      return { position: [e.position.x, e.position.y, e.position.z] };
    case "circle":
      return { center: [e.center.x, e.center.y, e.center.z], radius: e.radius };
    case "arc":
      return {
        center: [e.center.x, e.center.y, e.center.z],
        radius: e.radius,
        startAngle: e.startAngle,
        endAngle: e.endAngle,
      };
    case "text":
      return {
        insertion: [e.insertion.x, e.insertion.y],
        height: e.height,
        rotation: e.rotation ?? 0,
        value: decodeBytes(e.valueBytes),
      };
    case "insert":
      return {
        block: decodeBytes(record.insertedBlockName).toUpperCase(),
        position: [e.position.x, e.position.y, e.position.z],
        scale: [e.scale.x, e.scale.y, e.scale.z],
        rotation: e.rotation,
      };
    case "lwpolyline":
      return {
        closed: e.closed,
        vertices: e.vertices.map((v) => [v.x, v.y]),
        bulges: e.bulges ? [...e.bulges] : e.vertices.map(() => 0),
        constantWidth: e.constantWidth ?? 0,
      };
    case "mtext":
      return {
        insertion: [e.insertion.x, e.insertion.y],
        height: e.height,
        value: decodeBytes(e.valueBytes),
      };
    case "attrib":
    case "attdef":
      return {
        insertion: [e.insertion.x, e.insertion.y],
        height: e.height,
        value: decodeBytes(e.valueBytes),
        tag: decodeBytes(e.tagBytes),
      };
    case "polyline2d": {
      const positions = vertexEntities.filter((v) => v.kind === "vertex2d");
      return {
        closed: (e.flags & 1) === 1,
        vertices: positions.map((v) => [v.position.x, v.position.y]),
        bulges: positions.map((v) => v.bulge),
        constantWidth: e.startWidth === e.endWidth ? e.startWidth : 0,
      };
    }
    case "polyline3d": {
      const positions = vertexEntities.filter((v) => v.kind === "vertex3d");
      return {
        closed: (e.closedFlags & 1) === 1,
        vertices: positions.map((v) => [v.position.x, v.position.y, v.position.z]),
      };
    }
    case "polymesh": {
      const positions = vertexEntities.filter((v) => v.kind === "vertexMesh");
      return {
        mSize: e.mVertexCount,
        nSize: e.nVertexCount,
        vertices: positions.map((v) => [v.position.x, v.position.y, v.position.z]),
      };
    }
    case "polyfaceMesh": {
      const positions = vertexEntities.filter((v) => v.kind === "vertexPface");
      const faces = vertexEntities.filter((v) => v.kind === "pfaceFace");
      return {
        vertices: positions.map((v) => [v.position.x, v.position.y, v.position.z]),
        faces: faces.map((v) => [v.index1, v.index2, v.index3, v.index4]),
      };
    }
    case "ellipse":
      return {
        center: [e.center.x, e.center.y, e.center.z],
        majorAxis: [
          e.majorAxisEndpoint.x,
          e.majorAxisEndpoint.y,
          e.majorAxisEndpoint.z,
        ],
        ratio: e.axisRatio,
        startAngle: e.startAngle,
        endAngle: e.endAngle,
      };
    case "spline":
      return {
        degree: e.degree,
        closed: e.closed ?? false,
        knots: [...(e.knots ?? [])],
        controlPoints: (e.controlPoints ?? []).map((p) => [p.x, p.y, p.z]),
      };
    case "ray":
    case "xline":
      return {
        base: [e.basePoint.x, e.basePoint.y, e.basePoint.z],
        direction: [e.direction.x, e.direction.y, e.direction.z],
      };
    case "solid":
    case "trace":
      return { corners: e.corners.map((c) => [c.x, c.y]) };
    case "face3d":
      return {
        corners: e.corners.map((c) => [c.x, c.y, c.z]),
        invisibility: e.invisibilityFlags,
      };
    case "leader": {
      // Extremos del camino: el conversor regenera los vértices intermedios
      // y las cajas del leader (tolerancia declarada en el oráculo).
      const first = e.points[0] ?? { x: 0, y: 0 };
      const last = e.points[e.points.length - 1] ?? { x: 0, y: 0 };
      return {
        firstPoint: [first.x, first.y],
        lastPoint: [last.x, last.y],
      };
    }
    case "tolerance":
      return {
        insertion: [e.insertion.x, e.insertion.y, e.insertion.z],
        text: decodeBytes(e.textBytes),
      };
    case "mline":
      return {
        base: [e.basePoint.x, e.basePoint.y, e.basePoint.z],
        scale: e.scale,
        vertices: e.vertices.map((v) => [
          v.position.x,
          v.position.y,
          v.position.z,
        ]),
      };
    case "viewport":
      return {
        center: [e.center.x, e.center.y],
        width: e.width,
        height: e.height,
      };
    case "hatch": {
      const polylinePaths = e.paths.filter((p) => p.kind === "polyline");
      return {
        name: decodeBytes(e.nameBytes).toUpperCase(),
        solidFill: e.solidFill,
        pathCount: e.paths.length,
        polylineVertices: polylinePaths.map((p) =>
          p.vertices.map((v) => [v.x, v.y]),
        ),
        polylineBulges: polylinePaths.map((p) =>
          p.bulges ? [...p.bulges] : p.vertices.map(() => 0),
        ),
      };
    }
    case "dimension":
      // textMid excluido a propósito: el conversor recoloca el texto al
      // regenerar el bloque anónimo (tolerancia declarada en el oráculo).
      // En las angulares el 10 también es derivado: se comparan 13/14/15.
      if (e.dimensionKind === "angular3pt" || e.dimensionKind === "angular2ln") {
        return {
          dimensionKind: e.dimensionKind,
          point13: [e.point13?.x ?? 0, e.point13?.y ?? 0],
          point14: [e.point14?.x ?? 0, e.point14?.y ?? 0],
          point15: [e.point15?.x ?? 0, e.point15?.y ?? 0],
        };
      }
      return {
        dimensionKind: e.dimensionKind,
        defPoint: [e.definitionPoint.x, e.definitionPoint.y, e.definitionPoint.z],
      };
    default:
      return {};
  }
}

/**
 * Aplana una lista de registros de la base para compararla: los ATTRIB
 * atados a un INSERT vuelven a la lista (el oráculo DXF los ve como
 * entidades que siguen al INSERT) y los SEQEND estructurales se excluyen
 * (el oráculo también los descarta).
 */
export function flattenRecords(records) {
  const out = [];
  for (const record of records) {
    if (record.entity.kind === "seqend") continue;
    out.push(record);
    for (const attribute of record.attributes ?? []) {
      if (attribute.entity.kind !== "seqend") out.push(attribute);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Comparación con tolerancia
// ---------------------------------------------------------------------------

function fieldDiffs(expected, actual) {
  const diffs = [];
  const near = (a, b) => Math.abs(a - b) <= TOLERANCE;
  for (const [key, want] of Object.entries(expected)) {
    const got = actual[key];
    if (typeof want === "number") {
      if (typeof got !== "number" || !near(want, got)) diffs.push({ campo: key, esperado: want, leido: got ?? null });
    } else if (typeof want === "boolean" || typeof want === "string") {
      if (want !== got) diffs.push({ campo: key, esperado: want, leido: got ?? null });
    } else if (Array.isArray(want)) {
      const flatWant = want.flat(2);
      const flatGot = Array.isArray(got) ? got.flat(2) : [];
      const equal =
        flatWant.length === flatGot.length &&
        flatWant.every((v, i) =>
          typeof v === "number" ? typeof flatGot[i] === "number" && near(v, flatGot[i]) : v === flatGot[i],
        );
      if (!equal) diffs.push({ campo: key, esperado: want, leido: got ?? null });
    }
  }
  return diffs;
}

/**
 * Empareja esperadas y leídas del mismo tipo: primero coincidencia exacta
 * (dentro de la tolerancia), luego el resto por orden, dejando constancia de
 * cada campo que difiere. Lo que no se empareja queda como faltante o
 * inesperado — nunca desaparece del informe.
 */
export function compareEntitySets(expectedList, readList) {
  const kinds = [...new Set([...expectedList.map((e) => e.kind), ...readList.map((r) => r.kind)])].sort();
  const porTipo = {};
  const detalles = [];
  for (const kind of kinds) {
    const expected = expectedList.filter((e) => e.kind === kind);
    const read = readList.filter((r) => r.kind === kind);
    const usedRead = new Set();
    let correcto = 0;
    const pendientes = [];
    for (const want of expected) {
      let matched = false;
      for (let i = 0; i < read.length; i += 1) {
        if (usedRead.has(i)) continue;
        if (fieldDiffs(want.fields, read[i].fields).length === 0) {
          usedRead.add(i);
          correcto += 1;
          matched = true;
          break;
        }
      }
      if (!matched) pendientes.push(want);
    }
    let geometriaDistinta = 0;
    for (const want of pendientes) {
      const index = read.findIndex((_, i) => !usedRead.has(i));
      if (index >= 0) {
        usedRead.add(index);
        geometriaDistinta += 1;
        detalles.push({
          tipo: kind,
          problema: "geometria-distinta",
          diferencias: fieldDiffs(want.fields, read[index].fields),
        });
      } else {
        detalles.push({ tipo: kind, problema: "faltante", esperado: want.fields });
      }
    }
    const faltante = pendientes.length - geometriaDistinta;
    const inesperado = read.length - usedRead.size;
    if (inesperado > 0) detalles.push({ tipo: kind, problema: "inesperado", cuantos: inesperado });
    porTipo[kind] = {
      esperado: expected.length,
      leidoCorrecto: correcto,
      geometriaDistinta,
      faltante,
      inesperado,
    };
  }
  return { porTipo, detalles };
}
