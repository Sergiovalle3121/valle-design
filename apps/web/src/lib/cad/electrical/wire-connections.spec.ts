/**
 * QUE EL PLANO DIGA DE DÓNDE A DÓNDE VA CADA CONDUCTOR, Y CUÁL SE QUEDÓ SUELTO.
 *
 * ## Qué se afirma aquí, y qué NO
 *
 * No se afirma que «existe un módulo de conexiones». Se afirma lo que un
 * electricista comprobaría con el plano en la mano:
 *
 *  · que un conductor del tablero al motor sale como `C-1-1 de -TB1 a -M1`;
 *  · que el mismo conductor, con la punta a dos centímetros del motor —lo que
 *    en pantalla parece llegar y en el dibujo no llega— sale como `a (suelto)`
 *    y encima dice cuánto le falta y a quién;
 *  · que con dos componentes a distinta distancia del mismo extremo gana el
 *    MÁS CERCANO, no el primero que aparezca en el documento;
 *  · que la tolerancia sale de la UNIDAD del documento y no de un número
 *    mágico: los mismos 10 mm físicos son 10 unidades en un dibujo en mm y
 *    0,01 en uno en metros, así que el mismo hueco se juzga igual en los dos;
 *  · y que un dibujo sin componentes etiquetados lo DICE, en vez de devolver
 *    una lista de sueltos que sólo significa que nadie etiquetó nada.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import { CAD_IE_TAG } from "./device-tags";
import { CAD_IE_CIRCUIT, CAD_IE_NUMBER } from "./wire-numbering";
import {
  CAD_IE_LINK_TOLERANCE_MM,
  cadFormatLooseEnd,
  cadFormatWireConnection,
  cadTaggedDevices,
  cadWireConnectionReport,
  cadWireConnections,
  cadWireLinkCriterion,
  cadWireLinkTolerance,
} from "./wire-connections";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

/** Un conductor: polilínea marcada, del punto `de` al punto `a`. */
const conductor = (
  id: string,
  circuit: string,
  number: number,
  puntos: [number, number][],
): CadEntity =>
  ({
    id,
    type: "polyline",
    vertices: puntos.map(([x, y]) => ({ x, y, z: 0 })),
    closed: false,
    layer: "IE-CIR",
    context: { metadata: { [CAD_IE_CIRCUIT]: circuit, [CAD_IE_NUMBER]: String(number) } },
  }) as unknown as CadEntity;

/** Un componente etiquetado: inserción de un símbolo con su `TAG`. */
const componente = (id: string, tag: string, x: number, y: number): CadEntity =>
  ({
    id,
    type: "insert",
    block: "MEP-TABLERO",
    insertion: { x, y, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    attributes: { [CAD_IE_TAG]: tag },
    layer: "IE-FUERZA",
  }) as unknown as CadEntity;

const doc = (entities: CadEntity[]): Pick<CadDocument, "entities"> => ({ entities });

// --- 1 · la tolerancia es DERIVADA de la unidad, no un número mágico -------
{
  eq(CAD_IE_LINK_TOLERANCE_MM, 10, "la tolerancia se declara en milímetros de dibujo");
  eq(cadWireLinkTolerance("mm"), 10, "en un dibujo en mm son 10 unidades");
  eq(cadWireLinkTolerance("cm"), 1, "en uno en cm, 1 unidad");
  eq(cadWireLinkTolerance("m"), 0.01, "en uno en metros, 0,01 unidades");
  ok(
    Math.abs(cadWireLinkTolerance("in") - 10 / 25.4) < 1e-12,
    "y en pulgadas, los mismos 10 mm físicos",
  );
  eq(
    cadWireLinkTolerance(undefined),
    10,
    "sin unidad declarada se cuenta como mm, igual que en todo el árbol",
  );

  // Y el criterio se puede leer, con su cifra: un reporte que no dice de qué
  // está hecho invita a leerlo como si el dibujo lo afirmara.
  const criterio = cadWireLinkCriterion("mm");
  ok(/DEDUCIDO por proximidad/.test(criterio), `el criterio dice que es deducido: ${criterio}`);
  ok(/10 mm de dibujo/.test(criterio), `y con qué tolerancia: ${criterio}`);
  ok(
    /no es una conexión declarada/.test(criterio),
    `y que deducido no es declarado: ${criterio}`,
  );
  ok(
    /0\.01 m|0,01 m/.test(cadWireLinkCriterion("m")),
    `en metros dice la tolerancia en metros: ${cadWireLinkCriterion("m")}`,
  );
}

// --- 2 · tablero → motor, con los dos extremos en su sitio ----------------
{
  const dibujo = doc([
    componente("tb", "-TB1", 0, 0),
    componente("m", "-M1", 5_000, 0),
    conductor("w1", "C-1", 1, [
      [0, 0],
      [2_500, 1_200],
      [5_000, 0],
    ]),
  ]);

  const conexiones = cadWireConnections(dibujo, { unit: "mm" });
  eq(conexiones.length, 1, "hay un conductor con recorrido");
  eq(
    cadFormatWireConnection(conexiones[0]),
    "C-1-1 de -TB1 a -M1",
    "el reporte de/a se lee como se lee en un plano",
  );
  eq(conexiones[0].loose, 0, "ningún extremo suelto");
  eq(conexiones[0].from.entityId, "tb", "el extremo «de» apunta al tablero");
  eq(conexiones[0].to.entityId, "m", "y el extremo «a» al motor");
  eq(conexiones[0].from.distance, 0, "con distancia cero: cayó en el punto de inserción");
}

// --- 3 · el mismo conductor con la punta a dos centímetros: SUELTO --------
{
  // Dos centímetros. En pantalla parece que llega; a 1:50 son cuatro décimas
  // de milímetro en el papel. Éste es el defecto que el módulo existe para
  // cazar, y el que ninguna lista de conductores enseñaba.
  const dibujo = doc([
    componente("tb", "-TB1", 0, 0),
    componente("m", "-M1", 5_000, 0),
    conductor("w1", "C-1", 1, [
      [0, 0],
      [4_980, 0],
    ]),
  ]);

  const conexiones = cadWireConnections(dibujo, { unit: "mm" });
  eq(
    cadFormatWireConnection(conexiones[0]),
    "C-1-1 de -TB1 a (suelto)",
    "el extremo que no llega se dice suelto, no se redondea a conectado",
  );
  eq(conexiones[0].loose, 1, "un extremo suelto de dos");
  eq(conexiones[0].to.tag, null, "sin componente al que llegue");
  eq(conexiones[0].to.nearestTag, "-M1", "pero se conserva a quién casi llega");
  eq(conexiones[0].to.nearestDistance, 20, "y a cuánto se quedó, en unidades de dibujo");
  ok(
    /queda a 20 mm de -M1/.test(cadFormatLooseEnd(conexiones[0], conexiones[0].to, "mm")),
    `el suelto dice cuánto falta y a quién: ${cadFormatLooseEnd(conexiones[0], conexiones[0].to, "mm")}`,
  );

  // Y justo en el borde de la tolerancia SÍ conecta: 10 mm es «hasta», no
  // «menos de». Un criterio que no dice de qué lado cae su propio límite es
  // un criterio que cada quien aplica como quiere.
  const justo = doc([
    componente("m", "-M1", 5_000, 0),
    conductor("w1", "C-1", 1, [
      [0, 0],
      [4_990, 0],
    ]),
  ]);
  eq(
    cadWireConnections(justo, { unit: "mm" })[0].to.tag,
    "-M1",
    "a exactamente la tolerancia, conecta",
  );
}

// --- 4 · el MISMO hueco físico se juzga igual en un dibujo en metros ------
{
  // 20 mm de hueco en un dibujo en metros son 0,02 unidades. Si la tolerancia
  // fuera un número fijo de unidades, este conductor pasaría por conectado y
  // el defecto viajaría a la obra.
  const dibujo = doc([
    componente("tb", "-TB1", 0, 0),
    componente("m", "-M1", 5, 0),
    conductor("w1", "C-1", 1, [
      [0, 0],
      [4.98, 0],
    ]),
  ]);
  eq(
    cadFormatWireConnection(cadWireConnections(dibujo, { unit: "m" })[0]),
    "C-1-1 de -TB1 a (suelto)",
    "en metros, los mismos 2 cm de hueco siguen siendo un suelto",
  );
  // Y el que sí llega sigue llegando: la tolerancia no se volvió cero.
  const pegado = doc([
    componente("m", "-M1", 5, 0),
    conductor("w1", "C-1", 1, [
      [0, 0],
      [4.995, 0],
    ]),
  ]);
  eq(
    cadWireConnections(pegado, { unit: "m" })[0].to.tag,
    "-M1",
    "y 5 mm de hueco en metros siguen dentro de tolerancia",
  );
}

// --- 5 · dos componentes a distinta distancia: gana el más cercano --------
{
  const dibujo = doc([
    // -SW1 está más cerca del extremo, -M1 más lejos, y -M1 va antes por
    // etiqueta: si el módulo eligiera por orden alfabético o por orden del
    // documento, aquí se equivocaría.
    componente("m", "-M1", 5_000, 0),
    componente("sw", "-SW1", 5_003, 0),
    conductor("w1", "C-1", 1, [
      [0, 0],
      [5_004, 0],
    ]),
  ]);
  const conexion = cadWireConnections(dibujo, { unit: "mm" })[0];
  eq(conexion.to.tag, "-SW1", "gana el que está a 1 mm, no el que está a 4");
  eq(conexion.to.distance, 1, "y se dice a qué distancia quedó");

  // Invertido en el documento, el resultado es el mismo: el reporte no
  // depende de cómo se guardó el dibujo.
  const alReves = doc([
    componente("sw", "-SW1", 5_003, 0),
    componente("m", "-M1", 5_000, 0),
    conductor("w1", "C-1", 1, [
      [0, 0],
      [5_004, 0],
    ]),
  ]);
  eq(
    cadWireConnections(alReves, { unit: "mm" })[0].to.tag,
    "-SW1",
    "y no cambia si las inserciones vienen en otro orden",
  );
}

// --- 6 · un dibujo sin componentes etiquetados LO DICE --------------------
{
  const dibujo = doc([
    conductor("w1", "C-1", 1, [
      [0, 0],
      [5_000, 0],
    ]),
  ]);
  const reporte = cadWireConnectionReport(dibujo, { unit: "mm" });
  eq(reporte.devices, 0, "no hay ningún componente etiquetado");
  eq(reporte.loose.length, 1, "así que el conductor sale con sus dos extremos sueltos");
  eq(reporte.connections[0].loose, 2, "los dos");
  eq(
    reporte.connections[0].to.nearestTag,
    null,
    "y sin «casi llega», porque no hay a quién",
  );
  ok(
    /no hay ningún componente etiquetado cerca/.test(
      cadFormatLooseEnd(reporte.connections[0], reporte.connections[0].to, "mm"),
    ),
    "el suelto sin candidatos se dice con esas palabras y no como una distancia",
  );

  // Un componente SIN etiqueta legible no cuenta como destino: conectar a un
  // símbolo que nadie numeró sería inventar un nombre que el plano no tiene.
  const sinEtiqueta = doc([
    componente("x", "MOTOR GRANDE", 5_000, 0),
    conductor("w1", "C-1", 1, [
      [0, 0],
      [5_000, 0],
    ]),
  ]);
  eq(cadTaggedDevices(sinEtiqueta).length, 0, "una etiqueta que no es familia+número no cuenta");
  eq(
    cadWireConnections(sinEtiqueta, { unit: "mm" })[0].to.tag,
    null,
    "y el conductor que remata en él queda suelto",
  );
}

// --- 7 · lo que no tiene recorrido se cuenta aparte, no desaparece --------
{
  const dibujo = doc([
    componente("tb", "-TB1", 0, 0),
    conductor("w1", "C-1", 1, [
      [0, 0],
      [5_000, 0],
    ]),
    // Una inserción a la que alguien le puso la marca eléctrica: es un
    // conductor para `cadWiresOf` y no tiene extremos que medir.
    {
      ...(componente("raro", "-CT9", 100, 100) as never as Record<string, unknown>),
      context: { metadata: { [CAD_IE_CIRCUIT]: "C-1", [CAD_IE_NUMBER]: "9" } },
    } as unknown as CadEntity,
    // Y una polilínea de un solo vértice: tampoco tiene dos extremos.
    conductor("w2", "C-1", 2, [[0, 0]]),
  ]);
  const reporte = cadWireConnectionReport(dibujo, { unit: "mm" });
  eq(reporte.connections.length, 1, "sólo se reporta el conductor con recorrido");
  assert.deepEqual(
    reporte.withoutRun,
    ["raro", "w2"],
    "y los dos que no tienen recorrido se cuentan con su id, no se pierden",
  );
  verdes += 1;
  eq(reporte.toleranceMm, 10, "el reporte dice con qué tolerancia se midió");
  eq(reporte.toleranceUnits, 10, "en unidades de dibujo");
}

// --- 8 · el orden del reporte es estable y por circuito y número ----------
{
  const dibujo = doc([
    componente("tb", "-TB1", 0, 0),
    conductor("b2", "C-2", 2, [
      [0, 0],
      [10, 0],
    ]),
    conductor("a1", "C-1", 1, [
      [0, 0],
      [10, 0],
    ]),
    conductor("b1", "C-2", 1, [
      [0, 0],
      [10, 0],
    ]),
  ]);
  assert.deepEqual(
    cadWireConnections(dibujo, { unit: "mm" }).map((conexion) => conexion.label),
    ["C-1-1", "C-2-1", "C-2-2"],
    "por circuito y número: dos corridas del mismo dibujo dan la misma lista",
  );
  verdes += 1;
}

console.log(
  `wire-connections: ${verdes} comprobaciones verdes — el de/a sale del dibujo, el suelto dice cuánto le falta y a quién, el empate lo gana el más cercano y la tolerancia se deriva de la unidad del documento`,
);
