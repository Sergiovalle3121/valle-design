/**
 * Arquetipos de mobiliario/elementos arquitectónicos (escalera, baranda,
 * sofá, cama, sanitarios) para `buildCadAssetArchetype()`.
 *
 * Viven aquí y no en `asset-archetypes.ts` por la misma razón por la que
 * `cadTexturedAssetMaterial()` vive en `architectural-material-library.ts`:
 * ese archivo ya rozaba el presupuesto de `check:monolith-budget.mjs` y estos
 * seis arquetipos (sumados en la misma campaña que agregó soporte de
 * material/textura) lo empujaron por encima del tope de 800 líneas. Cada
 * función es exactamente el cuerpo de `case` que antes vivía en el switch de
 * `buildCadAssetArchetype()`, sin más cambio que recibir como parámetros los
 * `THREE.Color` derivados (`c`/`dark`/`light`) y `leg` que ese switch ya
 * calculaba antes del switch — mismo comportamiento, mismos valores.
 *
 * Mismo contrato que `asset-archetypes.ts`: geometría centrada en X/Z con la
 * base en y=0; quien llama coloca y gira. Sin dependencias de React ni del
 * documento canónico.
 */
import * as THREE from "three";
import { cadAssetMaterial, cadAssetPart } from "./asset-archetypes";

export function buildStairsArchetype(
  wS: number,
  dS: number,
  H: number,
  c: THREE.Color,
  light: THREE.Color,
): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const steps = Math.max(3, Math.min(16, Math.round(H / 0.19)));
  const rise = H / steps;
  const run = dS / steps;
  for (let i = 0; i < steps; i++) {
    const stepH = rise * (i + 1);
    out.push(
      cadAssetPart(
        new THREE.BoxGeometry(wS, stepH, run * 0.96),
        cadAssetMaterial(i % 2 === 0 ? c : light, 0.6, 0.15),
        0,
        stepH / 2,
        -dS / 2 + run * (i + 0.5),
      ),
    );
  }
  return out;
}

export function buildRailingArchetype(
  wS: number,
  dS: number,
  H: number,
  c: THREE.Color,
  dark: THREE.Color,
  light: THREE.Color,
): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const postR = Math.max(0.02, dS * 0.25);
  const posts = Math.max(2, Math.round(wS / 1.2) + 1);
  for (let i = 0; i < posts; i++) {
    const x = -wS / 2 + (wS / (posts - 1 || 1)) * i;
    out.push(
      cadAssetPart(
        new THREE.CylinderGeometry(postR, postR, H, 10),
        cadAssetMaterial(dark, 0.45, 0.5),
        x,
        H / 2,
        0,
      ),
    );
  }
  const rail = cadAssetPart(
    new THREE.CylinderGeometry(postR * 0.8, postR * 0.8, wS, 10),
    cadAssetMaterial(c, 0.4, 0.45),
    0,
    H * 0.96,
    0,
  );
  rail.rotation.z = Math.PI / 2;
  out.push(rail);
  const balusters = Math.max(3, Math.round(wS / 0.14) + 1);
  for (let i = 0; i < balusters; i++) {
    const x = -wS / 2 + (wS / (balusters - 1 || 1)) * i;
    out.push(
      cadAssetPart(
        new THREE.CylinderGeometry(postR * 0.22, postR * 0.22, H * 0.85, 6),
        cadAssetMaterial(light, 0.4, 0.4),
        x,
        H * 0.425,
        0,
      ),
    );
  }
  return out;
}

export function buildSofaArchetype(
  wS: number,
  dS: number,
  H: number,
  c: THREE.Color,
  dark: THREE.Color,
  leg: number,
): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const footH = Math.max(0.03, H * 0.05);
  const seatH = H * 0.34;
  const backH = Math.max(0.1, H - footH - seatH);
  out.push(
    cadAssetPart(
      new THREE.BoxGeometry(wS, seatH, dS * 0.8),
      cadAssetMaterial(c, 0.85, 0.05),
      0,
      footH + seatH / 2,
      dS * 0.04,
    ),
  );
  out.push(
    cadAssetPart(
      new THREE.BoxGeometry(wS, backH, dS * 0.2),
      cadAssetMaterial(c, 0.85, 0.05),
      0,
      footH + seatH + backH / 2,
      -dS * 0.4,
    ),
  );
  const armW = Math.max(0.08, wS * 0.09);
  [wS / 2 - armW / 2, -wS / 2 + armW / 2].forEach((x) =>
    out.push(
      cadAssetPart(
        new THREE.BoxGeometry(armW, H * 0.55, dS * 0.86),
        cadAssetMaterial(dark, 0.7, 0.08),
        x,
        footH + H * 0.275,
        0,
      ),
    ),
  );
  const lx = wS / 2 - leg,
    lz = dS / 2 - leg;
  [
    [lx, lz],
    [-lx, lz],
    [lx, -lz],
    [-lx, -lz],
  ].forEach(([x, z]) =>
    out.push(
      cadAssetPart(
        new THREE.BoxGeometry(leg * 0.55, footH, leg * 0.55),
        cadAssetMaterial(dark, 0.6, 0.3),
        x,
        footH / 2,
        z,
      ),
    ),
  );
  return out;
}

export function buildBedArchetype(
  wS: number,
  dS: number,
  H: number,
  c: THREE.Color,
  dark: THREE.Color,
  light: THREE.Color,
): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const frameH = Math.max(0.08, H * 0.22);
  out.push(
    cadAssetPart(
      new THREE.BoxGeometry(wS, frameH, dS),
      cadAssetMaterial(dark, 0.65, 0.2),
      0,
      frameH / 2,
      0,
    ),
  );
  const mattressH = Math.max(0.06, H * 0.28);
  out.push(
    cadAssetPart(
      new THREE.BoxGeometry(wS * 0.97, mattressH, dS * 0.97),
      cadAssetMaterial(light, 0.9, 0.02),
      0,
      frameH + mattressH / 2,
      0,
    ),
  );
  const headboardT = Math.max(0.04, dS * 0.05);
  out.push(
    cadAssetPart(
      new THREE.BoxGeometry(wS, H, headboardT),
      cadAssetMaterial(c, 0.6, 0.15),
      0,
      H / 2,
      -dS / 2 + headboardT / 2,
    ),
  );
  out.push(
    cadAssetPart(
      new THREE.BoxGeometry(wS * 0.32, mattressH * 0.55, dS * 0.22),
      cadAssetMaterial(0xf8fafc, 0.9, 0),
      0,
      frameH + mattressH + mattressH * 0.28,
      -dS * 0.32,
    ),
  );
  return out;
}

export function buildToiletArchetype(
  wS: number,
  dS: number,
  H: number,
  c: THREE.Color,
  light: THREE.Color,
): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const tankH = H * 0.42;
  out.push(
    cadAssetPart(
      new THREE.BoxGeometry(wS * 0.9, tankH, dS * 0.32),
      cadAssetMaterial(c, 0.35, 0.05),
      0,
      H - tankH / 2,
      -dS / 2 + dS * 0.16,
    ),
  );
  const bowlH = Math.max(0.1, H - tankH - H * 0.06);
  out.push(
    cadAssetPart(
      new THREE.CylinderGeometry(wS * 0.42, wS * 0.3, bowlH, 16),
      cadAssetMaterial(c, 0.3, 0.05),
      0,
      bowlH / 2,
      dS * 0.08,
    ),
  );
  out.push(
    cadAssetPart(
      new THREE.CylinderGeometry(wS * 0.46, wS * 0.46, H * 0.06, 16),
      cadAssetMaterial(light, 0.25, 0.05),
      0,
      bowlH + H * 0.03,
      dS * 0.08,
    ),
  );
  return out;
}

export function buildSinkArchetype(
  wS: number,
  dS: number,
  H: number,
  c: THREE.Color,
  dark: THREE.Color,
  light: THREE.Color,
  leg: number,
): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const basinH = Math.max(0.06, H * 0.14);
  out.push(
    cadAssetPart(
      new THREE.BoxGeometry(wS, basinH, dS),
      cadAssetMaterial(c, 0.3, 0.1),
      0,
      H - basinH / 2,
      0,
    ),
  );
  const pedestalR = Math.min(wS, dS) * 0.18;
  const pedestalH = H - basinH;
  out.push(
    cadAssetPart(
      new THREE.CylinderGeometry(pedestalR, pedestalR * 1.3, pedestalH, 14),
      cadAssetMaterial(light, 0.35, 0.1),
      0,
      pedestalH / 2,
      0,
    ),
  );
  out.push(
    cadAssetPart(
      new THREE.CylinderGeometry(leg * 0.22, leg * 0.22, H * 0.14, 8),
      cadAssetMaterial(dark, 0.4, 0.5),
      0,
      H + H * 0.07,
      -dS * 0.32,
    ),
  );
  return out;
}
