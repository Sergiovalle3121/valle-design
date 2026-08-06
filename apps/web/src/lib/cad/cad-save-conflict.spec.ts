/**
 * Un token CAS que ya se sabe caduco no puede reintentarse para siempre.
 *
 * El guardado lleva la versión sobre la que se editó. Ante un 409 esa versión
 * local NO cambia, así que el siguiente autosave la vuelve a mandar: una
 * petición condenada cada pocos segundos, mientras la pestaña siga abierta, con
 * la versión buena del servidor ya en pantalla.
 */
import { strict as assert } from "node:assert";
import {
  cadAutosaveBlockedByConflict,
  cadSaveConflictLabel,
  latchCadSaveConflict,
  reconcileCadSaveConflict,
} from "./cad-save-conflict";

/* ── EL DEFECTO: reintentar la versión ya rechazada ──────────────────────── */
{
  const conflict = latchCadSaveConflict(7, 9);
  assert.equal(
    cadAutosaveBlockedByConflict(conflict, 7),
    true,
    "el autosave no puede volver a mandar la misma versión que el servidor acaba de rechazar",
  );
}

/* ── Sin conflicto, el autosave nunca se frena ───────────────────────────── */
assert.equal(cadAutosaveBlockedByConflict(null, 7), false);

/* ── El enclavamiento se suelta solo cuando la base local avanza ─────────── */
{
  const conflict = latchCadSaveConflict(7, 9);
  // Tras recargar, la base local pasa a ser la del servidor.
  assert.equal(
    cadAutosaveBlockedByConflict(conflict, 9),
    false,
    "con una base nueva el intento es legítimo: nadie tiene que acordarse de limpiar el conflicto",
  );
  assert.equal(reconcileCadSaveConflict(conflict, 9), null);
  assert.equal(reconcileCadSaveConflict(conflict, 7), conflict);
}

/* ── Una base anterior tampoco queda bloqueada por arrastre ──────────────── */
{
  const conflict = latchCadSaveConflict(7, 9);
  assert.equal(
    cadAutosaveBlockedByConflict(conflict, 6),
    false,
    "sólo se frena la versión exacta que falló, no un rango",
  );
}

/* ── La versión del servidor puede faltar sin romper el enclavamiento ───── */
{
  for (const missing of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY]) {
    const conflict = latchCadSaveConflict(3, missing as number | null | undefined);
    assert.equal(
      conflict.serverVersion,
      null,
      "una versión de servidor ilegible se guarda como ausente, no como número basura",
    );
    assert.equal(
      cadAutosaveBlockedByConflict(conflict, 3),
      true,
      "el conflicto frena el autosave aunque el servidor no dijera su versión",
    );
  }
}

/* ── La versión 0 es una base válida, no un hueco ────────────────────────── */
{
  const conflict = latchCadSaveConflict(0, 1);
  assert.equal(
    cadAutosaveBlockedByConflict(conflict, 0),
    true,
    "un documento aún en v0 puede entrar en conflicto igual que cualquier otro",
  );
  assert.equal(latchCadSaveConflict(0, 0).serverVersion, 0, "servidor v0 es un dato, no un ausente");
}

/* ── La etiqueta dice que el autosave está DETENIDO ──────────────────────── */
{
  assert.equal(
    cadSaveConflictLabel(latchCadSaveConflict(7, 9)),
    "Conflicto CAS · servidor v9 · autosave detenido",
  );
  assert.equal(
    cadSaveConflictLabel(latchCadSaveConflict(7, null)),
    "Conflicto CAS · autosave detenido",
    "sin versión del servidor no se inventa una",
  );
  assert.match(
    cadSaveConflictLabel(latchCadSaveConflict(7, 9)),
    /detenido/,
    "callar que el autosave paró insinuaría que algo sigue intentándolo de fondo",
  );
}

console.log(
  "cad-save-conflict: el conflicto se enclava contra su versión base y detiene el reintento automático",
);
