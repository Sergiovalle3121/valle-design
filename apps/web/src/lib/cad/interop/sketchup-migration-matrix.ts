/**
 * Mide la migración SketchUp→Valle EJECUTANDO el importador real, no
 * escribiendo números a mano. Alimenta
 * `docs/cad/evidence/sketchup-migration-matrix.json` vía
 * `scripts/cad/build-sketchup-migration-matrix.mjs`, con el mismo patrón que
 * ya usa `dxf-external-corpus-matrix.ts`: una función que MIDE, un script que
 * la ejecuta con `tsx` y vuelca el JSON, y una spec que la puede volver a
 * calcular para que la matriz no envejezca en silencio.
 *
 * LA LIMITACIÓN, DICHA AQUÍ TAMBIÉN Y NO SÓLO EN EL JSON: los cinco casos son
 * corpus SINTÉTICO de Valle — cajas, un taladro pasante, un tetraedro — con
 * winding verificado a mano por producto cruzado (ver el razonamiento en
 * `mesh-document-import.spec.ts`), no modelos descargados de la galería
 * pública de SketchUp. Esta campaña no consiguió material de terceros con
 * procedencia y licencia verificables dentro de su presupuesto: decirlo aquí
 * es la diferencia entre una promoción de capacidad y una que retiene su
 * punto por evidencia fabricada por el propio proyecto, tal como exige la
 * regla de cierre de la campaña de cimientos.
 */
import * as THREE from "three";
import { bodyIsClosed, eulerCounts, planarBodyVolume, type BrepBody } from "../../brep";
import { solid3dBody } from "../solid3d-build";
import type { CadSolid3dEntity } from "../cad-entities-v5";
import { importMeshDocument } from "./mesh-document-import";
import type { MeshImportFormat } from "./mesh-import-types";

const CUBE_VERTICES: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
/** Doce triángulos, normales salientes verificadas por producto cruzado. */
const CUBE_TRIANGLES: [number, number, number][] = [
  [0, 3, 2], [0, 2, 1],
  [4, 5, 6], [4, 6, 7],
  [0, 1, 5], [0, 5, 4],
  [3, 7, 6], [3, 6, 2],
  [0, 4, 7], [0, 7, 3],
  [1, 6, 5], [1, 2, 6],
];

function scaledCube(size: number, offset: [number, number, number] = [0, 0, 0]): { objText: string } {
  const lines = ["o CajaEscalada"];
  for (const [x, y, z] of CUBE_VERTICES) {
    lines.push(`v ${x * size + offset[0]} ${y * size + offset[1]} ${z * size + offset[2]}`);
  }
  for (const [a, b, c] of CUBE_TRIANGLES) lines.push(`f ${a + 1} ${b + 1} ${c + 1}`);
  return { objText: lines.join("\n") };
}

function binaryStlCube(size: number): Uint8Array {
  const buffer = new ArrayBuffer(80 + 4 + CUBE_TRIANGLES.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, CUBE_TRIANGLES.length, true);
  let offset = 84;
  for (const [a, b, c] of CUBE_TRIANGLES) {
    offset += 12;
    for (const index of [a, b, c]) {
      const [x, y, z] = CUBE_VERTICES[index];
      view.setFloat32(offset, x * size, true);
      view.setFloat32(offset + 4, y * size, true);
      view.setFloat32(offset + 8, z * size, true);
      offset += 12;
    }
    offset += 2;
  }
  return new Uint8Array(buffer);
}

/** Caja de `size`³ con un taladro pasante cuadrado de `hole`² en el centro de las tapas. */
function boxWithHoleObj(size: number, hole: number): string {
  const s = size;
  const h0 = (size - hole) / 2;
  const h1 = h0 + hole;
  const v: [number, number, number][] = [
    [0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0],
    [0, 0, s], [s, 0, s], [s, s, s], [0, s, s],
    [h0, h0, 0], [h1, h0, 0], [h1, h1, 0], [h0, h1, 0],
    [h0, h0, s], [h1, h0, s], [h1, h1, s], [h0, h1, s],
  ];
  // Tapa inferior con agujero (triangulada en abanico contra el borde del
  // taladro) + tapa superior + paredes exteriores e interiores. Winding
  // saliente verificado igual que el cubo simple.
  // Derivadas con el sólido del revés (volumen con signo negativo,
  // comprobado ejecutando el cosedor real): la corrección es invertir el
  // sentido de las doce... treinta y dos, en este caso... TRIÁNGULOS enteros,
  // no volver a derivar cada uno a mano.
  const facesInward: [number, number, number][] = [
    [0, 1, 9], [0, 9, 8], [1, 2, 10], [1, 10, 9], [2, 3, 11], [2, 11, 10], [3, 0, 8], [3, 8, 11],
    [4, 12, 13], [4, 13, 5], [5, 13, 14], [5, 14, 6], [6, 14, 15], [6, 15, 7], [7, 15, 12], [7, 12, 4],
    [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0],
    [8, 9, 13], [8, 13, 12], [9, 10, 14], [9, 14, 13], [10, 11, 15], [10, 15, 14], [11, 8, 12], [11, 12, 15],
  ];
  const faces: [number, number, number][] = facesInward.map(([a, b, c]) => [a, c, b]);
  const lines = ["o CajaConTaladro", ...v.map(([x, y, z]) => `v ${x} ${y} ${z}`), ...faces.map(([a, b, c]) => `f ${a + 1} ${b + 1} ${c + 1}`)];
  return lines.join("\n");
}

const TETRA_DAE = `<?xml version="1.0" encoding="UTF-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset>
  <library_geometries>
    <geometry id="tetra-mesh" name="tetra"><mesh>
      <source id="tetra-positions">
        <float_array id="tetra-positions-array" count="12">0 0 0 1 0 0 0 1 0 0 0 1</float_array>
        <technique_common><accessor source="#tetra-positions-array" count="4" stride="3">
          <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
        </accessor></technique_common>
      </source>
      <vertices id="tetra-vertices"><input semantic="POSITION" source="#tetra-positions"/></vertices>
      <triangles count="4"><input semantic="VERTEX" source="#tetra-vertices" offset="0"/><p>0 2 1 0 1 3 0 3 2 1 2 3</p></triangles>
    </mesh></geometry>
  </library_geometries>
  <library_visual_scenes><visual_scene id="Scene" name="Scene">
    <node id="tetra-node" name="tetra"><instance_geometry url="#tetra-mesh"/></node>
  </visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>`;

/**
 * Escena con TRES componentes nombrados — el caso que evidencia
 * "componentes preservados": cada `Mesh` con su nombre se vuelve un `solid3d`
 * del documento. Exportada como GLB REAL con `GLTFExporter` y releída con el
 * lector propio, no construida a mano en el formato binario.
 */
async function multiComponentGlb(): Promise<Uint8Array> {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  box.name = "CajaGrande";
  box.position.set(-3, 0, 0);
  const smallBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  smallBox.name = "CajaChica";
  smallBox.position.set(3, 0, 0);
  const tetra = new THREE.Mesh(new THREE.TetrahedronGeometry(1));
  tetra.name = "Tetraedro";
  group.add(box, smallBox, tetra);

  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
    new GLTFExporter().parse(group, (result) => resolve(result as ArrayBuffer), reject, { binary: true });
  });
  return new Uint8Array(glb);
}

/** Volumen exacto de un tetraedro regular de `THREE.TetrahedronGeometry(radius)`: 8·radius³/(9·√3). */
function regularTetrahedronVolume(radius: number): number {
  return (8 * radius ** 3) / (9 * Math.sqrt(3));
}

interface MigrationCase {
  id: string;
  proposito: string;
  formato: MeshImportFormat;
  archivo: string;
  bytes: () => Uint8Array | Promise<Uint8Array>;
  carasEsperadas: number;
  volumenEsperado: number;
  componentesEsperados: number;
}

const CASES: MigrationCase[] = [
  {
    id: "caja-simple-obj",
    proposito: "El caso base: una caja triangulada por cualquier exportador OBJ (dos triángulos por cara).",
    formato: "obj",
    archivo: "caja-simple.obj",
    bytes: () => new TextEncoder().encode(scaledCube(2).objText),
    carasEsperadas: 6,
    volumenEsperado: 2 ** 3,
    componentesEsperados: 1,
  },
  {
    id: "caja-taladro-obj",
    proposito: "Losa con un taladro pasante: el caso que exige detectar el LAZO INTERIOR en la tapa y el fondo.",
    formato: "obj",
    archivo: "caja-taladro.obj",
    bytes: () => new TextEncoder().encode(boxWithHoleObj(10, 4)),
    carasEsperadas: 10,
    volumenEsperado: 10 ** 3 - 4 * 4 * 10,
    componentesEsperados: 1,
  },
  {
    id: "cubo-stl-binario",
    proposito: "El mismo cubo, en STL binario: sin nombre de objeto, un componente por archivo.",
    formato: "stl",
    archivo: "cubo.stl",
    bytes: () => binaryStlCube(3),
    carasEsperadas: 6,
    volumenEsperado: 3 ** 3,
    componentesEsperados: 1,
  },
  {
    id: "escena-multi-componente-gltf",
    proposito: "Tres componentes nombrados en un solo GLB: el caso que evidencia COMPONENTES PRESERVADOS, no sólo caras y volumen de una pieza suelta.",
    formato: "gltf",
    archivo: "escena.glb",
    bytes: multiComponentGlb,
    carasEsperadas: 6 + 6 + 4,
    volumenEsperado: (2 * 2 * 2 + 1 * 1 * 1 + regularTetrahedronVolume(1)) * 1000 ** 3,
    componentesEsperados: 3,
  },
  {
    id: "tetraedro-collada",
    proposito: "El sólido cerrado más pequeño posible, en COLLADA — declara metro y se convierte a mm.",
    formato: "collada",
    archivo: "tetraedro.dae",
    bytes: () => new TextEncoder().encode(TETRA_DAE),
    carasEsperadas: 4,
    volumenEsperado: (1 / 6) * 1000 ** 3, // m³ → mm³
    componentesEsperados: 1,
  },
];

export interface SketchupMigrationCaseResult {
  id: string;
  archivo: string;
  proposito: string;
  formato: MeshImportFormat;
  caras: { esperadas: number; cosidas: number; coinciden: boolean };
  volumen: { esperado: number; calculado: number; errorRelativo: number; coincide: boolean };
  componentes: { esperados: number; encontrados: number; preservados: number; todosPreservados: boolean };
  cuerpoCerrado: boolean;
  generoEuler: number;
}

export interface SketchupMigrationMatrix {
  generadoPor: string;
  corpusSintetico: true;
  limitacion: string;
  criterios: Record<string, string>;
  resumen: { casos: number; carasCoincidieron: number; volumenesCoincidieron: number; componentesPreservados: number; cuerposCerrados: number };
  casos: SketchupMigrationCaseResult[];
}

async function measureCase(testCase: MigrationCase): Promise<SketchupMigrationCaseResult> {
  const report = await importMeshDocument(testCase.archivo, await testCase.bytes(), testCase.formato);
  const entities = report.document.entities.filter((entity) => entity.type === "solid3d") as CadSolid3dEntity[];
  const bodies: BrepBody[] = entities.map((entity) => solid3dBody(entity));
  const totalVolume = bodies.reduce((sum, body) => sum + planarBodyVolume(body), 0);
  const totalFaces = bodies.reduce((sum, body) => sum + body.faces.length, 0);
  const allClosed = bodies.every((body) => bodyIsClosed(body));
  const errorRelativo = Math.abs(totalVolume - testCase.volumenEsperado) / Math.max(Math.abs(testCase.volumenEsperado), 1e-9);
  return {
    id: testCase.id,
    archivo: testCase.archivo,
    proposito: testCase.proposito,
    formato: testCase.formato,
    caras: { esperadas: testCase.carasEsperadas, cosidas: totalFaces, coinciden: totalFaces === testCase.carasEsperadas },
    volumen: { esperado: testCase.volumenEsperado, calculado: totalVolume, errorRelativo, coincide: errorRelativo < 1e-6 },
    componentes: {
      esperados: testCase.componentesEsperados,
      encontrados: report.componentsFound,
      preservados: report.componentsImported,
      todosPreservados: report.componentsImported === testCase.componentesEsperados && report.componentsFound === testCase.componentesEsperados,
    },
    cuerpoCerrado: allClosed,
    generoEuler: bodies.length === 1 ? eulerCounts(bodies[0]).genus : NaN,
  };
}

export async function buildSketchupMigrationMatrix(): Promise<SketchupMigrationMatrix> {
  const casos = await Promise.all(CASES.map(measureCase));
  return {
    generadoPor: "node scripts/cad/build-sketchup-migration-matrix.mjs",
    corpusSintetico: true,
    limitacion:
      "CORPUS SINTÉTICO DE VALLE, no material de la galería pública de SketchUp. Esta campaña " +
      "(interop de importación de modelos 3D) no consiguió, dentro de su presupuesto, modelos de " +
      "terceros PRODUCIDOS POR SKETCHUP con procedencia y licencia registrables al estilo de " +
      "SOURCE_REGISTER.json. Los casos de abajo son cajas, un taladro pasante, un tetraedro y una " +
      "escena de tres componentes, generados por este mismo repositorio, con winding de malla " +
      "verificado a mano por producto " +
      "cruzado antes de escribirlos — no son evidencia de compatibilidad con archivos reales de " +
      "SketchUp, sólo de que el cosedor hace lo que promete sobre una malla bien formada. Por la regla " +
      "de la campaña de cimientos, esta fila retiene 1 punto hasta tener oráculo externo o material de " +
      "terceros: decirlo aquí es preferible a que se descubra después.",
    criterios: {
      caras: "Caras del sólido cosido contra las caras que la geometría original declara (una cara por plano, con sus agujeros) — no contra el número de triángulos de entrada.",
      volumen: "Volumen por integración sobre caras planas (`planarBodyVolume`) contra el volumen exacto calculado con la fórmula del sólido original. Coincide si el error relativo es menor a 1e-6.",
      componentes: "Objetos/mallas del archivo de origen contra sólidos que llegaron al documento canónico. Preservados = encontrados cuando ningún componente se rechazó por tamaño o por no cerrar.",
    },
    resumen: {
      casos: casos.length,
      carasCoincidieron: casos.filter((c) => c.caras.coinciden).length,
      volumenesCoincidieron: casos.filter((c) => c.volumen.coincide).length,
      componentesPreservados: casos.filter((c) => c.componentes.todosPreservados).length,
      cuerposCerrados: casos.filter((c) => c.cuerpoCerrado).length,
    },
    casos,
  };
}
