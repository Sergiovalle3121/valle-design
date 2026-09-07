/**
 * T-75(h): el contenedor de avisos no anunciaba NADA a un lector de
 * pantalla — ni `aria-live`, ni `role` — y estaba pintado con color de
 * Tailwind crudo en vez de tokens.
 *
 * El primer intento puso `aria-live` en DOS `<div>` contenedores (uno
 * `polite`, uno `assertive`), y los dos llevaban EXACTAMENTE el mismo
 * `fixed top-4 right-4`: un acierto y un error a la vez se pintaban
 * superpuestos en la misma esquina en vez de apilados. El golden
 * `e2e/golden/53-cad-bim-wall.spec.ts` lo cazó por accidente (buscaba UN
 * `div.fixed.top-4.right-4` y encontraba dos, y su aserción `toContainText`
 * revienta en modo estricto con más de un nodo). Arreglado moviendo
 * `aria-live` a cada TARJETA según su propio `kind`, con una sola pila
 * visual — sigue siendo un patrón válido de región viva (el nodo que
 * aparece es el que lleva el atributo).
 *
 * Lo que se puede comprobar SIN navegador (marcado estático, sin montar un
 * toast de verdad: `renderToString` no re-renderiza tras un `setState`
 * disparado durante el propio render, así que la lista de avisos llega
 * siempre vacía aquí) es que existe UN SOLO contenedor posicionado — no dos
 * — y que sus hijos siguen pasando. El `aria-live` condicional por tarjeta
 * y el `role` por tipo son marcado dinámico — dependen de `t.kind`, así que
 * sólo se ven con una tarjeta de verdad montada — y se verifican por
 * lectura del código fuente, honesto sobre lo que prueba y lo que no.
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

// UN SOLO contenedor con esta clase — la regresión real que rompió el
// golden de BIM/GLB era que hubiera dos.
const contenedores = html.match(/fixed top-4 right-4/g) ?? [];
assert.equal(contenedores.length, 1, "debe existir un único contenedor `fixed top-4 right-4`, no dos");

// Ninguna clase de color crudo sobrevive en el marcado que SÍ se renderiza
// (el contenedor; las tarjetas individuales no están montadas en este
// snapshot, ver cabecera).
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

// El resto —el `aria-live`/`role` por tarjeta, el color de los iconos por
// estado— vive en el código fuente y se verifica ahí: son atributos
// condicionados por datos que este snapshot vacío no puede ejercitar.
const fuente = readFileSync(path.join(__dirname, "ToastContext.tsx"), "utf8");
assert.match(fuente, /role=\{t\.kind === 'error' \? 'alert' : 'status'\}/, "cada tarjeta declara su role según el tipo");
assert.match(
  fuente,
  /aria-live=\{t\.kind === 'error' \? 'assertive' : 'polite'\}/,
  "cada tarjeta declara su propia región viva según el tipo, no un contenedor compartido",
);
assert.match(fuente, /text-danger\b/, "el icono de error usa el token de peligro, no rose-500");
assert.match(fuente, /text-success\b/, "el icono de éxito usa el token de éxito, no emerald-500");
assert.match(fuente, /text-primary\b/, "el icono informativo usa el token de marca, no blue-500");
assert.doesNotMatch(fuente, /rose-500|emerald-500|blue-500|neutral-900|text-gray-\d/, "no queda ningún color de Tailwind crudo en el archivo");

// Identidad estable del valor del contexto. `CadStudioHost` deriva `onNotify`
// de `useToast()` y el monolito lo mete en una docena de dependencias: un
// objeto nuevo por render volvía a renderizar el editor entero en cada aviso y
// en cada auto-descarte. `renderToString` no re-renderiza, así que —como el
// resto de este archivo— se afirma sobre la fuente.
assert.match(fuente, /const api = useMemo<ToastApi>\(/, "el valor del contexto se memoiza sobre `show`");
assert.doesNotMatch(fuente, /const api: ToastApi = \{/, "ya no se construye un objeto de API nuevo en cada render");

console.log("toast-context (T-75h): OK");
