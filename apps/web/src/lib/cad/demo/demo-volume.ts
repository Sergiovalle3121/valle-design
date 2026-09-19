/**
 * Casa habitación en volumen — muros y vanos para la demostración.
 *
 * Recibe el `CadDocument` de `buildCadTemplateDocument('casa-habitacion')` y
 * devuelve otro con los mismos muebles y rótulos, pero reemplazando el
 * cascarón de polilíneas por 9 muros (`type: "wall"`) y 5 vanos
 * (`type: "opening"`). Así el panel derecho muestra «Muro 1 · MURO» en vez
 * de «Polilínea 1, Texto 1» y el visor 3D puede orbitar un edificio con
 * espesor real de muro.
 *
 * Determinista: dos llamadas con el mismo documento producen el mismo JSON.
 */
import type { CadDocument, CadEntity } from "../cad-document";
import { defaultWallHeight, defaultWallThickness } from "../engine/commands/draw-wall";
import type { CadWallMaterialId } from "../wall-materials";

/** Entidades que la plantilla genera y que este módulo conserva. */
const PRESERVED_IDS = new Set([
  "tpl-cama",
  "tpl-sofa",
  "tpl-mesa",
  "tpl-estufa",
  "tpl-lb-sala",
  "tpl-lb-comedor",
  "tpl-lb-cocina",
  "tpl-lb-recamara-1",
  "tpl-lb-recamara-2",
  "tpl-lb-bano",
  "tpl-nt-titulo",
]);

/**
 * Devuelve un documento con muros y vanos en lugar del cascarón de la
 * plantilla. Los muebles, rótulos y el cajetín quedan intactos.
 */
export function buildDemoVolumeDocument(templateDoc: CadDocument): CadDocument {
  const unit = templateDoc.meta.unit;
  const thickness = defaultWallThickness(unit);
  const height = defaultWallHeight(unit);
  const layer = "MURO";
  const openingLayer = "VANO";

  // ── Muros (perímetro en lazo cerrado + 4 particiones) ──────────────────
  const wallDefs: Array<{ a: [number, number]; b: [number, number]; material?: CadWallMaterialId }> = [
    // Perímetro (brick)
    { a: [700, 700], b: [11300, 700], material: "brick" },       // sur
    { a: [11300, 700], b: [11300, 7300], material: "brick" },    // este
    { a: [11300, 7300], b: [700, 7300], material: "brick" },     // norte
    { a: [700, 7300], b: [700, 700], material: "brick" },        // oeste
    // Particiones (drywall)
    { a: [700, 4400], b: [11300, 4400], material: "drywall" },   // horizontal
    { a: [5000, 700], b: [5000, 4400], material: "drywall" },    // vertical 1
    { a: [8200, 700], b: [8200, 4400], material: "drywall" },    // vertical 2
    { a: [4800, 4400], b: [4800, 7300], material: "drywall" },   // vertical 3
    { a: [7800, 4400], b: [7800, 7300], material: "drywall" },   // vertical 4
  ];

  const walls: CadEntity[] = wallDefs.map((def, i) => ({
    id: `dv-wall-${i + 1}`,
    type: "wall" as const,
    start: { x: def.a[0], y: def.a[1], z: 0 },
    end: { x: def.b[0], y: def.b[1], z: 0 },
    thickness,
    height,
    material: def.material,
    layer,
  }));

  // ── Vanos ──────────────────────────────────────────────────────────────
  //
  // hostId referencia el id del muro anfitrión.  `position` es la distancia
  // sobre el eje del muro (de start a end) hasta el CENTRO del vano.
  const openingDefs: Array<{
    id: string;
    kind: "door" | "window";
    hostIdx: number;
    position: number;
    width: number;
    height: number;
    sill: number;
    swing: "left" | "right";
    hinge: "start" | "end";
  }> = [
    // Puerta principal en muro sur (idx 0): centro en x=2950 → position desde start (700,700)
    { id: "dv-open-1", kind: "door", hostIdx: 0, position: 2250, width: 900, height: 2100, sill: 0, swing: "left", hinge: "start" },
    // Ventana este (idx 1): muro va de (11300,700) a (11300,7300), largo 6600
    { id: "dv-open-2", kind: "window", hostIdx: 1, position: 2100, width: 1200, height: 1200, sill: 900, swing: "left", hinge: "start" },
    // Ventana norte (idx 2): muro va de (11300,7300) a (700,7300), largo 10600
    { id: "dv-open-3", kind: "window", hostIdx: 2, position: 3000, width: 1500, height: 1200, sill: 900, swing: "left", hinge: "start" },
    // Ventana oeste (idx 3): muro va de (700,7300) a (700,700), largo 6600
    { id: "dv-open-4", kind: "window", hostIdx: 3, position: 2800, width: 1200, height: 1200, sill: 900, swing: "left", hinge: "start" },
    // Puerta recámara en partición horizontal (idx 4): muro va de (700,4400) a (11300,4400)
    { id: "dv-open-5", kind: "door", hostIdx: 4, position: 4300, width: 900, height: 2100, sill: 0, swing: "left", hinge: "start" },
  ];

  const openings: CadEntity[] = openingDefs.map((def) => ({
    id: def.id,
    type: "opening" as const,
    kind: def.kind,
    hostId: walls[def.hostIdx].id,
    position: def.position,
    width: def.width,
    height: def.height,
    sill: def.sill,
    swing: def.swing,
    hinge: def.hinge,
    layer: openingLayer,
  }));

  // ── Entidades conservadas ──────────────────────────────────────────────
  const preserved = templateDoc.entities.filter((e) => PRESERVED_IDS.has(e.id));

  // ── Ensamble: muros, vanos, conservadas ────────────────────────────────
  const entities: CadEntity[] = [...walls, ...openings, ...preserved];

  return {
    ...templateDoc,
    entities,
    modelSpace: { entityIds: entities.map((e) => e.id) },
    history: [{ version: 1, label: "Demostración: casa habitación en volumen" }],
  };
}
