/**
 * Máquina de comandos del CAD (Fase 66/67 — núcleo de precisión / dibujo).
 *
 * Orquesta los comandos multi-paso estilo AutoCAD (line, polyline, rect, circle,
 * move, copy, offset) como un reducer PURO: el editor (Codex) alimenta puntos
 * (clicks o coordenadas tecleadas ya resueltas con `parseCoordinate`) y la
 * máquina devuelve el siguiente prompt + las *acciones de dibujo* a aplicar.
 *
 * No toca Three.js ni React: emite geometría declarativa que el editor traduce
 * a la escena y persiste por el endpoint compartido `/layout`.
 *
 * Correr tests:  npx tsx src/components/line-engineering/cad-command.spec.ts
 */
import { Point, distance } from './precision-input';

export type CommandId = 'line' | 'polyline' | 'rect' | 'circle' | 'move' | 'copy' | 'offset';

/** Geometría declarativa que el editor agrega a la escena al recibirla. */
export type DrawAction =
  | { type: 'addSegment'; a: Point; b: Point }
  | { type: 'addPolyline'; points: Point[]; closed: boolean }
  | { type: 'addRect'; x: number; y: number; w: number; h: number }
  | { type: 'addCircle'; cx: number; cy: number; r: number }
  | { type: 'moveBy'; dx: number; dy: number }
  | { type: 'copyBy'; dx: number; dy: number }
  | { type: 'offsetBy'; distance: number };

export interface CommandState {
  id: CommandId;
  /** Puntos fijados hasta ahora (origen del rubber-band = último). */
  points: Point[];
  /** Texto a mostrar en la barra de comandos para el siguiente input. */
  prompt: string;
  /** El comando terminó (el editor debe limpiarlo). */
  done: boolean;
  /** Acciones producidas por la ÚLTIMA operación — el editor las aplica y descarta. */
  emitted: DrawAction[];
  /** Para 'circle': true cuando espera el radio (número) o un punto del perímetro. */
  awaitingRadius?: boolean;
}

const PROMPTS: Record<CommandId, string> = {
  line: 'Punto inicial',
  polyline: 'Punto inicial',
  rect: 'Primera esquina',
  circle: 'Centro',
  move: 'Punto base',
  copy: 'Punto base',
  offset: 'Distancia de desfase',
};

/** Inicia un comando vacío. */
export function startCommand(id: CommandId): CommandState {
  return { id, points: [], prompt: PROMPTS[id], done: false, emitted: [], awaitingRadius: false };
}

function bbox(a: Point, b: Point) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/**
 * Alimenta un punto fijado (click o coordenada tecleada ya resuelta). Devuelve
 * el nuevo estado con el prompt siguiente y, si corresponde, geometría emitida.
 */
export function feedPoint(state: CommandState, p: Point): CommandState {
  const pts = [...state.points, p];
  const base = { ...state, points: pts, emitted: [] as DrawAction[] };

  switch (state.id) {
    case 'line': {
      if (pts.length < 2) return { ...base, prompt: 'Siguiente punto' };
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      // LINE encadena: emite el tramo y deja el último punto como nuevo origen.
      return { ...base, points: [b], emitted: [{ type: 'addSegment', a, b }], prompt: 'Siguiente punto (Enter para terminar)' };
    }
    case 'polyline': {
      // Acumula; emite la polilínea completa en commit().
      return { ...base, prompt: pts.length < 2 ? 'Siguiente punto' : 'Siguiente punto (Enter para terminar)' };
    }
    case 'rect': {
      if (pts.length < 2) return { ...base, prompt: 'Esquina opuesta' };
      const r = bbox(pts[0], pts[1]);
      return { ...base, done: true, emitted: [{ type: 'addRect', ...r }] };
    }
    case 'circle': {
      if (pts.length < 2) return { ...base, prompt: 'Radio o punto del perímetro', awaitingRadius: true };
      const r = distance(pts[0], pts[1]);
      return { ...base, done: true, awaitingRadius: false, emitted: [{ type: 'addCircle', cx: pts[0].x, cy: pts[0].y, r }] };
    }
    case 'move':
    case 'copy': {
      if (pts.length < 2) return { ...base, prompt: 'Punto destino' };
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const action: DrawAction = state.id === 'move' ? { type: 'moveBy', dx, dy } : { type: 'copyBy', dx, dy };
      return { ...base, done: true, emitted: [action] };
    }
    case 'offset':
      // offset se completa por distancia, no por punto; ignora el punto.
      return base;
    default:
      return base;
  }
}

/** Para 'circle' (radio tecleado) y 'offset' (distancia): completa por número. */
export function feedDistance(state: CommandState, d: number): CommandState {
  if (state.id === 'circle' && state.points.length === 1) {
    return { ...state, done: true, awaitingRadius: false, emitted: [{ type: 'addCircle', cx: state.points[0].x, cy: state.points[0].y, r: Math.abs(d) }] };
  }
  if (state.id === 'offset') {
    return { ...state, done: true, emitted: [{ type: 'offsetBy', distance: d }] };
  }
  return { ...state, emitted: [] };
}

/** Enter: cierra los comandos encadenados (line/polyline). */
export function commit(state: CommandState): CommandState {
  if (state.id === 'polyline' && state.points.length >= 2) {
    return { ...state, done: true, emitted: [{ type: 'addPolyline', points: state.points, closed: false }] };
  }
  // line ya emitió cada tramo; solo cierra.
  return { ...state, done: true, emitted: [] };
}

/** Esc: cancela sin emitir nada. */
export function cancel(state: CommandState): CommandState {
  return { ...state, done: true, emitted: [], points: [] };
}

/**
 * Geometría transitoria de rubber-band para previsualizar bajo el cursor (no se
 * persiste). El editor la dibuja en una capa efímera mientras el comando está abierto.
 */
export function previewGeometry(state: CommandState, cursor: Point): DrawAction | null {
  const last = state.points[state.points.length - 1];
  if (!last) return null;
  switch (state.id) {
    case 'line':
    case 'polyline':
      return { type: 'addSegment', a: last, b: cursor };
    case 'rect':
      return { type: 'addRect', ...bbox(last, cursor) };
    case 'circle':
      return { type: 'addCircle', cx: last.x, cy: last.y, r: distance(last, cursor) };
    case 'move':
    case 'copy':
      return { type: 'addSegment', a: last, b: cursor };
    default:
      return null;
  }
}
