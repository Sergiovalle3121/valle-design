/**
 * La bandera de importación DWG y los gates que la gobiernan.
 *
 * POR QUÉ EXISTE APAGADA. Admitir archivos DWG es la razón número uno por la
 * que un despacho mexicano no se cambia de AutoCAD, y hay un laboratorio
 * clean-room en este repositorio que ya sabe leer una base de datos R2000. La
 * tentación evidente es enchufarlo. ADR-0004 y ADR-0007 lo prohíben con
 * nombres y apellidos: habilitar DWG en el producto exige otro ADR que
 * resuelva revisión jurídica y de seguridad, corpus redistribuible
 * independiente, fuzzing, límites, fidelidad, pérdidas, tenancy, mapping al
 * documento canónico, importación real, CI/E2E y operación. Nada de eso lo
 * puede firmar un programa.
 *
 * Lo que SÍ se puede construir sin firma es todo el cableado, con la bandera
 * apagada, para que el día que el dueño firme el trabajo sea de horas y no de
 * meses. Eso es este módulo.
 *
 * LA BANDERA NO BASTA. `dwgImportIsEnabled` exige la bandera Y cero bloqueos.
 * Encenderla a mano no habilita nada: el gate sigue cerrado porque los gates
 * son declaraciones de hechos que hoy son falsos. Es fallo cerrado ante lo
 * ambiguo, y es deliberado que la bandera sea condición NECESARIA y no
 * suficiente: una bandera que por sí sola abre la puerta es una bandera que
 * alguien enciende «un momento, para probar».
 *
 * Puro y sin DOM: los gates son datos, no lecturas de disco. Quién los firma y
 * con qué evidencia es asunto del ADR de promoción y de la spec que cruza esta
 * declaración con los artefactos de evidencia del repositorio.
 */

/**
 * La bandera. Nace apagada y permanece apagada.
 *
 * Tipada como `boolean` y no como `false` a propósito: si fuera literal, el
 * compilador estrecharía cada comprobación a `never` y las specs que vigilan el
 * encendido dejarían de compilar en cuanto alguien la cambiara. Se prefiere que
 * el spec FALLE a que el spec no compile.
 */
export const DWG_IMPORT_FLAG: boolean = false;

/**
 * Los hechos que el ADR de promoción tendrá que declarar ciertos.
 *
 * Son hechos, no opiniones: cada uno se puede contrastar contra un artefacto
 * del repositorio o contra un documento firmado. Ninguno se puede marcar cierto
 * «porque el código ya funciona».
 */
export interface DwgPromotionGates {
  /** Existe el ADR posterior que autoriza la promoción (ADR-0007 lo exige). */
  readonly promotionAdrSigned: boolean;
  /** Revisión jurídica externa resuelta sobre el formato y el corpus. */
  readonly legalReviewCleared: boolean;
  /** Revisión de seguridad del límite binario, con fuzzing y límites. */
  readonly securityReviewCleared: boolean;
  /** Bundles admitidos en el corpus independiente (commit y hash fijados). */
  readonly admittedCorpusBundles: number;
  /** Validaciones independientes autorizadas; la política exige dos. */
  readonly independentValidations: number;
  /** El laboratorio declara `entityImport` soportado en su propia matriz. */
  readonly labEntityImportSupported: boolean;
  /** El mapping al documento canónico tiene evidencia de fidelidad y pérdidas. */
  readonly canonicalMappingVerified: boolean;
}

/**
 * El estado de HOY. Todo falso, todo cero, y así consta por escrito.
 *
 * Congelado para que nadie lo mute en caliente desde otro módulo: cambiar un
 * gate tiene que ser un cambio de código revisable, no una asignación.
 */
export const DWG_PROMOTION_GATES: DwgPromotionGates = Object.freeze({
  promotionAdrSigned: false,
  legalReviewCleared: false,
  securityReviewCleared: false,
  admittedCorpusBundles: 0,
  independentValidations: 0,
  labEntityImportSupported: false,
  canonicalMappingVerified: false,
});

/** Dos validaciones independientes: el reader de Valle nunca es único oráculo. */
export const DWG_REQUIRED_INDEPENDENT_VALIDATIONS = 2;

/**
 * Qué falta, en español y por su nombre.
 *
 * Devuelve una lista y no un booleano porque «no se puede» sin el motivo es lo
 * que empuja a la gente a saltarse el gate: quien lee esto tiene que poder
 * decir exactamente qué firma falta.
 */
export function dwgPromotionBlockers(
  gates: DwgPromotionGates = DWG_PROMOTION_GATES,
): string[] {
  const blockers: string[] = [];
  if (!gates.promotionAdrSigned)
    blockers.push("falta el ADR de promoción que autorice habilitarlo en el producto");
  if (!gates.legalReviewCleared)
    blockers.push("falta la revisión jurídica externa");
  if (!gates.securityReviewCleared)
    blockers.push("falta la revisión de seguridad del límite binario");
  if (gates.admittedCorpusBundles < 1)
    blockers.push("cero bundles admitidos en el corpus independiente");
  if (gates.independentValidations < DWG_REQUIRED_INDEPENDENT_VALIDATIONS)
    blockers.push(
      `faltan validaciones independientes autorizadas (${gates.independentValidations} de ${DWG_REQUIRED_INDEPENDENT_VALIDATIONS})`,
    );
  if (!gates.labEntityImportSupported)
    blockers.push("la matriz del laboratorio no declara soportada la importación de entidades");
  if (!gates.canonicalMappingVerified)
    blockers.push("el mapping al documento canónico no tiene evidencia de fidelidad y pérdidas");
  return blockers;
}

/**
 * ¿Está habilitada la importación DWG? Bandera encendida Y cero bloqueos.
 *
 * El orden importa poco; lo que importa es la conjunción: encender la bandera
 * sin los gates deja esto en `false` y el producto sigue rechazando `.dwg`.
 */
export function dwgImportIsEnabled(
  flag: boolean = DWG_IMPORT_FLAG,
  gates: DwgPromotionGates = DWG_PROMOTION_GATES,
): boolean {
  return flag && dwgPromotionBlockers(gates).length === 0;
}

/**
 * La razón honesta que la interfaz puede enseñar.
 *
 * No promete fechas, no insinúa que «ya casi», y no menciona ninguna capacidad
 * que el producto no tenga. Lo accionable de verdad —exporta a DXF— va primero
 * porque es lo que resuelve el problema del arquitecto hoy.
 */
export const DWG_IMPORT_DISABLED_REASON =
  "Este editor todavía no lee archivos .dwg. Expórtalo a DXF (R12 o posterior) " +
  "desde tu CAD e impórtalo: DXF entra completo, con su informe de lo que se " +
  "conserva y lo que se pierde.";

// ---------------------------------------------------------------------------
// Beta acotada AC1015_MODELSPACE_2D_V3 — firmada 2026-08-24 (ADR-0009
// §6-bis), ampliada el mismo día (§6-ter, §6-quater)
// ---------------------------------------------------------------------------

/**
 * Autorización del titular para la beta de SÓLO IMPORTACIÓN. NO es
 * `DWG_PROMOTION_GATES`: es un mecanismo DISTINTO y más estrecho, con el
 * mismo patrón de riesgo aceptado por escrito que la Enmienda 2026-08-20 de
 * `CORPUS_POLICY.md` en el repositorio de conformidad — el titular decidió
 * encargar el dictamen jurídico externo EN PARALELO en vez de antes, y
 * acotó lo que autoriza mientras tanto a un perfil, una versión y un
 * sentido (importar, no exportar).
 *
 * El perfil es V3 desde §6-quater: §6-bis fijó V1 (LINE/POINT/CIRCLE/ARC/
 * LWPOLYLINE/TEXT/INSERT) y autorizó, como parte de la misma firma, una
 * hoja de ruta secuencial de ampliaciones (M2/M3/M4/M5) condicionada a que
 * cada hito tuviera su propio end-to-end en verde antes del siguiente. V2
 * (§6-ter, M2a) sumó ELLIPSE y SPLINE no racional de escenario 1; V3
 * (§6-quater, M2b) suma MTEXT, DIMENSION (salvo angular de dos líneas) y
 * HATCH de contorno poligonal.
 *
 * `legalReviewStatus` se queda en `"pending_parallel"` a propósito: cambiar
 * este archivo no puede convertirlo en `legalReviewCleared: true` en
 * `DWG_PROMOTION_GATES` de arriba, que sigue exigiendo la revisión real para
 * la promoción general/GA. Los dos gates son preguntas distintas.
 */
export interface DwgBetaAuthorization {
  readonly ownerSigned: true;
  readonly adrRef: "0009";
  readonly signedDate: "2026-08-24";
  readonly profile: "AC1015_MODELSPACE_2D_V3";
  readonly legalReviewStatus: "pending_parallel";
}

export const DWG_BETA_AUTHORIZATION: DwgBetaAuthorization = Object.freeze({
  ownerSigned: true,
  adrRef: "0009",
  signedDate: "2026-08-24",
  profile: "AC1015_MODELSPACE_2D_V3",
  legalReviewStatus: "pending_parallel",
});

/**
 * ¿Está autorizada la beta de importación DWG en ESTE entorno?
 *
 * `betaFlagOn` lo decide quien llama, no este módulo: un módulo que no lee
 * DOM ni proceso no puede saber si el entorno actual es público o de beta.
 * Quien SÍ lo sabe (`document-import-client.ts`, a partir de una variable de
 * build) pasa el booleano ya resuelto. Igual que `dwgImportIsEnabled`, es una
 * conjunción: la bandera sola no basta si el titular no hubiera firmado.
 */
export function dwgBetaImportIsEnabled(betaFlagOn: boolean): boolean {
  return betaFlagOn === true && DWG_BETA_AUTHORIZATION.ownerSigned;
}

// ---------------------------------------------------------------------------
// AC1018 (AutoCAD 2004) — SU PROPIO flag, distinto del de arriba —
// firmada 2026-08-24 (ADR-0009 §7)
// ---------------------------------------------------------------------------

/**
 * Autorización del titular para aceptar TAMBIÉN firmas AC1018 dentro de la
 * beta de sólo importación — un mecanismo DISTINTO de `DWG_BETA_AUTHORIZATION`
 * a propósito, no un campo más ahí.
 *
 * POR QUÉ SEPARADO. El adaptador autorizado del códec ya documentaba, desde
 * la firma de V1, que "AC1018 tiene su propio hito (M3) y su propio flag
 * cuando llegue":
 * ampliar en silencio el flag de la beta AC1015 para que también cuele
 * AC1018 habría sido exactamente la comodidad que esa frase existía para
 * impedir. El lector del laboratorio (`readDwg`) ya despacha AC1018 al
 * mismo contrato `DwgDatabase` que AC1015 —confirmado leyendo el punto de
 * entrada real del códec, cero cambio de mapeo hace falta— pero es una vía
 * de código MÁS NUEVA (container R2004, aterrizada por otro
 * frente de trabajo el mismo día que ésta).
 *
 * ADENDA 2026-09-01 — UNA FRASE DE AQUÍ CADUCÓ. Este párrafo decía que «sólo
 * AC1018 decodifica objetos hoy, la familia AC1024/1027/1032 abre el
 * contenedor pero no sus cuerpos». **Ya no es cierto**: desde el corte de
 * versiones modernas, AC1024, AC1027 y AC1032 se leen enteras y el corpus
 * queda en CERO discrepancias en las cinco versiones. Se corrige aquí en vez
 * de dejarla envejecer, porque una frase caduca sobre lo que el códec sabe
 * hacer es exactamente la que lleva a ampliar un flag en silencio «total, si
 * ya lo lee». No se amplía: la familia moderna tiene su PROPIO mecanismo más
 * abajo (`DWG_MODERN_BETA_AUTHORIZATION`), sin firma todavía.
 *
 * Encender esto no enciende eso: cada firma reconocida se sigue verificando
 * una a una en `readDwgNeutralDatabase`.
 *
 * `legalReviewStatus` en `"pending_parallel"` por la misma razón que en
 * `DWG_BETA_AUTHORIZATION`: no convierte `legalReviewCleared` en `true` en
 * `DWG_PROMOTION_GATES`, que sigue exigiendo la revisión real para la
 * promoción general.
 */
export interface DwgAc1018BetaAuthorization {
  readonly ownerSigned: true;
  readonly adrRef: "0009";
  readonly signedDate: "2026-08-24";
  readonly profile: "AC1018_MODELSPACE_2D_V1";
  readonly legalReviewStatus: "pending_parallel";
}

export const DWG_AC1018_BETA_AUTHORIZATION: DwgAc1018BetaAuthorization = Object.freeze({
  ownerSigned: true,
  adrRef: "0009",
  signedDate: "2026-08-24",
  profile: "AC1018_MODELSPACE_2D_V1",
  legalReviewStatus: "pending_parallel",
});

/**
 * ¿Está autorizada la aceptación de AC1018 en ESTE entorno? Conjunción de
 * TRES cosas, no dos: la bandera de este flag, la firma del titular para
 * AC1018 específicamente, Y la beta base (`dwgBetaImportIsEnabled`) sigue
 * siendo quien decide si DWG entra en absoluto — AC1018 es una AMPLIACIÓN de
 * qué firmas acepta esa beta, nunca una vía independiente para saltarla.
 */
export function dwgAc1018BetaImportIsEnabled(
  ac1018FlagOn: boolean,
  baseBetaFlagOn: boolean,
): boolean {
  return (
    ac1018FlagOn === true &&
    DWG_AC1018_BETA_AUTHORIZATION.ownerSigned &&
    dwgBetaImportIsEnabled(baseBetaFlagOn)
  );
}

// ---------------------------------------------------------------------------
// Perfil 3D heredado (AC1015_3D_WIREFRAME_V1) — 3DFACE, POLYLINE 3D, POLYLINE
// MESH, POLYLINE PFACE — SU PROPIO flag, distinto de los dos de arriba.
// PROPUESTO en ADR-0009 §9. SIN FIRMA DEL TITULAR todavía.
// ---------------------------------------------------------------------------

/**
 * A diferencia de `DWG_BETA_AUTHORIZATION` y `DWG_AC1018_BETA_AUTHORIZATION`,
 * ÉSTA NO ES UNA FIRMA REAL. Las dos de arriba documentan una conversación
 * directa con el titular, registrada en su fecha; ninguna conversación así
 * ocurrió para este perfil. `ownerSigned` es literalmente `false` y está
 * TIPADO `boolean` (no el literal `true` que usan las dos autorizaciones ya
 * firmadas) exactamente por la misma razón que `DWG_IMPORT_FLAG` es
 * `boolean` y no `false`: si alguna vez alguien cambia este valor a mano sin
 * pasar por una firma real, el spec que lo vigila debe FALLAR, no dejar de
 * compilar.
 *
 * El perfil en sí —qué tipos de entidad, con qué límites— ya está
 * implementado y probado end-to-end en el adaptador autorizado y el puente
 * al documento canónico, con la puerta cerrada, siguiendo el mismo patrón
 * de "el cableado no necesita firma, decodificar bytes reales del usuario
 * sí" que ya documentaba el módulo entero. Lo que falta no es código: es
 * exactamente la misma conversación registrada que ya tuvieron V1/V2/V3/M3.
 */
export interface Dwg3dWireframeBetaAuthorization {
  readonly ownerSigned: boolean;
  readonly adrRef: "0009";
  readonly profile: "AC1015_3D_WIREFRAME_V1";
  readonly legalReviewStatus: "pending_parallel";
}

export const DWG_3D_WIREFRAME_BETA_AUTHORIZATION: Dwg3dWireframeBetaAuthorization = Object.freeze({
  ownerSigned: false,
  adrRef: "0009",
  profile: "AC1015_3D_WIREFRAME_V1",
  legalReviewStatus: "pending_parallel",
});

/**
 * ¿Está autorizada la aceptación del perfil 3D heredado en ESTE entorno?
 * Misma conjunción de TRES condiciones que `dwgAc1018BetaImportIsEnabled`:
 * la bandera de este flag, la firma del titular para ESTE perfil
 * específicamente (hoy `false`, así que este término solo ya cierra la
 * conjunción), Y la beta base. Nunca una ampliación silenciosa de
 * `DWG_BETA_AUTHORIZATION` ni de `DWG_AC1018_BETA_AUTHORIZATION`: es un
 * mecanismo propio, con su propio nombre de perfil.
 */
export function dwg3dWireframeBetaImportIsEnabled(
  wireframeFlagOn: boolean,
  baseBetaFlagOn: boolean,
): boolean {
  return (
    wireframeFlagOn === true &&
    DWG_3D_WIREFRAME_BETA_AUTHORIZATION.ownerSigned &&
    dwgBetaImportIsEnabled(baseBetaFlagOn)
  );
}

// ---------------------------------------------------------------------------
// Familia MODERNA (AC1024 / AC1027 / AC1032) — SU PROPIO flag, distinto de
// los tres de arriba. SIN FIRMA DEL TITULAR todavía.
// ---------------------------------------------------------------------------

/**
 * Autorización del titular para aceptar TAMBIÉN las firmas AC1024, AC1027 y
 * AC1032 dentro de la beta de sólo importación.
 *
 * POR QUÉ ESTO EXISTE, Y POR QUÉ AHORA. El laboratorio pasó de no abrir estas
 * tres versiones a leerlas con **cero discrepancias** contra el gemelo AC1015
 * del mismo dibujo —AC1024 8/8, AC1027 8/8, AC1032 8/8, y el corpus completo
 * en 57/57 archivos sin una sola discrepancia en las cinco versiones—. Pero
 * `readDwgNeutralDatabase` sólo admitía `AC1015` y `AC1018`, así que el
 * producto RECHAZABA un AC1032 que el códec entendía perfectamente. Ese hueco
 * —leer bien y no dejar entrar— es justo la distancia entre un laboratorio y
 * un producto, y lo que se cierra aquí es el CABLEADO, no la puerta.
 *
 * AC1032 importa más que las otras dos: es el formato de guardado por defecto
 * de AutoCAD 2018–2026. Un cliente que abre AutoCAD hoy y guarda produce
 * exactamente esto.
 *
 * ESTO NO ES UNA FIRMA. Igual que `DWG_3D_WIREFRAME_BETA_AUTHORIZATION` y a
 * diferencia de las de AC1015 y AC1018, aquí NO hubo ninguna conversación
 * registrada con el titular: `ownerSigned` es literalmente `false` y está
 * TIPADO `boolean` —no el literal `true` de las dos firmadas— por la misma
 * razón que `DWG_IMPORT_FLAG` es `boolean` y no `false`: si alguien lo cambia
 * a mano sin pasar por una firma real, el spec que lo vigila debe FALLAR, no
 * dejar de compilar.
 *
 * Lo que falta, por tanto, no es código ni medición: es la misma conversación
 * registrada que ya tuvieron V1/V2/V3 y M3. Hasta que exista, esta conjunción
 * devuelve `false` aunque se enciendan todas las banderas del mundo.
 *
 * `legalReviewStatus` en `"pending_parallel"` por la razón de siempre: no
 * convierte `legalReviewCleared` en `true` en `DWG_PROMOTION_GATES`, que
 * sigue exigiendo la revisión real para la promoción general.
 */
export interface DwgModernBetaAuthorization {
  readonly ownerSigned: boolean;
  readonly adrRef: "0009";
  readonly profile: "AC1024_AC1027_AC1032_MODELSPACE_2D_V1";
  readonly legalReviewStatus: "pending_parallel";
}

export const DWG_MODERN_BETA_AUTHORIZATION: DwgModernBetaAuthorization = Object.freeze({
  ownerSigned: false,
  adrRef: "0009",
  profile: "AC1024_AC1027_AC1032_MODELSPACE_2D_V1",
  legalReviewStatus: "pending_parallel",
});

/**
 * ¿Está autorizada la aceptación de la familia moderna en ESTE entorno? La
 * MISMA conjunción de TRES condiciones que usan AC1018 y el perfil 3D: la
 * bandera de este flag, la firma del titular para ESTA familia en concreto
 * (hoy `false`, así que este término solo ya cierra la conjunción), Y la beta
 * base, que sigue siendo quien decide si DWG entra en absoluto.
 *
 * Nunca una ampliación silenciosa de `DWG_AC1018_BETA_AUTHORIZATION`: que
 * AC1018 y la familia moderna compartan el contenedor R2004 hace TENTADOR
 * colgar las tres versiones nuevas del flag que ya existe, y es exactamente
 * lo que este mecanismo separado existe para impedir. Son cinco versiones con
 * cinco riesgos distintos y cada una entra por su puerta.
 */
export function dwgModernBetaImportIsEnabled(
  modernFlagOn: boolean,
  baseBetaFlagOn: boolean,
): boolean {
  return (
    modernFlagOn === true &&
    DWG_MODERN_BETA_AUTHORIZATION.ownerSigned &&
    dwgBetaImportIsEnabled(baseBetaFlagOn)
  );
}
