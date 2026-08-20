/**
 * La vista del invitado tiene que ser EL MISMO plano que el autor tiene
 * delante. Este spec fija las tres cosas que la harían mentir sin que nadie lo
 * notara: dibujar una capa apagada, callar un plano recortado por el tope, o
 * inventarse geometría propia en vez de usar el registro de entidades.
 */
import assert from "node:assert/strict";
import type { CadDocument } from "../cad-document";
import {
  cadPlanStrokePath,
  cadPlanViewBox,
  projectCadPlan,
} from "./plan-projection";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function document(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "REPLANTEO", name: "REPLANTEO", color: "#ff00ff", visible: false, locked: false },
    ],
    entities: [
      {
        id: "muro",
        type: "line",
        start: { x: 0, y: 0, z: 0 },
        end: { x: 4_000, y: 0, z: 0 },
        layer: "0",
      },
      {
        id: "pilar",
        type: "circle",
        center: { x: 2_000, y: 1_500, z: 0 },
        radius: 150,
        layer: "0",
      },
      {
        id: "eje",
        type: "line",
        start: { x: 0, y: -9_000, z: 0 },
        end: { x: 4_000, y: -9_000, z: 0 },
        layer: "REPLANTEO",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro", "pilar", "eje"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

const projection = projectCadPlan(document());

// ── Sale geometría de verdad ────────────────────────────────────────────────
ok(projection.strokes.length >= 2, "el muro y el pilar se proyectan");
ok(projection.points > 2, "y con puntos: un plano sin puntos es un plano en blanco");
ok(
  projection.strokes.some((stroke) => stroke.entityId === "pilar" && stroke.points.length > 8),
  "el círculo llega TESELADO por el registro, no como un punto",
);
ok(
  projection.strokes.every((stroke) => stroke.entityId !== "eje"),
  "la capa apagada por el autor NO se le enseña al cliente",
);
ok(
  !!projection.bounds && projection.bounds.minY > -9_000,
  "el encuadre tampoco cuenta con la capa apagada",
);
ok(
  projection.strokes.find((stroke) => stroke.entityId === "muro")?.color === "#ffffff",
  "cada trazo lleva el color de SU capa",
);

// El orden de dibujo del documento se respeta: es el que decide qué tapa a qué.
ok(
  projection.strokes[0].entityId === "muro",
  "se proyecta en el orden de modelSpace, no en el de `entities`",
);

// ── El tope se DECLARA ──────────────────────────────────────────────────────
const clipped = projectCadPlan(document(), 4);
ok(clipped.truncated, "al llegar al tope, la proyección lo dice");
ok(
  clipped.points <= 4,
  "y para de verdad: seguir dibujando pasado el tope haría inútil el aviso",
);
ok(!projection.truncated, "un plano que cabe no se marca como recortado");

// ── Lo que no se sabe dibujar se CUENTA ─────────────────────────────────────
const alien = document();
alien.entities.push({
  id: "marciano",
  // Tipo inexistente a propósito: simula un documento de una versión futura.
  type: "marciano",
  layer: "0",
} as unknown as CadDocument["entities"][number]);
alien.modelSpace.entityIds.push("marciano");
const withAlien = projectCadPlan(alien);
ok(withAlien.unsupported === 1, "una entidad sin adaptador se cuenta, no se ignora");
ok(
  withAlien.strokes.length === projection.strokes.length,
  "y no ensucia el resto del plano",
);

// Un id en el orden de dibujo que no existe en `entities` no revienta nada.
const dangling = document();
dangling.modelSpace.entityIds.push("fantasma");
ok(projectCadPlan(dangling).strokes.length === projection.strokes.length, "id colgante ignorado");

// ── SVG ─────────────────────────────────────────────────────────────────────
const line = projection.strokes.find((stroke) => stroke.entityId === "muro")!;
const path = cadPlanStrokePath(line);
ok(path.startsWith("M ") && path.includes("L "), "el trazo se emite como path SVG");
ok(!path.endsWith("Z"), "una línea abierta no se cierra");
ok(
  cadPlanStrokePath({ ...line, closed: true }).endsWith("Z"),
  "una cerrada sí",
);

const box = cadPlanViewBox(projection.bounds);
ok(box.width > 4_000 && box.height > 0, "el viewBox encuadra el dibujo con margen");
const degenerate = cadPlanViewBox({ minX: 5, minY: 5, maxX: 5, maxY: 5 });
ok(
  degenerate.width > 0 && degenerate.height > 0,
  "un dibujo degenerado da un viewBox dibujable, no uno de anchura cero",
);
const nothing = cadPlanViewBox(null);
ok(nothing.width > 0 && nothing.height > 0, "sin dibujo, el visor sigue teniendo lienzo");

console.log(`ok collab plan-projection: ${checks} comprobaciones`);
