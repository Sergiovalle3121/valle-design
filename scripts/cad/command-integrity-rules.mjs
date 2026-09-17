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
 * R3 — participios de éxito, por palabra entera. Es CLAIMS ampliado (espesad,
 * establecid, seleccionad, generad…) y SIN «designad» ni «abiert»: en main
 * describen la entrada o el estado («necesita DOS sólidos designados»,
 * «ediciones abiertas»), no un resultado.
 */
export const PARTICIPIO_DE_EXITO =
  /(?<![\p{L}])(?:cread|dibujad|aplicad|hech|guardad|trazad|cambiad|actualizad|publicad|insertad|definid|modificad|borrad|eliminad|renombrad|movid|girad|copiad|restaurad|cargad|activad|completad|espesad|establecid|seleccionad|generad|agregad|añadid|colocad|asignad|convertid|exportad|importad|recortad|extruid|ajustad|fijad|configurad|registrad|vinculad|adjuntad|anclad|escalad|orientad|calculad)[oa]s?(?![\p{L}])|(?<![\p{L}])listo(?![\p{L}])/iu;

/**
 * R3 — lo que, ANTES del participio y dentro de su cláusula, lo convierte en
 * otra cosa: una negación («no se ha creado»), una condición («si está
 * activado»), una pregunta, un requisito («necesita… designados») o un estado
 * («ya están en esa capa», «forman una cadena», «objetos seleccionados»).
 */
export const PREVIO_QUE_ANULA =
  /(?<![\p{L}])(?:no|ni|nada|ning[uú]n[oa]?|sin|nunca|jam[aá]s|si)(?![\p{L}])|ya est[aá]n?|todav[ií]a no|¿|necesit|requier|(?<![\p{L}])(?:hay|est[aá]n?|quedan?|siguen?|forman|sobre|objetos?)(?![\p{L}])/iu;

const FILA_DE_TABLA = /\S {2,}\S/;

/**
 * R3 — las cláusulas de un mensaje que AFIRMAN un resultado.
 *
 * Antes bastaba con que el MISMO mensaje dijera también «requiere» para que la
 * afirmación no contara: «POINTLIGHT creada con intensidad 1 — requiere WebGL»
 * salía `honesto-limitado`. Decir que falta algo no anula haber dicho que se
 * hizo, así que el mensaje se parte en cláusulas (por . ; : — – salto de línea,
 * « - » y paréntesis) y cada una se juzga por separado. Las filas de tabla son
 * lecturas y se saltan.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function clausulasAfirmativas(text) {
  return text
    .split(/[.;:—–\n]|\s-\s|[()]/)
    .map((clausula) => clausula.trim())
    .filter((clausula) => {
      if (FILA_DE_TABLA.test(clausula)) return false;
      const match = PARTICIPIO_DE_EXITO.exec(clausula);
      if (!match) return false;
      return !PREVIO_QUE_ANULA.test(clausula.slice(0, match.index));
    });
}

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
  const afirmadas = messages
    .filter((entry) => entry.level === "info")
    .flatMap((entry) => clausulasAfirmativas(entry.text));
  if (afirmadas.length > 0) {
    // R3. Va ANTES de la rama `honest`: un límite en otra cláusula no borra
    // la afirmación.
    return {
      verdict: "ROJO",
      note: `afirma «${afirmadas[0]}» sin efecto; decir que falta algo no anula haber dicho que se hizo`,
    };
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

// ─── R4: una exención sólo vale si su spec conduce el comando y comprueba ────

/** Los specs que CI ejecuta: `src/**\/*.spec.ts` de apps/web (run-specs.mjs). */
export const SPEC_EJECUTADO_EN_CI = /^src\/(?:[\w.-]+\/)*[\w.-]+\.spec\.ts$/;

/** Consultas que no conducen nada: registro, alias o bucles sobre nombres. */
const SOLO_CONSULTA = /\bregistry\.get\b|REGISTRY_V2\.get\b|resolveCadCommandAlias|\bfor\s*\(/;

/** Entradas que consisten sólo en cancelar. */
const SOLO_CANCELAR = /^\s*\[\s*(?:cancel|CANCEL|\{\s*kind\s*:\s*"cancel"\s*\})\s*\]/;
const PASO_CANCELAR = /\.step\([^,]*,\s*(?:cancel|CANCEL|\{\s*kind\s*:\s*"cancel"\s*\})\s*[,)]/;

const ASERCION = /\bassert\.|\bok\(|\beq\(|\bnear\(/;
const HABLA_DE_EFECTO = /document|commands|effects|requests|layers|blocks|entities|volume|attributes/i;
const VENTANA_DE_COMPROBACION = 30;

const escapar = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * ¿La línea `indice` conduce `nombre` con entradas de verdad?
 * @returns {string | null} el motivo del rechazo, o null si conduce
 */
function rechazoDeConduccion(nombre, conduce, lineas, indice) {
  if (SOLO_CONSULTA.test(conduce)) return "«conduce» es una consulta de registro, de alias o un bucle, no una conducción";
  const directo = new RegExp(`\\b\\w+\\(\\s*\\[?\\s*"${escapar(nombre)}"\\s*,`).exec(conduce);
  if (directo) {
    const entradas = conduce.slice(directo.index + directo[0].length);
    return SOLO_CANCELAR.test(entradas) ? "«conduce» sólo cancela el comando" : null;
  }
  // Por identificador: `const X = command("NOMBRE")` o `.get("NOMBRE")`, la
  // ligadura MÁS CERCANA antes de la línea, usada con `.step(` o `f(X, …)`.
  for (const [, id] of conduce.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
    const uso = new RegExp(`\\b${escapar(id)}\\s*\\.\\s*step\\(|\\b\\w+\\(\\s*${escapar(id)}\\s*,`);
    if (!uso.test(conduce)) continue;
    const ligadura = new RegExp(`\\b(?:const|let|var)\\s+${escapar(id)}\\s*=`);
    for (let j = indice; j >= 0; j -= 1) {
      if (!ligadura.test(lineas[j])) continue;
      const nombra = new RegExp(`(?:\\b\\w*command|\\.get)\\(\\s*"${escapar(nombre)}"\\s*\\)`, "i");
      if (!nombra.test(lineas[j])) break;
      return PASO_CANCELAR.test(conduce) ? "«conduce» sólo cancela el comando" : null;
    }
  }
  return `«conduce» no nombra ${nombre} con entradas (ni "${nombre}" como primer argumento ni un identificador ligado a command("${nombre}"))`;
}

/**
 * ¿`comprueba` está en la ventana tras la línea `indice` y es una aserción
 * sobre un efecto? La aserción puede abrir en la línea anterior (`assert.ok(`
 * con el argumento debajo).
 */
function compruebaEnVentana(comprueba, lineas, indice) {
  if (!HABLA_DE_EFECTO.test(comprueba)) return false;
  const fin = Math.min(lineas.length - 1, indice + VENTANA_DE_COMPROBACION);
  for (let j = indice; j <= fin; j += 1) {
    if (!lineas[j].includes(comprueba)) continue;
    if (ASERCION.test(lineas[j])) return true;
    const previa = lineas[j - 1]?.trim() ?? "";
    if (previa.endsWith("(") && ASERCION.test(previa)) return true;
  }
  return false;
}

/**
 * Valida una exención de `command-integrity-exemptions.json`.
 *
 * Antes el gate sólo leía la CLAVE: el texto «Spec: …» nunca se comprobaba, y
 * DVIEW entró citando un spec que sólo lo cancela. Ahora cada exención es
 * `{razon, spec, conduce, comprueba}` y vale sólo si:
 * - `spec` es un `src/**\/*.spec.ts` de apps/web que existe (CI lo ejecuta);
 * - `conduce` aparece literal en el spec y conduce el comando con entradas
 *   que no son sólo cancelar (no vale una consulta de registro ni un bucle);
 * - `comprueba` aparece literal en las 30 líneas siguientes y es una aserción
 *   sobre un efecto (documento, comandos, efectos, peticiones, capas…).
 *
 * @param {string} nombre
 * @param {unknown} entrada
 * @param {(spec: string) => string | null} leerSpec  texto del spec o null si no existe
 * @returns {string[]} motivos de rechazo; vacío si vale
 */
export function validarExencion(nombre, entrada, leerSpec) {
  const campos = ["razon", "spec", "conduce", "comprueba"];
  if (
    !entrada ||
    typeof entrada !== "object" ||
    campos.some((campo) => typeof entrada[campo] !== "string" || entrada[campo].trim() === "")
  ) {
    return [`${nombre}: exención sin justificación verificable — hace falta {${campos.join(", ")}}`];
  }
  const { spec, conduce, comprueba } = entrada;
  if (!SPEC_EJECUTADO_EN_CI.test(spec) || spec.split("/").includes("..")) {
    return [`${nombre}: exención sin justificación verificable — «${spec}» no es un src/**/*.spec.ts de apps/web`];
  }
  const texto = leerSpec(spec);
  if (texto === null) {
    return [`${nombre}: exención sin justificación verificable — el spec «${spec}» no existe`];
  }
  const lineas = texto.split(/\r?\n/);
  const apariciones = lineas.flatMap((linea, indice) => (linea.includes(conduce) ? [indice] : []));
  if (apariciones.length === 0) {
    return [`${nombre}: exención sin justificación verificable — «conduce» no aparece en ${spec}`];
  }
  let motivo = "";
  for (const indice of apariciones) {
    const rechazo = rechazoDeConduccion(nombre, conduce, lineas, indice);
    if (rechazo) {
      motivo = rechazo;
      continue;
    }
    if (compruebaEnVentana(comprueba, lineas, indice)) return [];
    motivo = `«comprueba» no es una aserción sobre un efecto en las ${VENTANA_DE_COMPROBACION} líneas que siguen a «conduce»`;
  }
  return [`${nombre}: exención sin justificación verificable — ${motivo} (${spec})`];
}
