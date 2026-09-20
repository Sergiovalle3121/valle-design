/**
 * Los campos que faltaban para acotar un día normal (Ola III, 2026-09-19).
 *
 * ## Qué arregla
 *
 * DIMSPACE, DIMBREAK y DIMJOGGED no tenían dónde escribir, y DIMEDIT lo decía
 * en su propio código: «Girar» y «Oblicuo» se negaban porque «el esquema
 * canónico no tiene ni ángulo de texto propio ni ángulo de líneas de
 * referencia» (`annotate-dimension-chains.ts`, antes de esta ola). Los seis
 * campos de aquí son ESO — nada más — y los cuatro comandos nuevos (más
 * DIMEDIT y el DIMTEDIT que estrena esta ola) son sus únicos escritores.
 *
 * ## Por qué NO sube `meta.schema`
 *
 * Cada campo nuevo de `dimension` hasta hoy (v4 a v10) subió el entero del
 * esquema canónico, y esa subida tiene un coste real y medido: cambia el SHA
 * del corpus de referencia byte a byte, y con él CUATRO ficheros —
 * `corpus-sha-provenance.spec.ts`, `plan-budget.spec.ts`, la evidencia
 * publicada de `docs/cad/evidence/` y los manifiestos de
 * `benchmark/corpus-*-manifest.json`— que hay que volver a calibrar con una
 * corrida real de la máquina de referencia. Esta ola corre en un portátil de
 * 8 GB con specs sueltos y typecheck, sin permiso para lanzar el benchmark
 * completo (`npm run benchmark:cad:plan`) ni para tocar ficheros de otras dos
 * olas en marcha. Subir el esquema sin poder recalibrar esos cuatro ficheros
 * los dejaría MINTIENDO — un SHA committeado que ya no es el que el código
 * produce— que es exactamente el pecado que `corpus-sha-provenance.spec.ts`
 * existe para atrapar.
 *
 * Así que estos campos son opcionales-AUSENTES sin cambiar el entero:
 * ninguna entidad existente pierde ni gana un byte al serializarse — más
 * estricto todavía que una subida de esquema, que sólo promete eso para las
 * cotas que no usan el campo nuevo. Quien quiera atarlos formalmente a un
 * `meta.schema: 11` con su census y su cadena de procedencia puede hacerlo
 * después, con la máquina de referencia delante; aquí queda escrito el motivo
 * de por qué no se hizo en esta rama, en vez de callarlo.
 *
 * Ola 7 (2026-09-20, DIMSTYLE → unidades alternas) añade `alternatePrecision`
 * bajo la MISMA regla y por el MISMO motivo: portátil de 8 GB, sin permiso
 * para el benchmark completo ni para tocar ficheros de las dos olas de
 * interfaz en vuelo.
 */

export interface CadPoint2Like {
  x: number;
  y: number;
}

export interface CadDimensionBreakGap {
  /** El objeto que cruza la línea de cota y abrió este hueco. */
  entityId: string;
  /** Fracción [0, 1] de `dimLine.a` a `dimLine.b` donde empieza el hueco. */
  start: number;
  /** Fracción [0, 1] donde acaba. Siempre `> start`. */
  end: number;
}

/** Los seis campos que esta ola añade a `dimension`, todos opcionales-ausentes. */
export interface CadDimensionDayToDayFields {
  /**
   * DIMEDIT «Girar» / DIMTEDIT «Ángulo»: rotación ABSOLUTA del rótulo, en
   * grados CCW desde +X. Presente, sustituye al ángulo derivado de la
   * geometría — que es justo lo que Girar promete y lo que el esquema no
   * tenía dónde guardar.
   */
  textRotationOverride?: number;
  /**
   * DIMEDIT «Oblicuo»: ángulo ABSOLUTO (grados CCW desde +X) de las líneas de
   * extensión, en vez de la perpendicular por defecto. Es el mismo convenio de
   * ángulo absoluto que ya usan HATCH o TEXT — no relativo a la línea de cota.
   */
  extensionObliqueAngle?: number;
  /**
   * DIMBREAK: huecos ya cortados en la línea de cota, uno por objeto que la
   * cruza. Colgados del `entityId` que los abrió: si ese objeto desaparece,
   * `restoreCadDimensionBreaks` (`associative-dimension.ts`) los retira solo
   * — la cota vuelve a su línea entera sin que nadie la vuelva a tocar.
   */
  breaks?: CadDimensionBreakGap[];
  /**
   * DIMJOGGED: punto que sustituye al centro real en el dibujo — cerca del
   * arco, cuando el centro de verdad cae fuera del plano. La MEDIDA sigue
   * siendo el radio real (`a` a `b`/`radius`); esto sólo cambia hasta dónde
   * llega la línea de referencia.
   */
  jogCenterOverride?: CadPoint2Like;
  /**
   * DIMJOGGED: por dónde pasó el usuario al marcar el quiebre. Se proyecta
   * sobre la línea entre el borde del arco y `jogCenterOverride` — clavar el
   * quiebre fuera de esa línea no tendría a qué línea partir.
   */
  jogPosition?: CadPoint2Like;
  /**
   * DIMJOGGED: ángulo del quiebre respecto de la línea de referencia, en
   * grados (DIMJOGANG). Ausente → 45, el valor de fábrica de AutoCAD.
   */
  jogAngle?: number;
  /**
   * DIMALTD — decimales del rótulo de unidad alterna (`alternateUnits`),
   * independientes de `precision` (DIMDEC). Sin este campo, el rótulo alterno
   * rotulaba SIEMPRE con los decimales de la unidad principal — un despacho
   * que acota en mm con 2 decimales y alterna en pulgadas no puede pedir 2
   * decimales en pulgadas también sin perder precisión, ni 4 sin que la
   * principal se llene de ceros. Ausente → se sigue usando `precision`, igual
   * que antes de este campo.
   */
  alternatePrecision?: number;
}
