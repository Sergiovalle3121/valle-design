/**
 * Cubre `buildCadAssetArchetype()` para los arquetipos arquitectónicos nuevos
 * (escalera, baranda, sofá, cama, sanitarios) — sin WebGL: sólo el grafo de
 * mallas que la fábrica devuelve, igual que asset-instancing.spec.ts.
 *
 * La aserción que importa: cada arquetipo nuevo produce geometría real dentro
 * de su envolvente declarada (wS × dS × H) con la base en y=0, que es el
 * contrato que buildCadAssetArchetype documenta para TODOS los arquetipos —
 * un arquetipo que dibuja fuera de su caja o flotando sobre el piso no
 * "aparece correctamente" en el visor 3D aunque no lance ninguna excepción.
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildCadAssetArchetype } from "./asset-archetypes";
import type { AssetArchetype } from "./asset-catalog";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/** Envolvente real (mundo) de las partes que devuelve un arquetipo. */
function boundsOf(parts: THREE.Object3D[]): THREE.Box3 {
  const group = new THREE.Group();
  for (const part of parts) group.add(part);
  group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
}

const EPS = 1e-6;

// ---- Los 6 arquetipos nuevos: geometría dentro de su caja, base en y=0 ----
{
  const fixtures: {
    archetype: AssetArchetype;
    wS: number;
    dS: number;
    H: number;
  }[] = [
    { archetype: "stairs", wS: 1.1, dS: 3.6, H: 3.0 },
    { archetype: "railing", wS: 2.0, dS: 0.1, H: 1.0 },
    { archetype: "sofa", wS: 1.9, dS: 0.9, H: 0.85 },
    { archetype: "bed", wS: 1.5, dS: 2.0, H: 1.1 },
    { archetype: "toilet", wS: 0.4, dS: 0.65, H: 0.8 },
    { archetype: "sink", wS: 0.55, dS: 0.45, H: 0.85 },
  ];
  for (const { archetype, wS, dS, H } of fixtures) {
    const parts = buildCadAssetArchetype(
      archetype,
      wS,
      dS,
      H,
      "#8899aa",
      "rect",
    );
    ok(parts.length > 0, `${archetype} debe devolver al menos una parte`);
    ok(
      parts.every((p) => p instanceof THREE.Mesh),
      `${archetype} sólo usa mallas Box/Cylinder — nada de líneas sueltas`,
    );
    const box = boundsOf(parts);
    ok(
      box.min.y >= -EPS,
      `${archetype} no debe dibujar bajo el piso (min.y=${box.min.y})`,
    );
    ok(
      box.max.y >= H * 0.95 && box.max.y <= H * 1.3,
      `${archetype} debe alcanzar cerca de su altura declarada (max.y=${box.max.y}, H=${H})`,
    );
    // 10% de holgura: un poste/pedestal cilíndrico centrado justo en el borde
    // (mismo patrón que los postes de "fence") asoma su radio más allá de la
    // huella nominal — igual que ya hace el arquetipo industrial existente.
    const xSlack = wS * 0.1;
    const zSlack = dS * 0.1;
    ok(
      box.min.x >= -wS / 2 - xSlack && box.max.x <= wS / 2 + xSlack,
      `${archetype} no debe salirse de su ancho declarado en X (${box.min.x}..${box.max.x} vs ±${wS / 2})`,
    );
    ok(
      box.min.z >= -dS / 2 - zSlack && box.max.z <= dS / 2 + zSlack,
      `${archetype} no debe salirse de su fondo declarado en Z (${box.min.z}..${box.max.z} vs ±${dS / 2})`,
    );
  }
}

// ---- stairs: un peldaño por escalón, ascendiendo en fila ----
{
  const H = 3.0; // 3.0 / 0.19 = 15.79 -> redondea a 16 peldaños (dentro del tope de 16)
  const parts = buildCadAssetArchetype(
    "stairs",
    1.1,
    3.6,
    H,
    "#a1a1aa",
    "rect",
  );
  ok(
    parts.length === 16,
    `stairs de H=${H} deben tener 16 peldaños, no ${parts.length}`,
  );
  const heights = parts.map((p) => {
    const geo = (p as THREE.Mesh).geometry as THREE.BoxGeometry;
    return geo.parameters.height;
  });
  for (let i = 1; i < heights.length; i++) {
    ok(
      heights[i] > heights[i - 1],
      `el peldaño ${i} debe ser más alto que el ${i - 1} (escalera ascendente)`,
    );
  }
  ok(
    Math.abs(heights[heights.length - 1] - H) < 1e-9,
    `el último peldaño debe tocar la altura total H=${H}, no ${heights[heights.length - 1]}`,
  );
}

// ---- railing: postes + pasamanos + balaustres, escalando con el ancho ----
{
  // wS=2.0 -> round(2.0/1.2)+1=3 postes; round(2.0/0.14)+1=15 balaustres; +1 pasamanos = 19
  const parts = buildCadAssetArchetype(
    "railing",
    2.0,
    0.1,
    1.0,
    "#52525b",
    "rect",
  );
  ok(
    parts.length === 19,
    `railing de ancho 2.0 debe sumar 3 postes + 1 pasamanos + 15 balaustres = 19, no ${parts.length}`,
  );
}

// ---- sofa: asiento + respaldo + 2 brazos + 4 patas ----
{
  const parts = buildCadAssetArchetype(
    "sofa",
    1.9,
    0.9,
    0.85,
    "#0d9488",
    "rect",
  );
  ok(
    parts.length === 8,
    `sofa debe tener 8 partes (asiento+respaldo+2 brazos+4 patas), no ${parts.length}`,
  );
}

// ---- bed: base + colchón + cabecera + almohada ----
{
  const parts = buildCadAssetArchetype("bed", 1.5, 2.0, 1.1, "#a16207", "rect");
  ok(
    parts.length === 4,
    `bed debe tener 4 partes (base+colchón+cabecera+almohada), no ${parts.length}`,
  );
}

// ---- toilet: tanque + taza + asiento ----
{
  const parts = buildCadAssetArchetype(
    "toilet",
    0.4,
    0.65,
    0.8,
    "#e2e8f0",
    "rect",
  );
  ok(
    parts.length === 3,
    `toilet debe tener 3 partes (tanque+taza+asiento), no ${parts.length}`,
  );
}

// ---- sink: cubeta + pedestal + llave ----
{
  const parts = buildCadAssetArchetype(
    "sink",
    0.55,
    0.45,
    0.85,
    "#f8fafc",
    "rect",
  );
  ok(
    parts.length === 3,
    `sink debe tener 3 partes (cubeta+pedestal+llave), no ${parts.length}`,
  );
}

// ---- El set industrial existente no se movió: mismo conteo de siempre ----
{
  ok(
    buildCadAssetArchetype("table", 1.2, 0.8, 0.9, "#3b82f6", "rect").length ===
      5,
    "table sigue en 5 partes (tablero + 4 patas) tras agregar los arquetipos nuevos",
  );
  ok(
    buildCadAssetArchetype("cabinet", 0.8, 0.6, 2.0, "#0f766e", "rect")
      .length === 3,
    "cabinet sigue en 3 partes (cuerpo + costura + jaladera) tras agregar los arquetipos nuevos",
  );
}

console.log(`asset-archetypes.spec: ${checks} aserciones ok`);
