import type { CadLayoutDxfInput } from '../cad-documents/cad-documents.service';
import type { PersistedCadDocument } from '../cad-documents/cad-document-validation';

/**
 * Proyección PURA del documento CAD canónico hacia la entrada del serializador
 * DXF R12 (`CadDocumentsService.buildLayoutDxf`, capas nombradas).
 *
 * El serializador del origen está modelado sobre el layout industrial
 * (estaciones/equipo/flujo); el documento canónico de Design es una lista de
 * entidades libres. Mapeo determinista v2:
 * - entidad con caja finita (x,y,w,h)          → EQUIPO (asset `kind`/label)
 * - `line`/`polyline`                          → LINE(s) DXF en SU capa
 * - `arc`                                      → ARC DXF en su capa
 * - `circle`                                   → CIRCLE DXF en su capa
 * - entidad `dim` con dos puntos               → COTAS
 * - entidad `text`/`mtext` con posición+texto  → TEXTO
 *
 * v1 degradaba `line`/`polyline` a cotas (perdiendo los vértices intermedios de
 * la polilínea) y descartaba `arc` y `circle` sin dejar rastro: el DXF del
 * servidor no contenía la geometría del dibujo. El escritor R12 ya sabía emitir
 * LINE/ARC/CIRCLE; lo que faltaba era el canal para llegar hasta él.
 * La huella (footprint) sale de `meta` cuando existe; si no, del bounding box
 * de lo mapeado (mínimo 1000×1000 para que el plano nunca colapse a 0).
 *
 * v2 llamaba `boxOf(entity)` ANTES de mirar `entity.type`: cualquier entidad
 * que tuviera por casualidad cuatro campos numéricos `x/y/w/h` finitos —sin
 * que su tipo fuera `box` ni `station`— salía como un rectángulo inventado en
 * vez de su geometría real, y ningún aviso lo decía. v3 discrimina por tipo
 * PRIMERO: sólo `box`/`station` pueden convertirse en asset. Cualquier pérdida
 * que quede —capa recortada a 31 caracteres, texto recortado a 240, o una
 * entidad que no encaja en ninguna proyección— se declara en `warnings` en vez
 * de aplicarse en silencio.
 */
export interface DxfExportLossWarning {
  entityId: string;
  code: 'layer_truncated' | 'text_truncated' | 'entity_unmapped';
  detail: string;
}

export interface DxfExportBuildResult {
  input: CadLayoutDxfInput;
  warnings: DxfExportLossWarning[];
}

export function buildDxfExportInput(
  document: PersistedCadDocument | null,
  name: string,
  model: string | null,
  revision: string | null,
): DxfExportBuildResult {
  const meta = objectOf(document?.meta);
  const entities: Record<string, unknown>[] = Array.isArray(document?.entities)
    ? (document.entities as unknown[]).filter(
        (e): e is Record<string, unknown> =>
          !!e && typeof e === 'object' && !Array.isArray(e),
      )
    : [];

  const assets: CadLayoutDxfInput['assets'] = [];
  const annotations: CadLayoutDxfInput['annotations'] = [];
  type Geometry = NonNullable<CadLayoutDxfInput['geometry']>;
  const geometryLines: Geometry['lines'] = [];
  const geometryArcs: Geometry['arcs'] = [];
  const geometryCircles: Geometry['circles'] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const track = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  const warnings: DxfExportLossWarning[] = [];

  for (const entity of entities) {
    const type =
      typeof entity.type === 'string' ? entity.type.toLowerCase() : '';
    const entityId = typeof entity.id === 'string' ? entity.id : '(sin id)';

    // El tipo se decide ANTES de mirar si hay una caja: `box`/`station` son
    // los ÚNICOS tipos con `x/y/w/h` propios. Mirar la caja primero convertía
    // en rectángulo inventado a cualquier entidad —muro, hueco, cota— que
    // tuviera esos cuatro campos por coincidencia de esquema.
    if (type === 'box' || type === 'station') {
      const box = boxOf(entity);
      if (box) {
        assets.push({
          kind: (typeof entity.kind === 'string'
            ? entity.kind
            : type || 'box'
          ).slice(0, 24),
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          rotation: finiteOr(entity.rotation, 0),
          ...(typeof entity.label === 'string'
            ? { label: entity.label.slice(0, 64) }
            : {}),
        });
        track(box.x, box.y);
        track(box.x + box.w, box.y + box.h);
        continue;
      }
      warnings.push({
        entityId,
        code: 'entity_unmapped',
        detail: `Entidad "${type}" sin caja finita (x/y/w/h): no se exportó.`,
      });
      continue;
    }
    // Geometría 2D canónica ANTES del camino heredado: `segmentOf` capturaba
    // LINE y POLYLINE y las degradaba a cotas en la capa COTAS (perdiendo
    // además todo vértice intermedio de la polilínea), mientras que ARC y
    // CIRCLE no encajaban en ningún caso y se caían del DXF en silencio.
    const layer = layerOf(entity, entityId, warnings);
    if (type === 'line' || type === 'polyline') {
      const points = polylinePoints(entity);
      if (points.length >= 2) {
        for (let index = 0; index < points.length - 1; index += 1) {
          const from = points[index];
          const to = points[index + 1];
          geometryLines.push({
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
            layer,
          });
          track(from.x, from.y);
          track(to.x, to.y);
        }
        // Una polilínea cerrada emite también el segmento de cierre.
        if (
          type === 'polyline' &&
          entity.closed === true &&
          points.length > 2
        ) {
          const last = points[points.length - 1];
          const first = points[0];
          geometryLines.push({
            x1: last.x,
            y1: last.y,
            x2: first.x,
            y2: first.y,
            layer,
          });
        }
        continue;
      }
    }
    if (type === 'circle' || type === 'arc') {
      const center = pointOf(entity.center);
      const radius = Number(entity.radius);
      if (center && Number.isFinite(radius) && radius > 0) {
        if (type === 'circle') {
          geometryCircles.push({
            cx: center.x,
            cy: center.y,
            r: radius,
            layer,
          });
        } else {
          const startAngle = Number(entity.startAngle);
          const endAngle = Number(entity.endAngle);
          if (Number.isFinite(startAngle) && Number.isFinite(endAngle)) {
            geometryArcs.push({
              cx: center.x,
              cy: center.y,
              r: radius,
              startAngle,
              endAngle,
              layer,
            });
          }
        }
        track(center.x - radius, center.y - radius);
        track(center.x + radius, center.y + radius);
        continue;
      }
    }
    const segment = segmentOf(entity);
    if (segment) {
      annotations.push({
        type: 'dim',
        x: segment.x1,
        y: segment.y1,
        x2: segment.x2,
        y2: segment.y2,
      });
      track(segment.x1, segment.y1);
      track(segment.x2, segment.y2);
      continue;
    }
    if (type === 'text' || type === 'mtext') {
      const raw = textOf(entity);
      const point = raw ? (pointOf(entity.position) ?? pointOf(entity)) : null;
      if (raw && point) {
        if (raw.length > 240)
          warnings.push({
            entityId,
            code: 'text_truncated',
            detail: `Texto recortado de ${raw.length} a 240 caracteres.`,
          });
        annotations.push({
          type: 'text',
          x: point.x,
          y: point.y,
          text: raw.slice(0, 240),
        });
        track(point.x, point.y);
        continue;
      }
      warnings.push({
        entityId,
        code: 'entity_unmapped',
        detail: raw
          ? 'Texto sin posición (x/y) legible: no se exportó.'
          : 'Entidad de texto sin contenido: no se exportó.',
      });
      continue;
    }
    warnings.push({
      entityId,
      code: 'entity_unmapped',
      detail: `Tipo "${type || '(desconocido)'}" no tiene proyección a DXF R12: no se exportó.`,
    });
  }

  const bboxW = Number.isFinite(maxX - minX) ? Math.max(maxX - minX, 0) : 0;
  const bboxH = Number.isFinite(maxY - minY) ? Math.max(maxY - minY, 0) : 0;
  const footprintW = positiveOr(meta?.footprintW, Math.max(bboxW, 1000));
  const footprintH = positiveOr(meta?.footprintH, Math.max(bboxH, 1000));

  const input: CadLayoutDxfInput = {
    model: model || name || 'CAD',
    revision: revision || 'A',
    footprint: {
      footprintW,
      footprintH,
      unit: typeof meta?.unit === 'string' ? meta.unit : 'mm',
    },
    stations: [],
    assets,
    connectors: [],
    annotations,
    ...(geometryLines.length || geometryArcs.length || geometryCircles.length
      ? {
          geometry: {
            lines: geometryLines,
            arcs: geometryArcs,
            circles: geometryCircles,
          },
        }
      : {}),
  };
  return { input, warnings };
}

/**
 * Capa DXF de la entidad. Los nombres de capa R12 no admiten espacios ni
 * caracteres de control, así que se normalizan sin inventar una capa nueva:
 * una entidad sin capa declarada cae en `0`, la capa por defecto del formato.
 * Cuando el nombre saneado no cabe en 31 caracteres, el recorte se declara en
 * `warnings` — antes se aplicaba y no había forma de saber que dos capas
 * distintas podían haber colisionado en el mismo nombre recortado.
 */
function layerOf(
  entity: Record<string, unknown>,
  entityId: string,
  warnings: DxfExportLossWarning[],
): string {
  const raw = typeof entity.layer === 'string' ? entity.layer.trim() : '';
  if (!raw) return '0';
  const sanitized = raw.replace(/[^A-Za-z0-9_$-]+/g, '_');
  if (sanitized.length > 31)
    warnings.push({
      entityId,
      code: 'layer_truncated',
      detail: `Capa "${raw}" recortada a 31 caracteres: "${sanitized.slice(0, 31)}".`,
    });
  const safe = sanitized.slice(0, 31);
  return safe || '0';
}

/** Vértices de una LINE (start/end) o de una POLYLINE (`vertices`/`points`). */
function polylinePoints(
  entity: Record<string, unknown>,
): { x: number; y: number }[] {
  const raw = Array.isArray(entity.vertices)
    ? entity.vertices
    : Array.isArray(entity.points)
      ? entity.points
      : null;
  if (raw) {
    return raw
      .map((vertex) => pointOf(vertex))
      .filter((point): point is { x: number; y: number } => !!point);
  }
  const start = pointOf(entity.start);
  const end = pointOf(entity.end);
  return start && end ? [start, end] : [];
}

function objectOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function boxOf(
  entity: Record<string, unknown>,
): { x: number; y: number; w: number; h: number } | null {
  const x = Number(entity.x);
  const y = Number(entity.y);
  const w = Number(entity.w);
  const h = Number(entity.h);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function pointOf(value: unknown): { x: number; y: number } | null {
  const obj = objectOf(value);
  if (!obj) return null;
  const x = Number(obj.x);
  const y = Number(obj.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function segmentOf(
  entity: Record<string, unknown>,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const type = typeof entity.type === 'string' ? entity.type.toLowerCase() : '';
  if (type !== 'line' && type !== 'polyline' && type !== 'dim') return null;
  const start = pointOf(entity.start) ?? pointOf(entity.a);
  const end = pointOf(entity.end) ?? pointOf(entity.b);
  if (start && end) {
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  }
  const x1 = Number(entity.x1);
  const y1 = Number(entity.y1);
  const x2 = Number(entity.x2);
  const y2 = Number(entity.y2);
  return [x1, y1, x2, y2].every(Number.isFinite) ? { x1, y1, x2, y2 } : null;
}

function textOf(entity: Record<string, unknown>): string | null {
  const text = entity.text ?? entity.content ?? entity.value;
  return typeof text === 'string' && text.trim() ? text : null;
}
