import type { CadLayoutDxfInput } from '../cad-documents/cad-documents.service';
import type { PersistedCadDocument } from '../cad-documents/cad-document-validation';

/**
 * Proyección PURA del documento CAD canónico hacia la entrada del serializador
 * DXF R12 (`CadDocumentsService.buildLayoutDxf`, capas nombradas).
 *
 * El serializador del origen está modelado sobre el layout industrial
 * (estaciones/equipo/flujo); el documento canónico de Design es una lista de
 * entidades libres. Mapeo determinista v1:
 * - entidad con caja finita (x,y,w,h)          → EQUIPO (asset `kind`/label)
 * - entidad `line`/`polyline` con start/end    → FLUJO (segmento)
 * - entidad `dim` con dos puntos               → COTAS
 * - entidad `text`/`mtext` con posición+texto  → TEXTO
 * La huella (footprint) sale de `meta` cuando existe; si no, del bounding box
 * de lo mapeado (mínimo 1000×1000 para que el plano nunca colapse a 0).
 */
export function buildDxfExportInput(
  document: PersistedCadDocument | null,
  name: string,
  model: string | null,
  revision: string | null,
): CadLayoutDxfInput {
  const meta = objectOf(document?.meta);
  const entities: Record<string, unknown>[] = Array.isArray(document?.entities)
    ? (document.entities as unknown[]).filter(
        (e): e is Record<string, unknown> =>
          !!e && typeof e === 'object' && !Array.isArray(e),
      )
    : [];

  const assets: CadLayoutDxfInput['assets'] = [];
  const annotations: CadLayoutDxfInput['annotations'] = [];
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

  for (const entity of entities) {
    const type = String(entity.type ?? '').toLowerCase();
    const box = boxOf(entity);
    if (box) {
      assets.push({
        kind: String(entity.kind ?? (type || 'box')).slice(0, 24),
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
    if ((type === 'text' || type === 'mtext') && textOf(entity)) {
      const point = pointOf(entity.position) ?? pointOf(entity);
      if (point) {
        annotations.push({
          type: 'text',
          x: point.x,
          y: point.y,
          text: textOf(entity)!.slice(0, 240),
        });
        track(point.x, point.y);
      }
    }
  }

  const bboxW = Number.isFinite(maxX - minX) ? Math.max(maxX - minX, 0) : 0;
  const bboxH = Number.isFinite(maxY - minY) ? Math.max(maxY - minY, 0) : 0;
  const footprintW = positiveOr(meta?.footprintW, Math.max(bboxW, 1000));
  const footprintH = positiveOr(meta?.footprintH, Math.max(bboxH, 1000));

  return {
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
  };
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
  const type = String(entity.type ?? '').toLowerCase();
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
