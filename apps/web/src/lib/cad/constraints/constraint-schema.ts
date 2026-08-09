/**
 * Esquema persistido del dibujo paramétrico: restricciones y parámetros.
 *
 * Vive AQUÍ y no en `cad-document.ts` por dos razones, y ninguna es estética:
 *
 *  1. `cad-document.ts` está en el trinquete de tamaño (`monolith-budget.json`)
 *     y sólo puede encoger. Una sección nueva no cabe dentro.
 *  2. El módulo del solucionador necesita estos tipos y `cad-document.ts` no
 *     debe depender de él. Poniéndolos en un archivo SIN IMPORTS la dependencia
 *     va en un único sentido y no hay ciclo posible: los tipos se borran al
 *     compilar, pero el archivo tampoco tiene valores que importar.
 *
 * `cad-document.ts` los REEXPORTA, así que todo el código que ya escribía
 * `import type { CadConstraint } from "./cad-document"` sigue compilando igual.
 *
 * Todos los campos nuevos son OPCIONALES. Un documento guardado antes de esta
 * sección se serializa byte a byte igual que antes: `JSON.stringify` omite las
 * claves `undefined` y la sección `parameters` sólo aparece si existe.
 */

/**
 * Tipos de restricción.
 *
 * Las nueve primeras son las que ya existían (v3) y su significado no cambia.
 * Las ocho siguientes son las que faltaban para poder restringir una pieza de
 * verdad: sin tangencia ni concentricidad no se puede describir un redondeo, y
 * sin radio/diámetro no hay cota paramétrica sobre un círculo.
 */
export type CadConstraintKind =
  | "coincident" | "horizontal" | "vertical" | "parallel" | "perpendicular"
  | "collinear" | "equalLength" | "distance" | "angle"
  | "tangent" | "concentric" | "symmetric" | "fix" | "smooth" | "equalRadius"
  | "radius" | "diameter";

/**
 * Punto característico de una entidad al que se aplica una restricción.
 * `auto` deja que cada tipo elija el suyo (centro para un círculo, inicio para
 * una línea), que es lo que hacía el modelo anterior sin poder decirlo.
 */
export type CadConstraintAnchor = "auto" | "start" | "end" | "center";

export interface CadConstraint {
  id: string;
  kind: CadConstraintKind;
  entityIds: string[];
  value?: number;
  /**
   * Nombre del parámetro que APORTA `value` en una restricción dimensional.
   * Cuando está presente manda sobre `value`, que queda como el último valor
   * evaluado (útil para leer el documento sin evaluar expresiones).
   */
  parameter?: string;
  /** Punto de cada entidad implicada, en el mismo orden que `entityIds`. */
  anchors?: CadConstraintAnchor[];
  /**
   * Caso de la tangencia círculo-círculo. Ausente = lo decide la configuración
   * inicial, que es lo correcto al crear la restricción sobre geometría real.
   * Elegir mal el caso da una solución que converge y está mal.
   */
  tangency?: "external" | "internal";
  enabled: boolean;
}

/**
 * Parámetro con nombre del dibujo (`ancho = 1200`, `alto = ancho * 0.618`).
 *
 * `expression` es la fuente de verdad; `value` es su última evaluación, que se
 * persiste para que abrir el documento no obligue a evaluar nada antes de
 * dibujar. Si divergen, manda `expression`.
 */
export interface CadParameter {
  /** Identificador único dentro del documento. Sin espacios, sin acentos. */
  name: string;
  /** Expresión en la sintaxis de parámetros; un número literal también lo es. */
  expression: string;
  /** Última evaluación conocida de `expression`. */
  value: number;
  comment?: string;
}
