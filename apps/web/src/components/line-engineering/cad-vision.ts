/**
 * Vision→CAD: normalizador de planos vectorizados (Fase 71 — visión).
 *
 * Cuando el usuario sube una foto/PDF de un plano, un modelo multimodal
 * (CIDE/OpenAI-compatible) devuelve la geometría detectada como JSON con
 * coordenadas NORMALIZADAS (0..1, origen arriba-izquierda de la imagen). Este
 * módulo PURO valida ese JSON y lo mapea al footprint real del layout → muros
 * (segmentos) y zonas (polígonos) listos para insertar y editar.
 *
 * Mantener la validación aquí evita que una alucinación del modelo inyecte
 * geometría basura. El backend solo manda la imagen y devuelve el JSON crudo.
 *
 * Correr tests:  npx tsx src/components/line-engineering/cad-vision.spec.ts
 */
import { Point } from './precision-input';
import { Segment } from './snap-engine';

/** System prompt para el modelo de visión: define el JSON de salida esperado. */
export const VISION_SYSTEM_PROMPT = [
  'Eres un asistente que vectoriza planos de planta. Analiza la imagen del plano y',
  'devuelve EXCLUSIVAMENTE un JSON con esta forma, sin texto extra:',
  '{ "walls": [{"x1":0,"y1":0,"x2":1,"y2":0}], "zones": [{"name":"opcional","points":[{"x":0,"y":0}]}], "unitHint":"m" }',
  'Todas las coordenadas NORMALIZADAS en [0,1] respecto al ancho/alto de la imagen,',
  'origen (0,0) en la esquina superior izquierda. Incluye solo muros y zonas claros.',
].join(' ');

export interface VisionZone {
  name?: string;
  points: Point[];
}

export interface VisionResult {
  walls: Segment[];
  zones: VisionZone[];
  unitHint?: 'mm' | 'm';
  errors: string[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/**
 * Valida y mapea el JSON de visión (coords normalizadas 0..1) al footprint real.
 * La Y se invierte: el plano tiene origen arriba, el footprint abajo-izquierda.
 */
export function normalizeVision(
  raw: unknown,
  footprint: { footprintW: number; footprintH: number },
): VisionResult {
  const errors: string[] = [];
  let data: Record<string, unknown>;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw || '{}') : ((raw as Record<string, unknown>) ?? {});
  } catch {
    return { walls: [], zones: [], errors: ['JSON de visión inválido'] };
  }

  const W = footprint.footprintW > 0 ? footprint.footprintW : 1;
  const H = footprint.footprintH > 0 ? footprint.footprintH : 1;
  const mapPt = (nx: number, ny: number): Point => ({ x: clamp01(nx) * W, y: (1 - clamp01(ny)) * H });

  const walls: Segment[] = [];
  const rawWalls = Array.isArray(data.walls) ? data.walls : [];
  rawWalls.forEach((w, i) => {
    const o = w as Record<string, unknown>;
    const x1 = num(o.x1); const y1 = num(o.y1); const x2 = num(o.x2); const y2 = num(o.y2);
    if (x1 === null || y1 === null || x2 === null || y2 === null) { errors.push(`muro ${i}: coords inválidas`); return; }
    const a = mapPt(x1, y1); const b = mapPt(x2, y2);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) { errors.push(`muro ${i}: longitud cero`); return; }
    walls.push({ a, b });
  });

  const zones: VisionZone[] = [];
  const rawZones = Array.isArray(data.zones) ? data.zones : [];
  rawZones.forEach((z, i) => {
    const o = z as Record<string, unknown>;
    const pts = Array.isArray(o.points) ? o.points : [];
    const points: Point[] = [];
    for (const p of pts) {
      const po = p as Record<string, unknown>;
      const px = num(po.x); const py = num(po.y);
      if (px !== null && py !== null) points.push(mapPt(px, py));
    }
    if (points.length < 3) { errors.push(`zona ${i}: necesita ≥3 puntos`); return; }
    zones.push({ ...(typeof o.name === 'string' ? { name: o.name.slice(0, 48) } : {}), points });
  });

  const unitHint = data.unitHint === 'mm' || data.unitHint === 'm' ? data.unitHint : undefined;
  return { walls, zones, ...(unitHint ? { unitHint } : {}), errors };
}
