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
        z: entity.z ?? 0,
        bulge: entity.bulge ?? 0,
        flags: entity.flags ?? 0,
        g71: entity.g71 ?? 0,
        g72: entity.g72 ?? 0,
        g73: entity.g73 ?? 0,
        g74: entity.g74 ?? 0,
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
    "MTEXT",
    "ATTRIB",
    "ATTDEF",
    "DIMENSION",
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
      // En MTEXT/ATTRIB/ATTDEF/DIMENSION el 2 no es nombre de bloque: es el
      // tag del atributo o el nombre del bloque anónimo de la cota.
      if (entity.type === "ATTRIB" || entity.type === "ATTDEF") {
        entity.tag = value.trim();
      } else {
        entity.blockName = value.trim();
      }
      break;
    case 3:
      // Continuación de texto MTEXT o prompt de ATTDEF.
      if (entity.type === "MTEXT") entity.text3 = (entity.text3 ?? "") + value;
      else if (entity.type === "ATTDEF") entity.prompt = value;
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
    case 13:
      entity.x13 = num(value);
      break;
    case 23:
      entity.y13 = num(value);
      break;
    case 14:
      entity.x14 = num(value);
      break;
    case 24:
      entity.y14 = num(value);
      break;
    case 15:
      entity.x15 = num(value);
      break;
    case 25:
      entity.y15 = num(value);
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
    case 71:
      entity.g71 = Number.parseInt(value, 10);
      break;
    case 72:
      entity.g72 = Number.parseInt(value, 10);
      break;
    case 73:
      entity.g73 = Number.parseInt(value, 10);
      break;
    case 74:
      entity.g74 = Number.parseInt(value, 10);
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
    case "MTEXT":
      return {
        kind: "mtext",
        layer: record.layer,
        fields: {
          insertion: [record.x ?? 0, record.y ?? 0],
          height: record.r40 ?? 0,
          value: (record.text3 ?? "") + (record.text ?? ""),
        },
      };
    case "ATTRIB":
    case "ATTDEF":
      return {
        kind: record.type.toLowerCase(),
        layer: record.layer,
        fields: {
          insertion: [record.x ?? 0, record.y ?? 0],
          height: record.r40 ?? 0,
          value: record.text ?? "",
          tag: record.tag ?? "",
        },
      };
    case "DIMENSION": {
      // El 70 del DXF empaqueta el tipo en los bits 0-2 más banderas (32 =
      // referencia a bloque, 64 = ordinate en X, 128 = texto recolocado).
      const type = (record.flags ?? 0) & 7;
      const kinds = [
        "linear",
        "aligned",
        "angular2ln",
        "diameter",
        "radius",
        "angular3pt",
        "ordinate",
      ];
      // El punto medio del texto (11/21) NO se compara: la herramienta
      // conversora regenera el bloque anónimo de la cota y recoloca el
      // texto, así que ese campo mide su motor de layout, no el decoder
      // (tolerancia declarada; observado en 19/20: sólo textMid difiere).
      // En las angulares el grupo 10 también es DERIVADO (el punto del arco
      // de cota, recalculado por el conversor): se comparan los puntos
      // MEDIDOS 13/14/15, que sí son geometría de la fuente.
      const kind = kinds[type] ?? `unknown-${type}`;
      const fields =
        kind === "angular3pt" || kind === "angular2ln"
          ? {
              dimensionKind: kind,
              point13: [record.x13 ?? 0, record.y13 ?? 0],
              point14: [record.x14 ?? 0, record.y14 ?? 0],
              point15: [record.x15 ?? 0, record.y15 ?? 0],
            }
          : {
              dimensionKind: kind,
              defPoint: [record.x ?? 0, record.y ?? 0, record.z ?? 0],
            };
      return { kind: "dimension", layer: record.layer, fields };
    }
    case "POLYLINE": {
      const flags = record.flags ?? 0;
      const vertices = record.vertices ?? [];
      if (flags & 8) {
        // Polilínea 3D: se conserva como su propia clase con vértices XYZ.
        return {
          kind: "polyline3d",
          layer: record.layer,
          fields: {
            closed: (flags & 1) === 1,
            vertices: vertices.map((v) => [v.x, v.y, v.z]),
          },
        };
      }
      if (flags & 16) {
        // Malla M×N: recuentos en 71/72 y vértices XYZ.
        return {
          kind: "polymesh",
          layer: record.layer,
          fields: {
            mSize: record.g71 ?? 0,
            nSize: record.g72 ?? 0,
            vertices: vertices.map((v) => [v.x, v.y, v.z]),
          },
        };
      }
      if (flags & 64) {
        // Malla polyface: separa posiciones (70 con bit 64) de caras (70 con
        // bit 128 sin bit 64), cuyos índices viajan en 71–74.
        const positions = vertices.filter((v) => (v.flags & 64) !== 0);
        const faces = vertices.filter(
          (v) => (v.flags & 128) !== 0 && (v.flags & 64) === 0,
        );
        return {
          kind: "polyfaceMesh",
          layer: record.layer,
          fields: {
            vertices: positions.map((v) => [v.x, v.y, v.z]),
            faces: faces.map((v) => [v.g71, v.g72, v.g73, v.g74]),
          },
        };
      }
      // La POLYLINE 2D del dialecto R12 se guarda como LWPOLYLINE en
      // contenedores modernos O como POLYLINE 2D clásica; ambas lecturas se
      // proyectan al mismo vocabulario para compararse.
      return {
        kind: "lwpolyline",
        layer: record.layer,
        fields: {
          closed: record.closed ?? false,
          vertices: vertices.map((v) => [v.x, v.y]),
          bulges: vertices.map((v) => v.bulge ?? 0),
          constantWidth: record.r40 ?? 0,
        },
      };
    }
    case "LWPOLYLINE":
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
