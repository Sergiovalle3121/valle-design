/**
 * T-73(f/g): el marco común de los ocho cuadros modales del estudio.
 *
 * El montaje real (Tab que cicla, Escape que cierra, foco que se atrapa y se
 * devuelve) exige un DOM interactivo que este runner no tiene — mismo trato
 * que `error-boundary.spec.ts`. Lo que SÍ se puede probar sin jsdom:
 * - el marcado base (`role="dialog"`, `aria-modal`, `aria-labelledby`) sale
 *   desde el primer render, no detrás de un efecto;
 * - por lectura de fuente, que el Escape usa `stopImmediatePropagation` y no
 *   `stopPropagation` — la regresión real que este arreglo corrige: con dos
 *   `CadDialogShell` montados a la vez (dos cuadros del editor abiertos),
 *   ambos escuchan `keydown` en `document`, así que `stopPropagation` no basta
 *   para evitar que un solo Escape cierre los dos.
 *
 * Correr: npx tsx src/components/cad/dialogs/CadDialogShell.spec.ts
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CadDialogShell } from "./CadDialogShell";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

{
  const html = renderToStaticMarkup(
    createElement(
      CadDialogShell,
      {
        onClose: () => undefined,
        icon: null,
        titulo: "Exportar DXF",
        id: "dxf-export",
        ancho: "w-[480px]",
      } as Parameters<typeof CadDialogShell>[0],
      "contenido",
    ),
  );
  ok(html.includes('role="dialog"'), "el cuadro se anuncia como diálogo");
  ok(html.includes('aria-modal="true"'), "el cuadro se anuncia como modal");
  ok(html.includes('aria-labelledby="dxf-export-titulo"'), "el título está enlazado por aria-labelledby");
  ok(html.includes('id="dxf-export-titulo"'), "el id del título coincide con el aria-labelledby");
  ok(html.includes("Exportar DXF"), "el título llega al marcado");
}

{
  const fuente = readFileSync(path.join(__dirname, "CadDialogShell.tsx"), "utf8");
  ok(
    fuente.includes("event.stopImmediatePropagation()"),
    "el Escape usa stopImmediatePropagation: con dos cuadros abiertos, uno solo debe cerrarse",
  );
  ok(
    !/[^.]stopPropagation\(\)/.test(fuente.replace(/stopImmediatePropagation/g, "")),
    "no queda ningún stopPropagation suelto que reintroduzca el cierre doble",
  );
}

console.log(`CadDialogShell: ${checks}/${checks} comprobaciones verdes`);
