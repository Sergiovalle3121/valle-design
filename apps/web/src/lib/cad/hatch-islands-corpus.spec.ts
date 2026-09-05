/**
 * CORPUS DE SOMBREADO: contornos CURVOS e islas ANIDADAS, con criterio
 * publicado por caso.
 *
 * ## Por qué el sombreado y no otra cosa
 *
 * El HATCH sale en todo plano de acabados —pisos, aplanados, impermeabilizantes,
 * cortes de muro— y es de lo que peor se porta con geometría ajena, porque no
 * consume una entidad: consume el CIERRE de varias. Un contorno de verdad es una
 * recta, un arco, otra recta y una spline, dibujados por cuatro personas
 * distintas y guardados por un programa que no es el nuestro. Y las islas nunca
 * son una: el patio dentro del edificio, el aljibe dentro del patio.
 *
 * El vocabulario de los tres desenlaces —`corrige`, `rechaza`, `degrada`— y la
 * razón de que exista está en `corpus-criterion.ts`. Aquí sólo se aplica.
 *
 * ## Los tres defectos que este corpus encontró, y su arreglo
 *
 * 1. **El área de la región salía NEGATIVA con islas dentro de islas.**
 *    `cadHatchRegionArea` restaba TODAS las islas al exterior, y eso sólo vale
 *    con un nivel. Cuatro cuadrados concéntricos de 100, 80, 60 y 40 daban
 *    −1600. Peor que el signo: la misma región se MEDÍA así y se DIBUJABA por
 *    paridad, de modo que el anillo de tercer nivel se pintaba y el cálculo lo
 *    restaba. Ahora la cuenta es la del renderizador y da 5600.
 * 2. **Dos islas que se cruzan devolvían un número plausible y falso** (1700
 *    donde la verdad es 1900): el trozo común se restaba dos veces. Ninguna
 *    suma de áreas completas puede medir eso sin recortar polígonos, así que
 *    ahora se lanza `CadHatchRegionError` con los dos anillos nombrados.
 * 3. **Un contorno autointersecante se sombreaba.** La pajarita tiene área
 *    firmada CERO, así que el documento se quedaba con un relleno que medía
 *    cero metros cuadrados y que nadie iba a mirar hasta la tabla de acabados.
 *    Ahora se detecta, la región se niega y la orden lo dice CON EL NOMBRE del
 *    objeto: el mensaje anterior —«cierra el perímetro»— mandaba a buscar un
 *    hueco que no existe, porque el perímetro está cerrado; lo que pasa es que
 *    se corta.
 *
 * ## La cifra que se repite: 1,78e-4
 *
 * Es el error relativo de área que introduce el teselado a 192 tramos, y sale
 * igual en el semidisco, en el círculo, en la elipse y en los tres anillos
 * concéntricos. No es casualidad: la resolución del contorno NO depende de la
 * vista, y por eso el mismo dibujo mide lo mismo lo haga quien lo haga y con el
 * zoom que sea. Ésa es la propiedad que hace que la asociatividad signifique
 * algo, y tiene aquí su caso.
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument, type CadEntity, type CadPoint2 } from "./cad-document";
import { crearCorpus } from "./corpus-criterion";
import { CAD_COMMAND_REGISTRY_V2 } from "./engine";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "./engine/command-types";
import { cadEntityBoundaryPaths } from "./entity-runtime";
import {
  CAD_SELF_INTERSECTION_BUDGET,
  cadBoundariesCross,
  cadBoundarySelfIntersects,
  cadBoundarySignedArea,
  hatchRegionContainsPoint,
  resolveCadHatchRegion,
  stitchCadBoundaryPaths,
} from "./hatch-associativity";
import {
  CadHatchRegionError,
  cadHatchRegionArea,
} from "./engine/commands/hatch-support";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

const CAPA = "RELLENOS";

const documento = (entities: CadEntity[]): CadDocument =>
  migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: CAPA, name: "Rellenos", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });

/** Ejecuta la orden REAL del registro del producto, no una imitación. */
function ordenar(
  nombre: string,
  entradas: readonly CadCommandInput[],
  doc: CadDocument,
  selection: readonly string[] = [],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(nombre);
  assert.ok(descriptor, `${nombre} debe estar en el registro del producto`);
  let contador = 0;
  const context: CadCommandContext = {
    entityIds: doc.entities.map((entity) => entity.id),
    entity: (entityId) => doc.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: CAPA,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `relleno${++contador}`,
  };
  let step = descriptor.begin(context);
  for (const entrada of entradas) {
    if (step.result) break;
    step = descriptor.step(step.state, entrada, context);
  }
  return step.result;
}

const pinchar = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});

/** El HATCH que la orden escribió, o `null` si se negó. */
function sombreadoDe(result: CadCommandResult | undefined): Extract<CadEntity, { type: "hatch" }> | null {
  if (result?.kind !== "document") return null;
  for (const command of result.commands)
    if (command.type === "insert" && command.entity.type === "hatch") return command.entity;
  return null;
}

const mensajeDe = (result: CadCommandResult | undefined): string =>
  result?.kind === "message" ? result.text : "";

const cuadrado = (x: number, y: number, lado: number): CadPoint2[] =>
  [{ x, y }, { x: x + lado, y }, { x: x + lado, y: y + lado }, { x, y: y + lado }];

const circulo = (id: string, radio: number, x = 0, y = 0): CadEntity =>
  ({ id, type: "circle", center: { x, y, z: 0 }, radius: radio, layer: CAPA });

const polilinea = (id: string, puntos: CadPoint2[], closed = true): CadEntity =>
  ({ id, type: "polyline", vertices: puntos.map((p) => ({ ...p, z: 0 })), closed, layer: CAPA });

/** Anillos cosidos a partir de entidades reales, como hace la orden. */
const anillosDe = (entities: readonly CadEntity[]) =>
  stitchCadBoundaryPaths(entities.flatMap((entity) => cadEntityBoundaryPaths(entity)));

/** Error relativo contra el valor exacto. Es la cifra que se publica. */
const desvio = (medida: number, exacta: number) => Math.abs(medida - exacta) / Math.abs(exacta);

/** Cuatro cuadrados concéntricos: el caso de islas dentro de islas. */
const CUATRO_NIVELES = [
  cuadrado(0, 0, 100),
  cuadrado(10, 10, 80),
  cuadrado(20, 20, 60),
  cuadrado(30, 30, 40),
];

const { caso, correr } = crearCorpus();

// FAMILIA: contornos curvos

caso({
  id: "contorno-curvo/arco-mas-cuerda",
  entrada: "un ARC de 180° y la LINE que cierra su diámetro (el semidisco de siempre)",
  criterio: "degrada",
  publicado:
    "cierran UN anillo de área 157,052 frente a los 157,0796 exactos de π·R²/2: 1,78e-4 de error relativo, todo él del teselado a 192 tramos. No hay más pérdida y no hay contornos abiertos.",
  comprobar: () => {
    const arco: CadEntity = {
      id: "arco", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 10,
      startAngle: 0, endAngle: 180, layer: CAPA,
    };
    const cuerda: CadEntity = {
      id: "cuerda", type: "line", start: { x: -10, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: CAPA,
    };
    const built = anillosDe([arco, cuerda]);
    assert.equal(built.loops.length, 1);
    assert.deepEqual(built.openSourceIds, []);
    const area = cadHatchRegionArea(resolveCadHatchRegion(built.loops, { x: 0, y: 5 }, "normal"));
    assert.ok(desvio(area, (Math.PI * 100) / 2) < 2e-4, `área ${area}`);
  },
});

caso({
  id: "contorno-curvo/circulo-y-elipse",
  entrada: "un CIRCLE de radio 10 y una ELLIPSE de semiejes 20 y 10, cada uno como contorno único",
  criterio: "degrada",
  publicado:
    "los dos dan 193 puntos, un anillo cerrado y el MISMO error relativo de 1,78e-4 (314,103 frente a 314,159; 628,206 frente a 628,319). Que el desvío sea idéntico en las dos curvas es la prueba de que la resolución la fija el teselador y no la forma.",
  comprobar: () => {
    const elipse: CadEntity = {
      id: "elipse", type: "ellipse", center: { x: 0, y: 0, z: 0 }, majorAxis: { x: 20, y: 0, z: 0 },
      ratio: 0.5, startParameter: 0, endParameter: 360, layer: CAPA,
    };
    for (const [entidad, exacta] of [
      [circulo("c", 10), Math.PI * 100],
      [elipse, Math.PI * 20 * 10],
    ] as const) {
      const camino = cadEntityBoundaryPaths(entidad)[0];
      assert.equal(camino.points.length, 193);
      assert.equal(camino.closed, true);
      const built = anillosDe([entidad]);
      assert.equal(built.loops.length, 1);
      const area = cadHatchRegionArea([built.loops[0]]);
      assert.ok(desvio(area, exacta) < 2e-4, `${entidad.type}: área ${area} contra ${exacta}`);
    }
  },
});

caso({
  id: "contorno-curvo/resolucion-independiente-de-la-vista",
  entrada: "el mismo contorno curvo resuelto dos veces seguidas",
  criterio: "corrige",
  publicado:
    "el teselado es IDÉNTICO punto a punto. No es pulcritud: si la resolución dependiera del zoom, el contorno creado y el regenerado serían distintos y el primer movimiento del arco cambiaría el relleno sin que nadie tocara el patrón. El mismo dibujo mediría distinto según quién lo hizo.",
  comprobar: () => {
    const entidad = circulo("c", 137.5);
    assert.deepEqual(cadEntityBoundaryPaths(entidad)[0].points, cadEntityBoundaryPaths(entidad)[0].points);
    assert.equal(
      cadBoundarySignedArea(anillosDe([entidad]).loops[0]),
      cadBoundarySignedArea(anillosDe([entidad]).loops[0]),
    );
  },
});

caso({
  id: "contorno-curvo/spline-cerrada-se-cierra-con-cuerda",
  entrada: "una SPLINE cúbica marcada como cerrada, con cuatro puntos de control en un cuadrado de 20",
  criterio: "degrada",
  publicado:
    "el teselado va del primer punto de control al último y NO vuelve por la curva: el primer punto es (0,0), el último (0,20) y el anillo se cierra con una CUERDA recta de 20 unidades, dando 239,99 de área. La degradación es coherente —el renderizador dibuja esa misma cuerda, así que el relleno coincide con lo que se ve— pero no es lo que haría una spline periódica, y por eso se declara aquí en vez de en una nota.",
  comprobar: () => {
    const spline: CadEntity = {
      id: "spl", type: "spline", degree: 3, closed: true, knots: [], layer: CAPA,
      controlPoints: [
        { x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }, { x: 20, y: 20, z: 0 }, { x: 0, y: 20, z: 0 },
      ],
    };
    const camino = cadEntityBoundaryPaths(spline)[0];
    assert.equal(camino.closed, true);
    const primero = camino.points[0];
    const ultimo = camino.points[camino.points.length - 1];
    assert.deepEqual(primero, { x: 0, y: 0 });
    assert.deepEqual(ultimo, { x: 0, y: 20 });
    assert.equal(Math.hypot(primero.x - ultimo.x, primero.y - ultimo.y), 20);
    const built = anillosDe([spline]);
    assert.equal(built.loops.length, 1);
    assert.ok(Math.abs(Math.abs(cadBoundarySignedArea(built.loops[0])) - 239.99) < 0.01);
  },
});

// FAMILIA: islas anidadas

caso({
  id: "islas-anidadas/cuatro-niveles-rectos",
  entrada: "cuatro cuadrados concéntricos de 100, 80, 60 y 40, pinchando fuera de todos",
  criterio: "corrige",
  publicado:
    "área 5600 = 10000 − 6400 + 3600 − 1600. El signo ALTERNA con la profundidad, que es como lo dibuja el renderizador. La fórmula anterior —exterior menos todas las islas— daba −1600: un área negativa publicada como medida.",
  comprobar: () => {
    const region = resolveCadHatchRegion(CUATRO_NIVELES, { x: 5, y: 5 }, "normal");
    assert.equal(region.length, 4);
    assert.equal(cadHatchRegionArea(region), 5600);
    assert.ok(cadHatchRegionArea(region) > 0, "un área rellenada no puede ser negativa");
  },
});

caso({
  id: "islas-anidadas/la-medida-coincide-con-el-dibujo",
  entrada: "los mismos cuatro niveles, preguntando anillo por anillo",
  criterio: "corrige",
  publicado:
    "`hatchRegionContainsPoint` dice relleno-vacío-relleno-vacío del exterior hacia dentro, y la suma de los anillos que declara RELLENOS es exactamente el área medida. Medir y dibujar tienen que dar lo mismo o una de las dos miente.",
  comprobar: () => {
    const region = resolveCadHatchRegion(CUATRO_NIVELES, { x: 5, y: 5 }, "normal");
    const relleno = (x: number, y: number) => hatchRegionContainsPoint(region, { x, y }, "normal");
    assert.deepEqual(
      [relleno(5, 5), relleno(15, 15), relleno(25, 25), relleno(50, 50)],
      [true, false, true, false],
    );
    // Anillos rellenos: el de fuera (10000−6400) y el tercero (3600−1600).
    assert.equal(cadHatchRegionArea(region), 10000 - 6400 + (3600 - 1600));
  },
});

caso({
  id: "islas-anidadas/tres-anillos-curvos-por-la-orden",
  entrada: "tres CIRCLE concéntricos de radio 100, 70 y 40, sombreados con la orden HATCH de verdad",
  criterio: "degrada",
  publicado:
    "la orden escribe UN sombreado con los TRES contornos y las tres entidades como `boundaryRefs`, y mide 21044,91 frente a los 21048,67 exactos de π(100²−70²+40²): otra vez 1,78e-4, el mismo error de teselado. Las islas curvas anidadas no pierden nada más que la curva.",
  comprobar: () => {
    const anillos = [circulo("c1", 100), circulo("c2", 70), circulo("c3", 40)];
    const sombreado = sombreadoDe(ordenar("HATCH", [pinchar(90, 0)], documento(anillos)));
    assert.ok(sombreado, "la orden tenía que escribir un sombreado");
    assert.equal(sombreado!.boundaries.length, 3);
    assert.deepEqual(new Set(sombreado!.boundaryRefs), new Set(["c1", "c2", "c3"]));
    const area = cadHatchRegionArea(sombreado!.boundaries.map((b) => b.map((p) => ({ x: p.x, y: p.y }))));
    assert.ok(desvio(area, Math.PI * (10000 - 4900 + 1600)) < 2e-4, `área ${area}`);
  },
});

caso({
  id: "islas-anidadas/estilo-exterior-y-estilo-ignorar",
  entrada: "los cuatro niveles resueltos con estilo `exterior` y con estilo `ignorar`",
  criterio: "corrige",
  publicado:
    "`exterior` conserva sólo el PRIMER nivel de islas —dos anillos, área 3600— y `ignorar` se queda con el contorno exterior a secas —un anillo, área 10000—. Las tres cifras (5600, 3600, 10000) son distintas y ninguna se obtiene de otra por descuido.",
  comprobar: () => {
    const exterior = resolveCadHatchRegion(CUATRO_NIVELES, { x: 5, y: 5 }, "outer");
    assert.equal(exterior.length, 2);
    assert.equal(cadHatchRegionArea(exterior), 3600);
    const ignorar = resolveCadHatchRegion(CUATRO_NIVELES, { x: 5, y: 5 }, "ignore");
    assert.equal(ignorar.length, 1);
    assert.equal(cadHatchRegionArea(ignorar), 10000);
  },
});

// FAMILIA: islas que tocan el contorno

caso({
  id: "isla-que-toca/comparte-un-lado-entero",
  entrada: "un cuadrado de 50 con una isla de 20×10 apoyada en su lado izquierdo",
  criterio: "corrige",
  publicado:
    "dos anillos y área 2300 = 2500 − 200. Apoyarse en el contorno no impide ser isla, y el hueco se descuenta entero. La profundidad se decide por los PUNTOS MEDIOS de los lados de la isla: sus vértices están sobre la frontera y ahí la regla par/impar no dice ni dentro ni fuera.",
  comprobar: () => {
    const region = resolveCadHatchRegion(
      [cuadrado(0, 0, 50), [{ x: 0, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 0, y: 20 }]],
      { x: 40, y: 40 },
      "normal",
    );
    assert.equal(region.length, 2);
    assert.equal(cadHatchRegionArea(region), 2300);
  },
});

caso({
  id: "isla-que-toca/comparte-un-solo-vertice",
  entrada: "un cuadrado de 50 con un triángulo isla apoyado en su esquina inferior izquierda",
  criterio: "corrige",
  publicado:
    "área 2450 = 2500 − 50. Tocar en un punto no es cruzar: el corpus lo separa a propósito del caso de las islas que se cruzan, porque la diferencia entre los dos es toda la diferencia entre una medida buena y un error.",
  comprobar: () => {
    const region = resolveCadHatchRegion(
      [cuadrado(0, 0, 50), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]],
      { x: 40, y: 40 },
      "normal",
    );
    assert.equal(cadHatchRegionArea(region), 2450);
  },
});

caso({
  id: "isla-que-toca/dos-islas-que-se-tocan-entre-si",
  entrada: "dos islas de 10×10 pegadas por un lado dentro del cuadrado de 50",
  criterio: "corrige",
  publicado:
    "área 2300 = 2500 − 100 − 100. Compartir un lado NO es cruzarse —`cadBoundariesCross` lo dice— así que las dos se descuentan enteras y no hay ambigüedad que rechazar.",
  comprobar: () => {
    const izquierda = cuadrado(10, 10, 10);
    const derecha = cuadrado(20, 10, 10);
    assert.equal(cadBoundariesCross(izquierda, derecha), false);
    const region = resolveCadHatchRegion([cuadrado(0, 0, 50), izquierda, derecha], { x: 45, y: 45 }, "normal");
    assert.equal(cadHatchRegionArea(region), 2300);
  },
});

// FAMILIA: islas que se salen

caso({
  id: "isla-que-se-sale/mitad-fuera",
  entrada: "una isla de la que sólo la mitad cae dentro del contorno",
  criterio: "degrada",
  publicado:
    "se DESCARTA entera y el área queda en 2500, la del contorno completo: la pertenencia se decide por el centroide de la isla, y el suyo cae fuera. AutoCAD recortaría la isla por el contorno. Se declara porque el fallo es hacia el lado seguro —sale relleno de más, que se ve— y no hacia el que miente en la tabla de acabados.",
  comprobar: () => {
    const region = resolveCadHatchRegion(
      [cuadrado(0, 0, 50), [{ x: 25, y: 25 }, { x: 100, y: 25 }, { x: 100, y: 40 }, { x: 25, y: 40 }]],
      { x: 5, y: 5 },
      "normal",
    );
    assert.equal(region.length, 1);
    assert.equal(cadHatchRegionArea(region), 2500);
  },
});

caso({
  id: "isla-que-se-sale/medida-de-una-region-con-islas-cruzadas",
  entrada: "una región cuyos dos anillos se cruzan de verdad, pasada a medir",
  criterio: "rechaza",
  publicado:
    "`CadHatchRegionError` con los ÍNDICES de los dos anillos. El trozo común queda relleno por paridad y ninguna suma de áreas completas lo recoge: antes salía 1700 donde la verdad es 1900, y ese número acaba en una tabla de acabados y de ahí en un pedido de material.",
  comprobar: () => {
    const error = (() => {
      try {
        cadHatchRegionArea([cuadrado(0, 0, 50), cuadrado(10, 10, 20), cuadrado(20, 20, 20)]);
        return null;
      } catch (problema) {
        return problema;
      }
    })();
    assert.ok(error instanceof CadHatchRegionError, "tiene que ser el error tipado del sombreado");
    assert.match((error as Error).message, /se cruzan entre sí/);
  },
});

// FAMILIA: contornos abiertos

caso({
  id: "contorno-abierto/extremos-sueltos",
  entrada: "una polilínea de tres vértices sin cerrar, pinchando dentro de su ángulo",
  criterio: "rechaza",
  publicado:
    "cero anillos, la entidad NOMBRADA en `openSourceIds` y la orden se niega con el consejo correcto: cerrar el perímetro. No se rellena la envolvente ni se cierra por la cuerda.",
  comprobar: () => {
    const abierta = polilinea("ab", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], false);
    const built = anillosDe([abierta]);
    assert.equal(built.loops.length, 0);
    assert.deepEqual(built.openSourceIds, ["ab"]);
    assert.match(mensajeDe(ordenar("HATCH", [pinchar(50, 20)], documento([abierta]))), /contorno cerrado/);
  },
});

caso({
  id: "contorno-abierto/hueco-mayor-que-la-tolerancia",
  entrada: "un rectángulo de cuatro tramos con una esquina separada 1e-3",
  criterio: "rechaza",
  publicado:
    "cero anillos y los cuatro tramos en `openSourceIds`. La tolerancia de cosido es 1e-4 y no se estira: soldar un hueco de 1e-3 sería inventar el cierre, y el sombreado saldría de una región que el dibujante no delimitó.",
  comprobar: () => {
    const built = stitchCadBoundaryPaths([
      { sourceId: "a", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false },
      { sourceId: "b", points: [{ x: 10, y: 1e-3 }, { x: 10, y: 10 }], closed: false },
      { sourceId: "c", points: [{ x: 10, y: 10 }, { x: 0, y: 10 }], closed: false },
      { sourceId: "d", points: [{ x: 0, y: 10 }, { x: 0, y: 0 }], closed: false },
    ]);
    assert.equal(built.loops.length, 0);
    assert.equal(built.openSourceIds.length, 4);
  },
});

// FAMILIA: contornos autointersecantes

caso({
  id: "autointersecante/pajarita-por-la-orden",
  entrada: "una polilínea cerrada en pajarita, sombreada con la orden HATCH de verdad",
  criterio: "rechaza",
  publicado:
    "la orden se niega y NOMBRA la entidad culpable. El mensaje anterior era «cierra el perímetro», que es un consejo equivocado: el perímetro está cerrado, lo que pasa es que se corta, y el dibujante se ponía a buscar un hueco inexistente. Antes de eso, la pajarita SE SOMBREABA y el relleno medía cero.",
  comprobar: () => {
    const pajarita = polilinea("paj", [
      { x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 },
    ]);
    const mensaje = mensajeDe(ordenar("HATCH", [pinchar(50, 20)], documento([pajarita])));
    assert.match(mensaje, /se cruza consigo mismo/);
    assert.match(mensaje, /paj/);
    const anillo = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    assert.equal(cadBoundarySelfIntersects(anillo), true);
    assert.equal(resolveCadHatchRegion([anillo], { x: 50, y: 50 }, "normal").length, 0);
  },
});

caso({
  id: "autointersecante/figura-de-ocho",
  entrada: "un cuadrilátero recorrido en orden cruzado, con dos lóbulos de área desigual",
  criterio: "rechaza",
  publicado:
    "también se detecta y la región sale vacía. Importa que sea el mismo desenlace que la pajarita: con lóbulos desiguales el área firmada NO es cero, así que un filtro que sólo mirara el área lo habría dejado pasar con un número que no corresponde a ninguna superficie.",
  comprobar: () => {
    const ocho = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 20 }];
    assert.equal(cadBoundarySelfIntersects(ocho), true);
    assert.equal(cadBoundarySignedArea(ocho), 50);
    assert.equal(resolveCadHatchRegion([ocho], { x: 5, y: 2 }, "normal").length, 0);
  },
});

caso({
  id: "autointersecante/sin-falsos-positivos",
  entrada: "un cuadrado, un círculo teselado a 192 tramos, una isla en U y los cuatro niveles anidados",
  criterio: "corrige",
  publicado:
    "NINGUNO se declara autointersecante. Es la mitad que importa de la comprobación: un falso positivo aquí no da un aviso, da un sombreado que se niega a existir sobre geometría perfectamente buena, y eso se lee como que el producto no sabe rellenar.",
  comprobar: () => {
    const enU = [
      { x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 15 }, { x: 20, y: 15 },
      { x: 20, y: 35 }, { x: 40, y: 35 }, { x: 40, y: 40 }, { x: 10, y: 40 },
    ];
    for (const anillo of [cuadrado(0, 0, 10), cadEntityBoundaryPaths(circulo("c", 10))[0].points, enU, ...CUATRO_NIVELES])
      assert.equal(cadBoundarySelfIntersects(anillo), false);
  },
});

caso({
  id: "autointersecante/tope-de-vertices",
  entrada: "un contorno de 2051 vértices que SÍ se cruza, con el tope por defecto y con uno alto",
  criterio: "degrada",
  publicado:
    `por encima de ${CAD_SELF_INTERSECTION_BUDGET} vértices NO se busca el cruce y se contesta «no se cruza»: es el único punto de esta comprobación que falla hacia el lado abierto, y se declara aquí en vez de esconderse. La búsqueda es cuadrática y corre en el hilo de la interfaz — medido en este árbol, 22 ms para un anillo justo en el tope, y un editor congelado es peor síntoma que un sombreado dudoso. Con el tope subido a mano, el mismo contorno se detecta.`,
  comprobar: () => {
    const puntos: CadPoint2[] = [];
    for (let index = 0; index < CAD_SELF_INTERSECTION_BUDGET + 1; index += 1)
      puntos.push({ x: index, y: 0 });
    puntos.push({ x: CAD_SELF_INTERSECTION_BUDGET, y: 7 });
    puntos.push({ x: 0, y: -13 });
    assert.ok(puntos.length > CAD_SELF_INTERSECTION_BUDGET);
    assert.equal(cadBoundarySelfIntersects(puntos), false);
    assert.equal(cadBoundarySelfIntersects(puntos, 1e6), true);
  },
});

// FAMILIA: asociatividad del contorno curvo

caso({
  id: "asociatividad/el-contorno-curvo-sobrevive-al-cosido",
  entrada: "el semidisco cosido dos veces, como al crear y al regenerar",
  criterio: "corrige",
  publicado:
    "los dos cosidos dan el MISMO anillo, punto a punto. Es la condición para que la asociatividad signifique algo: si la orden teselara distinto que el regenerador, el primer movimiento del arco cambiaría el relleno sin que nadie tocara el patrón.",
  comprobar: () => {
    const arco: CadEntity = {
      id: "arco", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 10,
      startAngle: 0, endAngle: 180, layer: CAPA,
    };
    const cuerda: CadEntity = {
      id: "cuerda", type: "line", start: { x: -10, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: CAPA,
    };
    assert.deepEqual(anillosDe([arco, cuerda]).loops, anillosDe([arco, cuerda]).loops);
  },
});

caso({
  id: "asociatividad/isla-curva-dentro-de-contorno-curvo",
  entrada: "el semidisco con un círculo de radio 2 dentro, por el cosido completo",
  criterio: "degrada",
  publicado:
    "dos anillos y área 144,487 = 157,052 − 12,564, con el mismo 1,5e-4 de desvío frente a los 144,513 exactos. Una isla curva dentro de un contorno curvo no acumula error: cada curva paga su teselado y nada más.",
  comprobar: () => {
    const arco: CadEntity = {
      id: "arco", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 10,
      startAngle: 0, endAngle: 180, layer: CAPA,
    };
    const cuerda: CadEntity = {
      id: "cuerda", type: "line", start: { x: -10, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: CAPA,
    };
    const built = anillosDe([arco, cuerda, circulo("isla", 2, 0, 4)]);
    assert.equal(built.loops.length, 2);
    const area = cadHatchRegionArea(resolveCadHatchRegion(built.loops, { x: 0, y: 1 }, "normal"));
    assert.ok(desvio(area, (Math.PI * 100) / 2 - Math.PI * 4) < 2e-4, `área ${area}`);
  },
});

correr("hatch-islands-corpus");
