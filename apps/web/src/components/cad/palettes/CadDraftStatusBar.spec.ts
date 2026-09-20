/**
 * Ola «estado»: los cuatro conmutadores de ayudas al dibujo pasan de texto a
 * icono con estado, sin perder ni el `data-testid` que localizan los goldens
 * 52/120/51 ni el nombre accesible que exige un icono sin letra.
 *
 * Correr: node ../../node_modules/tsx/dist/cli.mjs
 *   src/components/cad/palettes/CadDraftStatusBar.spec.ts
 * (desde apps/web, como el resto de specs sueltos de esta máquina).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CadDraftStatusBar } from "./CadDraftStatusBar";
import { CadDraftSettingsHost } from "./draft-settings-host";
import { CAD_POLAR_INCREMENTS } from "./draft-settings-host";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const noop = () => undefined;

function render(overrides: Partial<ReturnType<CadDraftSettingsHost["getSnapshot"]>>) {
  const base = new CadDraftSettingsHost().getSnapshot();
  const settings = { ...base, ...overrides };
  return renderToStaticMarkup(
    createElement(CadDraftStatusBar, {
      settings,
      polarIncrements: CAD_POLAR_INCREMENTS,
      onToggleOsnap: noop,
      onToggleOrtho: noop,
      onTogglePolar: noop,
      onPolarIncrement: noop,
      onToggleObjectSnapTracking: noop,
      onClearTracking: noop,
      onOpenSettings: noop,
      onOpenStyles: noop,
    }),
  );
}

// ── Todos apagados: cada conmutador conserva su testid y su nombre accesible ──
{
  const html = render({
    osnap: false,
    ortho: false,
    polar: false,
    objectSnapTracking: false,
    acquiredTrackingPoints: 0,
  });

  for (const id of ["osnap", "ortho", "polar", "otrack", "settings", "styles"]) {
    ok(
      html.includes(`data-testid="cad-draft-status-${id}"`),
      `el conmutador «${id}» conserva su data-testid (lo pulsan los goldens 52/51/120)`,
    );
  }
  ok(
    html.includes('data-testid="cad-draft-status-polar-increment"'),
    "el incremento polar conserva su data-testid",
  );

  // Ningún control se queda sólo con un icono sin nombre accesible.
  ok(html.includes('aria-label="Referencia a objetos desactivada · F3"'), "OSNAP: nombre + tecla en aria-label");
  ok(html.includes('aria-label="Modo ortogonal desactivado · F8"'), "ORTHO: nombre + tecla en aria-label");
  ok(html.includes('aria-label="Rastreo polar desactivado · F10"'), "POLAR: nombre + tecla en aria-label");
  ok(
    html.includes('aria-label="Seguimiento de referencia a objetos desactivado · F11"'),
    "OTRACK: nombre + tecla en aria-label",
  );
  ok(html.includes('aria-label="Ajustes de dibujo (DSETTINGS)"'), "DSETTINGS conserva su nombre accesible");
  ok(
    html.includes('aria-label="Gestor de estilos: texto, cota, directriz, tabla y ploteo"'),
    "ESTILOS conserva su nombre accesible",
  );

  // El icono apagado no lleva la clase de relleno de marca.
  ok(!/data-testid="cad-draft-status-osnap"[^>]*bg-brand-strong/.test(html), "OSNAP apagado no lleva relleno");

  // Sin puntos adquiridos, «Limpiar tracking» no se pinta.
  ok(!html.includes("Limpiar tracking"), "sin puntos de rastreo, no hay botón para limpiarlos");
}

// ── Todos encendidos: el relleno de marca se aplica y la tecla sigue en el nombre ──
{
  const html = render({
    osnap: true,
    ortho: true,
    polar: true,
    polarIncrement: 15,
    objectSnapTracking: true,
    acquiredTrackingPoints: 3,
  });

  ok(html.includes('aria-label="Referencia a objetos activada · F3"'), "OSNAP encendido: aria-label dice «activada»");
  ok(html.includes('aria-label="Modo ortogonal activado · F8"'), "ORTHO encendido: aria-label dice «activado»");
  ok(
    html.includes('aria-label="Rastreo polar a 15° activado · F10"'),
    "POLAR encendido: aria-label incluye el incremento en curso",
  );
  ok(
    html.includes("activado · 3 punto(s) adquirido(s) · F11"),
    "OTRACK encendido: aria-label dice cuántos puntos hay adquiridos",
  );

  ok(
    /data-testid="cad-draft-status-osnap"[^>]*data-active="true"[^>]*bg-brand-strong/.test(html) ||
      /bg-brand-strong[^>]*data-testid="cad-draft-status-osnap"/.test(html),
    "OSNAP encendido usa el relleno de marca (bg-brand-strong), no --primary crudo",
  );

  ok(html.includes("Limpiar tracking"), "con puntos de rastreo adquiridos, aparece el botón para limpiarlos");
}

// ── Nunca --primary crudo como relleno de un control: el gate de contraste
//    verifica el par bg-brand-strong/text-primary-foreground, no bg-primary. ──
{
  const fuente = readFileSync(path.join(__dirname, "CadDraftStatusBar.tsx"), "utf8");
  // El código de verdad, sin comentarios: los comentarios pueden citar el
  // patrón que se retira o las siglas de AutoCAD para explicar el porqué
  // (`check:surface` no los mira, y esta prueba tampoco debe confundirlos
  // con lo que de verdad se pinta).
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  ok(!/\bbg-primary\b/.test(sinComentarios), "el relleno de un conmutador nunca es bg-primary crudo");
  ok(sinComentarios.includes("bg-brand-strong"), "el relleno de un conmutador encendido es bg-brand-strong");

  // La ola «estado» retira el escondite `@max-[40rem]:hidden`: con iconos, el
  // nombre completo vive en el tooltip/aria-label, no en un segundo renglón
  // oculto bajo 40 rem.
  ok(
    !sinComentarios.includes("@max-" + "[40rem]:hidden"),
    "ningún conmutador se esconde con @max-[40rem]:hidden sin quedar alcanzable",
  );

  // Regresión de las siglas visibles como TEXTO: ya no hay letras «OSNAP»,
  // «ORTHO» ni «POLAR» sueltas pintadas en el botón.
  for (const sigla of ["OSNAP ", ">ORTHO", ">OTRACK"]) {
    ok(!sinComentarios.includes(sigla), `«${sigla.trim()}» ya no es texto visible en el JSX`);
  }
}

console.log(`CadDraftStatusBar: ${checks}/${checks} comprobaciones verdes`);
