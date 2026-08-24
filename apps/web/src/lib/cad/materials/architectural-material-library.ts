/**
 * Biblioteca curada de materiales arquitectónicos (madera, concreto, ladrillo,
 * vidrio, pintura) para las superficies de `asset-archetypes.ts`.
 *
 * Todo material en el editor pasaba por `cadAssetMaterial()`: color plano
 * `MeshStandardMaterial`, sin un solo `THREE.TextureLoader` en todo el
 * producto. Este módulo es la fuente de datos — id, etiqueta en español,
 * categoría, tamaño real de tile en metros — más la generación PROCEDURAL de
 * los tres mapas (color/normal/rugosidad) vía `THREE.CanvasTexture`: no hay
 * assets de textura reales que cargar, y no hay licencia para inventar URLs
 * externas que no existen.
 *
 * Puro por capas: `ARCHITECTURAL_MATERIALS` y `architecturalTileRepeat()` no
 * tocan `document`/`canvas` — son la parte que corre en Node bajo
 * `run-specs.mjs` (ver el spec de este archivo). Sólo `architecturalSurfaceMaps()`
 * toca el DOM, y por eso sólo se ejercita en un navegador de verdad (golden
 * Playwright), igual que `makeLabel()`/`makeNoteLabel()` en `scene-objects.ts`.
 *
 * CACHÉ: los tres canvases de un material (los píxeles YA dibujados) se
 * generan una sola vez por id y se reutilizan — dibujarlos es lo caro
 * (cientos de miles de píxeles por mapa). Cada superficie que los pide recibe
 * en cambio sus PROPIAS `THREE.CanvasTexture` (mismo canvas de respaldo, con
 * `.repeat` distinto): así el `.repeat` de un muro no pisa el de otro, y
 * `disposeObject()` puede seguir liberando la textura de CADA activo sin
 * arriesgar la de otro — no hay un `Texture` compartido cuyo `dispose()`
 * pudiera invalidar el de un activo vecino.
 */
import * as THREE from "three";

export type ArchitecturalMaterialCategory =
  | "madera"
  | "concreto"
  | "ladrillo"
  | "vidrio"
  | "pintura";

type ArchitecturalMaterialPattern = "wood" | "concrete" | "brick" | "glass" | "paint";

export interface ArchitecturalMaterialDef {
  id: string;
  label: string;
  category: ArchitecturalMaterialCategory;
  pattern: ArchitecturalMaterialPattern;
  /** Color base (hex) del patrón procedural. */
  color: string;
  /** Tono secundario (juntas de mortero, veta oscura). Ignorado por pintura/vidrio. */
  accentColor?: string;
  roughness: number;
  metalness: number;
  transparent?: boolean;
  opacity?: number;
  /** Ancho real que cubre UNA repetición del tile, en metros. */
  tileMetersW: number;
  /** Alto real que cubre UNA repetición del tile, en metros. */
  tileMetersH: number;
}

export const ARCHITECTURAL_MATERIALS: ArchitecturalMaterialDef[] = [
  {
    id: "wood-oak",
    label: "Madera de roble",
    category: "madera",
    pattern: "wood",
    color: "#9c6b3f",
    accentColor: "#5f3c1f",
    roughness: 0.55,
    metalness: 0.02,
    tileMetersW: 0.15,
    tileMetersH: 2,
  },
  {
    id: "concrete-smooth",
    label: "Concreto",
    category: "concreto",
    pattern: "concrete",
    color: "#9a978f",
    roughness: 0.85,
    metalness: 0.03,
    tileMetersW: 1,
    tileMetersH: 1,
  },
  {
    id: "brick-red",
    label: "Ladrillo",
    category: "ladrillo",
    pattern: "brick",
    color: "#a8442e",
    accentColor: "#cbc3b4",
    roughness: 0.85,
    metalness: 0,
    tileMetersW: 0.4,
    tileMetersH: 0.14,
  },
  {
    id: "glass-clear",
    label: "Vidrio",
    category: "vidrio",
    pattern: "glass",
    color: "#dbeff2",
    accentColor: "#ffffff",
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.35,
    tileMetersW: 1,
    tileMetersH: 1,
  },
  {
    id: "paint-white",
    label: "Pintura blanca",
    category: "pintura",
    pattern: "paint",
    color: "#f5f4f0",
    roughness: 0.85,
    metalness: 0,
    tileMetersW: 2,
    tileMetersH: 2,
  },
  {
    id: "paint-blue",
    label: "Pintura azul",
    category: "pintura",
    pattern: "paint",
    color: "#3b5b7a",
    roughness: 0.85,
    metalness: 0,
    tileMetersW: 2,
    tileMetersH: 2,
  },
];

const BY_ID = new Map(ARCHITECTURAL_MATERIALS.map((d) => [d.id, d]));

/** Busca un material por id; `undefined` si no existe (id borrado del catálogo o desconocido). */
export function architecturalMaterialDef(id: string): ArchitecturalMaterialDef | undefined {
  return BY_ID.get(id);
}

/** Catálogo agrupado por categoría, en orden de declaración — para paneles selectores. */
export const ARCHITECTURAL_MATERIAL_CATEGORIES: {
  category: ArchitecturalMaterialCategory;
  label: string;
  items: ArchitecturalMaterialDef[];
}[] = (() => {
  const order: { category: ArchitecturalMaterialCategory; label: string }[] = [
    { category: "madera", label: "Madera" },
    { category: "concreto", label: "Concreto" },
    { category: "ladrillo", label: "Ladrillo" },
    { category: "vidrio", label: "Vidrio" },
    { category: "pintura", label: "Pintura" },
  ];
  return order.map((o) => ({
    ...o,
    items: ARCHITECTURAL_MATERIALS.filter((d) => d.category === o.category),
  }));
})();

// ── Matemática de tiling UV (pura, sin DOM — spec la ejercita en Node) ──────

export interface ArchitecturalTextureRepeat {
  repeatX: number;
  repeatY: number;
}

/**
 * `.repeat` correcto para que un tile de `tileMetersW × tileMetersH` cubra una
 * superficie real de `widthM × heightM` sin estirarse: cuántas veces cabe el
 * tile en cada eje.
 */
export function architecturalTileRepeat(
  widthM: number,
  heightM: number,
  tileMetersW: number,
  tileMetersH: number,
): ArchitecturalTextureRepeat {
  const safeTileW = Math.max(tileMetersW, 1e-6);
  const safeTileH = Math.max(tileMetersH, 1e-6);
  return {
    repeatX: Math.max(widthM, 0) / safeTileW,
    repeatY: Math.max(heightM, 0) / safeTileH,
  };
}

/** `architecturalTileRepeat()` resolviendo el tile desde el catálogo por id. */
export function architecturalSurfaceRepeat(
  materialId: string,
  widthM: number,
  heightM: number,
): ArchitecturalTextureRepeat | undefined {
  const def = architecturalMaterialDef(materialId);
  if (!def) return undefined;
  return architecturalTileRepeat(widthM, heightM, def.tileMetersW, def.tileMetersH);
}

// ── Generación procedural (DOM — sólo se ejercita en navegador) ────────────

const PIXELS_PER_METER = 128;
const MIN_TILE_PX = 32;
const MAX_TILE_PX = 512;

function tileCanvasSize(def: ArchitecturalMaterialDef): { w: number; h: number } {
  const clampPx = (metersAxis: number) =>
    Math.max(MIN_TILE_PX, Math.min(MAX_TILE_PX, Math.round(metersAxis * PIXELS_PER_METER)));
  return { w: clampPx(def.tileMetersW), h: clampPx(def.tileMetersH) };
}

/** PRNG determinista (mulberry32): el ruido de una textura debe ser IDÉNTICO
 *  en cada corrida — de lo contrario un golden visual sería intrínsecamente
 *  flaky sin que el producto tuviera ningún defecto. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb(v: [number, number, number], a = 1): string {
  return `rgba(${v[0]},${v[1]},${v[2]},${a})`;
}
function jitterRgb(base: [number, number, number], amount: number): [number, number, number] {
  return [
    clampByte(base[0] + amount),
    clampByte(base[1] + amount),
    clampByte(base[2] + amount),
  ];
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** Rugosidad plana con ligero ruido por píxel alrededor de `base` (0..1). */
function roughnessCanvas(w: number, h: number, base: number, noise: number, rng: () => number): HTMLCanvasElement {
  const canvas = newCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = clampByte(clamp01(base + (rng() - 0.5) * noise) * 255);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Campo de alturas → mapa normal, por diferencias finitas (tipo Sobel) con
 * envolvente TOROIDAL (`at()` cierra en módulo): así el normal map tilea sin
 * costura, igual que el color y la rugosidad de la misma superficie.
 */
function heightToNormalCanvas(height: Float32Array, w: number, h: number, strength: number): HTMLCanvasElement {
  const canvas = newCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const at = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1) || 1;
      const i = (y * w + x) * 4;
      img.data[i] = clampByte(((-dx / len) * 0.5 + 0.5) * 255);
      img.data[i + 1] = clampByte(((-dy / len) * 0.5 + 0.5) * 255);
      img.data[i + 2] = clampByte((1 / len) * 0.5 * 255 + 127.5);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

interface MaterialCanvasSet {
  color: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
}

function paintPattern(def: ArchitecturalMaterialDef, w: number, h: number): MaterialCanvasSet {
  const color = newCanvas(w, h);
  const cctx = color.getContext("2d")!;
  cctx.fillStyle = def.color;
  cctx.fillRect(0, 0, w, h);
  return {
    color,
    normal: heightToNormalCanvas(new Float32Array(w * h), w, h, 1),
    roughness: roughnessCanvas(w, h, def.roughness, 0.03, mulberry32(seedFromId(def.id))),
  };
}

function glassPattern(def: ArchitecturalMaterialDef, w: number, h: number): MaterialCanvasSet {
  const color = newCanvas(w, h);
  const cctx = color.getContext("2d")!;
  cctx.fillStyle = def.color;
  cctx.fillRect(0, 0, w, h);
  const highlight = def.accentColor ?? "#ffffff";
  for (const t of [0.22, 0.62]) {
    const grad = cctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(Math.max(0, t - 0.08), "rgba(0,0,0,0)");
    grad.addColorStop(t, `${highlight}55`);
    grad.addColorStop(Math.min(1, t + 0.08), "rgba(0,0,0,0)");
    cctx.fillStyle = grad;
    cctx.fillRect(0, 0, w, h);
  }
  return {
    color,
    normal: heightToNormalCanvas(new Float32Array(w * h), w, h, 1),
    roughness: roughnessCanvas(w, h, def.roughness, 0.02, mulberry32(seedFromId(def.id))),
  };
}

function concretePattern(def: ArchitecturalMaterialDef, w: number, h: number): MaterialCanvasSet {
  const rng = mulberry32(seedFromId(def.id));
  const base = hexToRgb(def.color);
  const color = newCanvas(w, h);
  const cctx = color.getContext("2d")!;
  cctx.fillStyle = def.color;
  cctx.fillRect(0, 0, w, h);
  const height = new Float32Array(w * h);
  const speckles = Math.round(w * h * 0.05);
  for (let i = 0; i < speckles; i++) {
    const x = Math.floor(rng() * w);
    const y = Math.floor(rng() * h);
    const shade = (rng() - 0.5) * 46;
    cctx.fillStyle = rgb(jitterRgb(base, shade));
    cctx.fillRect(x, y, 1, 1);
    height[y * w + x] = shade / 46;
  }
  return {
    color,
    normal: heightToNormalCanvas(height, w, h, 0.6),
    roughness: roughnessCanvas(w, h, def.roughness, 0.1, rng),
  };
}

function woodPattern(def: ArchitecturalMaterialDef, w: number, h: number): MaterialCanvasSet {
  const rng = mulberry32(seedFromId(def.id));
  const base = hexToRgb(def.color);
  const grain = hexToRgb(def.accentColor ?? def.color);
  const color = newCanvas(w, h);
  const cctx = color.getContext("2d")!;
  cctx.fillStyle = def.color;
  cctx.fillRect(0, 0, w, h);
  const height = new Float32Array(w * h);
  const strands = Math.max(6, Math.round(h / 6));
  for (let s = 0; s < strands; s++) {
    const y0 = (h / strands) * (s + 0.5);
    const amp = rng() * 2.5;
    const phase = rng() * Math.PI * 2;
    const tone = rng() < 0.5 ? grain : base;
    const alpha = 0.18 + rng() * 0.22;
    cctx.strokeStyle = rgb(tone, alpha);
    cctx.lineWidth = 1;
    cctx.beginPath();
    for (let x = 0; x <= w; x++) {
      const y = y0 + Math.sin(phase + (x / w) * Math.PI * 2) * amp;
      if (x === 0) cctx.moveTo(x, y);
      else cctx.lineTo(x, y);
      const yi = Math.round(y);
      if (yi >= 0 && yi < h) height[yi * w + x % w] += tone === grain ? -0.4 : 0.15;
    }
    cctx.stroke();
  }
  const seams = def.tileMetersH >= 1 ? Math.max(1, Math.round(def.tileMetersH)) : 0;
  cctx.strokeStyle = rgb(grain, 0.5);
  for (let i = 1; i <= seams; i++) {
    const y = Math.round((h / (seams + 1)) * i);
    cctx.beginPath();
    cctx.moveTo(0, y);
    cctx.lineTo(w, y);
    cctx.stroke();
  }
  return {
    color,
    normal: heightToNormalCanvas(height, w, h, 0.8),
    roughness: roughnessCanvas(w, h, def.roughness, 0.08, rng),
  };
}

function brickPattern(def: ArchitecturalMaterialDef, w: number, h: number): MaterialCanvasSet {
  const rng = mulberry32(seedFromId(def.id));
  const face = hexToRgb(def.color);
  const mortar = hexToRgb(def.accentColor ?? "#c9c2b6");
  const color = newCanvas(w, h);
  const cctx = color.getContext("2d")!;
  cctx.fillStyle = rgb(mortar);
  cctx.fillRect(0, 0, w, h);
  const height = new Float32Array(w * h);
  const courseH = h / 2;
  const joint = Math.max(1, Math.round(Math.min(w, h) * 0.06));
  const bricksPerCourse = 2;
  const brickW = w / bricksPerCourse;
  const paintBrick = (x0: number, y0: number, bw: number, bh: number) => {
    const bx = x0 + joint / 2;
    const by = y0 + joint / 2;
    const rectW = bw - joint;
    const rectH = bh - joint;
    if (rectW <= 0 || rectH <= 0) return;
    const shade = (rng() - 0.5) * 24;
    cctx.fillStyle = rgb(jitterRgb(face, shade));
    cctx.fillRect(bx, by, rectW, rectH);
    const x1 = Math.max(0, Math.floor(bx));
    const y1 = Math.max(0, Math.floor(by));
    const x2 = Math.min(w, Math.ceil(bx + rectW));
    const y2 = Math.min(h, Math.ceil(by + rectH));
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) height[y * w + x] = 1;
  };
  for (let course = 0; course < 2; course++) {
    const y0 = course * courseH;
    const offset = course === 1 ? brickW / 2 : 0;
    // Recorre un ladrillo de más a cada lado (i=-1 y i=bricksPerCourse): el
    // aparejo a soga necesita que un ladrillo cortado por el borde del tile
    // siga viéndose CONTINUO al repetirse — sin la copia del lado opuesto se
    // vería una junta falsa exactamente en la costura del tile.
    for (let i = -1; i <= bricksPerCourse; i++) {
      const x0 = i * brickW + offset;
      paintBrick(x0, y0, brickW, courseH);
      paintBrick(x0 - w, y0, brickW, courseH);
      paintBrick(x0 + w, y0, brickW, courseH);
    }
  }
  return {
    color,
    normal: heightToNormalCanvas(height, w, h, 0.9),
    roughness: (() => {
      const canvas = newCanvas(w, h);
      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const onBrick = height[i] > 0.5;
        const base = onBrick ? def.roughness : Math.min(1, def.roughness + 0.12);
        const v = clampByte(clamp01(base + (rng() - 0.5) * 0.06) * 255);
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    })(),
  };
}

function buildMaterialCanvases(def: ArchitecturalMaterialDef): MaterialCanvasSet {
  const { w, h } = tileCanvasSize(def);
  switch (def.pattern) {
    case "wood":
      return woodPattern(def, w, h);
    case "concrete":
      return concretePattern(def, w, h);
    case "brick":
      return brickPattern(def, w, h);
    case "glass":
      return glassPattern(def, w, h);
    case "paint":
      return paintPattern(def, w, h);
  }
}

const canvasCache = new Map<string, MaterialCanvasSet>();

function canvasesFor(def: ArchitecturalMaterialDef): MaterialCanvasSet {
  const cached = canvasCache.get(def.id);
  if (cached) return cached;
  const built = buildMaterialCanvases(def);
  canvasCache.set(def.id, built);
  return built;
}

/** Vacía la caché de canvases dibujados. Sólo hace falta en specs de navegador. */
export function resetArchitecturalMaterialCache(): void {
  canvasCache.clear();
}

export interface ArchitecturalSurfaceMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  def: ArchitecturalMaterialDef;
}

/**
 * Mapas color/normal/rugosidad para una superficie real de `widthM × heightM`,
 * con `.repeat` ya calculado para que el tile no se estire. El DIBUJO
 * (`canvasesFor`) está cacheado por id; lo que se crea aquí en cada llamada es
 * sólo la envoltura `THREE.CanvasTexture` — barata, y necesaria para que cada
 * activo tenga su PROPIA textura que `disposeObject()` pueda liberar sin
 * afectar a otro activo que use el mismo material a otro tamaño.
 */
export function architecturalSurfaceMaps(
  materialId: string,
  widthM: number,
  heightM: number,
): ArchitecturalSurfaceMaps | undefined {
  const def = architecturalMaterialDef(materialId);
  if (!def) return undefined;
  const canvases = canvasesFor(def);
  const { repeatX, repeatY } = architecturalTileRepeat(widthM, heightM, def.tileMetersW, def.tileMetersH);
  const build = (canvas: HTMLCanvasElement, colorData: boolean) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    // Sólo el mapa de color es dato de COLOR (sRGB); normal/rugosidad son
    // datos lineales — decodificarlos como sRGB oscurecería la rugosidad y
    // desviaría el normal map.
    if (colorData) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  return {
    map: build(canvases.color, true),
    normalMap: build(canvases.normal, false),
    roughnessMap: build(canvases.roughness, false),
    def,
  };
}

/**
 * Variante con textura de `cadAssetMaterial()` (`asset-archetypes.ts`): si
 * `materialId` resuelve en el catálogo, la superficie lleva mapas
 * color/normal/rugosidad reales con `.repeat` ya calculado para
 * `widthM × heightM` (la superficie visible dominante de la parte, no toda su
 * caja delimitadora). Sin `materialId`, o si el id ya no existe en el
 * catálogo (documento viejo), cae al color plano de siempre — nunca rompe el
 * render. Vive aquí y no en `asset-archetypes.ts` porque ese archivo ya
 * rozaba el presupuesto de `check:monolith-budget.mjs`; no puede importar
 * `cadAssetMaterial()` de vuelta (`lib/` no importa de `components/`), así
 * que el respaldo de color plano se repite aquí, mínimo.
 */
export function cadTexturedAssetMaterial(
  materialId: string,
  widthM: number,
  heightM: number,
  fallbackColor: THREE.ColorRepresentation,
  rough = 0.6,
  metal = 0.15,
): THREE.MeshStandardMaterial {
  const maps = architecturalSurfaceMaps(materialId, widthM, heightM);
  if (!maps) return new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: rough, metalness: metal });
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    // El mapa de rugosidad ya lleva el valor real en sus píxeles; dejar el
    // escalar en 1 evita que se vuelva a multiplicar (three.js usa
    // `roughness * roughnessMap`, no lo reemplaza).
    roughness: 1,
    metalness: maps.def.metalness,
    transparent: maps.def.transparent ?? false,
    opacity: maps.def.opacity ?? 1,
  });
}
