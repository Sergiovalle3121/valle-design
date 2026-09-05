/**
 * Los builtins que faltaban para que una rutina ajena CARGUE y DESIGNE.
 *
 * ## Qué se decide aquí
 *
 * La entrega anterior arregló el prólogo: `getvar`/`setvar` hablan con la tabla
 * de variables del producto, así que `(setvar "CMDECHO" 0)` dejó de matar la
 * rutina en su línea 2. Pero el prólogo de verdad no escribe `(setvar "OSMODE"
 * 0)`: escribe `(setvar "OSMODE" (logand (getvar "OSMODE") (~ 33)))`, porque un
 * dibujante no apaga las referencias del compañero, apaga las suyas. Y sin
 * `logand`, sin `~` y sin `vl-load-com` la rutina moría igual, dos renglones
 * más abajo.
 *
 * Lo primero que exige esta spec es eso: una rutina de despacho COMPLETA
 * —`vl-load-com`, prólogo con máscara de bits, comprobar la capa, crearla,
 * ponerla actual, dibujar y devolverlo todo a su sitio— corre entera y deja el
 * rectángulo EN SU CAPA.
 *
 * ## Lo segundo: cada función con su valor, no con un «no falló»
 *
 * Todas las aserciones fijan un resultado concreto. La diferencia importa: una
 * propiedad como «`vl-string-position` encuentra la coma» la cumple igual una
 * implementación que cuente desde 0 que una que cuente desde 1, y esa
 * diferencia es una lista de capas partida por el sitio equivocado.
 *
 * ## Lo tercero: lo que NO entra, dicho con su motivo
 *
 * `nentsel`, `getfiled` y la E/S de ficheros existen en la tabla y lanzan
 * diciendo qué falta y por qué. Es la única de las tres formas de fallar que
 * sirve para algo: «no function definition» no dice si es que se escribe
 * distinto, y devolver algo plausible —el INSERT entero en vez de la entidad
 * anidada— deja a la rutina procesando el objeto equivocado hasta el plano
 * impreso.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad/cad-document";
import { CAD_LISP_BUILTINS } from "./cad-builtins";
import { CORE_LISP_BUILTINS } from "./core-builtins";
import { CadDocumentLispHost } from "./document-host";
import { printLisp } from "./printer";
import { LispSession, ScriptedResponder } from "./session";
import { ename, list, type LispResponse, type LispValue } from "./values";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

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

// ---------------------------------------------------------------------------
// Bancos
// ---------------------------------------------------------------------------

/** Evalúa con la tabla del NÚCLEO: sin documento y sin editor. */
function core(source: string): string {
  return new LispSession({ builtins: CORE_LISP_BUILTINS }).evaluateToText(source);
}
function nucleo(source: string, expected: string, message: string): void {
  eq(core(source), expected, `${message} — ${source}`);
}

const ENTIDADES: CadEntity[] = [
  { id: "l1", type: "line", layer: "0", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
  { id: "c1", type: "circle", layer: "MUROS", center: { x: 500, y: 0 }, radius: 50 },
  { id: "t1", type: "text", layer: "0", x: 0, y: 200, text: "PLANO", height: 10 },
] as unknown as CadEntity[];

function seed(entities: CadEntity[] = []): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      // Apagada, bloqueada y congelada a la vez: las tres banderas por separado
      // son lo que distingue el código 70 del 62 en el registro de capa.
      { id: "muros", name: "MUROS", color: "#ff0000", visible: false, locked: true, frozen: true },
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

function correr(source: string, entities: CadEntity[] = [], answers: LispResponse[] = []): Corrida {
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
  return {
    ok: result.ok,
    text: result.ok ? printLisp(result.value) : result.failure.message,
    host,
  };
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
// 1. La rutina de despacho que el informe de distancia midió morir en la línea 2
// ---------------------------------------------------------------------------
{
  const rutina = `
(defun c:tabique (/ eco modos)
  (vl-load-com)
  (setq eco (getvar "CMDECHO"))
  (setq modos (getvar "OSMODE"))
  (setvar "CMDECHO" 0)
  ;; Apaga PUNfin (1) e INTersección (32) SIN tocar los demás, que es lo que
  ;; escribe una rutina de verdad. Necesita logand y ~.
  (setvar "OSMODE" (logand (getvar "OSMODE") (~ 33)))
  (if (not (tblsearch "LAYER" "TABIQUE"))
    (command "-LAYER" "N" "TABIQUE" ""))
  (setvar "CLAYER" "TABIQUE")
  (command "RECTANG" (list 0 0) (list 3000 1500))
  (setvar "CLAYER" "0")
  (setvar "OSMODE" modos)
  (setvar "CMDECHO" eco)
  (princ))
(setvar "OSMODE" 39)
(c:tabique)
`;
  const corrida = correr(rutina);
  ok(corrida.ok, `la rutina de despacho debería correr entera: ${corrida.text}`);

  const documento = corrida.host.document();
  const capa = documento.layers.find((layer) => layer.name === "TABIQUE");
  ok(capa, "el (command \"-LAYER\" \"N\" …) creó la capa de verdad");
  const dibujado = documento.entities.filter((entity) => entity.layer === "TABIQUE");
  eq(dibujado.length, 1, "y el RECTANG dejó UNA entidad");
  eq(dibujado[0]?.type, "polyline", "que es la polilínea cerrada del rectángulo");
  // El epílogo devolvió las variables a su sitio: 39 = 1|2|4|32, y la rutina
  // apagó 1 y 32 durante su trabajo. Que vuelva a valer 39 es la prueba de que
  // el prólogo Y el epílogo se ejecutaron los dos.
  eq(corrida.host.variables().get("OSMODE"), 39, "el epílogo restauró OSMODE");
  eq(corrida.host.variables().get("CLAYER"), "0", "y devolvió la capa activa");
  eq(
    [...corrida.host.appliedLabels],
    ["LISP -LAYER", "LISP RECTANG"],
    "dos aplicaciones, las dos por la ruta canónica del motor",
  );
}

// ---------------------------------------------------------------------------
// 2. Las cadenas: la familia vl-string-*
// ---------------------------------------------------------------------------
{
  nucleo('(vl-string->list "AB")', "(65 66)", "vl-string->list devuelve CÓDIGOS");
  nucleo('(vl-list->string (vl-string->list "AB"))', '"AB"', "y es el inverso exacto del que ya estaba");
  nucleo('(vl-string-left-trim " " "  hola  ")', '"hola  "', "left-trim recorta sólo por la izquierda");
  nucleo('(vl-string-right-trim " " "  hola  ")', '"  hola"', "right-trim sólo por la derecha");
  nucleo('(vl-string-left-trim "ab" "banana")', '"nana"', "el segundo argumento es un CONJUNTO de caracteres");
  nucleo('(vl-string-trim "ab" "banana")', '"nan"', "y la de los dos lados usa la misma cuenta");
  nucleo('(vl-string-position 44 "a,b,c")', "1", "vl-string-position toma un CÓDIGO y cuenta desde 0");
  nucleo('(vl-string-position 44 "a,b,c" 2)', "3", "con arranque, busca a partir de ahí");
  nucleo('(vl-string-position 44 "a,b,c" 0 T)', "3", "y desde el final da la ÚLTIMA");
  nucleo('(vl-string-position 88 "abc")', "nil", "sin coincidencia, nil");
  nucleo('(vl-string-elt "abc" 1)', "98", "vl-string-elt cuenta desde 0 y devuelve el código");
  contains(
    core('(vl-string-elt "abc" 9)'),
    "se sale de una cadena de 3 caracteres",
    "y fuera de rango es un error, no nil",
  );
  nucleo(
    '(vl-string-mismatch "MUROS-CARGA" "MUROS-TABIQUE")',
    "6",
    "vl-string-mismatch cuenta CUÁNTOS coinciden desde el arranque",
  );
  nucleo('(vl-string-mismatch "abc" "ABC")', "0", "y distingue mayúsculas salvo que se le diga");
  nucleo('(vl-string-mismatch "abc" "ABC" 0 0 T)', "3", "con el quinto argumento, no");
}

// ---------------------------------------------------------------------------
// 3. Las listas
// ---------------------------------------------------------------------------
{
  nucleo("(vl-list* 1 2 '(3 4))", "(1 2 3 4)", "vl-list*: el último argumento es la COLA");
  nucleo("(vl-list* 1 2)", "(1 . 2)", "y con dos átomos sale un par punteado");
  nucleo("(vl-remove-if-not 'numberp '(1 \"a\" 2))", "(1 2)", "vl-remove-if-not conserva los que cumplen");
  nucleo("(vl-member-if 'numberp '(\"a\" 1 2))", "(1 2)", "vl-member-if devuelve la COLA desde el primero que cumple");
  nucleo("(vl-member-if 'null '(1 2))", "nil", "y nil si no cumple ninguno");
  nucleo("(vl-member-if-not 'numberp '(1 2 \"a\" 3))", '("a" 3)', "vl-member-if-not, desde el primero que no cumple");
  nucleo("(vl-sort-i '(30 10 20) '<)", "(1 2 0)", "vl-sort-i devuelve los ÍNDICES ordenados, no los elementos");
  nucleo(
    "(vl-sort-i '(10 10) '<)",
    "(0 1)",
    "y conserva el orden de entrada de los empatados: con ellos se reordena otra lista en paralelo",
  );
  nucleo(
    "(mapcar '(lambda (i) (nth i '(\"C\" \"A\" \"B\"))) (vl-sort-i '(3 1 2) '<))",
    '("A" "B" "C")',
    "que es exactamente para lo que sirven: reordenar la lista paralela",
  );
}

// ---------------------------------------------------------------------------
// 4. La aritmética bit a bit de las máscaras de OSMODE
// ---------------------------------------------------------------------------
{
  nucleo("(logand 12 5)", "4", "logand");
  nucleo("(logior 12 5)", "13", "logior");
  nucleo("(logand 12 5 4)", "4", "y encadenan con más de dos");
  nucleo("(~ 33)", "-34", "~ es el complemento a uno");
  nucleo("(logand 39 (~ 33))", "6", "la máscara del prólogo: de 39 quedan PUNmedio y CENtro");
  nucleo("(logior 6 512)", "518", "y logior enciende CERcano sin tocar lo demás");
  nucleo("(lsh 1 4)", "16", "lsh desplaza a la izquierda");
  nucleo("(lsh 16 -2)", "4", "y a la derecha con la cuenta negativa");
  nucleo("(lsh 1 31)", "-2147483648", "trabaja en 32 bits CON SIGNO, como AutoLISP");
  nucleo("(lsh 1 32)", "0", "y un desplazamiento de 32 vacía el entero (JavaScript solo daría 1)");
  nucleo("(boole 1 12 5)", "4", "boole 1 es Y");
  nucleo("(boole 6 12 5)", "9", "boole 6 es O exclusiva");
  nucleo("(boole 7 12 5)", "13", "boole 7 es O");
  nucleo("(boole 8 12 5)", "-14", "boole 8 es NI");
  nucleo("(boole 4 12 5)", "1", "y las otras doce funciones también existen: 4 es «b y no a»");
  contains(core("(boole 99 1 1)"), "va de 0 a 15", "una función fuera de la tabla de verdad se rechaza");
}

// ---------------------------------------------------------------------------
// 5. vl-load-com, los símbolos y los nombres de fichero
// ---------------------------------------------------------------------------
{
  nucleo("(vl-load-com)", "nil", "vl-load-com devuelve nil, que es lo que hace el AutoCAD de hoy");
  nucleo("(vl-symbol-name 'muros)", '"MUROS"', "vl-symbol-name (los símbolos se internan en mayúsculas)");
  nucleo("(progn (setq vd:escala 50) (vl-symbol-value 'vd:escala))", "50", "vl-symbol-value lee el valor global");
  nucleo("(vl-symbol-value 'no-existe)", "nil", "y un símbolo sin valor es nil, que es la comprobación misma");
  nucleo('(vl-filename-base "c:\\\\planos\\\\casa.dwg")', '"casa"', "vl-filename-base con barras de Windows");
  nucleo('(vl-filename-directory "c:\\\\planos\\\\casa.dwg")', '"c:\\\\planos"', "vl-filename-directory, sin barra final");
  nucleo('(vl-filename-extension "c:\\\\planos\\\\casa.dwg")', '".dwg"', "vl-filename-extension, CON el punto");
  nucleo('(vl-filename-base "/home/dib/plano.v2.lsp")', '"plano.v2"', "y con barras de Unix, y sólo la última extensión");
  nucleo('(vl-filename-directory "casa.dwg")', "nil", "sin carpeta, nil (no la cadena vacía)");
  nucleo('(vl-filename-extension "casa")', "nil", "sin extensión, nil");
}

// ---------------------------------------------------------------------------
// 6. entsel: el par (nombre punto), y su nombre sirve para entget
// ---------------------------------------------------------------------------
{
  const corrida = correr(
    '(setq par (entsel "\\nDesigne el muro"))',
    ENTIDADES,
    [designa("l1")],
  );
  ok(corrida.ok, `entsel debería devolver el par: ${corrida.text}`);
  eq(corrida.text, "(<Entity name: l1> (50.0 0.0 0.0))", "el par es (nombre punto), con el CENTRO del contorno");

  // Lo que hace útil el par: el car va a entget y la rutina lee la entidad.
  eq(
    dibujo('(cdr (assoc 0 (entget (car (entsel)))))', [designa("l1")]),
    '"LINE"',
    "el car de entsel es un nombre de entidad válido para entget",
  );
  eq(
    dibujo('(cdr (assoc 8 (entget (car (entsel)))))', [designa("c1")]),
    '"MUROS"',
    "y sirve para leer la capa de lo designado",
  );
  eq(dibujo("(cadr (entsel))", [designa("c1")]), "(500.0 0.0 0.0)", "el punto de un círculo es su centro");
  eq(dibujo("(entsel)"), "nil", "un Esc devuelve nil, que es lo que comprueba (if (setq e (entsel)) …)");
  contains(
    dibujo("(entsel)", [designa("fantasma")]),
    "ya no está en el dibujo",
    "y designar algo que ya no existe se dice, en vez de devolver un nombre muerto",
  );
}

// ---------------------------------------------------------------------------
// 7. osnap: el motor de captura del producto, conducido desde la rutina
// ---------------------------------------------------------------------------
{
  eq(dibujo('(osnap (list 90 5) "end")'), "(100.0 0.0 0.0)", "osnap end engancha al extremo de la línea");
  eq(dibujo('(osnap (list 90 5) "_end")'), "(100.0 0.0 0.0)", "y el guion bajo de las rutinas publicadas se ignora");
  eq(dibujo('(osnap (list 40 5) "mid")'), "(50.0 0.0 0.0)", "mid, al punto medio");
  eq(dibujo('(osnap (list 480 10) "cen")'), "(500.0 0.0 0.0)", "cen, al centro del círculo");
  eq(dibujo('(osnap (list 10 10) "per")'), "(10.0 0.0 0.0)", "per, al pie de la perpendicular desde el punto dado");
  // Con dos modos gana el MÁS CERCANO, no la prioridad del editor: sin apertura,
  // la prioridad devolvería el extremo de una línea que está al otro lado del
  // plano. Las dos aserciones son la misma llamada desde dos sitios distintos.
  eq(dibujo('(osnap (list 90 5) "cen,end")'), "(100.0 0.0 0.0)", "cerca de la línea gana su extremo");
  eq(dibujo('(osnap (list 480 10) "cen,end")'), "(500.0 0.0 0.0)", "y cerca del círculo, su centro");
  // Lo que NO se enciende solo: el motor entiende «no dicho» como «encendido»,
  // y esta aserción es la que impide que vuelva a colarse.
  eq(
    correr('(osnap (list 40 5) "cen")', [ENTIDADES[2]]).text,
    "nil",
    "pidiendo sólo cen en un dibujo sin círculos, nil: los demás modos NO se encienden solos",
  );
  eq(
    correr('(osnap (list 40 5) "qua")', [ENTIDADES[0]]).text,
    "nil",
    "ni el cuadrante aparece porque haya una línea cerca",
  );
  // DIVERGENCIA DECLARADA: el adaptador de LINE del producto publica su punto
  // medio como enganche de clase «center», así que «cen» sobre una línea
  // contesta su punto medio y AutoCAD no lo haría. Se fija aquí a propósito: es
  // lo que engancha el ratón hoy, y la corrección del adaptador —fuera de este
  // territorio— está escrita como P-ext-02. El día que se aplique, esta
  // aserción falla en voz alta, que es justo lo que se quiere.
  eq(
    correr('(osnap (list 40 5) "cen")', [ENTIDADES[0]]).text,
    "(50.0 0.0 0.0)",
    "«cen» sobre una línea da su punto medio: divergencia heredada del adaptador, no de este módulo",
  );
  contains(dibujo('(osnap (list 0 0) "zzz")'), "no es un modo de referencia a objetos", "un modo inventado se rechaza");
  contains(dibujo('(osnap (list 0 0) "")'), "no ha decidido a qué quiere engancharse", "y la cadena vacía también");
}

// ---------------------------------------------------------------------------
// 8. textbox: la caja de un rótulo, medida con el medidor que dibuja
// ---------------------------------------------------------------------------
{
  const caja = dibujo('(textbox (entget (car (entsel))))', [designa("t1")]);
  contains(caja, "(0.0 0.0 0.0)", "la caja arranca en el punto de inserción");
  const ancho = Number.parseFloat(caja.split(") (")[1]?.split(" ")[0] ?? "0");
  ok(ancho > 10 && ancho < 60, `«PLANO» a altura 10 mide ${ancho}: entre una eme y cinco íes`);
  eq(
    dibujo('(cadr (textbox (list (cons 1 "PLANO") (cons 40 10.0))))'),
    dibujo('(cadr (textbox (entget (car (entsel)))))', [designa("t1")]),
    "mide lo mismo con la lista escrita a mano que con la de entget: es el mismo medidor",
  );
  eq(dibujo('(textbox (list (cons 0 "LINE")))'), "nil", "y un dato sin texto devuelve nil, no una caja de cero");
}

// ---------------------------------------------------------------------------
// 9. Las tablas de símbolos: tblnext, tblobjname y el entget de una capa
// ---------------------------------------------------------------------------
{
  eq(
    dibujo('(cdr (assoc 2 (tblnext "LAYER" T)))'),
    '"0"',
    "tblnext con rebobinado empieza por la primera capa",
  );
  eq(
    dibujo('(progn (tblnext "LAYER" T) (cdr (assoc 2 (tblnext "LAYER"))))'),
    '"MUROS"',
    "y sin él avanza a la siguiente",
  );
  eq(
    dibujo('(progn (tblnext "LAYER" T) (tblnext "LAYER") (tblnext "LAYER"))'),
    "nil",
    "agotada la tabla devuelve nil, que es cómo termina el bucle",
  );
  eq(
    dibujo('(length (vl-remove nil (list (tblnext "LAYER" T) (tblnext "LAYER") (tblnext "LAYER"))))'),
    "2",
    "el recorrido completo enseña las dos capas del dibujo",
  );

  // El registro de capa: el código 70 dice CONGELADA y BLOQUEADA, y el 62
  // NEGATIVO dice apagada. Son tres estados distintos y hasta ahora el 70
  // mezclaba dos.
  eq(dibujo('(cdr (assoc 70 (tblsearch "LAYER" "MUROS")))'), "5", "70 = 1 congelada | 4 bloqueada");
  eq(dibujo('(cdr (assoc 70 (tblsearch "LAYER" "0")))'), "0", "y una capa libre no lleva ninguno");
  eq(dibujo('(cdr (assoc 62 (tblsearch "LAYER" "MUROS")))'), "-1", "62 negativo = apagada, con su índice ACI");
  eq(dibujo('(cdr (assoc 62 (tblsearch "LAYER" "0")))'), "7", "y encendida, el índice en positivo");

  // tblobjname devuelve un nombre que entget SABE leer. Devolver uno que no
  // supiera sería un valor bonito e inservible.
  eq(dibujo('(type (tblobjname "LAYER" "MUROS"))'), "ENAME", "tblobjname devuelve un nombre de entidad");
  eq(dibujo('(tblobjname "LAYER" "NO-EXISTE")'), "nil", "y nil si la capa no está");
  eq(
    dibujo('(cdr (assoc 2 (entget (tblobjname "LAYER" "MUROS"))))'),
    '"MUROS"',
    "el entget de ese nombre lee la capa como objeto",
  );
  eq(
    dibujo('(car (assoc -1 (entget (tblobjname "LAYER" "MUROS"))))'),
    "-1",
    "y viene encabezado por (-1 . <nombre>), como cualquier entget",
  );
  contains(
    dibujo('(entmod (entget (tblobjname "LAYER" "MUROS")))'),
    'con (command "-LAYER"',
    "entmod sobre una capa se niega DICIENDO por dónde se hace",
  );
  contains(
    dibujo('(entdel (tblobjname "LAYER" "MUROS"))'),
    "las tablas de símbolos no se modifican",
    "y entdel también",
  );
  contains(
    dibujo('(tblnext "BLOCK")'),
    "sólo está implementada la tabla LAYER",
    "las demás tablas se rechazan por su nombre en vez de contestar una lista aproximada",
  );
}

// ---------------------------------------------------------------------------
// 10. Lo que NO entra: existe, y lanza diciendo por qué
// ---------------------------------------------------------------------------
{
  const fuera: Array<[string, string]> = [
    ["(nentsel)", "la matriz de transformación del anidamiento"],
    ['(getfiled "Elija" "" "dwg" 0)', "el cuadro de archivos del sistema"],
    ['(open "c:/medicion.txt" "w")', "sin sistema de ficheros al que llegar"],
    ['(close 1)', "sin sistema de ficheros al que llegar"],
    ['(read-line 1)', "sin sistema de ficheros al que llegar"],
    ['(write-line "x" 1)', "sin sistema de ficheros al que llegar"],
    // El lado de APLICACIÓN del puente ActiveX. La entrada
    // `(vlax-ename->vla-object nil)` que estaba aquí se ha SUSTITUIDO: esa
    // función existe desde que se construyó el puente Visual LISP, y su
    // ausencia de esta lista es la prueba. Lo que sigue fuera es el objeto de
    // aplicación y lo que cuelga de él.
    ["(vlax-get-acad-object)", "ni Windows ni ese ejecutable"],
    ['(vlax-create-object "AutoCAD.Application")', "ni Windows ni ese ejecutable"],
    ["(vlax-invoke)", "ni Windows ni ese ejecutable"],
    ["(vlr-object-reactor)", "DENTRO del ciclo de edición"],
    ["(vlax-curve-getParamAtDist)", "parametrización interna"],
  ];
  for (const [source, razon] of fuera) {
    const text = core(source);
    contains(text, "no está disponible en esta versión", `${source} se declara fuera de alcance`);
    contains(text, razon, `${source} dice POR QUÉ`);
  }
  // Y las dos que SÍ están ahora, comprobadas por la puerta del dibujo: la
  // negativa de antes decía la verdad de entonces, y ésta dice la de ahora.
  // (El puente entero tiene su propia spec: `vlax-compat.spec.ts`.)
  eq(dibujo("(type (vlax-ename->vla-object (entnext)))"), "VLA-OBJECT", "el puente VLA existe");
  eq(
    dibujo("(vla-get-Layer (vlax-ename->vla-object (entnext)))"),
    '"0"',
    "y contesta con el documento detrás, no con un objeto COM fingido",
  );
  // Y la que sí entra aunque suene igual: `vl-load-com` no promete COM, promete
  // no matar en la línea 1 a la rutina que la copia por costumbre.
  nucleo("(vl-load-com)", "nil", "vl-load-com no se declara fuera de alcance: es un no-op honesto");
}

console.log(
  `builtins-faltantes: ${checks} aserciones verdes. Una rutina de despacho completa —vl-load-com, ` +
    `prólogo con máscara de bits sobre OSMODE, capa creada, RECTANG y epílogo— corre entera y deja ` +
    `el rectángulo en su capa. Con valor concreto: la familia vl-* de cadenas, símbolos y nombres ` +
    `de fichero; las listas (vl-list*, member-if, sort-i); la aritmética bit a bit; entsel con su ` +
    `par (nombre punto); osnap conduciendo el motor de captura del producto; textbox con el medidor ` +
    `que dibuja; y las tablas de símbolos con tblnext/tblobjname legibles por entget. LÍMITES ` +
    `DECLARADOS: el punto de entsel es el CENTRO del contorno, no el clic; osnap no tiene apertura ` +
    `porque no hay ventana, así que gana el más cercano; nentsel, getfiled, la E/S de ficheros y el ` +
    `lado de APLICACIÓN del puente ActiveX —con los reactores y la parametrización de curvas— ` +
    `lanzan diciendo qué falta y por qué, mientras que el puente de ENTIDADES sí existe.`,
);
