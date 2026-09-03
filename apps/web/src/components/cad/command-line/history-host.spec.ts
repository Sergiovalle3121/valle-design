/**
 * El anfitrión del historial cuenta lo que HIZO, no lo que le pidieron.
 *
 * Es la diferencia entre un «Hecho» que miente y un renglón útil: `UNDO 5` con
 * tres pasos en la pila deshace tres y lo dice, y con la pila vacía no dice
 * «Hecho» sino «Nada que deshacer». Ese es exactamente el fallo de clase que
 * `check:command-integrity` persigue en todo el registro.
 */
import { strict as assert } from "node:assert";
import { handleCadHistoryHostRequest, CAD_HISTORY_MAX_STEPS } from "./history-host";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";

let verdes = 0;
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

/** Pila falsa: `profundidad` pasos disponibles y un contador de llamadas. */
function pila(profundidad: number) {
  let restantes = profundidad;
  let llamadas = 0;
  return {
    llamadas: () => llamadas,
    undo: () => {
      llamadas += 1;
      if (restantes === 0) return false;
      restantes -= 1;
      return true;
    },
    redo: () => {
      llamadas += 1;
      if (restantes === 0) return false;
      restantes -= 1;
      return true;
    },
  };
}

const peticion = (action: "undo" | "redo", steps: number): CadHostRequest => ({
  kind: "history",
  action,
  steps,
});

// --- 1 · un paso, el gesto de `U` -------------------------------------------
{
  const p = pila(3);
  eq(handleCadHistoryHostRequest(peticion("undo", 1), p), "Deshecho: 1 operación.", "`U` deshace uno y lo dice en singular");
  eq(p.llamadas(), 1, "y da exactamente un paso");
}

// --- 2 · varios pasos de una vez --------------------------------------------
{
  const p = pila(5);
  eq(handleCadHistoryHostRequest(peticion("undo", 3), p), "Deshecho: 3 operaciones.", "`UNDO 3` deshace tres");
  eq(p.llamadas(), 3, "y da exactamente tres pasos");
}

// --- 3 · más de los que hay: cuenta los que DIO -----------------------------
{
  const p = pila(2);
  eq(
    handleCadHistoryHostRequest(peticion("undo", 5), p),
    "Deshecho: 2 operaciones (se pidieron 5; la pila no daba para más).",
    "pedir más de los que hay no se resuelve con un «Hecho»",
  );
}

// --- 4 · pila vacía: NO dice «hecho» ----------------------------------------
{
  const p = pila(0);
  eq(handleCadHistoryHostRequest(peticion("undo", 1), p), "Nada que deshacer.", "con la pila vacía se dice");
  eq(handleCadHistoryHostRequest(peticion("redo", 1), p), "Nada que rehacer.", "y rehacer igual");
}

// --- 5 · el tope existe y es el que se anuncia ------------------------------
{
  const p = pila(CAD_HISTORY_MAX_STEPS + 50);
  handleCadHistoryHostRequest(peticion("undo", 10_000), p);
  eq(p.llamadas(), CAD_HISTORY_MAX_STEPS, "un número absurdo se acota al tope declarado");
}

// --- 6 · lo ajeno se deja pasar ---------------------------------------------
{
  const ajena: CadHostRequest = { kind: "space", space: "paper", layoutId: "A-101" };
  eq(handleCadHistoryHostRequest(ajena, pila(3)), null, "una petición de otro anfitrión se deja pasar");
}

console.log(`history-host: ${verdes} comprobaciones verdes`);
