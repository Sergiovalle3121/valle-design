/**
 * Ola «no se vea feo» (sistema-visual): `T3Btn.variant`.
 *
 * Antes de esta ola, TODO botón `active` de la barra superior —la
 * herramienta de dibujo en uso (Seleccionar/Medir/Muros) igual que un ajuste
 * de fondo que está encendido por defecto (grilla, snap, referencia a
 * objetos)— pintaba el mismo relleno sólido de acento. Con los tres ajustes
 * encendidos de fábrica, eso dejaba un trío morado idéntico al de un modo de
 * dibujo real, sin rótulo que lo explicara: la queja del dueño («un grupo de
 * tres botones resaltados en morado cuyo significado no se entiende»).
 *
 * `variant="soft"` (tinta sobre superficie clara, `bg-accent/15` +
 * `text-primary-ink` — la pareja relleno/tinta del sistema de diseño, nunca
 * `--accent` a secas como color de letra) queda para un AJUSTE que está
 * encendido; `variant="solid"` (el relleno de acento completo, el
 * comportamiento de SIEMPRE — así que ningún llamador existente cambia sin
 * pedirlo) queda para el MODO de interacción real.
 *
 * Correr: node ../../node_modules/tsx/dist/cli.mjs src/components/cad/studio/field-controls.spec.ts
 * (desde apps/web).
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { T3Btn } from "./field-controls";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function render(props: Parameters<typeof T3Btn>[0]) {
  return renderToStaticMarkup(createElement(T3Btn, props));
}

// Sin `variant`, activo sigue siendo el relleno sólido de SIEMPRE — ningún
// llamador existente (34 en `Layout3DEditor.tsx`) cambia de aspecto porque
// esta ola exista.
{
  const html = render({ active: true, onClick: () => undefined, title: "x", children: "x" });
  ok(html.includes("bg-accent text-accent-foreground"), "sin variant, activo usa el relleno sólido de acento (comportamiento heredado)");
  ok(!html.includes("bg-accent/15"), "sin variant, no aparece la tinta suave");
}

// `variant="solid"` explícito es el mismo relleno — el modo de interacción
// real (Seleccionar/Medir/Muros) se sigue viendo IGUAL de fuerte.
{
  const html = render({ active: true, variant: "solid", onClick: () => undefined, title: "x", children: "x" });
  ok(html.includes("bg-accent text-accent-foreground"), "variant=\"solid\" explícito conserva el relleno completo");
}

// `variant="soft"` — el ajuste encendido (grilla/snap/referencia) se lee
// como ENCENDIDO sin competir en peso visual con el modo de dibujo real.
{
  const html = render({ active: true, variant: "soft", onClick: () => undefined, title: "x", children: "x" });
  ok(html.includes("bg-accent/15"), "variant=\"soft\" activo usa la tinta suave, no el relleno completo");
  ok(html.includes("text-primary-ink"), "variant=\"soft\" usa el token de tinta del sistema (nunca --accent como color de letra)");
  ok(!html.includes("bg-accent text-accent-foreground"), "variant=\"soft\" activo nunca cae en el relleno sólido");
}

// Inactivo se ve igual sea cual sea `variant` — la distinción sólo existe
// cuando el botón está encendido.
{
  const solidOff = render({ active: false, variant: "solid", onClick: () => undefined, title: "x", children: "x" });
  const softOff = render({ active: false, variant: "soft", onClick: () => undefined, title: "x", children: "x" });
  ok(solidOff === softOff, "inactivo, el variant no cambia el marcado — sólo importa cuando active=true");
  ok(!solidOff.includes("bg-accent"), "inactivo no lleva ningún relleno de acento");
}

console.log(`field-controls (T3Btn.variant): ${checks}/${checks} comprobaciones verdes`);
