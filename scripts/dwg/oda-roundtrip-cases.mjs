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
