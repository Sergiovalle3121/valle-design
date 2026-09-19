/**
 * Spec de `pipeline-residency.ts`: qué tiles suelta una edición.
 *
 * El caso que lo motiva es el ALTA: el tile al que llega una entidad nueva no
 * la nombra en su `entityIds` (sólo nombra lo ya materializado), y soltar «lo
 * que contiene lo tocado» lo dejaba sirviendo la malla de antes. Medido en la
 * demo el 2026-09-19: LINE creaba la línea y el lienzo no la pintaba. El
 * recorrido completo —reconstruir y dibujar— lo cubren `pipeline.spec.ts` y
 * `render-pipeline-host.spec.ts`; aquí va la decisión pura.
 */
import assert from "node:assert/strict";
import {
  cadNewResidentTile,
  cadReleaseEditedTiles,
  cadReleaseTiles,
  type CadResidentTile,
} from "./pipeline-residency";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/** Un tile ya construido con estas entidades materializadas. */
function built(entityIds: string[], zoomOctave = 0): CadResidentTile {
  const tile = cadNewResidentTile([], zoomOctave);
  tile.entityIds.push(...entityIds);
  tile.complete = true;
  return tile;
}

function maps(): {
  resident: Map<string, CadResidentTile>;
  staging: Map<string, CadResidentTile>;
} {
  return {
    resident: new Map([
      ["0:0", built(["a", "b"])],
      ["1:0", built(["c"])],
      ["2:0", built(["d"])],
    ]),
    staging: new Map([
      // Relevo de otra octava del 0:0, y un staging suelto del 3:0.
      ["0:0", built(["a"], 1)],
      ["3:0", built(["e"], 1)],
    ]),
  };
}

// ---------------------------------------------------------------------------
// Un tile por empezar no tiene nada materializado.
// ---------------------------------------------------------------------------
const fresh = cadNewResidentTile(["x", "y"], 3);
assert.deepEqual(fresh.pending, ["x", "y"]);
assert.equal(fresh.cursor, 0);
assert.deepEqual(fresh.entityIds, [], "nada materializado: `entityIds` sólo nombra lo ya construido");
assert.equal(fresh.complete, false);
assert.equal(fresh.batches, null);
assert.equal(fresh.zoomOctave, 3);
ok(fresh.builders.size === 0 && fresh.instances === 0, "un tile nuevo empieza vacío, en su octava");

// ---------------------------------------------------------------------------
// EDITAR en su sitio: se suelta el tile que la contenía, y sólo ése.
// ---------------------------------------------------------------------------
{
  const { resident, staging } = maps();
  const released = cadReleaseEditedTiles(resident, staging, new Set(["c"]), new Set(["1:0"]));
  assert.equal(released, 1);
  ok(!resident.has("1:0") && resident.has("0:0") && resident.has("2:0"), "editar suelta el tile que la contenía y nada más");
}

// ---------------------------------------------------------------------------
// ALTA: la entidad no está en NINGÚN `entityIds`. Sin el destino no se soltaba
// nada y el tile seguía sirviendo la malla de antes.
// ---------------------------------------------------------------------------
{
  const { resident, staging } = maps();
  const released = cadReleaseEditedTiles(resident, staging, new Set(["nueva"]), new Set(["2:0"]));
  assert.equal(released, 1, "un alta suelta el tile residente al que llega");
  ok(!resident.has("2:0"), "el tile destino de un alta se reconstruye aunque no la nombre");
  ok(resident.has("0:0") && resident.has("1:0"), "y ningún otro");
}

// Un alta que cae en un tile sin residente no suelta nada: se construirá de cero.
{
  const { resident, staging } = maps();
  assert.equal(cadReleaseEditedTiles(resident, staging, new Set(["nueva"]), new Set(["9:9"])), 0);
  ok(resident.size === 3 && staging.size === 2, "un alta en un tile nuevo no toca los residentes");
}

// ---------------------------------------------------------------------------
// MOVE que cruza de tile: se sueltan el de origen (la contenía) y el de
// destino (la recibe). Antes sólo el de origen, y lo movido desaparecía.
// ---------------------------------------------------------------------------
{
  const { resident, staging } = maps();
  const released = cadReleaseEditedTiles(resident, staging, new Set(["c"]), new Set(["2:0"]));
  assert.equal(released, 2);
  ok(!resident.has("1:0") && !resident.has("2:0") && resident.has("0:0"), "un MOVE entre tiles suelta origen y destino");
}

// ---------------------------------------------------------------------------
// STAGING: soltar un residente suelta su relevo, y un relevo obsoleto por sí
// solo también cae — pero no cuenta como residente soltado.
// ---------------------------------------------------------------------------
{
  const { resident, staging } = maps();
  cadReleaseEditedTiles(resident, staging, new Set(["b"]), new Set());
  ok(!resident.has("0:0") && !staging.has("0:0"), "soltar el residente suelta también su relevo en staging");
}
{
  const { resident, staging } = maps();
  const released = cadReleaseEditedTiles(resident, staging, new Set(["nueva"]), new Set(["3:0"]));
  assert.equal(released, 0, "un staging suelto no cuenta como residente soltado");
  ok(!staging.has("3:0") && staging.has("0:0"), "el staging destino de un alta también se tira");
}

// ---------------------------------------------------------------------------
// Salir de la vista suelta los dos mapas.
// ---------------------------------------------------------------------------
{
  const { resident, staging } = maps();
  cadReleaseTiles(resident, staging, ["0:0", "3:0"]);
  ok(!resident.has("0:0") && !staging.has("0:0") && !staging.has("3:0"), "salir de la vista suelta residente y staging");
  ok(resident.has("1:0") && resident.has("2:0"), "y deja el resto");
}

console.log(`pipeline-residency: ${checks} comprobaciones verdes — editar suelta su tile, un ALTA suelta el tile al que llega, un MOVE entre tiles suelta origen y destino, y staging acompaña.`);
