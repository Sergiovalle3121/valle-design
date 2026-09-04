/**
 * LOS CASOS que el harness del oráculo escribe y hace convertir — la mitad
 * "qué dibujos" del round-trip contra ODA File Converter.
 *
 * Viven aparte de `oda-roundtrip.mjs` desde el 2026-09-01, cuando el intake
 * del HATCH sólido empujó aquel archivo por encima del presupuesto de
 * monolito. La costura tiene sentido propio y no es un corte por tamaño: allá
 * queda el ARNÉS —escribir, invocar el conversor, cotejar campo a campo y
 * redactar la evidencia—, que no cambia al añadir un caso; aquí quedan los
 * dibujos y lo que se espera de cada uno, que es lo único que crece cuando el
 * writer aprende una clase más.
 *
 * Cada entidad se declara UNA vez y se reutiliza en el caso y en su
 * `expectedEntities`: si el dibujo escrito y el esperado se declararan por
 * separado podrían divergir sin que nada lo viera.
 */

const ascii = (text) => [...text].map((c) => c.charCodeAt(0));
const utf = (bytes) => String.fromCharCode(...(bytes ?? []));

// ---------------------------------------------------------------------------
// Los casos: geometría escrita y expectativa contra el DXF regenerado.
// ---------------------------------------------------------------------------

const LINE = {
  kind: "line",
  start: { x: 1.5, y: 2.5, z: 0 },
  end: { x: 40, y: 12.25, z: 0 },
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};
const POINT = {
  kind: "point",
  position: { x: -6, y: 8.5, z: 0 },
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  xAxisAngle: 0,
};
const CIRCLE = {
  kind: "circle",
  center: { x: 10, y: 10, z: 0 },
  radius: 4.5,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};
const ARC = {
  kind: "arc",
  center: { x: -3, y: 7, z: 0 },
  radius: 2.25,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  startAngle: 0.25,
  endAngle: 2.5,
};
/**
 * ELIPSE RECORTADA A PROPÓSITO, no una vuelta entera. El camino público
 * aprendió a escribirla el 2026-09-01, y el fallo que más fácilmente se cuela
 * ahí es de UNIDADES —grados donde tocan radianes—: una elipse completa
 * disimularía ese fallo, y un cuarto de elipse lo delata ante el lector ajeno.
 */
const ELLIPSE = {
  kind: "ellipse",
  center: { x: 20, y: 15, z: 0 },
  majorAxisEndpoint: { x: 8, y: 0, z: 0 },
  extrusion: { x: 0, y: 0, z: 1 },
  axisRatio: 0.5,
  startAngle: 0,
  endAngle: Math.PI / 2,
};
/**
 * MTEXT CON ANCLAJE AL CENTRO Y GIRO, no el caso por defecto. El camino
 * público aprendió a escribirlo el 2026-09-02, y lo que ahí puede fallar sin
 * que ninguna prueba propia lo note es la SEMÁNTICA del anclaje: el valor 5 se
 * midió contra el oráculo DXF del corpus, pero que un lector AJENO ancle de
 * verdad el párrafo en su centro sólo lo dice ese lector. Un MTEXT con anclaje
 * 1 y giro 0 —el defecto— no preguntaría nada.
 */
const MTEXT = {
  kind: "mtext",
  insertion: { x: 10, y: 80, z: 0 },
  extrusion: { x: 0, y: 0, z: 1 },
  xAxisDirection: { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6), z: 0 },
  rectWidth: 140,
  height: 5,
  attachment: 5,
  drawingDirection: 1,
  extentsHeight: 0,
  extentsWidth: 0,
  valueBytes: ascii("NOTAS GENERALES"),
  lineSpacingStyle: 1,
  lineSpacingFactor: 1.5,
  trailingBit: 0,
};
/**
 * HATCH DE RELLENO SÓLIDO. Es la clase con más decisiones de AUTORÍA de todo
 * el harness —asociatividad, estilo, tipo de patrón y puntos semilla no viajan
 * en el canónico y se escriben en su valor neutro—, y ninguna de esas
 * decisiones la puede validar el round-trip propio: el lector propio acepta lo
 * que el writer propio escriba. Sólo un lector AJENO dice si un sombreado con
 * cero semillas y estilo 0 es un sombreado que el resto del mundo abre. Por
 * eso este caso importa más que los otros.
 */
const HATCH_SOLIDO = {
  kind: "hatch",
  elevation: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  nameBytes: ascii("SOLID"),
  solidFill: true,
  associative: false,
  paths: [
    {
      kind: "polyline",
      flags: 0,
      closed: true,
      vertices: [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: 8 },
        { x: 0, y: 8 },
      ],
      bulges: [],
      boundaryObjectCount: 0,
    },
  ],
  style: 0,
  patternType: 0,
  angle: undefined,
  scaleOrSpacing: undefined,
  doubleHatch: undefined,
  definitionLines: undefined,
  pixelSize: undefined,
  seedPoints: [],
};
/**
 * HATCH CON TRAMA — el caso que no existía porque la clase no se escribía.
 *
 * Hasta el 2026-09-04 el writer fijaba el bit de relleno sólido a 1 y
 * rechazaba cerrado cualquier otro sombreado: no había nada que preguntarle
 * al conversor. Ahora el bloque de trama —ángulo, escala, doble trama y las
 * líneas de definición con sus trazos— se escribe cuando viaja con la
 * entidad, y el producto lo resuelve contra su tabla propia
 * (`apps/web/src/lib/cad/hatch-pattern-table.ts`).
 *
 * Los valores son la forma que produce esa tabla para EARTH a escala 10: dos
 * familias cruzadas, con corrimiento por fila y secuencia de trazo y hueco.
 * Se eligió una trama de DOS familias CON TRAZOS a propósito: una sola
 * familia continua no distinguiría un recuento bien puesto de uno que el
 * lector interpreta de casualidad.
 *
 * LO QUE ESTE CASO PREGUNTA A ODA, sin adornar: si un DWG con este bloque de
 * trama abre y convierte limpio, y si el sombreado sigue siendo un sombreado
 * con ESE nombre y ESOS contornos. El cotejo campo a campo del oráculo
 * proyecta del DXF el nombre, el bit de sólido, el recuento de caminos y los
 * vértices — NO las líneas de definición. Que las líneas vuelvan idénticas lo
 * mide el round-trip propio (`hatch-pattern-write.spec.ts`) y el arnés de
 * re-escritura del corpus sobre los dos sombreados con trama ajenos; que otro
 * programa DIBUJE esa trama sigue siendo pregunta abierta, y se dice.
 */
const HATCH_TRAMA = {
  kind: "hatch",
  elevation: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  nameBytes: ascii("EARTH"),
  solidFill: false,
  associative: false,
  paths: [
    {
      kind: "polyline",
      flags: 0,
      closed: true,
      vertices: [
        { x: 60, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 40 },
        { x: 60, y: 40 },
      ],
      bulges: [],
      boundaryObjectCount: 0,
    },
  ],
  style: 0,
  patternType: 0,
  // El GIRO del patrón, no el ángulo de sus rayas: EARTH sin girar es 0.
  angle: 0,
  scaleOrSpacing: 10,
  doubleHatch: false,
  definitionLines: [
    {
      angle: 0,
      basePoint: { x: 0, y: 0 },
      offset: { x: 10, y: 10 },
      dashes: [10, -10],
    },
    {
      angle: Math.PI / 2,
      basePoint: { x: 0, y: 0 },
      offset: { x: -10, y: 10 },
      dashes: [10, -10],
    },
  ],
  pixelSize: undefined,
  seedPoints: [],
};
const TEXT = {
  kind: "text",
  insertion: { x: 5, y: 6 },
  elevation: undefined,
  alignment: undefined,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  obliqueAngle: undefined,
  rotation: undefined,
  height: 0.35,
  widthFactor: undefined,
  valueBytes: ascii("VALLE"),
  generation: undefined,
  horizontalAlignment: undefined,
  verticalAlignment: undefined,
};
const LWPOLYLINE = {
  kind: "lwpolyline",
  closed: true,
  vertices: [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 5 },
    { x: 0, y: 5 },
  ],
  bulges: undefined,
  widths: undefined,
  constantWidth: undefined,
  elevation: undefined,
  thickness: undefined,
  extrusion: undefined,
};
const INSERT = {
  kind: "insert",
  position: { x: 30, y: 4, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  rotation: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  attributesFollow: false,
};
/**
 * EL MISMO INSERT, PERO CON RÓTULO. `attributesFollow` a 1 es una promesa: el
 * lector ajeno va a buscar los ATTRIB y el SEQEND por el flujo de handles del
 * INSERT. Este caso es el que pregunta si esa promesa se cumple.
 */
const INSERT_CON_ATRIBUTOS = { ...INSERT, position: { x: 30, y: 40, z: 0 }, attributesFollow: true };
/** Un ATTRIB con los campos que un cuadro de rótulo real usa. */
const attrib = (tag, value, insertion, height) => ({
  kind: "attrib",
  insertion,
  elevation: undefined,
  alignment: undefined,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
  obliqueAngle: undefined,
  rotation: undefined,
  height,
  widthFactor: undefined,
  valueBytes: ascii(value),
  generation: undefined,
  horizontalAlignment: undefined,
  verticalAlignment: undefined,
  tagBytes: ascii(tag),
  fieldLength: 0,
  attributeFlags: 0,
});
const ATTRIB_PLANO = attrib("PLANO", "PLANTA BAJA", { x: 32, y: 46 }, 2.5);
const ATTRIB_ESCALA = attrib("ESCALA", "1:50", { x: 32, y: 42 }, 2);

const CASES = [
  {
    name: "vacio",
    options: {},
    expectedLayers: [{ name: "0", color: 7 }],
    expectedEntities: [],
    expectedBlocks: {},
  },
  {
    name: "capa-linea",
    options: {
      layers: [{ name: ascii("MUROS"), colorIndex: 4 }],
      entities: [{ entity: LINE, layerIndex: 1 }],
    },
    expectedLayers: [
      { name: "0", color: 7 },
      { name: "MUROS", color: 4 },
    ],
    expectedEntities: [{ kind: "line", layer: "MUROS", entity: LINE }],
    expectedBlocks: {},
  },
  {
    name: "figuras",
    options: {
      entities: [
        { entity: POINT },
        { entity: CIRCLE },
        { entity: ARC },
        { entity: TEXT },
        { entity: LWPOLYLINE },
      ],
    },
    expectedLayers: [{ name: "0", color: 7 }],
    expectedEntities: [
      { kind: "point", layer: "0", entity: POINT },
      { kind: "circle", layer: "0", entity: CIRCLE },
      { kind: "arc", layer: "0", entity: ARC },
      { kind: "text", layer: "0", entity: TEXT },
      { kind: "lwpolyline", layer: "0", entity: LWPOLYLINE },
    ],
    expectedBlocks: {},
  },
  {
    // PATRÓN DE TIPO DE LÍNEA ANTE EL ORÁCULO. Hasta el 2026-09-01 el archivo
    // sólo llevaba Continuous, así que ningún caso ejercitaba un patrón. Los
    // valores son los del corpus real (`04-capas`: TRAZOS, longitud 1, trazos
    // [0.75, -0.25]), no unos inventados.
    //
    // Este caso SÍ lo comprueba el oráculo campo a campo: su parser DXF lee la
    // tabla LTYPE con su longitud y sus trazos (`dxf-oracle.mjs` ya los
    // extrae), así que si el patrón que escribimos no fuera el que dijimos, el
    // cotejo lo diría.
    name: "capa-tipo-de-linea",
    options: {
      linetypes: [
        { name: ascii("TRAZOS"), patternLength: 1, dashes: [{ length: 0.75 }, { length: -0.25 }] },
      ],
      layers: [{ name: ascii("EJES"), colorIndex: 2, linetypeName: "TRAZOS" }],
      entities: [{ entity: LINE, layerIndex: 1 }],
    },
    expectedLayers: [
      { name: "0", color: 7 },
      { name: "EJES", color: 2 },
    ],
    expectedEntities: [{ kind: "line", layer: "EJES", entity: LINE }],
    expectedBlocks: {},
  },
  {
    // EL SOMBREADO SÓLIDO ANTE EL LECTOR AJENO — el caso más necesario del
    // harness. El writer aprendió a emitir HATCH el 2026-09-01, pero SÓLO el
    // de relleno sólido: el de patrón llevaría un bloque de definición
    // (ángulo, escala, líneas con trazos) que el canónico no transporta y que
    // no se deduce de los contornos, así que se declara en vez de inventarse.
    //
    // Lo que este caso pregunta a ODA y ninguna prueba propia puede responder:
    // si un sombreado escrito con CERO puntos semilla, estilo 0, tipo de
    // patrón 0 y sin asociatividad es un sombreado que otro programa abre y
    // convierte. El round-trip propio sólo demuestra que nuestro lector
    // entiende a nuestro writer.
    name: "sombreado-solido",
    options: {
      layers: [{ name: ascii("RELLENOS"), colorIndex: 6 }],
      entities: [{ entity: HATCH_SOLIDO, layerIndex: 1 }],
    },
    expectedLayers: [
      { name: "0", color: 7 },
      { name: "RELLENOS", color: 6 },
    ],
    expectedEntities: [{ kind: "hatch", layer: "RELLENOS", entity: HATCH_SOLIDO }],
    expectedBlocks: {},
  },
  {
    // EL SOMBREADO CON TRAMA ANTE EL LECTOR AJENO — el hueco que dejaba el
    // caso de al lado. `sombreado-solido` pregunta por el relleno; éste
    // pregunta por la trama, que es la parte del cuerpo HATCH que el writer
    // no escribía y que ninguna prueba propia puede validar sola: nuestro
    // lector acepta lo que nuestro writer escriba, y un error simétrico en
    // los dos seguiría invisible.
    name: "sombreado-patron",
    options: {
      layers: [{ name: ascii("TRAMAS"), colorIndex: 3 }],
      entities: [{ entity: HATCH_TRAMA, layerIndex: 1 }],
    },
    expectedLayers: [
      { name: "0", color: 7 },
      { name: "TRAMAS", color: 3 },
    ],
    expectedEntities: [{ kind: "hatch", layer: "TRAMAS", entity: HATCH_TRAMA }],
    expectedBlocks: {},
  },
  {
    // EL PÁRRAFO ANTE EL LECTOR AJENO. El writer interno emitía MTEXT desde
    // hacía olas; lo que faltaba para enrutarlo por el camino público era
    // saber QUÉ SIGNIFICA el número del anclaje, que el hecho registrado de la
    // fuente no dice: da la disposición del campo, no su semántica. Se midió
    // contra el oráculo DXF del corpus (anclajes 1 y 5, cinco parejas, una
    // sola hipótesis superviviente).
    //
    // Lo que este caso pregunta a ODA y ninguna prueba propia puede responder:
    // si un párrafo escrito con anclaje 5, extents a cero y estilo de
    // interlineado 1 es un párrafo que otro programa abre anclado donde
    // dijimos. El round-trip propio sólo demuestra que nuestro lector entiende
    // a nuestro writer.
    name: "parrafo-mtext",
    options: {
      layers: [{ name: ascii("TEXTOS"), colorIndex: 2 }],
      entities: [{ entity: MTEXT, layerIndex: 1 }],
    },
    expectedLayers: [
      { name: "0", color: 7 },
      { name: "TEXTOS", color: 2 },
    ],
    expectedEntities: [{ kind: "mtext", layer: "TEXTOS", entity: MTEXT }],
    expectedBlocks: {},
  },
  {
    // LA ELIPSE ANTE EL LECTOR AJENO. Hasta el 2026-09-01 el camino público
    // NO la escribía: la mandaba al `default` de `canonical-to-dwg.ts` y la
    // declaraba «no escribible», aunque el writer interno la emitía desde
    // hacía olas. Al enrutarla apareció una trampa de unidades —el documento
    // del producto lleva los parámetros en GRADOS y el canónico en RADIANES—,
    // y este caso es el que pregunta a ODA si el arco que escribimos es el que
    // dijimos: el gemelo público de este mismo caso pasa por
    // `writeCanonicalDwg`, que es donde vive el enrutado nuevo.
    name: "elipse",
    options: {
      layers: [{ name: ascii("CURVAS"), colorIndex: 3 }],
      entities: [{ entity: ELLIPSE, layerIndex: 1 }],
    },
    expectedLayers: [
      { name: "0", color: 7 },
      { name: "CURVAS", color: 3 },
    ],
    expectedEntities: [{ kind: "ellipse", layer: "CURVAS", entity: ELLIPSE }],
    expectedBlocks: {},
  },
  {
    // ESTADO DE CAPA ANTE EL ORÁCULO. Los otros casos escriben capas normales,
    // así que ninguno ejercitaba lo que el corpus real sí trae: una capa
    // CONGELADA y una BLOQUEADA. Desde el 2026-09-01 el writer las escribe
    // (antes toda capa salía normal, sin declararlo), y este caso es el que
    // pregunta a un lector AJENO si se las cree.
    //
    // El oráculo DXF compara capas por NOMBRE Y COLOR —no por estado, que su
    // parser no proyecta—, así que lo que este caso añade ante ODA es que el
    // archivo con esos bits encendidos sigue siendo un DWG que abre y convierte
    // limpio. Que el estado signifique lo que decimos lo prueba el round-trip
    // propio en `layer-state-write.spec.ts`; que no rompa el archivo, esto.
    name: "capa-estado",
    options: {
      layers: [
        { name: ascii("CONGELADA"), colorIndex: 4, frozen: true },
        { name: ascii("BLOQUEADA"), colorIndex: 5, locked: true },
      ],
      entities: [{ entity: LINE, layerIndex: 1 }],
    },
    expectedLayers: [
      { name: "0", color: 7 },
      { name: "CONGELADA", color: 4 },
      { name: "BLOQUEADA", color: 5 },
    ],
    expectedEntities: [{ kind: "line", layer: "CONGELADA", entity: LINE }],
    expectedBlocks: {},
  },
  {
    // EL CUADRO DE RÓTULO ANTE EL LECTOR AJENO. Hasta el 2026-09-04 el writer
    // fijaba el bit de ATTRIBs a 0 y fallaba CERRADO si el modelo pedía
    // atributos: un INSERT con rótulo no se escribía en absoluto — el bloque
    // entero desaparecía del archivo, no sólo su texto.
    //
    // Lo que este caso pregunta a ODA y ninguna prueba propia puede responder:
    // si los tres handles que el INSERT añade a su flujo —primer ATTRIB y
    // último como punteros blandos, SEQEND como propietario duro— son los que
    // otro programa sigue para encontrar el rótulo. La forma está MEDIDA en
    // los cuatro INSERT con atributos del corpus admitido
    // (`VALLE-CORPUS-INSERT-ATRIBUTOS`), pero medir cómo lo escribe ODA no es
    // lo mismo que comprobar que ODA lee lo que escribimos nosotros.
    //
    // DOS ATRIBUTOS, no uno: con uno solo, primero y último apuntan al mismo
    // handle y la cadena de los ATTRIB queda aislada, así que no se ejercita
    // ni el enlace ±1 entre atributos ni la distinción entre primero y último.
    name: "bloque-con-atributos",
    options: {
      layers: [{ name: ascii("ROTULOS"), colorIndex: 2 }],
      blocks: [{ name: ascii("CAJETIN"), entities: [LWPOLYLINE] }],
      entities: [
        {
          entity: INSERT_CON_ATRIBUTOS,
          insertBlockIndex: 0,
          layerIndex: 1,
          attributes: [{ entity: ATTRIB_PLANO }, { entity: ATTRIB_ESCALA }],
        },
      ],
    },
    expectedLayers: [
      { name: "0", color: 7 },
      { name: "ROTULOS", color: 2 },
    ],
    expectedEntities: [
      {
        kind: "insert",
        layer: "ROTULOS",
        entity: INSERT_CON_ATRIBUTOS,
        block: "CAJETIN",
      },
      { kind: "attrib", layer: "ROTULOS", entity: ATTRIB_PLANO },
      { kind: "attrib", layer: "ROTULOS", entity: ATTRIB_ESCALA },
    ],
    expectedBlocks: {
      CAJETIN: [{ kind: "lwpolyline", entity: LWPOLYLINE }],
    },
  },
  {
    name: "bloque-insert",
    options: {
      blocks: [{ name: ascii("PUERTA"), entities: [LINE, CIRCLE] }],
      entities: [{ entity: INSERT, insertBlockIndex: 0 }],
    },
    expectedLayers: [{ name: "0", color: 7 }],
    expectedEntities: [
      { kind: "insert", layer: "0", entity: INSERT, block: "PUERTA" },
    ],
    expectedBlocks: {
      PUERTA: [
        { kind: "line", entity: LINE },
        { kind: "circle", entity: CIRCLE },
      ],
    },
  },
];

export { ascii, CASES };
