/**
 * Verlo: teselado al visor, estilos visuales y órbita.
 *
 * Tres cosas que sólo se pueden comprobar aquí, porque son la frontera entre el
 * kernel (que ya tiene sus specs) y el visor (que no corre en Node con WebGL):
 *
 *  1. **La permutación de ejes.** El editor pone el dibujo sobre XZ y usa la Y de
 *     THREE como altura; un sólido tiene z REAL. Confundir los dos ejes deja la
 *     pieza tumbada en el suelo con su altura apuntando al norte, y eso NO se ve
 *     en una captura de planta: se ve midiendo la caja envolvente de la malla.
 *  2. **Los cuatro estilos son cuatro.** El error clásico al implementar estilos
 *     visuales es que «Oculto» acabe siendo un alias de «Alámbrico», porque los
 *     dos «no dibujan caras». Se distinguen por si OCULTAN, y aquí se cuenta.
 *  3. **La órbita no revienta en el polo.** Con la elevación en ±90° la base de
 *     la matriz de vista se degenera y THREE produce `NaN`: la escena desaparece
 *     al arrastrar hasta arriba del todo. El tope se comprueba con un ancla.
 */
import * as THREE from "three";
import { check, checkClose, report } from "../brep/spec-support";
import type { CadSolid3dEntity } from "./cad-entities-v5";
import { buildCadSolidGeometry, buildCadSolidObject, disposeCadSolidObject } from "./solid3d-three";
import { solid3dMesh } from "./solid3d-build";
import {
  CAD_ORBIT_ELEVATION_LIMIT,
  CAD_VISUAL_STYLES,
  cadVisualStyle,
  clampOrbitElevation,
  orbitCameraPosition,
  orbitStateFromPosition,
  orbitStep,
  resolveCadVisualStyle,
} from "./view/visual-styles";
import { CadViewController } from "./view/view-controller";

const viewport = { scale: 0.01, width: 1_000, height: 800, elevation: 0.11 };

/** Prisma 200 × 100 de 50 de alto, apoyado en el origen del dibujo. */
const block: CadSolid3dEntity = {
  id: "bloque",
  type: "solid3d",
  root: "perfil",
  nodes: [
    {
      id: "perfil",
      op: "extrude",
      profile: {
        outer: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 100 },
          { x: 0, y: 100 },
        ],
      },
      height: 50,
    },
  ],
  layer: "0",
};

// ---------------------------------------------------------------------------
// 1. El teselado llega al formato del visor, con los ejes en su sitio
// ---------------------------------------------------------------------------
{
  const mesh = solid3dMesh(block);
  check("la malla trae posiciones", mesh.positions.length > 0);
  check("una normal por posición", mesh.normals.length === mesh.positions.length);
  check("los índices van de tres en tres", mesh.indices.length % 3 === 0);

  const geometry = buildCadSolidGeometry(block, viewport);
  const positions = geometry.getAttribute("position");
  check("la geometría de THREE tiene los mismos vértices", positions.count === mesh.positions.length / 3);

  const bounds = new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute);
  // ANCLA de la permutación de ejes. La altura del sólido (50 unidades de dibujo)
  // tiene que salir en la Y de ESCENA, escalada. Si se hubiera mapeado a Z, este
  // número aparecería en el eje equivocado y el de arriba valdría cero.
  checkClose("la altura del sólido va a la Y de escena", bounds.max.y - bounds.min.y, 50 * viewport.scale, 1e-9);
  checkClose("el ancho del dibujo va a la X de escena", bounds.max.x - bounds.min.x, 200 * viewport.scale, 1e-9);
  checkClose("y el fondo del dibujo a la Z de escena", bounds.max.z - bounds.min.z, 100 * viewport.scale, 1e-9);
  // El centro del dibujo es el origen de la escena: la pieza en (0,0) queda a
  // media huella hacia atrás y a la izquierda.
  checkClose("el origen del dibujo se centra en la huella", bounds.min.x, -(viewport.width / 2) * viewport.scale, 1e-9);
  checkClose("la base del sólido está a cota cero", bounds.min.y, 0, 1e-9);
  geometry.dispose();
}

// ---------------------------------------------------------------------------
// 2. Los cuatro estilos visuales son cuatro cosas distintas
// ---------------------------------------------------------------------------
{
  check("hay exactamente cuatro estilos", CAD_VISUAL_STYLES.length === 4);
  check("Alámbrico se resuelve por nombre", resolveCadVisualStyle("Alámbrico")?.id === "wireframe");
  check("y sin acentos también", resolveCadVisualStyle("alambrico")?.id === "wireframe");
  check("«Sombreado con aristas» se resuelve entero", resolveCadVisualStyle("SOMBREADO CON ARISTAS")?.id === "shaded-edges");
  // Un nombre desconocido devuelve `null` y NO cae al estilo por defecto: un
  // VSCURRENT mal tecleado que cambia de estilo en silencio es peor que uno que
  // dice que no entendió.
  check("lo desconocido devuelve null en vez de caer al defecto", resolveCadVisualStyle("cel-shading") === null);

  const counts = new Map<string, { faces: number; edges: number }>();
  for (const style of CAD_VISUAL_STYLES) {
    const group = buildCadSolidObject(block, viewport, { style: style.id });
    const faces = group.children.filter((child) => child.name.startsWith("cad-solid-faces")).length;
    const edges = group.children.filter((child) => child.name.startsWith("cad-solid-edges")).length;
    counts.set(style.id, { faces, edges });
    check(`${style.label}: el grupo declara su estilo`, group.userData.visualStyle === style.id);
    disposeCadSolidObject(group);
  }

  check("Alámbrico: sólo aristas", counts.get("wireframe")!.faces === 0 && counts.get("wireframe")!.edges === 1);
  // La diferencia REAL entre Alámbrico y Oculto: el segundo pinta caras que
  // tapan, aunque no se vean como caras. Sin esta distinción los dos estilos
  // serían el mismo, que es el fallo clásico.
  check("Oculto: aristas MÁS un ocultador", counts.get("hidden")!.faces === 1 && counts.get("hidden")!.edges === 1);
  check("Sombreado: sólo caras", counts.get("shaded")!.faces === 1 && counts.get("shaded")!.edges === 0);
  check(
    "Sombreado con aristas: las dos cosas",
    counts.get("shaded-edges")!.faces === 1 && counts.get("shaded-edges")!.edges === 1,
  );
  check("y el ocultador no se pinta del color del sólido", cadVisualStyle("hidden").faces === false);
}

// ---------------------------------------------------------------------------
// 3. Un sólido roto no tumba el visor
// ---------------------------------------------------------------------------
{
  const broken: CadSolid3dEntity = {
    ...block,
    id: "roto",
    nodes: [{ id: "u", op: "union", operands: ["a", "b"] }],
    root: "u",
  };
  const group = buildCadSolidObject(broken, viewport);
  check("un árbol roto devuelve un grupo vacío, no una excepción", group.children.length === 0);
  check("y lo declara", group.userData.invalid === true);
  disposeCadSolidObject(group);
}

// ---------------------------------------------------------------------------
// 4. Órbita: el azimut da la vuelta, la elevación se acota
// ---------------------------------------------------------------------------
{
  const start = { azimuthDeg: 350, elevationDeg: 30, distance: 100 };
  const wrapped = orbitStep(start, 20, 0);
  checkClose("girar 20° desde 350° da 10°, no 370°", wrapped.azimuthDeg, 10, 1e-9);
  checkClose("y la distancia no cambia: orbitar es girar, no acercarse", wrapped.distance, 100, 1e-9);

  const poled = orbitStep(start, 0, 200);
  // ANCLA. Sin el tope, la elevación llegaría a 230° y la cámara miraría a lo
  // largo de su propio `up`: la matriz de vista sale con NaN y la escena
  // DESAPARECE. El tope no es una aproximación de 90°, es su sustituto.
  checkClose("la elevación se detiene justo antes del polo", poled.elevationDeg, CAD_ORBIT_ELEVATION_LIMIT, 1e-9);
  checkClose("y por abajo también", orbitStep(start, 0, -400).elevationDeg, -CAD_ORBIT_ELEVATION_LIMIT, 1e-9);
  checkClose("un valor no finito no propaga NaN", clampOrbitElevation(Number.NaN), 0, 1e-9);

  // Ida y vuelta de la parametrización: posición → estado → posición.
  const target = { x: 10, y: 0, z: -5 };
  const position = orbitCameraPosition(target, { azimuthDeg: 42, elevationDeg: 20, distance: 250 });
  const recovered = orbitStateFromPosition(target, position);
  checkClose("el azimut se recupera", recovered.azimuthDeg, 42, 1e-9);
  checkClose("la elevación se recupera", recovered.elevationDeg, 20, 1e-9);
  checkClose("la distancia se recupera", recovered.distance, 250, 1e-9);
  // Ancla absoluta: con azimut 0 la cámara está en +Z respecto del objetivo, que
  // es la convención del mapeo de escena del editor.
  const front = orbitCameraPosition({ x: 0, y: 0, z: 0 }, { azimuthDeg: 0, elevationDeg: 0, distance: 100 });
  checkClose("azimut 0 pone la cámara en +Z", front.z, 100, 1e-9);
  checkClose("sin componente X", front.x, 0, 1e-9);
  checkClose("ni altura", front.y, 0, 1e-9);
}

// ---------------------------------------------------------------------------
// 5. 3DORBIT sobre el controlador de vista
// ---------------------------------------------------------------------------
{
  const controller = new CadViewController({ scale: 0.01, width: 1_000, height: 800 }, 1_200, 900);
  controller.perspective.position.set(0, 0, 300);
  const state = controller.orbitPerspective(90, 30);
  checkClose("el azimut avanza", state.azimuthDeg, 90, 1e-9);
  checkClose("la elevación avanza", state.elevationDeg, 30, 1e-9);
  checkClose("y la distancia se conserva", state.distance, 300, 1e-9);
  const position = controller.perspective.position;
  check(
    "la cámara queda en una posición finita",
    Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z),
  );
  checkClose("a la misma distancia del objetivo", position.length(), 300, 1e-6);

  // Cien pasos hacia arriba: el tope impide el polo y la matriz sigue sana. Sin
  // el tope, la matriz de vista tendría NaN mucho antes de la última vuelta.
  for (let step = 0; step < 100; step += 1) controller.orbitPerspective(7, 5);
  const elements = controller.perspective.matrixWorld.elements;
  check("tras cien pasos la matriz sigue sin NaN", elements.every(Number.isFinite));
  checkClose(
    "y la elevación se ha quedado en el tope",
    orbitStateFromPosition(controller.orbitTarget, controller.perspective.position).elevationDeg,
    CAD_ORBIT_ELEVATION_LIMIT,
    1e-6,
  );
}

report("solid3d: teselado al visor, estilos visuales y órbita", 35);
