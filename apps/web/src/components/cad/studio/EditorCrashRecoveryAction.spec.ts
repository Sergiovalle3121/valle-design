/**
 * T-72(h): la acción de recuperación de la frontera de error del editor.
 *
 * Se prueba SIN DOM, como `error-boundary.spec.ts`: sin `scope` no hay nada
 * que ofrecer y el componente no debe pintar un botón que promete y no puede
 * cumplir (fix-or-hide). El resto de la lógica —leer el diario de
 * recuperación, exportar a DXF— son funciones puras ya probadas en
 * `cad-recovery.ts` y `dxf-document-export.ts`; lo que decide el estado del
 * BOTÓN (cargando/listo/ninguno/error) es una máquina de estados de React que
 * este repo no prueba con clics simulados en las suites `tsx` (no hay jsdom
 * aquí): esa cobertura queda para un golden de navegador si se necesita.
 *
 * Correr: npx tsx src/components/cad/studio/EditorCrashRecoveryAction.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorCrashRecoveryAction } from "./EditorCrashRecoveryAction";

// Sin scope (sin tenantId/userId resueltos) no hay diario que leer: el
// componente no pinta nada en vez de un botón que siempre fallaría.
{
  const html = renderToStaticMarkup(createElement(EditorCrashRecoveryAction, { scope: null }));
  assert.equal(html, "", "sin scope, el componente no pinta ningún botón");
}

// Con scope, el estado inicial ofrece la acción y no adelanta un resultado
// que todavía no se pidió.
{
  const html = renderToStaticMarkup(
    createElement(EditorCrashRecoveryAction, {
      scope: {
        tenantId: "t1",
        userId: "u1",
        projectId: "p1",
        model: "doc-1",
        revision: "DOCUMENT",
      },
    }),
  );
  assert.match(html, /Descargar el último punto de recuperación/, "ofrece la acción de recuperación");
  assert.doesNotMatch(html, /No hay ningún punto de recuperación/, "no adelanta 'ninguno' antes de pedirlo");
  assert.doesNotMatch(html, /No se pudo leer/, "no adelanta un error antes de pedirlo");
}

console.log("EditorCrashRecoveryAction: 2/2");
