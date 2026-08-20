/**
 * Oráculo DXF del harness de validación del corpus DWG.
 *
 * Parser mínimo del DXF FUENTE de cada bundle (pares código/valor de autoría
 * propia, congelados junto al DWG que una herramienta independiente produjo
 * de ellos). Extrae lo que un lector DWG correcto DEBE encontrar — capas,
 * bloques con su contenido y entidades con geometría — y lo normaliza al
 * vocabulario del modelo neutral del laboratorio para que
 * `validate-corpus.mjs` compare esperado contra leído.
 *
 * Vivía dentro de `validate-corpus.mjs`; se separó porque el presupuesto de
 * monolito del monorepo (800 líneas por archivo) tiene razón: el oráculo y la
 * comparación son responsabilidades distintas. La semántica no cambió en la
 * mudanza.
 *
 * Los ángulos del DXF viajan en GRADOS; aquí se convierten a radianes porque
 * el modelo neutral habla en radianes. Es un parser de evidencia: no toca el
 * laboratorio ni el producto, y sólo entiende el subconjunto que el corpus
 * fundacional usa.
 */

const DEG = Math.PI / 180;

/** Pares código/valor del texto DXF. */
function dxfPairs(text) {
  const lines = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) break;
    pairs.push([code, lines[i + 1]]);
  }
  return pairs;
}

/**
 * Extrae del DXF fuente lo que un lector correcto DEBE encontrar: capas,
 * bloques con su contenido y entidades con geometría.
 */
export function parseOracleDxf(text) {
  const pairs = dxfPairs(text);
  const layers = [];
  const blocks = new Map();
  const topEntities = [];

  let section = null;
  let table = null;
  let currentBlock = null;
  let entity = null;
  let entitySink = () => topEntities;

  const num = (value) => Number.parseFloat(value);

  const closeEntity = () => {
    if (!entity) return;
    if (entity.type === "VERTEX" && entity.parent) {
      entity.parent.vertices.push({
        x: entity.x ?? 0,
        y: entity.y ?? 0,
        bulge: entity.bulge ?? 0,
      });
      entity = entity.parent.self;
      return;
    }
    entity = null;
  };

  for (let i = 0; i < pairs.length; i += 1) {
    const [code, raw] = pairs[i];
    const value = raw.trim();
    const prev = pairs[i - 1];
    if (code === 2 && prev?.[0] === 0 && prev?.[1].trim() === "SECTION") {
      section = value;
      continue;
    }
    if (code === 0 && value === "ENDSEC") {
      closeEntity();
      section = null;
      table = null;
      currentBlock = null;
      entitySink = () => topEntities;
      continue;
    }

    if (section === "TABLES") {
      if (code === 2 && prev?.[0] === 0 && prev?.[1].trim() === "TABLE") {
        table = value;
        continue;
      }
      if (code === 0 && value === "ENDTAB") {
        table = null;
        continue;
      }
      if (table === "LAYER") {
        if (code === 0 && value === "LAYER") {
          layers.push({ name: null, flags: 0, color: 7, linetype: "CONTINUOUS" });
        } else if (layers.length > 0) {
          const layer = layers[layers.length - 1];
          if (code === 2) layer.name = value;
          else if (code === 70) layer.flags = Number.parseInt(value, 10);
          else if (code === 62) layer.color = Number.parseInt(value, 10);
          else if (code === 6) layer.linetype = value.toUpperCase();
        }
      }
      continue;
    }

    if (section === "BLOCKS") {
      if (code === 0) {
        closeEntity();
        if (value === "BLOCK") {
          currentBlock = { name: null, entities: [] };
          entity = { type: "BLOCK" };
          continue;
        }
        if (value === "ENDBLK") {
          if (currentBlock?.name && !currentBlock.name.startsWith("*")) {
            blocks.set(currentBlock.name.toUpperCase(), currentBlock.entities);
          }
          currentBlock = null;
          entity = null;
          continue;
        }
        entity = startEntity(value, currentBlock ? () => currentBlock.entities : () => []);
        continue;
      }
      if (entity?.type === "BLOCK" && code === 2 && currentBlock) {
        currentBlock.name = value;
        continue;
      }
      feedEntity(entity, code, value, num);
      continue;
    }

    if (section === "ENTITIES") {
      if (code === 0) {
        closeEntity();
        entity = startEntity(value, entitySink);
        continue;
      }
      feedEntity(entity, code, value, num);
      continue;
    }
  }
  closeEntity();
  return { layers: layers.filter((l) => l.name !== null), blocks, topEntities };
}

/** Crea el acumulador de una entidad DXF y la registra en su destino. */
function startEntity(type, sink) {
  const known = new Set([
    "LINE",
    "POINT",
    "CIRCLE",
    "ARC",
    "TEXT",
    "INSERT",
    "POLYLINE",
    "LWPOLYLINE",
    "VERTEX",
    "SEQEND",
  ]);
  if (!known.has(type)) {
    const record = { type, layer: "0", unknown: true };
    sink().push(record);
    return record;
  }
  if (type === "VERTEX" || type === "SEQEND") {
    // El VERTEX alimenta a su POLYLINE abierta; el SEQEND la cierra.
    const target = sink();
    const polyline = [...target].reverse().find((e) => e.type === "POLYLINE");
    if (type === "SEQEND") return null;
    return { type: "VERTEX", parent: polyline ? { vertices: polyline.vertices, self: null } : null };
  }
  const record = { type, layer: "0" };
  if (type === "POLYLINE") {
    record.vertices = [];
    record.closed = false;
  }
  sink().push(record);
  return record;
}

function feedEntity(entity, code, value, num) {
  if (!entity) return;
  switch (code) {
    case 8:
      entity.layer = value.trim();
      break;
    case 2:
      entity.blockName = value.trim();
      break;
    case 1:
      entity.text = value;
      break;
    case 10:
      entity.x = num(value);
      break;
    case 20:
      entity.y = num(value);
      break;
    case 30:
      entity.z = num(value);
      break;
    case 11:
      entity.x2 = num(value);
      break;
    case 21:
      entity.y2 = num(value);
      break;
    case 31:
      entity.z2 = num(value);
      break;
    case 40:
      entity.r40 = num(value);
      break;
    case 41:
      entity.r41 = num(value);
      break;
    case 42:
      // 42 es bulge en un VERTEX y escala Y en un INSERT: se guardan ambos y
      // cada tipo consume el suyo al normalizar.
      entity.bulge = num(value);
      entity.r42 = num(value);
      break;
    case 43:
      entity.r43 = num(value);
      break;
    case 50:
      entity.angle50 = num(value);
      break;
    case 51:
      entity.angle51 = num(value);
      break;
    case 70:
      entity.flags = Number.parseInt(value, 10);
      if (entity.type === "POLYLINE") entity.closed = (entity.flags & 1) === 1;
      break;
    default:
      break;
  }
}

/** Normaliza una entidad del oráculo al vocabulario del modelo neutral. */
export function expectedFromOracle(record) {
  switch (record.type) {
    case "LINE":
      return {
        kind: "line",
        layer: record.layer,
        fields: {
          start: [record.x ?? 0, record.y ?? 0, record.z ?? 0],
          end: [record.x2 ?? 0, record.y2 ?? 0, record.z2 ?? 0],
        },
      };
    case "POINT":
      return {
        kind: "point",
        layer: record.layer,
        fields: { position: [record.x ?? 0, record.y ?? 0, record.z ?? 0] },
      };
    case "CIRCLE":
      return {
        kind: "circle",
        layer: record.layer,
        fields: {
          center: [record.x ?? 0, record.y ?? 0, record.z ?? 0],
          radius: record.r40 ?? 0,
        },
      };
    case "ARC":
      return {
        kind: "arc",
        layer: record.layer,
        fields: {
          center: [record.x ?? 0, record.y ?? 0, record.z ?? 0],
          radius: record.r40 ?? 0,
          startAngle: (record.angle50 ?? 0) * DEG,
          endAngle: (record.angle51 ?? 0) * DEG,
        },
      };
    case "TEXT":
      return {
        kind: "text",
        layer: record.layer,
        fields: {
          insertion: [record.x ?? 0, record.y ?? 0],
          height: record.r40 ?? 0,
          rotation: (record.angle50 ?? 0) * DEG,
          value: record.text ?? "",
        },
      };
    case "INSERT":
      return {
        kind: "insert",
        layer: record.layer,
        fields: {
          block: (record.blockName ?? "").toUpperCase(),
          position: [record.x ?? 0, record.y ?? 0, record.z ?? 0],
          scale: [record.r41 ?? 1, record.r42 ?? record.r41 ?? 1, record.r43 ?? 1],
          rotation: (record.angle50 ?? 0) * DEG,
        },
      };
    case "POLYLINE":
    case "LWPOLYLINE":
      // Equivalencia declarada del corpus: la POLYLINE 2D clásica del DXF R12
      // se guarda como LWPOLYLINE en contenedores modernos.
      return {
        kind: "lwpolyline",
        layer: record.layer,
        fields: {
          closed: record.closed ?? false,
          vertices: (record.vertices ?? []).map((v) => [v.x, v.y]),
          bulges: (record.vertices ?? []).map((v) => v.bulge ?? 0),
          constantWidth: record.r40 ?? 0,
        },
      };
    default:
      return { kind: `dxf:${record.type.toLowerCase()}`, layer: record.layer, fields: {} };
  }
}
