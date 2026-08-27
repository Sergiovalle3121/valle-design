/**
 * Qué viaja en el GLB — la lista explícita, en un módulo que un spec puede
 * ejercitar sin montar el editor.
 *
 * ## El defecto que este módulo cierra
 *
 * «Exportar modelo 3D (.glb)» exportaba SOLO los grupos del modelo de activos
 * heredado (bloques, assets, conexiones, suelo). La arquitectura nativa — los
 * muros con sus vanos recortados, el piso, el cielorraso, la cubierta y los
 * SOLID3D — vive en otros grupos de escena (`CadNativeMassHosts`,
 * `CadSolidShadeHost`) que nadie incluía: el botón entregaba un edificio sin
 * edificio, y ningún spec lo miraba. Para la campaña COMMERCIAL-RC1 un GLB
 * sin la arquitectura es un fallo, no una exportación.
 *
 * ## El contrato
 *
 * `collectCadGlbExportObjects` recibe los grupos por su papel y devuelve la
 * lista a exportar, sin nulos y sin grupos vacíos (un grupo vacío en el GLB es
 * un nodo fantasma que confunde a Blender sin aportar geometría). La lista es
 * EXPLÍCITA a propósito: si mañana aparece un anfitrión nuevo con geometría
 * comercial, tiene que sumarse aquí y al spec de round-trip — no hay un
 * «exportar todo» que lo incluya en silencio junto con overlays y grips.
 */
import type * as THREE from "three";

export interface CadGlbExportGroups {
  /** Modelo heredado: bloques colocados, activos, conexiones, suelo. */
  legacy: readonly (THREE.Object3D | null | undefined)[];
  /**
   * Arquitectura nativa: muros con vanos recortados + piso/cielorraso/
   * cubierta (`CadNativeMassHosts.group`) y SOLID3D (`CadSolidShadeHost.group`).
   */
  architecture: readonly (THREE.Object3D | null | undefined)[];
}

function hasRenderableContent(object: THREE.Object3D): boolean {
  let renderable = false;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const line = child as unknown as { isLine?: boolean };
    const points = child as unknown as { isPoints?: boolean };
    if (mesh.isMesh || line.isLine === true || points.isPoints === true)
      renderable = true;
  });
  return renderable;
}

/**
 * La lista final de objetos a exportar. `architectureRequired` (default true)
 * hace FALLAR la colección cuando el documento tiene arquitectura que
 * exportar y los grupos llegan vacíos — la firma del defecto original.
 */
export function collectCadGlbExportObjects(
  groups: CadGlbExportGroups,
): THREE.Object3D[] {
  const present = (
    list: readonly (THREE.Object3D | null | undefined)[],
  ): THREE.Object3D[] =>
    list.filter(
      (object): object is THREE.Object3D =>
        !!object && hasRenderableContent(object),
    );
  return [...present(groups.legacy), ...present(groups.architecture)];
}

/**
 * ¿Incluye la lista al menos un objeto de ARQUITECTURA con geometría real?
 * El exportador del editor lo usa para avisar cuando el GLB saldría sin
 * edificio (documento con muros pero grupos 3D aún no materializados).
 */
export function cadGlbExportIncludesArchitecture(
  groups: CadGlbExportGroups,
): boolean {
  return groups.architecture.some(
    (object) => !!object && hasRenderableContent(object),
  );
}

export type CadGlbExportPlan =
  | { kind: "empty" }
  /** El documento tiene muros/sólidos y la escena 3D aún no los materializó:
   * un GLB sin la arquitectura sería el defecto original, no una exportación. */
  | { kind: "architecture-missing" }
  | { kind: "ready"; objects: THREE.Object3D[] };

/** La decisión completa del botón «Exportar .glb», ejecutable en un spec. */
export function planCadGlbExport(
  groups: CadGlbExportGroups,
  documentHasArchitecture: boolean,
): CadGlbExportPlan {
  const objects = collectCadGlbExportObjects(groups);
  if (objects.length === 0) return { kind: "empty" };
  if (documentHasArchitecture && !cadGlbExportIncludesArchitecture(groups))
    return { kind: "architecture-missing" };
  return { kind: "ready", objects };
}

/**
 * Oculta los overlays que no deben viajar en el GLB (etiquetas, línea de
 * previsualización) y devuelve la función que los restaura. Sólo apaga lo que
 * estaba visible, para que restaurar no encienda nada que ya estaba apagado.
 */
export function hideCadGlbOverlays(
  root: THREE.Object3D | null | undefined,
  isOverlay: (object: THREE.Object3D) => boolean,
): () => void {
  const hidden: THREE.Object3D[] = [];
  root?.traverse((object) => {
    if (isOverlay(object) && object.visible) {
      object.visible = false;
      hidden.push(object);
    }
  });
  return () => {
    for (const object of hidden) object.visible = true;
  };
}

/**
 * Serializa los objetos a un Blob GLB binario. `hide` aparta los overlays
 * durante la serialización y su restauración corre SIEMPRE, también cuando el
 * exportador falla — dejar el 3D sin etiquetas tras un fallo sería un segundo
 * defecto encima del primero.
 *
 * `exportScale` corrige la escala de AJUSTE DE CÁMARA con la que el visor 3D
 * construye toda su geometría (`Layout3DEditor`: `s = 30 / Math.max(W, H)`,
 * para que un predio de 4 m y uno de 400 m quepan igual de bien en la
 * pantalla) — necesaria para el visor, mentirosa para el archivo. glTF
 * declara 1 unidad = 1 metro; sin corregirla, un editor con un predio de
 * 40×30 m exportaba un GLB cuyo metro no medía un metro real, y cada plano
 * salía con una escala distinta según el tamaño de SU predio. Por defecto es
 * 1 (sin corregir), para quien llame sin conocer esa escala.
 */
export async function serializeCadGlbBlob(
  objects: readonly THREE.Object3D[],
  options: { hide?: () => () => void; exportScale?: number } = {},
): Promise<Blob> {
  const { GLTFExporter } = await import(
    "three/examples/jsm/exporters/GLTFExporter.js"
  );
  const restore = options.hide?.() ?? (() => {});
  try {
    const scale = options.exportScale ?? 1;
    // Clones, nunca los objetos vivos: `Object3D.add()` saca al hijo de su
    // padre anterior, y reparentar la escena real para exportarla la dejaría
    // rota en cuanto terminara. El clon comparte geometría y material por
    // referencia (no duplica memoria) y copia la visibilidad ya apagada por
    // `hide` un instante antes.
    const exportRoots =
      scale === 1 ? [...objects] : [await scaledExportWrapper(objects, scale)];
    const result = await new Promise<ArrayBuffer>((resolve, reject) => {
      new GLTFExporter().parse(
        exportRoots,
        (value) => resolve(value as ArrayBuffer),
        reject,
        { binary: true, onlyVisible: true },
      );
    });
    return new Blob([result], { type: "model/gltf-binary" });
  } finally {
    restore();
  }
}

/**
 * Un único grupo raíz a `scale`, con CLONES de `objects` como hijos. Import
 * dinámico de `three` a propósito: el import de arriba es de SOLO TIPOS, y
 * este módulo entra en el bundle de specs de Node que no cargan el runtime
 * de three salvo que de verdad exporten un GLB (igual que ya hace
 * `GLTFExporter` un par de líneas arriba).
 */
async function scaledExportWrapper(
  objects: readonly THREE.Object3D[],
  scale: number,
): Promise<THREE.Object3D> {
  const { Group } = await import("three");
  const wrapper = new Group();
  wrapper.scale.setScalar(scale);
  for (const object of objects) wrapper.add(object.clone(true));
  return wrapper;
}
