/**
 * DCL y la API de plugins.
 *
 * Las dos comparten una propiedad que es la que interesa demostrar: código de
 * un tercero, por la puerta que sea, acaba en la MISMA ruta de mutación y bajo
 * el MISMO sandbox. Un plugin en JavaScript no puede hacer nada que una rutina
 * `.lsp` no pueda, y viceversa.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad/cad-document";
import {
  CAD_ACCEPT_POINT,
  CAD_COMMAND_REGISTRY_V2,
  asCadCommand,
  type CadCommandDescriptor,
} from "../cad/engine";
import { CAD_LISP_BUILTINS } from "./cad-builtins";
import { parseDcl, tileKeys, unsupportedTiles } from "./dcl/parser";
import { CadDocumentLispHost } from "./document-host";
import { COMMAND_REGISTRY } from "./builtins/interaction";
import { CadPluginRegistry, createPluginDocumentApi } from "./plugins/api";
import { printLisp } from "./printer";
import { LispSession, type LispResponder } from "./session";
import { cons, str, list, NIL, type LispRequest, type LispResponse } from "./values";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const DCL = `
// Cajetín: pedir los cuatro datos de siempre.
pedir_cajetin : dialog {
  label = "Cajetín";
  : edit_box { key = "ancho"; label = "Ancho:"; edit_width = 8; value = "180"; }
  : toggle   { key = "marco"; label = "Con marco"; value = "1"; }
  : radio_column {
    key = "escala";
    : radio_button { key = "e50";  label = "1:50";  value = "1"; }
    : radio_button { key = "e100"; label = "1:100"; }
  }
  : list_box { key = "plantas"; label = "Planta:"; }
  : row {
    : button { key = "accept"; label = "Aceptar"; is_default = true; }
    : button { key = "cancel"; label = "Cancelar"; is_cancel = true; }
  }
}
`;

// --- el analizador de DCL ---------------------------------------------------------
{
  const dialogs = parseDcl(DCL);
  eq(dialogs.length, 1, "un diálogo");
  eq(dialogs[0].name, "pedir_cajetin", "con su nombre");
  eq(dialogs[0].tile.attributes.label, "Cajetín", "y su etiqueta, con acento incluido");
  eq(
    tileKeys(dialogs[0].tile),
    ["ancho", "marco", "escala", "e50", "e100", "plantas", "accept", "cancel"],
    "todas las claves, en orden de aparición y entrando en las sublistas",
  );
  eq(unsupportedTiles(dialogs[0].tile), [], "todos los controles se saben pintar");

  // Los atributos se conservan TODOS, también los que este producto no pinta:
  // así la interfaz puede mejorar sin tocar el intérprete.
  const box = dialogs[0].tile.children[0];
  eq(box.attributes.edit_width, "8", "un atributo que no se usa todavía se conserva igual");
  // Y todo llega como CADENA, que es como lo trata DCL.
  eq(typeof dialogs[0].tile.children[4].children[0].attributes.is_default, "string",
    "`true` llega como cadena, no como booleano: get_tile devuelve texto siempre");

  // Comentarios de los dos tipos.
  eq(parseDcl("/* bloque */ d : dialog { /* otro */ label = \"x\"; } // final").length, 1,
    "los comentarios de C no estorban");

  // Un control exótico se LEE bien y se REPORTA como no pintable: son dos
  // problemas distintos y merecen mensajes distintos.
  const exotic = parseDcl('d : dialog { : image_button { key = "i"; } }');
  eq(unsupportedTiles(exotic[0].tile), ["image_button"], "el control exótico se identifica por nombre");

  for (const [source, what] of [
    ["d : dialog { label = ", "atributo sin valor"],
    ["d : dialog {", "llave sin cerrar"],
    ['d : dialog { label = "sin cerrar; }', "cadena sin cerrar"],
    ["d : columna { }", "declaración de nivel superior que no es dialog"],
    ["", "fichero vacío"],
  ] as const) {
    assert.throws(() => parseDcl(source), /DCL|diálogo/, `${what} debe rechazarse`);
    checks += 1;
  }
}

// --- el diálogo, de principio a fin, desde LISP ------------------------------------
{
  /** Anfitrión de prueba: rellena el diálogo y pulsa Aceptar. */
  class DialogResponder implements LispResponder {
    readonly seen: LispRequest[] = [];
    constructor(private readonly answers: Readonly<Record<string, string>>, private readonly action: string) {}
    respond(request: LispRequest): LispResponse {
      this.seen.push(request);
      if (request.kind !== "dialog") return { kind: "value", value: NIL };
      const pairs = Object.entries({ ...request.values, ...this.answers }).map(([key, value]) =>
        cons(str(key), str(value)));
      return { kind: "value", value: list([cons(str("$action"), str(this.action)), ...pairs]) };
    }
  }

  const routine = `
    (defun pedir ( / dcl ancho marco resultado)
      (setq dcl (load_dialog ${JSON.stringify(DCL)}))
      (if (new_dialog "pedir_cajetin" dcl)
        (progn
          (action_tile "accept" "(setq ancho (atof (get_tile \\"ancho\\")) marco (get_tile \\"marco\\"))")
          (setq resultado (start_dialog))
          (unload_dialog dcl)
          (list resultado ancho marco))
        "el diálogo no existe"))
    (pedir)`;

  const accepted = new DialogResponder({ ancho: "250", marco: "0" }, "accept");
  const session = new LispSession({ builtins: CAD_LISP_BUILTINS });
  const result = session.run(routine, accepted);
  ok(result.ok, `el diálogo debería completarse: ${result.ok ? "" : result.failure.message}`);
  eq(printLisp(result.ok ? result.value : NIL), '(1 250.0 "0")',
    "Aceptar devuelve 1, y el action_tile leyó lo que el usuario escribió");

  // El anfitrión recibió el ÁRBOL, no una referencia: puede pintarlo sin
  // conocer el subsistema.
  const request = accepted.seen.find((entry) => entry.kind === "dialog");
  ok(request?.kind === "dialog" && request.tile.children.length === 5,
    "la petición transporta el árbol completo del diálogo");
  eq(request?.kind === "dialog" ? request.values.ancho : "", "180",
    "y los valores iniciales que declaró el DCL");

  // Cancelar cierra con 0 sin ejecutar el action_tile de Aceptar.
  const cancelled = new LispSession({ builtins: CAD_LISP_BUILTINS });
  const cancelledResult = cancelled.run(routine, new DialogResponder({ ancho: "999" }, "cancel"));
  eq(printLisp(cancelledResult.ok ? cancelledResult.value : NIL), "(0 nil nil)",
    "Cancelar devuelve 0 y no dispara la acción de Aceptar");

  // Un `action_tile` sobre una clave que no existe es un fallo MUDO en AutoCAD:
  // aquí se rechaza al declararlo.
  const typo = new LispSession({ builtins: CAD_LISP_BUILTINS });
  const typoResult = typo.run(
    `(progn (setq dcl (load_dialog ${JSON.stringify(DCL)})) (new_dialog "pedir_cajetin" dcl) (action_tile "anchp" "(princ)"))`,
  );
  ok(!typoResult.ok, "una acción sobre una clave inexistente se rechaza");
  ok(!typoResult.ok && typoResult.failure.message.includes("fallo mudo"), "diciendo por qué");

  // Y una expresión de acción con sintaxis rota se rechaza al declararla, no
  // cuando salte: si no, el síntoma sería «el diálogo no hace nada».
  const broken = new LispSession({ builtins: CAD_LISP_BUILTINS });
  const brokenResult = broken.run(
    `(progn (setq dcl (load_dialog ${JSON.stringify(DCL)})) (new_dialog "pedir_cajetin" dcl) (action_tile "accept" "(setq x "))`,
  );
  ok(!brokenResult.ok, "un action_tile con paréntesis sin cerrar se rechaza al declararlo");

  // Un diálogo que no está en el fichero devuelve nil, como el original.
  const missing = new LispSession({ builtins: CAD_LISP_BUILTINS });
  eq(missing.evaluateToText(`(new_dialog "otro" (load_dialog ${JSON.stringify(DCL)}))`), "nil",
    "new_dialog de un diálogo que no está devuelve nil");
}

// --- el registro de plugins --------------------------------------------------------
{
  function stubCommand(name: string, aliases: string[] = []): CadCommandDescriptor<null> {
    return {
      name,
      aliases,
      kind: "draw",
      transparent: false,
      selection: "none",
      repeatable: true,
      mutates: true,
      begin: (context) => ({
        state: null,
        prompt: { message: "Precise un punto", options: [] },
        accepts: CAD_ACCEPT_POINT,
        result: undefined,
        ...(context ? {} : {}),
      }),
      step: (state, input, context) =>
        input.kind === "point"
          ? {
              state,
              prompt: { message: "", options: [] },
              accepts: 0,
              result: {
                kind: "document",
                commands: [
                  {
                    type: "insert",
                    entity: {
                      id: context.newEntityId(),
                      type: "circle",
                      center: { x: input.point.x, y: input.point.y, z: 0 },
                      radius: 42,
                      layer: context.activeLayer,
                    },
                  },
                ],
                label: name,
              },
            }
          : { state, prompt: { message: "Precise un punto", options: [] }, accepts: CAD_ACCEPT_POINT },
    };
  }

  const registry = new CadPluginRegistry();
  eq(
    registry.register({
      id: "acme-tools",
      name: "ACME Tools",
      version: "1.0.0",
      commands: [asCadCommand(stubCommand("HITO", ["HT"]))],
      panels: [{ id: "acme-panel", title: "ACME", placement: "right", component: "AcmePanel" }],
    }),
    [],
    "un plugin correcto entra sin problemas",
  );

  // El registro del producto NO se ha tocado. Es la regla de `engine/index.ts`:
  // un registro que cambia según qué se importó antes convierte el
  // comportamiento del producto en una función del orden de los imports.
  eq(CAD_COMMAND_REGISTRY_V2.get("HITO"), undefined,
    "el registro del producto sigue sin conocer el comando del plugin");
  const composed = registry.composed();
  eq(composed.get("HITO")?.name, "HITO", "pero el registro COMPUESTO sí lo encuentra");
  eq(composed.get("ht")?.name, "HITO", "por su alias, sin distinguir mayúsculas");
  eq(composed.get("-HITO")?.name, "HITO", "y por la variante con guion de AutoCAD");
  eq(composed.get("LINE")?.name, "LINE", "y sigue encontrando los del producto");
  eq(registry.ownerOf("HITO"), "acme-tools", "y se sabe qué plugin lo trajo");
  eq(registry.panels().length, 1, "el panel queda declarado");

  // Pisar un comando del producto se RECHAZA al registrar.
  const collision = new CadPluginRegistry();
  const problems = collision.register({
    id: "malo",
    name: "Malo",
    version: "1",
    commands: [asCadCommand(stubCommand("LINE"))],
  });
  eq(problems.length, 1, "registrar LINE da un problema");
  ok(problems[0].problem.includes("ya existe en el producto"), "diciendo exactamente eso");
  eq(collision.list().length, 0, "y el plugin NO entra");

  // Un alias que choca con el producto también.
  const aliasClash = new CadPluginRegistry();
  ok(aliasClash.register({ id: "otro", name: "O", version: "1", commands: [asCadCommand(stubCommand("MICMD", ["L"]))] }).length > 0,
    "un alias que choca con el del producto también se rechaza");

  // Dos plugins con el mismo comando: gana quien llegó primero, y el segundo lo
  // sabe en vez de quedarse sin saltar.
  const second = registry.register({ id: "otra-casa", name: "Otra", version: "1", commands: [asCadCommand(stubCommand("HITO"))] });
  eq(second.length, 1, "el segundo plugin con el mismo comando se rechaza");
  ok(second[0].problem.includes("acme-tools"), "nombrando a quién lo tenía");

  // Un plugin no entra A MEDIAS: tres comandos con uno malo no registra ninguno.
  const partial = new CadPluginRegistry();
  partial.register({
    id: "medias",
    name: "Medias",
    version: "1",
    commands: [asCadCommand(stubCommand("BUENO1")), asCadCommand(stubCommand("LINE")), asCadCommand(stubCommand("BUENO2"))],
  });
  eq(partial.composed().get("BUENO1"), undefined, "ningún comando del plugin rechazado queda suelto");

  // Identificadores y nombres inadmisibles.
  const naming = new CadPluginRegistry();
  ok(naming.register({ id: "MAYÚSCULAS", name: "x", version: "1" }).length > 0, "el id se valida");
  ok(naming.register({ id: "minusculas", name: "x", version: "1", commands: [asCadCommand(stubCommand("minusculas"))] }).length > 0,
    "el nombre de comando se valida");

  // Y quitar el plugin lo quita entero.
  ok(registry.unregister("acme-tools"), "se puede dar de baja");
  eq(registry.composed().get("HITO"), undefined, "y su comando desaparece del compuesto");
  eq(registry.unregister("acme-tools"), false, "dar de baja dos veces no miente");
}

// --- un comando de plugin se invoca desde LISP como cualquier otro -----------------------
{
  function markerCommand(): CadCommandDescriptor<null> {
    return {
      name: "HITO",
      aliases: ["HT"],
      kind: "draw",
      transparent: false,
      selection: "none",
      repeatable: true,
      mutates: true,
      begin: () => ({ state: null, prompt: { message: "Precise el hito", options: [] }, accepts: CAD_ACCEPT_POINT }),
      step: (state, input, context) =>
        input.kind === "point"
          ? {
              state,
              prompt: { message: "", options: [] },
              accepts: 0,
              result: {
                kind: "document",
                commands: [
                  {
                    type: "insert",
                    entity: {
                      id: context.newEntityId(),
                      type: "circle",
                      center: { x: input.point.x, y: input.point.y, z: 0 },
                      radius: 42,
                      layer: context.activeLayer,
                    },
                  },
                ],
                label: "HITO",
              },
            }
          : { state, prompt: { message: "Precise el hito", options: [] }, accepts: CAD_ACCEPT_POINT },
    };
  }

  const document: CadDocument = {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#fff", visible: true, locked: false }],
    entities: [], history: [], modelSpace: { entityIds: [] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [],
    lossManifest: [], publications: [],
  };
  const plugins = new CadPluginRegistry();
  plugins.register({ id: "acme-tools", name: "ACME", version: "1", commands: [asCadCommand(markerCommand())] });

  let serial = 0;
  const host = new CadDocumentLispHost(document, {
    activeLayer: "0",
    newEntityId: () => {
      serial += 1;
      return `p${serial}`;
    },
  });
  const session = new LispSession({
    builtins: CAD_LISP_BUILTINS,
    host,
    state: [[COMMAND_REGISTRY, plugins.composed()]],
  });
  const result = session.run('(command "HITO" (list 300 400))');
  ok(result.ok, `el comando del plugin debería invocarse desde LISP: ${result.ok ? "" : result.failure.message}`);
  const created = host.document().entities[0];
  eq(created?.type === "circle" && created.radius, 42, "y dibujar lo suyo");
  eq(created?.type === "circle" && created.center.x, 300, "en el punto que dio la rutina");
  // Y por la ruta canónica: el lote está acumulado para UN paso de deshacer.
  eq(host.pendingCommands.length, 1, "por la misma ruta de mutación que todo lo demás");

  // Sin el registro compuesto inyectado, el mismo comando NO existe: la
  // composición es explícita, no un efecto global.
  const isolated = new LispSession({ builtins: CAD_LISP_BUILTINS, host });
  ok(!isolated.run('(command "HITO" (list 0 0))').ok,
    "sin inyectar el registro compuesto, el comando del plugin no existe");
}

// --- la API de documento de un plugin sale por el MISMO puerto ---------------------------
{
  const document: CadDocument = {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#fff", visible: true, locked: false }],
    entities: [], history: [], modelSpace: { entityIds: [] }, paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [],
    lossManifest: [], publications: [],
  };
  const host = new CadDocumentLispHost(document, { newEntityId: () => "plugin-1" });
  const api = createPluginDocumentApi(host, "acme-tools");

  const entity: CadEntity = {
    id: api.newEntityId(),
    type: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 10, y: 0, z: 0 },
    layer: api.activeLayer(),
  };
  api.apply([{ type: "insert", entity: entity as never }], "crear hito");

  eq(api.entities().length, 1, "el plugin creó su entidad");
  eq(host.pendingCommands.length, 1, "por el mismo puerto que el LISP");
  ok(host.appliedLabels[0].startsWith("plugin:acme-tools"),
    `la etiqueta del historial dice quién lo hizo: ${host.appliedLabels[0]}`);

  // Lo que la API NO tiene es tan importante como lo que tiene.
  for (const forbidden of ["commitChange", "document", "history", "save"])
    eq(forbidden in api, false, `la API de plugin no expone ${forbidden}`);
}

console.log(`dcl-and-plugins: ${checks} aserciones verdes (DCL analizado con sus atributos íntegros, diálogo de ida y vuelta con action_tile, registro de plugins compuesto SIN mutar el del producto, y la API de plugin saliendo por el mismo puerto de escritura).`);
