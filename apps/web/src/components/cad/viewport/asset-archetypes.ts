/**
 * Fábrica de geometría 3D por arquetipo de activo.
 *
 * Estaban 670 líneas de THREE puro dentro de `Layout3DEditor.tsx`, entre la
 * lógica de dibujo del CAD y el JSX. No dependen de React, ni del documento
 * canónico, ni de ningún estado del editor: entran seis escalares y sale una
 * lista de mallas centrada en X/Z con la base en y = 0. Quien las llama las
 * coloca y las gira.
 *
 * Salen aquí porque el trinquete de `check:cad` sólo permite que el monolito
 * encoja, y porque este bloque es exactamente el tipo de código que no tenía
 * por qué vivir ahí: se lee entero de un tirón y se cambia sin abrir un archivo
 * de 23.000 líneas.
 */
import * as THREE from "three";
import type { AssetArchetype } from "./asset-catalog";

// ── 3D asset geometry factory ────────────────────────────────────────────────
// Builds a distinctive mesh group per archetype. Geometry is centred in X/Z with
// its base at y=0; the caller positions the group on the floor and rotates it.
export function cadAssetMaterial(
  color: THREE.ColorRepresentation,
  rough = 0.6,
  metal = 0.15,
  emissive: THREE.ColorRepresentation = 0x000000,
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    emissive,
  });
}
export function cadAssetPart(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildCadAssetArchetype(
  archetype: AssetArchetype,
  wS: number,
  dS: number,
  H: number,
  colorHex: string,
  shape: "rect" | "circle" = "rect",
): THREE.Object3D[] {
  const c = new THREE.Color(colorHex);
  const dark = c.clone().multiplyScalar(0.6);
  const light = c.clone().lerp(new THREE.Color(0xffffff), 0.25);
  const out: THREE.Object3D[] = [];
  const leg = Math.max(0.04, Math.min(wS, dS) * 0.08);

  switch (archetype) {
    case "table": {
      const top = Math.max(0.05, H * 0.07);
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, top, dS),
          cadAssetMaterial(c, 0.55, 0.1),
          0,
          H - top / 2,
          0,
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
            new THREE.BoxGeometry(leg, H - top, leg),
            cadAssetMaterial(dark, 0.7, 0.3),
            x,
            (H - top) / 2,
            z,
          ),
        ),
      );
      break;
    }
    case "shelf": {
      const post = Math.max(0.05, Math.min(wS, dS) * 0.09);
      const lx = wS / 2 - post / 2,
        lz = dS / 2 - post / 2;
      [
        [lx, lz],
        [-lx, lz],
        [lx, -lz],
        [-lx, -lz],
      ].forEach(([x, z]) =>
        out.push(
          cadAssetPart(
            new THREE.BoxGeometry(post, H, post),
            cadAssetMaterial(dark, 0.6, 0.35),
            x,
            H / 2,
            z,
          ),
        ),
      );
      const shelves = 4;
      const st = Math.max(0.04, H * 0.04);
      for (let i = 0; i < shelves; i++) {
        const y = (H / (shelves - 1)) * i;
        out.push(
          cadAssetPart(
            new THREE.BoxGeometry(wS, st, dS),
            cadAssetMaterial(c, 0.65, 0.1),
            0,
            Math.min(H - st / 2, Math.max(st / 2, y)),
            0,
          ),
        );
      }
      break;
    }
    case "arm": {
      const baseH = H * 0.18,
        baseR = Math.min(wS, dS) * 0.42;
      out.push(
        cadAssetPart(
          new THREE.CylinderGeometry(baseR, baseR * 1.1, baseH, 18),
          cadAssetMaterial(dark, 0.5, 0.5),
          0,
          baseH / 2,
          0,
        ),
      );
      const col = cadAssetPart(
        new THREE.CylinderGeometry(baseR * 0.55, baseR * 0.6, H * 0.42, 14),
        cadAssetMaterial(c, 0.45, 0.5),
        0,
        baseH + H * 0.21,
        0,
      );
      out.push(col);
      // upper arm tilted out
      const upper = cadAssetPart(
        new THREE.BoxGeometry(wS * 0.7, H * 0.12, H * 0.1),
        cadAssetMaterial(c, 0.4, 0.6),
        wS * 0.18,
        baseH + H * 0.46,
        0,
      );
      upper.rotation.z = -0.5;
      out.push(upper);
      const fore = cadAssetPart(
        new THREE.BoxGeometry(wS * 0.5, H * 0.09, H * 0.08),
        cadAssetMaterial(light, 0.4, 0.6),
        wS * 0.42,
        baseH + H * 0.6,
        0,
      );
      fore.rotation.z = 0.35;
      out.push(fore);
      out.push(
        cadAssetPart(
          new THREE.SphereGeometry(baseR * 0.4, 12, 10),
          cadAssetMaterial(dark, 0.4, 0.7),
          wS * 0.55,
          baseH + H * 0.52,
          0,
        ),
      );
      break;
    }
    case "machine": {
      const bodyH = H * 0.82;
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, bodyH, dS),
          cadAssetMaterial(c, 0.5, 0.25),
          0,
          bodyH / 2,
          0,
        ),
      );
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS * 0.96, H * 0.16, dS * 0.96),
          cadAssetMaterial(dark, 0.55, 0.3),
          0,
          bodyH + H * 0.08,
          0,
        ),
      );
      // viewing window / control panel on the +Z face
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS * 0.5, bodyH * 0.4, leg * 0.6),
          cadAssetMaterial(0x0f172a, 0.2, 0.7, 0x0b1220),
          0,
          bodyH * 0.6,
          dS / 2,
        ),
      );
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS * 0.22, bodyH * 0.3, leg * 0.6),
          cadAssetMaterial(light, 0.3, 0.5),
          wS * 0.32,
          bodyH * 0.45,
          dS / 2,
        ),
      );
      // feet
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
            new THREE.BoxGeometry(leg * 1.2, H * 0.05, leg * 1.2),
            cadAssetMaterial(dark, 0.7, 0.3),
            x,
            H * 0.025,
            z,
          ),
        ),
      );
      break;
    }
    case "wall": {
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, H, dS),
          cadAssetMaterial(c, 0.9, 0.02),
          0,
          H / 2,
          0,
        ),
      );
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, H * 0.03, dS * 1.15),
          cadAssetMaterial(dark, 0.8, 0.05),
          0,
          H,
          0,
        ),
      );
      break;
    }
    case "door": {
      const jamb = Math.max(0.04, dS * 0.35);
      const leaf = cadAssetPart(
        new THREE.BoxGeometry(wS * 0.92, H * 0.92, jamb),
        cadAssetMaterial(c, 0.65, 0.08),
        wS * 0.04,
        H * 0.46,
        -dS * 0.1,
      );
      leaf.rotation.y = -Math.PI / 5;
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, Math.max(0.04, H * 0.025), dS),
          cadAssetMaterial(dark, 0.8, 0.05),
          0,
          Math.max(0.03, H * 0.012),
          0,
        ),
      );
      out.push(leaf);
      const arcPoints = new THREE.EllipseCurve(
        0,
        0,
        wS * 0.86,
        wS * 0.86,
        0,
        Math.PI / 2,
      )
        .getPoints(24)
        .map(
          (point) =>
            new THREE.Vector3(point.x, Math.max(0.06, H * 0.03), point.y),
        );
      const arc = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(arcPoints),
        new THREE.LineBasicMaterial({ color: c }),
      );
      arc.position.set(-wS / 2, 0, -dS / 2);
      arc.renderOrder = 4;
      out.push(arc);
      break;
    }
    case "cabinet": {
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, H, dS),
          cadAssetMaterial(c, 0.5, 0.3),
          0,
          H / 2,
          0,
        ),
      );
      // door seam + handle
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(leg * 0.4, H * 0.9, leg * 0.3),
          cadAssetMaterial(dark, 0.4, 0.5),
          0,
          H / 2,
          dS / 2,
        ),
      );
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(leg, H * 0.16, leg * 0.5),
          cadAssetMaterial(light, 0.3, 0.6),
          wS * 0.22,
          H * 0.5,
          dS / 2,
        ),
      );
      break;
    }
    case "column": {
      const r = Math.min(wS, dS) * 0.5;
      out.push(
        cadAssetPart(
          new THREE.CylinderGeometry(r, r * 1.1, H, 20),
          cadAssetMaterial(c, 0.85, 0.1),
          0,
          H / 2,
          0,
        ),
      );
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(r * 2.4, H * 0.04, r * 2.4),
          cadAssetMaterial(dark, 0.8, 0.1),
          0,
          H * 0.02,
          0,
        ),
      );
      break;
    }
    case "pallet": {
      const deck = Math.max(0.05, H * 0.45);
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, deck, dS),
          cadAssetMaterial(c, 0.85, 0.02),
          0,
          H - deck / 2,
          0,
        ),
      );
      // 3 runners
      [-dS / 2 + leg, 0, dS / 2 - leg].forEach((z) =>
        out.push(
          cadAssetPart(
            new THREE.BoxGeometry(wS, H - deck, leg * 2),
            cadAssetMaterial(c.clone().multiplyScalar(0.85), 0.9, 0.02),
            0,
            (H - deck) / 2,
            z,
          ),
        ),
      );
      break;
    }
    case "fence": {
      const posts = Math.max(2, Math.round(wS / Math.max(0.6, dS * 4)) + 1);
      const pw = Math.max(0.05, dS * 0.5);
      for (let i = 0; i < posts; i++) {
        const x = -wS / 2 + (wS / (posts - 1 || 1)) * i;
        out.push(
          cadAssetPart(
            new THREE.BoxGeometry(pw, H, pw),
            cadAssetMaterial(c, 0.6, 0.3),
            x,
            H / 2,
            0,
          ),
        );
      }
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, H * 0.08, pw * 0.6),
          cadAssetMaterial(c, 0.6, 0.3),
          0,
          H * 0.9,
          0,
        ),
      );
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, H * 0.08, pw * 0.6),
          cadAssetMaterial(c, 0.6, 0.3),
          0,
          H * 0.45,
          0,
        ),
      );
      break;
    }
    case "person": {
      const r = Math.min(wS, dS) * 0.3;
      out.push(
        cadAssetPart(
          new THREE.CylinderGeometry(r * 0.9, r, H * 0.58, 14),
          cadAssetMaterial(c, 0.7, 0.05),
          0,
          H * 0.32,
          0,
        ),
      );
      out.push(
        cadAssetPart(
          new THREE.SphereGeometry(r * 0.7, 14, 12),
          cadAssetMaterial(light, 0.6, 0.05),
          0,
          H * 0.74,
          0,
        ),
      );
      break;
    }
    case "desk": {
      const top = Math.max(0.05, H * 0.08),
        deskY = H * 0.62;
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, top, dS),
          cadAssetMaterial(c, 0.55, 0.1),
          0,
          deskY,
          0,
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
            new THREE.BoxGeometry(leg, deskY, leg),
            cadAssetMaterial(dark, 0.7, 0.3),
            x,
            deskY / 2,
            z,
          ),
        ),
      );
      // monitor: panel on a small stand
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(leg, H * 0.12, leg),
          cadAssetMaterial(dark, 0.5, 0.4),
          0,
          deskY + top + H * 0.06,
          -dS * 0.2,
        ),
      );
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS * 0.42, H * 0.26, leg * 0.5),
          cadAssetMaterial(0x0f172a, 0.2, 0.6, 0x0b1220),
          0,
          deskY + top + H * 0.22,
          -dS * 0.2,
        ),
      );
      break;
    }
    case "bin": {
      const wall = Math.max(0.04, Math.min(wS, dS) * 0.08);
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, Math.max(0.04, H * 0.08), dS),
          cadAssetMaterial(dark, 0.8, 0.05),
          0,
          H * 0.04,
          0,
        ),
      ); // floor
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, H, wall),
          cadAssetMaterial(c, 0.7, 0.05),
          0,
          H / 2,
          dS / 2 - wall / 2,
        ),
      );
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, H, wall),
          cadAssetMaterial(c, 0.7, 0.05),
          0,
          H / 2,
          -dS / 2 + wall / 2,
        ),
      );
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wall, H, dS - wall * 2),
          cadAssetMaterial(c, 0.7, 0.05),
          wS / 2 - wall / 2,
          H / 2,
          0,
        ),
      );
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wall, H, dS - wall * 2),
          cadAssetMaterial(c, 0.7, 0.05),
          -wS / 2 + wall / 2,
          H / 2,
          0,
        ),
      );
      break;
    }
    case "gantry": {
      const legW = Math.max(0.1, dS * 0.5),
        beamH = Math.max(0.15, H * 0.12);
      // two end legs (span along X)
      [wS / 2 - legW / 2, -wS / 2 + legW / 2].forEach((x) =>
        out.push(
          cadAssetPart(
            new THREE.BoxGeometry(legW, H - beamH, legW),
            cadAssetMaterial(dark, 0.6, 0.35),
            x,
            (H - beamH) / 2,
            0,
          ),
        ),
      );
      // top beam spanning the legs
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS, beamH, legW * 0.9),
          cadAssetMaterial(c, 0.5, 0.4),
          0,
          H - beamH / 2,
          0,
        ),
      );
      // trolley/hoist hanging from the beam
      out.push(
        cadAssetPart(
          new THREE.BoxGeometry(wS * 0.12, beamH * 1.4, legW * 1.1),
          cadAssetMaterial(light, 0.4, 0.5),
          wS * 0.1,
          H - beamH * 1.1,
          0,
        ),
      );
      break;
    }
    case "stairs": {
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
      break;
    }
    case "railing": {
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
      break;
    }
    case "sofa": {
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
      break;
    }
    case "bed": {
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
      break;
    }
    case "toilet": {
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
      break;
    }
    case "sink": {
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
      break;
    }
    case "zone":
    case "path":
    default: {
      const opacity = archetype === "path" ? 0.22 : 0.14;
      if (shape === "circle") {
        // disco plano con borde: el radio sigue la caja delimitadora (wS≈dS).
        const ring2d = new THREE.EllipseCurve(
          0,
          0,
          wS / 2,
          dS / 2,
          0,
          Math.PI * 2,
        ).getPoints(64);
        const fillC = new THREE.Mesh(
          new THREE.ShapeGeometry(new THREE.Shape(ring2d)),
          new THREE.MeshBasicMaterial({
            color: c,
            transparent: true,
            opacity,
            side: THREE.DoubleSide,
          }),
        );
        fillC.rotation.x = -Math.PI / 2;
        fillC.position.y = 0.04;
        out.push(fillC);
        const ring = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(
            ring2d.map((p) => new THREE.Vector3(p.x, 0, p.y)),
          ),
          new THREE.LineBasicMaterial({ color: c }),
        );
        ring.position.y = 0.05;
        out.push(ring);
        break;
      }
      // flat translucent footprint with a coloured border
      const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(wS, dS),
        new THREE.MeshBasicMaterial({
          color: c,
          transparent: true,
          opacity,
          side: THREE.DoubleSide,
        }),
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = 0.04;
      out.push(fill);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(wS, dS)),
        new THREE.LineBasicMaterial({ color: c }),
      );
      edge.rotation.x = -Math.PI / 2;
      edge.position.y = 0.05;
      out.push(edge);
      break;
    }
  }
  return out;
}
