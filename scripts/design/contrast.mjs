/**
 * EL METRO DEL CONTRASTE.
 *
 * La campaña de firma propia (2026-08-28) arrancó con una instrucción que daba
 * por hecho un gate de contraste «que ya existe». No existía: `grep` sobre
 * `scripts/` y `components/ui` no encontraba ni un cálculo de luminancia
 * relativa ni el umbral 4.5:1 escrito en ninguna parte. La paleta anterior se
 * había razonado a mano —los comentarios de `globals.css` citan 4,46:1 y 5,38:1
 * medidos uno por uno— y esos números envejecían en silencio en cuanto alguien
 * tocaba un token.
 *
 * Este módulo es la regla. No opina de estética: convierte un token de
 * `globals.css` en sRGB y devuelve la razón de contraste WCAG 2.1. Lo consume
 * `check-contrast.mjs`, que declara QUÉ pares tienen que pasar y con cuánto.
 *
 * Sin dependencias: el parseo cubre exactamente lo que la hoja usa —canales HSL
 * (`220 24% 96.5%`), hex de tres/seis/ocho dígitos e indirección `var(--otro)`—
 * y falla ruidosamente ante cualquier otra cosa en vez de inventar un color.
 */

/** Convierte `h s% l%` (canales sueltos, como los escribe globals.css) a RGB 0-255. */
export function hslChannelsToRgb(h, s, l) {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lig - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** Luminancia relativa WCAG 2.1 (§ relative luminance). */
export function relativeLuminance([r, g, b]) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Razón de contraste WCAG entre dos colores sRGB. Devuelve entre 1 y 21. */
export function contrastRatio(rgbA, rgbB) {
  const a = relativeLuminance(rgbA);
  const b = relativeLuminance(rgbB);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Compone un color con alfa sobre un fondo opaco. Los tokens de la hoja son
 * opacos, pero las capas que sí llevan alfa (sombras, veladuras) necesitan esto
 * para medirse contra lo que hay debajo en vez de contra el vacío.
 */
export function composite(fg, bg, alpha) {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
}

function hexToRgb(hex) {
  let body = hex.slice(1);
  if (body.length === 3) body = body.split("").map((c) => c + c).join("");
  if (body.length === 8) body = body.slice(0, 6);
  if (body.length !== 6) throw new Error(`hex no reconocido: ${hex}`);
  return [
    Number.parseInt(body.slice(0, 2), 16),
    Number.parseInt(body.slice(2, 4), 16),
    Number.parseInt(body.slice(4, 6), 16),
  ];
}

const HSL_CHANNELS = /^(-?[0-9.]+)\s+(-?[0-9.]+)%\s+(-?[0-9.]+)%$/;
const VAR_REF = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i;

/**
 * Resuelve el valor de un token a RGB, siguiendo la indirección `var(--otro)`
 * dentro del mismo mapa. `hops` corta las referencias circulares en vez de
 * colgar el proceso.
 */
export function resolveToken(tokens, name, hops = 0) {
  if (hops > 8) throw new Error(`indirección circular en ${name}`);
  const raw = tokens[name];
  if (raw === undefined) throw new Error(`token inexistente: ${name}`);
  const value = raw.trim();
  const ref = VAR_REF.exec(value);
  if (ref) return resolveToken(tokens, ref[1], hops + 1);
  if (value.startsWith("#")) return hexToRgb(value);
  const hsl = HSL_CHANNELS.exec(value);
  if (hsl) {
    return hslChannelsToRgb(
      Number.parseFloat(hsl[1]),
      Number.parseFloat(hsl[2]),
      Number.parseFloat(hsl[3]),
    );
  }
  throw new Error(`valor de color no medible para ${name}: «${value}»`);
}

/**
 * Extrae las declaraciones `--token: valor;` de un bloque de la hoja.
 *
 * El parseo es deliberadamente tonto —cuenta llaves para hallar el final del
 * bloque— porque la alternativa es meter un parser de CSS en el árbol de
 * dependencias de un gate. Si la hoja se vuelve tan compleja que esto falla, el
 * gate falla RUIDOSO y alguien lo mira; nunca devuelve un mapa a medias en
 * silencio.
 */
export function extractBlock(css, selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`no se encontró el bloque «${selector}»`);
  const open = css.indexOf("{", start);
  if (open === -1) throw new Error(`bloque «${selector}» sin apertura`);
  let depth = 0;
  let end = -1;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`bloque «${selector}» sin cierre`);
  const body = css.slice(open + 1, end);
  const withoutComments = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = {};
  for (const match of withoutComments.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

/** Formatea una razón como la escribiría un informe: dos decimales, coma decimal. */
export function formatRatio(ratio) {
  return ratio.toFixed(2).replace(".", ",");
}
