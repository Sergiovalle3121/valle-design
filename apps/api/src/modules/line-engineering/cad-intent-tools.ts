/**
 * NL→CAD backend (Fase 69) — especificación de herramientas y system prompt.
 *
 * Mitad servidor del puente lenguaje-natural→CAD. Declara al modelo
 * (OpenAI-compatible, vía CIDE/`CIDE_BASE_URL`) las operaciones CAD disponibles
 * como `CideToolSpec` y arma el system prompt con el contexto del layout (huella
 * + estaciones) para que pueda ubicar geometría relativa a "EST-10", etc.
 *
 * Las tool-calls que el modelo devuelva se validan en el FRONTEND con
 * `normalizeToolCalls` (cad-intent.ts) — única fuente de la lógica de validación.
 * Aquí solo se declara el contrato y se construye el prompt. Puro y testeable.
 */
import { CideToolSpec } from '../ai/cide-provider';

const numProp = (description: string) => ({ type: 'number', description });
const strProp = (description: string) => ({ type: 'string', description });

/** Herramientas CAD ofrecidas al modelo (espeja CAD_TOOLS del frontend). */
export const CAD_INTENT_TOOLS: CideToolSpec[] = [
  {
    name: 'setFootprint',
    description: 'Cambia el tamaño de la huella (footprint) del layout, en la unidad actual.',
    parameters: {
      type: 'object',
      properties: { footprintW: numProp('ancho'), footprintH: numProp('largo'), gridSize: numProp('paso de grilla (opcional)') },
      required: ['footprintW', 'footprintH'],
    },
  },
  {
    name: 'placeAsset',
    description:
      'Coloca un equipo. kind ∈ workbench|conveyor|rack|robot|aoi|oven|printer|cnc|gantry|cabinet|pallet|desk|bin|cart|fence|column|wall|zone|path|agv|person|label.',
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
  {
    name: 'drawWall',
    description: 'Traza un muro entre dos puntos.',
    parameters: {
      type: 'object',
      properties: { x1: numProp('x inicio'), y1: numProp('y inicio'), x2: numProp('x fin'), y2: numProp('y fin') },
      required: ['x1', 'y1', 'x2', 'y2'],
    },
  },
  {
    name: 'addDimension',
    description: 'Agrega una cota (línea de dimensión) entre dos puntos.',
    parameters: {
      type: 'object',
      properties: { x1: numProp('x inicio'), y1: numProp('y inicio'), x2: numProp('x fin'), y2: numProp('y fin') },
      required: ['x1', 'y1', 'x2', 'y2'],
    },
  },
  {
    name: 'arrangeLine',
    description: 'Acomoda automáticamente las estaciones colocadas en filas por secuencia.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'connectLine',
    description: 'Conecta las estaciones en secuencia con flechas de flujo. kind: flow|conveyor|return.',
    parameters: { type: 'object', properties: { kind: strProp('flow|conveyor|return (opcional)') } },
  },
];

export interface CadIntentContext {
  unit: string;
  footprintW: number;
  footprintH: number;
  stations: { station: string; x: number; y: number }[];
}

/** Construye el system prompt con el contexto del layout. */
export function buildCadIntentSystemPrompt(ctx: CadIntentContext): string {
  const lines = [
    'Eres un asistente CAD para el diseño de layouts de líneas de manufactura electrónica (EMS).',
    'Traduces la instrucción del usuario en operaciones CAD llamando EXCLUSIVAMENTE a las herramientas provistas.',
    'No respondas en prosa: emite una o más tool-calls. Si la instrucción no mapea a ninguna herramienta, no llames ninguna.',
    `Las coordenadas están en "${ctx.unit}" dentro de una huella de ${Math.round(ctx.footprintW)} (ancho) × ${Math.round(ctx.footprintH)} (largo). El origen (0,0) es la esquina inferior izquierda.`,
    'Mantén toda la geometría dentro de la huella.',
  ];
  if (ctx.stations.length > 0) {
    const list = ctx.stations
      .slice(0, 40)
      .map((s) => `${s.station} @(${Math.round(s.x)},${Math.round(s.y)})`)
      .join(', ');
    lines.push(`Estaciones colocadas (para ubicar geometría relativa): ${list}.`);
  }
  return lines.join('\n');
}
