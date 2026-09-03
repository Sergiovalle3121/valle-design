/**
 * El anfitrión de referencias externas: qué dice y CUÁNDO lo dice.
 *
 * Lo que se afirma es la propiedad que separa un renglón útil de un «Hecho»
 * inventado: la orden es síncrona y la traída no, así que el renglón inmediato
 * sólo puede decir que se está trayendo, y el veredicto llega después por el
 * mismo diálogo — con su motivo si falla.
 */
import { strict as assert } from "node:assert";
import { handleCadXrefHostRequest } from "./xref-host";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";

let verdes = 0;
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

const peticion: CadHostRequest = {
  kind: "xref-attach",
  assetId: "plantas/base",
  revision: "UNIVERSAL",
  mode: "attachment",
  insertion: { x: 1_000, y: 2_000 },
  scale: 1,
  rotation: 0,
};

const espera = () => new Promise((resolve) => setTimeout(resolve, 0));

async function correr() {

// --- 1 · se pide, se dice que se está trayendo, y luego el veredicto --------
{
  const notas: string[] = [];
  const recibido: unknown[] = [];
  const linea = handleCadXrefHostRequest(peticion, {
    attach: async (draft) => {
      recibido.push(draft);
    },
    note: (text) => notas.push(text),
  });
  eq(linea, "Trayendo plantas/base del inquilino…", "el renglón inmediato NO afirma que ya esté");
  eq(JSON.stringify(recibido[0]), JSON.stringify({
    assetId: "plantas/base",
    revision: "UNIVERSAL",
    name: "plantas/base",
    mode: "attachment",
    x: 1_000,
    y: 2_000,
    scale: 1,
    rotation: 0,
  }), "y el anfitrión recibe exactamente lo que el motor decidió");
  await espera();
  eq(
    notas[0],
    "plantas/base referenciado como adjunto en 1000, 2000.",
    "el veredicto llega después, por el diálogo",
  );
}

// --- 2 · si la traída falla, se dice POR QUÉ --------------------------------
{
  const notas: [string, string | undefined][] = [];
  handleCadXrefHostRequest(peticion, {
    attach: async () => {
      throw new Error("Referenced tenant CAD asset is missing.");
    },
    note: (text, level) => notas.push([text, level]),
  });
  await espera();
  eq(
    notas[0][0],
    "No se pudo referenciar plantas/base: Referenced tenant CAD asset is missing.",
    "el motivo viaja entero: no se traduce a «no se pudo»",
  );
  eq(notas[0][1], "error", "y se marca como error");
}

// --- 3 · la revisión concreta se nombra ------------------------------------
{
  const notas: string[] = [];
  const otra: CadHostRequest = {
    kind: "xref-attach",
    assetId: "plantas/base",
    revision: "R7",
    mode: "overlay",
    insertion: { x: 1_000, y: 2_000 },
    scale: 1,
    rotation: 0,
  };
  handleCadXrefHostRequest(
    otra,
    { attach: async () => undefined, note: (text) => notas.push(text) },
  );
  await espera();
  eq(notas[0], "plantas/base@R7 referenciado como superposición en 1000, 2000.", "la revisión y el modo salen en el renglón");
}

// --- 4 · sin anfitrión se dice qué falta, no se finge -----------------------
eq(
  handleCadXrefHostRequest(peticion, null),
  "Este espacio de trabajo no sabe traer dibujos del inquilino: falta el anfitrión de referencias externas.",
  "sin puente, la orden dice qué falta",
);

// --- 5 · lo ajeno se deja pasar --------------------------------------------
eq(
  handleCadXrefHostRequest({ kind: "space", space: "paper" } as CadHostRequest, {
    attach: async () => undefined,
    note: () => undefined,
  }),
  null,
  "una petición de otro anfitrión se deja pasar",
);

}

void correr().then(() => console.log(`xref-host: ${verdes} comprobaciones verdes`));
