/**
 * CAMPOS DEL DIBUJO: un texto que se rellena solo.
 *
 * ## Qué faltaba, medido
 *
 * Sondeada la familia contra el registro: `FIELD`, `UPDATEFIELD`, `DATALINK` y
 * `DATALINKUPDATE` **no existían** (1 de 5, y el único era `PARAMETERS`, que es
 * otra cosa). Lo que sí existía era `sheet-set/sheet-set-fields.ts`: campos
 * `%<SheetNumber>%` que se resuelven **al publicar** un conjunto de planos. Es
 * la mitad del problema —el cajetín— y no la otra: el área de un local escrita
 * a mano en el plano, que deja de ser cierta en cuanto alguien mueve un muro.
 *
 * ## La misma sintaxis, a propósito
 *
 * `%<Area:id>%`, la de AutoCAD y la que este producto ya usa en los cajetines.
 * Dos sintaxis para lo mismo serían dos cosas que aprender y una que olvidar.
 *
 * ## Dónde vive el campo, sin un campo nuevo en el formato
 *
 * La EXPRESIÓN vive en `context.metadata.campo` del propio texto, y el VALOR
 * resuelto en su `text`. Así el plano enseña «24.50 m²» —que es lo que se
 * imprime— y el dibujo sigue sabiendo de dónde salió, sin añadir nada al
 * formato persistido. Guardar sólo la expresión dejaría un plano ilegible hasta
 * ejecutar una orden; guardar sólo el valor sería un texto muerto.
 *
 * ## Lo que NO se resuelve, se deja quieto
 *
 * Un campo cuyo objeto ya no está no se vacía ni se rellena con cero: conserva
 * su último valor y `UPDATEFIELD` lo CUENTA. Un cero silencioso en una tabla de
 * superficies es un error que se imprime; un aviso, no.
 */
import type { CadDocument, CadEntity } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import { cadEntityArea } from "../inquiry/contours";

/** Clave de metadatos con la expresión del campo. */
export const CAD_FIELD_METADATA = "campo";

/** `%<Nombre:argumento>%`, con el nombre sin distinguir mayúsculas. */
const FIELD = /^%<\s*([A-Za-zÁÉÍÓÚÑáéíóúñ]+)\s*(?::\s*([^>]*?)\s*)?>%$/u;

export type CadFieldKind = "area" | "longitud" | "fecha" | "variable";

export interface CadFieldExpression {
  kind: CadFieldKind;
  /** Id de entidad, nombre de variable… Vacío en los que no llevan. */
  argument: string;
}

const KINDS: Record<string, CadFieldKind> = {
  area: "area",
  área: "area",
  longitud: "longitud",
  fecha: "fecha",
  variable: "variable",
};

/** Lee una expresión de campo, o `null` si no tiene esa forma. */
export function cadParseFieldExpression(raw: string): CadFieldExpression | null {
  const partido = FIELD.exec(raw.trim());
  if (!partido) return null;
  const kind = KINDS[partido[1].toLowerCase()];
  return kind ? { kind, argument: partido[2] ?? "" } : null;
}

/** La expresión como se escribe. */
export const cadFormatFieldExpression = (expression: CadFieldExpression): string =>
  expression.argument
    ? `%<${cadFieldLabel(expression.kind)}:${expression.argument}>%`
    : `%<${cadFieldLabel(expression.kind)}>%`;

/** Cómo se llama cada clase de campo al escribirla. En español, como el plano. */
export function cadFieldLabel(kind: CadFieldKind): string {
  return kind === "area" ? "Area" : kind === "longitud" ? "Longitud" : kind === "fecha" ? "Fecha" : "Variable";
}

export interface CadFieldContext {
  document: Pick<CadDocument, "entities" | "meta">;
  /** Se inyecta: `new Date()` haría los planos irreproducibles. */
  date: string;
  /** Lectura de variables de sistema, si el anfitrión la expone. */
  variable?: (name: string) => string | number | boolean | undefined;
}

const unitsPerMetre = (unit: string | undefined): number =>
  unit === "mm" ? 1_000 : unit === "cm" ? 100 : 1;

/** Longitud recorrida de una entidad abierta, en unidades de dibujo. */
export function cadFieldRunLength(entity: CadEntity): number | null {
  const puntos =
    entity.type === "polyline"
      ? entity.vertices
      : entity.type === "line"
        ? [entity.start, entity.end]
        : null;
  if (!puntos || puntos.length < 2) return null;
  let total = 0;
  for (let index = 1; index < puntos.length; index += 1)
    total += Math.hypot(
      puntos[index].x - puntos[index - 1].x,
      puntos[index].y - puntos[index - 1].y,
      (puntos[index].z ?? 0) - (puntos[index - 1].z ?? 0),
    );
  return total;
}

/**
 * El valor de un campo, o `null` si hoy no se puede saber.
 *
 * `null` no es un error del campo: es un objeto que ya no está, una variable
 * que el anfitrión no expone, una entidad que no encierra nada medible. Quien
 * llama decide qué hacer, y lo que este módulo decide es NO inventar un cero.
 */
export function cadResolveField(
  expression: CadFieldExpression,
  context: CadFieldContext,
): string | null {
  if (expression.kind === "fecha") return context.date;
  if (expression.kind === "variable") {
    const value = context.variable?.(expression.argument);
    return value === undefined ? null : String(value);
  }
  const entity = context.document.entities.find((item) => item.id === expression.argument);
  if (!entity) return null;
  const porMetro = unitsPerMetre(context.document.meta?.unit);
  if (expression.kind === "area") {
    const medida = cadEntityArea(entity);
    if (!medida) return null;
    return `${(medida.area / (porMetro * porMetro)).toFixed(2)} m²`;
  }
  const largo = cadFieldRunLength(entity);
  return largo === null ? null : `${(largo / porMetro).toFixed(2)} m`;
}

export interface CadFieldEntity {
  entityId: string;
  expression: CadFieldExpression;
  /** Lo que el texto enseña ahora mismo. */
  current: string;
}

/** Los textos del dibujo que llevan un campo. */
export function cadFieldEntities(
  document: Pick<CadDocument, "entities">,
): CadFieldEntity[] {
  const campos: CadFieldEntity[] = [];
  for (const entity of document.entities) {
    if (entity.type !== "mtext") continue;
    const raw = entity.context?.metadata?.[CAD_FIELD_METADATA];
    if (typeof raw !== "string") continue;
    const expression = cadParseFieldExpression(raw);
    if (!expression) continue;
    campos.push({ entityId: entity.id, expression, current: entity.text });
  }
  return campos;
}

export interface CadFieldUpdate {
  commands: CadEntityCommand[];
  /** Campos cuyo valor cambió. */
  updated: { entityId: string; from: string; to: string }[];
  /** Campos que hoy no se pueden resolver. Conservan su último valor. */
  unresolved: { entityId: string; expression: string }[];
  /** Campos ya al día. */
  unchanged: number;
}

/**
 * Vuelve a resolver los campos del dibujo.
 *
 * Sólo emite orden para los que CAMBIAN: reescribir un texto con el mismo valor
 * ensucia la historia de deshacer con pasos que no hicieron nada, y el usuario
 * pierde la confianza en Ctrl+Z.
 */
export function cadUpdateFields(
  context: CadFieldContext,
  only?: readonly string[],
): CadFieldUpdate {
  const filtro = only ? new Set(only) : null;
  const update: CadFieldUpdate = { commands: [], updated: [], unresolved: [], unchanged: 0 };
  for (const campo of cadFieldEntities(context.document)) {
    if (filtro && !filtro.has(campo.entityId)) continue;
    const value = cadResolveField(campo.expression, context);
    if (value === null) {
      update.unresolved.push({
        entityId: campo.entityId,
        expression: cadFormatFieldExpression(campo.expression),
      });
      continue;
    }
    if (value === campo.current) {
      update.unchanged += 1;
      continue;
    }
    update.updated.push({ entityId: campo.entityId, from: campo.current, to: value });
    update.commands.push({ type: "properties", entityId: campo.entityId, patch: { text: value } });
  }
  return update;
}
