/**
 * OVERKILL y DRAWORDER, hasta el documento.
 *
 * ## La afirmación que da nombre a esta spec
 *
 * **UN LOTE.** Se comprueba de dos maneras porque las dos importan: el plan
 * devuelve una sola lista, y esa lista pasa por `executeCadEntityCommandBatch`
 * dejando UNA entrada de historia. Con un lote por objeto, quien limpia
 * trescientos duplicados y pulsa Ctrl+Z recupera uno y se lleva el dibujo a
 * medio limpiar creyendo que lo ha deshecho.
 *
 * DRAWORDER se comprueba contra `modelSpace.entityIds`, que es donde vive el
 * orden de dibujo de verdad. Mirar `entities` no valdría: ahí el orden es
 * alfabético por id, a propósito, para que el serializado sea determinista.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument, type CadEntity } from "./cad-document";
import { executeCadEntityCommandBatch } from "./entity-commands";
import { planCadOverkill } from "./overkill";

let checks = 0;
function equal(actual: unknown, expected: unknown, what: string) {
  checks += 1;
  assert.equal(actual, expected, `${what}: se esperaba ${String(expected)}, salió ${String(actual)}`);
}
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}
function sameOrder(actual: readonly string[], expected: readonly string[], what: string) {
  checks += 1;
  assert.deepEqual([...actual], [...expected], what);
}

const line = (
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  layer = "0",
): CadEntity => ({
  id,
  type: "line",
  start: { x: x1, y: y1, z: 0 },
  end: { x: x2, y: y2, z: 0 },
  layer,
});

function documentWith(entities: readonly CadEntity[]): CadDocument {
  const document = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [...entities],
  });
  // La migración ordena `entityIds` a su manera; el orden de dibujo que
  // interesa aquí es el de la lista que se le pasó.
  return { ...document, modelSpace: { entityIds: entities.map((entity) => entity.id) } };
}

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------

{
  const entities = [
    line("a", 0, 0, 10, 0),
    // Clon exacto.
    line("b", 0, 0, 10, 0),
    // El MISMO segmento dibujado al revés: también es un duplicado.
    line("c", 10, 0, 0, 0),
    // Paralela desplazada: no lo es.
    line("d", 0, 1, 10, 1),
  ];
  const plan = planCadOverkill(entities);
  equal(plan.duplicatesRemoved, 2, "el clon y el invertido son duplicados; la paralela no");
  equal(plan.commands.length, 2, "y salen en UN plan de dos órdenes");
  ok(
    plan.commands.every((command) => command.type === "delete"),
    "sólo hay borrados: al primero no se le toca",
  );
}

// La capa cuenta, salvo que se pida ignorarla.
{
  const entities = [line("a", 0, 0, 10, 0, "MUROS"), line("b", 0, 0, 10, 0, "EJES")];
  equal(
    planCadOverkill(entities).duplicatesRemoved,
    0,
    "una línea en MUROS y otra igual en EJES son dos cosas distintas",
  );
  equal(
    planCadOverkill(entities, { ignoreLayer: true }).duplicatesRemoved,
    1,
    "salvo que se pida ignorar la capa, que es lo que arregla una importación",
  );
}

// Círculos: el duplicado sale del registro, sin caso especial por tipo.
{
  const circle = (id: string, x: number, r: number): CadEntity => ({
    id,
    type: "circle",
    center: { x, y: 0, z: 0 },
    radius: r,
    layer: "0",
  });
  equal(
    planCadOverkill([circle("a", 0, 5), circle("b", 0, 5), circle("c", 0, 6)]).duplicatesRemoved,
    1,
    "dos círculos idénticos y uno distinto",
  );
}

// La tolerancia es de verdad configurable.
{
  const entities = [line("a", 0, 0, 10, 0), line("b", 0, 0.05, 10, 0.05)];
  equal(planCadOverkill(entities).duplicatesRemoved, 0, "con la tolerancia de fábrica no son iguales");
  equal(
    planCadOverkill(entities, { tolerance: 0.1 }).duplicatesRemoved,
    1,
    "con tolerancia 0,1 sí lo son",
  );
}

// ---------------------------------------------------------------------------
// Colineales
// ---------------------------------------------------------------------------

{
  const entities = [
    line("a", 0, 0, 10, 0),
    // Se solapa con la anterior.
    line("b", 5, 0, 20, 0),
    // Toca justo por el extremo: es lo que deja una polilínea explotada.
    line("c", 20, 0, 30, 0),
    // Misma recta soporte pero SEPARADA: no se funde, hay un hueco real.
    line("d", 50, 0, 60, 0),
    // Otra recta soporte.
    line("e", 0, 7, 10, 7),
  ];
  const plan = planCadOverkill(entities, { combineCollinear: true });
  equal(plan.segmentsMerged, 2, "tres tramos encadenados se funden en uno: dos fusiones");
  const replaced = plan.commands.filter((command) => command.type === "replace");
  const deleted = plan.commands.filter((command) => command.type === "delete");
  equal(replaced.length, 1, "un solo reemplazo: el superviviente");
  equal(deleted.length, 2, "y dos borrados");
  const survivor = replaced[0];
  ok(
    survivor.type === "replace" &&
      survivor.entity.type === "line" &&
      Math.abs(survivor.entity.start.x - 0) < 1e-9 &&
      Math.abs(survivor.entity.end.x - 30) < 1e-9,
    "el superviviente abarca de 0 a 30, que es la unión de los tres",
  );
  equal(
    planCadOverkill(entities, { combineCollinear: false }).segmentsMerged,
    0,
    "y sin la opción no se funde nada",
  );
}

// Un tramo dibujado al revés entra igual en la fusión: una recta no tiene sentido.
{
  const plan = planCadOverkill([line("a", 0, 0, 10, 0), line("b", 25, 0, 10, 0)], {
    combineCollinear: true,
  });
  equal(plan.segmentsMerged, 1, "el segundo va de 25 a 10 y encadena igual");
}

// Fundir NO cruza capas: el resultado no pertenecería a ninguna de las dos.
{
  const plan = planCadOverkill([line("a", 0, 0, 10, 0, "MUROS"), line("b", 10, 0, 20, 0, "EJES")], {
    combineCollinear: true,
  });
  equal(plan.segmentsMerged, 0, "dos capas distintas no se funden");
}

// ---------------------------------------------------------------------------
// UN LOTE, hasta el documento
// ---------------------------------------------------------------------------

{
  const entities = [
    line("a", 0, 0, 10, 0),
    line("b", 0, 0, 10, 0),
    line("c", 0, 0, 10, 0),
    line("d", 10, 0, 25, 0),
    line("e", 100, 100, 200, 100),
  ];
  const document = documentWith(entities);
  const plan = planCadOverkill(entities, { combineCollinear: true });
  ok(plan.commands.length > 1, "el plan tiene varias órdenes");

  const historyBefore = document.history.length;
  const versionBefore = document.meta.version;
  const result = executeCadEntityCommandBatch(document, plan.commands, "OVERKILL");

  // La afirmación que el enunciado pide, escrita como aserción y no como
  // comentario: UNA entrada de historia y UNA subida de versión.
  equal(
    result.document.history.length - historyBefore,
    1,
    "UN lote deja UNA entrada de historia, pase lo que pase dentro",
  );
  equal(
    result.document.meta.version - versionBefore,
    1,
    "y sube la versión UNA vez: un Ctrl+Z devuelve el dibujo entero",
  );
  equal(result.document.entities.length, 2, "quedan dos objetos: el fundido y el de arriba");
  const merged = result.document.entities.find((entity) => entity.id === "a");
  ok(
    merged?.type === "line" && Math.abs(merged.end.x - 25) < 1e-9,
    "y el superviviente llega hasta 25",
  );
}

// Un dibujo ya limpio no produce plan: cero órdenes es cero pasos de deshacer.
{
  const plan = planCadOverkill([line("a", 0, 0, 10, 0), line("b", 0, 5, 10, 5)], {
    combineCollinear: true,
  });
  equal(plan.commands.length, 0, "sin nada que limpiar, no se emite ninguna orden");
  equal(plan.examined, 2, "pero se cuenta lo examinado, para poder decirlo");
}

// ---------------------------------------------------------------------------
// DRAWORDER
// ---------------------------------------------------------------------------

{
  const entities = ["p", "q", "r", "s"].map((id, index) => line(id, index, 0, index + 1, 0));
  const document = documentWith(entities);
  sameOrder(document.modelSpace.entityIds, ["p", "q", "r", "s"], "orden de partida");

  const front = executeCadEntityCommandBatch(
    document,
    [{ type: "draw-order", entityIds: ["p"], placement: "front" }],
    "DRAWORDER",
  );
  sameOrder(front.document.modelSpace.entityIds, ["q", "r", "s", "p"], "al frente va al final");

  const back = executeCadEntityCommandBatch(
    document,
    [{ type: "draw-order", entityIds: ["s"], placement: "back" }],
    "DRAWORDER",
  );
  sameOrder(back.document.modelSpace.entityIds, ["s", "p", "q", "r"], "al fondo va al principio");

  const above = executeCadEntityCommandBatch(
    document,
    [{ type: "draw-order", entityIds: ["p"], placement: "above", referenceId: "r" }],
    "DRAWORDER",
  );
  sameOrder(above.document.modelSpace.entityIds, ["q", "r", "p", "s"], "encima de `r`");

  const below = executeCadEntityCommandBatch(
    document,
    [{ type: "draw-order", entityIds: ["s"], placement: "below", referenceId: "q" }],
    "DRAWORDER",
  );
  sameOrder(below.document.modelSpace.entityIds, ["p", "s", "q", "r"], "debajo de `q`");

  // Varios objetos conservan su orden RELATIVO. Sin esto, traer al frente un
  // grupo apilado lo devuelve en el orden en que se designó.
  const group = executeCadEntityCommandBatch(
    document,
    [{ type: "draw-order", entityIds: ["r", "p"], placement: "front" }],
    "DRAWORDER",
  );
  sameOrder(
    group.document.modelSpace.entityIds,
    ["q", "s", "p", "r"],
    "`p` sigue por debajo de `r` aunque se designara después",
  );

  // Una referencia que también se mueve no es una referencia.
  checks += 1;
  assert.throws(
    () =>
      executeCadEntityCommandBatch(
        document,
        [{ type: "draw-order", entityIds: ["p", "q"], placement: "above", referenceId: "p" }],
        "DRAWORDER",
      ),
    /referencia/,
    "colocarse respecto de uno mismo se rechaza con su causa",
  );
}

console.log(`overkill.spec: ${checks} comprobaciones verdes.`);
