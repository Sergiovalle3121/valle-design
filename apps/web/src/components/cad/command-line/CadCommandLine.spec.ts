/**
 * T-73(h): tres huecos «media» en el prompt vivo que juntos eran un callejón
 * sin salida — la caja no anunciaba con qué diálogo iba (`aria-describedby`),
 * el diálogo no podía recibir foco para releerse, y F2 (la tecla de AutoCAD
 * para esto) no existía.
 *
 * El tacto con teclado (F2, flechas, Escape) exige un DOM interactivo que
 * este runner no tiene — mismo trato que otros componentes de esta carpeta.
 * Lo que SÍ se prueba sin jsdom: el marcado sale enlazado desde el primer
 * render, y por lectura de fuente, que F2 existe y que las filas del
 * historial usan una clave estable (no el índice, que cambia al recortarse
 * `history` a los últimos 60 renglones y forzaría un remontaje completo del
 * diálogo en cada paso — el aviso entero se releería de más en cada línea).
 *
 * Correr: npx tsx src/components/cad/command-line/CadCommandLine.spec.ts
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CadCommandLine } from "./CadCommandLine";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

{
  const html = renderToStaticMarkup(
    createElement(CadCommandLine, {
      prompt: null,
      history: [{ id: 1, text: "LINE", level: "info" }],
      onSubmit: () => undefined,
      onKeyword: () => undefined,
      onCancel: () => undefined,
      onRepeat: () => undefined,
    }),
  );
  ok(html.includes('id="cad-command-line-log"'), "el diálogo tiene un id fijo para enlazarse");
  ok(html.includes('aria-describedby="cad-command-line-log"'), "la caja describe con qué diálogo va");
  ok(html.includes('tabindex="0"'), "el diálogo puede recibir foco (releerse con teclado)");
  ok(html.includes('role="log"') && html.includes('aria-live="polite"'), "sigue siendo una región viva educada");
}

{
  const fuente = readFileSync(path.join(__dirname, "CadCommandLine.tsx"), "utf8");
  ok(fuente.includes('event.key === "F2"'), "F2 existe como atajo del prompt vivo");
  ok(
    fuente.includes("history.map((entry) =>") && fuente.includes("key={entry.id}"),
    "la clave de cada renglón es su id estable, no su índice",
  );
  ok(
    !/key=\{`\$\{index\}/.test(fuente),
    "no queda una clave basada en índice que reintroduzca el remontaje completo",
  );
}

console.log(`CadCommandLine: ${checks}/${checks} comprobaciones verdes`);
