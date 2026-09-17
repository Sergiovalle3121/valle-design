/**
 * Reglas PURAS de la sonda y del gate de integridad de comandos.
 *
 * Viven aparte de `apps/web/scripts/command-integrity-probe.mts` (que ejecuta
 * los comandos) y de `check-command-integrity.mjs` (que decide si el árbol
 * pasa) por una razón: el árbol de decisión es lo que un comando tramposo
 * intenta esquivar, y un árbol que sólo se mide en vivo contra el registro de
 * hoy no dice nada de las trampas que el registro de hoy no contiene. Aquí
 * cada regla tiene su caso atrapado y su gemelo legítimo en
 * `command-integrity-rules.spec.mjs`, que el gate ejecuta antes de la sonda.
 */

/**
 * Mensajes que declaran un límite o un rechazo: el comando explicó por qué NO
 * hizo nada. Eso es integridad, no fallo — lo contrario del «Hecho» vacío.
 */
export const HONESTY =
  /no est[aá]|no puede|no pued|no hay|no se |no lo es|no es |no son |no parece|no toca|no queda|no encierra|no pertenece|no lleva|no forma|no aporta|no sostiene|no tiene|no existe|falta|todav[ií]a no|sin (un )?anfitri[oó]n|se neg[oó]|requiere|necesita|ya est[aá]|debe ser|must be|s[oó]lo se|es para |admite |vocabulario|cancelad|abierta: no|convierten primero|nada de lo|s[oó]lo mide|use /i;

/**
 * Mensajes que AFIRMAN una acción consumada. Si aparecen sin ningún efecto
 * verificable, eso es exactamente el «éxito falso» que este gate persigue.
 */
export const CLAIMS =
  /cread[oa]|dibujad[oa]|aplicad[oa]|hech[oa]|guardad[oa]|trazad[oa]|abiert[oa]|cambiad[oa]|designad[oa]|actualizad[oa]|publicad[oa]|insertad[oa]|definid[oa]|modificad[oa]|borrad[oa]|eliminad[oa]|renombrad[oa]|movid[oa]|girad[oa]|copiad[oa]|restaurad[oa]|cargad[oa]|activad[oa]\.|listo\b|completad[oa]/i;

/**
 * R1 — límites que un comando MUTANTE declara con palabras que `HONESTY` no
 * tiene («no reparó nada», «elija primero…», «el portapapeles está vacío»…).
 * Se mantienen aparte de `HONESTY` a propósito: fundirlos movería a
 * `honesto-limitado` comandos que hoy cuentan como `informa`, y la regla nueva
 * no tiene por qué reetiquetar a los que ya eran honestos.
 */
export const LIMITE_MUTANTE =
  /no repar|primero|s[oó]lo toca|vac[ií][oa]|saldr[ií]a sin|no deja|designe s[oó]lo|eso es una/i;

/**
 * R1 — una LECTURA: un valor («Longitud actual = 100») o una fila de tabla
 * (columnas separadas por dos o más espacios). Un comando mutante que, sin
 * nada que cambiar, enseña el estado actual no está mintiendo.
 */
export const LECTURA = /=\s*-?\d|\S {2,}\S/;

export const esLectura = (text) => LECTURA.test(text);

/** Límite declarado, con el vocabulario general o con el de R1. */
export const declaraLimiteMutante = (text) =>
  HONESTY.test(text) || LIMITE_MUTANTE.test(text);

/**
 * R2 — entidades que un lote añadió o cambió: se comparan por id y por su
 * JSON. Sólo éstas se examinan; lo que el lote no tocó no es asunto suyo.
 *
 * @template {{id: string}} E
 * @param {readonly E[]} antes
 * @param {readonly E[]} despues
 * @returns {E[]}
 */
export function entidadesTocadas(antes, despues) {
  const previas = new Map(antes.map((entity) => [entity.id, JSON.stringify(entity)]));
  return despues.filter((entity) => previas.get(entity.id) !== JSON.stringify(entity));
}

const ARRAYS_DE_GEOMETRIA = ["points", "faces", "vertices", "positions", "indices"];

/**
 * R2 — ¿esta entidad es un cascarón sin geometría?
 *
 * «muta» comparaba sólo la serialización: insertar un solid3d cuyo único nodo
 * es un `brep` con `points: []` y `faces: []` cambia el texto del documento y
 * contaba como mutación verificada (MESH y PLANESURF de la rama de MiMo). Aquí
 * se EVALÚA lo insertado con los evaluadores del producto. No se usa la caja
 * envolvente: la de un sólido roto es la del marcador que lo sustituye y nunca
 * sale vacía.
 *
 * @param {any} entity
 * @param {{
 *   solid3dMesh: (entity: any) => {indices: ArrayLike<number>},
 *   solid3dMassProperties: (entity: any) => {area: number},
 *   regionArea: (entity: any) => number,
 * }} evaluadores
 * @returns {string | null} el motivo, o null si tiene geometría
 */
export function sinGeometria(entity, evaluadores) {
  try {
    if (entity.type === "solid3d") {
      const mesh = evaluadores.solid3dMesh(entity);
      if (!mesh || mesh.indices.length === 0) return "solid3d sin triángulos";
      if (!(evaluadores.solid3dMassProperties(entity).area > 0)) return "solid3d de área 0";
      return null;
    }
    if (entity.type === "region") {
      return evaluadores.regionArea(entity) > 0 ? null : "región de área 0";
    }
  } catch (error) {
    // Lo que el producto no sabe evaluar tampoco es geometría que enseñar.
    return `no se puede evaluar: ${String(error).slice(0, 80)}`;
  }
  for (const key of ARRAYS_DE_GEOMETRIA) {
    if (Array.isArray(entity[key]) && entity[key].length === 0) return `${entity.type}.${key} vacío`;
  }
  return null;
}

/**
 * @typedef {"muta" | "delegado" | "informa" | "honesto-limitado" | "no-concluyente" | "ROJO"} Veredicto
 */

/**
 * El árbol de decisión de la sonda.
 *
 * @param {object} o
 * @param {number} o.steps          entradas que dio el auto-respondedor
 * @param {number} o.maxSteps       tope de entradas
 * @param {number} o.applied        lotes que pasaron por el ejecutor real
 * @param {boolean} o.changed       el documento canónico cambió
 * @param {boolean} o.delegated     hubo petición a un anfitrión, vista, UI, variables o selección
 * @param {{text: string, level: string}[]} o.messages
 * @param {string[]} o.inputTrace   tipos de entrada, en orden
 * @param {boolean} o.probeAborted  la sonda canceló por prompts repetidos
 * @param {boolean} o.mutates       el descriptor promete mutar
 * @param {{id: string, motivo: string}[]} [o.vacias]  R2: entidades tocadas sin geometría
 * @returns {{verdict: Veredicto, note?: string}}
 */
export function clasificar(o) {
  const {
    steps,
    maxSteps,
    applied,
    changed,
    delegated,
    messages,
    inputTrace,
    probeAborted,
    mutates,
    vacias = [],
  } = o;
  const honest = messages.some((entry) => HONESTY.test(entry.text));
  const claims = messages.some(
    (entry) => entry.level === "info" && CLAIMS.test(entry.text) && !HONESTY.test(entry.text),
  );

  if (steps >= maxSteps) {
    return { verdict: "no-concluyente", note: "el auto-respondedor no lo llevó a término" };
  }
  if (applied > 0 && changed) {
    // R2. Basta con UNA entidad tocada sin geometría: si no, una línea de
    // relleno junto al cascarón vacío bastaría para esconderlo.
    if (vacias.length > 0) {
      return {
        verdict: "ROJO",
        note:
          "aplicó un lote cuyo cambio incluye entidades sin geometría: " +
          vacias.map(({ id, motivo }) => `${id} (${motivo})`).join(", "),
      };
    }
    return { verdict: "muta" };
  }
  if (applied > 0 && !changed) {
    return { verdict: "ROJO", note: "aplicó un lote pero el documento canónico quedó idéntico" };
  }
  if (delegated) return { verdict: "delegado" };
  if (claims) {
    return { verdict: "ROJO", note: "afirma una acción consumada sin ningún efecto verificable" };
  }
  if (messages.length === 0 && steps > 0 && inputTrace[inputTrace.length - 1] === "enter") {
    // Cerró tras un Enter del auto-respondedor: es la salida normal de un
    // comando repetitivo (OFFSET, PURGE, MATCHPROP…), no un éxito falso.
    return { verdict: "informa", note: "cierre normal con Enter, sin afirmación" };
  }
  if (messages.length === 0 && steps > 0 && probeAborted) {
    return {
      verdict: "no-concluyente",
      note: "la sonda lo canceló tras prompts repetidos; terminó sin mensaje",
    };
  }
  if (messages.length === 0 && steps > 0) {
    return {
      verdict: "ROJO",
      note:
        "terminó en silencio absoluto: sin efecto, sin mensaje, sin límite declarado — entradas: " +
        inputTrace.join("→"),
    };
  }
  if (honest) return { verdict: "honesto-limitado" };
  if (messages.length > 0) {
    // R1. Un comando que PROMETE mutar (`mutates: true`), que termina sin
    // lote, sin delegar y con un mensaje que ni declara un límite ni es una
    // lectura, se ha quedado con la promesa: «THICKEN: superficie espesada…
    // operación pendiente de kernel» caía aquí como `informa`.
    //
    // No es «mutates sin lote = ROJO, diga lo que diga»: con el documento de
    // prueba, un comando mutante honesto a menudo no tiene nada que hacer. Esa
    // versión literal pone en rojo 126 comandos legítimos de main (110
    // honesto-limitado y 16 informa: -LAYER, AUDIT, LENGTHEN, PURGE…). Lo que
    // se exige es que el mensaje DIGA por qué no hubo cambio.
    if (
      mutates &&
      !messages.some((entry) => declaraLimiteMutante(entry.text) || esLectura(entry.text))
    ) {
      return {
        verdict: "ROJO",
        note: "promete mutar y terminó sin lote, sin delegar y sin declarar límite",
      };
    }
    return { verdict: "informa" };
  }
  // Cero pasos y cero mensajes: el comando terminó en su `begin` sin decir
  // nada. Para uno que promete mutar, eso es un no-op silencioso.
  return mutates
    ? { verdict: "ROJO", note: "terminó al invocarse, sin efecto y sin mensaje" }
    : { verdict: "informa" };
}
