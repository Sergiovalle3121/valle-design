/**
 * Las variables de sistema del producto, vistas desde una rutina `.lsp`.
 *
 * ## Qué se decide aquí
 *
 * El producto tenía una tabla de ~55 variables (`lib/cad/system-variables.ts`)
 * con sus comandos SETVAR y GETVAR, y el intérprete LISP la ignoraba: `getvar`
 * sólo sabía contestar CLAYER e INSUNITS y `setvar` lanzaba SIEMPRE. Eso no es
 * una carencia pequeña ni de las que se notan al final: el prólogo con el que
 * empieza media biblioteca de despacho —
 *
 *     (setq old (getvar "CMDECHO"))
 *     (setvar "CMDECHO" 0)
 *     … el trabajo …
 *     (setvar "CMDECHO" old)
 *
 * — moría en la LÍNEA 2, así que la rutina de un tercero no llegaba nunca a
 * dibujar. Lo primero que esta spec exige es exactamente eso: una rutina con
 * prólogo y epílogo completos corre hasta el final Y deja geometría.
 *
 * ## Lo segundo, que es lo que impide el arreglo a medias
 *
 * Que las tres reglas de la tabla sigan en pie: las de sólo lectura rechazan la
 * escritura como en AutoCAD, el rango y el enumerado se validan diciendo la
 * razón, y una variable que no está en la tabla sigue lanzando. Una tabla que
 * crece con lo que la rutina teclee no significa nada.
 *
 * ## Y lo tercero: el «éxito sin efecto» de `command`
 *
 * `runCommand` sólo aplicaba `result.kind === "document"`, así que `(command
 * "SETVAR" …)`, `(command "UNITS" …)`, COLOR, LTSCALE y LWEIGHT devolvían nil
 * sin configurar nada. Aquí se comprueba que ahora escriben en la tabla, que es
 * el efecto observable que la regla 2 de la casa exige.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity, CadLayerDef } from "../cad/cad-document";
import type { CadEntityCommand } from "../cad/entity-commands";
import { createCadVariableAccess } from "../cad/system-variables";
import { CAD_LISP_BUILTINS } from "./cad-builtins";
import { CadDocumentLispHost } from "./document-host";
import type { LispHostServices } from "./host";
import { InteractiveLispRun } from "./interactive";
import { printLisp } from "./printer";
import { LispSession } from "./session";
import type { LispValue } from "./values";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const LAYERS: CadLayerDef[] = [
  { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
  { id: "MUROS", name: "MUROS", color: "#ff0000", visible: true, locked: false },
];

function seed(entities: CadEntity[] = []): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: LAYERS,
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
  };
}

interface Bench {
  /** Evalúa una expresión y devuelve lo impreso, o el mensaje del fallo. */
  ev(source: string): { ok: boolean; text: string };
  host: CadDocumentLispHost;
}

/**
 * Una sesión viva. A diferencia del ayudante de `interaction.spec.ts`, aquí la
 * sesión SOBREVIVE entre expresiones: lo que se prueba es justamente que lo
 * escrito por una llamada lo lea la siguiente.
 */
function bench(options: { document?: CadDocument; variables?: CadDocumentLispHost["variables"] } = {}): Bench {
  let serial = 0;
  const host = new CadDocumentLispHost(options.document ?? seed(), {
    activeLayer: "0",
    newEntityId: () => `e${(serial += 1)}`,
    ...(options.variables ? { variables: options.variables() } : {}),
  });
  const session = new LispSession({ builtins: CAD_LISP_BUILTINS, host });
  return {
    host,
    ev(source: string) {
      const result = session.run(source);
      return { ok: result.ok, text: result.ok ? printLisp(result.value) : result.failure.message };
    },
  };
}

// ===========================================================================
// 1. El prólogo y el epílogo de despacho: la rutina llega al final Y dibuja
// ===========================================================================
{
  const b = bench();
  const routine = `
    (defun c:MARCO (/ eco osm)
      (setq eco (getvar "CMDECHO"))
      (setq osm (getvar "OSMODE"))
      (setvar "CMDECHO" 0)
      (setvar "OSMODE" 0)
      (command "LINE" (list 0 0) (list 100 0) (list 100 50) (list 0 50) "C")
      (setvar "OSMODE" osm)
      (setvar "CMDECHO" eco)
      (princ "marco listo")
      (princ)
    )`;
  ok(b.ev(routine).ok, "la rutina se define");

  // El estado de partida es el de la tabla, no un valor inventado: CMDECHO
  // nace en 1 y OSMODE en 0, igual que un dibujo recién abierto.
  eq(b.ev('(getvar "CMDECHO")').text, "1", "CMDECHO parte del valor de fábrica de la tabla");

  // Se enciende OSMODE ANTES, como lo tendría el dibujante: así el epílogo
  // tiene algo real que restaurar y no restaura el mismo cero de siempre.
  ok(b.ev('(setvar "OSMODE" 37)').ok, "el dibujante tenía referencias a objeto puestas");

  const outcome = b.ev("(c:MARCO)");
  ok(outcome.ok, `la rutina con prólogo y epílogo debe llegar al final: ${outcome.text}`);

  const entities = b.host.document().entities;
  eq(entities.length, 4, "y deja geometría: el rectángulo son cuatro segmentos");
  ok(
    entities.every((entity) => entity.type === "line"),
    "cuatro LINE canónicas, por la ruta de mutación de siempre",
  );
  eq(b.host.appliedLabels.length, 1, "un solo lote: un solo paso de deshacer");

  // El epílogo devolvió las dos variables a su sitio. Sin esto la rutina
  // «funcionaría» dejando el dibujo configurado a su gusto.
  eq(b.ev('(getvar "OSMODE")').text, "37", "el epílogo restauró OSMODE al valor del dibujante");
  eq(b.ev('(getvar "CMDECHO")').text, "1", "y CMDECHO al suyo");
}

// ===========================================================================
// 2. Lo que `setvar` escribe es lo que `getvar` lee
// ===========================================================================
{
  const b = bench();
  eq(b.ev('(setvar "CMDECHO" 0)').text, "0", "setvar devuelve el valor escrito, como AutoLISP");
  eq(b.ev('(getvar "CMDECHO")').text, "0", "y getvar lee lo escrito, no el valor de fábrica");
  eq(b.host.variables().get("CMDECHO"), 0, "la escritura está en la TABLA del producto");

  // Los tipos son los de la tabla: entera, real y cadena. Una rutina que
  // compara con `(= x 0)` o que concatena con `strcat` depende de esto.
  eq(b.ev('(type (getvar "OSMODE"))').text, "INT", "una variable entera vuelve como entero");
  eq(b.ev('(type (getvar "LTSCALE"))').text, "REAL", "una real, como real");
  eq(b.ev('(type (getvar "CLAYER"))').text, "STR", "y una de texto, como cadena");

  // Una cadena en una variable numérica se convierte, que es como está escrita
  // mucha rutina vieja; un número en una de texto se rechaza, porque
  // `(setvar "CLAYER" 3)` no es la capa «3», es un descuido.
  eq(b.ev('(setvar "OSMODE" "33")').text, "33", "una cadena numérica se convierte, como en SETVAR");
  const wrongType = b.ev('(setvar "CLAYER" 3)');
  ok(!wrongType.ok, "un número en una variable de texto se rechaza");
  ok(wrongType.text.includes("de texto"), `diciendo por qué: ${wrongType.text}`);
}

// ===========================================================================
// 3. Las tres reglas de la tabla siguen en pie
// ===========================================================================
{
  const b = bench();

  // (a) Sólo lectura: AREA, PERIMETER y los ejes del SCU los publica el
  //     producto; tecleárselos convertiría la última medición en un invento.
  for (const [name, expression] of [
    ["AREA", '(setvar "AREA" 12.5)'],
    ["PERIMETER", '(setvar "PERIMETER" 4)'],
    ["UCSXDIRX", '(setvar "UCSXDIRX" 0.5)'],
  ] as const) {
    const outcome = b.ev(expression);
    ok(!outcome.ok, `${name} es de sólo lectura y rechaza la escritura`);
    ok(outcome.text.includes("sólo lectura"), `${name} dice el motivo: ${outcome.text}`);
  }
  // Y se pueden LEER, que es la otra mitad de «sólo lectura».
  eq(b.ev('(getvar "AREA")').text, "0.0", "una de sólo lectura sí se lee");

  // (b) `coerceCadSystemVariable` valida enumerado y rango, con su razón.
  const enumerated = b.ev('(setvar "LUNITS" 9)');
  ok(!enumerated.ok, "un valor fuera del enumerado se rechaza");
  ok(enumerated.text.includes("1, 2, 3, 4, 5"), `diciendo qué admite: ${enumerated.text}`);
  const ranged = b.ev('(setvar "LUPREC" 99)');
  ok(!ranged.ok, "un valor fuera de rango se rechaza");
  ok(ranged.text.includes("no pasa de 8"), `diciendo el tope: ${ranged.text}`);
  eq(b.ev('(getvar "LUNITS")').text, "2", "y el rechazo no dejó nada escrito a medias");

  // (c) Lo que no está en la tabla no existe, se lea o se escriba.
  const readUnknown = b.ev('(getvar "PELLIPSE")');
  ok(!readUnknown.ok, "leer una variable que no está en la tabla lanza");
  ok(readUnknown.text.includes("no existe en este producto"), `con su mensaje: ${readUnknown.text}`);
  const writeUnknown = b.ev('(setvar "PELLIPSE" 1)');
  ok(!writeUnknown.ok, "escribirla también");
  ok(
    writeUnknown.text.includes("no existe en este producto"),
    `y con el MISMO mensaje, para no buscar dos defectos donde hay uno: ${writeUnknown.text}`,
  );
}

// ===========================================================================
// 4. `command` deja de ser un «éxito sin efecto»
// ===========================================================================
{
  const b = bench();

  // El caso del enunciado: SETVAR por `command` tiene efecto observable en la
  // tabla, y lo ve `getvar` en la línea siguiente.
  ok(b.ev('(command "SETVAR" "OSMODE" 33)').ok, "(command \"SETVAR\" …) no falla");
  eq(b.host.variables().get("OSMODE"), 33, "y escribió 33 en la tabla del producto");
  eq(b.ev('(getvar "OSMODE")').text, "33", "la rutina lo ve con getvar");

  // Los otros cuatro que terminaban en nil: LTSCALE, COLOR, LWEIGHT y UNITS.
  ok(b.ev('(command "LTSCALE" 2.5)').ok, "LTSCALE por command");
  eq(b.host.variables().get("LTSCALE"), 2.5, "escribe la escala global de tipo de línea");

  ok(b.ev('(command "COLOR" "1")').ok, "COLOR por command");
  eq(b.host.variables().get("CECOLOR"), "1", "escribe el color de los objetos nuevos");

  ok(b.ev('(command "LWEIGHT" 0.3)').ok, "LWEIGHT por command");
  eq(b.host.variables().get("CELWEIGHT"), 30, "escribe el grosor en centésimas, como DXF 370");

  ok(b.ev('(command "UNITS" "A" 4 "G" 0 0)').ok, "UNITS por command, sin abrir cuadro");
  eq(b.host.variables().get("LUNITS"), 4, "deja el dibujo en arquitectónico");
  eq(b.host.variables().get("LUPREC"), 4, "con precisión 1/16");
  eq(b.ev('(getvar "LUNITS")').text, "4", "y la rutina lo lee de la misma tabla");

  // Una consulta PUBLICA su resultado en una variable de sólo lectura: es la
  // escritura del sistema, la única que puede tocarlas.
  ok(b.ev('(command "DIST" (list 0 0) (list 30 40))').ok, "DIST por command");
  eq(b.host.variables().get("DISTANCE"), 50, "publica DISTANCE, que es de sólo lectura");
  eq(b.ev('(getvar "DISTANCE")').text, "50.0", "y la rutina la lee: 3-4-5");
}

// ===========================================================================
// 5. `CLAYER` es la capa de verdad, no una casilla que se escribe y no hace nada
// ===========================================================================
{
  const b = bench();
  eq(b.ev('(getvar "CLAYER")').text, '"0"', "CLAYER parte de la capa activa del anfitrión");
  ok(b.ev('(setvar "CLAYER" "MUROS")').ok, "se puede cambiar la capa activa desde la rutina");
  ok(b.ev('(command "LINE" (list 0 0) (list 10 0) "")').ok, "y dibujar después");
  const line = b.host.document().entities[0];
  eq(line?.layer, "MUROS", "la entidad nueva nace en MUROS: la escritura tuvo efecto de verdad");
  eq(b.host.activeLayer(), "MUROS", "el anfitrión y la tabla dicen lo mismo, no hay dos verdades");
}

// ===========================================================================
// 6. La tabla se PRESTA: la del editor, no una recién fabricada
// ===========================================================================
{
  // Esto es lo que impide la peor versión del arreglo: una tabla propia del
  // intérprete que no ve lo que el dibujante configuró ni él lo que la rutina
  // escribe. Se presta un almacén, se comprueba que la rutina lee lo que ya
  // traía y que lo que escribe queda EN ESE almacén.
  const editor = createCadVariableAccess({ OSMODE: 39, TEXTSIZE: 5 });
  const b = bench({ variables: () => editor });
  eq(b.ev('(getvar "OSMODE")').text, "39", "la rutina lee lo que el dibujante tenía puesto");
  eq(b.ev('(getvar "TEXTSIZE")').text, "5.0", "y su altura de texto");
  ok(b.ev('(setvar "TEXTSIZE" 2.5)').ok, "la rutina la cambia");
  eq(editor.get("TEXTSIZE"), 2.5, "y el cambio está en la tabla DEL EDITOR, no en una copia");

  // Y por la puerta REANUDABLE, que es la que usa el editor: el préstamo llega
  // hasta el anfitrión sin que el llamador monte el `CadDocumentLispHost` a
  // mano. Es la línea que la petición P-ext-01 tiene que escribir en
  // `lisp-runtime.ts`, ya lista por este lado.
  const prestada = createCadVariableAccess({ OSMODE: 128 });
  const conducida = new InteractiveLispRun({
    document: seed(),
    activeLayer: "0",
    newEntityId: () => "e1",
    variables: prestada,
  });
  const turno = conducida.start('(setvar "OSMODE" (+ (getvar "OSMODE") 1))');
  ok(turno.kind === "done", "la ejecución reanudable termina");
  eq(prestada.get("OSMODE"), 129, "y escribió en la tabla prestada, no en una suya");
}

// ===========================================================================
// 7. La capacidad es OPCIONAL: un anfitrión que no la ofrece sigue funcionando
// ===========================================================================
{
  /**
   * Un anfitrión mínimo, escrito como lo escribiría alguien de fuera de este
   * subsistema: implementa el puerto SIN `variables()`. Que esta spec compile
   * es media prueba; la otra media es que el comportamiento sea el de antes y
   * que lo que no puede hacer lo diga.
   */
  const document = seed();
  const bare: LispHostServices = {
    document: () => document,
    entityIds: () => [],
    entity: () => undefined,
    layers: () => LAYERS,
    activeLayer: () => "MUROS",
    newEntityId: () => "x1",
    apply: (_commands: readonly CadEntityCommand[]) => {},
  };
  const session = new LispSession({ builtins: CAD_LISP_BUILTINS, host: bare });
  const ev = (source: string): { ok: boolean; text: string } => {
    const result = session.run(source);
    return { ok: result.ok, text: result.ok ? printLisp(result.value as LispValue) : result.failure.message };
  };

  eq(ev('(getvar "CLAYER")').text, '"MUROS"', "sin tabla, CLAYER sigue saliendo del anfitrión");
  eq(ev('(getvar "INSUNITS")').text, "4", "y INSUNITS de la unidad del documento");
  const unavailable = ev('(getvar "CMDECHO")');
  ok(!unavailable.ok, "las demás siguen sin inventarse");
  const write = ev('(setvar "CMDECHO" 0)');
  ok(!write.ok, "y setvar se niega");
  ok(
    write.text.includes("no expone la tabla"),
    `declarando el límite en vez de aceptar y no aplicar: ${write.text}`,
  );
}

console.log(
  `sysvars: ${checks} aserciones verdes (el prólogo/epílogo de despacho corre entero y dibuja, ` +
    `getvar/setvar hablan con CAD_SYSTEM_VARIABLES con sus tres reglas, command aplica el efecto ` +
    `«variables», CLAYER manda de verdad y la tabla del editor se presta).`,
);
