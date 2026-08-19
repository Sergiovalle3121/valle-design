/**
 * Estilo Oculto: QUÉ aristas se ven y cuáles no, sobre sólidos concretos.
 *
 * La tabla de estilos visuales ya decía si un estilo dibuja caras, aristas o
 * las dos. Lo que no decía —y es lo único que distingue de verdad «Oculto» de
 * «Alámbrico» fuera de una GPU— es CUÁLES de esas aristas hay que dibujar. Aquí
 * se cuenta, con números, sobre tres cuerpos elegidos porque cada uno prueba
 * una cosa distinta:
 *
 *  · **Un cubo**, visto desde una esquina genérica: 3 caras de frente, 3 de
 *    espaldas, 9 aristas visibles y 3 ocultas. Los números son exactos y se
 *    pueden comprobar mirando un dado.
 *  · **Un cubo visto de frente**: 1 cara de frente, 4 de canto, 1 de espaldas.
 *    Las 4 aristas del fondo se ocultan; la silueta son las 4 del contorno.
 *  · **Una pieza en L**, que es CÓNCAVA: la clasificación por caras traseras no
 *    puede acertar, y el módulo lo declara en vez de fingirlo. Ésa es la
 *    aserción que impide que esto se venda como más de lo que es.
 */
import * as THREE from "three";
import { check, checkClose, report } from "../../brep/spec-support";
import { makeBox, booleanDifference, type BrepBody } from "../../brep";
import {
  CAD_VISUAL_STYLES,
  cadVisualStyle,
} from "./visual-styles";
import {
  cadBodyIsConvex,
  cadDrawingDirectionFromScene,
  cadSolidEdgeVisibility,
  cadVisibleEdgeSegments,
} from "./hidden-lines";
import type { CadSolid3dEntity } from "../cad-entities-v5";
import { buildCadSolidObject, buildCadSolidVisibleEdges, disposeCadSolidObject } from "../solid3d-three";

const viewport = { scale: 0.01, width: 1_000, height: 800, elevation: 0.11 };

/** Cubo de 100 con una esquina en el origen. Doce aristas, seis caras. */
const cube: BrepBody = makeBox({ min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } });

// ---------------------------------------------------------------------------
// 1. La tabla de estilos distingue OCULTAR de NO DIBUJAR
// ---------------------------------------------------------------------------
{
  check("siguen siendo cuatro estilos", CAD_VISUAL_STYLES.length === 4);
  // Alámbrico y Oculto comparten «no pinto caras» y se separan justo aquí: el
  // primero enseña las aristas de detrás, que es su definición.
  check("Alámbrico NO quita las aristas ocultas", cadVisualStyle("wireframe").removesHiddenEdges === false);
  check("Oculto sí las quita", cadVisualStyle("hidden").removesHiddenEdges === true);
  check("Sombreado no dibuja aristas, así que no hay nada que quitar", cadVisualStyle("shaded").edges === false);
  check("Sombreado con aristas también las quita", cadVisualStyle("shaded-edges").removesHiddenEdges === true);
  check("y Alámbrico sigue sin ocultar con caras", cadVisualStyle("wireframe").occludes === false);
}

// ---------------------------------------------------------------------------
// 2. El cubo desde una esquina: 9 visibles, 3 ocultas, 6 de silueta
// ---------------------------------------------------------------------------
{
  check("el cubo tiene doce aristas", cube.edges.length === 12);
  check("y seis caras", cube.faces.length === 6);
  check("y es convexo", cadBodyIsConvex(cube));

  // Mirando hacia la esquina (0,0,0) desde (+,+,+): las tres caras que dan al
  // observador son las de x=100, y=100, z=100.
  const corner = cadSolidEdgeVisibility(cube, {
    kind: "parallel",
    direction: { x: -1, y: -1, z: -1 },
  });
  check("la clasificación es EXACTA sobre un convexo", corner.exact);
  check("tres caras miran al observador", corner.frontFaces === 3);
  check("nueve aristas se ven", corner.visible.length === 9);
  check("y tres las tapa el propio cubo", corner.hidden.length === 3);
  check("visibles + ocultas son las doce", corner.visible.length + corner.hidden.length === 12);
  // La silueta de un cubo visto por la esquina es un hexágono: seis aristas.
  check("la silueta tiene seis aristas", corner.silhouette.length === 6);
  check("y todas las de silueta están entre las visibles", corner.silhouette.every((edge) => corner.visible.includes(edge)));

  // Las tres ocultas son exactamente las que concurren en el vértice del fondo.
  const hiddenPoints = corner.hidden.map((edge) => {
    const half = cube.edges[edge].a;
    const from = cube.vertices[cube.halfEdges[half].origin].point;
    const next = cube.halfEdges[half].next;
    const to = cube.vertices[cube.halfEdges[next].origin].point;
    return [from, to];
  });
  const touchesFarCorner = hiddenPoints.every(([from, to]) =>
    [from, to].some((point) => point.x === 0 && point.y === 0 && point.z === 0),
  );
  check("las tres ocultas concurren en el vértice del fondo", touchesFarCorner);

  // Y desde el lado OPUESTO se ocultan otras tres, no las mismas: la
  // clasificación depende de la vista, que es todo el punto.
  const opposite = cadSolidEdgeVisibility(cube, {
    kind: "parallel",
    direction: { x: 1, y: 1, z: 1 },
  });
  check("desde el lado opuesto también se ocultan tres", opposite.hidden.length === 3);
  check(
    "pero son OTRAS tres",
    opposite.hidden.every((edge) => !corner.hidden.includes(edge)),
  );
}

// ---------------------------------------------------------------------------
// 3. El cubo de frente: cuatro caras de canto y cuatro aristas al fondo
// ---------------------------------------------------------------------------
{
  const front = cadSolidEdgeVisibility(cube, {
    kind: "parallel",
    direction: { x: 0, y: 1, z: 0 },
  });
  // Mirando en +y, sólo la cara y=0 da al observador; la y=100 está de espaldas;
  // las otras cuatro quedan DE CANTO y no cuentan como de frente. De ahí que se
  // dibujen sólo las cuatro aristas del cuadrado que se ve: las cuatro de
  // profundidad se proyectan a un punto y las cuatro del fondo caen justo
  // encima de las de delante. Cuatro trazos, no doce, y el dibujo es el mismo.
  check("una sola cara mira al observador", front.frontFaces === 1);
  check("cuatro aristas se ven", front.visible.length === 4);
  check("y las otras ocho las tapa el cubo", front.hidden.length === 8);
  check("la silueta son esas mismas cuatro", front.silhouette.length === 4);
}

// ---------------------------------------------------------------------------
// 4. Perspectiva: el ojo, no una dirección constante
// ---------------------------------------------------------------------------
{
  // Un ojo MUY cerca de la cara superior ve esa cara y poco más; el mismo ojo
  // lejos y en la misma dirección clasifica igual que la proyección paralela.
  const close = cadSolidEdgeVisibility(cube, {
    kind: "perspective",
    eye: { x: 50, y: 50, z: 130 },
  });
  check("desde un ojo sobre la tapa, la clasificación es exacta", close.exact);
  check("y sólo la tapa mira al observador", close.frontFaces === 1);
  check("se ven las cuatro aristas de la tapa", close.visible.length === 4);
  check("y las otras ocho se ocultan", close.hidden.length === 8);

  const far = cadSolidEdgeVisibility(cube, {
    kind: "perspective",
    eye: { x: 50, y: 50, z: 100_000 },
  });
  const parallel = cadSolidEdgeVisibility(cube, {
    kind: "parallel",
    direction: { x: 0, y: 0, z: -1 },
  });
  check(
    "con el ojo muy lejos, perspectiva y paralela coinciden",
    far.visible.length === parallel.visible.length && far.hidden.length === parallel.hidden.length,
  );
}

// ---------------------------------------------------------------------------
// 5. Una pieza CÓNCAVA: el módulo dice que NO lo sabe
// ---------------------------------------------------------------------------
{
  const notch = makeBox({ min: { x: 60, y: 60, z: -10 }, max: { x: 110, y: 110, z: 110 } });
  const ele = booleanDifference(cube, notch);
  check("la pieza en L tiene más de doce aristas", ele.edges.length > 12);
  check("y NO es convexa", cadBodyIsConvex(ele) === false);
  const classified = cadSolidEdgeVisibility(ele, {
    kind: "parallel",
    direction: { x: -1, y: -1, z: -1 },
  });
  // La aserción que impide vender esto como más de lo que es: la clasificación
  // se calcula igual, pero se declara NO exacta y quien la consuma tiene que
  // caer al búfer de profundidad.
  check("la clasificación se marca como NO exacta", classified.exact === false);
  check("aun así clasifica todas las aristas", classified.visible.length + classified.hidden.length === ele.edges.length);
}

// ---------------------------------------------------------------------------
// 6. Los segmentos que se dibujan, y la permutación de ejes
// ---------------------------------------------------------------------------
{
  const segments = cadVisibleEdgeSegments(cube, {
    kind: "parallel",
    direction: { x: -1, y: -1, z: -1 },
  });
  check("salen nueve segmentos visibles", segments.length === 9);
  // Todas las aristas de un cubo tienen 100 de largo: es el ancla de que los
  // segmentos son aristas de verdad y no algo derivado de la malla.
  for (const segment of segments) {
    checkClose(
      "cada segmento mide el lado del cubo",
      Math.hypot(
        segment.to.x - segment.from.x,
        segment.to.y - segment.from.y,
        segment.to.z - segment.from.z,
      ),
      100,
      1e-9,
    );
  }

  // Escena → dibujo: la Y de escena es la z del dibujo.
  const drawing = cadDrawingDirectionFromScene({ x: 1, y: 2, z: 3 });
  check("la permutación escena→dibujo intercambia Y y Z", drawing.x === 1 && drawing.y === 3 && drawing.z === 2);
}

// ---------------------------------------------------------------------------
// 7. El consumidor: el visor envía MENOS aristas en modo Oculto
// ---------------------------------------------------------------------------
{
  const block: CadSolid3dEntity = {
    id: "bloque",
    type: "solid3d",
    root: "caja",
    nodes: [{ id: "caja", op: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 200, y: 100, z: 50 } }],
    layer: "0",
  };
  const view = { kind: "parallel" as const, direction: { x: -1, y: -1, z: -1 } };

  const culled = buildCadSolidVisibleEdges(block, viewport, view);
  check("las aristas visibles se construyen para un convexo", culled !== null);
  if (culled) {
    const positions = culled.getAttribute("position");
    // Nueve aristas × dos extremos.
    check("nueve segmentos, dieciocho vértices", positions.count === 18);
    const bounds = new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute);
    // La altura del sólido (50 de dibujo) va a la Y de ESCENA, como en el resto
    // del visor: si la permutación se rompiera, este número saldría en otro eje.
    checkClose("la altura va a la Y de escena", bounds.max.y - bounds.min.y, 50 * viewport.scale, 1e-9);
    culled.dispose();
  }

  const hidden = buildCadSolidObject(block, viewport, { style: "hidden", view });
  check("el grupo declara que se aplicó la eliminación por CPU", hidden.userData.hiddenLineRemoval === true);
  const hiddenEdges = hidden.children.find((child) => child.name.startsWith("cad-solid-edges"));
  const hiddenCount = ((hiddenEdges as THREE.LineSegments).geometry.getAttribute("position")).count;
  disposeCadSolidObject(hidden);

  // Sin vista declarada, el camino de siempre: TODAS las aristas y la GPU
  // ocultando. Es la capa apagada, y tiene que seguir funcionando igual.
  const legacy = buildCadSolidObject(block, viewport, { style: "hidden" });
  check("sin vista, la eliminación por CPU no se aplica", legacy.userData.hiddenLineRemoval === false);
  const legacyEdges = legacy.children.find((child) => child.name.startsWith("cad-solid-edges"));
  const legacyCount = ((legacyEdges as THREE.LineSegments).geometry.getAttribute("position")).count;
  disposeCadSolidObject(legacy);

  check(
    `en Oculto se envían menos aristas (${hiddenCount} vértices frente a ${legacyCount})`,
    hiddenCount < legacyCount,
  );
  checkClose("y son exactamente las nueve visibles", hiddenCount, 18, 0);
  checkClose("frente a las doce del alambre completo", legacyCount, 24, 0);

  // Alámbrico NO quita nada aunque se le pase la vista: enseñar las aristas de
  // detrás es su definición, no un descuido.
  const wire = buildCadSolidObject(block, viewport, { style: "wireframe", view });
  check("Alámbrico ignora la vista y dibuja el alambre entero", wire.userData.hiddenLineRemoval === false);
  disposeCadSolidObject(wire);
}

report("hidden-lines: qué aristas se ven en modo Oculto", 45);
