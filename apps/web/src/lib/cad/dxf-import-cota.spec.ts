/**
 * LA COTA QUE SE PERDÍA EN SILENCIO AL IMPORTAR.
 *
 * ## Lo que se midió, y por qué es un defecto y no una carencia
 *
 * En DXF una entidad plana no guarda puntos 3D: guarda puntos 2D medidos sobre
 * un plano propio, definido por su dirección de extrusión (código 210) y su
 * elevación sobre ella (código 38). El documento canónico todavía no sabe
 * guardar esa normal ni esa cota, así que la geometría entra aplanada contra el
 * suelo. Eso es una CARENCIA, y tiene su sitio en la escalera de paridad.
 *
 * Lo que era un DEFECTO es que no se decía. Medido antes de este archivo, con
 * `mapDxfEntityToPrimitive` alimentado con entidades tal y como las entrega
 * `dxf-parser`:
 *
 *   · CIRCLE con extrusión (1,0,0) —un círculo de pie en un muro— salía
 *     acostado en el suelo, aviso NINGUNO.
 *   · LWPOLYLINE en un faldón a 45° con elevación 3000 salía plana a cota 0,
 *     aviso NINGUNO.
 *   · LINE de (0,0,0) a (0,0,3000) —un pilar de tres metros— salía con sus dos
 *     extremos en (0,0): LONGITUD CERO, aviso NINGUNO.
 *
 * Y `summarizeDxfImportWarnings` devolvía `[]`. Es decir: el producto enseña al
 * despacho un manifiesto de lo que perdió al importar, y esto no salía en él.
 *
 * Dos cosas lo confirman como defecto y no como opinión. La primera: el comando
 * LINE del editor se niega explícitamente a crear un segmento de longitud cero
 * —«se ignora el vértice en vez de ensuciar el documento»— y el importador
 * creaba justo eso. La segunda: `pt()` en `dxf-read-core.ts` conserva el bulge
 * con este comentario, de una vez anterior en que pasó lo mismo: «descartarlo
 * aplanaba a cuerda recta todos los arcos de polilínea del fichero importado,
 * en silencio». Misma lección; con la cota estaba sin aprender.
 *
 * ## Lo que este archivo NO afirma
 *
 * No afirma que la geometría inclinada se importe BIEN. Se sigue aplanando. Lo
 * que se fija aquí es que se aplane DICIÉNDOLO, y que la geometría plana
 * corriente —el 99 % de un plano de arquitectura— no dispare un aviso falso.
 */
import { strict as assert } from "node:assert";
import { mapDxfEntityToPrimitive, summarizeDxfImportWarnings } from "./dxf-import";

const avisoDe = (entity: unknown) => mapDxfEntityToPrimitive(entity as never).warning;

// ── Lo que ahora se declara ────────────────────────────────────────────────

// Ola C (2026-09-02): el pilar ya no se aplana. `pt()` conserva el código 30 y
// la primitiva lleva la cota; hasta esta ola este mismo caso exigía el aviso y
// dos puntos en (0,0).
const pilar = mapDxfEntityToPrimitive({
  type: "LINE",
  layer: "ESTRUCTURA",
  startPoint: { x: 0, y: 0, z: 0 },
  endPoint: { x: 0, y: 0, z: 3000 },
} as never);
assert.equal(pilar.warning, undefined, "una LINE perpendicular al suelo ya no es pérdida");
assert.equal(pilar.primitive?.kind, "line");
assert.deepEqual(
  pilar.primitive?.points,
  [
    { x: 0, y: 0 },
    { x: 0, y: 0, z: 3000 },
  ],
  "los tres metros del pilar están en la primitiva",
);

const depie = mapDxfEntityToPrimitive({
  type: "CIRCLE",
  layer: "MUROS",
  center: { x: 100, y: 50 },
  radius: 25,
  extrusionDirectionX: 1,
  extrusionDirectionY: 0,
  extrusionDirectionZ: 0,
} as never);
assert.equal(
  depie.warning?.code,
  "flattened_to_ground",
  "un círculo de pie —extrusión (1,0,0)— sigue declarándose: el plano inclinado es «todavía no»",
);
assert.equal(depie.warning?.entityType, "CIRCLE", "el aviso dice de qué tipo era");
assert.equal(depie.warning?.layer, "MUROS", "y en qué capa, que es por donde se busca");

// El caso MÁS frecuente de todos: AutoCAD escribe extrusión (0,0,-1) para
// cualquier cosa dibujada en un SCU reflejado. Desde la Ola C `enElMundo` lo
// devuelve al mundo: el eje X del OCS es (−1,0,0), así que x cambia de signo.
const reflejado = mapDxfEntityToPrimitive({
  type: "CIRCLE",
  layer: "MUROS",
  center: { x: 100, y: 50 },
  radius: 25,
  extrusionDirectionX: 0,
  extrusionDirectionY: 0,
  extrusionDirectionZ: -1,
} as never);
assert.equal(reflejado.warning, undefined, "un SCU reflejado —extrusión (0,0,-1)— ya no es pérdida");
assert.deepEqual(reflejado.primitive?.points, [{ x: -100, y: 50 }], "el centro vuelve al mundo: (−x, y)");

// Un ARC reflejado cambia de sentido: de `a`→`b` en su plano a `180−b`→`180−a`.
const arcoReflejado = mapDxfEntityToPrimitive({
  type: "ARC",
  layer: "MUROS",
  center: { x: 100, y: 50, z: 200 },
  radius: 25,
  startAngle: 0,
  endAngle: Math.PI / 2,
  extrusionDirectionX: 0,
  extrusionDirectionY: 0,
  extrusionDirectionZ: -1,
} as never);
assert.equal(arcoReflejado.warning, undefined);
assert.deepEqual(arcoReflejado.primitive?.points, [{ x: -100, y: 50, z: -200 }], "la cota también se refleja");
assert.equal(arcoReflejado.primitive?.startAngle, 90, "0°→90° en OCS reflejado es 90°→180° en el mundo");
assert.equal(arcoReflejado.primitive?.endAngle, 180);

// Una LWPOLYLINE reflejada: x cambia de signo y el bulge también (es un espejo).
const plReflejada = mapDxfEntityToPrimitive({
  type: "LWPOLYLINE",
  layer: "MUROS",
  vertices: [
    { x: 0, y: 0, bulge: 0.5 },
    { x: 1000, y: 0 },
    { x: 1000, y: 500 },
  ],
  extrusionDirectionX: 0,
  extrusionDirectionY: 0,
  extrusionDirectionZ: -1,
} as never);
assert.equal(plReflejada.warning, undefined);
assert.deepEqual(plReflejada.primitive?.points, [
  { x: 0, y: 0, bulge: -0.5 },
  { x: -1000, y: 0 },
  { x: -1000, y: 500 },
]);

// La elevación del código 38 viaja a los vértices: tampoco es pérdida.
const elevada = mapDxfEntityToPrimitive({
  type: "LWPOLYLINE",
  layer: "CUBIERTA",
  vertices: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
  ],
  elevation: 3000,
} as never);
assert.equal(elevada.warning, undefined, "la elevación del código 38 ya viaja");
assert.deepEqual(elevada.primitive?.points, [
  { x: 0, y: 0, z: 3000 },
  { x: 1000, y: 0, z: 3000 },
]);

// Lo que SÍ sigue perdiéndose y se declara: la cota de un texto, y una
// elevación del 38 con plano inclinado.
assert.equal(
  avisoDe({
    type: "TEXT",
    layer: "ROTULOS",
    position: { x: 0, y: 0, z: 1200 },
    text: "N+1.20",
    height: 5,
  })?.code,
  "flattened_to_ground",
  "la cota de un TEXT todavía no viaja: se declara",
);

// ── Lo que NO debe disparar un aviso ───────────────────────────────────────
// Un falso positivo aquí sería peor que el silencio que se arregla: llenaría el
// manifiesto de cada plano corriente y enseñaría a ignorarlo.

assert.equal(
  avisoDe({
    type: "LINE",
    layer: "0",
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1000, y: 500 },
  }),
  undefined,
  "una línea plana corriente no avisa",
);
assert.equal(
  avisoDe({
    type: "CIRCLE",
    layer: "0",
    center: { x: 0, y: 0 },
    radius: 10,
    extrusionDirectionX: 0,
    extrusionDirectionY: 0,
    extrusionDirectionZ: 1,
  }),
  undefined,
  "la extrusión (0,0,1) ESCRITA es la del mundo: no avisa",
);
assert.equal(
  avisoDe({
    type: "LWPOLYLINE",
    layer: "0",
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    elevation: 0,
  }),
  undefined,
  "elevación 0 escrita tampoco avisa",
);
assert.equal(
  avisoDe({
    type: "LINE",
    layer: "0",
    startPoint: { x: 0, y: 0, z: 0 },
    endPoint: { x: 10, y: 0, z: 0 },
  }),
  undefined,
  "puntos con z=0 explícita tampoco: cota cero es el suelo",
);

// ── El aviso preexistente manda ────────────────────────────────────────────
// Una entidad rota Y fuera del plano tiene que decir que está rota: sustituir
// ese motivo por el de la cota escondería el principal.
const rota = mapDxfEntityToPrimitive({
  type: "LINE",
  layer: "0",
  startPoint: { x: 0, y: 0, z: 900 },
} as never);
assert.equal(rota.primitive, undefined, "una LINE sin dos puntos no produce primitiva");
assert.equal(rota.warning?.code, "invalid_line", "y conserva su propio motivo, no el de la cota");

// ── El manifiesto se lee de un vistazo ─────────────────────────────────────
// Los motivos van sin números para que N entidades de la misma capa y tipo den
// UNA fila con contador. Un modelo con mil orientaciones distintas no debe
// producir mil renglones de uno.
const muchas = Array.from({ length: 1000 }, (_, i) => ({
  type: "CIRCLE",
  layer: "CUBIERTA",
  center: { x: i, y: 0 },
  radius: 1,
  // Una normal DISTINTA en cada una: es el caso que rompía la agrupación.
  extrusionDirectionX: Math.cos(i),
  extrusionDirectionY: Math.sin(i),
  extrusionDirectionZ: 0,
}));
const agrupado = summarizeDxfImportWarnings(
  muchas.map((e) => avisoDe(e)).filter(Boolean) as never,
);
assert.equal(agrupado.length, 1, "mil normales distintas dan UNA fila, no mil");
assert.equal(agrupado[0].count, 1000, "y la fila lleva el recuento");
assert.equal(agrupado[0].code, "flattened_to_ground");
assert.equal(agrupado[0].layer, "CUBIERTA", "la capa es por donde el dibujante lo busca");

console.log("cad dxf import cota specs passed");
