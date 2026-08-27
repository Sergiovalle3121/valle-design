/**
 * "Lo que no se ve no puede ser un imán" — aplicado a los DOS anfitriones 3D
 * de sólidos que hasta hoy (2026-08-27, campaña Paridad, OLA 0.4/1.2) no
 * filtraban por capa en absoluto: `CadSolidShadeHost` (sombreado 3D) y
 * `CadSolidSnapHost` (enganche 3D, enchufado dentro del anterior). Un
 * `solid3d` en capa apagada o congelada se seguía renderizando en 3D Y seguía
 * imantando el cursor — la violación literal de la doctrina escrita en
 * `cad-layer-visibility.ts:61-62`.
 *
 * NO reimplementa la cobertura que ya existe en otros consumidores:
 * `cad-layer-frozen.spec.ts` ya prueba selección/enganche 2D,
 * `view/document-extents.ts` y `paper-space.ts`; `wall-solid-host.spec.ts` y
 * `room-solid-host.spec.ts` ya prueban muros y masas arquitectónicas (que SÍ
 * filtraban correctamente — la hipótesis original de que esos dos eran el
 * defecto era incorrecta, confirmado leyendo su código real). Este archivo
 * cierra el hueco que quedaba: los dos hosts 3D de sólidos, más una
 * exhaustividad barata para que un host nuevo sin filtro no pase en silencio.
 */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CadDocument, CadEntity, CadLayerDef } from "@/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "@/lib/cad/cad-document";
import type { CadSolid3dEntity } from "@/lib/cad/cad-entities-v5";
import { CadViewController } from "@/lib/cad/view/view-controller";
import { CadSolidShadeHost } from "./solid-shade-host";

let checks = 0;
function check(label: string, condition: boolean): void {
  checks += 1;
  assert.ok(condition, label);
}

const LAYERS: CadLayerDef[] = [
  { id: "VIVA", name: "VIVA", color: "#94a3b8", visible: true, locked: false },
  { id: "APAGADA", name: "APAGADA", color: "#94a3b8", visible: false, locked: false },
  {
    id: "CONGELADA",
    name: "CONGELADA",
    color: "#94a3b8",
    visible: true,
    locked: false,
    frozen: true,
  },
];

/** Prisma 400..600 × 350..450, 0..50 de alto — mismo perfil que solid-snap-host.spec.ts. */
function solidOnLayer(id: string, layer: string): CadSolid3dEntity {
  return {
    id,
    type: "solid3d",
    root: `${id}-caja`,
    nodes: [
      {
        id: `${id}-caja`,
        op: "box",
        min: { x: 400, y: 350, z: 0 },
        max: { x: 600, y: 450, z: 50 },
      },
    ],
    layer,
  };
}

function documentWith(entities: readonly CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: LAYERS,
    entities: [...entities],
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

function controllerLookingAtSolid(): CadViewController {
  const controller = new CadViewController({ scale: 0.01, width: 1_000, height: 800 }, 1_200, 900);
  controller.setMode("3d");
  controller.perspective.position.set(0, 0, 12);
  controller.applyStandardView("se-iso");
  return controller;
}

const viewport = { scale: 0.01, width: 1_000, height: 800, elevation: 0.11 };
const none: ReadonlySet<string> = new Set();

// ---------------------------------------------------------------------------
// 1. CadSolidShadeHost: una capa apagada o congelada no se renderiza en 3D.
// ---------------------------------------------------------------------------
{
  const doc = documentWith([solidOnLayer("s-viva", "VIVA")]);
  const host = new CadSolidShadeHost(() => viewport);
  host.sync(doc, none);
  check("VIVA se renderiza sola", host.count === 1);
}
{
  const doc = documentWith([solidOnLayer("s-apagada", "APAGADA")]);
  const host = new CadSolidShadeHost(() => viewport);
  host.sync(doc, none);
  check("APAGADA no se renderiza (antes del arreglo: count === 1)", host.count === 0);
}
{
  const doc = documentWith([solidOnLayer("s-congelada", "CONGELADA")]);
  const host = new CadSolidShadeHost(() => viewport);
  host.sync(doc, none);
  check("CONGELADA no se renderiza (antes del arreglo: count === 1)", host.count === 0);
}
{
  // Las tres capas a la vez: sólo la viva cuenta, y togglear APAGADA a
  // visible en un segundo sync() la hace aparecer sin reconstruir las otras.
  const doc = documentWith([
    solidOnLayer("s-viva", "VIVA"),
    solidOnLayer("s-apagada", "APAGADA"),
    solidOnLayer("s-congelada", "CONGELADA"),
  ]);
  const host = new CadSolidShadeHost(() => viewport);
  host.sync(doc, none);
  check("mezcla de capas: sólo la viva construye malla", host.count === 1);

  const revived: CadDocument = {
    ...doc,
    layers: doc.layers.map((layer) => (layer.id === "APAGADA" ? { ...layer, visible: true } : layer)),
  };
  host.sync(revived, none);
  check(
    "encender la capa reconstruye sin tocar el resto (reconciliación por firma, no por caché estancada)",
    host.count === 2,
  );
}

// ---------------------------------------------------------------------------
// 2. CadSolidSnapHost (enchufado vía CadSolidShadeHost.snapIndexedEdges): una
//    capa apagada o congelada no imanta el cursor en 3D.
// ---------------------------------------------------------------------------
{
  const doc = documentWith([solidOnLayer("s-viva", "VIVA")]);
  const controller = controllerLookingAtSolid();
  const host = new CadSolidShadeHost(() => viewport, () => controller);
  host.sync(doc, none);
  check("VIVA se indexa para enganche (aristas > 0)", host.snapIndexedEdges > 0);
}
{
  const doc = documentWith([solidOnLayer("s-apagada", "APAGADA")]);
  const controller = controllerLookingAtSolid();
  const host = new CadSolidShadeHost(() => viewport, () => controller);
  host.sync(doc, none);
  check(
    "APAGADA no imanta — cero aristas indexadas (antes del arreglo: > 0, el imán literal que la doctrina prohíbe)",
    host.snapIndexedEdges === 0,
  );
}
{
  const doc = documentWith([solidOnLayer("s-congelada", "CONGELADA")]);
  const controller = controllerLookingAtSolid();
  const host = new CadSolidShadeHost(() => viewport, () => controller);
  host.sync(doc, none);
  check(
    "CONGELADA no imanta — cero aristas indexadas (antes del arreglo: > 0)",
    host.snapIndexedEdges === 0,
  );
}

// ---------------------------------------------------------------------------
// 3. Exhaustividad barata: todo `*-host.ts` de viewport/ que consuma
//    `document.entities` directamente debe estar cubierto por ALGÚN spec de
//    capas — el de aquí, o uno de los ya existentes (declarado por nombre,
//    con la razón, igual que el patrón EXEMPT de check-import-direction.mjs).
//    Un host nuevo que nadie liste aquí hace fallar la comprobación.
// ---------------------------------------------------------------------------
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const hostFiles = readdirSync(here)
    .filter((name) => name.endsWith("-host.ts") && !name.endsWith(".spec.ts"))
    .sort();

  // Por qué cada uno está cubierto, y DÓNDE — deuda escrita, no silencio.
  const coverage: Record<string, string> = {
    "grip-menu-host.ts":
      "DOM imperativo puro (menú del grip caliente); no lee document.entities, no aplica la doctrina de capas.",
    "render-pipeline-host.ts":
      "pipeline por lotes 2D/3D; filtra via setHiddenLayers(cadHiddenLayerIds(...)) — ver render/scene.ts.",
    "room-solid-host.ts":
      "CadArchitecturalMassHost — filtra por CONGELADA (cadFrozenLayerIds); APAGADA cuenta a propósito (documentado, room-solid-host.ts:67-71) y probado en room-solid-host.spec.ts:290-306.",
    "solid-shade-host.ts":
      "CadSolidShadeHost — filtrado agregado en esta campaña (OLA 1.2); probado arriba en este mismo archivo.",
    "solid-snap-host.ts":
      "CadSolidSnapHost — filtrado agregado en esta campaña (OLA 1.2); probado arriba (vía CadSolidShadeHost.snapIndexedEdges, que lo enchufa).",
    "wall-solid-host.ts":
      "CadWallSolidHost — filtra por cadHiddenLayerIds; probado en wall-solid-host.spec.ts:279-341,410-428.",
  };

  for (const file of hostFiles) {
    check(`${file}: cubierto y con razón escrita (o es un host nuevo sin registrar)`, file in coverage);
  }
  check(
    "la lista de cobertura no acumula entradas huérfanas de archivos que ya no existen",
    Object.keys(coverage).every((file) => hostFiles.includes(file)),
  );
}

console.log(`layer-visibility-gate: ${checks} comprobaciones verdes`);
