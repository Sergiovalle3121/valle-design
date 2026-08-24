/**
 * GOLDEN de P0-2 · un plano LOCAL no se corre ni un píxel cuando el documento
 * gana una entidad en coordenadas UTM (10⁶).
 *
 * ## Por qué esto y no una captura de pantalla
 *
 * El editor ya tiene fragilidad documentada por TIMING de cámara (backlog
 * P1-1b: un golden con captura de pantalla que depende de cuándo se asienta
 * el amortiguado de `OrbitControls`). Comparar píxeles de dos cargas de
 * página distintas heredaría ese mismo riesgo sin necesidad.
 *
 * Lo que de verdad hay que probar es más estrecho y se puede probar EXACTO:
 * la cantidad que el vertex shader multiplica por la proyección —
 * `(bufferedWorld - cadCenter) * scale`— tiene que ser IDÉNTICA para una
 * misma entidad local, la escena tenga o no una entidad hermana a magnitud
 * UTM. Esta suite reconstruye esa cantidad en JS (la misma aritmética que
 * `CAD_LINE_BATCH_VERTEX_SHADER`, ver `line-batch-three.ts`) leyendo el
 * búfer y los uniformes reales que `CadRenderScene` sube — sin lienzo, sin
 * WebGL, sin cámara: es la parte de la cadena que puede cuantizar mal, y
 * nada más.
 *
 * `pipeline.origin` es el centroide del DOCUMENTO ENTERO (ver `pipeline.ts`
 * `replace()`), así que añadir una entidad lejana —aunque quede fuera de la
 * vista y nunca se tesele— desplaza el origen para TODO el documento. Si el
 * origen no cancelara exacto contra `cadCenter`, esta prueba lo vería.
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import { CadRenderScene } from "./scene";
import type { CadNativeEntity } from "../entity-runtime";
import type { CadLineBatchUniforms } from "./line-batch-three";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const localLine: CadNativeEntity = {
  id: "local-line",
  type: "line",
  start: { x: 100, y: 100, z: 0 },
  end: { x: 900, y: 100, z: 0 },
  layer: "0",
};

/** A 5·10⁶: la magnitud UTM que el probe de P0-2 mide como caso extremo. */
const farLine: CadNativeEntity = {
  id: "far-utm-line",
  type: "line",
  start: { x: 5_000_000, y: 5_000_000, z: 0 },
  end: { x: 5_000_100, y: 5_000_000, z: 0 },
  layer: "0",
};

const VIEWPORT = { scale: 0.5, width: 1_000, height: 1_000, elevation: 0.11 };
const VIEW = {
  bounds: { minX: -100, minY: -100, maxX: 1_100, maxY: 1_100 },
  pixelsPerUnit: 1,
};

/**
 * Posición final en espacio de escena de UN extremo de `localLine`, calculada
 * con la MISMA fórmula que el vertex shader — `(world - cadCenter) * scale`—
 * pero leyendo el búfer y el uniforme YA subidos, para que un origen mal
 * cancelado se note aquí y no sólo en la lectura del shader.
 */
function localLineScenePosition(entities: readonly CadNativeEntity[]): {
  x: number;
  z: number;
} {
  const scene = new CadRenderScene({ viewport: VIEWPORT, offThread: null });
  scene.replace(entities, entities.map((entity) => entity.id));
  scene.setView(VIEW);
  let guard = 0;
  while (!scene.settled) {
    if (++guard > 10_000) throw new Error("la escena no asienta");
    scene.runFrame();
  }
  scene.sync();
  const mesh = scene.group.children.find(
    (child) => child.userData.cadLineBatch === true,
  ) as THREE.Mesh | undefined;
  if (!mesh) throw new Error("la línea local debe producir al menos una malla");
  const uniforms = (mesh.material as THREE.ShaderMaterial).uniforms as CadLineBatchUniforms;
  const start = mesh.geometry.getAttribute("instanceStart") as THREE.InstancedBufferAttribute;
  // El punto de arranque de `local-line` es la primera instancia: es la única
  // entidad cuyo tile cae dentro de `VIEW`, así que no hay ambigüedad de cuál
  // instancia mirar.
  const worldX = start.getX(0);
  const worldY = start.getY(0);
  const center = uniforms.cadCenter.value;
  const scale = uniforms.cadScale.value;
  const position = {
    x: (worldX - center.x) * scale,
    z: (worldY - center.y) * scale,
  };
  scene.dispose();
  return position;
}

const withoutFarEntity = localLineScenePosition([localLine]);
const withFarEntity = localLineScenePosition([localLine, farLine]);

// El origen SÍ tiene que moverse mucho: si no se moviera, la entidad lejana no
// estaría ejerciendo el caso que esta prueba quiere cazar.
{
  const soloScene = new CadRenderScene({ viewport: VIEWPORT, offThread: null });
  soloScene.replace([localLine], ["local-line"]);
  const soloOrigin = soloScene.pipeline.origin;
  soloScene.dispose();

  const pairedScene = new CadRenderScene({ viewport: VIEWPORT, offThread: null });
  pairedScene.replace([localLine, farLine], ["local-line", "far-utm-line"]);
  const pairedOrigin = pairedScene.pipeline.origin;
  pairedScene.dispose();

  assert.ok(
    Math.abs(pairedOrigin.x - soloOrigin.x) > 1_000_000,
    `añadir la entidad UTM debe desplazar el origen del documento con fuerza: ` +
      `${soloOrigin.x} → ${pairedOrigin.x}`,
  );
  ok(
    true,
    `el origen del documento se mueve de (${soloOrigin.x}, ${soloOrigin.y}) a ` +
      `(${pairedOrigin.x}, ${pairedOrigin.y}) al sumar la entidad UTM — el caso que esta prueba ejercita`,
  );
}

// Y AUN ASÍ, la posición final en pantalla de la línea local es la misma.
const CAD_LOCAL_SHIFT_BUDGET_SCENE_UNITS = 1e-4;
const deltaX = Math.abs(withFarEntity.x - withoutFarEntity.x);
const deltaZ = Math.abs(withFarEntity.z - withoutFarEntity.z);
assert.ok(
  deltaX <= CAD_LOCAL_SHIFT_BUDGET_SCENE_UNITS,
  `el eje X se corrió ${deltaX} unidades de escena al añadir la entidad UTM ` +
    `(sin ella: ${withoutFarEntity.x}, con ella: ${withFarEntity.x})`,
);
assert.ok(
  deltaZ <= CAD_LOCAL_SHIFT_BUDGET_SCENE_UNITS,
  `el eje Z se corrió ${deltaZ} unidades de escena al añadir la entidad UTM ` +
    `(sin ella: ${withoutFarEntity.z}, con ella: ${withFarEntity.z})`,
);
ok(
  true,
  `la línea local queda en (${withoutFarEntity.x}, ${withoutFarEntity.z}) tanto sola como junto a la ` +
    `entidad UTM (Δx=${deltaX}, Δz=${deltaZ}): el origen flotante cancela exacto contra cadCenter`,
);

console.log(
  `large-coordinate-scene: ${checks} comprobaciones verdes — sumar una entidad a 5·10⁶ mueve el ` +
    `origen del documento pero no corre la línea local ni ${CAD_LOCAL_SHIFT_BUDGET_SCENE_UNITS} unidades ` +
    `de escena en pantalla.`,
);
