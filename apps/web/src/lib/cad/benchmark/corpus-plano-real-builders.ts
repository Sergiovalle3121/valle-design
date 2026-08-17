/**
 * Mezcla «PLANO REAL»: la planta que un despacho mexicano entrega, no la que
 * luce en un benchmark.
 *
 * ## Por qué existe habiendo ya una mezcla `architecture`
 *
 * La mezcla `architecture` de `corpus-mix-builders.ts` se diseñó para estresar
 * SUBSISTEMAS —expansión de bloques, hatch, atlas— y lo hace bien. Pero su
 * reparto no pretende parecerse a un archivo de trabajo: coloca un 34 % de
 * INSERT, de los cuales el 19 % son puertas. Un plano con una puerta por cada
 * cinco entidades no existe. Está bien como carga hostil dirigida; no sirve
 * para contestar «¿cómo se va a sentir el primer cliente?».
 *
 * Y esa es la pregunta que faltaba. Los presupuestos publicados del CAD se
 * calibran a 100.000 entidades sobre un corpus de LINE/CIRCLE/ARC. Optimizar
 * contra ese número y publicarlo no dice nada sobre un plano de 20.000
 * entidades donde la mitad del trabajo son cotas, sombreados y rótulos, que son
 * justamente los tipos que aquel corpus tiene a CERO.
 *
 * Esta mezcla NO sustituye a ninguna de las dos. Se añade.
 *
 * ## De dónde sale cada proporción — y qué asume
 *
 * Aviso primero, porque importa más que la tabla: **esto es un MODELO
 * declarado, no un censo de archivos reales**. No se ha medido una muestra de
 * DWG de despachos; afirmarlo sería inventarse una fuente. Lo que sí se puede
 * defender es la ARITMÉTICA, y por eso cada peso se deriva de un programa
 * arquitectónico concreto y contable que cualquiera puede discutir número a
 * número.
 *
 * ### El programa que se supone
 *
 * Vivienda unifamiliar entre medianeras, dos niveles, ~180 m², escala 1:50,
 * dibujada con la convención mexicana habitual: cadenas de cotas por eje,
 * achurado de acabados de piso, muro en corte achurado, rotulación de local con
 * área y nivel de piso terminado (N.P.T.). Un archivo de trabajo llega a 20.000
 * entidades porque el prototipo se repite —conjunto habitacional, niveles tipo
 * de un edificio de departamentos—, que es exactamente como un despacho acumula
 * ese tamaño sin dibujar una catedral.
 *
 * ### El recuento, ranura por ranura
 *
 * - **Muros (37 %).** Es la población dominante y la razón de ser de este
 *   perfil. Un tramo de muro NO es una entidad: son dos caras, y cada cara se
 *   parte en cada vano, cada cruce y cada cambio de espesor. Un nivel con ~40
 *   tramos da del orden de 200 segmentos de cara sólo de muro, más jambas y
 *   cierres de vano. De ahí que `muroCara` sea el peso más alto de la tabla
 *   (250) y que sus segmentos sean CORTOS: es lo que distingue un plano real de
 *   una nube de primitivas largas, y lo que carga el índice espacial por celda.
 *   `muroCuerpo` (120) son los muros de carga y pretiles que se dibujan como
 *   polilínea cerrada con espesor.
 * - **Cotas asociativas (13 %).** La convención mexicana pone tres cadenas por
 *   fachada —total, ejes y vanos— en los cuatro lados, más las interiores por
 *   crujía. Son la SEGUNDA población del dibujo, y en el corpus de referencia
 *   están a cero. Peso 130.
 * - **Carpintería y mobiliario como bloques repetidos (14 %).** Puertas (45),
 *   ventanas (40), muebles (30) y sanitarios (25) sobre CUATRO definiciones. La
 *   asimetría —2.800 instancias, 4 definiciones— es el caso arquitectónico de
 *   verdad y lo que mide la expansión de bloque por instancia. Obsérvese que es
 *   menos de la mitad del 34 % de la mezcla `architecture`: por cada puerta hay
 *   una docena de segmentos de muro a su alrededor.
 * - **Acabados achurados (7 %).** Piso (45) y muro en corte (25). Pocos en
 *   número y caros por entidad, que es precisamente la forma que tiene de
 *   escaparse de una media.
 * - **Rotulación (10 %).** Rótulo de local con área (65) y nota técnica —N.P.T.,
 *   claves de acabado— (35). Sostiene el atlas de glifos, que en el corpus de
 *   referencia no se ejercita nunca.
 * - **Ejes y estructura (6 %).** Ejes estructurales largos (40) y columnas (20).
 *   Los ejes son las únicas líneas LARGAS del dibujo, y existen aquí para que la
 *   mezcla no sea uniformemente corta: cruzan muchos tiles y son el caso
 *   incómodo del índice.
 * - **Trazado a mano y detalle (13 %).** Abatimientos y esquinas como arco (60),
 *   luminarias, contactos y registros como círculo (40), huellas de escalera
 *   como polilínea (30). Es lo que un plano tiene y ninguna tabla de bloques
 *   recoge.
 *
 * ### Lo que este modelo asume, dicho para poder discutirlo
 *
 * 1. Que los muros se dibujan por caras y no con un objeto muro paramétrico. Un
 *    despacho que use muros paramétricos tendría MENOS entidades y más
 *    geometría derivada, y su cuello estaría en `wall-joins`, no aquí.
 * 2. Que el mobiliario está mayoritariamente insertado como bloque. Un despacho
 *    que lo explote perdería INSERT y ganaría LINE/ARC: el total no se mueve, el
 *    reparto sí.
 * 3. Que el archivo es de TRABAJO, no de entrega. Un plano listo para imprimir
 *    lleva además marco, pie y cuadro de datos, que son cuatro entidades y no
 *    cambian ninguna proporción.
 * 4. Que 20.000 es el tamaño que importa. Es el extremo alto del rango que este
 *    frente asume (5.000–30.000); medir en el extremo alto y aprobar cubre todo
 *    el rango, medir en el bajo no cubriría nada.
 *
 * ## Determinismo
 *
 * Mismo contrato que el resto de mezclas: pesos enteros sobre 1.000 repartidos
 * por resto mayor —así que «250» es el 25 % EXACTO, no «alrededor del 25 %»— y
 * RNG reproducible para la geometría. La proporción no depende de la semilla.
 * 20.000 es múltiplo de 1.000, luego los pesos se cumplen clavados.
 */
import type {
  CadBlockDefinition,
  CadEntity,
} from "../cad-document";
import { roundCadBenchmarkCoordinate as round } from "./corpus";
import { point, word } from "./corpus-mix-builders";
import type {
  CadCorpusMixEntityBuilder,
  CadCorpusMixSlot,
} from "./corpus-mixes";

/**
 * CUATRO definiciones para 2.800 instancias.
 *
 * Se dibujan a escala real en milímetros —puerta de 90, ventana de 120— porque
 * la caja del INSERT se calcula expandiendo el bloque, y un bloque de tamaño
 * inventado daría cajas que no se parecen a las de un plano y falsearía tanto el
 * reparto por tiles como la selección por ventana.
 */
export function planoRealBlocks(): CadBlockDefinition[] {
  return [
    {
      id: "BLK-PUERTA-90",
      name: "PUERTA-90",
      basePoint: point(0, 0),
      entities: [
        {
          id: "BLK-PUERTA-90-HOJA",
          type: "line",
          start: point(0, 0),
          end: point(90, 0),
          layer: "ARQ-CARP",
        },
        {
          id: "BLK-PUERTA-90-ABAT",
          type: "arc",
          center: point(0, 0),
          radius: 90,
          startAngle: 0,
          endAngle: 90,
          layer: "ARQ-CARP",
        },
        {
          id: "BLK-PUERTA-90-MARCO",
          type: "line",
          start: point(0, 0),
          end: point(0, 14),
          layer: "ARQ-CARP",
        },
      ] as CadEntity[],
    },
    {
      id: "BLK-VENTANA-120",
      name: "VENTANA-120",
      basePoint: point(0, 0),
      entities: [
        {
          id: "BLK-VENTANA-120-MARCO",
          type: "polyline",
          vertices: [point(0, 0), point(120, 0), point(120, 15), point(0, 15)],
          closed: true,
          layer: "ARQ-CARP",
        },
        {
          id: "BLK-VENTANA-120-CRISTAL",
          type: "line",
          start: point(0, 7.5),
          end: point(120, 7.5),
          layer: "ARQ-CARP",
        },
      ] as CadEntity[],
    },
    {
      /** Comedor de cuatro plazas: la mesa y dos sillas enfrentadas. */
      id: "BLK-MUEBLE",
      name: "MUEBLE-COMEDOR",
      basePoint: point(0, 0),
      entities: [
        {
          id: "BLK-MUEBLE-MESA",
          type: "polyline",
          vertices: [point(0, 0), point(160, 0), point(160, 90), point(0, 90)],
          closed: true,
          layer: "ARQ-MOBIL",
        },
        {
          id: "BLK-MUEBLE-SILLA-A",
          type: "polyline",
          vertices: [point(30, -45), point(75, -45), point(75, -5), point(30, -5)],
          closed: true,
          layer: "ARQ-MOBIL",
        },
        {
          id: "BLK-MUEBLE-SILLA-B",
          type: "polyline",
          vertices: [point(30, 95), point(75, 95), point(75, 135), point(30, 135)],
          closed: true,
          layer: "ARQ-MOBIL",
        },
      ] as CadEntity[],
    },
    {
      /** W.C. y lavabo: el bloque de baño que se repite en cada nivel. */
      id: "BLK-SANITARIO",
      name: "SANITARIO-WC",
      basePoint: point(0, 0),
      entities: [
        {
          id: "BLK-SANITARIO-TAZA",
          type: "ellipse",
          center: point(0, 0),
          majorAxis: point(18, 0),
          ratio: 0.72,
          startParameter: 0,
          endParameter: round(Math.PI * 2),
          layer: "ARQ-SANIT",
        },
        {
          id: "BLK-SANITARIO-TANQUE",
          type: "polyline",
          vertices: [point(-20, 18), point(20, 18), point(20, 36), point(-20, 36)],
          closed: true,
          layer: "ARQ-SANIT",
        },
        {
          id: "BLK-SANITARIO-LAVABO",
          type: "arc",
          center: point(70, 10),
          radius: 24,
          startAngle: 180,
          endAngle: 360,
          layer: "ARQ-SANIT",
        },
      ] as CadEntity[],
    },
  ];
}

export function planoRealSlots(): CadCorpusMixSlot[] {
  /**
   * Cara de muro: el segmento CORTO que domina el dibujo.
   *
   * La longitud se saca de una fracción pequeña de la celda (12–45 %) porque un
   * tramo de muro real llega partido por el primer vano que se cruza. Alternar
   * horizontal y vertical por índice reproduce la trama ortogonal de una planta
   * sin necesidad de simular una planta: lo que se mide es el coste de MUCHOS
   * segmentos cortos en poca área, y eso sí se reproduce.
   */
  const muroCara: CadCorpusMixEntityBuilder = ({ index, id, baseX, baseY, cellSize, rng }) => {
    const largo = round(cellSize * (0.12 + rng() * 0.33));
    const desdeX = round(baseX + cellSize * rng() * 0.5);
    const desdeY = round(baseY + cellSize * rng() * 0.5);
    const horizontal = index % 2 === 0;
    return {
      id,
      type: "line",
      start: point(desdeX, desdeY),
      end: horizontal ? point(desdeX + largo, desdeY) : point(desdeX, desdeY + largo),
      layer: "ARQ-MUROS",
    };
  };

  /** Muro de carga o pretil: polilínea cerrada con espesor de 12 a 25 cm. */
  const muroCuerpo: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => {
    const largo = round(cellSize * (0.3 + rng() * 0.4));
    const espesor = round(120 + rng() * 130);
    const desdeX = round(baseX + cellSize * 0.1);
    const desdeY = round(baseY + cellSize * rng() * 0.6);
    return {
      id,
      type: "polyline",
      vertices: [
        { ...point(desdeX, desdeY), startWidth: espesor, endWidth: espesor },
        { ...point(desdeX + largo, desdeY), startWidth: espesor, endWidth: espesor },
        { ...point(desdeX + largo, desdeY + espesor), startWidth: espesor, endWidth: espesor },
        { ...point(desdeX, desdeY + espesor), startWidth: espesor, endWidth: espesor },
      ],
      closed: true,
      layer: "ARQ-MUROS",
    };
  };

  /**
   * Cota de cadena. `precision: 0` y `architectural-tick` son la convención
   * mexicana: milímetros enteros y marca oblicua en vez de flecha.
   */
  const cotaAsociativa: CadCorpusMixEntityBuilder = ({ index, id, baseX, baseY, cellSize, rng }) => {
    const largo = round(cellSize * (0.35 + rng() * 0.5));
    // Tres cadenas escalonadas: total, ejes y vanos, cada una a su separación.
    // Es lo que multiplica las cotas en un plano mexicano.
    const cadena = index % 3;
    // La tercera cadena es la VERTICAL, y por eso sus dos puntos se separan en
    // Y. Una cota declarada sobre el eje Y con los dos puntos a la misma altura
    // mide cero y el generador de geometría no devuelve ni un trazo: engordaría
    // el recuento del corpus dibujando nada, que es justo el corpus mentiroso
    // que este perfil viene a no ser.
    const vertical = cadena === 2;
    return {
      id,
      type: "dimension",
      a: { x: round(baseX + 40), y: round(baseY + 20) },
      b: vertical
        ? { x: round(baseX + 40), y: round(baseY + 20 + largo) }
        : { x: round(baseX + 40 + largo), y: round(baseY + 20) },
      dimensionKind: "linear",
      axis: vertical ? "y" : "x",
      offset: round(90 + cadena * 110),
      units: "mm",
      precision: 0,
      extensionLines: true,
      arrowhead: "architectural-tick",
      layer: "ARQ-COTAS",
    };
  };

  const puerta: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "insert",
    block: "BLK-PUERTA-90",
    insertion: point(baseX + cellSize * 0.18 + rng() * 60, baseY + cellSize * 0.22 + rng() * 60),
    scale: { x: 1, y: 1, z: 1 },
    // Las puertas se colocan en las cuatro orientaciones de la trama, no en un
    // ángulo cualquiera: un giro arbitrario daría cajas mayores que las reales.
    rotation: Math.floor(rng() * 4) * 90,
    layer: "ARQ-CARP",
  });

  const ventana: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "insert",
    block: "BLK-VENTANA-120",
    insertion: point(baseX + cellSize * 0.5, baseY + cellSize * 0.12 + rng() * 80),
    // La ventana se estira al ancho del vano; el alto es el espesor del muro y
    // no se toca. Por eso la escala es NO uniforme, como en el archivo real.
    scale: { x: round(0.7 + rng() * 0.9), y: 1, z: 1 },
    rotation: Math.floor(rng() * 2) * 90,
    layer: "ARQ-CARP",
  });

  const mueble: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "insert",
    block: "BLK-MUEBLE",
    insertion: point(baseX + cellSize * 0.42 + rng() * 70, baseY + cellSize * 0.5 + rng() * 70),
    scale: { x: 1, y: 1, z: 1 },
    rotation: Math.floor(rng() * 4) * 90,
    layer: "ARQ-MOBIL",
  });

  const sanitario: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "insert",
    block: "BLK-SANITARIO",
    insertion: point(baseX + cellSize * 0.72, baseY + cellSize * 0.68 + rng() * 50),
    scale: { x: 1, y: 1, z: 1 },
    rotation: Math.floor(rng() * 4) * 90,
    layer: "ARQ-SANIT",
  });

  /**
   * Acabado de piso. Los patrones son los que se usan: `AR-HBONE` para duela y
   * `NET` para loseta. El hatch es caro por entidad y escaso en número, que es
   * la combinación que se pierde en una media y aparece en un p95.
   */
  const hatchPiso: CadCorpusMixEntityBuilder = ({ index, id, baseX, baseY, cellSize, rng }) => {
    const ancho = round(cellSize * (0.35 + rng() * 0.35));
    const alto = round(cellSize * (0.3 + rng() * 0.35));
    return {
      id,
      type: "hatch",
      pattern: index % 2 === 0 ? "AR-HBONE" : "NET",
      solid: false,
      boundaries: [
        [
          point(baseX + 60, baseY + 60),
          point(baseX + 60 + ancho, baseY + 60),
          point(baseX + 60 + ancho, baseY + 60 + alto),
          point(baseX + 60, baseY + 60 + alto),
        ],
      ],
      scale: round(0.5 + rng() * 0.8),
      angle: Math.floor(rng() * 4) * 45,
      islandStyle: "outer",
      layer: "ARQ-SUELO",
    };
  };

  /** Muro en corte: achurado ANSI31/AR-CONC sobre el espesor del muro. */
  const hatchMuroCorte: CadCorpusMixEntityBuilder = ({ index, id, baseX, baseY, cellSize, rng }) => {
    const largo = round(cellSize * (0.25 + rng() * 0.35));
    const espesor = round(120 + rng() * 130);
    return {
      id,
      type: "hatch",
      pattern: index % 2 === 0 ? "ANSI31" : "AR-CONC",
      solid: false,
      boundaries: [
        [
          point(baseX + 30, baseY + cellSize * 0.8),
          point(baseX + 30 + largo, baseY + cellSize * 0.8),
          point(baseX + 30 + largo, baseY + cellSize * 0.8 + espesor),
          point(baseX + 30, baseY + cellSize * 0.8 + espesor),
        ],
      ],
      scale: round(0.4 + rng() * 0.5),
      angle: 45,
      islandStyle: "outer",
      layer: "ARQ-MUROS",
    };
  };

  /**
   * Rótulo de local: nombre y superficie en dos líneas, que es como se rotula.
   * El alfabeto ancho compartido incluye acentos y `²`, así que el atlas ve los
   * ~90 glifos de un plano en castellano y no los 10 de un corpus de dígitos.
   */
  const rotuloLocal: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "mtext",
    insertion: point(baseX + cellSize * 0.3, baseY + cellSize * 0.55),
    text: `${word(rng, 8)}\n${round(6 + rng() * 26)} m²`,
    width: round(cellSize * 0.45),
    // 2,5 mm de texto a escala 1:50 son 125 mm de dibujo: la altura de rótulo
    // de local que sale de la convención, no un número redondo elegido a ojo.
    height: round(110 + rng() * 40),
    rotation: 0,
    alignment: "top-left",
    layer: "ARQ-ROTUL",
  });

  /** Nota técnica: N.P.T. y clave de acabado, en una línea. */
  const notaTecnica: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "mtext",
    insertion: point(baseX + cellSize * 0.12, baseY + cellSize * 0.86),
    text: `N.P.T. +${round(rng() * 6)} · ${word(rng, 4)}`,
    width: round(cellSize * 0.5),
    height: round(80 + rng() * 25),
    rotation: 0,
    alignment: "top-left",
    layer: "ARQ-ROTUL",
  });

  /**
   * Eje estructural: la única línea LARGA del dibujo. Cruza la celda entera y
   * se sale por los dos lados, así que toca varios tiles a la vez — el caso que
   * un corpus de segmentos cortos nunca produciría y que el índice sufre.
   */
  const ejeEstructural: CadCorpusMixEntityBuilder = ({ index, id, baseX, baseY, cellSize, rng }) => {
    const desplazamiento = round(cellSize * rng());
    const horizontal = index % 2 === 0;
    return {
      id,
      type: "line",
      start: horizontal
        ? point(baseX - cellSize * 0.5, baseY + desplazamiento)
        : point(baseX + desplazamiento, baseY - cellSize * 0.5),
      end: horizontal
        ? point(baseX + cellSize * 1.5, baseY + desplazamiento)
        : point(baseX + desplazamiento, baseY + cellSize * 1.5),
      layer: "ARQ-EJES",
    };
  };

  /** Columna: círculo de 30 cm en el cruce de ejes. */
  const columna: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize }) => ({
    id,
    type: "circle",
    center: point(baseX + cellSize * 0.5, baseY + cellSize * 0.5),
    radius: 150,
    layer: "ARQ-ESTR",
  });

  /** Abatimiento dibujado a mano y esquinas redondeadas de mobiliario fijo. */
  const arcoAbatimiento: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => {
    const desde = round(rng() * 360);
    return {
      id,
      type: "arc",
      center: point(baseX + cellSize * rng(), baseY + cellSize * rng()),
      radius: round(60 + rng() * 240),
      startAngle: desde,
      endAngle: round(desde + 45 + rng() * 180),
      layer: "ARQ-CARP",
    };
  };

  /** Luminarias, contactos y registros: círculos pequeños y numerosos. */
  const detalleCirculo: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => ({
    id,
    type: "circle",
    center: point(baseX + cellSize * rng(), baseY + cellSize * rng()),
    radius: round(25 + rng() * 55),
    layer: "ARQ-INSTA",
  });

  /**
   * Huellas de escalera: una polilínea abierta con una huella por vértice.
   * Ocho a doce peldaños es un tramo entre descansos.
   */
  const escaleraHuella: CadCorpusMixEntityBuilder = ({ id, baseX, baseY, cellSize, rng }) => {
    const peldanos = 8 + Math.floor(rng() * 5);
    const huella = round(cellSize * 0.04);
    const ancho = round(cellSize * 0.25);
    const vertices: Array<{ x: number; y: number; z: number }> = [];
    for (let paso = 0; paso < peldanos; paso += 1) {
      const y = round(baseY + cellSize * 0.3 + paso * huella);
      // Zigzag: sube una huella y recorre el ancho, que es el dibujo de un
      // tramo de escalera en planta.
      vertices.push(point(baseX + cellSize * 0.6 + (paso % 2 === 0 ? 0 : ancho), y));
      vertices.push(point(baseX + cellSize * 0.6 + (paso % 2 === 0 ? ancho : 0), y));
    }
    return {
      id,
      type: "polyline",
      vertices,
      closed: false,
      layer: "ARQ-ESCAL",
    };
  };

  // Suma 1.000. Ver la cabecera para la derivación de cada peso.
  return [
    { weight: 250, build: muroCara },
    { weight: 120, build: muroCuerpo },
    { weight: 130, build: cotaAsociativa },
    { weight: 45, build: puerta },
    { weight: 40, build: ventana },
    { weight: 30, build: mueble },
    { weight: 25, build: sanitario },
    { weight: 45, build: hatchPiso },
    { weight: 25, build: hatchMuroCorte },
    { weight: 65, build: rotuloLocal },
    { weight: 35, build: notaTecnica },
    { weight: 40, build: ejeEstructural },
    { weight: 20, build: columna },
    { weight: 60, build: arcoAbatimiento },
    { weight: 40, build: detalleCirculo },
    { weight: 30, build: escaleraHuella },
  ];
}
