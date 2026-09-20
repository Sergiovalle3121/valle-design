/**
 * Ola «estado»: las pestañas Modelo / Presentación bajan de la fila superior
 * (mezcladas con el título) a la barra de estado, y hablan español — «Layout»
 * era inglés en superficie visible.
 *
 * Correr: node ../../node_modules/tsx/dist/cli.mjs
 *   src/components/cad/studio/CadSpaceTabs.spec.ts
 * (desde apps/web, como el resto de specs sueltos de esta máquina).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CadSpaceTabs } from "./CadSpaceTabs";
import type { CadPaperSpace } from "@/lib/cad/cad-paper-viewport";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const noop = () => undefined;

const space = (id: string, name: string): CadPaperSpace => ({
  id,
  name,
  entityIds: [],
  page: { width: 297, height: 210, unit: "mm", orientation: "landscape" },
});

// ── Sin presentaciones: sólo Modelo, activo, y la invitación a crear una ──
{
  const html = renderToStaticMarkup(
    createElement(CadSpaceTabs, {
      isModelActive: true,
      spaces: [],
      activeSpaceId: null,
      onSelectModel: noop,
      onSelectSpace: noop,
      onManage: noop,
    }),
  );
  ok(html.includes('data-testid="cad-space-tab-model"'), "la pestaña Modelo existe");
  ok(html.includes('aria-selected="true"'), "Modelo está marcado como pestaña activa");
  ok(html.includes("+ Presentación"), "sin presentaciones, invita a crear una — no dice «Layout +»");
  ok(!/\bLayout\b/.test(html), "ningún «Layout» en inglés queda en el marcado");
  ok(html.includes('role="tablist"'), "el grupo se anuncia como tablist");
}

// ── Con presentaciones: la activa se marca por id, no por índice ──
{
  const spaces = [space("a", "Planta baja"), space("b", "Corte A-A")];
  const html = renderToStaticMarkup(
    createElement(CadSpaceTabs, {
      isModelActive: false,
      spaces,
      activeSpaceId: "b",
      onSelectModel: noop,
      onSelectSpace: noop,
      onManage: noop,
    }),
  );
  ok(html.includes('data-testid="cad-space-tab-a"'), "la presentación «a» tiene su pestaña");
  ok(html.includes('data-testid="cad-space-tab-b"'), "la presentación «b» tiene su pestaña");
  ok(html.includes("Planta baja"), "el nombre real de la presentación se pinta, no un índice");
  ok(html.includes("Corte A-A"), "el nombre real de la segunda presentación se pinta");
  ok(html.includes("Presentaciones · 2"), "el botón de administrar cuenta las presentaciones");

  const modeloMatch = html.match(/data-testid="cad-space-tab-model"[^>]*>/);
  ok(Boolean(modeloMatch), "se encuentra la etiqueta de Modelo");
  ok(
    modeloMatch![0].includes('aria-selected="false"'),
    "con una presentación activa, Modelo deja de estar marcado",
  );
  const bMatch = html.match(/data-testid="cad-space-tab-b"[^>]*>/);
  ok(bMatch![0].includes('aria-selected="true"'), "la presentación activa (b) se marca por id");
  const aMatch = html.match(/data-testid="cad-space-tab-a"[^>]*>/);
  ok(aMatch![0].includes('aria-selected="false"'), "la presentación inactiva (a) no se marca");
}

// ── Sigue alcanzable en modo de solo lectura: el guard global lee
//    `data-cad-readonly-allowed` con `.closest()`, así que basta con la raíz ──
{
  const html = renderToStaticMarkup(
    createElement(CadSpaceTabs, {
      isModelActive: true,
      spaces: [],
      activeSpaceId: null,
      onSelectModel: noop,
      onSelectSpace: noop,
      onManage: noop,
    }),
  );
  ok(
    html.includes('data-testid="cad-space-tabs" data-cad-readonly-allowed') ||
      /data-cad-readonly-allowed[^>]*data-testid="cad-space-tabs"|data-testid="cad-space-tabs"[^>]*data-cad-readonly-allowed/.test(html),
    "la raíz lleva data-cad-readonly-allowed: cambiar de pestaña no es editar el dibujo",
  );
}

// ── El relleno de la pestaña activa nunca es --primary crudo ──
{
  const fuente = readFileSync(new URL("./CadSpaceTabs.tsx", import.meta.url), "utf8");
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok(!/\bbg-primary\b/.test(sinComentarios), "el relleno de una pestaña activa nunca es bg-primary crudo");
  ok(sinComentarios.includes("bg-brand-strong"), "el relleno de la pestaña activa es bg-brand-strong");
}

console.log(`CadSpaceTabs: ${checks}/${checks} comprobaciones verdes`);
