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

/**
 * Lo que, ANTES de una afirmación y dentro de su cláusula, la convierte en otra
 * cosa: una negación, una condición, una pregunta, un requisito o un estado ya
 * alcanzado.
 *
 * Es `PREVIO_QUE_ANULA` SIN sus palabras de estado (`hay`, `están`, `quedan`,
 * `siguen`, `forman`, `sobre`, `objetos`). La diferencia importa: R3 necesita
 * esas palabras porque «objetos seleccionados» describe la entrada, pero la
 * rama de AFIRMACIÓN no puede aceptarlas o «3 objetos borrados» sin efecto
 * —el éxito falso que este gate persigue— se escaparía por la palabra
 * «objetos».
 */
export const PREVIO_QUE_RECHAZA_AFIRMACION =
  /(?<![\p{L}])(?:no|ni|nada|ning[uú]n[oa]?|sin|nunca|jam[aá]s|si)(?![\p{L}])|ya est[aá]n?|todav[ií]a no|¿|necesit|requier/iu;

const FILA_DE_TABLA = /\S {2,}\S/;

/** Dónde acaba una cláusula: . ; : — – salto de línea, « - » y paréntesis. */
const SEPARADOR_DE_CLAUSULAS = /[.;:—–\n]|\s-\s|[()]/;

/**
 * Dónde acaba una cláusula PARA LA RAMA DE AFIRMACIÓN: lo mismo MÁS la coma.
 *
 * La coma no está en `SEPARADOR_DE_CLAUSULAS` a propósito —R3 necesita leer
 * «necesita DOS sólidos designados, y hay 0» de una pieza— pero sin ella la
 * rama de afirmación regalaba una coartada de seis palabras: bastaba abrir la
 * frase con cualquier palabra de `PREVIO_QUE_RECHAZA_AFIRMACION` para lavar la
 * afirmación que venía después de la coma. «Sin tocar el documento, 3 objetos
 * borrados.» o «Ningún error, 2 bloques insertados.» salían `informa` sin
 * ningún efecto; en la versión anterior de esta rama —que leía el mensaje
 * entero— las dos eran ROJO. Con la coma dentro, cada proposición se juzga por
 * sí misma y el lavado desaparece sin tocar R3.
 */
const SEPARADOR_DE_AFIRMACIONES = /[.;:—–,\n]|\s-\s|[()]/g;
const CLAIMS_GLOBAL = new RegExp(CLAIMS.source, "gi");

/**
 * La primera AFIRMACIÓN del mensaje que no tiene coartada en su cláusula, o
 * null.
 *
 * La rama de afirmación leía el mensaje ENTERO: bastaba con que en cualquier
 * sitio apareciera una palabra de `CLAIMS` para darlo por éxito consumado, y el
 * único escape era que el mensaje dijera también algo de `HONESTY`. Eso ponía
 * en ROJO el rechazo legítimo de SECTION —«El plano de corte no atraviesa
 * ninguno de los sólidos designados»— por la palabra «designados», que es
 * exactamente la que `PARTICIPIO_DE_EXITO` ya excluyó a conciencia de R3
 * porque en main describe la ENTRADA y no un resultado.
 *
 * Ahora se juzga por CLÁUSULAS, como R3: se busca cada palabra de `CLAIMS` y se
 * mira lo que la precede DENTRO de su cláusula. No se parte el texto —`CLAIMS`
 * tiene alternativas que incluyen el punto final, y partir por el punto las
 * habría perdido—: se localiza el inicio de la cláusula que contiene la
 * palabra y se examina ese tramo.
 *
 * Las cláusulas se cortan además por COMA (`SEPARADOR_DE_AFIRMACIONES`): sin
 * eso, «Sin tocar el documento, 3 objetos borrados.» se lavaba con el «Sin»
 * del principio, y eso vale para cualquier comando de kind `manage` o `query`
 * —los que imprimen resultados— porque R1 sólo protege a los mutantes.
 *
 * @param {string} text
 * @returns {string | null} la cláusula afirmativa, o null
 */
export function afirmacionSinCoartada(text) {
  for (const match of text.matchAll(CLAIMS_GLOBAL)) {
    let inicio = 0;
    for (const corte of text.slice(0, match.index).matchAll(SEPARADOR_DE_AFIRMACIONES)) {
      inicio = corte.index + corte[0].length;
    }
    const clausula = text.slice(inicio, match.index + match[0].length);
    if (FILA_DE_TABLA.test(clausula)) continue;
    if (PREVIO_QUE_RECHAZA_AFIRMACION.test(text.slice(inicio, match.index))) continue;
    return clausula.trim();
  }
  return null;
}

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
    .split(SEPARADOR_DE_CLAUSULAS)
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

/**
 * R1 — una negación que abre un predicado dentro de una cláusula («la selección
 * no contiene sólidos3D», «no incluye cotas», «no encontró bordes»).
 *
 * `LIMITE_MUTANTE` era una lista cerrada: 3DMOVE y 3DROTATE de la rama de MiMo
 * declaran su límite con «no contiene» y salían en ROJO. Una lista de verbos
 * siempre llega tarde, así que se acepta la negación genérica (la misma idea
 * que `PREVIO_QUE_ANULA`), por palabra entera y cláusula a cláusula. Quedan
 * fuera las locuciones con «no» que no niegan el resultado: «no olvide…»,
 * «no obstante», «no dude…», «no sólo… (sino)».
 */
export const NEGACION_DE_LIMITE =
  /(?<![\p{L}])no\s+(?!(?:olvid|obstante|dud|s[oó]lo)(?:\p{L}|$|\s))\p{L}+/iu;

/**
 * R1 — lo que convierte la negación en la confesión de un stub: el mensaje no
 * habla de la entrada o del documento sino del propio comando («operación aún
 * no implementada en el kernel», «no soportado», «pendiente de kernel»). Eso es
 * la misma promesa sin cumplir que la trampa de THICKEN, y la negación genérica
 * no puede sacarla del rojo: con ella sola, SURFBLEND, SURFTRIM,
 * CONVTOSURFACE… de la rama de MiMo pasaban de ROJO a `informa`.
 */
export const STUB_DECLARADO =
  /(?<![\p{L}])(?:a[uú]n|todav[ií]a)\s+no(?![\p{L}])|(?<![\p{L}])(?:implementad|soportad|programad|disponible)|(?<![\p{L}])sin\s+implementar|pendiente/iu;

export const niegaEnAlgunaClausula = (text) =>
  !STUB_DECLARADO.test(text) &&
  text.split(SEPARADOR_DE_CLAUSULAS).some((clausula) => NEGACION_DE_LIMITE.test(clausula));

/** Límite declarado, con el vocabulario general o con el de R1. */
export const declaraLimiteMutante = (text) =>
  HONESTY.test(text) || LIMITE_MUTANTE.test(text) || niegaEnAlgunaClausula(text);

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
 * R2 — las coordenadas que cada tipo EXIGE para ser dibujable, tal como las
 * declara la unión `CadEntity` de `apps/web/src/lib/cad/cad-document.ts`.
 *
 * `z` no se exige: la unión la pide en `CadPoint3` pero el migrador la rellena,
 * y un documento guardado hace meses entra sin ella. Lo que se exige es lo que
 * NINGÚN migrador puede inventar.
 */
const COORDENADAS_EXIGIDAS = {
  text: ["x", "y"],
  mtext: ["insertion.x", "insertion.y"],
  line: ["start.x", "start.y", "end.x", "end.y"],
  circle: ["center.x", "center.y", "radius"],
  arc: ["center.x", "center.y", "radius", "startAngle", "endAngle"],
};

/** Los números no finitos que cuelgan de un valor, con su ruta. */
function numerosNoFinitos(valor, ruta, encontrados) {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) encontrados.push(`${ruta || "(raíz)"} = ${valor}`);
    return;
  }
  if (Array.isArray(valor)) {
    valor.forEach((item, indice) => numerosNoFinitos(item, `${ruta}[${indice}]`, encontrados));
    return;
  }
  if (valor && typeof valor === "object") {
    for (const [clave, item] of Object.entries(valor))
      numerosNoFinitos(item, ruta ? `${ruta}.${clave}` : clave, encontrados);
  }
}

const leerRuta = (entity, ruta) =>
  ruta.split(".").reduce((valor, clave) => (valor == null ? undefined : valor[clave]), entity);

/**
 * R2 — ¿esta entidad ha quedado con números IMPOSIBLES?
 *
 * El agujero que cierra: TEXTALIGN ascendía a «muta» escribiendo NaN. Su lote
 * entero era un `replace(t1)` y el cambio medido era `rotation` MÁS dos
 * coordenadas basura (`x: NaN`, `y: NaN`, que en el JSON del documento salen
 * como `null`); el texto NO se movía. `changed` era cierto porque la
 * serialización cambiaba, y con eso el gate lo contaba como efecto verificado.
 * Comparar serializaciones no basta: hay que mirar si lo tocado sigue siendo
 * dibujable.
 *
 * Dos cosas descalifican a una entidad tocada: un número no finito en
 * cualquier parte (NaN/Infinity) y la falta de las coordenadas que su tipo
 * exige. La segunda es la que delata la CAUSA —un fixture o un comando que
 * escriben el texto con `position` cuando el esquema pide `x`/`y`— en vez de
 * esperar a que otro comando propague el NaN.
 *
 * @param {any} entity
 * @returns {string | null} el motivo, o null si sus números son posibles
 */
export function coordenadasImposibles(entity) {
  const noFinitos = [];
  numerosNoFinitos(entity, "", noFinitos);
  if (noFinitos.length > 0) return `número no finito: ${noFinitos.slice(0, 4).join(", ")}`;
  const exigidas = COORDENADAS_EXIGIDAS[entity?.type] ?? [];
  const faltan = exigidas.filter((ruta) => typeof leerRuta(entity, ruta) !== "number");
  if (faltan.length > 0)
    return `${entity.type} sin las coordenadas que su tipo exige: ${faltan.join(", ")}`;
  return null;
}

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
  // Antes de preguntar si tiene geometría: si sus números son imposibles, lo
  // que el lote dejó en el documento no se puede dibujar. Va PRIMERO porque un
  // sólido con un NaN dentro también evalúa (la caja envolvente de un sólido
  // roto es la del marcador que lo sustituye y nunca sale vacía).
  const imposibles = coordenadasImposibles(entity);
  if (imposibles) return imposibles;
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

// ─── R6: una bandera de metadatos no es la geometría que se prometió ────────

/**
 * R6 — los `kind` cuyo PRODUCTO es geometría.
 *
 * `manage`, `view` e `inquiry` quedan fuera a propósito: la contabilidad del
 * documento ES su contrato. GROUP escribe `cad:groups` y nada más, y eso es
 * exactamente lo que GROUP hace —la pertenencia la consume después
 * `cadExpandSelectionByGroup`—; exigirle geometría sería pedirle que dibuje.
 */
export const KINDS_DE_GEOMETRIA = ["draw", "modify", "annotate"];

/**
 * R6 — ¿el cambio del lote son SÓLO banderas de metadatos sobre entidades que
 * ya existían?
 *
 * El agujero que cierra: REGION ascendía a «muta» SIN producir geometría. Con
 * la probeta delante, `planCadRegions` devolvía `created: 0`, `tagged: 2` y un
 * lote de dos comandos `metadata` (`{region: true}` sobre `p1` y `c1`, que ya
 * eran contornos cerrados); los ocho intentos de crear región se rechazaban. El
 * documento cambiaba —la serialización incluye el `context`— y con eso un
 * comando de kind `draw` cobraba «muta» sin dibujar nada. Peor: si se borrara
 * entera la rama que CREA regiones, el gate seguiría diciendo «muta», porque
 * esa rama no aporta ni un comando al lote.
 *
 * `metadata` es la única puerta por la que un lote cambia el documento sin
 * tocar una coordenada, así que es la única que hay que cerrar. Se exige además
 * que las entidades sean PREEXISTENTES: marcar algo que el propio lote acaba de
 * crear ya viene con su `add`, y ahí la geometría está.
 *
 * @param {readonly {type: string, entityId?: string, patch?: Record<string, unknown>}[]} comandos
 * @param {ReadonlySet<string>} idsPrevios  ids que ya estaban antes del lote
 * @returns {string | null} el motivo, o null si el lote aporta algo más
 */
export function soloBanderasDeMetadatos(comandos, idsPrevios) {
  if (comandos.length === 0) return null;
  const claves = new Set();
  for (const comando of comandos) {
    if (comando.type !== "metadata") return null;
    if (comando.entityId !== undefined && !idsPrevios.has(comando.entityId)) return null;
    for (const clave of Object.keys(comando.patch ?? {})) claves.add(clave);
  }
  return `el lote entero son banderas de metadatos (${[...claves].sort().join(", ")}) sobre entidades preexistentes`;
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
 * @param {{solidos?: number, lamina?: boolean}} [o.dotacion]  R5: lo que la pasada le puso delante
 * @param {string} [o.kind]         R6: el contrato que el descriptor declara
 * @param {string | null} [o.soloMetadatos]  R6: el lote entero son banderas de metadatos
 * @returns {{verdict: Veredicto, note?: string}}
 */
export function clasificar(o) {
  const resultado = decidir(o);
  // El motivo de R6 no puede perderse por el camino: si el lote no contó, el
  // veredicto que sale es el del mensaje y hay que decir por qué.
  if (o.soloMetadatos && KINDS_DE_GEOMETRIA.includes(o.kind ?? "")) {
    return {
      ...resultado,
      note: `${o.soloMetadatos}, así que el lote no cuenta como geometría` +
        (resultado.note ? `; ${resultado.note}` : ""),
    };
  }
  return resultado;
}

/** El árbol propiamente dicho. */
function decidir(o) {
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
    dotacion = {},
    kind = "",
    soloMetadatos = null,
  } = o;
  const honest = messages.some((entry) => HONESTY.test(entry.text));
  const afirmacion = messages
    .filter((entry) => entry.level === "info" && !HONESTY.test(entry.text))
    .map((entry) => afirmacionSinCoartada(entry.text))
    .find((clausula) => clausula !== null);

  if (steps >= maxSteps) {
    return { verdict: "no-concluyente", note: "el auto-respondedor no lo llevó a término" };
  }
  // R6. Un lote cuyo cambio son SÓLO banderas de metadatos sobre entidades
  // preexistentes no es la geometría que un comando de kind draw/modify/annotate
  // prometió: no concede «muta» y el árbol sigue, para que el comando se quede
  // con la clase que su mensaje le gane (informa, honesto-limitado o el ROJO de
  // una afirmación vacía). No se aplica a manage/view/inquiry: ahí la
  // contabilidad del documento ES el contrato (GROUP y su `cad:groups`).
  const geometriaPrometidaConBanderas =
    soloMetadatos !== null && KINDS_DE_GEOMETRIA.includes(kind);

  if (applied > 0 && changed && !geometriaPrometidaConBanderas) {
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
  if (afirmacion !== undefined) {
    return {
      verdict: "ROJO",
      note: `afirma «${afirmacion}» —una acción consumada— sin ningún efecto verificable`,
    };
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
  // R5. Va DESPUÉS de las ramas de efecto —un comando que aplicó un lote o
  // delegó ya no está poniendo excusas— y ANTES de `honest`, que es la rama por
  // la que estas frases se colaban como integridad.
  const desmentido = limiteDesmentido(messages, dotacion);
  if (desmentido) {
    return {
      verdict: "ROJO",
      note:
        `dijo faltarle ${desmentido.falta} y la probeta se lo dio: «${desmentido.texto.slice(0, 140)}»`,
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

// ─── R5: un límite que la probeta desmiente ──────────────────────────────────

/**
 * R5 — las precondiciones que la probeta SÍ cumple, con la frase con la que un
 * comando diría que le faltan.
 *
 * El agujero que cierra: hasta la probeta, 18 comandos de sólidos y 9 de lámina
 * declaraban un límite que la sonda nunca podía desmentir —«Esta orden necesita
 * SOLID3D designados», «No hay ninguna presentación abierta»— y eso les valía
 * `honesto-limitado`. Decir la verdad sobre algo que nunca se te da no cuesta
 * nada. Ahora que se les da, la misma frase deja de ser honestidad y pasa a ser
 * el mismo tipo de mentira que un «Hecho» vacío, sólo del revés: el comando
 * afirma una carencia falsa para no hacer nada.
 *
 * `necesita` nombra la dotación de la pasada; la misma frase en una pasada que
 * NO la trae sigue siendo honesta, y eso es lo que prueba el gemelo del spec.
 */
export const LIMITES_DESMENTIBLES = [
  {
    necesita: "solidos",
    patron:
      /no contiene s[oó]lidos|necesita\s+(?:al menos\s+)?(?:\w+\s+){0,3}SOLID3D|necesita\s+(?:al menos\s+)?(?:DOS|dos|un|una|alg[uú]n)\s+s[oó]lidos?|sin s[oó]lidos designad|no hay (?:ning[uú]n )?s[oó]lido/i,
    falta: "sólidos 3D designados",
  },
  {
    necesita: "lamina",
    patron:
      /no hay ninguna presentaci[oó]n abierta|necesita una presentaci[oó]n abierta|sin (?:ninguna )?presentaci[oó]n abierta|no hay (?:ninguna )?l[aá]mina/i,
    falta: "una presentación abierta",
  },
];

/**
 * R5 — ¿algún mensaje dice faltarle lo que la probeta le dio?
 *
 * @param {{text: string, level: string}[]} messages
 * @param {{solidos?: number, lamina?: boolean}} dotacion  lo que la pasada puso delante
 * @returns {{falta: string, texto: string} | null}
 */
export function limiteDesmentido(messages, dotacion = {}) {
  const tiene = { solidos: (dotacion.solidos ?? 0) > 0, lamina: dotacion.lamina === true };
  for (const entry of messages) {
    for (const limite of LIMITES_DESMENTIBLES) {
      if (!tiene[limite.necesita]) continue;
      if (limite.patron.test(entry.text)) return { falta: limite.falta, texto: entry.text };
    }
  }
  return null;
}

// ─── Combinación de las DOS pasadas de la sonda ──────────────────────────────

/**
 * Lo único que ASCIENDE a un comando: un efecto verificado.
 *
 * `informa` y `honesto-limitado` no están aquí a propósito. La probeta de
 * sólidos y lámina existe para quitarle a un comando la excusa de una
 * precondición imposible, no para reetiquetar a los que ya eran honestos: si
 * con la probeta un comando pasa de «declara su límite» a «informa», eso no es
 * un efecto y no vale como mejora. Sólo `muta` (lote aplicado y documento
 * cambiado) y `delegado` (petición a un anfitrión) suben.
 */
const RANGO_DE_EFECTO = { muta: 2, delegado: 1 };

/**
 * El veredicto de un comando a partir de sus DOS pasadas, con la regla
 * MONÓTONA: nadie sale mejor clasificado sin efecto, y nadie sale peor por el
 * cambio de fixture.
 *
 * - ROJO en cualquiera de las dos GANA sobre todo lo demás. Es lo que hace que
 *   un comando que sigue sin producir efecto con la probeta salga PEOR, no
 *   mejor: la precondición imposible ya no lo tapa.
 * - Si una concluye y la otra no, vale la que concluye.
 * - Si las dos concluyen, sólo se asciende cuando la segunda aporta un efecto
 *   verificado (`muta`/`delegado`) mejor que el de la primera.
 * - En cualquier otro caso MANDA la pasada base, que es el documento de
 *   siempre. Por eso ningún comando 2D puede cambiar de veredicto por tener
 *   sólidos y lámina delante: si la probeta lo degrada, su veredicto de la
 *   pasada base queda intacto.
 *
 * No es «lo mejor de las dos»: un ROJO no se compensa nunca con el verde de
 * la otra pasada.
 *
 * @template {{verdict: string, note?: string}} P
 * @param {P} base      pasada sobre el documento de siempre
 * @param {P} probeta   pasada sobre la probeta de sólidos y lámina
 * @returns {P & {pasada: string}}
 */
export function combinarPasadas(base, probeta) {
  const conBase = { ...base, pasada: "plano2d" };
  const conProbeta = { ...probeta, pasada: "solidos3d" };
  if (base.verdict === "ROJO") return conBase;
  if (probeta.verdict === "ROJO") return conProbeta;
  if (base.verdict === "no-concluyente" && probeta.verdict !== "no-concluyente") return conProbeta;
  if (probeta.verdict === "no-concluyente") return conBase;
  const sube = (RANGO_DE_EFECTO[probeta.verdict] ?? 0) > (RANGO_DE_EFECTO[base.verdict] ?? 0);
  return sube ? conProbeta : conBase;
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
