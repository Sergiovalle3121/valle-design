/**
 * Ida y vuelta completa: bytes de archivo → `CadDocument` con un `solid3d`
 * cuyo cuerpo cierra y mide lo que debe — para los cuatro formatos.
 *
 * OBJ y STL se prueban con un cubo de winding VERIFICADO a mano (las doce
 * normales salientes se comprobaron por producto cruzado antes de escribir
 * este archivo; ver el razonamiento en el historial de la campaña). glTF se
 * prueba exportando una caja real de three con `GLTFExporter` — el mismo
 * camino que ya usa `glb-export.spec.ts` — y releyéndola con el lector nuevo,
 * así que el fixture no depende de que yo haya escrito bien el binario a
 * mano. COLLADA se prueba con un tetraedro (el sólido cerrado más pequeño
 * posible) escrito directamente en XML.
 *
 * `ColladaLoader` usa `DOMParser`, que Node no trae: el polyfill de abajo es
 * la MISMA idea que el de `FileReader` en `glb-export.spec.ts` — suficiente
 * para el subconjunto de la API que `ColladaParser.js` de three realmente usa
 * (`childNodes`, `children`, `getAttribute`, `hasAttribute`,
 * `getElementsByTagName`, `nodeName`, `nodeType`, `textContent`), no un DOM
 * completo.
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import { planarBodyVolume, bodyIsClosed } from "../../brep";
import { solid3dBody } from "../solid3d-build";
import type { CadSolid3dEntity } from "../cad-entities-v5";
import { importMeshDocument } from "./mesh-document-import";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// ---------------------------------------------------------------------------
// Cubo unitario [0,1]³ con las doce normales salientes verificadas por
// producto cruzado (ver cabecera del archivo).
// ---------------------------------------------------------------------------
const CUBE_VERTICES: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
const CUBE_TRIANGLES: [number, number, number][] = [
  [0, 3, 2], [0, 2, 1],
  [4, 5, 6], [4, 6, 7],
  [0, 1, 5], [0, 5, 4],
  [3, 7, 6], [3, 6, 2],
  [0, 4, 7], [0, 7, 3],
  [1, 6, 5], [1, 2, 6],
];

function buildCubeObjText(): string {
  const lines = ["o Cubo"];
  for (const [x, y, z] of CUBE_VERTICES) lines.push(`v ${x} ${y} ${z}`);
  for (const [a, b, c] of CUBE_TRIANGLES) lines.push(`f ${a + 1} ${b + 1} ${c + 1}`);
  return lines.join("\n");
}

function buildBinaryStlCube(): Uint8Array {
  const triangleCount = CUBE_TRIANGLES.length;
  const buffer = new ArrayBuffer(80 + 4 + triangleCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangleCount, true);
  let offset = 84;
  for (const [a, b, c] of CUBE_TRIANGLES) {
    offset += 12; // normal: se recalcula al coser, se deja en cero.
    for (const index of [a, b, c]) {
      const [x, y, z] = CUBE_VERTICES[index];
      view.setFloat32(offset, x, true);
      view.setFloat32(offset + 4, y, true);
      view.setFloat32(offset + 8, z, true);
      offset += 12;
    }
    offset += 2; // "attribute byte count"
  }
  return new Uint8Array(buffer);
}

// Tetraedro A(0,0,0) B(1,0,0) C(0,1,0) D(0,0,1), volumen 1/6, winding
// verificado por producto cruzado igual que el cubo.
const TETRA_DAE = `<?xml version="1.0" encoding="UTF-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset>
  <library_geometries>
    <geometry id="tetra-mesh" name="tetra">
      <mesh>
        <source id="tetra-positions">
          <float_array id="tetra-positions-array" count="12">0 0 0 1 0 0 0 1 0 0 0 1</float_array>
          <technique_common>
            <accessor source="#tetra-positions-array" count="4" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="tetra-vertices"><input semantic="POSITION" source="#tetra-positions"/></vertices>
        <triangles count="4">
          <input semantic="VERTEX" source="#tetra-vertices" offset="0"/>
          <p>0 2 1 0 1 3 0 3 2 1 2 3</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      <node id="tetra-node" name="tetra"><instance_geometry url="#tetra-mesh"/></node>
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>`;

// ---------------------------------------------------------------------------
// Polyfills de Node — sólo para este spec, tres nunca los ve en producción
// (el navegador y el worker traen ambas API nativas).
// ---------------------------------------------------------------------------
class NodeFileReader {
  onload: ((event: { target: NodeFileReader }) => void) | null = null;
  onloadend: ((event: { target: NodeFileReader }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  result: ArrayBuffer | string | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }).catch((error) => this.onerror?.(error));
  }
  readAsDataURL(blob: Blob): void {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }).catch((error) => this.onerror?.(error));
  }
}
(globalThis as { FileReader?: unknown }).FileReader ??= NodeFileReader;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
class XmlNode {
  nodeType: number;
  nodeName: string;
  childNodes: XmlNode[] = [];
  private attrs = new Map<string, string>();
  text = "";
  constructor(nodeType: number, nodeName: string) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
  }
  get children(): XmlNode[] {
    return this.childNodes.filter((node) => node.nodeType === ELEMENT_NODE);
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.has(name) ? (this.attrs.get(name) as string) : null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  get textContent(): string {
    if (this.nodeType === TEXT_NODE) return this.text;
    return this.childNodes.map((node) => node.textContent).join("");
  }
  getElementsByTagName(name: string): XmlNode[] {
    const out: XmlNode[] = [];
    const visit = (node: XmlNode) => {
      for (const child of node.childNodes) {
        if (child.nodeType === ELEMENT_NODE) {
          if (child.nodeName === name) out.push(child);
          visit(child);
        }
      }
    };
    visit(this);
    return out;
  }
}
function decodeXmlEntities(raw: string): string {
  return raw.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function parseXmlDocument(source: string): XmlNode {
  const text = source.replace(/<\?xml[^?]*\?>/, "");
  const len = text.length;
  let i = 0;
  function parseElement(): XmlNode {
    i += 1; // '<'
    const nameStart = i;
    while (i < len && !/[\s/>]/.test(text[i])) i += 1;
    const element = new XmlNode(ELEMENT_NODE, text.slice(nameStart, i));
    for (;;) {
      while (i < len && /\s/.test(text[i])) i += 1;
      if (text[i] === "/" || text[i] === ">") break;
      const attrNameStart = i;
      while (i < len && text[i] !== "=" && !/\s/.test(text[i])) i += 1;
      const attrName = text.slice(attrNameStart, i);
      while (i < len && /\s/.test(text[i])) i += 1;
      i += 1; // '='
      while (i < len && /\s/.test(text[i])) i += 1;
      const quote = text[i];
      i += 1;
      const valueStart = i;
      while (i < len && text[i] !== quote) i += 1;
      element.setAttribute(attrName, decodeXmlEntities(text.slice(valueStart, i)));
      i += 1; // closing quote
    }
    if (text[i] === "/") {
      i += 2;
      return element;
    }
    i += 1; // '>'
    for (;;) {
      if (text.startsWith("</", i)) {
        i = text.indexOf(">", i) + 1;
        break;
      }
      if (text.startsWith("<!--", i)) {
        i = text.indexOf("-->", i) + 3;
        continue;
      }
      if (text[i] === "<") {
        element.childNodes.push(parseElement());
      } else {
        const nextTag = text.indexOf("<", i);
        const raw = text.slice(i, nextTag === -1 ? len : nextTag);
        i = nextTag === -1 ? len : nextTag;
        if (raw.trim().length > 0) {
          const textNode = new XmlNode(TEXT_NODE, "#text");
          textNode.text = decodeXmlEntities(raw);
          element.childNodes.push(textNode);
        }
      }
    }
    return element;
  }
  while (i < len && /\s/.test(text[i])) i += 1;
  const root = parseElement();
  const doc = new XmlNode(9, "#document");
  doc.childNodes.push(root);
  return doc;
}
class NodeDOMParser {
  parseFromString(text: string): XmlNode {
    return parseXmlDocument(text);
  }
}
(globalThis as { DOMParser?: unknown }).DOMParser ??= NodeDOMParser;

function volumeOf(entity: CadSolid3dEntity): number {
  return planarBodyVolume(solid3dBody(entity));
}

async function main(): Promise<void> {
  // --- OBJ: cubo unitario -> 1 mm³ (sin conversión: OBJ no declara unidad) ---
  {
    const bytes = new TextEncoder().encode(buildCubeObjText());
    const report = await importMeshDocument("cubo.obj", bytes, "obj");
    ok(report.componentsImported === 1 && report.componentsFound === 1, "OBJ: 1 de 1 componentes");
    const entity = report.document.entities[0] as CadSolid3dEntity;
    ok(entity.type === "solid3d", "OBJ: produce un solid3d");
    const body = solid3dBody(entity);
    ok(bodyIsClosed(body), "OBJ: cuerpo cerrado");
    assert.ok(Math.abs(volumeOf(entity) - 1) < 1e-6, `OBJ: volumen 1, salió ${volumeOf(entity)}`);
    checks += 1;
    ok(
      report.warnings.some((w) => w.code === "mesh_unit_unknown"),
      "OBJ: declara la ambigüedad de unidad",
    );
  }

  // --- STL binario: mismo cubo, mismo resultado ---
  {
    const report = await importMeshDocument("cubo.stl", buildBinaryStlCube(), "stl");
    const entity = report.document.entities[0] as CadSolid3dEntity;
    assert.ok(Math.abs(volumeOf(entity) - 1) < 1e-6, `STL: volumen 1, salió ${volumeOf(entity)}`);
    checks += 1;
    ok(bodyIsClosed(solid3dBody(entity)), "STL: cuerpo cerrado");
  }

  // --- glTF: caja real de three, exportada con GLTFExporter y releída ------
  {
    const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4), new THREE.MeshStandardMaterial());
    mesh.name = "Caja";
    const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
      new GLTFExporter().parse(mesh, (result) => resolve(result as ArrayBuffer), reject, { binary: true });
    });
    const report = await importMeshDocument("caja.glb", new Uint8Array(glb), "gltf");
    const entity = report.document.entities[0] as CadSolid3dEntity;
    ok(bodyIsClosed(solid3dBody(entity)), "glTF: cuerpo cerrado");
    // 2×3×4 m³ declarados por glTF, convertidos a mm³ (×1000 por eje).
    const expected = 2000 * 3000 * 4000;
    assert.ok(Math.abs(volumeOf(entity) - expected) / expected < 1e-4, `glTF: volumen ${expected} mm³, salió ${volumeOf(entity)}`);
    checks += 1;
  }

  // --- COLLADA: tetraedro, volumen 1/6 m³ = (1/6)·1000³ mm³ ---------------
  {
    const report = await importMeshDocument("tetra.dae", new TextEncoder().encode(TETRA_DAE), "collada");
    const entity = report.document.entities[0] as CadSolid3dEntity;
    ok(bodyIsClosed(solid3dBody(entity)), "COLLADA: cuerpo cerrado");
    const expected = (1 / 6) * 1000 ** 3;
    assert.ok(Math.abs(volumeOf(entity) - expected) / expected < 1e-4, `COLLADA: volumen ${expected} mm³, salió ${volumeOf(entity)}`);
    checks += 1;
  }

  // --- .skp: se rechaza aunque venga etiquetado con otra extensión --------
  {
    const skpBytes = new TextEncoder().encode("SketchUp Model relleno binario que sigue...");
    await assert.rejects(() => importMeshDocument("disfrazado.stl", skpBytes, "stl"), /SketchUp/);
    checks += 1;
  }

  // --- Importación parcial HONESTA: un componente cierra, otro no ---------
  {
    const openTriangleObj = [
      "o Cubo",
      ...CUBE_VERTICES.map(([x, y, z]) => `v ${x} ${y} ${z}`),
      ...CUBE_TRIANGLES.map(([a, b, c]) => `f ${a + 1} ${b + 1} ${c + 1}`),
      "o Triangulo_abierto",
      "v 10 0 0",
      "v 11 0 0",
      "v 10 1 0",
      `f ${CUBE_VERTICES.length + 1} ${CUBE_VERTICES.length + 2} ${CUBE_VERTICES.length + 3}`,
    ].join("\n");
    const report = await importMeshDocument("mixto.obj", new TextEncoder().encode(openTriangleObj), "obj");
    ok(report.componentsFound === 2 && report.componentsImported === 1, "mixto: 1 de 2 componentes importados");
    ok(
      report.warnings.some((w) => w.code === "mesh_component_rejected") && report.warnings.some((w) => w.code === "mesh_partial_import"),
      "mixto: el manifiesto declara el componente rechazado y el conteo parcial",
    );
  }

  console.log(`✔ mesh-document-import: ${checks} aserciones verdes`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
