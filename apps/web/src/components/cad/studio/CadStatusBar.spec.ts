/**
 * Ola «estado»: la barra de estado es UNA fila de 26 px, y lo que antes se
 * ocultaba con `@max-[40rem]:hidden` sin quedar alcanzable ahora vive en el
 * desplegable «Más» (`cad-status-overflow`) — salvo que la persona lo haya
 * FIJADO en la fila (carril «abajo», ver el comentario de cabecera del
 * componente).
 *
 * Se prueba SIN NAVEGADOR, como `cad-status-bar-locale.spec.ts`: construir un
 * `CadStatusBarProps` completo de verdad exige refs de WebGL, un
 * `CadRenderHostSlot` y un `CadNativeMassHosts` reales — exactamente el tipo
 * de dependencia que esta máquina de 8 GB no puede levantar (nada de
 * navegador, nada de WebGL). Lo que este archivo puede afirmar con certeza
 * absoluta, y sin ninguna de esas dependencias, es la forma del CÓDIGO
 * FUENTE: la raíz declara `flex-nowrap` y nunca `flex-wrap`, ningún
 * `@max-[40rem]:hidden` sobrevive sin su entrada correspondiente en el
 * desplegable, y los nueve avisos existen con su id de fijado y su botón de
 * pin/unpin. El comportamiento en el navegador (que la barra mida 26 px de
 * verdad a 1366 y 1440 px, que no tape el lienzo, que fijar un aviso lo
 * mueva de verdad) lo confirma el golden 68 en CI, no este archivo — pero
 * `CadSpaceTabs.spec.ts` y `cad-status-overflow-prefs.spec.ts` SÍ renderizan
 * y ejercitan sus piezas con `react-dom/server`.
 *
 * Correr: node ../../node_modules/tsx/dist/cli.mjs
 *   src/components/cad/studio/CadStatusBar.spec.ts
 * (desde apps/web).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { CAD_STATUS_OVERFLOW_ITEM_IDS } from "./cad-status-overflow-prefs";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const src = readFileSync(new URL("./CadStatusBar.tsx", import.meta.url), "utf8");
// El código de verdad: sin comentarios, para no confundir una cita
// documental (este mismo archivo explica por qué se retiró el patrón citando
// su nombre) con lo que de verdad se pinta.
const sinComentarios = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// ── La raíz: una fila, nunca dos ──────────────────────────────────────────
{
  const raizMatch = sinComentarios.match(/<div className="(cad-status-bar[^"]*)"/);
  ok(Boolean(raizMatch), "la raíz de la barra de estado se encuentra en el fuente");
  const raiz = raizMatch?.[1] ?? "";
  ok(raiz.includes("flex-nowrap"), "la raíz declara flex-nowrap");
  ok(!raiz.includes("flex-wrap"), "la raíz NO declara flex-wrap (ninguna clase la reenvuelve a un segundo renglón)");
  // 26 px = 1.625rem = CAD_SHELL_METRICS.statusRow, en clase de Tailwind
  // (el contrato en sí vive en globals.css, que sólo edita el armazón).
  ok(raiz.includes("h-[1.625rem]"), "la raíz declara su alto de 26 px como clase de Tailwind — el carril «abajo» no lo hizo crecer");
}

// ── Punto 1: las pestañas Modelo / Presentación llegan primero a la fila ──
{
  ok(sinComentarios.includes("<CadSpaceTabs {...spaceTabs} />"), "CadSpaceTabs se monta con los datos que entrega Layout3DEditor.tsx");
  const raizIdx = sinComentarios.indexOf('<div className="cad-status-bar');
  const tabsIdx = sinComentarios.indexOf("<CadSpaceTabs");
  const coordIdx = sinComentarios.indexOf('data-testid="cad-cursor-coordinate"');
  ok(raizIdx >= 0 && tabsIdx > raizIdx, "CadSpaceTabs vive dentro de la raíz de la barra");
  ok(tabsIdx < coordIdx, "las pestañas se pintan ANTES que las coordenadas — primero a la izquierda");
  ok(
    sinComentarios.includes("spaceTabs: CadSpaceTabsProps"),
    "CadStatusBarProps declara spaceTabs con el tipo de CadSpaceTabs",
  );
}

// ── Punto 2: separadores entre los grupos de la fila ────────────────────
{
  const dividerDecl = sinComentarios.match(/function CadStatusDivider\(\)[\s\S]{0,200}/);
  ok(Boolean(dividerDecl), "existe el separador CadStatusDivider");
  ok(dividerDecl![0].includes('aria-hidden="true"'), "el separador es aria-hidden: puramente visual");
  const usos = sinComentarios.match(/<CadStatusDivider \/>/g) ?? [];
  ok(usos.length >= 4, `la fila usa el separador al menos 4 veces entre grupos (usa ${usos.length})`);
}

// ── Ningún @max-[40rem]:hidden sin desplegable ────────────────────────────
{
  const escondites = sinComentarios.match(/@max-\[40rem\]:hidden/g) ?? [];
  ok(
    escondites.length === 0,
    `no debe quedar ningún @max-[40rem]:hidden en CadStatusBar.tsx (quedan ${escondites.length})`,
  );
  ok(src.includes('data-testid="cad-status-overflow"'), "existe el desplegable de desbordamiento");
  ok(src.includes('data-testid="cad-status-overflow-trigger"'), "existe el botón que lo abre");
  const inicioBoton = sinComentarios.indexOf('data-testid="cad-status-overflow-trigger"');
  const finBoton = sinComentarios.indexOf("</button>", inicioBoton) + "</button>".length;
  const botonMas = sinComentarios.slice(inicioBoton, finBoton);
  ok(/>\s*Más\s*</.test(botonMas), "el botón que abre el desplegable dice «Más»");
}

// ── Punto 3: los nueve avisos existen, cada uno con su id de fijado ───────
{
  ok(CAD_STATUS_OVERFLOW_ITEM_IDS.length === 9, "siguen siendo nueve avisos de segundo orden");
  const entriesMatch = sinComentarios.match(
    /const overflowEntries:[\s\S]*?\n {2}\];/,
  );
  ok(Boolean(entriesMatch), "el arreglo overflowEntries se encuentra en el fuente");
  const entries = entriesMatch?.[0] ?? "";
  for (const id of CAD_STATUS_OVERFLOW_ITEM_IDS) {
    ok(entries.includes(`id: "${id}"`), `overflowEntries declara el aviso «${id}»`);
  }
  for (const texto of [
    "API en línea",
    "API sin conexión",
    "Rejilla ",
    "Forzcursor",
    "Modelo, revisión funcional y versión CAS",
    "Validación",
    "CAD crítico",
    "Holguras ",
    "Seguridad ",
    "DXF ",
    "Instantáneas ",
  ]) {
    ok(entries.includes(texto), `overflowEntries contiene «${texto.trim()}»`);
  }
}

// ── Los avisos se pueden fijar y dejar de fijar, y «Más» lo dice cuando
//    ya no queda nada dentro ───────────────────────────────────────────────
{
  ok(
    sinComentarios.includes('data-testid={`cad-status-pin-${entry.id}`}'),
    "cada aviso del desplegable lleva su botón de FIJAR",
  );
  ok(
    sinComentarios.includes('data-testid={`cad-status-unpin-${entry.id}`}'),
    "cada aviso fijado en la fila lleva su botón para DEJAR de fijarlo",
  );
  ok(
    sinComentarios.includes("unpinnedEntries.length === 0"),
    "el desplegable distingue cuando ya no queda ningún aviso sin fijar",
  );
  ok(
    sinComentarios.includes("Todo fijado en la barra"),
    "«Más» lo dice cuando la persona ya fijó todo — deja de ser un cajón fijo de nueve cosas",
  );
  ok(
    sinComentarios.includes("loadCadStatusOverflowPins") &&
      sinComentarios.includes("saveCadStatusOverflowPins"),
    "la elección de qué fijar se guarda y se relee entre sesiones",
  );
}

// ── Lo que un golden localiza directamente NO se movió al desplegable ─────
// (golden 22: `getByText('Resaltados 2')`; los reales de recuperación:
// `getByText('Recuperación local activa/en riesgo')`; ninguno abre «Más»
// antes de leer).
{
  const inicioPanel = sinComentarios.indexOf('id="cad-status-overflow"');
  const finPanel = sinComentarios.indexOf('data-testid="cad-status-tray"', inicioPanel);
  const fueraDelPanel = sinComentarios.slice(0, inicioPanel) + sinComentarios.slice(finPanel);
  for (const texto of [
    "Recuperación local activa",
    "Recuperación local en riesgo",
    "Resaltados {validation.validationHighlightCount}",
    'data-testid="cad-cursor-coordinate"',
  ]) {
    ok(fueraDelPanel.includes(texto), `«${texto}» sigue fuera del desplegable, siempre alcanzable`);
  }
}

console.log(`CadStatusBar: ${checks}/${checks} comprobaciones verdes`);
