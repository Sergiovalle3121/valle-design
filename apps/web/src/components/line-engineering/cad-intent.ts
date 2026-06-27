/**
 * NL→CAD: esquema de herramientas y normalizador de intents (Fase 69 — CAD inteligente).
 *
 * Define las "tools" en formato function-calling **compatible-OpenAI** que el
 * modelo (CIDE/Ollama por `CIDE_BASE_URL`, o cualquier endpoint OpenAI-compatible)
 * usa para traducir lenguaje natural —"pon 3 bancos en fila junto a EST-10"— en
 * llamadas estructuradas, y un normalizador PURO que valida/sanitiza esas llamadas
 * y las convierte en `CadIntent` tipados que el editor aplica.
 *
 * Módulo puro: ni red ni React. El backend lo usa para declarar las tools al
 * modelo; el editor (Codex) lo usa para aplicar los intents validados. Mantener
 * la validación aquí evita que una alucinación del modelo mueva geometría real.
 *
 * Correr tests:  npx tsx src/components/line-engineering/cad-intent.spec.ts
 */
import { DrawAction } from './cad-command';

/** Tool en formato function-calling compatible-OpenAI. */
export interface CadTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

const numProp = (description: string) => ({ type: 'number', description });
const strProp = (description: string) => ({ type: 'string', description });

/** El conjunto de herramientas CAD expuestas al modelo. */
export const CAD_TOOLS: CadTool[] = [
  {
    type: 'function',
    function: {
      name: 'setFootprint',
      description: 'Cambia el tamaño de la huella (footprint) del layout, en la unidad actual.',
      parameters: {
        type: 'object',
        properties: { footprintW: numProp('ancho'), footprintH: numProp('largo'), gridSize: numProp('paso de grilla (opcional)') },
        required: ['footprintW', 'footprintH'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'placeAsset',
      description: 'Coloca un equipo/asset (workbench, conveyor, rack, robot, aoi, oven, printer, cart, person, cabinet…).',
      parameters: {
        type: 'object',
        properties: {
          kind: strProp('tipo de asset'),
          x: numProp('x'), y: numProp('y'),
          w: numProp('ancho (opcional)'), h: numProp('alto (opcional)'),
          rotation: numProp('rotación en grados (opcional)'),
          label: strProp('etiqueta (opcional)'),
        },
        required: ['kind', 'x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'drawWall',
      description: 'Traza un muro entre dos puntos.',
      parameters: {
        type: 'object',
        properties: { x1: numProp('x inicio'), y1: numProp('y inicio'), x2: numProp('x fin'), y2: numProp('y fin') },
        required: ['x1', 'y1', 'x2', 'y2'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addDimension',
      description: 'Agrega una cota (línea de dimensión) entre dos puntos.',
      parameters: {
        type: 'object',
        properties: { x1: numProp('x inicio'), y1: numProp('y inicio'), x2: numProp('x fin'), y2: numProp('y fin') },
        required: ['x1', 'y1', 'x2', 'y2'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'arrangeLine',
      description: 'Acomoda automáticamente las estaciones colocadas en filas por secuencia.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'connectLine',
      description: 'Conecta las estaciones en secuencia con flechas de flujo. kind: flow|conveyor|return.',
      parameters: { type: 'object', properties: { kind: strProp('flow|conveyor|return (opcional)') } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'moveStation',
      description: 'Mueve una estación (por su nombre, ej. EST-10) a una posición absoluta x,y.',
      parameters: {
        type: 'object',
        properties: { station: strProp('nombre de la estación'), x: numProp('x'), y: numProp('y') },
        required: ['station', 'x', 'y'],
      },
    },
  },
];

/** Tipos de asset válidos (espejo del asset-catalog del editor). */
export const ASSET_KINDS = [
  'workbench', 'conveyor', 'rack', 'robot', 'aoi', 'oven', 'printer', 'cnc', 'gantry',
  'cabinet', 'pallet', 'desk', 'bin', 'cart', 'fence', 'column', 'wall', 'zone', 'path',
  'agv', 'person', 'label',
] as const;

const FLOW_KINDS = ['flow', 'conveyor', 'return'] as const;

export type CadIntent =
  | { kind: 'setFootprint'; footprintW: number; footprintH: number; gridSize?: number }
  | { kind: 'placeAsset'; asset: { kind: string; x: number; y: number; w: number; h: number; rotation: number; label?: string } }
  | { kind: 'draw'; action: DrawAction } // drawWall / addDimension → acciones declarativas
  | { kind: 'arrangeLine' }
  | { kind: 'connectLine'; flow: 'flow' | 'conveyor' | 'return' }
  | { kind: 'moveStation'; station: string; x: number; y: number };

export type NormalizeResult = { ok: true; intent: CadIntent } | { ok: false; error: string };

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const clampPos = (v: unknown, fallback: number) => { const n = num(v); return n !== null && n > 0 ? n : fallback; };

/**
 * Valida y normaliza una tool-call del modelo a un `CadIntent`. `rawArgs` puede
 * venir como objeto o como string JSON (lo común en function-calling). Rechaza
 * argumentos faltantes o inválidos en vez de aplicar geometría dudosa.
 */
export function normalizeToolCall(name: string, rawArgs: unknown): NormalizeResult {
  let args: Record<string, unknown>;
  try {
    args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : ((rawArgs as Record<string, unknown>) ?? {});
  } catch {
    return { ok: false, error: 'Argumentos no son JSON válido' };
  }

  switch (name) {
    case 'setFootprint': {
      const w = num(args.footprintW);
      const h = num(args.footprintH);
      if (w === null || h === null || w <= 0 || h <= 0) return { ok: false, error: 'footprint inválido' };
      const g = num(args.gridSize);
      return { ok: true, intent: { kind: 'setFootprint', footprintW: w, footprintH: h, ...(g && g > 0 ? { gridSize: g } : {}) } };
    }
    case 'placeAsset': {
      const x = num(args.x);
      const y = num(args.y);
      const kind = String(args.kind ?? '').trim().toLowerCase();
      if (x === null || y === null) return { ok: false, error: 'placeAsset requiere x,y numéricos' };
      if (!ASSET_KINDS.includes(kind as (typeof ASSET_KINDS)[number])) return { ok: false, error: `kind desconocido: ${kind || '(vacío)'}` };
      return {
        ok: true,
        intent: {
          kind: 'placeAsset',
          asset: {
            kind, x, y,
            w: clampPos(args.w, 1000),
            h: clampPos(args.h, 800),
            rotation: num(args.rotation) ?? 0,
            ...(args.label ? { label: String(args.label).slice(0, 64) } : {}),
          },
        },
      };
    }
    case 'drawWall':
    case 'addDimension': {
      const x1 = num(args.x1); const y1 = num(args.y1); const x2 = num(args.x2); const y2 = num(args.y2);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return { ok: false, error: `${name} requiere x1,y1,x2,y2` };
      return { ok: true, intent: { kind: 'draw', action: { type: 'addSegment', a: { x: x1, y: y1 }, b: { x: x2, y: y2 } } } };
    }
    case 'arrangeLine':
      return { ok: true, intent: { kind: 'arrangeLine' } };
    case 'connectLine': {
      const f = String(args.kind ?? 'flow').trim().toLowerCase();
      const flow = (FLOW_KINDS as readonly string[]).includes(f) ? (f as 'flow' | 'conveyor' | 'return') : 'flow';
      return { ok: true, intent: { kind: 'connectLine', flow } };
    }
    case 'moveStation': {
      const station = String(args.station ?? '').trim();
      const x = num(args.x);
      const y = num(args.y);
      if (!station) return { ok: false, error: 'moveStation requiere el nombre de la estación' };
      if (x === null || y === null) return { ok: false, error: 'moveStation requiere x,y numéricos' };
      return { ok: true, intent: { kind: 'moveStation', station: station.slice(0, 64), x, y } };
    }
    default:
      return { ok: false, error: `Herramienta desconocida: ${name}` };
  }
}

/** Normaliza una tanda de tool-calls, descartando (con motivo) las inválidas. */
export function normalizeToolCalls(calls: { name: string; arguments: unknown }[]): {
  intents: CadIntent[];
  errors: string[];
} {
  const intents: CadIntent[] = [];
  const errors: string[] = [];
  for (const c of calls) {
    const r = normalizeToolCall(c.name, c.arguments);
    if (r.ok) intents.push(r.intent);
    else errors.push(`${c.name}: ${r.error}`);
  }
  return { intents, errors };
}
