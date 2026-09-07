/**
 * T-13: el plano entero desaparecía a un clic del conmutador de tema porque
 * la tinta por defecto del dibujo (blanco de ACI 7, o el color de reserva
 * del renderizador) era un color FIJO frente a un fondo de lienzo variable.
 * Medido entonces: #ffffff sobre el preset «Claro» (#eaf0f8) da 1,15:1.
 *
 * Esta prueba cruza `legibleDefaultInk` contra los CUATRO presets reales de
 * `THEMES` (no valores inventados) para que el arreglo no dependa de que
 * alguien recuerde actualizarla si un preset cambia de fondo.
 */
import { strict as assert } from "node:assert";
import {
  CAD_RENDER_DEFAULT_COLOR,
  DEFAULT_BACKGROUND_COLOR,
  defaultCadRenderStyle,
  legibleDefaultInk,
  packedContrastRatio,
} from "./render-style";
import { THEMES } from "@/components/cad/studio/editor-presentation";
import type { CadNativeEntity } from "../entity-runtime";

const MIN_GRAPHIC_CONTRAST = 3;
const ACI7_WHITE = 0xffffff;

function entityWithColor(hex: string | undefined): CadNativeEntity {
  return {
    id: "e1",
    type: "line",
    layer: "0",
    context: hex
      ? { presentation: { color: { value: hex, source: "explicit" } } }
      : undefined,
  } as unknown as CadNativeEntity;
}

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// El defecto medido: blanco puro sobre el preset «Claro» era casi invisible.
{
  const claro = THEMES.light.bg;
  const before = packedContrastRatio(ACI7_WHITE, claro);
  ok(before < 1.3, `sin el arreglo, blanco sobre «Claro» apenas se distingue (medido ${before.toFixed(2)}:1)`);
  const after = legibleDefaultInk(ACI7_WHITE, claro);
  ok(after !== ACI7_WHITE, "sobre un lienzo casi blanco, la tinta por defecto se invierte");
  ok(
    packedContrastRatio(after, claro) >= MIN_GRAPHIC_CONTRAST,
    "y el color resultante SÍ cumple el piso gráfico de 3:1",
  );
}

// Los cuatro presets reales de THEMES, no valores repetidos a mano.
for (const [name, theme] of Object.entries(THEMES)) {
  const whiteInk = legibleDefaultInk(ACI7_WHITE, theme.bg);
  ok(
    packedContrastRatio(whiteInk, theme.bg) + 1e-9 >= MIN_GRAPHIC_CONTRAST,
    `preset «${theme.label}» (${name}): la tinta por defecto blanca (ACI 7) es legible (${packedContrastRatio(whiteInk, theme.bg).toFixed(2)}:1)`,
  );

  const rendererDefaultInk = legibleDefaultInk(CAD_RENDER_DEFAULT_COLOR, theme.bg);
  ok(
    packedContrastRatio(rendererDefaultInk, theme.bg) + 1e-9 >= MIN_GRAPHIC_CONTRAST,
    `preset «${theme.label}» (${name}): el color de reserva del renderizador es legible (${packedContrastRatio(rendererDefaultInk, theme.bg).toFixed(2)}:1)`,
  );
}

// Nunca toca un color que el plano SÍ declara: sólo el blanco de ACI 7 y el
// color de reserva del renderizador se corrigen.
{
  const planColor = 0x2563eb; // un azul que el usuario eligió a propósito
  ok(
    legibleDefaultInk(planColor, THEMES.light.bg) === planColor,
    "un color explícito del plano nunca se toca, aunque su contraste sea bajo",
  );
}

// defaultCadRenderStyle: sin fondo explícito, el comportamiento no cambia
// (fondo por defecto = preset Oscuro, donde blanco y el color de reserva ya
// eran legibles) — cero regresión para los llamadores existentes.
{
  const white = defaultCadRenderStyle(entityWithColor("#ffffff"));
  ok(white.color === ACI7_WHITE, "sin fondo explícito, el blanco no se toca (el oscuro ya lo hace legible)");
  const fallback = defaultCadRenderStyle(entityWithColor(undefined));
  ok(fallback.color === CAD_RENDER_DEFAULT_COLOR, "sin fondo explícito, el color de reserva tampoco cambia");
}

// defaultCadRenderStyle: con el fondo real del preset «Claro», el blanco por
// defecto SÍ se corrige — éste es el camino que arregla el defecto en vivo.
{
  const style = defaultCadRenderStyle(entityWithColor("#ffffff"), undefined, THEMES.light.bg);
  ok(style.color !== ACI7_WHITE, "con el fondo del preset «Claro», el blanco por defecto se invierte");
  ok(
    packedContrastRatio(style.color, THEMES.light.bg) >= MIN_GRAPHIC_CONTRAST,
    "y el resultado es legible sobre ese fondo",
  );
}

// F9 P-01: el fondo por defecto que este módulo asume cuando nadie le pasa uno
// es el preset «Oscuro» — y ahora lo EXPORTA para que el anfitrión del viewport
// arranque con el mismo valor. Si el preset se mueve, esto avisa.
ok(DEFAULT_BACKGROUND_COLOR === THEMES.dark.bg, "el fondo por defecto exportado es el del preset «Oscuro» de THEMES");

console.log(`render-style (T-13): ${checks} comprobaciones verdes`);
