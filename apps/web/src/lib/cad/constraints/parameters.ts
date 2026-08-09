/**
 * Parámetros con nombre y expresiones (`ancho = 1200`, `alto = ancho * 0.618`).
 *
 * Es la mitad del dibujo paramétrico que no es geometría. Sin esto, una cota
 * vale un número y cambiar la pieza es reeditar cota por cota; con esto el
 * dibujo tiene una tabla de mandos y `huecos = ceil(largo / 600)` se recalcula
 * solo.
 *
 * Tres cosas que este módulo hace y que conviene no dar por hechas:
 *
 * **Detecta ciclos y los NOMBRA.** `a = b + 1` junto a `b = a * 2` no se cuelga
 * ni devuelve `NaN`: se rechaza diciendo exactamente qué cadena de nombres se
 * muerde la cola. Un grafo de dependencias sin detección de ciclos es una forma
 * elegante de colgar el navegador del usuario.
 *
 * **Reevalúa en orden topológico.** Cambiar `ancho` recalcula `alto` y todo lo
 * que dependa de `alto`, una sola vez cada uno y en el orden correcto.
 *
 * **Los ángulos van en GRADOS.** `sin(30)` es 0,5. Es la convención del resto
 * del programa —los arcos guardan grados, la restricción de ángulo se teclea en
 * grados, la entrada polar es en grados— y mezclar unidades dentro del mismo
 * dibujo es una fuente de errores que nadie encuentra mirando el resultado.
 */
import type { CadParameter } from "./constraint-schema";

export interface CadParameterIssue {
  code: string;
  message: string;
  parameterNames: string[];
}

export interface CadParameterEvaluation {
  /** Valor de cada parámetro que se pudo evaluar. */
  values: Map<string, number>;
  /** La tabla con `value` puesto al día; el orden de entrada se conserva. */
  parameters: CadParameter[];
  /** Orden topológico de evaluación; útil para depurar y para mostrarlo. */
  order: string[];
  issues: CadParameterIssue[];
}

export interface CadParameterOptions {
  /** Unidad del documento. Los literales con sufijo se convierten a ella. */
  unit?: string;
}

/** Nombres válidos: como los de AutoCAD, sin espacios ni signos. */
export const CAD_PARAMETER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Factores a milímetros. La unidad del documento decide la conversión final. */
const UNIT_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  dm: 100,
  m: 1000,
  km: 1_000_000,
  in: 25.4,
  ft: 304.8,
  yd: 914.4,
};

const DEG = Math.PI / 180;

type Fn = (args: number[]) => number;

/**
 * Funciones disponibles. Las trigonométricas trabajan en GRADOS a la ida y a la
 * vuelta, igual que la línea de comandos del propio CAD.
 */
const FUNCTIONS: Record<string, { arity: number[]; apply: Fn }> = {
  sin: { arity: [1], apply: ([x]) => Math.sin(x * DEG) },
  cos: { arity: [1], apply: ([x]) => Math.cos(x * DEG) },
  tan: { arity: [1], apply: ([x]) => Math.tan(x * DEG) },
  asin: { arity: [1], apply: ([x]) => Math.asin(x) / DEG },
  acos: { arity: [1], apply: ([x]) => Math.acos(x) / DEG },
  atan: { arity: [1, 2], apply: (args) => (args.length === 2 ? Math.atan2(args[0], args[1]) : Math.atan(args[0])) / DEG },
  sqrt: { arity: [1], apply: ([x]) => Math.sqrt(x) },
  abs: { arity: [1], apply: ([x]) => Math.abs(x) },
  round: { arity: [1], apply: ([x]) => Math.round(x) },
  ceil: { arity: [1], apply: ([x]) => Math.ceil(x) },
  floor: { arity: [1], apply: ([x]) => Math.floor(x) },
  trunc: { arity: [1], apply: ([x]) => Math.trunc(x) },
  ln: { arity: [1], apply: ([x]) => Math.log(x) },
  log: { arity: [1], apply: ([x]) => Math.log10(x) },
  exp: { arity: [1], apply: ([x]) => Math.exp(x) },
  pow: { arity: [2], apply: ([x, y]) => x ** y },
  min: { arity: [2, 3, 4], apply: (args) => Math.min(...args) },
  max: { arity: [2, 3, 4], apply: (args) => Math.max(...args) },
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

// ---------------------------------------------------------------------------
// Analizador
// ---------------------------------------------------------------------------

type Token =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string };

class ExpressionError extends Error {}

function tokenize(source: string, unitFactor: number): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === " " || char === "\t") {
      index += 1;
      continue;
    }
    if (char >= "0" && char <= "9") {
      let end = index;
      while (end < source.length && /[0-9.]/.test(source[end])) end += 1;
      const digits = source.slice(index, end);
      const value = Number(digits);
      if (!Number.isFinite(value)) throw new ExpressionError(`«${digits}» no es un número.`);
      index = end;
      // Sufijo de unidad pegado al número: `1200mm`, `1.2m`, `3in`.
      let suffix = "";
      while (index < source.length && /[a-zA-Z]/.test(source[index])) {
        suffix += source[index];
        index += 1;
      }
      if (suffix) {
        const factor = UNIT_TO_MM[suffix.toLowerCase()];
        if (factor === undefined)
          throw new ExpressionError(`Unidad desconocida «${suffix}». Admitidas: ${Object.keys(UNIT_TO_MM).join(", ")}.`);
        tokens.push({ kind: "number", value: (value * factor) / unitFactor });
      } else {
        tokens.push({ kind: "number", value });
      }
      continue;
    }
    if (/[a-zA-Z_]/.test(char)) {
      let end = index;
      while (end < source.length && /[a-zA-Z0-9_]/.test(source[end])) end += 1;
      tokens.push({ kind: "name", value: source.slice(index, end) });
      index = end;
      continue;
    }
    if ("+-*/%^(),".includes(char)) {
      tokens.push({ kind: "op", value: char });
      index += 1;
      continue;
    }
    throw new ExpressionError(`Carácter inesperado «${char}».`);
  }
  return tokens;
}

interface ParseResult {
  evaluate(lookup: (name: string) => number): number;
  references: Set<string>;
}

/**
 * Descenso recursivo. Gramática (de menor a mayor prioridad):
 * `suma → producto → unario → potencia → primario`.
 */
function parse(tokens: readonly Token[]): ParseResult {
  let cursor = 0;
  const references = new Set<string>();
  const peek = () => tokens[cursor];
  const eat = (value: string) => {
    const token = tokens[cursor];
    if (token && token.kind === "op" && token.value === value) {
      cursor += 1;
      return true;
    }
    return false;
  };

  type Node = (lookup: (name: string) => number) => number;

  const primary = (): Node => {
    const token = peek();
    if (!token) throw new ExpressionError("La expresión termina antes de tiempo.");
    if (token.kind === "number") {
      cursor += 1;
      return () => token.value;
    }
    if (token.kind === "name") {
      cursor += 1;
      const name = token.value;
      if (eat("(")) {
        const fn = FUNCTIONS[name.toLowerCase()];
        if (!fn) throw new ExpressionError(`Función desconocida «${name}».`);
        const args: Node[] = [];
        if (!eat(")")) {
          do args.push(sum());
          while (eat(","));
          if (!eat(")")) throw new ExpressionError(`Falta el paréntesis de cierre de «${name}».`);
        }
        if (!fn.arity.includes(args.length))
          throw new ExpressionError(`«${name}» admite ${fn.arity.join(" o ")} argumentos, no ${args.length}.`);
        return (lookup) => fn.apply(args.map((arg) => arg(lookup)));
      }
      const constant = CONSTANTS[name.toLowerCase()];
      if (constant !== undefined) return () => constant;
      references.add(name);
      return (lookup) => lookup(name);
    }
    if (eat("(")) {
      const inner = sum();
      if (!eat(")")) throw new ExpressionError("Falta un paréntesis de cierre.");
      return inner;
    }
    throw new ExpressionError(`Token inesperado «${token.value}».`);
  };

  const power = (): Node => {
    const base = primary();
    if (eat("^")) {
      const exponent = unary();
      return (lookup) => base(lookup) ** exponent(lookup);
    }
    return base;
  };

  const unary = (): Node => {
    if (eat("-")) {
      const inner = unary();
      return (lookup) => -inner(lookup);
    }
    if (eat("+")) return unary();
    return power();
  };

  const product = (): Node => {
    let left = unary();
    for (;;) {
      if (eat("*")) {
        const right = unary();
        const previous = left;
        left = (lookup) => previous(lookup) * right(lookup);
      } else if (eat("/")) {
        const right = unary();
        const previous = left;
        left = (lookup) => {
          const divisor = right(lookup);
          if (divisor === 0) throw new ExpressionError("División por cero.");
          return previous(lookup) / divisor;
        };
      } else if (eat("%")) {
        const right = unary();
        const previous = left;
        left = (lookup) => previous(lookup) % right(lookup);
      } else {
        return left;
      }
    }
  };

  function sum(): Node {
    let left = product();
    for (;;) {
      if (eat("+")) {
        const right = product();
        const previous = left;
        left = (lookup) => previous(lookup) + right(lookup);
      } else if (eat("-")) {
        const right = product();
        const previous = left;
        left = (lookup) => previous(lookup) - right(lookup);
      } else {
        return left;
      }
    }
  }

  const root = sum();
  if (cursor !== tokens.length) throw new ExpressionError(`Sobra «${tokens[cursor].value}» al final de la expresión.`);
  return { evaluate: root, references };
}

/** Compila una expresión suelta. Lanza `ExpressionError` con el motivo exacto. */
function compile(expression: string, unitFactor: number): ParseResult {
  const tokens = tokenize(expression, unitFactor);
  if (tokens.length === 0) throw new ExpressionError("La expresión está vacía.");
  return parse(tokens);
}

// ---------------------------------------------------------------------------
// Tabla de parámetros
// ---------------------------------------------------------------------------

function unitFactorFor(unit: string | undefined): number {
  return UNIT_TO_MM[(unit ?? "mm").toLowerCase()] ?? 1;
}

/**
 * Evalúa la tabla completa en orden topológico.
 *
 * Nunca lanza: los problemas salen como `issues` con los nombres implicados,
 * porque una tabla con un error tiene que seguir mostrando los parámetros que sí
 * están bien en vez de dejar la ventana en blanco.
 */
export function evaluateCadParameters(
  parameters: readonly CadParameter[],
  options: CadParameterOptions = {},
): CadParameterEvaluation {
  const unitFactor = unitFactorFor(options.unit);
  const issues: CadParameterIssue[] = [];
  const compiled = new Map<string, ParseResult>();
  const byName = new Map<string, CadParameter>();

  for (const parameter of parameters) {
    if (!CAD_PARAMETER_NAME_PATTERN.test(parameter.name)) {
      issues.push({
        code: "parameter_invalid_name",
        message: `«${parameter.name}» no es un nombre válido: empieza por letra o «_» y usa sólo letras, dígitos y «_».`,
        parameterNames: [parameter.name],
      });
      continue;
    }
    if (byName.has(parameter.name)) {
      issues.push({
        code: "parameter_duplicated",
        message: `El parámetro «${parameter.name}» está definido dos veces.`,
        parameterNames: [parameter.name],
      });
      continue;
    }
    byName.set(parameter.name, parameter);
    try {
      compiled.set(parameter.name, compile(parameter.expression, unitFactor));
    } catch (cause) {
      issues.push({
        code: "parameter_invalid_expression",
        message: `«${parameter.name}»: ${cause instanceof Error ? cause.message : String(cause)}`,
        parameterNames: [parameter.name],
      });
    }
  }

  for (const [name, parsed] of compiled)
    for (const reference of parsed.references)
      if (!compiled.has(reference) && !byName.has(reference))
        issues.push({
          code: "parameter_unknown_reference",
          message: `«${name}» usa «${reference}», que no es un parámetro ni una función conocida.`,
          parameterNames: [name, reference],
        });

  const { order, cycles } = topologicalOrder(compiled);
  for (const cycle of cycles)
    issues.push({
      code: "parameter_cycle",
      message: `Ciclo de dependencias: ${[...cycle, cycle[0]].join(" → ")}.`,
      parameterNames: [...cycle],
    });

  const values = new Map<string, number>();
  const cyclic = new Set(cycles.flat());
  for (const name of order) {
    if (cyclic.has(name)) continue;
    const parsed = compiled.get(name);
    if (!parsed) continue;
    const missing = [...parsed.references].filter((reference) => !values.has(reference));
    if (missing.length > 0) continue;
    try {
      const value = parsed.evaluate((reference) => values.get(reference) ?? Number.NaN);
      if (!Number.isFinite(value)) throw new ExpressionError("el resultado no es un número finito.");
      values.set(name, value);
    } catch (cause) {
      issues.push({
        code: "parameter_invalid_expression",
        message: `«${name}»: ${cause instanceof Error ? cause.message : String(cause)}`,
        parameterNames: [name],
      });
    }
  }

  return {
    values,
    parameters: parameters.map((parameter) => {
      const value = values.get(parameter.name);
      return value === undefined ? { ...parameter } : { ...parameter, value };
    }),
    order,
    issues,
  };
}

/**
 * Orden topológico por DFS. Devuelve además los ciclos encontrados, cada uno
 * como la lista de nombres que se muerden la cola, empezando por el menor para
 * que el mensaje sea el mismo en cada ejecución.
 */
function topologicalOrder(compiled: ReadonlyMap<string, ParseResult>): {
  order: string[];
  cycles: string[][];
} {
  const order: string[] = [];
  const cycles: string[][] = [];
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const names = [...compiled.keys()].sort();

  const visit = (name: string) => {
    const current = state.get(name);
    if (current === "done") return;
    if (current === "visiting") {
      const start = stack.indexOf(name);
      const cycle = stack.slice(start);
      const pivot = cycle.indexOf([...cycle].sort()[0]);
      cycles.push([...cycle.slice(pivot), ...cycle.slice(0, pivot)]);
      return;
    }
    state.set(name, "visiting");
    stack.push(name);
    const parsed = compiled.get(name);
    if (parsed) for (const reference of [...parsed.references].sort()) if (compiled.has(reference)) visit(reference);
    stack.pop();
    state.set(name, "done");
    order.push(name);
  };

  for (const name of names) visit(name);
  return { order, cycles: dedupeCycles(cycles) };
}

function dedupeCycles(cycles: readonly string[][]): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const cycle of cycles) {
    const key = cycle.join("→");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cycle);
  }
  return result.sort((a, b) => (a.join() < b.join() ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Escritura (API limpia del módulo; la ventana de gestión la monta otra sesión)
// ---------------------------------------------------------------------------

export interface CadParameterWriteResult {
  parameters: CadParameter[];
  evaluation: CadParameterEvaluation;
  /** `false` si el cambio se rechazó; `parameters` vuelve entonces intacto. */
  ok: boolean;
  issues: CadParameterIssue[];
}

/**
 * Alta o modificación de un parámetro. El cambio se RECHAZA entero —y la tabla
 * vuelve como estaba— si introduce un ciclo, un nombre inválido o una expresión
 * que no compila. Aceptar a medias dejaría el documento con una tabla que no se
 * puede evaluar, y el siguiente que la abriera no sabría quién la rompió.
 */
export function setCadParameter(
  parameters: readonly CadParameter[],
  next: { name: string; expression: string; comment?: string },
  options: CadParameterOptions = {},
): CadParameterWriteResult {
  const existing = parameters.findIndex((parameter) => parameter.name === next.name);
  const draft: CadParameter = {
    name: next.name,
    expression: next.expression.trim(),
    value: existing >= 0 ? parameters[existing].value : 0,
    ...(next.comment === undefined
      ? existing >= 0 && parameters[existing].comment !== undefined
        ? { comment: parameters[existing].comment }
        : {}
      : { comment: next.comment }),
  };
  const candidate =
    existing >= 0
      ? parameters.map((parameter, index) => (index === existing ? draft : parameter))
      : [...parameters, draft];

  const evaluation = evaluateCadParameters(candidate, options);
  const blocking = evaluation.issues.filter((issue) => issue.parameterNames.includes(next.name));
  if (blocking.length > 0) {
    return {
      parameters: [...parameters],
      evaluation: evaluateCadParameters(parameters, options),
      ok: false,
      issues: blocking,
    };
  }
  return { parameters: evaluation.parameters, evaluation, ok: true, issues: evaluation.issues };
}

/**
 * Baja de un parámetro. Se rechaza si alguien lo usa: borrarlo dejaría esas
 * expresiones apuntando al vacío, y un dibujo con cotas rotas es peor que un
 * borrado que no se hizo.
 */
export function deleteCadParameter(
  parameters: readonly CadParameter[],
  name: string,
  options: CadParameterOptions = {},
): CadParameterWriteResult {
  if (!parameters.some((parameter) => parameter.name === name))
    return {
      parameters: [...parameters],
      evaluation: evaluateCadParameters(parameters, options),
      ok: false,
      issues: [{ code: "parameter_missing", message: `No existe el parámetro «${name}».`, parameterNames: [name] }],
    };
  const remaining = parameters.filter((parameter) => parameter.name !== name);
  const dependants = remaining.filter((parameter) => {
    try {
      return compile(parameter.expression, unitFactorFor(options.unit)).references.has(name);
    } catch {
      return false;
    }
  });
  if (dependants.length > 0)
    return {
      parameters: [...parameters],
      evaluation: evaluateCadParameters(parameters, options),
      ok: false,
      issues: [
        {
          code: "parameter_in_use",
          message: `«${name}» lo usan ${dependants.map((parameter) => parameter.name).join(", ")}.`,
          parameterNames: [name, ...dependants.map((parameter) => parameter.name)],
        },
      ],
    };
  const evaluation = evaluateCadParameters(remaining, options);
  return { parameters: evaluation.parameters, evaluation, ok: true, issues: evaluation.issues };
}
