/**
 * Ola «estado»: la barra de estado es UNA fila de 26 px, y lo que antes se
 * ocultaba con `@max-[40rem]:hidden` sin quedar alcanzable ahora vive en el
 * desplegable «Más» (`cad-status-overflow`).
 *
 * Se prueba SIN NAVEGADOR, como `cad-status-bar-locale.spec.ts`: construir un
 * `CadStatusBarProps` completo de verdad exige refs de WebGL, un
 * `CadRenderHostSlot` y un `CadNativeMassHosts` reales — exactamente el tipo
 * de dependencia que esta máquina de 8 GB no puede levantar (nada de
 * navegador, nada de WebGL). Lo que este archivo puede afirmar con certeza
 * absoluta, y sin ninguna de esas dependencias, es la forma del CÓDIGO
 * FUENTE: la raíz declara `flex-nowrap` y nunca `flex-wrap`, y ningún
 * `@max-[40rem]:hidden` sobrevive sin su entrada correspondiente en el
 * desplegable. El comportamiento en el navegador (que la barra mida 26 px de
 * verdad a 1366 y 1440 px, que no tape el lienzo) lo confirma el golden 68 en
 * CI, no este archivo.
 *
 * Correr: node ../../node_modules/tsx/dist/cli.mjs
 *   src/components/cad/studio/CadStatusBar.spec.ts
 * (desde apps/web).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

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
  ok(raiz.includes("h-[1.625rem]"), "la raíz declara su alto de 26 px como clase de Tailwind");
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

// ── Los nueve avisos que antes se escondían viven ahora en el desplegable ──
// (entre el `<div id="cad-status-overflow"` y su cierre). Se busca sobre el
// fuente SIN comentarios: `data-testid="cad-status-overflow"` contiene
// `id="cad-status-overflow"` como subcadena (…test`id="…`), y un comentario
// que cite el testid (como el de esta misma ola, más arriba) daría un falso
// positivo si se buscara en el fuente completo.
{
  const inicio = sinComentarios.indexOf('id="cad-status-overflow"');
  ok(inicio >= 0, "el panel del desplegable existe");
  const panel = sinComentarios.slice(inicio, sinComentarios.indexOf('data-testid="cad-status-tray"', inicio));
  for (const texto of [
    "API en línea",
    "API sin conexión",
    "Rejilla ",
    "Forzcursor",
    "Modelo, revisión funcional y versión CAS",
    "Validación ",
    "CAD crítico",
    "Holguras ",
    "Seguridad ",
    "DXF ",
    "Instantáneas ",
  ]) {
    ok(panel.includes(texto), `el desplegable contiene «${texto.trim()}»`);
  }
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
