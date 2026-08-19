/**
 * Contrato del banco de calidad NL→CAD.
 *
 * POR QUÉ EXISTE. El producto acepta instrucciones en español y produce
 * geometría, y hasta hoy nadie había medido si acierta. «El copiloto entiende
 * español» era una afirmación sin número detrás, que es exactamente la clase de
 * afirmación que este repositorio no publica.
 *
 * LA TAXONOMÍA ES EL BANCO. Medir «acertó / no acertó» sería inútil aquí,
 * porque los dos modos de fallar no valen lo mismo ni de lejos:
 *
 *  · Que el producto DIGA QUE NO a algo que sí sabía hacer es un fallo caro
 *    pero honesto: el arquitecto lo ve y lo reescribe.
 *  · Que el producto dibuje un muro de 15 mm cuando le pidieron uno de 15 cm es
 *    un fallo SILENCIOSO. Se ve plausible en pantalla, viaja al DXF, y aparece
 *    en la obra. Por eso `grave` no es un adorno del informe: es la métrica que
 *    manda, y la regla de la casa —fallo cerrado— dice que debe ser cero.
 *
 * Ese es el motivo de que haya seis desenlaces y no dos.
 */
import type { CadCommandId } from "../commands/types";

/**
 * Las dos mitades del corpus.
 *
 * `despacho`: cómo habla de verdad un arquitecto o un ingeniero civil en
 * México. Aquí acertar es producir la geometría pedida.
 *
 * `adversarial`: instrucciones ambiguas, contradictorias, imposibles, con
 * unidades mezcladas o con cantidades absurdas. Aquí acertar es NO producir
 * geometría: es rechazar con un error tipado.
 */
export type NlCadLane = "despacho" | "adversarial";

/** Familia del caso adversarial; explica POR QUÉ la instrucción no se ejecuta. */
export type NlCadAdversarialFamily =
  | "ambigua"
  | "contradictoria"
  | "imposible"
  | "unidades"
  | "absurda";

export interface NlCadExpectedCommand {
  kind: "command";
  commandId: CadCommandId;
  /**
   * Sólo se comparan las claves DECLARADAS. Un comando puede traer más campos
   * (defaults, ids de selección) sin que eso sea un fallo: lo que el banco
   * juzga es si la geometría pedida sale con las medidas pedidas.
   */
  args?: Record<string, unknown>;
}

export interface NlCadExpectedRejection {
  kind: "reject";
  family: NlCadAdversarialFamily;
}

export type NlCadExpectation = NlCadExpectedCommand | NlCadExpectedRejection;

export interface NlCadCase {
  /** Estable y citable: el informe de fallos nombra casos, no líneas. */
  id: string;
  lane: NlCadLane;
  /** La instrucción TAL CUAL se teclea. No se corrige ni se normaliza. */
  text: string;
  /** Qué rasgo del español de obra ejercita este caso. */
  trait: string;
  expect: NlCadExpectation;
}

/**
 * Desenlace de un caso. El orden va de mejor a peor.
 *
 * `argumentos_equivocados` está deliberadamente separado de
 * `comando_equivocado` porque es el fallo más caro del banco: el comando es el
 * correcto, la pantalla enseña algo verosímil y sólo las cifras están mal. Es
 * el que nadie detecta a ojo.
 */
export type NlCadOutcome =
  /** despacho: comando correcto, argumentos declarados correctos. */
  | "acierto"
  /** adversarial: rechazado con un código legible por máquina. */
  | "rechazo_tipado"
  /** adversarial: rechazado, pero sólo con prosa; no hay código que ramificar. */
  | "rechazo_sin_codigo"
  /** despacho: el producto no entendió una instrucción legítima (fallo cerrado). */
  | "rechazo_indebido"
  /** despacho: entendió, pero la ejecución lo paró con un error tipado. */
  | "bloqueado_al_ejecutar"
  /** despacho: dibujó otra cosa. GRAVE. */
  | "comando_equivocado"
  /** despacho: dibujó lo pedido con medidas equivocadas. GRAVE. */
  | "argumentos_equivocados"
  /** adversarial: produjo geometría ante una instrucción irrealizable. GRAVE. */
  | "geometria_indebida";

/** Qué respondió el producto a un caso, ya clasificado. */
export interface NlCadCaseResult {
  id: string;
  lane: NlCadLane;
  text: string;
  trait: string;
  outcome: NlCadOutcome;
  /**
   * `true` cuando el producto entregó un resultado plausible y equivocado.
   * Es el peor desenlace posible y el que la regla de la casa prohíbe.
   */
  grave: boolean;
  /** Comando esperado (o `null` si se esperaba rechazo). */
  expectedCommandId: CadCommandId | null;
  /** Comando que salió del parser, si salió alguno. */
  actualCommandId: CadCommandId | null;
  /** Confianza que el parser se auto-asignó. Se publica sin retocar. */
  confidence: number;
  /** Códigos tipados que emitió el rechazo (parser o validación). */
  rejectionCodes: string[];
  /** Claves cuyo valor no coincidió, con lo esperado y lo obtenido. */
  argMismatches: NlCadArgMismatch[];
  /** Operaciones que la ejecución habría aplicado al documento. */
  operationsApplied: number;
  /** Explicación corta y legible del desenlace, para el informe. */
  detail: string;
}

export interface NlCadArgMismatch {
  key: string;
  expected: unknown;
  actual: unknown;
}

/** Los desenlaces que la regla «fallo cerrado» prohíbe. */
export const NL_CAD_GRAVE_OUTCOMES: readonly NlCadOutcome[] = [
  "comando_equivocado",
  "argumentos_equivocados",
  "geometria_indebida",
];
