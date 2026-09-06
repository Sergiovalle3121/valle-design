/**
 * T-75(h): el contenedor de avisos no anunciaba NADA a un lector de
 * pantalla — ni `aria-live`, ni `role` — y estaba pintado con color de
 * Tailwind crudo en vez de tokens.
 *
 * Lo que se puede comprobar SIN navegador (marcado estático, sin montar un
 * toast de verdad: `renderToString` no re-renderiza tras un `setState`
 * disparado durante el propio render, así que la lista de avisos llega
 * siempre vacía aquí) es la ESTRUCTURA fija: las dos regiones vivas existen
 * desde el primer render, con la polaridad correcta. Que cada TARJETA lleve
 * su `role` (`alert` para error, `status` para el resto) es marcado
 * dinámico — depende de `t.kind`, así que sólo se ve con una tarjeta de
 * verdad montada — y queda para un golden de navegador si hace falta
 * volver a medirlo; aquí se verifica por lectura del código fuente, que es
 * honesto sobre lo que prueba y lo que no.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ToastProvider } from "./ToastContext";

const html = renderToString(
  createElement(ToastProvider, null, createElement("div", null, "contenido")),
);

// Los hijos pasan: el provider no envuelve la app en nada que rompa layout.
assert.match(html, /contenido/, "el provider sigue pintando sus hijos");

// Las dos regiones vivas existen desde el primer render, no sólo cuando hay
// un aviso — un lector de pantalla tiene que conocerlas de antemano para
// anunciar lo que entre después.
assert.match(html, /aria-live="polite"/, "hay una región polite para aciertos/info");
assert.match(html, /aria-live="assertive"/, "hay una región assertive para errores");

// Ninguna clase de color crudo sobrevive en el marcado que SÍ se renderiza
// (el contenedor y sus dos regiones; las tarjetas individuales no están
// montadas en este snapshot, ver cabecera).
for (const cruda of [
  "bg-white/85",
  "dark:bg-neutral-900/85",
  "text-black",
  "dark:text-white",
  "text-gray-600",
  "border-black/5",
]) {
  assert.doesNotMatch(html, new RegExp(cruda.replace(/[/[\]]/g, "\\$&")), `«${cruda}» no debería seguir en el marcado`);
}

// El resto —el `role` por tarjeta, el color de los iconos por estado— vive
// en el código fuente y se verifica ahí: son atributos condicionados por
// datos que este snapshot vacío no puede ejercitar.
const fuente = readFileSync(path.join(__dirname, "ToastContext.tsx"), "utf8");
assert.match(fuente, /role=\{t\.kind === 'error' \? 'alert' : 'status'\}/, "cada tarjeta declara su role según el tipo");
assert.match(fuente, /text-danger\b/, "el icono de error usa el token de peligro, no rose-500");
assert.match(fuente, /text-success\b/, "el icono de éxito usa el token de éxito, no emerald-500");
assert.match(fuente, /text-primary\b/, "el icono informativo usa el token de marca, no blue-500");
assert.doesNotMatch(fuente, /rose-500|emerald-500|blue-500|neutral-900|text-gray-\d/, "no queda ningún color de Tailwind crudo en el archivo");

console.log("toast-context (T-75h): OK");
