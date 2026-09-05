/**
 * La matriz de cobertura AutoLISP: se GENERA de la tabla viva y se compara.
 *
 * ## Por qué no es un documento escrito a mano
 *
 * Las cuatro entregas anteriores de este frente movieron la tabla de 151 a 258
 * entradas. Un documento con las cifras tecleadas habría quedado desactualizado
 * en la primera de esas entregas y nadie lo habría notado, porque un `.md` no
 * falla: se lee, se cree y se cita. La regla 4 de la casa lo dice con todas sus
 * letras —ninguna cifra vive en dos lugares—, así que aquí la matriz sale de
 * `CAD_LISP_BUILTINS` en caliente, y este spec es a la vez su generador
 * (`--update`) y el gate que la mantiene viva.
 *
 * Las tres formas de envejecer que este spec cierra:
 *
 *  1. **Una función nueva sin clasificar.** Entra en la tabla y no está en el
 *     JSON: rojo, con su nombre. Nadie amplía el lenguaje sin decir en qué
 *     columna cae lo que amplió.
 *  2. **Una función clasificada que ya no existe.** Se retiró o se renombró y
 *     el documento sigue prometiéndola: rojo, con su nombre.
 *  3. **Un límite o un motivo que cambió en el código.** El texto sale de donde
 *     vive la decisión —`LISP_FUERA_DE_ALCANCE`, `VLA_PROPERTIES`,
 *     `ENTMAKE_SUPPORTED`—, así que cambiar el motivo en el código cambia el
 *     documento, y no cambiarlo lo deja rojo.
 *
 * ## Las tres columnas, y por qué son tres y no dos
 *
 * «Implementada / no implementada» miente en las dos direcciones. `entsel`
 * existe y designa, pero su punto es el centro del contorno y no el clic: quien
 * la dé por implementada a secas escribirá un TRIM que recorta el lado
 * equivocado. Y `nentsel` no está, pero está DICHO —la función existe y se
 * niega nombrando el motivo—, que es una situación distinta de un
 * «no function definition» a mitad de rutina.
 *
 * ## La columna 3 se comprueba EJECUTÁNDOLA
 *
 * Que una función esté declarada fuera de alcance no se afirma leyendo una
 * lista: se llama a las 30, y cada una tiene que fallar con el motivo que el
 * documento publica, palabra por palabra. Si alguien convirtiera una de ellas
 * en un no-op silencioso —el «éxito sin efecto» que prohíbe la regla 2—, este
 * spec se pondría rojo antes de que la rutina de un despacho diera por escrito
 * un fichero que no existe.
 *
 * ## Y los límites se PRUEBAN, no se prometen
 *
 * Cada límite que se puede provocar en una línea se provoca aquí: la variable
 * que no está en la tabla, la tabla de símbolos que no es LAYER, el `trans`
 * entre dos sistemas, el `entmake` de un HATCH, el área que no se escribe, el
 * modo de `ssget` que no existe y el punto de `entsel`. Un límite escrito y no
 * comprobado es una promesa; uno comprobado es una frontera.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CadDocument, CadEntity } from "../cad/cad-document";
import { LISP_FUERA_DE_ALCANCE } from "./builtins/unavailable";
import { VLA_PROPERTIES } from "./builtins/vlax-properties";
import { CAD_LISP_BUILTINS } from "./cad-builtins";
import { CORE_LISP_BUILTINS } from "./core-builtins";
import { CadDocumentLispHost } from "./document-host";
import { ENTMAKE_SUPPORTED } from "./dxf/to-entity";
import { PLUGIN_PERMISSIONS } from "./plugins/permissions";
import { printLisp } from "./printer";
import { LispSession, ScriptedResponder } from "./session";
import { ename, list, type LispResponse, type LispValue } from "./values";

let checks = 0;
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function contains(haystack: string, needle: string, message: string): void {
  assert.ok(haystack.includes(needle), `${message} — se leyó: ${haystack}`);
  checks += 1;
}

const here = path.dirname(fileURLToPath(import.meta.url));
/** La raíz del repositorio: `apps/web/src/lib/lisp` → cinco niveles arriba. */
const raiz = path.resolve(here, "../../../../..");
const rutaMatriz = path.join(raiz, "docs/api/autolisp-cobertura.json");
const rutaGuia = path.join(raiz, "docs/api/EXTENSIBILIDAD.md");
const rutaPuente = path.join(raiz, "docs/api/PUENTE-DOTNET-VBA.md");
const rutaPolitica = path.join(raiz, "docs/api/POLITICA-API-PUBLICA.md");

// ---------------------------------------------------------------------------
// 1. La clasificación
// ---------------------------------------------------------------------------

type EstadoCobertura = "implementada" | "limite" | "todaviaNo";

interface EntradaCobertura {
  readonly nombre: string;
  readonly tabla: "nucleo" | "cad";
  readonly clase: "funcion" | "constante";
  readonly origen: "autolisp" | "valle";
  readonly estado: EstadoCobertura;
  readonly familia?: string;
  readonly limite?: string;
  readonly motivo?: string;
}

/**
 * Los límites declarados, uno por función y con el límite ESCRITO.
 *
 * Está escrito aquí y no en cada módulo porque un límite sólo sirve si se lee
 * ANTES de portar la rutina, y para eso tiene que estar junto a los demás. Cada
 * texto resume la decisión que el módulo correspondiente explica entera en su
 * comentario; la comprobación de que el límite sigue siendo real está más abajo
 * en la sección 4, que lo provoca.
 *
 * Lo que NO se escribe a mano son las listas: los tipos que `entmake` construye
 * salen de `ENTMAKE_SUPPORTED` y las propiedades del puente VLA de
 * `VLA_PROPERTIES`, así que ampliar cualquiera de las dos actualiza el
 * documento en vez de desmentirlo.
 */
const LIMITES = new Map<string, string>();

function limite(nombres: readonly string[], texto: string): void {
  for (const nombre of nombres) LIMITES.set(nombre.toUpperCase(), texto);
}

limite(
  ["entsel"],
  "devuelve `(<nombre> <punto>)` y el punto es el CENTRO de la caja envolvente de la entidad, " +
    "no el del clic: el anfitrión contesta a una designación con nombres de entidad, no con " +
    "coordenadas. Lo que dependa de QUÉ LADO se designó —el trozo que recorta TRIM, la mitad " +
    "de un arco— saldrá del lado del centro. Omitir el punto habría sido peor: `(cadr (entsel))` " +
    "daría nil y la rutina dibujaría en el origen sin quejarse.",
);
limite(
  ["ssget"],
  "designa por conjunción de pares del filtro; los operadores lógicos `(-4 . \"<OR\")` se " +
    "RECHAZAN diciéndolo, porque aplicar el resto como conjunción devolvería un conjunto " +
    "plausible y equivocado. Los modos admitidos son X, A, L, W y C más la designación " +
    "interactiva sin modo: los de valla (F), polígono (WP, CP) y anterior (P) se niegan " +
    "nombrando el modo pedido.",
);
limite(
  ["command"],
  "conduce los comandos del registro del motor y termina la máquina de estados dentro de la " +
    "misma llamada: no deja un comando ACTIVO esperando a que el usuario pinche, que es lo que " +
    "hace `(command \"LINEA\")` con argumentos de menos en AutoCAD. Una entidad pasada como " +
    "argumento se designa por el centro de su contorno (véase `entsel`), así que TRIM y FILLET " +
    "—que distinguen qué lado se designó— no se conducen bien por aquí. El texto que el comando " +
    "devuelve todavía no se imprime en la línea de comandos.",
);
limite(
  ["entmake"],
  `construye enteros los tipos que el traductor DXF sabe crear sin perder estado (${ENTMAKE_SUPPORTED.join(", ")}). ` +
    "HATCH, DIMENSION y MULTILEADER llevan asociatividad que la lista DXF no transporta y se " +
    "rechazan NOMBRANDO el tipo, en vez de crear a medias una entidad que se dibuja bien y se " +
    "rompe al regenerar. Un bloque se INSERTA pero no se DEFINE: el vocabulario canónico de " +
    "mutación no tiene esa orden y el subsistema no se la salta.",
);
limite(
  ["entmod"],
  "parte de la entidad que ya existe y aplica encima los códigos que el traductor reconoce, así " +
    "que lo que no sabe leer SOBREVIVE intacto. No cambia el tipo (código 0) porque hay cotas y " +
    "sombreados que referencian la entidad por su identidad, y no escribe la tabla de símbolos: " +
    "un registro de capa se rechaza nombrando `-LAYER`, que es la única ruta que produce " +
    "comandos canónicos de capa.",
);
limite(
  ["entdel"],
  "borra por el historial, así que se deshace con Ctrl+Z como cualquier otra cosa — y por eso NO " +
    "resucita: sobre una entidad ya borrada da error en vez de devolverla, que es lo que hace " +
    "AutoCAD dentro de la sesión. Recuperarla exigiría una papelera paralela al historial, es " +
    "decir un segundo modelo de deshacer. Tampoco borra registros de la tabla de símbolos.",
);
limite(
  ["entupd"],
  "es un no-op que devuelve su argumento: el anfitrión repinta desde el documento en cuanto " +
    "éste cambia, así que no hay regeneración que forzar. Existe porque las rutinas la llaman " +
    "siempre y que faltara sería un «no function definition» en mitad de una rutina que funciona.",
);
limite(
  ["handent", "enthandle"],
  "sólo hablan de los handles que traen las entidades IMPORTADAS de un fichero. La geometría " +
    "nacida aquí no tiene handle y contestan nil, en vez de derivar uno del identificador " +
    "interno: eso sería inventar una identidad estable que el fichero no tiene y que cambiaría " +
    "al volver a importar.",
);
limite(
  ["getvar"],
  "lee la tabla de variables de sistema DEL PRODUCTO, la misma que escriben SETVAR, UNITS, " +
    "COLOR, LTSCALE y OSNAP tecleados. Lo que no está en esa tabla no se inventa: se rechaza " +
    "con el mismo mensaje que al escribir, a propósito, para que quien se equivoque de nombre " +
    "no busque dos defectos donde hay uno.",
);
limite(
  ["setvar"],
  "escribe la misma tabla, con sus tres reglas: las de sólo lectura (AREA, PERIMETER, los ejes " +
    "del SCU) rechazan la escritura, el rango y el enumerado se validan diciendo la razón, y lo " +
    "que no está en la tabla no se crea. Las variables NO persisten en el documento —el " +
    "documento canónico no tiene sección donde guardarlas— y `INSUNITS` cambia la tabla de la " +
    "sesión, no la cabecera del dibujo.",
);
limite(
  ["getenv"],
  "devuelve siempre nil. Aquí no hay variables de entorno del sistema operativo que leer, y " +
    "el sandbox del intérprete no alcanza el proceso; contestar una cadena inventada dejaría a " +
    "la rutina construyendo rutas de un disco que no existe.",
);
limite(
  ["trans"],
  "sólo admite la identidad —el mismo sistema de origen y de destino— porque el documento " +
    "canónico todavía no modela SCU ni SCP. Cuando difieren se RECHAZA en vez de devolver el " +
    "punto sin transformar, que es la forma silenciosa de colocar geometría en el sitio " +
    "equivocado.",
);
limite(
  ["osnap"],
  "no tiene APERTURA porque una rutina corre sin ventana y la apertura de AutoCAD se mide en " +
    "píxeles: busca en TODO el dibujo y gana el punto notable más cercano de los modos pedidos. " +
    "La consecuencia declarada es que no devuelve nil por «estar lejos», sino cuando los modos " +
    "pedidos no tienen ningún candidato. Divergencia heredada del adaptador de LINE: «cen» " +
    "sobre una línea contesta su punto medio, cosa que AutoCAD no hace.",
);
limite(
  ["tblsearch", "tblnext", "tblobjname"],
  "sólo la tabla LAYER. BLOCK, STYLE, LTYPE, DIMSTYLE, UCS, VIEW y VPORT existen en el " +
    "documento con otra forma —o no existen— y contestar una lista aproximada por cada una " +
    "sería inventarse la tabla de símbolos de otro producto; se rechazan nombrando la tabla " +
    "pedida, que es lo que permite al autor decidir qué hacer.",
);
limite(
  ["load"],
  "lee de la biblioteca de rutinas del estudio que monta el anfitrión, no del disco: el " +
    "intérprete no alcanza el sistema de ficheros. Sin biblioteca montada lo DICE, en vez de " +
    "devolver nil fingiendo que el fichero no existe, que son dos cosas distintas para quien " +
    "depura. Un ciclo de cargas se corta nombrando el ciclo entero, no agotando el presupuesto.",
);
limite(
  [
    "load_dialog",
    "new_dialog",
    "start_dialog",
    "done_dialog",
    "action_tile",
    "set_tile",
    "get_tile",
    "unload_dialog",
  ],
  "el diálogo es de UN VIAJE: se entrega el árbol con sus valores iniciales, el anfitrión lo " +
    "pinta y contesta con los valores finales y el control que lo cerró. Cubre el diálogo que " +
    "de verdad escriben las rutinas —pedir cuatro datos y aceptar— y no la validación en vivo " +
    "ni los campos que se habilitan según otro. Sólo los controles que el analizador DCL sabe " +
    "pintar; los demás se nombran al cargar. Mientras el editor no lo pinte, el anfitrión lo " +
    "trata como CANCELADO, que es un camino que las rutinas ya manejan.",
);
limite(
  ["vl-load-com"],
  "es un no-op que devuelve nil, igual que en AutoCAD moderno, donde la extensión ya está " +
    "cargada. No promete ActiveX —quien llame después al lado de aplicación recibe su negativa " +
    "con el motivo—: promete no matar en la línea 1 a la rutina que copia esa línea por " +
    "costumbre y luego no usa COM para nada.",
);
limite(
  ["vlax-release-object"],
  "es un no-op HONESTO: un objeto VLA de aquí está respaldado por el handle de la entidad y se " +
    "resuelve contra el documento en cada acceso, así que no hay puntero COM que liberar ni " +
    "estado que pueda discrepar. Se acepta porque toda rutina de ActiveX la llama al terminar.",
);
limite(
  ["vlax-variant-value", "vlax-safearray->list"],
  "son la IDENTIDAD. Aquí una propiedad de punto ya llega como lista LISP, sin variante ni " +
    "safearray de por medio; existen para que " +
    "`(vlax-safearray->list (vlax-variant-value (vlax-get-property o 'StartPoint)))` —la línea " +
    "con la que está escrita media biblioteca publicada— corra sin tocarla.",
);
limite(
  ["vlax-get", "vlax-put", "vlax-get-property", "vlax-put-property", "vlax-property-available-p"],
  `hablan de las propiedades de la tabla del puente (${VLA_PROPERTIES.map((property) => property.name).join(", ")}). ` +
    "Una propiedad que no esté en ella se niega nombrándola, en vez de aceptar la escritura y " +
    "no aplicarla.",
);

/**
 * Los límites del puente VLA se DERIVAN de su tabla de propiedades: una
 * propiedad sin escritor es de sólo lectura y su `readOnlyReason` es el límite;
 * una con escritor y con motivo escribe en unos tipos y se niega en los otros.
 * Escribirlos a mano habría creado la única forma de mentira que este documento
 * no puede permitirse: una promesa que el código desmiente en la línea de al
 * lado.
 */
for (const property of VLA_PROPERTIES) {
  if (!property.readOnlyReason) continue;
  const escribibles = property.writableTypes ?? property.types;
  const donde =
    property.write && escribibles
      ? `escribe sólo en las entidades de tipo ${escribibles.join(", ")}; en los demás tipos que ` +
        `la LEEN se niega porque `
      : "no se escribe, y se dice al intentarlo: ";
  limite([`vla-put-${property.name}`], `${donde}${property.readOnlyReason}`);
}

/** Las tres consultas que no son AutoLISP: son extensión de este producto. */
const EXTENSIONES_DEL_PRODUCTO = new Set(["VD-AREAS", "VD-MUROS", "VD-CARPINTERIA"]);

const fueraDeAlcance = new Map(
  LISP_FUERA_DE_ALCANCE.map((entrada) => [entrada.nombre.toUpperCase(), entrada]),
);

// ---------------------------------------------------------------------------
// 2. La matriz, generada de la tabla viva
// ---------------------------------------------------------------------------

const funciones: EntradaCobertura[] = [...CAD_LISP_BUILTINS.entries()]
  .sort(([izquierda], [derecha]) => (izquierda < derecha ? -1 : izquierda > derecha ? 1 : 0))
  .map(([nombre, valor]) => {
    const declinada = fueraDeAlcance.get(nombre);
    const limiteDeclarado = LIMITES.get(nombre);
    const estado: EstadoCobertura = declinada
      ? "todaviaNo"
      : limiteDeclarado
        ? "limite"
        : "implementada";
    return {
      nombre,
      tabla: CORE_LISP_BUILTINS.has(nombre) ? "nucleo" : "cad",
      clase: valor.t === "subr" ? "funcion" : "constante",
      origen: EXTENSIONES_DEL_PRODUCTO.has(nombre) ? "valle" : "autolisp",
      estado,
      ...(declinada ? { familia: declinada.familia, motivo: declinada.motivo } : {}),
      ...(limiteDeclarado ? { limite: limiteDeclarado } : {}),
    } satisfies EntradaCobertura;
  });

const porEstado = (estado: EstadoCobertura): EntradaCobertura[] =>
  funciones.filter((entrada) => entrada.estado === estado);

const matriz = {
  $comentario:
    "GENERADO. No se edita a mano: se regenera con el comando de `generadoPor` y el spec que " +
    "lo genera falla si el fichero no coincide con la tabla viva del intérprete.",
  generadoPor: "cd apps/web && npx tsx src/lib/lisp/cobertura.spec.ts --update",
  fuente: "apps/web/src/lib/lisp/cad-builtins.ts · CAD_LISP_BUILTINS",
  columnas: {
    implementada:
      "Hace su trabajo dentro del alcance del producto y no tiene una frontera propia que " +
      "declarar. No significa «idéntica a AutoCAD en todo caso extremo»: significa que no hay " +
      "un límite conocido que quien porte una rutina necesite saber de antemano.",
    limite:
      "Existe y funciona, con una frontera ESCRITA que cambia un resultado y hay que conocer " +
      "antes de portar la rutina, no después de imprimir el plano.",
    todaviaNo:
      "Existe en la tabla y se NIEGA nombrando qué falta y por qué. No es «nunca»: es lo que " +
      "hoy no está. Un «no function definition» no distingue entre una errata y una carencia; " +
      "esto sí.",
  },
  recuento: {
    total: funciones.length,
    implementada: porEstado("implementada").length,
    limite: porEstado("limite").length,
    todaviaNo: porEstado("todaviaNo").length,
    nucleo: funciones.filter((entrada) => entrada.tabla === "nucleo").length,
    cad: funciones.filter((entrada) => entrada.tabla === "cad").length,
    constantes: funciones.filter((entrada) => entrada.clase === "constante").length,
    extensionesDelProducto: funciones.filter((entrada) => entrada.origen === "valle").length,
  },
  funciones,
};

interface MatrizPublicada {
  recuento: Record<string, number>;
  funciones: EntradaCobertura[];
}

const serializado = `${JSON.stringify(matriz, null, 2)}\n`;

if (process.argv.includes("--update")) {
  fs.writeFileSync(rutaMatriz, serializado, "utf8");
  console.log(`cobertura: matriz reescrita en ${path.relative(raiz, rutaMatriz)}`);
}

{
  ok(fs.existsSync(rutaMatriz), `falta la matriz publicada en ${path.relative(raiz, rutaMatriz)}`);
  const enDisco = JSON.parse(fs.readFileSync(rutaMatriz, "utf8")) as MatrizPublicada;
  const publicadas = new Set(enDisco.funciones.map((entrada) => entrada.nombre));
  const vivas = new Set(funciones.map((entrada) => entrada.nombre));

  const sinClasificar = funciones
    .filter((entrada) => !publicadas.has(entrada.nombre))
    .map((entrada) => entrada.nombre);
  eq(
    sinClasificar,
    [],
    `hay funciones en la tabla que la matriz publicada no clasifica: ${sinClasificar.join(", ")}. ` +
      `Clasifíquelas y regenere con --update.`,
  );

  const fantasmas = enDisco.funciones
    .filter((entrada) => !vivas.has(entrada.nombre))
    .map((entrada) => entrada.nombre);
  eq(
    fantasmas,
    [],
    `la matriz publicada promete funciones que ya no están en la tabla: ${fantasmas.join(", ")}.`,
  );

  // Y el fichero entero, byte a byte: los límites, los motivos y el recuento
  // también envejecen, no sólo la lista de nombres.
  eq(
    fs.readFileSync(rutaMatriz, "utf8"),
    serializado,
    "la matriz publicada no coincide con la tabla viva (límites, motivos o recuento). " +
      "Regenere con: cd apps/web && npx tsx src/lib/lisp/cobertura.spec.ts --update",
  );
}

// Ninguna función puede estar en dos columnas a la vez.
{
  const declinadasConLimite = [...fueraDeAlcance.keys()].filter((nombre) => LIMITES.has(nombre));
  eq(
    declinadasConLimite,
    [],
    `estas funciones están declaradas fuera de alcance Y con límite: ${declinadasConLimite.join(", ")}`,
  );
  const limitesHuerfanos = [...LIMITES.keys()].filter((nombre) => !CAD_LISP_BUILTINS.has(nombre));
  eq(
    limitesHuerfanos,
    [],
    `hay límites declarados para funciones que no existen en la tabla: ${limitesHuerfanos.join(", ")}`,
  );
  const declinadasHuerfanas = [...fueraDeAlcance.keys()].filter(
    (nombre) => !CAD_LISP_BUILTINS.has(nombre),
  );
  eq(
    declinadasHuerfanas,
    [],
    `hay negativas declaradas para funciones que no existen en la tabla: ${declinadasHuerfanas.join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// 3. Bancos de ejecución
// ---------------------------------------------------------------------------

const ENTIDADES: CadEntity[] = [
  { id: "l1", type: "line", layer: "0", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
  { id: "c1", type: "circle", layer: "MUROS", center: { x: 500, y: 0 }, radius: 50 },
  { id: "t1", type: "text", layer: "0", x: 0, y: 200, text: "PLANO", height: 10 },
] as unknown as CadEntity[];

function seed(entities: CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "muros", name: "MUROS", color: "#ff0000", visible: true, locked: false },
      { id: "ejes", name: "EJES", color: "#00ffff", visible: true, locked: false },
      { id: "textos", name: "TEXTOS", color: "#ffff00", visible: true, locked: false },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument;
}

interface Corrida {
  ok: boolean;
  text: string;
  host: CadDocumentLispHost;
}

function correr(
  source: string,
  entities: CadEntity[] = ENTIDADES,
  answers: LispResponse[] = [],
): Corrida {
  let serial = 0;
  const host = new CadDocumentLispHost(seed(entities), {
    activeLayer: "0",
    newEntityId: () => {
      serial += 1;
      return `nuevo-${serial}`;
    },
  });
  const result = new LispSession({ builtins: CAD_LISP_BUILTINS, host }).run(
    source,
    new ScriptedResponder(answers),
  );
  return { ok: result.ok, text: result.ok ? printLisp(result.value) : result.failure.message, host };
}

/** Evalúa con dibujo y devuelve lo impreso (o el mensaje del fallo). */
function dibujo(source: string, answers: LispResponse[] = []): string {
  return correr(source, ENTIDADES, answers).text;
}

/** Respuesta del anfitrión a una designación: la lista de nombres designados. */
function designa(...ids: string[]): LispResponse {
  return { kind: "value", value: list(ids.map((id) => ename(id))) as LispValue };
}

// ---------------------------------------------------------------------------
// 4. La columna «todavía no», comprobada llamándola una por una
// ---------------------------------------------------------------------------
{
  for (const entrada of LISP_FUERA_DE_ALCANCE) {
    const nucleo = new LispSession({ builtins: CORE_LISP_BUILTINS }).run(
      `(${entrada.nombre})`,
      new ScriptedResponder([]),
    );
    ok(
      !nucleo.ok,
      `${entrada.nombre} está declarada fuera de alcance y NO falló al llamarla: una negativa ` +
        `que no se niega es un éxito sin efecto.`,
    );
    const texto = nucleo.ok ? printLisp(nucleo.value) : nucleo.failure.message;
    contains(
      texto,
      "no está disponible en esta versión",
      `${entrada.nombre} tiene que decir que no está disponible`,
    );
    contains(
      texto,
      entrada.motivo,
      `${entrada.nombre} tiene que dar EL MISMO motivo que publica la matriz`,
    );
  }
  ok(
    LISP_FUERA_DE_ALCANCE.length === porEstado("todaviaNo").length,
    "la frontera declarada y la columna «todavía no» de la matriz tienen que ser la misma lista",
  );
}

// ---------------------------------------------------------------------------
// 5. Los límites, PROVOCADOS
// ---------------------------------------------------------------------------
{
  // La variable que no está en la tabla del producto: mismo mensaje al leer y
  // al escribir, a propósito.
  contains(
    dibujo('(setvar "NOEXISTE" 1)'),
    "no existe en este producto",
    "setvar rechaza la variable que no está en la tabla",
  );
  contains(
    dibujo('(getvar "NOEXISTE")'),
    "no existe en este producto",
    "getvar rechaza con el mismo mensaje que setvar",
  );
  // Y la de sólo lectura se niega en vez de aceptar y no aplicar.
  contains(
    dibujo('(setvar "AREA" 10.0)'),
    "sólo lectura",
    "setvar rechaza escribir una variable de sólo lectura",
  );

  // La tabla de símbolos que no es LAYER.
  contains(
    dibujo('(tblsearch "BLOCK" "CAJETIN")'),
    "sólo está implementada la tabla LAYER",
    "tblsearch nombra la tabla pedida en vez de contestar una lista aproximada",
  );
  contains(
    dibujo('(tblnext "STYLE" T)'),
    "sólo está implementada la tabla LAYER",
    "tblnext declara el mismo límite que tblsearch",
  );

  // `trans` entre dos sistemas: se rechaza en vez de devolver el punto tal cual.
  contains(
    dibujo("(trans '(0 0 0) 0 1)"),
    "sólo se admite la identidad",
    "trans se niega entre sistemas distintos en vez de mentir",
  );
  eq(dibujo("(trans '(1 2 0) 0 0)"), "(1.0 2.0 0.0)", "trans entre iguales sí transforma");

  // El entorno del sistema operativo, que aquí no existe.
  eq(dibujo('(getenv "PATH")'), "nil", "getenv contesta nil en vez de inventar una ruta");

  // El tipo que `entmake` no construye entero, con la lista de los que sí.
  {
    const texto = dibujo('(entmake (list (cons 0 "HATCH") (cons 8 "0")))');
    contains(texto, "entmake no sabe construir HATCH", "entmake nombra el tipo que rechaza");
    contains(texto, ENTMAKE_SUPPORTED[0], "y enumera los tipos que sí construye");
  }

  // El modo de `ssget` que no está.
  contains(
    dibujo('(ssget "F" (list (list 0 0) (list 10 10)))'),
    'el modo "F" no está implementado',
    "ssget nombra el modo que no existe en vez de designar otra cosa",
  );

  // El punto de `entsel`: el CENTRO del contorno, no el clic. La línea va de
  // (0 0) a (100 0), así que su centro es (50 0) — y es lo que hay que saber
  // antes de portar un TRIM.
  eq(
    dibujo("(cadr (entsel))", [designa("l1")]),
    "(50.0 0.0 0.0)",
    "entsel devuelve el centro del contorno, que es su límite declarado",
  );

  // El área no se escribe: es el resultado de la geometría.
  contains(
    dibujo('(vla-put-Area (vlax-ename->vla-object (ssname (ssget "X") 1)) 5.0)'),
    "el área es el RESULTADO de la geometría",
    "vla-put-Area se niega con el motivo que publica la matriz",
  );

  // La tabla de símbolos no se escribe por `entmod`: la ruta es `-LAYER`.
  contains(
    dibujo('(entmod (entget (tblobjname "LAYER" "MUROS")))'),
    "-LAYER",
    "entmod nombra la única ruta que produce comandos canónicos de capa",
  );

  // Los dos no-op honestos: no prometen COM, prometen no matar la rutina.
  eq(dibujo("(vl-load-com)"), "nil", "vl-load-com es un no-op que devuelve nil");
  eq(
    dibujo("(vlax-safearray->list (vlax-variant-value '(1.0 2.0 0.0)))"),
    "(1.0 2.0 0.0)",
    "vlax-variant-value y vlax-safearray->list son la identidad",
  );
}

// ---------------------------------------------------------------------------
// 6. Los documentos: ninguna cifra suelta, ningún enlace muerto
// ---------------------------------------------------------------------------

/**
 * Una cifra escrita en un `.md` es un defecto aunque hoy coincida (regla 4).
 * La comprobación es mecánica: fuera de los bloques de código no puede quedar
 * un dígito, salvo los que no son un recuento —una fecha de bitácora, la
 * versión del manifiesto, «2D»/«3D» y la referencia a un ADR—.
 *
 * Los tramos de código en línea quedan exentos porque ahí viven nombres del
 * lenguaje que llevan dígitos (`vlax-3d-point`, `1+`, `(-4 . "<OR")`), pero se
 * comprueba aparte que ninguno de ellos sea un NÚMERO A SECAS: escribir
 * `` `258` `` no puede ser la forma de saltarse la regla.
 */
function cifrasSueltas(markdown: string): string[] {
  const sinBloques = markdown.replace(/```[\s\S]*?```/g, " ");
  const sinCodigo = sinBloques.replace(/`[^`\n]*`/g, " ");
  const sinPermitidos = sinCodigo
    // El número de una lista ordenada de Markdown, que es tipografía y no dato.
    .replace(/^[ \t]*\d+\.[ \t]/gm, " ")
    // Fechas de bitácora: 2026-09-04.
    .replace(/\d{4}-\d{2}-\d{2}/g, " ")
    // Referencias a decisiones de arquitectura: ADR-0016.
    .replace(/ADR-\d{4}/g, " ")
    // La versión del manifiesto de plugins y la de la API pública.
    .replace(/\bv1\b/g, " ")
    // Dos y tres dimensiones, que son el dominio y no un recuento.
    .replace(/\b[23]D\b/g, " ");
  const encontradas: string[] = [];
  for (const match of sinPermitidos.matchAll(/\S*\d\S*/g)) encontradas.push(match[0]);
  return encontradas;
}

function tramosDeCodigo(markdown: string): string[] {
  const sinBloques = markdown.replace(/```[\s\S]*?```/g, " ");
  return [...sinBloques.matchAll(/`([^`\n]*)`/g)].map((match) => match[1]);
}

for (const ruta of [rutaGuia, rutaPuente]) {
  const nombre = path.relative(raiz, ruta);
  ok(fs.existsSync(ruta), `falta el documento ${nombre}`);
  const markdown = fs.readFileSync(ruta, "utf8");

  const sueltas = cifrasSueltas(markdown);
  eq(
    sueltas,
    [],
    `${nombre} escribe cifras en la prosa (${sueltas.join(", ")}). Las cifras viven en ` +
      `docs/api/autolisp-cobertura.json y el documento ENLAZA; ninguna cifra vive en dos lugares.`,
  );

  const numerosDisfrazados = tramosDeCodigo(markdown).filter((tramo) =>
    /^[\s\d.,%]+$/.test(tramo),
  );
  eq(
    numerosDisfrazados,
    [],
    `${nombre} mete cifras en tramos de código para saltarse la regla: ${numerosDisfrazados.join(", ")}`,
  );

  // Ningún enlace muerto: toda ruta del repositorio que el documento cite tiene
  // que existir. Un documento de extensibilidad que apunta a un módulo que se
  // movió es peor que no apuntar a nada.
  const rutas = [...markdown.matchAll(/`((?:apps|docs|packages|scripts)\/[\w./-]+)`/g)].map(
    (match) => match[1],
  );
  ok(rutas.length > 0, `${nombre} no cita ni un solo archivo del repositorio`);
  const muertas = rutas.filter((relativa) => !fs.existsSync(path.join(raiz, relativa)));
  eq(muertas, [], `${nombre} cita rutas que no existen: ${muertas.join(", ")}`);
}

// La guía tiene que ENLAZAR la matriz, que es donde viven las cifras.
{
  const guia = fs.readFileSync(rutaGuia, "utf8");
  contains(guia, "autolisp-cobertura.json", "la guía enlaza la matriz generada");
  contains(guia, "PUENTE-DOTNET-VBA.md", "la guía enlaza el documento del puente que no habrá");
}

// ---------------------------------------------------------------------------
// 7. El LISP que publica el documento del puente SE EJECUTA
// ---------------------------------------------------------------------------

/**
 * La migración que el documento propone no puede ser una promesa tipográfica.
 * Cada bloque marcado con `<!-- se-ejecuta: nombre -->` se extrae del `.md` y
 * se corre aquí contra un dibujo sembrado: si alguien edita el ejemplo y lo
 * rompe, este spec se pone rojo. Es la diferencia entre publicar un camino de
 * salida y publicar una captura de pantalla de un camino de salida.
 */
function bloqueEjecutable(markdown: string, nombre: string): string {
  const patron = new RegExp(
    `<!--\\s*se-ejecuta:\\s*${nombre}\\s*-->\\s*\`\`\`lisp\\n([\\s\\S]*?)\`\`\``,
  );
  const match = patron.exec(markdown);
  assert.ok(match, `el documento del puente no trae el bloque ejecutable «${nombre}»`);
  checks += 1;
  return match[1];
}

{
  const puente = fs.readFileSync(rutaPuente, "utf8");
  const fuente = bloqueEjecutable(puente, "migracion-vba");
  const corrida = correr(`${fuente}\n(c:marca)`, []);
  ok(corrida.ok, `la traducción publicada del macro VBA falló: ${corrida.text}`);

  const documento = corrida.host.document();
  const circulo = documento.entities.find((entidad) => entidad.type === "circle");
  ok(circulo !== undefined, "la traducción publicada tiene que dejar el círculo dibujado");
  eq(circulo?.layer, "EJES", "y en la capa que pide el macro original");
  eq(
    (circulo as unknown as { radius: number } | undefined)?.radius,
    25,
    "con el radio que el macro original le daba",
  );
  const rotulo = documento.entities.find((entidad) => entidad.type === "mtext");
  ok(rotulo !== undefined, "y el rótulo que el macro escribía al lado");
  eq(rotulo?.layer, "TEXTOS", "en su capa");
}

// ---------------------------------------------------------------------------
// 8. La política pública describe el manifiesto que el código EXIGE HOY
// ---------------------------------------------------------------------------

/**
 * `POLITICA-API-PUBLICA.md` declara el manifiesto de plugins «formato estable
 * v1», y una declaración de estabilidad que describe una forma que el registro
 * ya no acepta es peor que no declarar nada: el desarrollador escribe el
 * objeto que el documento le enseña y `register` se lo rechaza.
 *
 * Pasó de verdad. El documento se escribió antes de que el manifiesto ganara
 * `manifiesto` y `permisos` —los dos campos obligatorios que convierten el
 * permiso en permiso— y siguió publicando la forma vieja. Este bloque cierra
 * esa puerta por el único camino que no envejece: la lista de permisos no se
 * teclea aquí, se DERIVA de `PLUGIN_PERMISSIONS`, así que un quinto permiso
 * pone rojo el gate hasta que la política lo nombre.
 */
{
  const politica = fs.readFileSync(rutaPolitica, "utf8");
  contains(politica, "`manifiesto`", "la política nombra el campo obligatorio `manifiesto`");
  contains(politica, "`permisos`", "la política nombra el campo obligatorio `permisos`");
  for (const permiso of PLUGIN_PERMISSIONS) {
    contains(politica, permiso, `la política nombra el permiso «${permiso}»`);
  }
  eq(
    politica.includes("`{ id, name, version, commands?, panels? }`"),
    false,
    "la política ya no publica la forma vieja del manifiesto, que el registro rechaza",
  );
  contains(
    politica,
    "documento:escritura",
    "y nombra el permiso sin el cual un comando de plugin no dibuja",
  );
}

console.log(
  `cobertura: ${checks} aserciones verdes. Matriz GENERADA de CAD_LISP_BUILTINS en caliente y ` +
    `comparada byte a byte con docs/api/autolisp-cobertura.json — ` +
    `${matriz.recuento.total} entradas: ${matriz.recuento.implementada} implementadas, ` +
    `${matriz.recuento.limite} con límite declarado y ${matriz.recuento.todaviaNo} «todavía no» ` +
    `(${matriz.recuento.nucleo} en el núcleo, ${matriz.recuento.cad} en la tabla CAD). ` +
    `Las «todavía no» se comprueban LLAMÁNDOLAS una por una y cada una repite el motivo que ` +
    `publica la matriz; los límites se provocan (variable fuera de tabla, tabla de símbolos que ` +
    `no es LAYER, trans entre sistemas, entmake de un HATCH, área de sólo lectura, modo de ssget ` +
    `inexistente, punto de entsel en el centro del contorno). Los dos documentos no escriben ` +
    `ninguna cifra en su prosa y no citan ninguna ruta muerta, y la traducción del macro VBA que ` +
    `publica el puente se EJECUTA aquí y deja su círculo en EJES.`,
);
