/**
 * CABLES SUELTOS — un control visible cuyo valor no lee nadie.
 *
 * ─── El defecto que este gate cierra ───────────────────────────────────────
 *
 * La OLA 2.3 barrió los 83 controles visibles del estudio contra el stack real
 * y encontró uno roto: el selector «Papel del plano» de la barra superior.
 * Estaba perfectamente escrito —controlado, con sus siete opciones, con su
 * `title`— y su estado (`plotPaper`) NO LO LEÍA NADIE. El usuario elegía A0 y
 * la publicación seguía usando el papel de cada hoja, porque `publishSheetSetPdf`
 * jamás consultaba esa variable. El control calculaba y el anfitrión no lo
 * dejaba aplicar: exactamente la clase de defecto que la campaña nombró, y que
 * ya había aparecido dos veces antes.
 *
 * Peor todavía: el copiloto en lenguaje natural anunciaba «imprime en A3»
 * escribiendo en ese mismo estado muerto. Una orden que decía haber hecho algo
 * que no hacía.
 *
 * ─── Por qué un gate estático y no sólo el barrido ─────────────────────────
 *
 * El barrido en navegador (`e2e/real/cables-sueltos.spec.ts`) es la evidencia
 * fuerte: pulsa cada control de verdad y mide si pasa algo. Pero tarda siete
 * minutos, necesita PostgreSQL y sólo ve lo que está en pantalla en ese
 * momento. Este gate corre en un segundo, en cada `npm test`, y ataca la FORMA
 * del defecto: un `useState` que se escribe y cuyo valor no consume nadie más
 * que el propio control que lo escribe.
 *
 * No pretende encontrar todos los cables sueltos —un estado leído por una
 * función que a su vez no hace nada pasaría—, sino impedir que vuelva a
 * entrar ESTE, que es el que se coló.
 *
 * ─── La regla ──────────────────────────────────────────────────────────────
 *
 * Para cada `const [x, setX] = useState(...)`:
 *   · si `setX` se llama en algún sitio Y `x` no se lee en NINGUNO → estado de
 *     sólo escritura: lo que el usuario elige se tira;
 *   · si `x` se lee UNA sola vez y esa lectura es el `value={x}` / `checked={x}`
 *     del mismo control que lo escribe → control huérfano: el valor no sale de
 *     su propia caja.
 *
 * Un estado que legítimamente cumple la forma se declara en `EXENTOS` con su
 * razón, para que la lista sea visible en el diff en vez de crecer en silencio.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { globSync } from "glob";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/**
 * Estados que cumplen la forma y cuya razón está escrita, para que la lista se
 * vea en el diff en vez de crecer en silencio. Mismo mecanismo que
 * `command-integrity-exemptions.json`.
 */
const EXENTOS: Record<string, string> = {
  "src/components/cad/editor/Layout3DEditor.tsx:aiBusy":
    "El bloque entero del copiloto IA heredado (`requestAiProposal`, " +
    "`applyAiProposal`, `applyAiIntent`) es INALCANZABLE: ninguna llamada lo " +
    "invoca, ningún botón lo expone. `aiBusy` está huérfano porque la función " +
    "que lo escribe no se puede disparar, no porque haya un control que mienta: " +
    "no hay superficie visible que prometa nada. Backlog: cablearlo con su " +
    "indicador de «pensando…» o retirar el bloque. Ver " +
    "`docs/execution/CAMPANA_LANZAMIENTO_20260827.md`, OLA 2.3.",
};

/** La superficie del estudio: donde vive el estado de los controles. */
const FILES = [
  ...globSync("src/components/cad/editor/*.tsx"),
  ...globSync("src/components/cad/palettes/*.tsx"),
  ...globSync("src/components/cad/studio/*.tsx"),
].sort();

ok(FILES.length > 15, `hay ${FILES.length} archivos de superficie que auditar`);

/** Quita comentarios: una mención en prosa no es una lectura. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/^\s*\/\/.*$/gmu, " ");
}

const offenders: string[] = [];
let audited = 0;

for (const file of FILES) {
  const source = stripComments(readFileSync(file, "utf8"));
  const declarations = [
    ...source.matchAll(
      /const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*(set[A-Za-z_$][\w$]*)\s*\]\s*=\s*useState/gu,
    ),
  ];

  for (const declaration of declarations) {
    const [whole, value, setter] = declaration;
    audited += 1;
    const key = `${file}:${value}`;
    if (key in EXENTOS) continue;

    // Se cuentan las apariciones FUERA de la propia declaración.
    const rest = source.slice(0, declaration.index) + source.slice(declaration.index + whole.length);
    const reads = [...rest.matchAll(new RegExp(`\\b${value}\\b`, "gu"))];
    const writes = [...rest.matchAll(new RegExp(`\\b${setter}\\b`, "gu"))];

    if (writes.length === 0) continue; // Estado que nunca cambia: otro problema, no éste.

    if (reads.length === 0) {
      offenders.push(
        `${key}: se escribe (${writes.length} llamada(s) a ${setter}) y NO SE LEE en ninguna parte — ` +
          "lo que el usuario elige se tira",
      );
      continue;
    }

    if (reads.length === 1) {
      const around = rest.slice(
        Math.max(0, reads[0].index - 40),
        reads[0].index + value.length + 40,
      );
      if (new RegExp(`(value|checked)=\\{${value}\\}`, "u").test(around)) {
        offenders.push(
          `${key}: su ÚNICA lectura es el \`value/checked\` del propio control que lo escribe — ` +
            "el valor no sale de su caja y nadie lo aplica",
        );
      }
    }
  }
}

ok(audited > 100, `se auditaron ${audited} estados de la superficie del estudio`);

if (offenders.length > 0) {
  console.error(
    `Controles visibles con estado huérfano (${offenders.length}):\n  - ${offenders.join("\n  - ")}`,
  );
}
assert.equal(
  offenders.length,
  0,
  `${offenders.length} control(es) visible(s) escriben en un estado que nadie consume. ` +
    "O se cablea a la ruta que lo aplica, o se quita de la superficie (FIX-OR-HIDE). " +
    "Si de verdad es legítimo, se declara en EXENTOS con su razón.",
);

console.log(
  `cables sueltos (estado huérfano): ${checks} comprobaciones · ${audited} estados auditados, 0 huérfanos`,
);
