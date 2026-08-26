/**
 * FASE 6 — Los TRES proyectos canónicos de la aceptación comercial.
 *
 * Cada uno es determinista (mismo contenido en cada corrida, para que un
 * fallo se reproduzca) y representa un uso comercial distinto:
 *
 *  1. VIVIENDA: arquitectura NATIVA a mano — muros paramétricos con esquinas
 *     en L y empalmes en T, vanos alojados, ejes, luminarias y rótulos. Es el
 *     proyecto que ejercita el modelo de muro del producto (uniones
 *     derivadas, volumen 3D, cantidades) contra la API real.
 *  2. PLANO REAL: la mezcla `plano-real` del corpus (modelo DECLARADO de un
 *     archivo de despacho mexicano: caras de muro cortas, cadenas de cotas,
 *     bloques de carpintería repetidos, achurados y rótulos) a 8.000
 *     entidades — un nivel tipo de un prototipo repetido.
 *  3. OFICINA: la mezcla `architecture` a 2.000 entidades — la carga hostil
 *     dirigida (expansión de bloques, hatch, atlas) en tamaño de proyecto
 *     chico.
 *
 * Los dos últimos NO se inventan aquí: son los mismos generadores con SHA
 * del banco de pruebas (`corpus-mixes.ts`), así que lo que la aceptación
 * abre en el navegador es exactamente lo que los benchmarks miden en Node.
 */
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { createCadCorpusMix } from "../../src/lib/cad/benchmark/corpus-mixes";

interface AcceptanceWall {
  id: string;
  type: "wall";
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  thickness: number;
  height: number;
  layer: string;
}

function wall(
  id: string,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): AcceptanceWall {
  return {
    id,
    type: "wall",
    start: { x: sx, y: sy, z: 0 },
    end: { x: ex, y: ey, z: 0 },
    thickness: 200,
    height: 2_400,
    layer: "0",
  };
}

/**
 * Vivienda unifamiliar de una planta, 12×9 m: perímetro en L por las cuatro
 * esquinas, una partición vertical en T contra sur y norte, y una partición
 * horizontal en T contra la vertical y el muro este. Puertas y ventana
 * alojadas; ejes, luminarias y rótulos de local con área.
 */
export function viviendaProject(): CadDocument {
  const walls = [
    wall("muro-sur", 0, 0, 12_000, 0),
    wall("muro-este", 12_000, 0, 12_000, 9_000),
    wall("muro-norte", 12_000, 9_000, 0, 9_000),
    wall("muro-oeste", 0, 9_000, 0, 0),
    // Partición vertical: sus DOS extremos caen sobre los ejes de sur y
    // norte (empalme en T por ambos lados).
    wall("particion-v", 7_000, 0, 7_000, 9_000),
    // Partición horizontal: T contra la vertical y contra el muro este.
    wall("particion-h", 7_000, 4_500, 12_000, 4_500),
  ];
  const openings = [
    { id: "puerta-acceso", type: "opening" as const, kind: "door" as const, hostId: "muro-sur", position: 2_200, width: 900, height: 2_100, sill: 0, swing: "left" as const, hinge: "start" as const, layer: "0" },
    { id: "ventana-norte", type: "opening" as const, kind: "window" as const, hostId: "muro-norte", position: 3_000, width: 1_500, height: 1_200, sill: 900, swing: "left" as const, hinge: "start" as const, layer: "0" },
    { id: "puerta-recamara", type: "opening" as const, kind: "door" as const, hostId: "particion-v", position: 2_200, width: 900, height: 2_100, sill: 0, swing: "right" as const, hinge: "end" as const, layer: "0" },
    { id: "puerta-bano", type: "opening" as const, kind: "door" as const, hostId: "particion-h", position: 1_400, width: 800, height: 2_100, sill: 0, swing: "left" as const, hinge: "start" as const, layer: "0" },
  ];
  const ejes = [
    { id: "eje-a", type: "line" as const, start: { x: -600, y: 0, z: 0 }, end: { x: 12_600, y: 0, z: 0 }, layer: "ARQ-EJES" },
    { id: "eje-1", type: "line" as const, start: { x: 0, y: -600, z: 0 }, end: { x: 0, y: 9_600, z: 0 }, layer: "ARQ-EJES" },
  ];
  const luminarias = Array.from({ length: 6 }, (_, index) => ({
    id: `lum-${index}`,
    type: "circle" as const,
    center: { x: 2_000 + (index % 3) * 3_400, y: 2_400 + Math.floor(index / 3) * 4_200, z: 0 },
    radius: 120,
    layer: "ARQ-ILUM",
  }));
  const rotulos = [
    { id: "rot-estancia", insertion: { x: 2_600, y: 4_600 }, text: "ESTANCIA\n30.9 m²" },
    { id: "rot-cocina", insertion: { x: 2_600, y: 1_600 }, text: "COCINA\n12.4 m²" },
    { id: "rot-recamara", insertion: { x: 8_600, y: 6_600 }, text: "RECÁMARA\n19.8 m²" },
    { id: "rot-bano", insertion: { x: 8_600, y: 1_800 }, text: "BAÑO\n8.6 m²" },
  ].map((rotulo) => ({
    id: rotulo.id,
    type: "mtext" as const,
    insertion: rotulo.insertion,
    text: rotulo.text,
    width: 2_200,
    height: 125,
    rotation: 0,
    alignment: "top-left" as const,
    layer: "ARQ-ROTUL",
  }));
  const entities = [...walls, ...openings, ...ejes, ...luminarias, ...rotulos];
  return {
    meta: {
      version: 1,
      schema: CAD_DOCUMENT_SCHEMA,
      unit: "mm",
      footprintW: 14_000,
      footprintH: 11_000,
      gridSize: 100,
    },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "ARQ-EJES", name: "Ejes", color: "#94a3b8", visible: true, locked: false },
      { id: "ARQ-ILUM", name: "Iluminación", color: "#fbbf24", visible: true, locked: false },
      { id: "ARQ-ROTUL", name: "Rotulación", color: "#a5b4fc", visible: true, locked: false },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as CadDocument;
}

export const VIVIENDA_WALL_IDS = [
  "muro-sur",
  "muro-este",
  "muro-norte",
  "muro-oeste",
  "particion-v",
  "particion-h",
] as const;

/** Nivel tipo de despacho: mezcla plano-real, 8.000 entidades, SHA estable. */
export const PLANO_REAL_ENTITY_COUNT = 8_000;
export function planoRealProject(): CadDocument {
  return createCadCorpusMix({ mix: "plano-real", entities: PLANO_REAL_ENTITY_COUNT }).document;
}

/** Oficina chica: mezcla architecture, 2.000 entidades, SHA estable. */
export const OFICINA_ENTITY_COUNT = 2_000;
export function oficinaProject(): CadDocument {
  return createCadCorpusMix({ mix: "architecture", entities: OFICINA_ENTITY_COUNT }).document;
}
