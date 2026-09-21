/**
 * RULESURF, TABSURF, REVSURF y EDGESURF — superficies con geometría REAL.
 *
 * La auditoría del 19-sep midió que las cuatro fingían (ver la cabecera de
 * `ruled-surfaces.ts`). La regla de aceptación de esta ola es dura a
 * propósito: «salió un sólido» o «área > 0» son EXACTAMENTE las pruebas que
 * dejaron pasar el relleno. Cada bloque de aquí en adelante EJECUTA la orden
 * real por el motor de comandos y mide POSICIONES DE VÉRTICES CONCRETOS o
 * VOLÚMENES contra una fórmula analítica independiente — nunca sólo que algo
 * se escribió.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity, type CadPoint3 } from "../../cad-document";
import { solid3dBody, solid3dMassProperties } from "../../solid3d-build";

import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput } from "../command-types";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import "@/lib/cad/engine/all-commands";

let checks = 0;
const ok = (cond: boolean, msg: string) => { assert.ok(cond, msg); checks += 1; };
/** Tolerancia relativa: para comparar con una fórmula ANALÍTICA (Pappus), no con el propio kernel. */
const nearRel = (actual: number, expected: number, relTol: number, msg: string) => {
  const tol = Math.abs(expected) * relTol;
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} != ${expected} (±${(relTol * 100).toFixed(1)}%, diff ${(Math.abs(actual - expected) / Math.abs(expected) * 100).toFixed(3)}%)`);
  checks += 1;
};

const layer = "0";

function doc(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: layer, name: "0", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((e) => e.id) },
  });
}

function makeContext(d: CadDocument, sel: readonly string[] = []): CadCommandContext {
  let id = 0;
  return {
    entityIds: d.entities.map((e) => e.id),
    entity: (eid) => d.entities.find((e) => e.id === eid),
    selection: sel,
    activeLayer: layer,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId() { return `rs${++id}`; },
  };
}

const ENTER: CadCommandInput = { kind: "enter" };
const pick = (id: string): CadCommandInput => ({ kind: "entityPick", entityId: id, point: { x: 0, y: 0 } });
const angle = (degrees: number): CadCommandInput => ({ kind: "angle", degrees });

function runCommand(name: string, d: CadDocument, inputs: readonly CadCommandInput[], sel: readonly string[] = []) {
  const cmd = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(cmd, `${name} debe existir en el registro`);
  const ctx = makeContext(d, sel);
  let step = cmd.begin(ctx);
  for (const input of inputs) {
    if (step.result) break;
    step = cmd.step(step.state, input, ctx);
  }
  return step.result;
}

/** ¿Hay un vértice del sólido a menos de `tol` de `p`? La prueba de «vértice concreto». */
function hasVertexNear(solid: CadSolid3dEntity, p: CadPoint3, tol: number): boolean {
  const body = solid3dBody(solid);
  return body.vertices.some((v) => Math.hypot(v.point.x - p.x, v.point.y - p.y, v.point.z - p.z) <= tol);
}

function insertedSolid(result: ReturnType<typeof runCommand>): CadSolid3dEntity {
  assert.ok(result?.kind === "document", `la orden produce documento (llegó ${result?.kind})`);
  if (result.kind !== "document") throw new Error("unreachable");
  const cmd = result.commands.find((c) => c.type === "insert");
  assert.ok(cmd?.type === "insert", "hay un comando insert");
  if (cmd?.type !== "insert") throw new Error("unreachable");
  return cmd.entity as CadSolid3dEntity;
}

// =================================================================================
// RULESURF — banda reglada NO plana entre dos curvas 3D reales
// =================================================================================
{
  // Dos «tejados» a distinta cota: si la Z se tirase (el bug auditado), las
  // dos curvas se aplastarían al mismo plano y la banda saldría una lámina
  // recta en vez de una superficie alabeada de verdad.
  const curve1: CadEntity = {
    id: "c1", type: "polyline", closed: false,
    vertices: [{ x: 0, y: 0, z: 0 }, { x: 500, y: 0, z: 50 }, { x: 1000, y: 0, z: 0 }],
    layer,
  };
  const curve2: CadEntity = {
    id: "c2", type: "polyline", closed: false,
    vertices: [{ x: 0, y: 500, z: 100 }, { x: 500, y: 500, z: 150 }, { x: 1000, y: 500, z: 100 }],
    layer,
  };
  const d = doc([curve1, curve2]);
  const result = runCommand("RULESURF", d, [pick("c1"), pick("c2"), ENTER]);
  const solid = insertedSolid(result);

  for (const p of curve1.type === "polyline" ? curve1.vertices : []) {
    ok(hasVertexNear(solid, p, 1e-6), `RULESURF conserva el vértice de la curva 1 en (${p.x},${p.y},${p.z})`);
  }
  for (const p of curve2.type === "polyline" ? curve2.vertices : []) {
    ok(hasVertexNear(solid, p, 1e-6), `RULESURF conserva el vértice de la curva 2 en (${p.x},${p.y},${p.z})`);
  }
  // La prueba directa del bug: las dos cotas intermedias (50 y 150) tienen
  // que aparecer TAL CUAL entre los vértices del sólido.
  const body = solid3dBody(solid);
  const zs = body.vertices.map((v) => v.point.z);
  ok(zs.some((z) => Math.abs(z - 50) < 1e-6), "RULESURF conserva la cota 50 de la curva 1 (no la aplana a 0)");
  ok(zs.some((z) => Math.abs(z - 150) < 1e-6), "RULESURF conserva la cota 150 de la curva 2 (no la aplana a 0)");
  const props = solid3dMassProperties(solid);
  ok(props.volume > 0, `RULESURF: volumen positivo (${props.volume.toExponential(3)})`);
}

// --- RULESURF cancelado / con una sola curva -----------------------------------
{
  const line1: CadEntity = { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer };
  const d = doc([line1]);
  ok(runCommand("RULESURF", d, [pick("l1"), { kind: "cancel" }])?.kind === "message", "RULESURF cancel produce mensaje");
  ok(runCommand("RULESURF", d, [pick("l1"), ENTER])?.kind === "message", "RULESURF con una sola curva produce mensaje");
}

// =================================================================================
// TABSURF — perfil trasladado por un vector director 3D real
// =================================================================================
{
  const profile: CadEntity = { id: "p1", type: "line", start: { x: 0, y: 0, z: 10 }, end: { x: 0, y: 200, z: 60 }, layer };
  const path: CadEntity = { id: "t1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 800, y: 0, z: 300 }, layer };
  const d = doc([profile, path]);
  const result = runCommand("TABSURF", d, [pick("p1"), pick("t1"), ENTER]);
  const solid = insertedSolid(result);

  // El vector director es (800, 0, 300): SI la Z se tirase, la traslación
  // sería (800, 0) y ningún vértice del extremo trasladado caería en z=310/360.
  ok(hasVertexNear(solid, { x: 0, y: 0, z: 10 }, 1e-6), "TABSURF conserva el inicio del perfil");
  ok(hasVertexNear(solid, { x: 0, y: 200, z: 60 }, 1e-6), "TABSURF conserva el final del perfil");
  ok(hasVertexNear(solid, { x: 800, y: 0, z: 310 }, 1e-6), "TABSURF traslada el inicio por el vector 3D completo (con Z)");
  ok(hasVertexNear(solid, { x: 800, y: 200, z: 360 }, 1e-6), "TABSURF traslada el final por el vector 3D completo (con Z)");
}

// --- TABSURF: trayectoria de longitud cero se niega ------------------------------
{
  const profile: CadEntity = { id: "p1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 10, z: 0 }, layer };
  const path: CadEntity = { id: "t1", type: "line", start: { x: 5, y: 5, z: 5 }, end: { x: 5, y: 5, z: 5 }, layer };
  const d = doc([profile, path]);
  const result = runCommand("TABSURF", d, [pick("p1"), pick("t1"), ENTER]);
  ok(result?.kind === "message", "TABSURF con trayectoria de longitud cero se niega");
}

// =================================================================================
// REVSURF — revolución alrededor de un EJE 3D, con ángulo inicial y barrido
// =================================================================================
//
// Perfil rectangular (radio 150→200, altura 20→80) girado alrededor del eje Z
// que pasa por el origen. Revolucionado 360° da un TORO de sección cuadrada;
// tocando el eje (radio 0) da un CILINDRO. Los dos se comparan con la fórmula
// de Pappus (V = 2π·R_centroide·Área), que es la fórmula de un libro de texto,
// no algo que reutilice el propio kernel.
{
  const axis: CadEntity = { id: "ax", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 10 }, layer };
  const profile: CadEntity = {
    id: "pr", type: "polyline", closed: true,
    vertices: [
      { x: 150, y: 0, z: 20 }, { x: 200, y: 0, z: 20 },
      { x: 200, y: 0, z: 80 }, { x: 150, y: 0, z: 80 },
    ],
    layer,
  };
  const d = doc([axis, profile]);

  const area = (200 - 150) * (80 - 20);
  const centroidRadius = (150 + 200) / 2;
  const fullVolumeAnalytic = 2 * Math.PI * centroidRadius * area;

  // --- 360°: toro -----------------------------------------------------------
  {
    const result = runCommand("REVSURF", d, [pick("pr"), pick("ax"), angle(0), angle(360)]);
    const solid = insertedSolid(result);
    const props = solid3dMassProperties(solid);
    nearRel(props.volume, fullVolumeAnalytic, 0.02, "REVSURF 360°: volumen ~ toro analítico (Pappus)");
  }

  // --- 90°: un cuarto del toro -----------------------------------------------
  {
    const result = runCommand("REVSURF", d, [pick("pr"), pick("ax"), angle(0), angle(90)]);
    const solid = insertedSolid(result);
    const props = solid3dMassProperties(solid);
    nearRel(props.volume, fullVolumeAnalytic / 4, 0.02, "REVSURF 90°: volumen ~ un cuarto del toro analítico");
  }

  // --- Ángulo inicial 90° + barrido 90°: posiciones de vértice concretas ------
  // El perfil arranca desplazado 90° y barre otros 90°: el sólido va de 90° a
  // 180°. Rotar a mano el vértice (200,0,20) esos ángulos da las posiciones
  // EXACTAS que tienen que aparecer entre los vértices del sólido.
  {
    const result = runCommand("REVSURF", d, [pick("pr"), pick("ax"), angle(90), angle(90)]);
    const solid = insertedSolid(result);
    ok(hasVertexNear(solid, { x: 0, y: 200, z: 20 }, 1e-6), "REVSURF (inicio 90°): (200,0,20) rotado 90° cae en (0,200,20)");
    ok(hasVertexNear(solid, { x: -200, y: 0, z: 20 }, 1e-6), "REVSURF (inicio 90°+barrido 90°): (200,0,20) rotado 180° cae en (-200,0,20)");
    ok(!hasVertexNear(solid, { x: 200, y: 0, z: 20 }, 1e-6), "REVSURF (inicio 90°): el perfil YA NO está en su posición original (0°)");
  }

  // --- Cilindro: un lado del perfil TOCA el eje (radio 0) ---------------------
  {
    const cylProfile: CadEntity = {
      id: "prc", type: "polyline", closed: true,
      vertices: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 0, z: 200 }, { x: 0, y: 0, z: 200 }],
      layer,
    };
    const dc = doc([axis, cylProfile]);
    const result = runCommand("REVSURF", dc, [pick("prc"), pick("ax"), angle(0), angle(360)]);
    const solid = insertedSolid(result);
    const props = solid3dMassProperties(solid);
    const cylinderVolume = Math.PI * 100 * 100 * 200;
    nearRel(props.volume, cylinderVolume, 0.02, "REVSURF (perfil tocando el eje): volumen ~ cilindro analítico (πr²h)");
  }

  // --- Se niega: el perfil cruza el eje ---------------------------------------
  {
    const crossing: CadEntity = {
      id: "prx", type: "polyline", closed: true,
      vertices: [{ x: -50, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 0, z: 100 }, { x: -50, y: 0, z: 100 }],
      layer,
    };
    const dx = doc([axis, crossing]);
    const result = runCommand("REVSURF", dx, [pick("prx"), pick("ax"), angle(0), angle(360)]);
    ok(result?.kind === "message", "REVSURF: perfil que cruza el eje se niega");
    if (result?.kind === "message") ok(result.text.includes("cruza"), `REVSURF dice que el perfil cruza el eje: ${result.text}`);
  }

  // --- Se niega: el perfil no es plano respecto al eje -------------------------
  {
    const warped: CadEntity = {
      id: "prw", type: "polyline", closed: true,
      vertices: [
        { x: 150, y: 0, z: 20 }, { x: 200, y: 0, z: 20 },
        { x: 200, y: 80, z: 80 }, // fuera del plano eje-radio (y != 0)
        { x: 150, y: 0, z: 80 },
      ],
      layer,
    };
    const dw = doc([axis, warped]);
    const result = runCommand("REVSURF", dw, [pick("prw"), pick("ax"), angle(0), angle(360)]);
    ok(result?.kind === "message", "REVSURF: perfil no plano respecto al eje se niega");
    if (result?.kind === "message") ok(result.text.includes("no es plano"), `REVSURF dice que el perfil no es plano: ${result.text}`);
  }
}

// --- REVSURF cancelado -------------------------------------------------------
{
  const profile: CadEntity = { id: "pr1", type: "line", start: { x: 100, y: 0, z: 0 }, end: { x: 100, y: 0, z: 50 }, layer };
  const d = doc([profile]);
  const result = runCommand("REVSURF", d, [pick("pr1"), { kind: "cancel" }]);
  ok(result?.kind === "message", "REVSURF cancel produce mensaje");
}

// =================================================================================
// EDGESURF — parche de Coons bilineal entre cuatro bordes
// =================================================================================

// --- Rectángulo plano: el centro del parche cae EXACTAMENTE en el centro -------
{
  const e1: CadEntity = { id: "e1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1000, y: 0, z: 0 }, layer };
  const e2: CadEntity = { id: "e2", type: "line", start: { x: 1000, y: 0, z: 0 }, end: { x: 1000, y: 500, z: 0 }, layer };
  const e3: CadEntity = { id: "e3", type: "line", start: { x: 1000, y: 500, z: 0 }, end: { x: 0, y: 500, z: 0 }, layer };
  const e4: CadEntity = { id: "e4", type: "line", start: { x: 0, y: 500, z: 0 }, end: { x: 0, y: 0, z: 0 }, layer };
  const d = doc([e1, e2, e3, e4]);
  const result = runCommand("EDGESURF", d, [pick("e1"), pick("e2"), pick("e3"), pick("e4"), ENTER]);
  const solid = insertedSolid(result);
  ok(hasVertexNear(solid, { x: 500, y: 250, z: 0 }, 1e-6), "EDGESURF (rectángulo): el centro del parche de Coons es el centro exacto");
  ok(hasVertexNear(solid, { x: 0, y: 0, z: 0 }, 1e-6), "EDGESURF conserva la esquina (0,0,0)");
  ok(hasVertexNear(solid, { x: 1000, y: 500, z: 0 }, 1e-6), "EDGESURF conserva la esquina (1000,500,0)");
}

// --- Rampa: los CUATRO bordes participan, no sólo dos ---------------------------
//
// El fondo está a Z=0, la tapa a Z=100 y los dos lados suben LINEALMENTE entre
// medias. Un Coons de verdad da una rampa bilineal exacta: el centro tiene que
// caer en Z=50 — si EDGESURF sólo reglara entre dos bordes (el bug auditado),
// el resultado no dependería de los otros dos en absoluto y esta cifra no
// tendría por qué salir.
{
  const bottom: CadEntity = { id: "b", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1000, y: 0, z: 0 }, layer };
  const right: CadEntity = { id: "r", type: "line", start: { x: 1000, y: 0, z: 0 }, end: { x: 1000, y: 500, z: 100 }, layer };
  const top: CadEntity = { id: "t", type: "line", start: { x: 1000, y: 500, z: 100 }, end: { x: 0, y: 500, z: 100 }, layer };
  const left: CadEntity = { id: "le", type: "line", start: { x: 0, y: 500, z: 100 }, end: { x: 0, y: 0, z: 0 }, layer };
  const d = doc([bottom, right, top, left]);
  // Los bordes se designan en un orden CUALQUIERA: EDGESURF los ordena solo.
  const result = runCommand("EDGESURF", d, [pick("t"), pick("le"), pick("b"), pick("r"), ENTER]);
  const solid = insertedSolid(result);
  ok(hasVertexNear(solid, { x: 500, y: 250, z: 50 }, 1e-6), "EDGESURF (rampa): el centro cae en Z=50 — los cuatro bordes participan");
  ok(hasVertexNear(solid, { x: 500, y: 0, z: 0 }, 1e-6), "EDGESURF (rampa): el medio del borde inferior está en Z=0");
  ok(hasVertexNear(solid, { x: 500, y: 500, z: 100 }, 1e-6), "EDGESURF (rampa): el medio del borde superior está en Z=100");
}

// --- EDGESURF: menos de cuatro curvas ---------------------------------------
{
  const e1: CadEntity = { id: "e1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer };
  const d = doc([e1]);
  const result = runCommand("EDGESURF", d, [pick("e1"), ENTER]);
  ok(result?.kind === "message", "EDGESURF con menos de 4 curvas produce mensaje");
}

// --- EDGESURF: cuatro curvas que NO forman un lazo cerrado se niegan -----------
{
  const e1: CadEntity = { id: "e1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer };
  const e2: CadEntity = { id: "e2", type: "line", start: { x: 200, y: 0, z: 0 }, end: { x: 200, y: 100, z: 0 }, layer };
  const e3: CadEntity = { id: "e3", type: "line", start: { x: 400, y: 0, z: 0 }, end: { x: 400, y: 100, z: 0 }, layer };
  const e4: CadEntity = { id: "e4", type: "line", start: { x: 600, y: 0, z: 0 }, end: { x: 600, y: 100, z: 0 }, layer };
  const d = doc([e1, e2, e3, e4]);
  const result = runCommand("EDGESURF", d, [pick("e1"), pick("e2"), pick("e3"), pick("e4"), ENTER]);
  ok(result?.kind === "message", "EDGESURF con cuatro curvas sueltas (sin lazo) se niega");
  if (result?.kind === "message") ok(result.text.includes("empalma") || result.text.includes("lazo"), `EDGESURF dice que no forman un lazo: ${result.text}`);
}

console.log(`ruled-surfaces: ${checks} comprobaciones OK`);
