/**
 * Lee sólo las LWPOLYLINE del DXF devuelto por un lector externo. El helper
 * histórico `dxf-oracle.mjs` conserva únicamente el último grupo 10/20, así
 * que no sirve para cotejar vértices repetidos. Este parser no toca fixtures.
 */
export function lwPolylinesFromDxf(text) {
  const lines = text.split(/\r?\n/);
  const records = [];
  let section = null;
  let block = null;
  let pendingSection = false;
  let pendingBlock = false;
  let current = null;

  const close = () => {
    if (current) records.push(current);
    current = null;
  };
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();
    if (code === "0") {
      close();
      pendingSection = value === "SECTION";
      pendingBlock = value === "BLOCK" && section === "BLOCKS";
      if (value === "ENDSEC") {
        section = null;
        block = null;
      } else if (value === "ENDBLK") {
        block = null;
      } else if (value === "LWPOLYLINE" && (section === "ENTITIES" || section === "BLOCKS")) {
        current = { section, block, layer: "0", declaredCount: null, flags: 0, constantWidth: undefined, vertices: [] };
      }
      continue;
    }
    if (code === "2" && pendingSection) {
      section = value;
      pendingSection = false;
      continue;
    }
    if (code === "2" && pendingBlock) {
      block = value.toUpperCase();
      pendingBlock = false;
      continue;
    }
    if (!current) continue;
    const last = current.vertices.at(-1);
    switch (code) {
      case "8": current.layer = value; break;
      case "90": current.declaredCount = Number.parseInt(value, 10); break;
      case "70": current.flags = Number.parseInt(value, 10); break;
      case "43": current.constantWidth = Number.parseFloat(value); break;
      case "10": current.vertices.push({ x: Number.parseFloat(value) }); break;
      case "20": if (last) last.y = Number.parseFloat(value); break;
      case "40": if (last) last.startWidth = Number.parseFloat(value); break;
      case "41": if (last) last.endWidth = Number.parseFloat(value); break;
      case "42": if (last) last.bulge = Number.parseFloat(value); break;
      default: break;
    }
  }
  close();
  return records;
}

/** Compara valores geométricos, además de los grupos 90/70 ya comprobados. */
export function compareLwPolylineFromDxf(text, expected, { section, block = null, ordinal = 0, label }) {
  const records = lwPolylinesFromDxf(text).filter(
    (record) => record.section === section && (section !== "BLOCKS" || record.block === block?.toUpperCase()),
  );
  const actual = records[ordinal];
  if (!actual) return [`${label}: LWPOLYLINE ausente del DXF`];

  const mismatches = [];
  const pointCount = expected.entity.vertices.length;
  const near = (left, right) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 1e-6;
  if (actual.declaredCount !== pointCount)
    mismatches.push(`${label}: grupo 90 = ${actual.declaredCount}, esperado ${pointCount}`);
  if (actual.vertices.length !== pointCount)
    mismatches.push(`${label}: ${actual.vertices.length} vértices reales, esperados ${pointCount}`);
  if ((actual.flags & 1) !== (expected.entity.closed ? 1 : 0))
    mismatches.push(`${label}: bandera de cierre ${actual.flags}`);
  if (expected.layer !== undefined && actual.layer !== expected.layer)
    mismatches.push(`${label}: capa ${actual.layer}, esperada ${expected.layer}`);
  if (!near(actual.constantWidth ?? 0, expected.entity.constantWidth ?? 0))
    mismatches.push(`${label}: ancho constante ${actual.constantWidth}`);

  for (let i = 0; i < pointCount; i += 1) {
    const point = actual.vertices[i];
    const wanted = expected.entity.vertices[i];
    if (!point) continue;
    if (!near(point.x, wanted.x) || !near(point.y, wanted.y))
      mismatches.push(`${label}: vértice[${i}] (${point.x}, ${point.y}), esperado (${wanted.x}, ${wanted.y})`);
    if (!near(point.bulge ?? 0, expected.entity.bulges?.[i] ?? 0))
      mismatches.push(`${label}: bulge[${i}] ${point.bulge ?? 0}`);
    const widths = expected.entity.widths?.[i];
    if (!near(point.startWidth ?? 0, widths?.start ?? 0))
      mismatches.push(`${label}: ancho inicial[${i}] ${point.startWidth ?? 0}`);
    if (!near(point.endWidth ?? 0, widths?.end ?? 0))
      mismatches.push(`${label}: ancho final[${i}] ${point.endWidth ?? 0}`);
  }
  return mismatches;
}
