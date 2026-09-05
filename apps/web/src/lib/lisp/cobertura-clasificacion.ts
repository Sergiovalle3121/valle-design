/**
 * LA CLASIFICACIÓN DE COBERTURA DE AutoLISP: los tipos, los límites escritos
 * uno a uno y lo que queda fuera de alcance.
 *
 * Se separó de `cobertura.spec.ts` el 2026-09-05 porque el spec llegó a 802
 * líneas y `check:monolith-budget` corta en 800 para lo no presupuestado. El
 * gate dice «divídelo; no lo añadas al manifiesto salvo que exista una razón
 * escrita», y no hacía falta ninguna: el spec ya tenía sus secciones numeradas
 * y ésta era la 1, que es DATO —qué función tiene qué límite— y no aserción.
 * Lo que queda en el spec es lo que comprueba; lo que vive aquí es lo que
 * declara.
 */
import { LISP_FUERA_DE_ALCANCE } from "./builtins/unavailable";
import { VLA_PROPERTIES } from "./builtins/vlax-properties";
import { ENTMAKE_SUPPORTED } from "./dxf/to-entity";

// ---------------------------------------------------------------------------
// 1. La clasificación
// ---------------------------------------------------------------------------

export type EstadoCobertura = "implementada" | "limite" | "todaviaNo";

export interface EntradaCobertura {
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
export const LIMITES = new Map<string, string>();

export function limite(nombres: readonly string[], texto: string): void {
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
export const EXTENSIONES_DEL_PRODUCTO = new Set(["VD-AREAS", "VD-MUROS", "VD-CARPINTERIA"]);

export const fueraDeAlcance = new Map(
  LISP_FUERA_DE_ALCANCE.map((entrada) => [entrada.nombre.toUpperCase(), entrada]),
);

