/**
 * El arnés: pasa cada instrucción por el producto REAL y clasifica lo que sale.
 *
 * QUÉ CADENA SE MIDE. `parseCadCommand` (español → comando tipado) y después
 * `executeCadCommand` sobre la escena de `scene.ts`. Las dos, no sólo la
 * primera: el parser puede entender perfectamente una orden imposible y es la
 * ejecución la que debe pararla. Medir sólo el parser daría por buenas las
 * órdenes que revientan al aplicarse, y medir sólo la ejecución escondería los
 * errores de comprensión. La promesa del producto —«dime qué quieres y lo
 * dibujo»— vive en la cadena completa.
 *
 * NO SE PARCHEA NADA. El arnés no normaliza el texto, no corrige acentos, no
 * reintenta con sinónimos. Cualquiera de esas ayudas mediría al arnés y no al
 * producto.
 *
 * ESCENA LIMPIA POR CASO. `executeCadCommand` recibe el contexto por
 * referencia; un caso que mutara la escena contaminaría a los siguientes y el
 * banco daría números distintos según el orden del corpus. Cada caso arranca
 * con una copia recién construida.
 */
import { executeCadCommand } from "../commands/executor";
import { parseCadCommand } from "../commands/parser";
import type { CadCommandId, CadParseResult } from "../commands/types";
import { buildNlCadScene, NL_CAD_DEFAULT_SELECTION } from "./scene";
import type { NlCadArgMismatch, NlCadCase, NlCadCaseResult } from "./types";

/**
 * Claves cuyo valor es texto libre que después se resuelve contra el plano.
 *
 * En estas se acepta que el producto conserve el artículo o el adjetivo («la
 * recámara principal» donde se esperaba «recámara principal»): el resolvedor de
 * objetivos hace substring plegando acentos, así que ese sobrante apunta al
 * mismo objeto. La indulgencia se acaba aquí — en los NÚMEROS la comparación es
 * exacta, porque un 15 donde iba un 150 es el fallo que este banco existe para
 * cazar y no admite tolerancia.
 */
const FREE_TEXT_KEYS = new Set([
  "query",
  "target",
  "targetA",
  "targetB",
  "targetLabel",
  "anchor",
  "into",
  "label",
  "text",
  "name",
  "like",
  "exclude",
  "a",
  "b",
  "wallA",
  "wallB",
  "cutter",
  "boundary",
  "centerLabel",
  "awayFrom",
]);

const fold = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("es-MX")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function valueMatches(key: string, expected: unknown, actual: unknown): boolean {
  if (typeof expected === "number")
    return typeof actual === "number" && Object.is(expected, actual);
  if (typeof expected === "boolean") return expected === actual;
  if (typeof expected === "string") {
    if (typeof actual !== "string") return false;
    const want = fold(expected);
    const got = fold(actual);
    return got === want || (FREE_TEXT_KEYS.has(key) && got.includes(want));
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") return false;
    const want = expected as Record<string, unknown>;
    const got = actual as Record<string, unknown>;
    return Object.keys(want).every((inner) =>
      valueMatches(inner, want[inner], got[inner]),
    );
  }
  return expected === actual;
}

/** Sólo se juzgan las claves declaradas por el caso. */
function compareArgs(
  expected: Record<string, unknown> | undefined,
  actual: Record<string, unknown>,
): NlCadArgMismatch[] {
  if (!expected) return [];
  const mismatches: NlCadArgMismatch[] = [];
  for (const [key, want] of Object.entries(expected))
    if (!valueMatches(key, want, actual[key]))
      mismatches.push({ key, expected: want, actual: actual[key] });
  return mismatches;
}

/**
 * Código tipado del rechazo del parser, si lo trae.
 *
 * Se lee de forma tolerante A PROPÓSITO: el día que `CadParseResult` publique
 * un código, el banco lo cuenta sin que haya que tocar el arnés; mientras no lo
 * publique, el rechazo se contabiliza como «sin código» y esa es justamente la
 * cifra que hay que enseñar. Un arnés que inventara un código a partir de la
 * prosa estaría midiendo su propio regex.
 */
function parseRejectionCodes(parse: CadParseResult): string[] {
  const code = (parse as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? [code] : [];
}

const first = (values: string[]) => values[0] ?? "sin código";

export function runNlCadCase(kase: NlCadCase): NlCadCaseResult {
  const parse = parseCadCommand(kase.text);
  const expectedCommandId =
    kase.expect.kind === "command" ? kase.expect.commandId : null;
  const base = {
    id: kase.id,
    lane: kase.lane,
    text: kase.text,
    trait: kase.trait,
    expectedCommandId,
    confidence: parse.confidence,
  };

  if (!parse.ok || !parse.input) {
    const codes = parseRejectionCodes(parse);
    const motive = parse.clarification ?? parse.error ?? "sin explicación";
    if (kase.lane === "adversarial")
      return {
        ...base,
        outcome: codes.length ? "rechazo_tipado" : "rechazo_sin_codigo",
        grave: false,
        actualCommandId: null,
        rejectionCodes: codes,
        argMismatches: [],
        operationsApplied: 0,
        detail: `el parser rechazó (${first(codes)}): ${motive}`,
      };
    return {
      ...base,
      outcome: "rechazo_indebido",
      grave: false,
      actualCommandId: null,
      rejectionCodes: codes,
      argMismatches: [],
      operationsApplied: 0,
      detail: `no entendió una instrucción legítima: ${motive}`,
    };
  }

  const input = parse.input;
  const actualCommandId = input.id as CadCommandId;
  const result = executeCadCommand(input, buildNlCadScene(NL_CAD_DEFAULT_SELECTION));
  const errorCodes = result.issues
    .filter((issue) => issue.level === "error")
    .map((issue) => issue.code);
  const applied = result.applied === true;
  const operationsApplied = applied ? result.operations.length : 0;

  if (kase.lane === "adversarial") {
    if (!applied)
      return {
        ...base,
        outcome: errorCodes.length ? "rechazo_tipado" : "rechazo_sin_codigo",
        grave: false,
        actualCommandId,
        rejectionCodes: errorCodes,
        argMismatches: [],
        operationsApplied: 0,
        detail: `la ejecución lo paró (${first(errorCodes)})`,
      };
    // Dijo que sí a una orden irrealizable. Da igual cuántas operaciones
    // emitiera: el usuario se queda creyendo que quedó hecho.
    return {
      ...base,
      outcome: "geometria_indebida",
      grave: true,
      actualCommandId,
      rejectionCodes: [],
      argMismatches: [],
      operationsApplied,
      detail: `aplicó ${actualCommandId} con ${operationsApplied} operación(es): ${result.historyLabel}`,
    };
  }

  const expectedArgs =
    kase.expect.kind === "command" ? kase.expect.args : undefined;
  if (actualCommandId !== expectedCommandId)
    return {
      ...base,
      outcome: "comando_equivocado",
      grave: applied,
      actualCommandId,
      rejectionCodes: errorCodes,
      argMismatches: [],
      operationsApplied,
      detail: `se esperaba ${expectedCommandId} y salió ${actualCommandId}${
        applied ? " (aplicado)" : " (parado al ejecutar)"
      }`,
    };

  const argMismatches = compareArgs(
    expectedArgs,
    input as unknown as Record<string, unknown>,
  );
  if (argMismatches.length)
    return {
      ...base,
      outcome: "argumentos_equivocados",
      grave: applied,
      actualCommandId,
      rejectionCodes: errorCodes,
      argMismatches,
      operationsApplied,
      detail: argMismatches
        .map(
          (m) =>
            `${m.key}: esperado ${JSON.stringify(m.expected)}, obtenido ${JSON.stringify(m.actual)}`,
        )
        .join("; "),
    };

  if (!applied)
    return {
      ...base,
      outcome: "bloqueado_al_ejecutar",
      grave: false,
      actualCommandId,
      rejectionCodes: errorCodes,
      argMismatches: [],
      operationsApplied: 0,
      detail: `entendió ${actualCommandId} pero la ejecución lo paró (${first(errorCodes)})`,
    };

  return {
    ...base,
    outcome: "acierto",
    grave: false,
    actualCommandId,
    rejectionCodes: [],
    argMismatches: [],
    operationsApplied,
    detail: result.historyLabel,
  };
}

export function runNlCadCases(cases: NlCadCase[]): NlCadCaseResult[] {
  return cases.map(runNlCadCase);
}
