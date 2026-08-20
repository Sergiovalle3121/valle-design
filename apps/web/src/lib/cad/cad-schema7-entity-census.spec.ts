/**
 * CENSO de tipos de entidad en el viaje guardar → abrir, con el esquema 7.
 *
 * ## Por qué este spec existe, y por qué no se parece a los otros
 *
 * La campaña anterior encontró que CINCO tipos de entidad se perdían en
 * silencio al pasar por el disco. No se encontró leyendo el código: se
 * encontró MIDIENDO, porque un tipo que desaparece no rompe nada ruidoso —el
 * documento sigue abriendo, el dibujo sigue pintándose, y lo único que pasa es
 * que faltan cosas que nadie está contando—. Ese fallo es exactamente el que
 * puede repetir una subida de esquema, que es cuando se tocan a la vez el
 * serializador, la migración y la validación del servidor.
 *
 * El esquema 7 estrena OPENING. Este spec es la evidencia de que la subida no
 * se llevó por delante a ninguno de los 26 tipos que ya existían, ni al nuevo.
 *
 * ## El censo es EXHAUSTIVO por construcción, no por diligencia
 *
 * `MUESTRAS` se declara `satisfies Record<CadEntity["type"], CadEntity>`. Eso
 * significa que el COMPILADOR exige una muestra por cada tipo de la unión: el
 * día que alguien añada el tipo 28 sin añadir su muestra, esto no compila. Un
 * censo mantenido a mano se queda corto justo en el tipo que se acaba de meter,
 * que es el que más falta hacía comprobar; éste no puede.
 *
 * ## Qué se afirma, exactamente
 *
 * 1. El censo cubre los 27 tipos y ninguna muestra miente sobre su `type`.
 * 2. Serializar y volver a abrir devuelve el MISMO recuento por tipo. No «el
 *    mismo total»: el mismo recuento POR TIPO, porque un total que cuadra
 *    puede esconder un tipo perdido y otro duplicado.
 * 3. Ninguna entidad cambia de identidad ni de capa por el camino.
 * 4. Un documento guardado con esquema 6 —sin huecos, porque en el 6 no
 *    existían— abre y se declara 7 sin perder ni una entidad.
 * 5. Un documento con esquema 7 y un hueco abre conservando el alojamiento.
 */
import { strict as assert } from "node:assert";
import {
  CAD_DOCUMENT_SCHEMA,
  cadDocumentStats,
  migrateCadDocument,
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
} from "./cad-document";

const P = (x: number, y: number, z = 0) => ({ x, y, z });

/**
 * Una muestra por tipo. Son mínimas a propósito: lo que se mide aquí es la
 * SUPERVIVENCIA del tipo, no la fidelidad de cada campo, que tienen sus specs.
 */
const MUESTRAS = {
  box: { id: "e-box", type: "box", kind: "generic", x: 0, y: 0, w: 10, h: 10, rotation: 0, layer: "0", shape: "rect" },
  station: { id: "e-station", type: "station", x: 5, y: 5, w: 4, h: 4, rotation: 0, layer: "0" },
  text: { id: "e-text", type: "text", x: 1, y: 2, text: "hola", layer: "0" },
  dimension: { id: "e-dim", type: "dimension", a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, dimensionKind: "linear", offset: 20, layer: "0" },
  connector: { id: "e-conn", type: "connector", from: "e-box", to: "e-station", kind: "flow", layer: "0" },
  line: { id: "e-line", type: "line", start: P(0, 0), end: P(100, 0), layer: "0" },
  polyline: { id: "e-pline", type: "polyline", vertices: [P(0, 0), P(50, 0), P(50, 50)], closed: false, layer: "0" },
  circle: { id: "e-circle", type: "circle", center: P(10, 10), radius: 5, layer: "0" },
  arc: { id: "e-arc", type: "arc", center: P(20, 20), radius: 8, startAngle: 0, endAngle: 1.5, layer: "0" },
  ellipse: { id: "e-ellipse", type: "ellipse", center: P(30, 30), majorAxis: P(10, 0), ratio: 0.5, startParameter: 0, endParameter: 6.28, layer: "0" },
  spline: { id: "e-spline", type: "spline", degree: 3, controlPoints: [P(0, 0), P(10, 20), P(20, 0), P(30, 20)], knots: [0, 0, 0, 0, 1, 1, 1, 1], layer: "0" },
  mtext: { id: "e-mtext", type: "mtext", insertion: P(40, 40), text: "párrafo", layer: "0" },
  hatch: { id: "e-hatch", type: "hatch", pattern: "SOLID", solid: true, boundaries: [[P(0, 0), P(10, 0), P(10, 10)]], layer: "0" },
  mleader: { id: "e-mleader", type: "mleader", vertices: [P(0, 0), P(10, 10)], text: "nota", textPosition: P(12, 12), layer: "0" },
  insert: { id: "e-insert", type: "insert", block: "BLOQUE", insertion: P(0, 0), scale: P(1, 1, 1), rotation: 0, layer: "0" },
  point: { id: "e-point", type: "point", position: P(3, 3), layer: "0" },
  xline: { id: "e-xline", type: "xline", basePoint: P(0, 0), direction: P(1, 0), layer: "0" },
  ray: { id: "e-ray", type: "ray", basePoint: P(0, 0), direction: P(0, 1), layer: "0" },
  solid: { id: "e-solid", type: "solid", points: [P(0, 0), P(10, 0), P(10, 10), P(0, 10)], layer: "0" },
  wipeout: { id: "e-wipeout", type: "wipeout", boundary: [P(0, 0), P(5, 0), P(5, 5)], layer: "0" },
  image: { id: "e-image", type: "image", definition: "IMG", insertion: P(0, 0), uVector: P(1, 0), vVector: P(0, 1), size: { width: 100, height: 80 }, layer: "0" },
  attdef: { id: "e-attdef", type: "attdef", tag: "ETIQUETA", insertion: P(0, 0), layer: "0" },
  table: { id: "e-table", type: "table", insertion: P(0, 0), rows: 1, columns: 1, rowHeights: [10], columnWidths: [20], cells: [{ row: 0, column: 0, text: "celda" }], layer: "0" },
  solid3d: { id: "e-solid3d", type: "solid3d", nodes: [{ id: "n", op: "box", min: P(0, 0, 0), max: P(10, 10, 10) }], root: "n", layer: "0" },
  region: { id: "e-region", type: "region", outer: [P(0, 0), P(10, 0), P(10, 10)], layer: "0" },
  // Esquema 6: el anfitrión.
  wall: { id: "e-wall", type: "wall", start: P(0, 0), end: P(4000, 0), thickness: 150, height: 2600, layer: "0" },
  // Esquema 7: el alojado. Se declara DESPUÉS del muro porque sin él no existe.
  opening: { id: "e-opening", type: "opening", kind: "door", hostId: "e-wall", position: 2000, width: 900, height: 2100, sill: 0, swing: "left", hinge: "start", layer: "0" },
} satisfies Record<CadEntity["type"], CadEntity>;

const TIPOS = Object.keys(MUESTRAS) as CadEntity["type"][];

// --- 1. el censo cubre lo que dice cubrir -----------------------------------
{
  assert.equal(TIPOS.length, 27, "el censo debe cubrir los 27 tipos del esquema 7");
  for (const tipo of TIPOS) {
    assert.equal(MUESTRAS[tipo].type, tipo, `la muestra de ${tipo} declara otro type`);
  }
}

/**
 * Lo que habría EN EL DISCO: un objeto pelado, sin las secciones que la
 * apertura rellena. Se construye así a propósito, porque el camino que este
 * spec mide es el del usuario que abre un archivo, no el de un documento ya
 * normalizado en memoria.
 */
function crudo(entities: CadEntity[], schema: number): Record<string, unknown> {
  return {
    meta: { version: 1, schema, unit: "mm" },
    layers: [{ id: "0", name: "0", visible: true, locked: false, color: "#fff" }],
    entities,
  };
}

/** El mismo objeto, ya pasado por la puerta de apertura. */
function documento(entities: CadEntity[], schema = CAD_DOCUMENT_SCHEMA): CadDocument {
  return migrateCadDocument(crudo(entities, schema));
}

// --- 2. y 3. guardar → abrir no pierde NI UN TIPO ----------------------------
{
  const original = documento(TIPOS.map((t) => MUESTRAS[t] as CadEntity));
  const abierto = parseCadDocument(serializeCadDocument(original));

  const antes = cadDocumentStats(original);
  const despues = cadDocumentStats(abierto);

  // Recuento POR TIPO, no total: un total que cuadra puede esconder un tipo
  // perdido y otro duplicado, que es justamente como pasan desapercibidos.
  const perdidos = TIPOS.filter((t) => despues[t] !== antes[t]);
  assert.deepEqual(
    perdidos,
    [],
    `tipos que NO sobreviven al viaje guardar→abrir: ${perdidos.join(", ")}`,
  );
  for (const tipo of TIPOS) {
    assert.equal(antes[tipo], 1, `el documento de partida debía tener 1 ${tipo}`);
    assert.equal(despues[tipo], 1, `se perdió el tipo ${tipo} al abrir`);
  }
  assert.equal(abierto.entities.length, 27, "el total también debe cuadrar");

  // Identidad y capa: sobrevivir no es sólo «queda una entidad de ese tipo».
  assert.deepEqual(
    abierto.entities.map((e) => e.id).sort(),
    original.entities.map((e) => e.id).sort(),
    "alguna entidad cambió de identidad al abrir",
  );
  for (const e of abierto.entities) {
    assert.equal(e.layer, "0", `la entidad ${e.id} perdió su capa`);
  }
  assert.equal(abierto.meta.schema, 8, "el documento abierto debe declararse el esquema vigente");
}

// --- 4. un documento del esquema 6 sigue abriendo ----------------------------
{
  // Un v6 real NO puede tener huecos: en el 6 el tipo no existía. Se guarda
  // exactamente lo que un usuario tendría guardado antes de esta ola.
  const tiposV6 = TIPOS.filter((t) => t !== "opening");
  const v6EnDisco = crudo(
    tiposV6.map((t) => MUESTRAS[t] as CadEntity),
    6,
  );
  const migrado = migrateCadDocument(v6EnDisco);

  assert.equal(migrado.meta.schema, 8, "el v6 debe pasar a declararse el esquema vigente al abrirse");
  const stats = cadDocumentStats(migrado);
  for (const tipo of tiposV6) {
    assert.equal(stats[tipo], 1, `la migración 6→7 perdió el tipo ${tipo}`);
  }
  assert.equal(
    stats.opening,
    0,
    "la migración NO puede inventar huecos: un v6 no tenía ninguno",
  );
  assert.equal(migrado.entities.length, 26, "el v6 tenía 26 entidades y debe seguir teniéndolas");

  // Idempotencia como COMPLEMENTO: abrir lo ya abierto no vuelve a mover nada.
  const otraVez = migrateCadDocument(JSON.parse(serializeCadDocument(migrado)));
  assert.deepEqual(
    cadDocumentStats(otraVez),
    stats,
    "abrir dos veces cambia el censo",
  );
}

// --- 5. el hueco conserva su ALOJAMIENTO, que es todo lo que lo sitúa --------
{
  const doc = documento([MUESTRAS.wall as CadEntity, MUESTRAS.opening as CadEntity]);
  const abierto = parseCadDocument(serializeCadDocument(doc));
  const hueco = abierto.entities.find((e) => e.type === "opening");

  assert.ok(hueco, "el hueco no sobrevivió al viaje");
  assert.equal(hueco.hostId, "e-wall", "el hueco perdió su anfitrión: sin él no tiene coordenadas");
  assert.equal(hueco.position, 2000, "el hueco perdió su distancia sobre el eje");
  assert.equal(hueco.width, 900);
  assert.equal(hueco.height, 2100);
  assert.equal(hueco.sill, 0);
  assert.equal(hueco.kind, "door");
  assert.equal(hueco.swing, "left");
  assert.equal(hueco.hinge, "start");
}

console.log(`OK censo de entidades: ${TIPOS.length}/27 tipos sobreviven a guardar→abrir; migración 6→7 conserva 26/26`);
