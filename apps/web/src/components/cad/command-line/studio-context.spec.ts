/**
 * Traducción del estudio al contexto del motor.
 *
 * Lo que se comprueba aquí no es «que copie campos». Son las tres decisiones
 * que cambian el comportamiento del producto: que el cursor ausente se propague
 * ausente en vez de convertirse en el origen, que la consulta por id no recorra
 * el documento, y que un dibujo todavía sin escena produzca un contexto usable
 * en vez de reventar.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "@/lib/cad/cad-document";
import { cadStudioCommandContext } from "./studio-context";

function documentWith(ids: readonly string[]): CadDocument {
  return {
    entities: ids.map((id) => ({
      id,
      type: "line",
      layer: "0",
      start: { x: 0, y: 0, z: 0 },
      end: { x: 10, y: 0, z: 0 },
    })),
  } as unknown as CadDocument;
}

const base = {
  selection: [],
  activeLayer: "MUROS",
  view: null,
  cursor: null,
  newEntityId: () => "id-1",
};

// --- el cursor ausente NO se inventa ------------------------------------------
{
  const context = cadStudioCommandContext({ ...base, document: documentWith(["a"]) });
  assert.equal(
    context.cursor,
    undefined,
    "sin puntero enrutado no hay cursor: la entrada directa de distancia debe " +
      "fallar diciéndolo, no producir un punto plausible medido desde el origen",
  );
  const withCursor = cadStudioCommandContext({
    ...base,
    document: documentWith(["a"]),
    cursor: { x: 3, y: 4 },
  });
  assert.deepEqual(withCursor.cursor, { x: 3, y: 4 });
}

// --- sin escena todavía, contexto usable --------------------------------------
{
  const context = cadStudioCommandContext({ ...base, document: null });
  assert.deepEqual(context.entityIds, [], "un dibujo sin abrir no tiene entidades");
  assert.equal(context.view.pixelsPerUnit, 1, "y la escala cae a 1 px por unidad");
  assert.equal(context.entity?.("lo-que-sea"), undefined);
}

// --- la vista se propaga tal cual ---------------------------------------------
{
  const context = cadStudioCommandContext({
    ...base,
    document: documentWith([]),
    view: {
      mode: "2d",
      centerX: 120,
      centerY: -40,
      pixelsPerUnit: 0.25,
      widthPx: 800,
      heightPx: 600,
      twistDeg: 0,
      yScreenSign: 1,
    },
  });
  assert.deepEqual(context.view, { pixelsPerUnit: 0.25, centerX: 120, centerY: -40 });
}

// --- la consulta por id no recorre el documento -------------------------------
{
  const ids = Array.from({ length: 5000 }, (_, index) => `e${index}`);
  const context = cadStudioCommandContext({ ...base, document: documentWith(ids) });
  assert.equal(context.entity?.("e4999")?.id, "e4999", "encuentra la última igual que la primera");
  assert.equal(context.entity?.("no-existe"), undefined);
  // Un índice se construye una vez; un `find` por consulta costaría 5.000
  // recorridos para designar 5.000 objetos. Se mide el orden, no el reloj:
  // 5.000 consultas sobre un mapa son inmediatas y sobre `find` no lo son.
  const started = process.hrtime.bigint();
  for (const id of ids) context.entity?.(id);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(
    elapsedMs < 200,
    `5.000 consultas tardaron ${elapsedMs.toFixed(1)} ms; eso es búsqueda lineal`,
  );
}

// --- capa activa y selección se propagan sin tocar ----------------------------
{
  const context = cadStudioCommandContext({
    ...base,
    document: documentWith(["a", "b"]),
    selection: ["b"],
  });
  assert.deepEqual(context.selection, ["b"]);
  assert.equal(context.activeLayer, "MUROS", "la entidad nueva nace donde dibuja el usuario");
  assert.equal(context.newEntityId(), "id-1", "el generador es el del editor, inyectado");
}

// --- los BLOQUES viajan: sin ellos EXPLODE de un INSERT se niega ---------------
{
  const withBlocks = cadStudioCommandContext({
    ...base,
    document: {
      entities: [],
      blocks: [{ id: "b", name: "PILAR", basePoint: { x: 0, y: 0, z: 0 }, entities: [] }],
    } as unknown as CadDocument,
  });
  assert.equal(
    withBlocks.blocks?.().length,
    1,
    "EXPLODE de un INSERT necesita el contenido del bloque; sin él se negaría",
  );
  const empty = cadStudioCommandContext({ ...base, document: null });
  assert.deepEqual(empty.blocks?.(), [], "y sin dibujo abierto, la lista está vacía, no ausente");
}

console.log("cad studio command context specs passed");
