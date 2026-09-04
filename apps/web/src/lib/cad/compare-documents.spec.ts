/**
 * El diff de entidades, contra un par de dibujos construidos a mano con las
 * cuatro situaciones metidas a propósito.
 *
 * La regla de esta spec es que NO se comprueba «hay 2 modificadas»: se
 * comprueba pieza por pieza cuál es cada una y por qué. Un recuento correcto
 * con las piezas cruzadas —el muro clasificado como cambio de capa y el texto
 * como movimiento— daría exactamente los mismos números y sería inservible.
 *
 * Y se comprueba el CUADRE, que es la propiedad que impide el error silencioso:
 * añadidos + borrados + 2·(modificados + iguales) tiene que dar el total de
 * entidades de los dos lados. Cualquier entidad que se caiga del
 * emparejamiento —por un id repetido, por una firma que no se calcula, por un
 * hueco mal rellenado— rompe esa igualdad.
 *
 * Correr:  npx tsx src/lib/cad/compare-documents.spec.ts
 */
import assert from "node:assert/strict";
import type { CadEntity } from "./cad-document";
import {
  cadCompareDocuments,
  cadCompareEntryLine,
  cadCompareGeometrySignature,
  cadCompareHeadline,
  cadComparePropertyChanges,
  type CadCompareEntry,
} from "./compare-documents";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const p = (x: number, y: number) => ({ x, y, z: 0 });

// ---------------------------------------------------------------------------
// El par de dibujos, con las cuatro situaciones dentro
// ---------------------------------------------------------------------------

/**
 * Base: lo que el compañero mandó. Nuevo: lo que hay abierto.
 *
 * - `l9`  — una LÍNEA que sólo está en el nuevo            → añadida
 * - `c1`  — un CÍRCULO que sólo está en la base            → borrado
 * - `m1`  — un MURO desplazado 250 mm                      → modificado (geometría)
 * - `t1`  — un TEXTO que sólo cambia de capa               → modificado (propiedad)
 * - `c2`  — un círculo idéntico en los dos                 → igual (por id)
 * - `l2`  — una línea dibujada AL REVÉS y con OTRO id      → igual (por firma)
 */
const base: { entities: CadEntity[] } = {
  entities: [
    { id: "m1", type: "wall", start: p(0, 0), end: p(5000, 0), thickness: 150, height: 2400, layer: "MUROS" },
    { id: "t1", type: "text", x: 1200, y: 900, text: "SALA", height: 250, layer: "TEXTOS" },
    { id: "c1", type: "circle", center: p(8000, 3000), radius: 400, layer: "0" },
    { id: "c2", type: "circle", center: p(2000, 2000), radius: 300, layer: "0" },
    { id: "l2", type: "line", start: p(0, 4000), end: p(3000, 4000), layer: "EJES" },
  ],
};

const nuevo: { entities: CadEntity[] } = {
  entities: [
    { id: "m1", type: "wall", start: p(0, 250), end: p(5000, 250), thickness: 150, height: 2400, layer: "MUROS" },
    { id: "t1", type: "text", x: 1200, y: 900, text: "SALA", height: 250, layer: "COTAS" },
    { id: "c2", type: "circle", center: p(2000, 2000), radius: 300, layer: "0" },
    // Misma recta, dibujada del otro extremo y reimportada con otro id.
    { id: "linea-reimportada", type: "line", start: p(3000, 4000), end: p(0, 4000), layer: "EJES" },
    { id: "l9", type: "line", start: p(6000, 0), end: p(6000, 2400), layer: "MUROS" },
  ],
};

const comparison = cadCompareDocuments(base, nuevo);
const find = (id: string): CadCompareEntry => {
  const entry = comparison.entries.find((candidate) => candidate.entityId === id);
  assert.ok(entry, `el diff no clasificó ${id}`);
  return entry;
};

// --- 1. Pieza por pieza ----------------------------------------------------

const linea = find("l9");
eq(linea.kind, "added", "la línea que sólo está en el dibujo abierto es un AÑADIDO");
eq(linea.before, undefined, "un añadido no tiene lado base");
eq(linea.matchedBy, undefined, "un añadido no se emparejó con nada");

const circulo = find("c1");
eq(circulo.kind, "deleted", "el círculo que sólo está en la base es un BORRADO");
eq(circulo.after, undefined, "un borrado no tiene lado nuevo");

const muro = find("m1");
eq(muro.kind, "modified", "el muro desplazado está MODIFICADO");
eq(muro.matchedBy, "id", "el muro conserva su id: se empareja en la primera pasada");
ok(muro.geometryChanged, "el desplazamiento de 250 mm es un cambio de GEOMETRÍA");
eq(muro.propertyChanges.length, 0, "y no toca ninguna de las seis propiedades con nombre");
eq(
  (muro.after as Extract<CadEntity, { type: "wall" }>).start.y -
    (muro.before as Extract<CadEntity, { type: "wall" }>).start.y,
  250,
  "el desplazamiento medido es exactamente 250 mm",
);

const texto = find("t1");
eq(texto.kind, "modified", "el texto que cambia de capa está MODIFICADO");
ok(!texto.geometryChanged, "y NO cambió de geometría: sigue en 1200,900 con la misma altura");
eq(texto.propertyChanges.length, 1, "una sola propiedad cambió");
eq(texto.propertyChanges[0].property, "layer", "y es la capa");
eq(texto.propertyChanges[0].label, "capa", "con su nombre en español para la línea de comandos");
eq(texto.propertyChanges[0].before, "TEXTOS", "de TEXTOS");
eq(texto.propertyChanges[0].after, "COTAS", "a COTAS");

const igual = find("c2");
eq(igual.kind, "equal", "el círculo idéntico es IGUAL");
eq(igual.matchedBy, "id", "y se emparejó por id");

// --- 2. La segunda pasada: firma geométrica normalizada --------------------

const reimportada = find("linea-reimportada");
eq(reimportada.kind, "equal", "una línea con otro id y los extremos al revés es la MISMA línea");
eq(reimportada.matchedBy, "signature", "y se emparejó en la segunda pasada, por firma");
eq(reimportada.before?.id, "l2", "contra la que el dibujo base llamaba l2");
eq(
  cadCompareGeometrySignature(base.entities[4]),
  cadCompareGeometrySignature(nuevo.entities[3]),
  "la firma ordena los extremos: dibujar de B a A no cambia la línea",
);
ok(
  cadCompareGeometrySignature(base.entities[0]) !== cadCompareGeometrySignature(nuevo.entities[0]),
  "y sí cambia cuando el muro se mueve",
);
eq(
  cadCompareGeometrySignature(base.entities[1]),
  cadCompareGeometrySignature(nuevo.entities[1]),
  "la capa NO entra en la firma geométrica: el texto firma igual en TEXTOS que en COTAS",
);

// --- 3. El recuento cuadra -------------------------------------------------

const { summary } = comparison;
eq(summary.added, 1, "un añadido");
eq(summary.deleted, 1, "un borrado");
eq(summary.modified, 2, "dos modificados");
eq(summary.equal, 2, "dos iguales");
eq(summary.geometryModified, 1, "de los dos modificados, uno movió geometría");
eq(summary.propertyModified, 1, "y el otro tocó una propiedad");
eq(summary.beforeEntities, 5, "cinco entidades en la base");
eq(summary.afterEntities, 5, "cinco en el dibujo abierto");
eq(summary.beforeAfterEntities, 10, "diez entre los dos lados");
eq(summary.accountedSides, 10, "y las diez quedan clasificadas");
ok(summary.balanced, "el cuadre cierra: nada se cayó del emparejamiento");
eq(comparison.entries.length, 6, "seis entradas para diez lados: cuatro parejas y dos sueltas");

eq(
  cadCompareHeadline(summary),
  "1 añadida, 1 borrada, 2 modificadas (1 de geometría, 1 de propiedad) y 2 iguales.",
  "el renglón dice las cuatro clases, incluso si alguna saliera a cero",
);
eq(
  cadCompareEntryLine(texto),
  "~ text t1: capa TEXTOS → COTAS.",
  "el detalle de una entidad dice QUÉ cambió, no sólo que cambió",
);
eq(
  cadCompareEntryLine(muro),
  "~ wall m1: geometría.",
  "y distingue el movimiento del cambio de propiedad",
);

// --- 4. Un dibujo contra sí mismo -----------------------------------------

const consigoMismo = cadCompareDocuments(base, base);
eq(consigoMismo.summary.added, 0, "comparar un dibujo consigo mismo no añade nada");
eq(consigoMismo.summary.deleted, 0, "ni borra nada");
eq(consigoMismo.summary.modified, 0, "ni modifica nada");
eq(consigoMismo.summary.equal, 5, "las cinco entidades salen iguales");
ok(consigoMismo.summary.balanced, "y el cuadre cierra igual");
ok(
  consigoMismo.entries.every((entry) => entry.kind === "equal"),
  "ninguna entrada dice otra cosa",
);

// --- 5. Un dibujo vacío contra uno lleno, y al revés -----------------------

const desdeVacio = cadCompareDocuments({ entities: [] }, nuevo);
eq(desdeVacio.summary.added, 5, "todo es añadido si la base está vacía");
eq(desdeVacio.summary.deleted, 0, "y no hay nada que borrar");
ok(desdeVacio.summary.balanced, "cuadra");
const haciaVacio = cadCompareDocuments(nuevo, { entities: [] });
eq(haciaVacio.summary.deleted, 5, "y al revés, todo es borrado");
eq(haciaVacio.summary.added, 0, "sin añadidos");
ok(haciaVacio.summary.balanced, "cuadra también");

// --- 6. Tolerancia: el ruido de coma flotante no es una diferencia ---------

const ruido = cadCompareDocuments(
  { entities: [{ id: "a", type: "line", start: p(0, 0), end: p(1000, 0), layer: "0" }] },
  { entities: [{ id: "a", type: "line", start: p(1e-9, 0), end: p(1000.0000000004, 0), layer: "0" }] },
);
eq(ruido.summary.equal, 1, "media micra de ruido de un DXF de ida y vuelta no es un cambio");
const real = cadCompareDocuments(
  { entities: [{ id: "a", type: "line", start: p(0, 0), end: p(1000, 0), layer: "0" }] },
  { entities: [{ id: "a", type: "line", start: p(0, 0), end: p(1000.01, 0), layer: "0" }] },
);
eq(real.summary.modified, 1, "una centésima de milímetro sí lo es con la tolerancia de fábrica");
ok(real.entries[0].geometryChanged, "y se clasifica como geometría");

// --- 7. Las seis propiedades con nombre, una por una -----------------------

const conPresentacion = (presentation: Record<string, unknown>): CadEntity => ({
  id: "x",
  type: "line",
  start: p(0, 0),
  end: p(10, 0),
  layer: "0",
  context: { presentation: presentation as never },
});

eq(
  cadComparePropertyChanges(
    conPresentacion({ color: { source: "explicit", value: "#ff0000" } }),
    conPresentacion({ color: { source: "explicit", value: "#00ff00" } }),
  ).map((change) => change.property),
  ["color"],
  "el color explícito se compara desde la presentación, no desde el campo suelto",
);
eq(
  cadComparePropertyChanges(
    conPresentacion({ linetype: { source: "explicit", value: "OCULTA" } }),
    conPresentacion({ linetype: { source: "byLayer" } }),
  ).map((change) => `${change.label}:${change.before}→${change.after}`),
  ["tipo de línea:OCULTA→PorCapa"],
  "volver a PorCapa es un cambio, y se dice con ese nombre",
);
eq(
  cadComparePropertyChanges(
    conPresentacion({ lineweight: { source: "explicit", value: 50 } }),
    conPresentacion({ lineweight: { source: "explicit", value: 70 } }),
  ).map((change) => change.property),
  ["lineweight"],
  "el grosor también",
);
eq(
  cadComparePropertyChanges(
    { id: "t", type: "text", x: 0, y: 0, text: "A-01", layer: "0", style: "ROMANS" },
    { id: "t", type: "text", x: 0, y: 0, text: "A-02", layer: "0", style: "ISOCPEUR" },
  ).map((change) => change.property),
  ["style", "text"],
  "el contenido del texto y su estilo son PROPIEDADES, no geometría",
);
const soloTexto = cadCompareDocuments(
  { entities: [{ id: "t", type: "text", x: 0, y: 0, text: "A-01", layer: "0" }] },
  { entities: [{ id: "t", type: "text", x: 0, y: 0, text: "A-02", layer: "0" }] },
);
ok(
  !soloTexto.entries[0].geometryChanged,
  "cambiar el rótulo de un texto no mueve el dibujo, y el diff no lo cuenta como movimiento",
);

// --- 8. Lo que NO es una de las seis propiedades entra en la geometría -----

const conNota = cadCompareDocuments(
  { entities: [{ id: "b", type: "box", kind: "generic", x: 0, y: 0, w: 10, h: 10, rotation: 0, layer: "0", shape: "rect", notes: "revisar" }] },
  { entities: [{ id: "b", type: "box", kind: "generic", x: 0, y: 0, w: 10, h: 10, rotation: 0, layer: "0", shape: "rect", notes: "revisado" }] },
);
eq(conNota.summary.modified, 1, "un campo sin nombre propio no puede cambiar en silencio");
ok(
  conNota.entries[0].geometryChanged,
  "la partición es exhaustiva: lo que no es una de las seis propiedades cae del lado de la geometría",
);

// --- 9. Un id repetido no rompe el cuadre ---------------------------------

const repetido = cadCompareDocuments(
  {
    entities: [
      { id: "dup", type: "circle", center: p(0, 0), radius: 10, layer: "0" },
      { id: "dup", type: "circle", center: p(500, 0), radius: 10, layer: "0" },
    ],
  },
  { entities: [{ id: "dup", type: "circle", center: p(0, 0), radius: 10, layer: "0" }] },
);
ok(repetido.summary.balanced, "un documento con ids repetidos sigue cuadrando");
eq(repetido.summary.equal, 1, "el primero empareja");
eq(repetido.summary.deleted, 1, "y el segundo se declara borrado en vez de desaparecer");

console.log(`compare-documents.spec: ${checks} comprobaciones OK`);
