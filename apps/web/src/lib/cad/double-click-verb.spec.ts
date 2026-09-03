/**
 * La tabla de verbos del doble clic, contra el REGISTRO real.
 *
 * Dos direcciones, y la segunda es la que importa: cada orden que esta tabla
 * promete tiene que existir en el motor. Una tabla que nombre una orden que no
 * está convierte el doble clic en «Comando desconocido», que es peor que no
 * responder.
 */
import { strict as assert } from "node:assert";
import { CAD_DOUBLE_CLICK_TYPES, cadDoubleClickVerb } from "./double-click-verb";
import { CAD_COMMAND_REGISTRY_V2 } from "./engine/index";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};

// --- 1 · toda orden prometida existe en el registro -------------------------
for (const tipo of CAD_DOUBLE_CLICK_TYPES) {
  const verbo = cadDoubleClickVerb(tipo);
  ok(verbo, `${tipo} tiene verbo`);
  if (verbo?.kind === "command")
    ok(
      CAD_COMMAND_REGISTRY_V2.get(verbo.command),
      `el doble clic sobre ${tipo} promete ${verbo.command}, que tiene que existir`,
    );
}

// --- 2 · el MTEXT abre el editor del estudio, no una orden ------------------
ok(cadDoubleClickVerb("mtext")?.kind === "mtext-editor", "MTEXT abre el editor de párrafo");

// --- 3 · un tipo sin verbo no inventa ninguno -------------------------------
for (const tipo of ["line", "circle", "hatch", "image", "solid3d", "wall"])
  ok(cadDoubleClickVerb(tipo) === null, `${tipo} todavía no abre nada, y no se finge`);

console.log(`double-click-verb: ${verdes} comprobaciones verdes`);
