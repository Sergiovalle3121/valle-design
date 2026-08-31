/**
 * CORPUS DE GEOMETRÍA DEGENERADA, con criterio PUBLICADO por caso.
 *
 * ## Por qué existe
 *
 * El arquitecto que nos prueba no abre sus dibujos: abre el del estructurista,
 * el del instalador y el que le mandó el cliente en un correo. Esos archivos
 * los trazó gente con prisa y los escribió software que no es el nuestro, así
 * que traen tangencias que no cierran por una micra, arcos de radio cero que
 * quedaron de un escalado, polilíneas que se cruzan consigo mismas, vértices
 * repetidos, «bulges» con NaN y coordenadas de un sistema proyectado. AutoCAD
 * lleva treinta años tragando eso sin romperse. Si nosotros petamos con el
 * plano del estructurista, el arquitecto vuelve a AutoCAD ese mismo día.
 *
 * ## La regla del corpus: FALLO CERRADO
 *
 * Cada caso declara ANTES de ejecutarse cuál de los tres finales admite:
 *
 *   · `corrige` — el motor repara la entrada y el resultado es utilizable.
 *   · `rechaza` — el motor se niega de forma explícita: error tipado, lista de
 *     contornos abiertos con nombre, o `null`. Nunca un resultado a medias.
 *   · `degrada` — el motor acepta y el corpus PUBLICA qué se pierde, con la
 *     cifra exacta. Una degradación sin número es una excusa.
 *
 * Lo que NO se admite en ningún caso es la cuarta salida, la cara: un resultado
 * plausible y falso. Un área que sale cero, un contorno que se cierra por donde
 * no era, una entidad archivada en el origen. Eso no se ve al mirar el plano y
 * se descubre en obra.
 *
 * ## Cinco defectos que este corpus encontró, y su arreglo
 *
 * 1. **El contorno que se cierra solo se rechazaba.** Una LWPOLYLINE ajena
 *    repite el primer vértice al final en vez de poner la bandera de cerrada, y
 *    un ARCO de barrido nulo se entrega siempre como abierto. `cleanLoop`
 *    quitaba el vértice repetido ANTES de comprobar el cierre, así que la
 *    prueba comparaba el primer vértice contra el PENÚLTIMO y el contorno se
 *    daba por abierto. Arreglado en `stitchCadBoundaryPaths`.
 * 2. **El área firmada se evaporaba lejos del origen.** Un cuadrado de 10×10
 *    medía 128 a coordenada 1e9 y CERO a 1e12. Arreglado trasladando al primer
 *    vértice en `cadBoundarySignedArea`.
 * 3. **Un vector de nudos con NaN colapsaba la spline en un punto**, sin error
 *    ni hueco. Arreglado validándolo en `tessellateSpline`.
 * 4. **Elipse y spline degeneradas se archivaban en el ORIGEN.** Su teselado
 *    sale vacío y `pointsBounds([])` contesta la caja del origen, que no es «no
 *    sé» sino una posición falsa. Arreglado con reserva al centro y a los
 *    puntos de control.
 * 5. **Un tramo de longitud cero rompía la asociatividad para siempre.** Salía
 *    por la lista de contornos ABIERTOS, y `regenerateAssociativeHatches` marca
 *    el sombreado como roto en cuanto esa lista tiene un elemento. Un doble
 *    clic sobrante en la selección bastaba. Arreglado descartándolo: un camino
 *    sin dos puntos distintos no es un contorno abierto, es nada.
 *
 * Los cinco tienen aquí su caso, y el caso falla si alguien los revierte.
 */
import assert from "node:assert/strict";
import type { CadEntity, CadPoint2 } from "./cad-document";
import { computeCadLineChamfer } from "./cad-chamfer";
import { computeCadLineFillet } from "./cad-fillet";
import { tessellateArc, tessellateEllipse, tessellateSpline } from "./curve-tessellate";
import {
  CAD_ENTITY_REGISTRY,
  CadSpatialIndex,
  cadEntityBoundaryPaths,
  type CadBounds,
} from "./entity-runtime";
import { convexHull, polygonArea, polygonCentroid } from "./geom-measure";
import { offsetPath } from "./geom-edit";
import {
  cadBoundarySignedArea,
  cadPointInBoundary,
  resolveCadHatchRegion,
  stitchCadBoundaryPaths,
} from "./hatch-associativity";
import { polylineArc } from "./polyline-entity-adapter";
import { crearCorpus, seNiega } from "./corpus-criterion";
import { cadAuditGeometryRepairCommands, detectCadAuditGeometryDefects } from "./audit/geometry";
import { cadAuditReferenceRepairCommands, detectCadAuditReferenceDefects } from "./audit/references";

const linea = (id: string, x1: number, y1: number, x2: number, y2: number): CadEntity =>
  ({ id, type: "line", start: { x: x1, y: y1, z: 0 }, end: { x: x2, y: y2, z: 0 }, layer: "0" });

const polilinea = (id: string, vertices: (CadPoint2 & { bulge?: number })[], closed = false): CadEntity =>
  ({ id, type: "polyline", vertices: vertices.map((v) => ({ ...v, z: 0 })), closed, layer: "0" });

const cuadrado = (x: number, y: number, lado: number): CadPoint2[] =>
  [{ x, y }, { x: x + lado, y }, { x: x + lado, y: y + lado }, { x, y: y + lado }];

/** Caja envolvente por el mismo camino que alimenta el índice espacial. */
const cajaDe = (entity: CadEntity): CadBounds =>
  CAD_ENTITY_REGISTRY.adapter(entity as never).bounds.bounds(entity as never);

const trazosDe = (entity: CadEntity, segments = 96): CadPoint2[][] =>
  CAD_ENTITY_REGISTRY.adapter(entity as never)
    .renderer.paths(entity as never, segments)
    .map((path) => path.points);

/** Los cuatro tramos de un rectángulo con una esquina separada `hueco`. */
const rectanguloConHueco = (hueco: number) => [
  { sourceId: "a", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false },
  { sourceId: "b", points: [{ x: 10, y: hueco }, { x: 10, y: 10 }], closed: false },
  { sourceId: "c", points: [{ x: 10, y: 10 }, { x: 0, y: 10 }], closed: false },
  { sourceId: "d", points: [{ x: 0, y: 10 }, { x: 0, y: 0 }], closed: false },
];

const { caso, correr } = crearCorpus();

// FAMILIA: tangencias

caso({
  id: "tangencia/hueco-bajo-tolerancia",
  entrada: "cuatro tramos de un rectángulo con una esquina separada 1e-5 unidades",
  criterio: "corrige",
  publicado:
    "el cosido suelda por debajo de la tolerancia de 1e-4 y devuelve UN anillo cerrado, sin contornos abiertos.",
  comprobar: () => {
    const built = stitchCadBoundaryPaths(rectanguloConHueco(1e-5));
    assert.equal(built.loops.length, 1);
    assert.deepEqual(built.openSourceIds, []);
  },
});

caso({
  id: "tangencia/hueco-sobre-tolerancia",
  entrada: "el mismo rectángulo con la esquina separada 1e-3 unidades",
  criterio: "rechaza",
  publicado:
    "no se inventa el cierre: cero anillos y los cuatro tramos NOMBRADOS en `openSourceIds`, que es lo que la orden enseña al usuario.",
  comprobar: () => {
    const built = stitchCadBoundaryPaths(rectanguloConHueco(1e-3));
    assert.equal(built.loops.length, 0);
    assert.deepEqual(new Set(built.openSourceIds), new Set(["a", "b", "c", "d"]));
  },
});

caso({
  id: "tangencia/contorno-que-se-cierra-solo",
  entrada:
    "una polilínea abierta cuyo último vértice REPITE el primero (la forma en que casi todo programa ajeno escribe un contorno cerrado)",
  criterio: "corrige",
  publicado:
    "se reconoce como cerrada y da UN anillo. Antes daba cero: `cleanLoop` quitaba el vértice repetido antes de mirar el cierre y la prueba acababa comparando contra el penúltimo.",
  comprobar: () => {
    const built = stitchCadBoundaryPaths([
      { sourceId: "r", points: [...cuadrado(0, 0, 10), { x: 0, y: 0 }], closed: false },
    ]);
    assert.equal(built.loops.length, 1);
    assert.deepEqual(built.openSourceIds, []);
    assert.equal(Math.abs(cadBoundarySignedArea(built.loops[0])), 100);
  },
});

caso({
  id: "tangencia/fillet-exacta",
  entrada: "FILLET de radio 2 sobre una esquina de 90°",
  criterio: "corrige",
  publicado:
    "los dos puntos de tangencia caen sobre el arco con error menor que 1e-9, y cada línea queda recortada EXACTAMENTE en su tangente.",
  comprobar: () => {
    const fillet = computeCadLineFillet(
      linea("a", 0, 0, 10, 0) as never,
      linea("b", 0, 0, 0, 10) as never,
      2,
      "arco",
    );
    for (const tangent of fillet.tangentPoints) {
      const radio = Math.hypot(tangent.x - fillet.arc.center.x, tangent.y - fillet.arc.center.y);
      assert.ok(Math.abs(radio - 2) < 1e-9, `tangencia a ${radio} del centro`);
    }
    assert.deepEqual(
      { x: fillet.lineA.start.x, y: fillet.lineA.start.y },
      { x: fillet.tangentPoints[0].x, y: fillet.tangentPoints[0].y },
    );
  },
});

caso({
  id: "tangencia/lineas-casi-paralelas",
  entrada: "dos líneas cuyas direcciones difieren en 1e-13 radianes",
  criterio: "rechaza",
  publicado:
    "FILLET se niega con error tipado en vez de resolver un vértice a 1e13 unidades del dibujo. El determinante por debajo de 1e-9 es paralelismo a efectos de dibujo.",
  comprobar: () => {
    const mensaje = seNiega(() =>
      computeCadLineFillet(
        linea("a", 0, 0, 10, 0) as never,
        linea("b", 0, 1e-12, 10, 1e-12 + 1e-12) as never,
        1,
        "arco",
      ),
    );
    assert.match(String(mensaje), /non-parallel/);
  },
});

// FAMILIA: radio cero

caso({
  id: "radio-cero/arco",
  entrada: "un ARC de radio 0 con centro en (1000, 1000)",
  criterio: "degrada",
  publicado:
    "no se dibuja nada —cero puntos teselados— pero la caja envolvente sigue siendo la del CENTRO, no la del origen. La entidad no traza, pero sigue estando donde está y el índice espacial la archiva ahí.",
  comprobar: () => {
    assert.deepEqual(tessellateArc({ x: 1000, y: 1000 }, 0, 0, 90, 8), []);
    const arco: CadEntity = {
      id: "a0",
      type: "arc",
      center: { x: 1000, y: 1000, z: 0 },
      radius: 0,
      startAngle: 0,
      endAngle: 90,
      layer: "0",
    };
    assert.deepEqual(trazosDe(arco), [[]]);
    assert.deepEqual(cajaDe(arco), { minX: 1000, minY: 1000, maxX: 1000, maxY: 1000 });
  },
});

caso({
  id: "radio-cero/circulo",
  entrada: "un CIRCLE de radio 0 con centro en (300, 300)",
  criterio: "degrada",
  publicado:
    "misma regla que el arco: trazo vacío, caja en el centro y CERO puntos de contorno — un círculo de radio nulo no encierra nada y no puede sombrearse.",
  comprobar: () => {
    const circulo: CadEntity = {
      id: "c0",
      type: "circle",
      center: { x: 300, y: 300, z: 0 },
      radius: 0,
      layer: "0",
    };
    assert.deepEqual(cajaDe(circulo), { minX: 300, minY: 300, maxX: 300, maxY: 300 });
    assert.deepEqual(cadEntityBoundaryPaths(circulo).map((path) => path.points.length), [0]);
    assert.equal(stitchCadBoundaryPaths(cadEntityBoundaryPaths(circulo)).loops.length, 0);
  },
});

caso({
  id: "radio-cero/elipse-razon-nula",
  entrada: "una ELLIPSE con razón de ejes 0 y otra con eje mayor (0,0), centro en (77, 33)",
  criterio: "degrada",
  publicado:
    "trazo vacío y caja en el CENTRO. Antes contestaba la caja del origen y el índice espacial la archivaba en la celda 0:0: una ventana sobre su sitio real no la encontraba y una ventana sobre el origen seleccionaba algo que no estaba ahí.",
  comprobar: () => {
    assert.deepEqual(tessellateEllipse({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, 0, 360, 8), []);
    for (const degenerada of [
      { ratio: 0, majorAxis: { x: 10, y: 0, z: 0 } },
      { ratio: 0.5, majorAxis: { x: 0, y: 0, z: 0 } },
    ]) {
      const elipse: CadEntity = {
        id: "e0",
        type: "ellipse",
        center: { x: 77, y: 33, z: 0 },
        majorAxis: degenerada.majorAxis,
        ratio: degenerada.ratio,
        startParameter: 0,
        endParameter: 360,
        layer: "0",
      };
      assert.deepEqual(trazosDe(elipse), [[]]);
      assert.deepEqual(cajaDe(elipse), { minX: 77, minY: 33, maxX: 77, maxY: 33 });
    }
  },
});

caso({
  id: "radio-cero/fillet",
  entrada: "FILLET con radio 0, NaN e Infinity",
  criterio: "rechaza",
  publicado:
    "los tres dan el MISMO error tipado. Radio cero en AutoCAD es limpiar la esquina, que es otra operación y no crea entidad; fingirla aquí metería un arco de radio nulo en el documento.",
  comprobar: () => {
    for (const radio of [0, NaN, Infinity, -1]) {
      const mensaje = seNiega(() =>
        computeCadLineFillet(
          linea("a", 0, 0, 10, 0) as never,
          linea("b", 0, 0, 0, 10) as never,
          radio,
          "arco",
        ),
      );
      assert.match(String(mensaje), /radius must be greater than zero/, `radio ${radio}`);
    }
  },
});

caso({
  id: "radio-cero/spline-sin-curva",
  entrada: "una SPLINE con un solo punto de control en (500, 500)",
  criterio: "degrada",
  publicado:
    "teselado vacío y caja anclada en los PUNTOS DE CONTROL. Antes contestaba el origen, con la misma consecuencia que la elipse degenerada.",
  comprobar: () => {
    assert.deepEqual(tessellateSpline([{ x: 0, y: 0 }], 3, undefined, 8), []);
    const spline: CadEntity = {
      id: "s1",
      type: "spline",
      degree: 3,
      controlPoints: [{ x: 500, y: 500, z: 0 }],
      knots: [],
      layer: "0",
    };
    assert.deepEqual(trazosDe(spline), [[]]);
    assert.deepEqual(cajaDe(spline), { minX: 500, minY: 500, maxX: 500, maxY: 500 });
  },
});

// FAMILIA: autointersección

/** Pajarita: los dos lóbulos tienen la misma área y signos opuestos. */
const PAJARITA: CadPoint2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 10 },
  { x: 10, y: 0 },
  { x: 0, y: 10 },
];

caso({
  id: "autointerseccion/pajarita-area-nula",
  entrada: "un cuadrilátero cuyos lados se cruzan (pajarita simétrica)",
  criterio: "degrada",
  publicado:
    "el área firmada es EXACTAMENTE 0 porque los lóbulos se cancelan. El corpus lo fija para que nadie use `cadBoundarySignedArea` como prueba de «hay superficie»: hay que mirar el valor, no confiar en que sea positivo. El rechazo tipado en la orden HATCH lo exige el corpus de islas.",
  comprobar: () => {
    assert.equal(cadBoundarySignedArea(PAJARITA), 0);
    assert.equal(polygonArea(PAJARITA), 0);
    // El punto de cruce cuenta como DENTRO por paridad, y eso es coherente:
    // el mismo criterio par/impar usa el renderizador para decidir qué pinta.
    assert.equal(cadPointInBoundary({ x: 5, y: 5 }, PAJARITA), true);
  },
});

caso({
  id: "autointerseccion/polilinea-cruzada",
  entrada: "una polilínea cerrada que se cruza a sí misma dos veces",
  criterio: "degrada",
  publicado:
    "se tesela y se acota sin colgarse, y la caja envolvente cubre TODOS los vértices. El motor no intenta desenredarla: dibujarla tal cual es lo que hace AutoCAD.",
  comprobar: () => {
    const cruzada = polilinea("x", PAJARITA, true);
    const caja = cajaDe(cruzada);
    assert.deepEqual(caja, { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    assert.equal(trazosDe(cruzada)[0].length, 4);
  },
});

caso({
  id: "autointerseccion/desfase-hacia-dentro",
  entrada: "OFFSET de 100 unidades hacia dentro de un cuadrado de lado 10",
  criterio: "rechaza",
  publicado:
    "devuelve `null`. Un desfase mayor que el radio inscrito produciría un polígono invertido, que es geometría plausible y falsa; negarse es la única salida honesta.",
  comprobar: () => {
    assert.equal(offsetPath(cuadrado(0, 0, 10), 100, { closed: true }), null);
    assert.equal(offsetPath([{ x: 0, y: 0 }], 1, { closed: false }), null);
    assert.equal(offsetPath([{ x: NaN, y: 0 }, { x: 10, y: 0 }], 1, { closed: false }), null);
  },
});

// FAMILIA: colineales

const COLINEALES: CadPoint2[] = [
  { x: 0, y: 0 },
  { x: 5, y: 0 },
  { x: 10, y: 0 },
];

caso({
  id: "colineales/area-y-centroide",
  entrada: "tres vértices alineados sobre el eje X",
  criterio: "corrige",
  publicado:
    "área 0 exacta (no NaN) y centroide en la MEDIA de los vértices: con área nula la fórmula del centro de masa dividiría por cero, así que se cae al promedio en vez de devolver infinito.",
  comprobar: () => {
    assert.equal(cadBoundarySignedArea(COLINEALES), 0);
    assert.deepEqual(polygonCentroid(COLINEALES), { x: 5, y: 0 });
    assert.ok(Number.isFinite(polygonCentroid(COLINEALES).x));
  },
});

caso({
  id: "colineales/envolvente-convexa",
  entrada: "los mismos tres puntos alineados, a la envolvente convexa",
  criterio: "corrige",
  publicado:
    "devuelve DOS puntos —los extremos— y no un triángulo de área nula. Un polígono degenerado colado aquí se propagaría a todo lo que mida sobre él.",
  comprobar: () => {
    assert.deepEqual(convexHull([...COLINEALES]), [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  },
});

caso({
  id: "colineales/fillet-y-chamfer",
  entrada: "FILLET y CHAMFER sobre dos líneas colineales que comparten extremo",
  criterio: "rechaza",
  publicado:
    "las dos órdenes se niegan con el MISMO error, cada una con su nombre. Dos rectas colineales no tienen vértice: no hay esquina que redondear ni que achaflanar.",
  comprobar: () => {
    assert.match(
      String(seNiega(() =>
        computeCadLineFillet(linea("a", 0, 0, 10, 0) as never, linea("b", 10, 0, 20, 0) as never, 1, "x"),
      )),
      /FILLET requires two non-parallel/,
    );
    assert.match(
      String(seNiega(() =>
        computeCadLineChamfer(linea("a", 0, 0, 10, 0) as never, linea("b", 10, 0, 20, 0) as never, 1, 1, "x"),
      )),
      /CHAMFER requires two non-parallel/,
    );
  },
});

caso({
  id: "colineales/esquina-casi-llana",
  entrada: "CHAMFER sobre una esquina de 180° menos 1e-10 radianes",
  criterio: "degrada",
  publicado:
    "se acepta y sale un chaflán de longitud 1e-10: geometría correcta pero invisible. El motor no adivina la intención; lo que sí garantiza es que el segmento emitido NO tiene longitud cero, que sería una entidad degenerada dentro del documento.",
  comprobar: () => {
    const chaflan = computeCadLineChamfer(
      linea("a", 0, 0, 10, 0) as never,
      linea("b", 10, 1e-9, 20, 2e-9) as never,
      1,
      1,
      "c",
    );
    const largo = Math.hypot(
      chaflan.chamfer.end.x - chaflan.chamfer.start.x,
      chaflan.chamfer.end.y - chaflan.chamfer.start.y,
    );
    assert.ok(largo > 0, "el chaflán no puede tener longitud cero");
    assert.ok(largo < 1e-6, `chaflán de ${largo}, se esperaba microscópico`);
  },
});

// FAMILIA: segmentos de longitud cero y vértices duplicados

caso({
  id: "longitud-cero/tramo-en-el-cosido",
  entrada: "un tramo de longitud cero mezclado con un contorno cerrado válido",
  criterio: "corrige",
  publicado:
    "el tramo nulo se descarta y NO impide que el contorno bueno cierre: un anillo, cero abiertos. Un cero-longitud que rompiera el cosido convertiría cualquier doble clic sobrante en un sombreado imposible.",
  comprobar: () => {
    const built = stitchCadBoundaryPaths([
      { sourceId: "z", points: [{ x: 0, y: 0 }, { x: 0, y: 0 }], closed: false },
      { sourceId: "a", points: cuadrado(0, 0, 10), closed: true },
    ]);
    assert.equal(built.loops.length, 1);
    assert.deepEqual(built.openSourceIds, []);
  },
});

caso({
  id: "longitud-cero/linea-en-fillet",
  entrada: "FILLET con una LINE de longitud cero",
  criterio: "rechaza",
  publicado:
    "error tipado. Una recta sin dirección no define ni el vértice ni el rayo que sobrevive, así que la operación no tiene entrada.",
  comprobar: () => {
    assert.match(
      String(seNiega(() =>
        computeCadLineFillet(linea("a", 0, 0, 0, 0) as never, linea("b", 0, 0, 10, 10) as never, 1, "x"),
      )),
      /non-parallel|zero-length/,
    );
  },
});

caso({
  id: "duplicados/vertices-repetidos",
  entrada: "una polilínea con el mismo vértice tres veces seguidas",
  criterio: "corrige",
  publicado:
    "el cosido colapsa los repetidos y el anillo resultante tiene 4 vértices y área 100. El trazado, en cambio, los CONSERVA: quitar vértices al dibujar cambiaría los grips y las cotas asociativas que apuntan al vértice por su índice.",
  comprobar: () => {
    const conRepetidos = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const built = stitchCadBoundaryPaths([{ sourceId: "p", points: conRepetidos, closed: true }]);
    assert.equal(built.loops.length, 1);
    assert.equal(built.loops[0].length, 4);
    assert.equal(Math.abs(cadBoundarySignedArea(built.loops[0])), 100);
    assert.equal(trazosDe(polilinea("p", conRepetidos, true))[0].length, 6);
  },
});

caso({
  id: "duplicados/todos-los-vertices-iguales",
  entrada: "una polilínea cerrada cuyos cuatro vértices son el mismo punto",
  criterio: "rechaza",
  publicado:
    "cero anillos: no se fabrica un polígono de área nula. La caja envolvente sí existe y es el punto, que es la verdad sobre dónde está.",
  comprobar: () => {
    const punto = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    assert.equal(stitchCadBoundaryPaths([{ sourceId: "p", points: punto, closed: true }]).loops.length, 0);
    assert.deepEqual(cajaDe(polilinea("p", punto, true)), { minX: 5, minY: 5, maxX: 5, maxY: 5 });
  },
});

// FAMILIA: arcos de 360°

caso({
  id: "arco-360/barrido-nulo",
  entrada: "un ARC con ángulo inicial igual al final (45° → 45°)",
  criterio: "corrige",
  publicado:
    "se interpreta como VUELTA COMPLETA, que es la convención DXF: el barrido no positivo se normaliza sumando 360. La caja envolvente es la del círculo entero, no la del punto de arranque.",
  comprobar: () => {
    const puntos = tessellateArc({ x: 0, y: 0 }, 10, 45, 45, 24);
    assert.equal(puntos.length, 25);
    assert.ok(Math.hypot(puntos[0].x - puntos[24].x, puntos[0].y - puntos[24].y) < 1e-9);
    const arco: CadEntity = {
      id: "a",
      type: "arc",
      center: { x: 0, y: 0, z: 0 },
      radius: 10,
      startAngle: 45,
      endAngle: 45,
      layer: "0",
    };
    assert.deepEqual(cajaDe(arco), { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  },
});

caso({
  id: "arco-360/como-contorno",
  entrada: "ese mismo arco de vuelta completa usado como contorno de sombreado",
  criterio: "corrige",
  publicado:
    "cierra UN anillo de área 314,10 frente a los 314,159 del círculo real: 0,018 % de pérdida por teselado a 192 tramos, y esa es toda la degradación. Antes daba cero anillos porque el adaptador de ARC entrega siempre el camino como abierto.",
  comprobar: () => {
    const arco: CadEntity = {
      id: "a",
      type: "arc",
      center: { x: 0, y: 0, z: 0 },
      radius: 10,
      startAngle: 45,
      endAngle: 45,
      layer: "0",
    };
    const built = stitchCadBoundaryPaths(cadEntityBoundaryPaths(arco));
    assert.equal(built.loops.length, 1);
    assert.deepEqual(built.openSourceIds, []);
    const area = Math.abs(cadBoundarySignedArea(built.loops[0]));
    const exacta = Math.PI * 100;
    assert.ok(Math.abs(area - exacta) / exacta < 2e-4, `área ${area}, exacta ${exacta}`);
  },
});

caso({
  id: "arco-360/barrido-de-dos-vueltas",
  entrada: "un ARC de 0° a 720°",
  criterio: "degrada",
  publicado:
    "se tesela DANDO DOS VUELTAS —49 puntos con 24 tramos por vuelta— en vez de normalizar a una. La geometría dibujada es la misma circunferencia; lo que se paga es el doble de puntos. Se declara aquí para que nadie lo lea como una espiral.",
  comprobar: () => {
    const puntos = tessellateArc({ x: 0, y: 0 }, 10, 0, 720, 24);
    assert.equal(puntos.length, 49);
    for (const punto of puntos)
      assert.ok(Math.abs(Math.hypot(punto.x, punto.y) - 10) < 1e-9, "todos sobre el mismo radio");
  },
});

// FAMILIA: bulges infinitos o NaN

caso({
  id: "bulge/no-finito",
  entrada: "tramos de polilínea con bulge Infinity, -Infinity y NaN",
  criterio: "corrige",
  publicado:
    "los tres caen a RECTA: `polylineArc` devuelve `null` y el trazado usa la cuerda. Es la degradación mínima y la única reversible — un arco inventado a partir de NaN no lo es.",
  comprobar: () => {
    for (const bulge of [Infinity, -Infinity, NaN]) {
      assert.equal(polylineArc({ x: 0, y: 0, z: 0, bulge }, { x: 10, y: 0, z: 0 }), null);
      const trazo = trazosDe(polilinea("p", [{ x: 0, y: 0, bulge }, { x: 10, y: 0 }]))[0];
      assert.deepEqual(trazo, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    }
  },
});

caso({
  id: "bulge/cuerda-de-longitud-cero",
  entrada: "un tramo con bulge 1 entre dos vértices coincidentes",
  criterio: "corrige",
  publicado:
    "también cae a recta. Sin cuerda no hay arco que construir: el radio saldría de dividir por cero.",
  comprobar: () => {
    assert.equal(polylineArc({ x: 3, y: 3, z: 0, bulge: 1 }, { x: 3, y: 3, z: 0 }), null);
  },
});

caso({
  id: "bulge/enorme-pero-finito",
  entrada: "un tramo de 10 unidades con bulge 1e12",
  criterio: "degrada",
  publicado:
    "se respeta la convención DXF —bulge = tan(θ/4), así que 1e12 es casi una vuelta completa— y sale un arco REAL de radio 2,5e12. La caja envolvente crece con él y el índice espacial lo manda al conjunto de desbordamiento: cuesta caro, pero no se cuelga ni miente sobre dónde está.",
  comprobar: () => {
    const arco = polylineArc({ x: 0, y: 0, z: 0, bulge: 1e12 }, { x: 10, y: 0, z: 0 });
    assert.ok(arco, "un bulge finito enorme sigue siendo un arco");
    assert.ok(arco!.radius > 1e12, `radio ${arco!.radius}`);
    assert.ok(Math.abs(arco!.sweep - 2 * Math.PI) < 1e-6, `barrido ${arco!.sweep}`);
    const caja = cajaDe(polilinea("p", [{ x: 0, y: 0, bulge: 1e12 }, { x: 10, y: 0 }]));
    assert.ok(caja.maxY - caja.minY > 1e12, "la caja crece con el arco de verdad");
    const indice = new CadSpatialIndex();
    indice.upsert("p", caja);
    assert.deepEqual(indice.search({ minX: 0, minY: -1, maxX: 10, maxY: 1 }), ["p"]);
  },
});

// FAMILIA: coordenadas enormes y denormales

caso({
  id: "enormes/area-lejos-del-origen",
  entrada: "un cuadrado de 10×10 (área real 100) colocado en 1e7, 1e9 y 1e12",
  criterio: "corrige",
  publicado:
    "los tres miden 100 EXACTO. Antes medían 100, 128 y 0: la fórmula del cordón sin trasladar calculaba un área pequeña como diferencia de productos gigantescos. Un cero ahí es un sombreado que informa cero metros cuadrados en una tabla de acabados.",
  comprobar: () => {
    for (const origen of [1e7, 1e9, 1e12]) {
      const area = cadBoundarySignedArea(cuadrado(origen, origen, 10));
      assert.equal(area, 100, `en ${origen} salió ${area}`);
    }
  },
});

caso({
  id: "enormes/desbordamiento-real",
  entrada: "un polígono cuyos lados miden 2e308 (más que el mayor `double`)",
  criterio: "rechaza",
  publicado:
    "el área sale NO FINITA, y eso es la respuesta correcta: quien la use debe comprobarlo. Lo que el corpus prohíbe es que salga un número finito y plausible.",
  comprobar: () => {
    const area = cadBoundarySignedArea([
      { x: -1e308, y: -1e308 },
      { x: 1e308, y: -1e308 },
      { x: 1e308, y: 1e308 },
      { x: -1e308, y: 1e308 },
    ]);
    assert.equal(Number.isFinite(area), false, `salió ${area}`);
  },
});

caso({
  id: "denormales/cuadrado-subnormal",
  entrada: "un cuadrado de lado 5e-324 (el menor subnormal representable)",
  criterio: "rechaza",
  publicado:
    "el cosido devuelve CERO anillos: por debajo de la tolerancia de 1e-4 los cuatro vértices son el mismo punto. El área es 0 exacto, nunca NaN.",
  comprobar: () => {
    const subnormal = cuadrado(0, 0, 5e-324);
    assert.equal(cadBoundarySignedArea(subnormal), 0);
    assert.equal(stitchCadBoundaryPaths([{ sourceId: "d", points: subnormal, closed: true }]).loops.length, 0);
  },
});

caso({
  id: "enormes/indice-espacial",
  entrada: "el índice espacial con una entidad de 2e12 de lado, otra de cota infinita (XLINE) y otra con NaN",
  criterio: "degrada",
  publicado:
    "ninguna cuelga el hilo: las tres se enrutan al conjunto de desbordamiento en vez de generar 1e18 celdas. Las dos primeras siguen siendo encontrables; la de NaN NO —ninguna comparación con NaN es cierta— y ésa es la degradación: se pierde ELLA, no las vecinas.",
  comprobar: () => {
    const indice = new CadSpatialIndex();
    indice.upsert("enorme", { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 });
    indice.upsert("infinita", { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity });
    indice.upsert("nan", { minX: NaN, minY: 0, maxX: 1, maxY: 1 });
    indice.upsert("normal", { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    const encontradas = indice.search({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    assert.deepEqual(encontradas, ["enorme", "infinita", "normal"]);
    assert.equal(indice.size, 4, "la de NaN sigue registrada, sólo que no se encuentra");
  },
});

// FAMILIA: orientación mixta

caso({
  id: "orientacion/exterior-horario",
  entrada: "un contorno exterior dado en sentido HORARIO con una isla dentro",
  criterio: "corrige",
  publicado:
    "el anillo exterior se normaliza SIEMPRE a antihorario (área firmada positiva), venga como venga. Sin eso, dos sombreados idénticos dibujados en sentidos distintos darían regiones con signos opuestos.",
  comprobar: () => {
    const horario = [...cuadrado(0, 0, 50)].reverse();
    assert.ok(cadBoundarySignedArea(horario) < 0, "la entrada es horaria");
    const region = resolveCadHatchRegion([horario, cuadrado(10, 10, 20)], { x: 2, y: 2 }, "normal");
    assert.equal(cadBoundarySignedArea(region[0]), 2500);
  },
});

caso({
  id: "orientacion/isla-segun-estilo",
  entrada: "la misma isla resuelta con estilo `normal` y con estilo `exterior`",
  criterio: "degrada",
  publicado:
    "con `exterior` la isla sale con el sentido INVERTIDO respecto del contorno (-400 frente a +2500); con `normal` sale con el MISMO sentido (+400). No es simetría: la región de estilo normal sólo es interpretable con la regla PAR/IMPAR, que es la que usan `hatchRegionContainsPoint` y el renderizador. Queda escrito para que nadie enchufe un rasterizador de regla distinta de cero y se encuentre las islas rellenas.",
  comprobar: () => {
    const conIsla = [cuadrado(0, 0, 50), cuadrado(10, 10, 20)];
    assert.equal(cadBoundarySignedArea(resolveCadHatchRegion(conIsla, { x: 2, y: 2 }, "normal")[1]), 400);
    assert.equal(cadBoundarySignedArea(resolveCadHatchRegion(conIsla, { x: 2, y: 2 }, "outer")[1]), -400);
  },
});

// FAMILIA: nudos de spline corruptos

caso({
  id: "nudos/vector-con-nan",
  entrada:
    "una SPLINE de grado 2 cuyo vector de nudos tiene la longitud correcta pero está lleno de NaN",
  criterio: "corrige",
  publicado:
    "se descarta el vector corrupto y se sintetizan nudos clamped, que es exactamente lo que ya se hacía cuando la LONGITUD no cuadraba. Antes se aceptaba por tener el tamaño bueno y De Boor devolvía siempre el primer punto de control: la spline COLAPSABA en un punto, sin error ni hueco.",
  comprobar: () => {
    const control = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }];
    const conNan = tessellateSpline(control, 2, [NaN, NaN, NaN, NaN, NaN, NaN], 4);
    const sanos = tessellateSpline(control, 2, undefined, 4);
    assert.deepEqual(conNan, sanos);
    assert.ok(conNan.some((punto) => punto.x !== conNan[0].x), "la curva no puede ser un punto");
  },
});

caso({
  id: "nudos/vector-constante",
  entrada: "la misma spline con todos los nudos a 0 (dominio de longitud nula)",
  criterio: "corrige",
  publicado:
    "mismo desenlace y por la misma razón: un dominio nulo daría todas las muestras en el mismo parámetro, que es el colapso por otro camino.",
  comprobar: () => {
    const control = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }];
    assert.deepEqual(
      tessellateSpline(control, 2, [0, 0, 0, 0, 0, 0], 4),
      tessellateSpline(control, 2, undefined, 4),
    );
  },
});

caso({
  id: "nudos/vector-no-monotono",
  entrada: "un vector de nudos que retrocede en mitad de la secuencia",
  criterio: "corrige",
  publicado:
    "también se descarta. Un vector no creciente no parametriza nada: De Boor sobre él da denominadores negativos y puntos fuera del casco convexo, que es geometría plausible y falsa.",
  comprobar: () => {
    const control = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }];
    assert.deepEqual(
      tessellateSpline(control, 2, [0, 0, 0, 1, -5, 1], 4),
      tessellateSpline(control, 2, undefined, 4),
    );
  },
});

// FAMILIA: AUDIT — la orden que finalmente QUITA lo que el motor degrada

caso({
  id: "audit/linea-longitud-cero",
  entrada: "el mismo tramo de longitud cero de la familia «longitud-cero», visto por AUDIT",
  criterio: "corrige",
  publicado:
    "AUDIT lo detecta con nombre —«LINE de longitud 0»— y su reparación lo borra: tras aplicarla, un segundo AUDIT sobre lo que queda no encuentra nada. AUDIT no repara en silencio: el detector y el comando comparten la misma entidad, nunca un resumen aproximado.",
  comprobar: () => {
    const tramo = linea("z", 5, 5, 5, 5);
    const antes = detectCadAuditGeometryDefects([tramo]);
    assert.equal(antes.length, 1);
    assert.equal(antes[0].kind, "zero-length-line");
    const reparado = cadAuditGeometryRepairCommands(antes);
    assert.deepEqual(reparado, [{ type: "delete", entityId: "z" }]);
    const sobrevivientes = [tramo].filter((entidad) => entidad.id !== "z");
    assert.deepEqual(detectCadAuditGeometryDefects(sobrevivientes), []);
  },
});

caso({
  id: "audit/circulo-radio-cero",
  entrada: "el CIRCLE de radio 0 de «radio-cero/circulo», que el motor DEGRADA (lo dibuja vacío pero lo conserva)",
  criterio: "corrige",
  publicado:
    "el motor de trazado lo mantiene archivado en su centro sin dibujar nada —esa es la degradación correcta y ya probada arriba—; AUDIT es la capa que, cuando el usuario lo pide, lo QUITA del documento en vez de dejarlo como ruido invisible para siempre.",
  comprobar: () => {
    const circulo: CadEntity = { id: "c0", type: "circle", center: { x: 300, y: 300, z: 0 }, radius: 0, layer: "0" };
    const defectos = detectCadAuditGeometryDefects([circulo]);
    assert.equal(defectos.length, 1);
    assert.equal(defectos[0].kind, "zero-radius-circle");
    assert.deepEqual(cadAuditGeometryRepairCommands(defectos), [{ type: "delete", entityId: "c0" }]);
  },
});

caso({
  id: "audit/hueco-sin-anfitrion",
  entrada: "un OPENING cuyo muro (`hostId`) ya no está en el documento",
  criterio: "corrige",
  publicado:
    "AUDIT reutiliza `orphanedOpeningIds` —la MISMA función que ya usa el ejecutor de lotes cuando el borrado del muro sucede dentro de una transacción propia— para encontrar el hueco huérfano cuando llegó así de un documento ajeno, y su reparación lo retira.",
  comprobar: () => {
    const hueco = { id: "o1", type: "opening", hostId: "muro-que-ya-no-existe", layer: "0" } as unknown as CadEntity;
    const defectos = detectCadAuditReferenceDefects({ entities: [hueco], blocks: [] });
    assert.equal(defectos.length, 1);
    assert.equal(defectos[0].kind, "orphan-opening");
    assert.deepEqual(cadAuditReferenceRepairCommands(defectos), [{ type: "delete", entityId: "o1" }]);
  },
});

caso({
  id: "audit/insert-a-bloque-inexistente",
  entrada: "un INSERT que nombra un bloque que el documento no declara —el DXF del estructurista llegó sin su definición",
  criterio: "corrige",
  publicado:
    "se detecta con el nombre del bloque ausente en el mensaje, y la reparación retira el INSERT: un bloque que no se puede resolver nunca se dibuja, así que quitarlo no pierde nada visible que ya no se hubiera perdido.",
  comprobar: () => {
    const insert: CadEntity = {
      id: "i1", type: "insert", block: "PLANTA-ESTRUCTURAL", insertion: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "0",
    };
    const defectos = detectCadAuditReferenceDefects({ entities: [insert], blocks: [] });
    assert.equal(defectos.length, 1);
    assert.match(defectos[0].detail, /PLANTA-ESTRUCTURAL/);
  },
});

correr("degenerate-geometry-corpus");
