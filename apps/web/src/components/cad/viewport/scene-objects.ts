/**
 * Objetos de escena del editor heredado: rótulos, notas, activos y cotas.
 *
 * Cinco funciones de THREE puro que vivían dentro de `Layout3DEditor.tsx`, entre
 * la lógica del CAD y 6.000 líneas de JSX. No tocan React, ni el documento
 * canónico, ni ningún estado del editor: entran datos planos y salen objetos de
 * escena listos para colocar.
 *
 * Salen aquí por la misma razón que `asset-archetypes.ts`: el trinquete de
 * `check:cad` sólo permite que el monolito encoja, y este bloque se lee entero
 * de un tirón fuera de él. Los tipos `Asset` y `Ann` viajan con ellas —son el
 * vocabulario de lo que dibujan— y el monolito los reimporta.
 */
import * as THREE from "three";
import { assetMeta } from "./asset-catalog";
import { buildCadAssetArchetype } from "./asset-archetypes";
import { poolAssetPart, resetAssetInstancePool } from "./asset-instancing";

/** Un activo colocado en la planta del editor heredado. */
export interface Asset {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
  shape?: "rect" | "circle";
  tags?: string[];
}

/** Una anotación: texto suelto o cota entre dos puntos. */
export interface Ann {
  id: string;
  type: "text" | "dim";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  text?: string;
  color?: string;
}

export const CAD_SCENE_ROSE = 0xf43f5e;
export const CAD_SCENE_AMBER = 0xf59e0b;
export const CAD_SCENE_SELECT = 0x22d3ee;

/** Distancia formateada de una cota. Es la misma regla que usa el HUD. */
function fmtDist(d: number, unit: string): string {
  return `${Math.round(d).toLocaleString("es-MX")} ${unit}`;
}

export function makeLabel(text: string, scale = 1.5): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const fontSize = 46;
  const m = canvas.getContext("2d")!;
  m.font = `bold ${fontSize}px sans-serif`;
  const tw = m.measureText(text).width;
  canvas.width = Math.ceil(tw + 30);
  canvas.height = fontSize + 24;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "rgba(15,23,42,0.85)";
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, r);
  ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, r);
  ctx.arcTo(0, canvas.height, 0, 0, r);
  ctx.arcTo(0, 0, canvas.width, 0, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(scale * aspect, scale, 1);
  sprite.renderOrder = 10;
  sprite.userData.isLabel = true; // so the "Etiquetas" layer can hide every label
  return sprite;
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    // Señal de que arranca una demolición: el pool de instancing de
    // asset-instancing.ts no tiene otra forma de enterarse de que la
    // próxima pasada de `buildAssetGroup` es nueva sin tocar el llamador.
    if (c.userData?.assetInstancePool) resetAssetInstancePool();
    const mesh = c as THREE.Mesh & {
      material?: THREE.Material | THREE.Material[];
    };
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (mat)
      (Array.isArray(mat) ? mat : [mat]).forEach((mm) => {
        const t = (mm as THREE.Material & { map?: THREE.Texture | null }).map;
        if (t) t.dispose();
        mm.dispose();
      });
  });
}

export function makeNoteLabel(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const fontSize = 40;
  const m = canvas.getContext("2d")!;
  m.font = `600 ${fontSize}px sans-serif`;
  const tw = Math.min(520, m.measureText(text).width);
  canvas.width = Math.ceil(tw + 34);
  canvas.height = fontSize + 22;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.fillStyle = "rgba(251,191,36,0.94)";
  const r = 9;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, r);
  ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, r);
  ctx.arcTo(0, canvas.height, 0, 0, r);
  ctx.arcTo(0, 0, canvas.width, 0, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#422006";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  const scale = 1.3;
  sprite.scale.set(scale * (canvas.width / canvas.height), scale, 1);
  sprite.renderOrder = 11;
  return sprite;
}

export function buildAssetGroup(
  a: Asset,
  s: number,
  W: number,
  H: number,
  selected: boolean,
  alert = false,
  // El pool compartido cuelga aquí, no del `group` del activo: un `rebuildAssets()`
  // incremental (asset-scene-host.ts) borra grupos de activo uno a uno, y si el
  // `InstancedMesh` compartido viviera dentro del PRIMERO que lo pidió, borrar
  // ESE activo se llevaría por delante las instancias de todos los demás que lo
  // comparten. Sin `instancingHousing` (specs que no reconcilian, sólo
  // construyen y demuelen el grupo entero) el `group` del propio activo sigue
  // sirviendo de anfitrión, como antes.
  instancingHousing?: THREE.Object3D,
): THREE.Group {
  const def = assetMeta(a.kind);
  const wS = Math.max(0.2, a.w * s);
  const dS = Math.max(0.2, a.h * s);
  const h3d = Math.max(0.05, def.height * s);
  const group = new THREE.Group();
  const shape = a.shape ?? "rect";
  const cx = (a.x + a.w / 2 - W / 2) * s;
  const cz = (a.y + a.h / 2 - H / 2) * s;
  const rotY = -((a.rotation || 0) * Math.PI) / 180;
  // Transform absoluta del activo, para hornear la matriz de instancia de
  // cada parte compartida ANTES de que el grupo cargue esta misma transform
  // (ver el comentario de `anchorToWorldSpace` en asset-instancing.ts).
  const worldTransform = new THREE.Matrix4().compose(
    new THREE.Vector3(cx, 0, cz),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(1, 1, 1),
  );
  buildCadAssetArchetype(def.archetype, wS, dS, h3d, def.color, shape).forEach(
    (o, partIndex) => {
      const pooled = poolAssetPart(
        instancingHousing ?? group,
        a.id,
        def.archetype,
        partIndex,
        shape,
        o,
        worldTransform,
      );
      if (!pooled) group.add(o);
    },
  );

  // invisible, forgiving hit box covering the whole bounding volume
  const flat = def.archetype === "zone" || def.archetype === "path";
  const hb = new THREE.Mesh(
    new THREE.BoxGeometry(wS, flat ? Math.max(0.4, h3d) : h3d, dS),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  hb.position.y = (flat ? Math.max(0.4, h3d) : h3d) / 2;
  hb.userData.assetId = a.id;
  group.add(hb);

  if (selected || alert) {
    const oh = Math.max(0.3, h3d);
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(
          wS * (alert ? 1.08 : 1.04),
          oh * 1.04,
          dS * (alert ? 1.08 : 1.04),
        ),
      ),
      new THREE.LineBasicMaterial({
        color: alert ? 0xf87171 : CAD_SCENE_SELECT,
      }),
    );
    outline.position.y = oh / 2;
    group.add(outline);
  }
  if (a.label) {
    const lab = makeLabel(a.label, 1.2);
    lab.position.set(0, (flat ? 0.6 : h3d) + 0.9, 0);
    group.add(lab);
  }

  group.userData.assetId = a.id;
  group.position.set(cx, 0, cz);
  group.rotation.y = rotY;
  return group;
}

export function buildDim(
  a: Ann,
  s: number,
  W: number,
  H: number,
  unit: string,
): THREE.Object3D[] {
  if (a.x2 === undefined || a.y2 === undefined) return [];
  const y = 0.06;
  const ax = (a.x - W / 2) * s,
    az = (a.y - H / 2) * s;
  const bx = (a.x2 - W / 2) * s,
    bz = (a.y2 - H / 2) * s;
  const color = a.color || "#22d3ee";
  const out: THREE.Object3D[] = [];
  const lineMat = () => new THREE.LineBasicMaterial({ color });
  out.push(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(ax, y, az),
        new THREE.Vector3(bx, y, bz),
      ]),
      lineMat(),
    ),
  );
  const dx = bx - ax,
    dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  const px = -dz / len,
    pz = dx / len;
  const t = 0.4;
  [
    [ax, az],
    [bx, bz],
  ].forEach(([cx, cz]) =>
    out.push(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(cx + px * t, y, cz + pz * t),
          new THREE.Vector3(cx - px * t, y, cz - pz * t),
        ]),
        lineMat(),
      ),
    ),
  );
  const dist = Math.hypot(a.x2 - a.x, a.y2 - a.y);
  const label = makeLabel(a.text || fmtDist(dist, unit), 1.1);
  label.position.set((ax + bx) / 2, y + 0.85, (az + bz) / 2);
  label.userData.dimId = a.id;
  out.push(label);
  return out;
}
