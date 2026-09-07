/**
 * T-75(a): el panel de estado del guardado, persistente, sin temporizador.
 *
 * Se prueba SIN DOM, como `error-boundary.spec.ts`: es una función pura del
 * estado y las props hasta el primer clic, y lo que decide si el aviso
 * sobrevive doce segundos o para siempre es precisamente que NO haya un
 * `setTimeout` en ningún lado de este archivo — comprobado abajo por lectura
 * del código fuente, la única forma honesta de probar una ausencia.
 *
 * Correr: npx tsx src/components/cad/studio/SaveStatusPanel.spec.ts
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SaveStatusPanel } from "./SaveStatusPanel";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// Sin incidente, no hay nada que pintar.
{
  const html = renderToStaticMarkup(createElement(SaveStatusPanel, { issue: null }));
  ok(html === "", "sin issue, el panel no pinta nada");
}

// Con incidente: se anuncia, y sin título explícito usa uno genérico por tipo.
{
  const html = renderToStaticMarkup(
    createElement(SaveStatusPanel, {
      issue: { kind: "offline", message: "Se cortó la conexión y el guardado no llegó al servidor." },
    }),
  );
  ok(html.includes('role="alert"'), "el panel se anuncia a un lector de pantalla");
  ok(html.includes("Sin conexión"), "sin título explícito, usa el genérico del tipo");
  ok(
    html.includes("Se cortó la conexión y el guardado no llegó al servidor."),
    "el mensaje completo está en el marcado desde el primer render, no detrás de un hover",
  );
}

// Con título explícito, gana sobre el genérico.
{
  const html = renderToStaticMarkup(
    createElement(SaveStatusPanel, {
      issue: { kind: "server", title: "Tu periodo gratuito terminó", message: "..." },
    }),
  );
  ok(html.includes("Tu periodo gratuito terminó"), "el título explícito se usa cuando llega");
  ok(!html.includes("No se pudo guardar"), "no se pinta el genérico si hay uno explícito");
}

// Sin callbacks, no hay botones que prometan una acción que no existe
// (fix-or-hide aplicado a las propias acciones del panel).
{
  const html = renderToStaticMarkup(
    createElement(SaveStatusPanel, {
      issue: { kind: "server", message: "..." },
    }),
  );
  ok(!html.includes("Reintentar"), "sin onRetry, no aparece el botón Reintentar");
  ok(!html.includes("Exportar DXF"), "sin onExportDxf, no aparece el botón Exportar DXF");
}

// Con los dos callbacks, los dos botones aparecen.
{
  const html = renderToStaticMarkup(
    createElement(SaveStatusPanel, {
      issue: { kind: "server", message: "..." },
      onRetry: () => undefined,
      onExportDxf: () => undefined,
    }),
  );
  ok(html.includes("Reintentar"), "con onRetry, aparece el botón Reintentar");
  ok(html.includes("Exportar DXF"), "con onExportDxf, aparece el botón Exportar DXF");
}

// La ausencia que hace persistente al panel: ningún temporizador en el
// archivo. Comprobar esto con DOM exigiría esperar doce segundos de verdad;
// leer el código fuente es la forma honesta de probar una ausencia.
{
  const fuente = readFileSync(path.join(__dirname, "SaveStatusPanel.tsx"), "utf8");
  ok(!/setTimeout|setInterval/.test(fuente), "el panel no se autodestruye: ningún temporizador en el archivo");
}

console.log(`SaveStatusPanel: ${checks}/${checks} comprobaciones verdes`);
