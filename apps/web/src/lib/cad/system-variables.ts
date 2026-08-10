/**
 * Variables de sistema (SETVAR / GETVAR) y todo lo que cuelga de ellas.
 *
 * ## Por qué esto es la columna vertebral de media sesión
 *
 * UNITS, LTSCALE, LWEIGHT, COLOR, LINETYPE y OSNAP parecen seis comandos
 * distintos. En AutoCAD son SEIS CARAS DE LA MISMA TABLA: `UNITS` escribe
 * `LUNITS`/`LUPREC`/`AUNITS`/`AUPREC`, `LTSCALE` escribe `LTSCALE`, `COLOR`
 * escribe `CECOLOR`, `OSNAP` escribe `OSMODE`. Modelarlos como seis estados
 * sueltos habría dado seis fuentes de verdad que se contradicen —y un `SETVAR
 * LTSCALE 2` que no mueve el diálogo de LTSCALE es exactamente el tipo de
 * incoherencia que hace que un CAD se sienta de juguete.
 *
 * Con la tabla, `SETVAR` y `GETVAR` salen gratis: no son un comando más, son la
 * puerta genérica a lo que los demás escriben. Y un `.scr` puede configurar el
 * dibujo entero sin abrir un solo diálogo, que es lo que un `.scr` existe para
 * hacer.
 *
 * ## Qué NO hace
 *
 * No persiste. El almacén vive en la sesión, igual que los estados de capa del
 * gestor de la ola 1, porque `CadDocument` no tiene sección donde ponerlo y
 * `cad-document.ts` pertenece a otra sesión en esta ola. Está dicho aquí y lo
 * dice el comando, en vez de dejar que se descubra al recargar.
 *
 * Tampoco valida contra el documento: que `CLAYER` valga `MUROS` no crea la
 * capa. Quien la necesite comprueba; la tabla sólo garantiza tipo y rango.
 */
import {
  angleSystemFromAunits,
  type AngleFormatOptions,
} from "./unit-angle";
import type { UnitFormatOptions, UnitSystem } from "./unit-format";

export type CadSystemVariableValue = number | string;

export type CadSystemVariableKind = "int" | "real" | "string";

export interface CadSystemVariableDef {
  name: string;
  kind: CadSystemVariableKind;
  default: CadSystemVariableValue;
  /** Sólo `int`/`real`. Ambos inclusive. */
  min?: number;
  max?: number;
  /**
   * Valores admitidos para un `int` enumerado (`LUNITS` es 1..5, no 1..5
   * continuo con huecos). Cuando existe, gana sobre `min`/`max`.
   */
  enumerated?: readonly number[];
  /** `true` si el usuario puede leerla pero no escribirla. */
  readOnly?: boolean;
  /** Una línea, la que imprime `SETVAR ?`. */
  description: string;
}

function int(
  name: string,
  def: number,
  description: string,
  extra: Partial<CadSystemVariableDef> = {},
): CadSystemVariableDef {
  return { name, kind: "int", default: def, description, ...extra };
}

function real(
  name: string,
  def: number,
  description: string,
  extra: Partial<CadSystemVariableDef> = {},
): CadSystemVariableDef {
  return { name, kind: "real", default: def, description, ...extra };
}

function text(
  name: string,
  def: string,
  description: string,
  extra: Partial<CadSystemVariableDef> = {},
): CadSystemVariableDef {
  return { name, kind: "string", default: def, description, ...extra };
}

/**
 * La tabla. Nombres y semántica son los de AutoCAD porque un `.scr` traído de
 * fuera no se puede traducir: o `SETVAR LUNITS 4` significa arquitectónico,
 * o el script no sirve.
 */
export const CAD_SYSTEM_VARIABLES: readonly CadSystemVariableDef[] = [
  // --- unidades -------------------------------------------------------------
  int("LUNITS", 2, "Formato de longitud: 1 científico, 2 decimal, 3 ingeniería, 4 arquitectónico, 5 fraccionario", {
    enumerated: [1, 2, 3, 4, 5],
  }),
  int("LUPREC", 4, "Decimales (o denominador fraccionario) de las longitudes", { min: 0, max: 8 }),
  int("AUNITS", 0, "Formato de ángulo: 0 decimal, 1 grados/minutos/segundos, 2 gradianes, 3 radianes, 4 topográfico", {
    enumerated: [0, 1, 2, 3, 4],
  }),
  int("AUPREC", 0, "Decimales de los ángulos", { min: 0, max: 8 }),
  real("ANGBASE", 0, "Dirección del ángulo cero, en grados desde el este"),
  int("ANGDIR", 0, "Sentido positivo del ángulo: 0 antihorario, 1 horario", { enumerated: [0, 1] }),
  int("INSUNITS", 4, "Unidad del dibujo: 0 sin unidad, 1 pulgadas, 2 pies, 4 milímetros, 5 centímetros, 6 metros", {
    min: 0,
    max: 20,
  }),
  text("MEASUREMENT", "1", "0 imperial, 1 métrico: qué biblioteca de patrones y tipos de línea se carga"),

  // --- propiedades por defecto de los objetos nuevos -------------------------
  text("CLAYER", "0", "Capa activa: la que reciben los objetos nuevos"),
  text("CECOLOR", "BYLAYER", "Color de los objetos nuevos: BYLAYER, BYBLOCK, un índice ACI o #rrggbb"),
  text("CELTYPE", "ByLayer", "Tipo de línea de los objetos nuevos"),
  int("CELWEIGHT", -1, "Grosor de los objetos nuevos en centésimas de mm; -1 PorCapa, -2 PorBloque, -3 Por defecto", {
    min: -3,
    max: 211,
  }),
  real("CELTSCALE", 1, "Escala de tipo de línea de los objetos nuevos", { min: 1e-6 }),
  real("LTSCALE", 1, "Escala global de tipo de línea", { min: 1e-6 }),
  int("LWDISPLAY", 0, "Mostrar los grosores de línea en pantalla: 0 no, 1 sí", { enumerated: [0, 1] }),
  int("LWUNITS", 1, "Unidad de los grosores: 0 pulgadas, 1 milímetros", { enumerated: [0, 1] }),

  // --- ayudas al dibujo -----------------------------------------------------
  int("OSMODE", 0, "Modos de referencia a objetos activos, como suma de bits", { min: 0, max: 65535 }),
  int("ORTHOMODE", 0, "Modo orto: 0 apagado, 1 encendido", { enumerated: [0, 1] }),
  int("SNAPMODE", 0, "Forzado de cursor: 0 apagado, 1 encendido", { enumerated: [0, 1] }),
  int("GRIDMODE", 0, "Rejilla: 0 apagada, 1 encendida", { enumerated: [0, 1] }),
  int("POLARMODE", 0, "Opciones del rastreo polar, como suma de bits", { min: 0, max: 15 }),
  int("PDMODE", 0, "Aspecto de los puntos", { min: 0, max: 98 }),
  real("PDSIZE", 0, "Tamaño de los puntos; negativo, en porcentaje de la pantalla"),

  // --- sistema de coordenadas personal --------------------------------------
  // En AutoCAD son de sólo lectura y las escribe el comando UCS. Aquí las
  // escribe UCSMAN por la misma puerta que el resto, y se dice: es la única
  // divergencia deliberada de la tabla respecto del original.
  text("UCSNAME", "", "Nombre del SCU activo; vacío si es el sistema del mundo"),
  real("UCSORGX", 0, "Origen del SCU activo, coordenada X del mundo"),
  real("UCSORGY", 0, "Origen del SCU activo, coordenada Y del mundo"),
  real("UCSANGLE", 0, "Giro del eje X del SCU respecto del eje X del mundo, en grados"),

  // --- valores recordados por los comandos ----------------------------------
  real("FILLETRAD", 0, "Radio de empalme actual", { min: 0 }),
  real("CHAMFERA", 0, "Primera distancia de chaflán", { min: 0 }),
  real("CHAMFERB", 0, "Segunda distancia de chaflán", { min: 0 }),
  real("TEXTSIZE", 2.5, "Altura de texto por defecto", { min: 1e-6 }),
  real("DIMSCALE", 1, "Escala general de las cotas", { min: 1e-6 }),

  // --- resultados de las consultas ------------------------------------------
  real("AREA", 0, "Última área calculada por AREA o LIST", { readOnly: true }),
  real("PERIMETER", 0, "Último perímetro calculado por AREA o LIST", { readOnly: true }),
  real("DISTANCE", 0, "Última distancia calculada por DIST", { readOnly: true }),

  // --- comportamiento -------------------------------------------------------
  int("CMDECHO", 1, "Eco de los comandos de un script: 0 silencioso, 1 con eco", { enumerated: [0, 1] }),
  int("FILEDIA", 1, "Cuadros de archivo: 0 pide la ruta por la línea, 1 abre el explorador", {
    enumerated: [0, 1],
  }),
  int("ATTDIA", 0, "Atributos al insertar: 0 por la línea, 1 en cuadro de diálogo", { enumerated: [0, 1] }),
  int("ATTREQ", 1, "Pedir atributos al insertar: 0 usar defectos, 1 preguntar", { enumerated: [0, 1] }),
  int("OVERKILLTOL", 0, "Tolerancia de OVERKILL en milésimas de unidad", { min: 0, max: 1000000 }),

  // --- casillas del usuario, tal cual las tiene AutoCAD ---------------------
  int("USERI1", 0, "Entero libre nº 1"),
  int("USERI2", 0, "Entero libre nº 2"),
  int("USERI3", 0, "Entero libre nº 3"),
  real("USERR1", 0, "Real libre nº 1"),
  real("USERR2", 0, "Real libre nº 2"),
  text("USERS1", "", "Cadena libre nº 1"),
  text("USERS2", "", "Cadena libre nº 2"),
];

const BY_NAME = new Map(CAD_SYSTEM_VARIABLES.map((def) => [def.name, def]));

export function cadSystemVariableDef(name: string): CadSystemVariableDef | undefined {
  return BY_NAME.get(name.trim().toUpperCase());
}

export type CadVariableSetOutcome =
  | { ok: true; value: CadSystemVariableValue }
  | { ok: false; reason: string };

/**
 * Convierte y valida lo tecleado. Devuelve la RAZÓN cuando no vale, porque un
 * «valor incorrecto» a secas obliga a adivinar si el problema es el tipo, el
 * rango o el nombre.
 */
export function coerceCadSystemVariable(
  def: CadSystemVariableDef,
  raw: CadSystemVariableValue,
): CadVariableSetOutcome {
  if (def.kind === "string") return { ok: true, value: String(raw) };
  const parsed = typeof raw === "number" ? raw : Number.parseFloat(raw.trim());
  if (!Number.isFinite(parsed))
    return { ok: false, reason: `${def.name} espera un número y recibió "${raw}".` };
  const value = def.kind === "int" ? Math.trunc(parsed) : parsed;
  if (def.kind === "int" && !Number.isInteger(parsed) && Math.abs(parsed - value) > 1e-9)
    return { ok: false, reason: `${def.name} es entera; ${parsed} no lo es.` };
  if (def.enumerated && !def.enumerated.includes(value))
    return {
      ok: false,
      reason: `${def.name} sólo admite ${def.enumerated.join(", ")}; llegó ${value}.`,
    };
  if (def.min !== undefined && value < def.min)
    return { ok: false, reason: `${def.name} no baja de ${def.min}; llegó ${value}.` };
  if (def.max !== undefined && value > def.max)
    return { ok: false, reason: `${def.name} no pasa de ${def.max}; llegó ${value}.` };
  return { ok: true, value };
}

/**
 * Almacén observable, mismo patrón que las paletas: fuera de React, con
 * suscripción, y una instantánea estable por identidad para que
 * `useSyncExternalStore` no entre en bucle.
 */
export class CadSystemVariableStore {
  private values: Record<string, CadSystemVariableValue>;
  private readonly listeners = new Set<() => void>();

  constructor(initial: Readonly<Record<string, CadSystemVariableValue>> = {}) {
    this.values = Object.fromEntries(
      CAD_SYSTEM_VARIABLES.map((def) => [def.name, def.default]),
    );
    for (const [name, value] of Object.entries(initial)) {
      const def = cadSystemVariableDef(name);
      if (!def) continue;
      const coerced = coerceCadSystemVariable(def, value);
      if (coerced.ok) this.values[def.name] = coerced.value;
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Readonly<Record<string, CadSystemVariableValue>> => this.values;

  get(name: string): CadSystemVariableValue | undefined {
    const def = cadSystemVariableDef(name);
    return def ? this.values[def.name] : undefined;
  }

  number(name: string): number {
    const value = this.get(name);
    return typeof value === "number" ? value : 0;
  }

  string(name: string): string {
    const value = this.get(name);
    return typeof value === "string" ? value : String(value ?? "");
  }

  /**
   * Escritura del usuario. Se niega en las de sólo lectura: `AREA` la publica
   * el comando de consulta, y dejar que se escriba a mano convertiría el
   * resultado de la última medición en un dato inventado.
   */
  set(name: string, raw: CadSystemVariableValue): CadVariableSetOutcome {
    const def = cadSystemVariableDef(name);
    if (!def) return { ok: false, reason: `No existe la variable de sistema "${name}".` };
    if (def.readOnly) return { ok: false, reason: `${def.name} es de sólo lectura.` };
    return this.write(def, raw);
  }

  /**
   * Escritura del SISTEMA: la usan los comandos de consulta para publicar
   * `AREA`, `PERIMETER` y `DISTANCE`. Es una puerta aparte, no un parámetro
   * `force`, para que en el código se vea de un vistazo quién escribe qué.
   */
  publish(name: string, raw: CadSystemVariableValue): CadVariableSetOutcome {
    const def = cadSystemVariableDef(name);
    if (!def) return { ok: false, reason: `No existe la variable de sistema "${name}".` };
    return this.write(def, raw);
  }

  private write(def: CadSystemVariableDef, raw: CadSystemVariableValue): CadVariableSetOutcome {
    const coerced = coerceCadSystemVariable(def, raw);
    if (!coerced.ok) return coerced;
    if (this.values[def.name] === coerced.value) return coerced;
    this.values = { ...this.values, [def.name]: coerced.value };
    for (const listener of this.listeners) listener();
    return coerced;
  }
}

/** Lo que el motor de comandos ve del almacén: leer y escribir, nada más. */
export interface CadVariableAccess {
  get(name: string): CadSystemVariableValue | undefined;
  set(name: string, value: CadSystemVariableValue): CadVariableSetOutcome;
  publish(name: string, value: CadSystemVariableValue): CadVariableSetOutcome;
}

/** `LUNITS` → sistema de `unit-format.ts`. Fuera de rango cae en decimal. */
export const UNIT_SYSTEM_BY_LUNITS: Readonly<Record<number, UnitSystem>> = {
  1: "scientific",
  2: "decimal",
  3: "engineering",
  4: "architectural",
  5: "fractional",
};

/**
 * En arquitectónico y fraccionario, `LUPREC` no cuenta decimales: elige el
 * DENOMINADOR, y lo hace como potencia de dos. `LUPREC 4` es 1/16, que es la
 * precisión con la que se dibuja en pulgadas.
 */
export function denominatorFromLuprec(luprec: number): number {
  return 2 ** Math.max(0, Math.min(8, Math.trunc(luprec)));
}

/** Cómo escribir una longitud, leído de la tabla. */
export function cadLengthFormat(variables: CadVariableAccess): UnitFormatOptions {
  const lunits = Number(variables.get("LUNITS") ?? 2);
  const luprec = Number(variables.get("LUPREC") ?? 4);
  const system = UNIT_SYSTEM_BY_LUNITS[lunits] ?? "decimal";
  return {
    system,
    precision: Math.max(0, Math.min(8, Math.trunc(luprec))),
    denominator: denominatorFromLuprec(luprec),
  };
}

/** Cómo escribir un ángulo, leído de la tabla. */
export function cadAngleFormat(variables: CadVariableAccess): AngleFormatOptions {
  return {
    system: angleSystemFromAunits(Number(variables.get("AUNITS") ?? 0)),
    precision: Math.max(0, Math.min(8, Math.trunc(Number(variables.get("AUPREC") ?? 0)))),
    base: Number(variables.get("ANGBASE") ?? 0),
    direction: Number(variables.get("ANGDIR") ?? 0) === 1 ? 1 : 0,
  };
}

/**
 * El SCU activo, leído de la tabla.
 *
 * Vive en variables de sistema y no en un campo propio del contexto porque así
 * `SETVAR UCSORGX 100` y `UCSMAN` cambian LO MISMO. Con dos sitios donde
 * guardarlo, un `.scr` que fija el origen por variable y una paleta que lo fija
 * por su cuenta acabarían discrepando, y las coordenadas que imprime ID
 * dependerían de por dónde se entró.
 */
export function cadActiveUcs(variables: CadVariableAccess): {
  name: string;
  origin: { x: number; y: number };
  rotationDeg: number;
} {
  return {
    name: String(variables.get("UCSNAME") ?? ""),
    origin: {
      x: Number(variables.get("UCSORGX") ?? 0),
      y: Number(variables.get("UCSORGY") ?? 0),
    },
    rotationDeg: Number(variables.get("UCSANGLE") ?? 0),
  };
}

/**
 * Almacén de usar y tirar para las specs y para quien todavía no tenga uno.
 * Existe para que un comando NUNCA tenga que preguntarse si `variables` está
 * presente: sin él, cada consulta llevaría un `?? valorPorDefecto` distinto y
 * el formato acabaría dependiendo de qué anfitrión invocó el comando.
 */
export function createCadVariableAccess(
  initial: Readonly<Record<string, CadSystemVariableValue>> = {},
): CadVariableAccess {
  return new CadSystemVariableStore(initial);
}
