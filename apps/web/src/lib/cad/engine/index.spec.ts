/**
 * El registro que usa el producto, y el inventario honesto de lo que falta.
 *
 * Las specs de cada familia de comandos prueban su geometría contra registros
 * que ellas mismas montan. Ninguna prueba el registro REAL, y ése es el que
 * decide qué pasa cuando alguien teclea `TR`: si un comando no llega hasta
 * aquí, no existe para el usuario por muy verde que esté su spec.
 *
 * Además publica en cada corrida cuántos alias de `acad.pgp` siguen sin
 * implementación. Es el número que impide que «tiene motor de comandos» se lea
 * como «tiene los comandos»: al escribir esto, 19 comandos registrados y 104 de
 * 125 alias todavía sin implementar. El log lo dice en cada corrida, sin que
 * haya que ir a buscarlo ni fiarse de un comentario que envejece.
 */
import { strict as assert } from "node:assert";
import { CAD_COMMAND_ALIASES } from "./alias-table";
import { CAD_COMMAND_DESCRIPTORS, CAD_COMMAND_REGISTRY_V2 } from "./index";

const registry = CAD_COMMAND_REGISTRY_V2;
const names = registry.all().map((command) => command.name);

// --- el registro se construye, que no es gratis -------------------------------
{
  // `createCadCommandRegistry` revienta ante nombres duplicados y alias
  // ambiguos. Que este módulo se haya podido importar ya demuestra que no los
  // hay, pero se afirma explícitamente para que el día que alguien registre dos
  // veces el mismo comando falle ESTA spec con su nombre, y no un import lejano.
  assert.equal(
    new Set(names).size,
    names.length,
    `nombres duplicados en el registro: ${names.join(", ")}`,
  );
  assert.equal(
    registry.all().length,
    CAD_COMMAND_DESCRIPTORS.length,
    "el registro contiene exactamente los descriptores declarados",
  );
}

// --- los alias que el producto promete, resuelven ------------------------------
{
  for (const command of registry.all())
    for (const alias of command.aliases) {
      assert.equal(
        registry.get(alias)?.name,
        command.name,
        `el alias ${alias} debería llevar a ${command.name}`,
      );
      // La variante con guion de AutoCAD (`-LAYER`, `-INSERT`) resuelve al
      // mismo descriptor. Es lo que hace posible SCRIPT, y se comprueba aquí
      // porque es la clase de detalle que se rompe sin que nada avise.
      assert.equal(
        registry.get(`-${alias}`)?.name,
        command.name,
        `la variante -${alias} debería resolver igual`,
      );
    }
}

// --- las familias declaradas están todas ---------------------------------------
{
  // Si una familia deja de exportarse o se olvida en `index.ts`, sus comandos
  // desaparecen del producto en silencio. Se nombran los que hoy deben estar.
  for (const expected of [
    "LINE",
    "PLINE",
    "RECTANG",
    "CIRCLE",
    "ARC",
    "ELLIPSE",
    "POLYGON",
    "SPLINE",
    "DONUT",
    "REVCLOUD",
    "POINT",
    "DIVIDE",
    "MEASURE",
    "XLINE",
    "RAY",
    "SOLID",
    "WIPEOUT",
    "IMAGE",
    "ATTDEF",
    "TABLE",
    "ERASE",
    "MOVE",
    "COPY",
    "OFFSET",
    "ROTATE",
    "SCALE",
    "FILLET",
    "CHAMFER",
    "TRIM",
    "EXTEND",
    "BREAK",
    "MIRROR",
    "ARRAY",
    "ARRAYEDIT",
    "ALIGN",
    "MATCHPROP",
    "STRETCH",
    "LENGTHEN",
    "JOIN",
    "EXPLODE",
    "PEDIT",
    "SPLINEDIT",
    "ZOOM",
    "PAN",
    "VIEW",
    "REGEN",
    "REGENALL",
    "BLOCK",
    "WBLOCK",
    "INSERT",
    "BASE",
    "ATTEDIT",
    "GROUP",
    "UNGROUP",
    "PURGE",
  ])
    assert.ok(names.includes(expected), `${expected} no llegó al registro del producto`);
}

// --- inventario honesto ---------------------------------------------------------
const pending = registry.unresolvedAliases();
const total = Object.keys(CAD_COMMAND_ALIASES).length;
assert.ok(
  pending.length > 0,
  "si algún día esto llega a cero, celébrese y cámbiese la aserción",
);
console.log(
  `registro del producto: ${names.length} comandos (${names.join(", ")}) · ` +
    `${pending.length} de ${total} alias de acad.pgp todavía sin implementar`,
);
