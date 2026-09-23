/** Lectura breve de la selección para quien está dibujando, sin claves DXF. */
import type { CadDocument, CadPoint3 } from "@/lib/cad/cad-document";
import { buildCadDimensionGeometry } from "@/lib/cad/associative-dimension";
import { cadEntityLabel, cadEntityLabels } from "@/lib/cad/entity-labels";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "@/lib/cad/entity-runtime";
import { cadEntityArea } from "@/lib/cad/inquiry/contours";
import { formatCadHumanArea, formatCadHumanLength } from "@/lib/cad/inquiry/human-units";

export interface CadHumanProperty {
  key: string;
  label: string;
  value: string;
  /** Valor canónico para no igualar dos medidas distintas que redondean igual. */
  raw?: string | number;
  /** Sólo un color de dibujo explícito y válido, nunca una clase de marca. */
  swatch?: string;
}

export interface CadHumanPropertyModel {
  heading: string;
  fields: CadHumanProperty[];
}

type Polyline = Extract<CadNativeEntity, { type: "polyline" }>;

function distance(a: CadPoint3, b: CadPoint3): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Sólo cuatro lados rectos, opuestos iguales y ángulos rectos son rectángulo. */
export function cadRectangleSides(entity: Polyline): { width: number; height: number } | null {
  if (!entity.closed || entity.vertices.length !== 4 || entity.vertices.some((vertex) => (vertex.bulge ?? 0) !== 0))
    return null;
  const sides = entity.vertices.map((start, index) => {
    const end = entity.vertices[(index + 1) % 4];
    return { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  });
  const lengths = sides.map(({ x, y, z }) => Math.hypot(x, y, z));
  const scale = Math.max(...lengths);
  if (!(scale > 1e-9) || lengths.some((length) => length <= scale * 1e-8)) return null;
  const near = (value: number) => Math.abs(value) <= scale * 1e-6;
  const dot = (a: typeof sides[number], b: typeof sides[number]) => a.x * b.x + a.y * b.y + a.z * b.z;
  if (!sides.every((side) => near(side.z))) return null; // una figura 3D no es el rectángulo de planta
  if (!near(lengths[0] - lengths[2]) || !near(lengths[1] - lengths[3])) return null;
  if (!near(sides[0].x + sides[2].x) || !near(sides[0].y + sides[2].y)) return null;
  if (!near(sides[1].x + sides[3].x) || !near(sides[1].y + sides[3].y)) return null;
  if (Math.abs(dot(sides[0], sides[1])) > scale * scale * 1e-6) return null;
  return { width: lengths[0], height: lengths[1] };
}

function drawingColor(entity: CadNativeEntity, document: CadDocument | null): CadHumanProperty {
  const own = entity.context?.presentation?.color;
  const layer = document?.layers.find((candidate) => candidate.id === entity.layer);
  const raw = own?.source === "explicit" ? own.value : layer?.color;
  const swatch = raw && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?$/i.test(raw) ? raw : undefined;
  return {
    key: "color",
    label: "Color",
    value: own?.source === "explicit" ? "Personalizado" : "De la capa",
    raw: `${own?.source ?? "byLayer"}:${raw ?? ""}`,
    ...(swatch ? { swatch } : {}),
  };
}

function nameOf(entity: CadNativeEntity, document: CadDocument | null): string {
  const all = document?.entities ?? [entity];
  if (entity.type === "opening") {
    const same = all.filter((candidate) => candidate.type === "opening" && candidate.kind === entity.kind);
    const ordinal = Math.max(1, same.findIndex((candidate) => candidate.id === entity.id) + 1);
    return `${entity.kind === "door" ? "Puerta" : "Ventana"} ${ordinal}`;
  }
  if (entity.type === "polyline" && cadRectangleSides(entity)) {
    const same = all.filter((candidate): candidate is Polyline => candidate.type === "polyline" && cadRectangleSides(candidate) !== null);
    return `Rectángulo ${Math.max(1, same.findIndex((candidate) => candidate.id === entity.id) + 1)}`;
  }
  return cadEntityLabel(entity, all);
}

function one(
  entity: CadNativeEntity,
  document: CadDocument | null,
  includeHeading = true,
  documentLabels?: ReadonlyMap<string, string>,
): CadHumanPropertyModel {
  const unit = document?.meta.unit;
  const length = (value: number) => formatCadHumanLength(value, unit);
  const area = (value: number) => formatCadHumanArea(value, unit);
  const layer = document?.layers.find((candidate) => candidate.id === entity.layer);
  const field = (key: string, label: string, value: string, raw?: string | number): CadHumanProperty =>
    ({ key, label, value, ...(raw === undefined ? {} : { raw }) });
  const capa = field("layer", "Capa", layer?.name?.trim() || entity.layer, entity.layer);
  const heading = includeHeading ? nameOf(entity, document) : "";

  if (entity.type === "wall") return {
    heading,
    fields: [
      field("length", "Largo", length(distance(entity.start, entity.end)), distance(entity.start, entity.end)),
      field("thickness", "Grosor", length(entity.thickness), entity.thickness),
      field("height", "Altura", length(entity.height), entity.height),
      capa,
    ],
  };

  if (entity.type === "opening") {
    const host = document?.entities.find((candidate) => candidate.id === entity.hostId && candidate.type === "wall");
    return {
      heading,
      fields: [
        field("width", "Ancho", length(entity.width), entity.width),
        field("height", "Alto", length(entity.height), entity.height),
        field("host", "Muro en que está", host ? documentLabels?.get(host.id) ?? cadEntityLabel(host, document!.entities) : "Muro no disponible", entity.hostId),
      ],
    };
  }

  if (entity.type === "polyline") {
    const rectangle = cadRectangleSides(entity);
    const measured = entity.closed ? cadEntityArea(entity, CAD_ENTITY_REGISTRY, document ?? undefined) : null;
    const metrics = measured && !measured.assumedClosed ? [
      field("area", "Área", area(measured.area), measured.area),
      field("perimeter", "Perímetro", length(measured.perimeter), measured.perimeter),
    ] : [];
    if (rectangle) return {
      heading,
      fields: [
        field("width", "Ancho", length(rectangle.width), rectangle.width),
        field("height", "Alto", length(rectangle.height), rectangle.height),
        ...metrics,
        capa,
        drawingColor(entity, document),
      ],
    };
    return {
      heading,
      fields: [...metrics, field("vertices", "Vértices", String(entity.vertices.length), entity.vertices.length), capa],
    };
  }

  if (entity.type === "line") {
    const degrees = ((Math.atan2(entity.end.y - entity.start.y, entity.end.x - entity.start.x) * 180) / Math.PI + 360) % 360;
    return { heading, fields: [
      field("length", "Longitud", length(distance(entity.start, entity.end)), distance(entity.start, entity.end)),
      field("angle", "Ángulo", `${degrees.toFixed(2)}°`, degrees), capa,
    ] };
  }

  if (entity.type === "circle") return { heading, fields: [
    field("radius", "Radio", length(entity.radius), entity.radius),
    field("diameter", "Diámetro", length(entity.radius * 2), entity.radius * 2),
    field("area", "Área", area(Math.PI * entity.radius * entity.radius), Math.PI * entity.radius * entity.radius), capa,
  ] };

  if (entity.type === "text" || entity.type === "mtext") {
    const read = CAD_ENTITY_REGISTRY.adapter(entity).properties.read(entity);
    const content = read.text;
    const height = read.height;
    return { heading, fields: [
      field("text", "Texto", typeof content === "string" ? content : ""),
      ...(typeof height === "number" ? [field("size", "Tamaño", length(height), height)] : []),
      capa,
    ] };
  }

  if (entity.type === "dimension") {
    const geometry = buildCadDimensionGeometry(entity);
    return { heading, fields: [
      ...(geometry ? [field("value", "Valor", geometry.label)] : []),
      field("style", "Estilo", entity.style?.trim() || "Estándar"), capa,
    ] };
  }

  return { heading, fields: [capa] };
}

function plural(entity: CadNativeEntity): string {
  switch (entity.type) {
    case "wall": return "muros";
    case "opening": return entity.kind === "door" ? "puertas" : "ventanas";
    case "polyline": return cadRectangleSides(entity) ? "rectángulos" : "polilíneas";
    case "line": return "líneas";
    case "circle": return "círculos";
    case "text": case "mtext": return "textos";
    case "dimension": return "cotas";
    default: return "objetos";
  }
}

/** En selección múltiple sólo sobreviven los campos presentes e iguales en todos. */
export function buildCadHumanPropertyModel(
  entities: readonly CadNativeEntity[],
  document: CadDocument | null,
): CadHumanPropertyModel {
  if (entities.length === 0) return { heading: "Sin selección", fields: [] };
  if (entities.length === 1) return one(entities[0], document);
  const labels = document ? cadEntityLabels(document.entities) : undefined;
  const first = one(entities[0], document, false, labels);
  const rest = entities.slice(1).map((entity) => one(entity, document, false, labels));
  const sameKind = entities.every((entity) => plural(entity) === plural(entities[0]));
  return {
    heading: `${entities.length} ${sameKind ? plural(entities[0]) : "objetos"} seleccionados`,
    fields: first.fields.filter((candidate) => rest.every((model) =>
      model.fields.some((row) => row.key === candidate.key && Object.is(row.raw ?? row.value, candidate.raw ?? candidate.value)))),
  };
}
