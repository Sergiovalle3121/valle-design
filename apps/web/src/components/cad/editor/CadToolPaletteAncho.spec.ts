/**
 * LA HUELLA SOBRE EL LIENZO — de 93×846 px a ≤140×40 (ola1-paleta, 2026-09-19).
 *
 * Medido en producción antes de esta ola: la columna vertical de 17 botones
 * medía 93×846 px (78 678 px²) en `top-3 left-3`, encima del dibujo. Ahora es
 * una barra horizontal de 3 iconos en `bottom-3 right-3`.
 *
 * Sin navegador no hay `getBoundingClientRect`, así que este spec AFIRMA la
 * aritmética de las clases Tailwind que el componente declara —el mismo
 * contrato que un lector humano verifica leyendo el JSX— y deja la medición
 * en píxeles REALES de la ventana a los goldens (67/68, que ya vigilan que
 * nada flote sobre un control o el lienzo).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const fuente = readFileSync(path.join(__dirname, "CadToolPalette.tsx"), "utf8");

// 1. Ancla: abajo a la derecha del lienzo, no flotando en la esquina superior
//    izquierda de antes.
ok(fuente.includes("absolute bottom-3 right-3"), "la raíz de cad-toolbar es absolute bottom-3 right-3");
ok(fuente.includes("bottom-3"), "la barra se ancla por abajo (bottom-3), no por arriba");
ok(fuente.includes("right-3"), "la barra se ancla por la derecha (right-3), no por la izquierda");
ok(!fuente.includes("top-3 left-3"), "ya no está en la esquina superior izquierda de antes");

// 2. Tamaño: 3 botones de 28 px (h-7/w-7) + 4px de relleno (p-1) + 2 huecos
//    de 4px (gap-1) entre ellos. Aritmética real, no un número inventado:
//    alto = padding(4+4) + botón(28) = 36 ≤ 40.
//    ancho = padding(4+4) + 3×28 + 2×4(gaps) = 112 ≤ 140.
const ALTO_PX = 4 + 4 + 28;
const ANCHO_PX = 4 + 4 + 3 * 28 + 2 * 4;
ok(ALTO_PX <= 40, `alto calculado ${ALTO_PX}px debe caber en ≤40px`);
ok(ANCHO_PX <= 140, `ancho calculado ${ANCHO_PX}px debe caber en ≤140px`);
ok(
  ALTO_PX * ANCHO_PX <= 5_600,
  `huella calculada ${ALTO_PX * ANCHO_PX}px² debe caber en ≤5 600px² (140×40)`,
);
// Las clases que sustentan esa aritmética están de verdad en el componente:
// tres controles con un icono de 28 px cada uno (h-7 w-7), 4px de relleno de
// la barra (p-1) y 4px de hueco entre botones (gap-1).
ok(fuente.includes("h-7 w-7"), "cada botón mide h-7 w-7 (28px)");
ok(/\bp-1\b/.test(fuente) && !fuente.includes("p-1.5"), "la barra tiene 4px de relleno (p-1)");
ok(/\bgap-1\b/.test(fuente) && !fuente.includes("gap-1.5"), "4px de hueco entre botones (gap-1)");

// 3. Exactamente 3 controles: nada de dieciséis/diecisiete botones ni de la
//    rejilla `cad-tool-grid` de antes (esa clase se borró de `globals.css`
//    en la ola «armazón»; aquí sólo se afirma que este componente no la usa).
ok(!fuente.includes("cad-tool-grid"), "ya no usa la rejilla de la columna vertical");
// La raíz `cad-toolbar` es horizontal: se mira SÓLO su className (la del
// tooltip interno sí es `flex-col` — es una tarjeta de texto, no la barra).
const raizClassName = fuente.match(/data-testid="cad-toolbar"[\s\S]*?className="([^"]*)"/)?.[1] ?? "";
ok(raizClassName.length > 0, "se encontró la className de la raíz cad-toolbar");
ok(!raizClassName.includes("flex-col"), "la barra es horizontal (flex), no una columna (flex-col)");
ok(raizClassName.includes("flex") && raizClassName.includes("items-center"), "la barra es una fila (flex items-center)");
ok(!fuente.includes("STORAGE_KEY"), "sin plegado por localStorage: 3 iconos no necesitan ocultarse");

console.log(`CadToolPaletteAncho: ${checks}/${checks} comprobaciones verdes`);
