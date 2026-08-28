/**
 * 3.3 — GLB A ESCALA 1:1, MEDIDO EN EL ARCHIVO.
 *
 * ─── Qué se corrigió y por qué hay que vigilarlo ───────────────────────────
 *
 * El visor 3D construye toda su geometría con una escala de AJUSTE DE CÁMARA
 * (`s = 30 / max(W, H)`) para que un predio de 4 m y uno de 400 m quepan igual
 * de bien en la pantalla. Es necesaria para el visor y MENTIROSA para el
 * archivo: glTF declara que 1 unidad = 1 metro, así que exportar esas
 * coordenadas tal cual entregaba un GLB cuyo metro no medía un metro — y con
 * una distorsión DISTINTA en cada plano, según el tamaño de su predio.
 *
 * La campaña de paridad lo corrigió pasando `exportScale` a
 * `serializeCadGlbBlob`. Esta suite comprueba que sigue corregido de la única
 * forma que vale: **midiendo un muro conocido dentro del archivo exportado**.
 *
 * La regla FIX-OR-HIDE aplicada a este caso: si el muro no midiera lo que mide,
 * el botón de exportar GLB y el texto «ábrelo en Blender» tendrían que
 * desaparecer de la superficie. Como sí mide, se queda — y este gate es lo que
 * mantiene esa afirmación honesta.
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CAD_DOCUMENT_SCHEMA, type CadDocument, type CadEntity } from "../cad-document";
import { CadNativeMassHosts } from "@/components/cad/viewport/native-mass-hosts";
import { serializeCadGlbBlob } from "../glb-export";
import { unitToMeters } from "../world-scale";

/**
 * `GLTFExporter` ensambla el binario con `FileReader`, que es API de
 * navegador. El polyfill mínimo es el mismo de `glb-export.spec.ts`.
 */
class NodeFileReader {
  onload: ((event: { target: NodeFileReader }) => void) | null = null;
  onloadend: ((event: { target: NodeFileReader }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  result: ArrayBuffer | string | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
  readAsDataURL(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
}
const globalWithReader = globalThis as { FileReader?: unknown };
if (!globalWithReader.FileReader) globalWithReader.FileReader = NodeFileReader;

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/* ── EL MURO CONOCIDO ─────────────────────────────────────────────────────
   3.5 m de largo, 2.4 m de alto, 0.25 m de grueso. En metros reales, que es
   lo que glTF promete.                                                     */
const WALL_LENGTH_MM = 3_500;
const WALL_HEIGHT_MM = 2_400;
const WALL_THICKNESS_MM = 250;

const EXPECTED_M = {
  length: WALL_LENGTH_MM / 1000,
  height: WALL_HEIGHT_MM / 1000,
  thickness: WALL_THICKNESS_MM / 1000,
};

function document(): CadDocument {
  const wall: CadEntity = {
    id: "muro",
    type: "wall",
    start: { x: 0, y: 0, z: 0 },
    end: { x: WALL_LENGTH_MM, y: 0, z: 0 },
    thickness: WALL_THICKNESS_MM,
    height: WALL_HEIGHT_MM,
    layer: "0",
    material: "brick",
  } as unknown as CadEntity;
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#94a3b8", visible: true, locked: false }],
    entities: [wall],
    history: [],
    modelSpace: { entityIds: ["muro"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument;
}

/** Lee el GLB y devuelve la caja envolvente de lo que hay dentro. */
async function boundsOf(blob: Blob): Promise<THREE.Vector3> {
  const buffer = await blob.arrayBuffer();
  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
    new GLTFLoader().parse(buffer, "", (result) => resolve(result as never), reject);
  });
  const box = new THREE.Box3().setFromObject(gltf.scene);
  return box.getSize(new THREE.Vector3());
}

async function main(): Promise<void> {
  /*
   * LA ESCENA, COMO LA CONSTRUYE EL EDITOR.
   *
   * `Layout3DEditor` calcula `s = 30 / max(W, H)` sobre la huella del predio y
   * se la pasa a los anfitriones COMO viewport (`sceneViewport = () => ({
   * scale: s, … })`, línea 6153). Es decir: los anfitriones aplican `s` ellos
   * mismos y el grupo NO se vuelve a escalar. Reproducirlo mal —dando a los
   * anfitriones un viewport distinto y escalando además el grupo— aplica la
   * escala DOS VECES, que es exactamente el error que cometió la primera
   * versión de este spec y que el propio spec detectó midiendo 0.035 donde
   * esperaba 3.5.
   */
  const footprintW = WALL_LENGTH_MM;
  const footprintH = WALL_HEIGHT_MM;
  const cameraFit = 30 / Math.max(footprintW, footprintH);

  const hosts = new CadNativeMassHosts(() => ({
    scale: cameraFit,
    width: footprintW,
    height: footprintH,
  }));
  hosts.sync(document(), new Set());
  ok(
    hosts.invalidGeometry().wallIds.length === 0,
    "el muro produce volumen válido en el mismo anfitrión que usa el editor",
  );

  // La geometría de la escena está en unidades de CÁMARA: el muro de 3.5 m
  // ocupa 30 unidades, quepa el predio lo que quepa. Eso es correcto para el
  // visor y mentiroso para un archivo que promete metros.
  const inScene = await boundsOf(
    await serializeCadGlbBlob([hosts.group], { exportScale: 1 }),
  );
  ok(
    Math.abs(inScene.x - 30) < 0.01,
    `sin corregir, el muro sale midiendo ${inScene.x.toFixed(4)} unidades — la escala de cámara, no metros`,
  );
  ok(
    Math.abs(inScene.x - EXPECTED_M.length) > EXPECTED_M.length,
    "que es el defecto que la campaña de paridad cerró: un GLB cuyo metro no medía un metro",
  );

  /* ── CORREGIDO: el muro mide lo que mide ───────────────────────────────── */

  // La misma cuenta del editor (línea 12806): metros por unidad de dibujo
  // dividido por la escala de cámara.
  const exportScale = unitToMeters(1, "mm") / cameraFit;
  const corrected = await boundsOf(
    await serializeCadGlbBlob([hosts.group], { exportScale }),
  );

  // Tolerancia de 1 mm sobre metros: el GLB guarda posiciones en float32, cuyo
  // ulp a magnitud 3.5 es ~2.4e-7 m. Un milímetro es holgadísimo frente a eso
  // y muy estrecho frente a cualquier escala mal aplicada, que se equivoca por
  // órdenes de magnitud.
  const TOL_M = 0.001;

  ok(
    Math.abs(corrected.x - EXPECTED_M.length) < TOL_M,
    `el muro mide ${EXPECTED_M.length} m de largo en el archivo (leído ${corrected.x.toFixed(6)})`,
  );
  // La escena es Y-ARRIBA: el alto del muro va en Y y su grueso en Z. Se
  // comprueban los TRES ejes a propósito — una escala aplicada sólo al plano
  // dejaría la altura mal y un archivo así se abre en Blender pareciendo
  // correcto hasta que alguien mide una puerta.
  ok(
    Math.abs(corrected.y - EXPECTED_M.height) < TOL_M,
    `y ${EXPECTED_M.height} m de alto (leído ${corrected.y.toFixed(6)})`,
  );
  ok(
    Math.abs(corrected.z - EXPECTED_M.thickness) < TOL_M,
    `y ${EXPECTED_M.thickness} m de grueso (leído ${corrected.z.toFixed(6)})`,
  );

  /* ── LA PROPIEDAD QUE DE VERDAD IMPORTA ────────────────────────────────
     La escala NO puede depender del tamaño del predio. El MISMO muro dentro
     de un predio diez veces mayor cambia la `s` de cámara por completo, y aun
     así tiene que seguir midiendo 3.5 m en el archivo.                      */

  const bigFit = 30 / (Math.max(footprintW, footprintH) * 10);
  const bigHosts = new CadNativeMassHosts(() => ({
    scale: bigFit,
    width: footprintW * 10,
    height: footprintH * 10,
  }));
  bigHosts.sync(document(), new Set());
  const inBigSite = await boundsOf(
    await serializeCadGlbBlob([bigHosts.group], {
      exportScale: unitToMeters(1, "mm") / bigFit,
    }),
  );
  ok(
    Math.abs(inBigSite.x - EXPECTED_M.length) < TOL_M,
    `el MISMO muro en un predio diez veces mayor sigue midiendo ${EXPECTED_M.length} m (leído ${inBigSite.x.toFixed(6)})`,
  );
  ok(
    Math.abs(inBigSite.x - corrected.x) < TOL_M,
    "y coincide con la medida del predio pequeño: la escala ya no depende del tamaño del predio, que es la afirmación entera",
  );

  console.log(
    `verificación 3.3 (GLB a escala 1:1): ${checks} comprobaciones — muro de ${EXPECTED_M.length} m medido en el archivo exportado`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
